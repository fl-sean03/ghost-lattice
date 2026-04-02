# Detailed reasoning trace for autonomy decisions
# Maps to event_type: autonomy_decision_trace

builtin_interfaces/Time stamp
string run_id
string vehicle_id

string decision            # role_change, behavior_switch, path_replan, regroup

# Context
string current_role
float64 current_health
bool partition_detected
float64 time_since_event   # seconds since triggering event

# Alternatives considered (parallel arrays)
string[] alt_roles
float64[] alt_utilities

# Chosen action
string chosen
string chosen_reason
