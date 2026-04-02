#!/bin/bash
# Wait until N PX4 instances report "Ready for takeoff"
# Usage: wait_for_ready.sh <num_vehicles> [timeout_sec]

set -euo pipefail

NUM_VEHICLES="${1:-6}"
TIMEOUT="${2:-120}"

echo "Waiting for ${NUM_VEHICLES} PX4 instances to be ready (timeout: ${TIMEOUT}s)..."

START=$(date +%s)
while true; do
    READY=$(pgrep -c -f "px4" 2>/dev/null || echo 0)
    ELAPSED=$(( $(date +%s) - START ))

    echo "  [${ELAPSED}s] PX4 processes: ${READY} / ${NUM_VEHICLES}"

    if [ "${READY}" -ge "${NUM_VEHICLES}" ]; then
        echo "All ${NUM_VEHICLES} vehicles detected!"
        exit 0
    fi

    if [ "${ELAPSED}" -ge "${TIMEOUT}" ]; then
        echo "ERROR: Timeout after ${TIMEOUT}s — only ${READY} vehicles ready"
        exit 1
    fi

    sleep 5
done
