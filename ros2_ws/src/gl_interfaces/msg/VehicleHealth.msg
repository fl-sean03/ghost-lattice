# Vehicle health status (fires on-change)
# Maps to event_type: vehicle_health

builtin_interfaces/Time stamp
string run_id
string vehicle_id

uint8 gps_fix_type         # 0=none, 2=2D, 3=3D, 4=DGPS, 5=RTK
float64 gps_accuracy_m
float64 battery_voltage
string comms_status        # nominal, degraded, lost
uint8[4] motor_status      # 1=ok, 0=failed per motor
string nav_mode            # gps, visual_odom, lidar_odom, inertial_only
string overall_health      # nominal, degraded, critical, failed
