from setuptools import setup

package_name = 'telemetry_bridge'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Ghost Lattice Dev',
    maintainer_email='dev@ghost-lattice.local',
    description='Bridge PX4 vehicle odometry to Ghost Lattice FleetState',
    license='MIT',
    entry_points={
        'console_scripts': [
            'bridge_node = telemetry_bridge.bridge_node:main',
        ],
    },
)
