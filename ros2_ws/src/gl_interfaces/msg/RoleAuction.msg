# Bid message for market-based role allocation
# Each vehicle publishes its self-assessed utility for each eligible role

builtin_interfaces/Time stamp
string vehicle_id
string role                # role being bid on
float64 utility_score      # overall computed utility
float64 battery_pct
float64 distance_to_objective
float64 link_quality
float64 health_score
float64 sensor_suitability
