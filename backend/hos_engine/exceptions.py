"""Eligibility for the short-haul and 16-hour exceptions.

The engine can only *plan* under an exception's relaxed rules; whether
the plan actually qualifies is judged here on the finished segment list,
exactly as an auditor would judge a finished day: did the driver stay
inside 150 air-miles of the work reporting location, come back to it,
and get released within the allowed window? A day that fails any test
must be logged on a full record of duty status under §395.3 instead, so
the view re-plans with standard rules and reports why.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Sequence

from . import constants as c
from .geometry import _haversine_miles
from .rules import SHORT_HAUL_CDL, SHORT_HAUL_NON_CDL, STANDARD, HosRules
from .types import DRIVING, OFF_DUTY, ON_DUTY_NOT_DRIVING, SLEEPER_BERTH, Segment


def air_miles(p1: Sequence[float], p2: Sequence[float]) -> float:
    """Great-circle distance in air (nautical) miles — the unit §395.1(e)
    uses. 150 air-miles = 172.6 statute miles."""
    return _haversine_miles(list(p1), list(p2)) / c.STATUTE_MILES_PER_AIR_MILE


def max_air_miles_from(base: Sequence[float], polylines: Sequence[Sequence[Sequence[float]]]) -> float:
    """The farthest any point of the route strays from the work reporting
    location. Route vertices are dense enough that checking them is the
    same as checking the road."""
    farthest = 0.0
    for line in polylines:
        for point in line:
            farthest = max(farthest, air_miles(base, point))
    return farthest


@dataclass
class DutyPeriod:
    report: datetime
    release: datetime
    on_duty_hours: float
    driving_hours: float
    # Hours of this period that elapsed before the trip started (the
    # dispatcher's "already on shift today" input) — only ever non-zero
    # for the first period.
    window_offset_hours: float = 0.0
    segments: List[Segment] = field(default_factory=list)

    @property
    def window_hours(self) -> float:
        return (self.release - self.report).total_seconds() / 3600.0 + self.window_offset_hours

    @property
    def last_driving_hour(self) -> float:
        """Hours after reporting at which the last driving ended — what
        §395.3(a)(2) and §395.1(e)(2) actually constrain. On-duty work
        after it (a dropoff, the check-in) is allowed past the window."""
        drives = [s for s in self.segments if s.status == DRIVING]
        if not drives:
            return 0.0
        return (drives[-1].end_datetime - self.report).total_seconds() / 3600.0 + self.window_offset_hours

    def uses_remark(self, remark: str) -> bool:
        return bool(remark) and any(s.remark == remark for s in self.segments)


def duty_periods(segments: List[Segment], window_offset_hours: float = 0.0) -> List[DutyPeriod]:
    """Splits the trip at every rest of 10 consecutive hours or more. A
    duty period runs from the first on-duty minute to the last."""
    periods: List[DutyPeriod] = []
    current: List[Segment] = []
    off_run = 0.0
    for seg in segments:
        if seg.status in (OFF_DUTY, SLEEPER_BERTH):
            off_run += seg.duration_hours
            if off_run >= c.MIN_OFF_DUTY_RESET_HOURS - c.HOURS_EPSILON and current:
                periods.append(_period(current))
                current = []
            continue
        off_run = 0.0
        current.append(seg)
    if current:
        periods.append(_period(current))
    if periods:
        periods[0].window_offset_hours = window_offset_hours
    return periods


def _period(segs: List[Segment]) -> DutyPeriod:
    return DutyPeriod(
        report=segs[0].start_datetime,
        release=segs[-1].end_datetime,
        on_duty_hours=sum(s.duration_hours for s in segs if s.status in (DRIVING, ON_DUTY_NOT_DRIVING)),
        driving_hours=sum(s.duration_hours for s in segs if s.status == DRIVING),
        segments=list(segs),
    )


@dataclass
class ExceptionEvaluation:
    mode: str
    applied: bool
    reasons: List[str] = field(default_factory=list)
    farthest_air_miles: float = 0.0
    periods: List[DutyPeriod] = field(default_factory=list)
    # Which duty period, if any, used the extended window (16-hour /
    # non-CDL second tier).
    extended_period_index: Optional[int] = None


def evaluate_short_haul(
    segments: List[Segment],
    rules: HosRules,
    farthest_air_miles: float,
    returns_to_reporting_location: bool,
    window_offset_hours: float = 0.0,
) -> ExceptionEvaluation:
    """Judges a plan made under §395.1(e)(1) or (e)(2)."""
    ev = ExceptionEvaluation(mode=rules.mode, applied=True, farthest_air_miles=farthest_air_miles)
    ev.periods = duty_periods(segments, window_offset_hours)

    if farthest_air_miles > c.SHORT_HAUL_RADIUS_AIR_MILES + 1e-6:
        over = farthest_air_miles - c.SHORT_HAUL_RADIUS_AIR_MILES
        ev.reasons.append(f"route reaches {farthest_air_miles:.0f} air-miles from the work reporting location, {over:.0f} past the 150 air-mile radius")
    if not returns_to_reporting_location:
        ev.reasons.append("the driver does not return to the work reporting location")
    if len(ev.periods) > 1:
        ev.reasons.append(f"the trip needs {len(ev.periods)} duty periods; short-haul requires release at the reporting location within one")
    for i, p in enumerate(ev.periods):
        limit = rules.window_hours
        # The engine stamps the driving segment that crossed the ordinary
        # window with the rule it relied on; that is the authoritative
        # record of an extension having been used.
        if p.uses_remark(rules.extended_window_remark):
            ev.extended_period_index = i
            limit = rules.extended_window_hours
        if rules.mode == SHORT_HAUL_CDL:
            # §395.1(e)(1): "released from work within 14 consecutive hours".
            if p.window_hours > limit + c.HOURS_EPSILON:
                ev.reasons.append(f"released {p.window_hours:.1f} h after reporting for duty; the limit is {limit:.0f} h")
        else:
            # §395.1(e)(2): "must not drive past the 14th (or 16th) hour".
            if p.last_driving_hour > limit + c.HOURS_EPSILON:
                ev.reasons.append(f"drove until {p.last_driving_hour:.1f} h after reporting for duty; the limit is {limit:.0f} h")
    ev.applied = not ev.reasons
    return ev


def evaluate_16_hour(
    segments: List[Segment], rules: HosRules, returns_to_reporting_location: bool, window_offset_hours: float = 0.0
) -> ExceptionEvaluation:
    """§395.1(o) is an annotation, not an alternative record: the plan is
    always a RODS. This only reports whether the extension was actually
    used and whether its own conditions held."""
    ev = ExceptionEvaluation(mode=STANDARD, applied=False)
    ev.periods = duty_periods(segments, window_offset_hours)
    for i, p in enumerate(ev.periods):
        if p.uses_remark(rules.extended_window_remark):
            ev.extended_period_index = i
            ev.applied = True
            break
    if ev.applied and not returns_to_reporting_location:
        ev.reasons.append("the 16-hour exception requires returning to the work reporting location that day")
        ev.applied = False
    return ev


def annotate_logs(logs: List[Dict], ev: Optional[ExceptionEvaluation], rules: HosRules) -> List[Dict]:
    """Adds the exception's paperwork to each day's log dict: a short-haul
    time record (report time, on-duty hours, release time) in place of a
    RODS when the exception applied, and plain-language notes otherwise."""
    for log in logs:
        log.setdefault("record_type", "rods")
        log.setdefault("time_record", None)
        log.setdefault("exception_notes", [])
    if ev is None:
        return logs
    by_date: Dict[str, DutyPeriod] = {}
    for p in ev.periods:
        by_date.setdefault(p.report.date().isoformat(), p)
    for log in logs:
        p = by_date.get(log["date"])
        if ev.mode in (SHORT_HAUL_CDL, SHORT_HAUL_NON_CDL) and ev.applied and p is not None:
            log["record_type"] = "time_record"
            log["time_record"] = {
                "report_time": p.report.strftime("%H:%M"),
                "release_time": p.release.strftime("%H:%M") if p.release.date() == p.report.date() else p.release.strftime("%m-%d %H:%M"),
                "on_duty_hours": round(p.on_duty_hours, 2),
                "window_hours": round(p.window_hours, 2),
                "farthest_air_miles": round(ev.farthest_air_miles, 1),
            }
            name = "CDL short-haul exception" if ev.mode == SHORT_HAUL_CDL else "non-CDL short-haul exception"
            log["exception_notes"].append(f"Operated under the {name}: time record in place of a RODS; 30-minute break not required.")
        if ev.extended_period_index is not None and p is not None and ev.periods[ev.extended_period_index] is p:
            log["exception_notes"].append(rules.extended_window_remark or "Extended driving window used.")
    return logs
