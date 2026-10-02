AVG_TRUCK_SPEED_MPH = 55.0

MAX_DRIVING_HOURS_PER_PERIOD = 11.0
MAX_ON_DUTY_WINDOW_HOURS = 14.0
DRIVING_HOURS_BEFORE_BREAK = 8.0
MANDATORY_BREAK_DURATION_HOURS = 0.5
MIN_OFF_DUTY_RESET_HOURS = 10.0
# Team driving (guide, "On-Duty Time in a CMV"): the resting driver may
# combine >=7 consecutive hours in the sleeper berth with up to 3 hours
# off duty in the passenger seat of the moving truck to satisfy the
# 10-hour off-duty requirement; passenger-seat time beyond 3 hours would
# count as on duty, so the driver returns to the berth after it.
SPLIT_SB_HOURS = 7.0
PASSENGER_SEAT_MAX_HOURS = 3.0
MAX_CYCLE_HOURS = 70.0
RESTART_DURATION_HOURS = 34.0
# When the cycle cap binds, waiting for old days to age off the rolling
# window (§395.3(b)) is preferred over a restart only if it frees at least
# this much driving room — otherwise the truck would stop again almost
# immediately and a restart is the honest answer.
CYCLE_WAIT_MIN_ROOM_HOURS = 1.0

# A carrier assigns drivers to one schedule or the other — never both — per
# §395.3(b). "70/8" is the default assumption from the original brief;
# "60/7" is for carriers that don't operate every day of the week. Each
# named schedule is really two numbers (hours *and* days) — kept as two
# parallel dicts rather than tuples so call sites that only need the hour
# cap (most of them) don't have to unpack a pair they don't use.
CYCLE_SCHEDULES = {"70/8": 70.0, "60/7": 60.0}
CYCLE_SCHEDULE_DAYS = {"70/8": 8, "60/7": 7}
DEFAULT_CYCLE_SCHEDULE = "70/8"

FUEL_INTERVAL_MILES = 1000.0
FUEL_STOP_DURATION_HOURS = 0.5

PICKUP_DURATION_HOURS = 1.0
DROPOFF_DURATION_HOURS = 1.0
# Checking back in at the work reporting location at the end of a
# short-haul (or any return-to-base) day: post-trip inspection, paperwork,
# release. Short and on duty, so the time record has a real release time.
RETURN_CHECKIN_HOURS = 0.25

# Short-haul (§395.1(e)) and 16-hour (§395.1(o)) exceptions.
SHORT_HAUL_RADIUS_AIR_MILES = 150.0
STATUTE_MILES_PER_AIR_MILE = 1.150779  # 150 air-miles = 172.6 statute miles
SIXTEEN_HOUR_EXCEPTION_WINDOW_HOURS = 16.0
# §395.1(e)(2): a non-CDL short-haul driver may drive past the 14th hour
# (to the 16th) on at most this many days in any 7 consecutive days.
NON_CDL_EXTENDED_DAYS_PER_WEEK = 2

HOURS_EPSILON = 1e-6
MILES_EPSILON = 1e-6
