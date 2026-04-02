from setuptools import setup

package_name = 'mission_executor'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Ghost Lattice Dev',
    maintainer_email='dev@ghost-lattice.local',
    description='Send offboard commands to PX4 vehicles',
    license='MIT',
    entry_points={
        'console_scripts': [
            'executor_node = mission_executor.executor_node:main',
        ],
    },
)
