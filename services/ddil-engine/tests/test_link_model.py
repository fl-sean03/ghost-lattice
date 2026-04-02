"""Tests for the link quality model — pure Python, no sim required."""

import numpy as np
import pytest

from app.link_model import base_quality, line_of_sight, jammer_attenuation, link_quality


def test_base_quality_at_zero_distance():
    assert base_quality(0.0, 800.0) == 1.0


def test_base_quality_at_max_range():
    assert base_quality(800.0, 800.0) == 0.0


def test_base_quality_at_half_range():
    assert base_quality(400.0, 800.0) == pytest.approx(0.5)


def test_base_quality_beyond_range():
    assert base_quality(1000.0, 800.0) == 0.0


def test_los_clear_no_buildings():
    p1 = np.array([0.0, 0.0, 30.0])
    p2 = np.array([100.0, 0.0, 30.0])
    assert line_of_sight(p1, p2, []) == 1.0


def test_los_blocked_by_building():
    p1 = np.array([0.0, 0.0, 10.0])
    p2 = np.array([100.0, 0.0, 10.0])
    building = {'center': [50.0, 0.0, 10.0], 'size': [20.0, 20.0, 20.0]}
    assert line_of_sight(p1, p2, [building]) == pytest.approx(0.2)


def test_los_clear_over_building():
    p1 = np.array([0.0, 0.0, 50.0])
    p2 = np.array([100.0, 0.0, 50.0])
    building = {'center': [50.0, 0.0, 10.0], 'size': [20.0, 20.0, 20.0]}
    assert line_of_sight(p1, p2, [building]) == 1.0


def test_jammer_no_effect_outside_radius():
    p1 = np.array([0.0, 0.0, 0.0])
    p2 = np.array([10.0, 0.0, 0.0])
    jammer = {'center': [500.0, 500.0, 0.0], 'radius_m': 100.0, 'active': True}
    assert jammer_attenuation(p1, p2, [jammer]) == 1.0


def test_jammer_full_attenuation_at_center():
    p1 = np.array([500.0, 500.0, 0.0])
    p2 = np.array([500.0, 500.0, 0.0])
    jammer = {'center': [500.0, 500.0, 0.0], 'radius_m': 100.0, 'active': True}
    assert jammer_attenuation(p1, p2, [jammer]) == 0.0


def test_jammer_partial_attenuation():
    p1 = np.array([450.0, 500.0, 0.0])  # 50m from center, inside 100m radius
    p2 = np.array([600.0, 500.0, 0.0])  # outside radius
    jammer = {'center': [500.0, 500.0, 0.0], 'radius_m': 100.0, 'active': True}
    atten = jammer_attenuation(p1, p2, [jammer])
    assert 0.0 < atten < 1.0


def test_jammer_inactive_no_effect():
    p1 = np.array([500.0, 500.0, 0.0])
    p2 = np.array([500.0, 500.0, 0.0])
    jammer = {'center': [500.0, 500.0, 0.0], 'radius_m': 100.0, 'active': False}
    assert jammer_attenuation(p1, p2, [jammer]) == 1.0


def test_link_quality_full():
    p1 = np.array([0.0, 0.0, 30.0])
    p2 = np.array([100.0, 0.0, 30.0])
    q = link_quality(p1, p2, max_range=800.0)
    assert 0.8 < q <= 1.0  # Close, no obstructions


def test_link_quality_with_jammer():
    p1 = np.array([200.0, 150.0, 30.0])  # Near jammer center
    p2 = np.array([300.0, 150.0, 30.0])
    jammer = {'center': [200.0, 150.0, 0.0], 'radius_m': 150.0, 'active': True}
    q_jammed = link_quality(p1, p2, max_range=800.0, jammers=[jammer])
    q_clear = link_quality(p1, p2, max_range=800.0)
    assert q_jammed < q_clear
