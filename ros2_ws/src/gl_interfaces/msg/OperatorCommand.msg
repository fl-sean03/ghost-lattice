# Operator action (scripted from scenario or manual)
# Maps to event_type: operator_action

builtin_interfaces/Time stamp
string run_id

string action_type         # redirect_search, abort, regroup, rtb, retask_vehicle
string target              # vehicle_id or region_id (optional)
string source              # scripted, manual
string reason
# Additional parameters encoded as key=value pairs
string[] param_keys
string[] param_values
