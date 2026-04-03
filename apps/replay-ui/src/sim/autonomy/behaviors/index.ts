import { type Behavior } from "../behavior";
import { FanOutSearch } from "./fan-out-search";
import { HoldRelay } from "./hold-relay";
import { PassiveTrack } from "./passive-track";
import { Regroup } from "./regroup";
import { DecoyEmit } from "./decoy-emit";
import { ConserveEnergy } from "./conserve-energy";
import { ReturnAnchor } from "./return-anchor";

export const BEHAVIOR_MAP: Record<string, new (vehicleId: string) => Behavior> = {
  scout: FanOutSearch,
  relay: HoldRelay,
  tracker: PassiveTrack,
  reserve: ConserveEnergy,
  decoy: DecoyEmit,
  edge_anchor: HoldRelay,
};

export { FanOutSearch, HoldRelay, PassiveTrack, Regroup, DecoyEmit, ConserveEnergy, ReturnAnchor };
