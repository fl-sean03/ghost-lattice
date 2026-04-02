# Role change event
# Maps to event_type: role_assignment

builtin_interfaces/Time stamp
string run_id
string vehicle_id

string old_role
string new_role

# Reason for change
string trigger             # initial_assignment, partition_detected, node_loss, battery_low, objective_change, operator_redirect, utility_rebalance
float64 link_score_gain
bool battery_ok
float64 position_advantage
float64 utility_delta
uint32 auction_round
