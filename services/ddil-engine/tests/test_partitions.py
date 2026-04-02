"""Tests for network graph and partition detection."""

import pytest
from app.network_graph import find_partitions, compute_network


def test_single_partition_all_connected():
    nodes = ['a', 'b', 'c']
    edges = [('a', 'b'), ('b', 'c')]
    partitions = find_partitions(nodes, edges)
    assert len(partitions) == 1
    assert set(partitions[0]) == {'a', 'b', 'c'}


def test_two_partitions():
    nodes = ['a', 'b', 'c', 'd']
    edges = [('a', 'b'), ('c', 'd')]
    partitions = find_partitions(nodes, edges)
    assert len(partitions) == 2


def test_isolated_node():
    nodes = ['a', 'b', 'c']
    edges = [('a', 'b')]
    partitions = find_partitions(nodes, edges)
    assert len(partitions) == 2


def test_no_edges_all_isolated():
    nodes = ['a', 'b', 'c']
    edges = []
    partitions = find_partitions(nodes, edges)
    assert len(partitions) == 3


def test_compute_network_close_vehicles():
    vehicles = [
        {'id': 'v1', 'position': [0, 0, 0], 'comms_range': 800},
        {'id': 'v2', 'position': [10, 0, 0], 'comms_range': 800},
    ]
    result = compute_network(vehicles)
    assert result['partition_count'] == 1
    assert len(result['edges']) == 1
    assert result['edges'][0]['active'] is True
    assert result['edges'][0]['quality'] > 0.9


def test_compute_network_far_vehicles():
    vehicles = [
        {'id': 'v1', 'position': [0, 0, 0], 'comms_range': 100},
        {'id': 'v2', 'position': [500, 0, 0], 'comms_range': 100},
    ]
    result = compute_network(vehicles)
    assert result['partition_count'] == 2
    assert result['edges'][0]['active'] is False


def test_compute_network_with_jammer():
    vehicles = [
        {'id': 'v1', 'position': [190, 150, 30], 'comms_range': 800},
        {'id': 'v2', 'position': [210, 150, 30], 'comms_range': 800},
    ]
    jammer = {'center': [200, 150, 0], 'radius_m': 150, 'active': True}
    result_jammed = compute_network(vehicles, jammers=[jammer])
    result_clear = compute_network(vehicles)

    # Jammer should degrade quality
    assert result_jammed['edges'][0]['quality'] < result_clear['edges'][0]['quality']


def test_compute_network_six_vehicles():
    """Test with mission_001-like fleet."""
    vehicles = [
        {'id': 'alpha_1', 'position': [50, 25, 30], 'comms_range': 800},
        {'id': 'alpha_2', 'position': [100, 0, 30], 'comms_range': 800},
        {'id': 'bravo_1', 'position': [0, 100, 25], 'comms_range': 600},
        {'id': 'bravo_2', 'position': [150, 100, 25], 'comms_range': 600},
        {'id': 'charlie_1', 'position': [50, 50, 35], 'comms_range': 1000},
        {'id': 'charlie_2', 'position': [200, 50, 30], 'comms_range': 1000},
    ]
    result = compute_network(vehicles)
    # All within range, should be 1 partition
    assert result['partition_count'] == 1
    assert len(result['edges']) == 15  # 6 choose 2
