"""
Fleet Registry

Loads fleet composition from scenario YAML and provides capability queries.
Used by the role allocator and behavior engine to understand what each vehicle can do.
"""

from pathlib import Path

import yaml

from .models import VehicleCapability, FleetComposition


class FleetRegistry:
    def __init__(self):
        self._vehicles: dict[str, VehicleCapability] = {}

    def load_from_scenario(self, scenario_path: str | Path):
        """Load fleet from scenario YAML."""
        with open(scenario_path) as f:
            scenario = yaml.safe_load(f)

        for i, v in enumerate(scenario['fleet']):
            cap = VehicleCapability(
                vehicle_id=v['id'],
                vendor=v['vendor'],
                type=v['type'],
                payloads=v['payloads'],
                roles_eligible=v['roles_eligible'],
                battery_wh=v['battery_wh'],
                max_speed_ms=v['max_speed_ms'],
                comms_range_m=v['comms_range_m'],
                nav_modes=v.get('nav_modes', ['gps']),
                px4_instance=i,
                spawn_pose=v['spawn_pose'],
            )
            self._vehicles[v['id']] = cap

    def get_vehicle(self, vehicle_id: str) -> VehicleCapability | None:
        return self._vehicles.get(vehicle_id)

    def get_all(self) -> list[VehicleCapability]:
        return list(self._vehicles.values())

    def get_by_role(self, role: str) -> list[VehicleCapability]:
        return [v for v in self._vehicles.values() if role in v.roles_eligible]

    def get_by_payload(self, payload: str) -> list[VehicleCapability]:
        return [v for v in self._vehicles.values() if payload in v.payloads]

    def get_by_vendor(self, vendor: str) -> list[VehicleCapability]:
        return [v for v in self._vehicles.values() if v.vendor == vendor]

    def get_composition(self) -> FleetComposition:
        vehicles = list(self._vehicles.values())
        all_roles = set()
        all_payloads = set()
        vendors = set()
        for v in vehicles:
            all_roles.update(v.roles_eligible)
            all_payloads.update(v.payloads)
            vendors.add(v.vendor)

        return FleetComposition(
            vehicles=vehicles,
            vendor_count=len(vendors),
            total_vehicles=len(vehicles),
            available_roles=sorted(all_roles),
            available_payloads=sorted(all_payloads),
        )


def main():
    """CLI entry point for testing."""
    import json
    import sys

    path = sys.argv[1] if len(sys.argv) > 1 else "/data/scenarios/mission_001.yaml"
    registry = FleetRegistry()
    registry.load_from_scenario(path)

    comp = registry.get_composition()
    print(json.dumps(comp.model_dump(), indent=2))


if __name__ == "__main__":
    main()
