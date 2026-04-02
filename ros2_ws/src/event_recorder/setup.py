from setuptools import setup

package_name = 'event_recorder'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Ghost Lattice Dev',
    maintainer_email='dev@ghost-lattice.local',
    description='Record all Ghost Lattice events to JSONL and PostgreSQL',
    license='MIT',
    entry_points={
        'console_scripts': [
            'recorder_node = event_recorder.recorder_node:main',
        ],
    },
)
