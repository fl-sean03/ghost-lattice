"""Tests for jammer zone model."""

import numpy as np
import pytest

from app.jammer_model import JammerZone


def test_jammer_signal_at_center():
    jz = JammerZone(id="j1", center=[100.0, 100.0, 0.0], radius_m=150.0)
    signal = jz.signal_at(np.array([100.0, 100.0, 0.0]))
    assert signal == 1.0


def test_jammer_signal_outside():
    jz = JammerZone(id="j1", center=[100.0, 100.0, 0.0], radius_m=150.0)
    signal = jz.signal_at(np.array([300.0, 300.0, 0.0]))
    assert signal == 0.0


def test_jammer_signal_at_edge():
    jz = JammerZone(id="j1", center=[100.0, 100.0, 0.0], radius_m=150.0)
    signal = jz.signal_at(np.array([250.0, 100.0, 0.0]))
    assert signal == pytest.approx(0.0, abs=0.01)


def test_jammer_signal_midway():
    jz = JammerZone(id="j1", center=[100.0, 100.0, 0.0], radius_m=100.0)
    signal = jz.signal_at(np.array([150.0, 100.0, 0.0]))
    assert 0.0 < signal < 1.0


def test_jammer_inactive():
    jz = JammerZone(id="j1", center=[100.0, 100.0, 0.0], radius_m=150.0, active=False)
    signal = jz.signal_at(np.array([100.0, 100.0, 0.0]))
    assert signal == 0.0
