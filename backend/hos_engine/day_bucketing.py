"""Splits a flat, contiguous Segment list into one FMCSA-format DailyLog
per calendar day.

Timezone anchor: naive wall-clock time in trip-start's local time for the
whole simulation — no per-location conversion. This mirrors how carriers
commonly fix logs to a single reference time (e.g. home-terminal time)
rather than shifting per state line, and it sidesteps DST entirely.
"""

from collections import defaultdict
from datetime import date as _date, datetime, timedelta
from typing import Dict, List, Tuple

from .types import ALL_STATUSES, DRIVING, OFF_DUTY, ON_DUTY_NOT_DRIVING, DailyLog, Segment

_MIDNIGHT = datetime.min.time()


def _split_at_midnights(seg: Segment) -> List[Segment]:
    """Splits a segment into one piece per calendar day it spans, preserving
    exact arithmetic boundaries (so per-day totals sum to precisely 24h).
    Loops rather than branching once, since a 34-hour restart can span more
    than one midnight.
    """
    pieces: List[Segment] = []
    cursor_start = seg.start_datetime
    cursor_odo = seg.odometer_start_miles
    total_seconds = (seg.end_datetime - seg.start_datetime).total_seconds()
    total_miles = seg.odometer_end_miles - seg.odometer_start_miles
    is_first = True

    while cursor_start.date() < seg.end_datetime.date():
        next_midnight = datetime.combine(cursor_start.date() + timedelta(days=1), _MIDNIGHT)
        frac = ((next_midnight - cursor_start).total_seconds() / total_seconds) if total_seconds > 0 else 0.0
        piece_odo_end = cursor_odo + total_miles * frac
        pieces.append(
            Segment(
                status=seg.status,
                start_datetime=cursor_start,
                end_datetime=next_midnight,
                location_label=seg.location_label,
                odometer_start_miles=cursor_odo,
                odometer_end_miles=piece_odo_end,
                remark=seg.remark if is_first else None,
                stop_type=seg.stop_type,
                is_status_change=seg.is_status_change and is_first,
            )
        )
        cursor_start, cursor_odo, is_first = next_midnight, piece_odo_end, False

    if cursor_start < seg.end_datetime:
        pieces.append(
            Segment(
                status=seg.status,
                start_datetime=cursor_start,
                end_datetime=seg.end_datetime,
                location_label=seg.location_label,
                odometer_start_miles=cursor_odo,
                odometer_end_miles=seg.odometer_end_miles,
                remark=seg.remark if is_first else None,
                stop_type=seg.stop_type,
                is_status_change=seg.is_status_change and is_first,
            )
        )
    return pieces


def _fmt_hhmm(dt: datetime, day_end: datetime) -> str:
    if dt >= day_end:
        return "24:00"
    return dt.strftime("%H:%M")


def _compute_rolling_cycle_at_day_end(
    all_pieces: List[Segment], starting_cycle_hours: float, cycle_cap_days: int, restart_hours: float
) -> Dict[_date, Tuple[float, float]]:
    """The true rolling 60/70-hour window value as of the END of each
    calendar day the trip touches — replayed from the final, already-
    simulated piece list using the exact same formula and pre-trip-lump-
    on-one-notional-day convention as the engine's own
    `_SimState.rolling_cycle_hours`/`_DriverClock.rolling_cycle_hours` (see
    engine.py), so the Recap section can never disagree with the engine's
    own restart decisions. Any run of `restart_hours` (34) consecutive
    hours off duty / in the sleeper berth clears the whole rolling history
    the instant it is reached (§395.3(c)) — whether that run is an explicit
    restart stop or a team driver simply resting through a partner's
    stints, which is how a capped co-driver recovers without any stop."""
    if not all_pieces:
        return {}
    pretrip_date = all_pieces[0].start_datetime.date()  # same placement as the engines
    pretrip_hours = starting_cycle_hours
    daily_on_duty_hours: Dict[_date, float] = defaultdict(float)

    def rolling_as_of(day: _date, days: int) -> float:
        window_start = day - timedelta(days=days - 1)
        total = pretrip_hours if pretrip_date >= window_start else 0.0
        total += sum(h for d, h in daily_on_duty_hours.items() if d >= window_start)
        return total

    # Per day: (full N-day window total, the (N-1)-day total). The second
    # is what the paper log's Recap line A asks for — the hours that will
    # still be inside the window TOMORROW, so line B ("available
    # tomorrow") is simply cap minus it.
    result: Dict[_date, Tuple[float, float]] = {}
    off_run_hours = 0.0
    run_already_reset = False
    for piece in all_pieces:
        day = piece.start_datetime.date()
        hours = (piece.end_datetime - piece.start_datetime).total_seconds() / 3600.0
        if piece.status in (DRIVING, ON_DUTY_NOT_DRIVING):
            daily_on_duty_hours[day] += hours
            off_run_hours, run_already_reset = 0.0, False
        else:
            off_run_hours += hours
            if not run_already_reset and off_run_hours >= restart_hours - 1e-6:
                pretrip_hours = 0.0
                daily_on_duty_hours = defaultdict(float)
                run_already_reset = True
        result[day] = (rolling_as_of(day, cycle_cap_days), rolling_as_of(day, max(cycle_cap_days - 1, 1)))
    return result


