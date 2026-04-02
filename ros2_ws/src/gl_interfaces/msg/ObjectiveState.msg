# Mission objective progress (fires on-change)
# Maps to event_type: objective_state

builtin_interfaces/Time stamp
string run_id

string objective_id        # e.g. "obj_search"
string objective_type      # area_search, maintain_relay, track_emitter
float64 progress_pct       # 0-100
string status              # pending, in_progress, completed, degraded, failed
string[] assigned_vehicles
bool degraded
string degradation_reason
