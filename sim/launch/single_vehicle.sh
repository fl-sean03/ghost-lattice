#!/bin/bash
# Ghost Lattice — Single Vehicle Launch
# Launches 1 PX4 SITL instance with Gazebo for validation.
#
# Usage: ./single_vehicle.sh [world_name]
# Example: ./single_vehicle.sh empty_test

set -euo pipefail

WORLD_NAME="${1:-empty_test}"
WORLD_DIR="${WORLD_DIR:-/sim/worlds}"
PX4_HOME="${PX4_HOME:-/opt/PX4-Autopilot}"
PX4_BIN="${PX4_HOME}/build/px4_sitl_default/bin/px4"

echo "=== Ghost Lattice — Single Vehicle Launch ==="
echo "World: ${WORLD_NAME}"
echo "PX4 Home: ${PX4_HOME}"

# Ensure PX4 binary exists
if [ ! -f "${PX4_BIN}" ]; then
    echo "ERROR: PX4 binary not found at ${PX4_BIN}"
    exit 1
fi

# Start XRCE-DDS Agent in background
echo "Starting Micro-XRCE-DDS Agent..."
MicroXRCEAgent udp4 -p 8888 &
XRCE_PID=$!

# Trap to clean up on exit
cleanup() {
    echo "Shutting down..."
    kill ${XRCE_PID} 2>/dev/null || true
    pkill -f "px4" 2>/dev/null || true
    pkill -f "gz sim" 2>/dev/null || true
    wait
}
trap cleanup EXIT INT TERM

# Set up PX4 environment
export GZ_SIM_RESOURCE_PATH="${PX4_HOME}/Tools/simulation/gz/models:${WORLD_DIR}"
export PX4_SYS_AUTOSTART=4001
export PX4_GZ_MODEL=x500
export PX4_GZ_MODEL_POSE="0,0,0,0,0,0"
export PX4_GZ_WORLD="${WORLD_NAME}"

# Copy world file to PX4 expected location if needed
WORLD_SRC="${WORLD_DIR}/${WORLD_NAME}.sdf"
WORLD_DST="${PX4_HOME}/Tools/simulation/gz/worlds/${WORLD_NAME}.sdf"
if [ -f "${WORLD_SRC}" ] && [ ! -f "${WORLD_DST}" ]; then
    mkdir -p "$(dirname "${WORLD_DST}")"
    cp "${WORLD_SRC}" "${WORLD_DST}"
    echo "Copied world file to PX4 worlds directory"
fi

echo "Launching PX4 SITL with Gazebo..."
cd "${PX4_HOME}"
${PX4_BIN} -i 0

# Wait for all background processes
wait
