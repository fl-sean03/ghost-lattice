# Full network topology snapshot at 1 Hz
# Maps to event_type: network_state

builtin_interfaces/Time stamp
string run_id

gl_interfaces/NetworkLink[] edges

# Partition information: each inner array is a connected component
# Encoded as comma-separated vehicle IDs per partition
string[] partitions        # e.g. ["alpha_1,alpha_2,charlie_1", "bravo_1,charlie_2"]

uint8 partition_count
