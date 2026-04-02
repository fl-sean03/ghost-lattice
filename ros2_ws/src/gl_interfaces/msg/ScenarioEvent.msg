# Environmental disruption injected by scenario engine
# Maps to event_type: scenario_event

builtin_interfaces/Time stamp
string run_id

string disruption_type     # jammer_on, jammer_off, drone_fail, gps_degrade, gps_restore
string disruption_id       # e.g. "jammer_1"
string region              # e.g. "zone_j1"
float64[3] center          # x, y, z
float64 radius_m
float64 strength_dbm       # for jammers
float64 accuracy_m         # for GPS degradation
string target              # vehicle_id for drone_fail
string mode                # power_loss, motor_failure, etc.
string[] affected_entities
float64 scheduled_end_t    # simulation time when effect ends
