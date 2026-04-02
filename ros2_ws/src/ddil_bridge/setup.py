from setuptools import setup

package_name = 'ddil_bridge'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    install_requires=['setuptools', 'requests'],
    zip_safe=True,
    maintainer='Ghost Lattice Dev',
    maintainer_email='dev@ghost-lattice.local',
    description='DDIL engine HTTP bridge for ROS 2',
    license='MIT',
    entry_points={
        'console_scripts': [
            'bridge_node = ddil_bridge.bridge_node:main',
        ],
    },
)
