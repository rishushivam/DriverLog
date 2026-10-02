"""Which daily rules the simulator enforces.

Standard operation is §395.3: 11 hours driving inside a 14-hour window
with a 30-minute break after 8 hours of driving. The short-haul
exceptions (§395.1(e)) and the 16-hour exception (§395.1(o)) relax one or
two of those for a driver who returns to their work reporting location.
The 60/70-hour cycle and the 10-hour rest between duty periods are never
relaxed by any of them, and neither is the 11-hour driving limit.
"""

from dataclasses import dataclass

from . import constants as c

STANDARD = "standard"
SHORT_HAUL_CDL = "short_haul_cdl"
SHORT_HAUL_NON_CDL = "short_haul_non_cdl"
OPERATING_MODES = (STANDARD, SHORT_HAUL_CDL, SHORT_HAUL_NON_CDL)


@dataclass(frozen=True)
class HosRules:
    # §395.3(a)(3)(ii) — waived for drivers under either short-haul exception.
    break_required: bool = True
    # §395.3(a)(2) — the ordinary driving window.
    window_hours: float = c.MAX_ON_DUTY_WINDOW_HOURS
    # Some exceptions let a limited number of duty periods run to a longer
    # window: §395.1(o) once per 7 days, §395.1(e)(2) on 2 days per 7.
    # `extended_window_days` is how many such periods the driver may still
    # use in this trip; the engine consumes one each time driving actually
    # continues past `window_hours`.
    extended_window_hours: float = c.MAX_ON_DUTY_WINDOW_HOURS
    extended_window_days: int = 0
    # Remark stamped on the driving segment that crosses the ordinary
    # window, so the record of duty status names the exception used.
    extended_window_remark: str = ""
    mode: str = STANDARD

    @property
    def max_window_hours(self) -> float:
        return self.extended_window_hours if self.extended_window_days > 0 else self.window_hours


def standard_rules(use_16_hour_exception: bool = False) -> HosRules:
    """§395.3 as written, optionally with the §395.1(o) 16-hour exception
    for one duty period (the driver must still return to the work
    reporting location that day and have done so on the last 5 tours —
    attested by the dispatcher, not verifiable here)."""
    if use_16_hour_exception:
        return HosRules(
            break_required=True,
            window_hours=c.MAX_ON_DUTY_WINDOW_HOURS,
            extended_window_hours=c.SIXTEEN_HOUR_EXCEPTION_WINDOW_HOURS,
            extended_window_days=1,
            extended_window_remark="Driving past the 14th hour under the 16-hour short-haul exception",
            mode=STANDARD,
        )
    return HosRules()


def short_haul_cdl_rules() -> HosRules:
    """§395.1(e)(1): no 30-minute break; released within 14 hours."""
    return HosRules(break_required=False, window_hours=c.MAX_ON_DUTY_WINDOW_HOURS, mode=SHORT_HAUL_CDL)


def short_haul_non_cdl_rules(days_past_14th_hour_this_week: int) -> HosRules:
    """§395.1(e)(2): no 30-minute break; may drive to the 16th hour on up
    to 2 days of any 7, to the 14th hour otherwise. The dispatcher supplies
    how many of those 2 days are already used this week."""
    remaining = max(0, c.NON_CDL_EXTENDED_DAYS_PER_WEEK - days_past_14th_hour_this_week)
    return HosRules(
        break_required=False,
        window_hours=c.MAX_ON_DUTY_WINDOW_HOURS,
        extended_window_hours=c.SIXTEEN_HOUR_EXCEPTION_WINDOW_HOURS,
        extended_window_days=remaining,
        extended_window_remark="Driving past the 14th hour under the non-CDL short-haul exception",
        mode=SHORT_HAUL_NON_CDL,
    )
