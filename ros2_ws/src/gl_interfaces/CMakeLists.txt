cmake_minimum_required(VERSION 3.8)
project(gl_interfaces)

find_package(ament_cmake REQUIRED)
find_package(std_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(builtin_interfaces REQUIRED)
find_package(rosidl_default_generators REQUIRED)

rosidl_generate_interfaces(${PROJECT_NAME}
  # Messages
  "msg/VehicleState.msg"
  "msg/FleetState.msg"
  "msg/RoleAssignment.msg"
  "msg/RoleAuction.msg"
  "msg/RoleClaim.msg"
  "msg/ScenarioEvent.msg"
  "msg/NetworkLink.msg"
  "msg/NetworkState.msg"
  "msg/MissionMetric.msg"
  "msg/OperatorCommand.msg"
  "msg/AutonomyTrace.msg"
  "msg/VehicleHealth.msg"
  "msg/ObjectiveState.msg"
  # Services
  "srv/GetFleetCapabilities.srv"
  "srv/SubmitMissionIntent.srv"
  "srv/InjectDisruption.srv"
  DEPENDENCIES std_msgs geometry_msgs builtin_interfaces
)

ament_package()
