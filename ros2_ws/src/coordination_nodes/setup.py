from setuptools import setup

package_name = 'coordination_nodes'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Ghost Lattice Dev',
    maintainer_email='dev@ghost-lattice.local',
    description='Partition detection and mesh awareness',
    license='MIT',
    entry_points={
        'console_scripts': [
            'partition_detector = coordination_nodes.partition_detector:main',
            'mesh_awareness = coordination_nodes.mesh_awareness:main',
        ],
    },
)
