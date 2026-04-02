#!/bin/bash
# Ghost Lattice — Multi-Vehicle Launch
# Launches 6 PX4 SITL instances with shared Gazebo server.
#
# Instance 0 starts Gazebo; instances 1-5 connect in standalone mode.
# All instances share a single XRCE-DDS Agent for ROS 2 bridging.
#
# Usage: ./multi_vehicle.sh [world_name] [num_vehicles]
# Example: ./multi_vehicle.sh coastal_industrial_v1 6

set -euo pipefail

WORLD_NAME="${1:-coastal_industrial_v1}"
NUM_VEHICLES="${2:-6}"
WORLD_DIR="${WORLD_DIR:-/sim/worlds}"
PX4_HOME="${PX4_HOME:-/opt/PX4-Autopilot}"
PX4_BIN="${PX4_HOME}/build/px4_sitl_default/bin/px4"

echo "=== Ghost Lattice — Multi-Vehicle Launch ==="
echo "World: ${WORLD_NAME}"
echo "Vehicles: ${NUM_VEHICLES}"
echo "PX4 Home: ${PX4_HOME}"

# Ensure PX4 binary exists
if [ ! -f "${PX4_BIN}" ]; then
    echo "ERROR: PX4 binary not found at ${PX4_BIN}"
    exit 1
fi

# Vehicle definitions from mission_001.yaml:
# Format: instance:model:spawn_x:spawn_y:spawn_z:yaw
VEHICLES=(
    "0:x500:0:0:0:0"          # alpha_1
    "1:x500:3:0:0:0"          # alpha_2
    "2:x500:0:3:0:0"          # bravo_1
    "3:x500:3:3:0:0"          # bravo_2
    "4:x500:0:6:0:0"          # charlie_1 (lidar model uses same base for now)
    "5:x500:3:6:0:0"          # charlie_2
)

# PIDs for cleanup
declare -a PIDS=()

cleanup() {
    echo ""
    echo "=== Shutting down all vehicles ==="
    for pid in "${PIDS[@]}"; do
        kill "${pid}" 2>/dev/null || true
    done
    pkill -f "px4" 2>/dev/null || true
    pkill -f "gz sim" 2>/dev/null || true
    pkill -f "MicroXRCEAgent" 2>/dev/null || true
    wait 2>/dev/null
    echo "All processes stopped."
}
trap cleanup EXIT INT TERM

# Copy world file to PX4 expected location
WORLD_SRC="${WORLD_DIR}/${WORLD_NAME}.sdf"
WORLD_DST="${PX4_HOME}/Tools/simulation/gz/worlds/${WORLD_NAME}.sdf"
if [ -f "${WORLD_SRC}" ]; then
    mkdir -p "$(dirname "${WORLD_DST}")"
    cp "${WORLD_SRC}" "${WORLD_DST}"
    echo "World file installed: ${WORLD_NAME}.sdf"
fi

# Set up shared environment
export GZ_SIM_RESOURCE_PATH="${PX4_HOME}/Tools/simulation/gz/models:/sim/vehicle-models"

# Start XRCE-DDS Agent (single agent, handles all 6 vehicles)
echo "Starting Micro-XRCE-DDS Agent on port 8888..."
MicroXRCEAgent udp4 -p 8888 &
PIDS+=($!)
sleep 1

# ── Launch first vehicle (starts Gazebo server) ─────────────────────────────
IFS=':' read -r inst model px py pz yaw <<< "${VEHICLES[0]}"
echo ""
echo "=== Launching vehicle 0 (alpha_1) — will start Gazebo server ==="

cd "${PX4_HOME}"
PX4_SYS_AUTOSTART=4001 \
PX4_GZ_MODEL="${model}" \
PX4_GZ_MODEL_POSE="${px},${py},${pz},0,0,${yaw}" \
PX4_GZ_WORLD="${WORLD_NAME}" \
${PX4_BIN} -i "${inst}" &
PIDS+=($!)

# Wait for Gazebo to be ready
echo "Waiting for Gazebo to initialize..."
sleep 10

# ── Launch remaining vehicles (standalone mode) ─────────────────────────────
for i in $(seq 1 $((NUM_VEHICLES - 1))); do
    if [ $i -ge ${#VEHICLES[@]} ]; then
        echo "WARNING: Only ${#VEHICLES[@]} vehicle definitions available, skipping instance ${i}"
        break
    fi

    IFS=':' read -r inst model px py pz yaw <<< "${VEHICLES[$i]}"
    VEHICLE_NAMES=("alpha_1" "alpha_2" "bravo_1" "bravo_2" "charlie_1" "charlie_2")
    echo "=== Launching vehicle ${inst} (${VEHICLE_NAMES[$i]}) ==="

    cd "${PX4_HOME}"
    PX4_SYS_AUTOSTART=4001 \
    PX4_GZ_STANDALONE=1 \
    PX4_GZ_MODEL="${model}" \
    PX4_GZ_MODEL_POSE="${px},${py},${pz},0,0,${yaw}" \
    ${PX4_BIN} -i "${inst}" &
    PIDS+=($!)

    # Stagger launches to avoid race conditions
    sleep 3
done

echo ""
echo "=== All ${NUM_VEHICLES} vehicles launched ==="
echo "XRCE-DDS Agent PID: ${PIDS[0]}"
echo ""
echo "ROS 2 topic namespaces:"
echo "  Vehicle 0 (alpha_1):   /fmu/out/*"
echo "  Vehicle 1 (alpha_2):   /px4_1/fmu/out/*"
echo "  Vehicle 2 (bravo_1):   /px4_2/fmu/out/*"
echo "  Vehicle 3 (bravo_2):   /px4_3/fmu/out/*"
echo "  Vehicle 4 (charlie_1): /px4_4/fmu/out/*"
echo "  Vehicle 5 (charlie_2): /px4_5/fmu/out/*"
echo ""
echo "Waiting for all vehicles... (Ctrl+C to stop)"

# Wait for any process to exit
wait -n || true

echo "A vehicle process exited. Shutting down..."
