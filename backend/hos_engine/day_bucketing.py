"""Splits a flat, contiguous Segment list into one FMCSA-format DailyLog
per calendar day.

Timezone anchor: naive wall-clock time in trip-start's local time for the
whole simulation — no per-location conversion. This mirrors how carriers
commonly fix logs to a single reference time (e.g. home-terminal time)
rather than shifting per state line, and it sidesteps DST entirely.
"""

from datetime import datetime, timedelta
from typing import List

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


def build_daily_logs(segments: List[Segment], starting_cycle_hours: float = 0.0) -> List[DailyLog]:
    if not segments:
        return []

    all_pieces: List[Segment] = []
    for seg in segments:
        all_pieces.extend(_split_at_midnights(seg))

    pieces_by_date: dict = {}
    for piece in all_pieces:
        pieces_by_date.setdefault(piece.start_datetime.date(), []).append(piece)

    logs: List[DailyLog] = []
    mileage_to_date = 0.0
    # Mirrors the engine's own cycle_hrs_used bookkeeping exactly (sum
    # on-duty/driving hours, zero it out the moment a 34-hour restart
    # completes) rather than re-deriving HOS rules — this is a pure replay
    # of decisions the engine already made, not a second implementation of
    # them, so it can never disagree with what actually happened.
    cycle_hours_used = starting_cycle_hours
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

        for p in pieces:
            if p.status in (DRIVING, ON_DUTY_NOT_DRIVING):
                cycle_hours_used += (p.end_datetime - p.start_datetime).total_seconds() / 3600.0
            if p.stop_type == "restart":
                cycle_hours_used = 0.0

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
                cycle_hours_used_end_of_day=round(cycle_hours_used, 2),
            )
        )

    return logs
