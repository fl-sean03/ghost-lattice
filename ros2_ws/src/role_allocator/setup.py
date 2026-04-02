from setuptools import setup

package_name = 'role_allocator'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Ghost Lattice Dev',
    maintainer_email='dev@ghost-lattice.local',
    description='Utility-based role allocation for drone swarm',
    license='MIT',
    entry_points={
        'console_scripts': [
            'allocator_node = role_allocator.allocator_node:main',
        ],
    },
)
