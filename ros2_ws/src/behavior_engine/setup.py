from setuptools import setup

package_name = 'behavior_engine'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name, f'{package_name}.behaviors'],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Ghost Lattice Dev',
    maintainer_email='dev@ghost-lattice.local',
    description='Per-vehicle behavior execution engine',
    license='MIT',
    entry_points={
        'console_scripts': [
            'engine_node = behavior_engine.engine_node:main',
        ],
    },
)
