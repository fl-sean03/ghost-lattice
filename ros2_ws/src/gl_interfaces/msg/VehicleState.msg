# Per-vehicle state at 10 Hz
# Maps to event_type: vehicle_state

builtin_interfaces/Time stamp
string vehicle_id          # e.g. "alpha_1"
string run_id

# Position in NED frame (meters)
float64[3] position_ned

# Velocity in NED frame (m/s)
float64[3] velocity_ned

# Heading (radians, 0=North, CW positive)
float64 heading_rad

# Current assigned role
string current_role        # scout, relay, tracker, reserve, decoy, edge_anchor

# Battery
float64 battery_pct        # 0-100
float64 battery_wh_remaining

# Flight status
bool armed
string flight_mode         # offboard, hold, rtl, land
