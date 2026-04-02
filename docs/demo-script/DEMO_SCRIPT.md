# Ghost Lattice — 90-Second Demo Script

## Mission: Adaptive ISR + Self-Healing Communications + Deception

Scenario `mission_001` — 6 mixed-vendor drones, coastal industrial environment, 3 disruptions.

---

## The Story

One operator issues a single search directive. Six drones from three vendors self-organize, adapt to jamming and node loss, and complete the mission with minimal human intervention.

---

## Timeline

### 0:00–0:15 — Operator Sets Mission Intent

**What the audience sees:**
- Operator console: search region (sector_red) highlighted on map
- Constraints displayed: low-signature, no-fly zone marked, role reassignment permitted
- One button press: "Execute Mission"

**What's happening underneath:**
- Mission intent compiled into task primitives (search, relay, track objectives)
- Fleet registry loaded: 6 vehicles, 3 vendors, different payloads and capabilities
- Scoring contract established

**Key message:** The operator defines *what*, not *how*.

---

### 0:15–0:35 — Swarm Fans Out

**What the audience sees:**
- 3D pane: 6 drones lift off from base, spread toward sector_red
- Role labels appear: alpha_1=scout, alpha_2=scout, bravo_1=decoy, bravo_2=tracker, charlie_1=relay, charlie_2=scout
- Network pane: full mesh — all edges green, one connected subgraph
- Trails begin forming

**What's happening underneath:**
- Utility-based role allocation runs: each vehicle self-assesses health, position, sensor suitability, battery cost
- charlie_1 (best comms range: 1000m, has relay payload) claims relay role
- bravo_1 (has EW emitter) claims decoy role
- Search pattern generated for scouts

**Key message:** Roles are earned by capability, not assigned by a human.

---

### 0:30 — Mobile Emitter Appears

**What the audience sees:**
- 3D pane: orange dot appears in sector_red (mobile_emitter_1)
- bravo_2 begins tracking — trail curves toward emitter
- alpha_2 shifts to reinforce relay backbone

**What's happening underneath:**
- bravo_2 detects emitter, role stays tracker (already assigned)
- Objective obj_track activates
- alpha_2's utility for relay increases as bravo_2 moves deeper into sector

---

### 0:35–0:50 — Steady State Operations

**What the audience sees:**
- Search coverage percentage climbing in metrics overlay (40% → 55%)
- Network pane: stable green mesh
- Emitter track line extending
- Operator console: zero interventions, all objectives in_progress

**Key message:** The swarm works without micromanagement.

---

### 0:50–1:10 — DDIL Event Cascade

#### t=60 (0:50 in demo time): Operator Redirect
**What the audience sees:**
- Operator console: one command — "Focus search north"
- alpha_1 and charlie_2 adjust search pattern northward
- Intervention counter: 1

#### t=120 (1:00 in demo time): Jammer Activates
**What the audience sees:**
- 3D pane: red jammer zone appears (zone_j1, radius 150m)
- Network pane: edges between bravo_1/bravo_2 and the main group go yellow → red → disappear
- Two subgraphs form: [alpha_1, alpha_2, charlie_1] and [bravo_1, charlie_2]
- Role labels flash: partition detected

**What's happening underneath:**
- DDIL engine: link quality drops as jammer field attenuates signals
- Partition detector fires: two disconnected subgraphs identified
- Event: `scenario_event{jammer_on}` logged

#### t=180 (1:05 in demo time): Drone Loss
**What the audience sees:**
- bravo_2 icon turns red, descends — "POWER LOSS"
- bravo_2 disappears from network pane
- Active vehicle count: 6 → 5

**What's happening underneath:**
- bravo_2 PX4 instance stopped by scenario engine
- Event: `scenario_event{drone_fail, bravo_2}`
- Track continuity on mobile emitter breaks

---

### 1:10–1:25 — Autonomous Recovery

**What the audience sees:**
- Role reassignment cascade:
  - charlie_2: scout → relay (fills connectivity gap)
  - alpha_2: scout → tracker (picks up emitter tracking from lost bravo_2)
  - bravo_1: decoy → scout (rebalances search coverage)
- Network pane: new edges form as charlie_2 bridges the partition
- Subgraphs merge (partially) — new relay chain visible
- Search coverage resumes climbing
- Emitter track resumes after ~8 second gap

**What's happening underneath:**
- Role allocator recalculates utility scores across all surviving vehicles
- charlie_2 has best position + range to bridge partition
- alpha_2 is closest to mobile emitter's last known position
- Events: multiple `role_assignment` with `reason: {trigger: "node_loss"}` and `{trigger: "partition_detected"}`

**Key message:** No human told the swarm what to do. It figured it out.

---

### 1:25–1:30 — Outcome Panel

**What the audience sees (scorecard):**

| Metric | Swarm | Single Agent | Delta |
|--------|-------|-------------|-------|
| Search Coverage | 72% | 31% | +41% |
| Relay Uptime | 88% | N/A | — |
| Track Continuity | 52s | 18s | +34s |
| Recovery Time (partition) | 12s | N/A | — |
| Recovery Time (node loss) | 8s | N/A | — |
| Operator Interventions | 1 | 3 | -2 |
| Mission Completion | 78% | 25% | +53% |

**Key message:** The swarm is measurably better than a single drone, and it degrades gracefully instead of failing catastrophically.

---

## Replay Controls Available to Evaluator

After the 90-second narrative:
- **Scrub** to any moment in the timeline
- **Click any drone** for its state panel (role, battery, health, decision trace)
- **"Show role changes"** — highlight all role reassignment events
- **"Show network health"** — overlay link quality heatmap
- **"Why did this happen?"** — click any event for the autonomy decision trace
- **Compare to baseline** — side-by-side single-agent run

---

## Talking Points

1. **One operator, six drones, three vendors** — real heterogeneity, not one vendor pretending
2. **Roles earned, not assigned** — utility-based allocation means the best vehicle for each role claims it
3. **DDIL is explicit** — jammer zones, link quality, partitions are modeled, not hand-waved
4. **Recovery is autonomous** — operator didn't fix the partition or reassign roles
5. **Quantitative** — every claim is backed by event data and metrics
6. **Replayable** — this isn't a scripted animation, it's a recorded simulation run
