# Instantaneous metric value (sampled every 10s)
# Maps to event_type: mission_metric

builtin_interfaces/Time stamp
string run_id

string metric_name         # search_coverage_pct, relay_uptime_pct, track_continuity_sec, etc.
float64 value
string unit                # percent, seconds, count, ratio
float64 delta_since_last
