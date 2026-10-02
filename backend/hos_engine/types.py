from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional

OFF_DUTY = "OFF_DUTY"
SLEEPER_BERTH = "SLEEPER_BERTH"
DRIVING = "DRIVING"
ON_DUTY_NOT_DRIVING = "ON_DUTY_NOT_DRIVING"

ALL_STATUSES = (OFF_DUTY, SLEEPER_BERTH, DRIVING, ON_DUTY_NOT_DRIVING)


@dataclass
class Segment:
    """One contiguous block of a single duty status.

    `is_status_change` is computed once at creation time (relative to the
    previous segment in the same simulation) so day-bucketing never has to
    re-derive it after segments get split at midnight boundaries.
    """

    status: str
    start_datetime: datetime
    end_datetime: datetime
    location_label: str
    odometer_start_miles: float
    odometer_end_miles: float
    remark: Optional[str] = None
    stop_type: Optional[str] = None
    is_status_change: bool = False
    # None for solo trips. "driver_1" / "driver_2" for team trips — which
    # driver this segment belongs to on THEIR OWN personal RODS log (each
    # driver keeps a separate log in real life; team driving never merges
    # two people's hours onto one sheet).
    driver: Optional[str] = None

    @property
    def duration_hours(self) -> float:
        return (self.end_datetime - self.start_datetime).total_seconds() / 3600.0

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "start_datetime": self.start_datetime.isoformat(),
            "end_datetime": self.end_datetime.isoformat(),
            "location_label": self.location_label,
            "odometer_start_miles": round(self.odometer_start_miles, 2),
            "odometer_end_miles": round(self.odometer_end_miles, 2),
            "remark": self.remark,
            "stop_type": self.stop_type,
        }


@dataclass
class TripResult:
    segments: List[Segment]
    total_distance_miles: float
    # Raw distance / AVG_TRUCK_SPEED_MPH — driving time only, ignores every
    # break/rest/restart. Easy to mistake for "how long until delivery,"
    # which total_trip_span_hours below actually answers.
    total_duration_hours: float
    # Wall-clock span from the first segment's start to the last segment's
    # end — i.e. the real answer to "how long does this trip take," rests
    # and all. For a trip needing a 34-hour restart this can be dramatically
    # larger than total_duration_hours; that gap is the point, not a bug.
    total_trip_span_hours: float = 0.0


@dataclass
class DailyLog:
    date: str
    total_miles: float
    segments: List[Dict]
    remarks: List[Dict]
    totals: Dict[str, float]
    total_mileage_to_date: float = 0.0
    cycle_hours_used_end_of_day: float = 0.0
    # On-duty hours in the last (N-1) days including today — the part of
    # today's rolling window that will still count tomorrow (Recap line A).
    cycle_hours_counting_tomorrow: float = 0.0

    def to_dict(self) -> dict:
        return {
            "date": self.date,
            "total_miles": self.total_miles,
            "segments": self.segments,
            "remarks": self.remarks,
            "totals": self.totals,
            "total_mileage_to_date": self.total_mileage_to_date,
            "cycle_hours_used_end_of_day": self.cycle_hours_used_end_of_day,
            "cycle_hours_counting_tomorrow": self.cycle_hours_counting_tomorrow,
        }
