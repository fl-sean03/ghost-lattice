from setuptools import setup

package_name = 'scenario_engine'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    install_requires=['setuptools', 'pyyaml'],
    zip_safe=True,
    maintainer='Ghost Lattice Dev',
    maintainer_email='dev@ghost-lattice.local',
    description='Timed event injection from scenario YAML',
    license='MIT',
    entry_points={
        'console_scripts': [
            'engine_node = scenario_engine.engine_node:main',
        ],
    },
)
