from .base import Behavior
from .fan_out_search import FanOutSearch
from .hold_relay import HoldRelay
from .passive_track import PassiveTrack
from .regroup import RegroupAfterPartition
from .decoy_emit import DecoyEmit
from .conserve_energy import ConserveEnergy
from .return_anchor import ReturnToAnchor

BEHAVIOR_MAP = {
    'scout': FanOutSearch,
    'relay': HoldRelay,
    'tracker': PassiveTrack,
    'reserve': ConserveEnergy,
    'decoy': DecoyEmit,
    'edge_anchor': HoldRelay,
}