def build_daily_logs(
    segments: List[Segment],
    starting_cycle_hours: float = 0.0,
    cycle_cap_days: int = 8,
    max_cycle_hours: float = 70.0,
    restart_hours: float = 34.0,
) -> List[DailyLog]:
    if not segments:
        return []

    all_pieces: List[Segment] = []
    for seg in segments:
        all_pieces.extend(_split_at_midnights(seg))

    rolling_cycle_at_day_end = _compute_rolling_cycle_at_day_end(all_pieces, starting_cycle_hours, cycle_cap_days, restart_hours)

    pieces_by_date: dict = {}
    for piece in all_pieces:
        pieces_by_date.setdefault(piece.start_datetime.date(), []).append(piece)

    logs: List[DailyLog] = []
    mileage_to_date = 0.0
    for date_key in sorted(pieces_by_date.keys()):
        pieces = pieces_by_date[date_key]
        day_start = datetime.combine(date_key, _MIDNIGHT)
        day_end = day_start + timedelta(days=1)

        # Partial first/last days are padded with OFF_DUTY: the simulation has
        # no information about the driver before trip-start or after
        # trip-end, and Off Duty is the conservative default that never
        # fabricates HOS-consuming time.
        if pieces[0].start_datetime > day_start:
            pieces.insert(
                0,
                Segment(
                    status=OFF_DUTY,
                    start_datetime=day_start,
                    end_datetime=pieces[0].start_datetime,
                    location_label=pieces[0].location_label,
                    odometer_start_miles=pieces[0].odometer_start_miles,
                    odometer_end_miles=pieces[0].odometer_start_miles,
                ),
            )
        if pieces[-1].end_datetime < day_end:
            pieces.append(
                Segment(
                    status=OFF_DUTY,
                    start_datetime=pieces[-1].end_datetime,
                    end_datetime=day_end,
                    location_label=pieces[-1].location_label,
                    odometer_start_miles=pieces[-1].odometer_end_miles,
                    odometer_end_miles=pieces[-1].odometer_end_miles,
                ),
            )

        totals_seconds = {status: 0.0 for status in ALL_STATUSES}
        for p in pieces:
            totals_seconds[p.status] += (p.end_datetime - p.start_datetime).total_seconds()
        totals_hours_exact = {status: secs / 3600.0 for status, secs in totals_seconds.items()}

        assert abs(sum(totals_hours_exact.values()) - 24.0) < 1e-6, (
            f"{date_key} totals do not sum to 24h: {totals_hours_exact}"
        )
        totals = {status: round(hours, 2) for status, hours in totals_hours_exact.items()}
        # Rounding each status independently can leave the four displayed
        # totals summing to 23.99 or 24.01 even though the exact hours
        # above are asserted to foot to 24.0 — absorb that penny-sized
        # residual into the day's largest bucket so the printed log always
        # foots to exactly 24.00, the way a real completed one would.
        residual = round(24.0 - sum(totals.values()), 2)
        if residual != 0.0:
            largest_status = max(totals, key=lambda status: totals[status])
            totals[largest_status] = round(totals[largest_status] + residual, 2)

        day_distance = round(sum(p.odometer_end_miles - p.odometer_start_miles for p in pieces), 1)
        mileage_to_date = round(mileage_to_date + day_distance, 1)

        log_segments = [
            {
                "status": p.status,
                "start_time": _fmt_hhmm(p.start_datetime, day_end),
                "end_time": _fmt_hhmm(p.end_datetime, day_end),
                "location_label": p.location_label,
                "stop_type": p.stop_type,
                "remark": p.remark,
                "odometer_start_miles": round(p.odometer_start_miles, 1),
                "odometer_end_miles": round(p.odometer_end_miles, 1),
            }
            for p in pieces
        ]
        remarks = [
            {"time": _fmt_hhmm(p.start_datetime, day_end), "location_label": p.location_label, "note": p.remark}
            for p in pieces
            if p.is_status_change
        ]

        logs.append(
            DailyLog(
                date=date_key.isoformat(),
                total_miles=day_distance,
                segments=log_segments,
                remarks=remarks,
                totals=totals,
                total_mileage_to_date=mileage_to_date,
                cycle_hours_used_end_of_day=round(rolling_cycle_at_day_end.get(date_key, (0.0, 0.0))[0], 2),
                cycle_hours_counting_tomorrow=round(rolling_cycle_at_day_end.get(date_key, (0.0, 0.0))[1], 2),
            )
        )

    return logs
