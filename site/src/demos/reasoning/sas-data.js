// Single source of truth for Semantic Autonomy Stack facts used by the stack page and the reasoning demos.
// Every name and number below comes from the published paper:
//   B.F. Abaza, A.-A. Staicu, C.V. Doicin, Robotics and Autonomous Systems 207 (2027) 105822
//   (frozen v4.8-review implementation, Session E campaign), and, for L0-L2, from Sensors 2026, 26, 2232.
// Keep wording close to the paper; it deliberately states the limits of each result.

export const PAPER = {
  ras: { doi: 'https://doi.org/10.1016/j.robot.2026.105822', code: 'https://github.com/bogdan-abaza/nav2-sas-vlm-memory' },
  sensors: { doi: 'https://doi.org/10.3390/s26072232', code: 'https://github.com/bogdan-abaza/nav2-semantic-route-server' },
};

// The six SAS layers (Fig. 1). `inherited` marks the L0-L2 foundation validated in the Sensors 2026 study.
export const LAYERS = [
  {
    id: 'L0', name: 'Mobile Platform', tag: 'locomotion · sensors · power · onboard compute',
    io: 'cmd_vel → sensor streams', color: '#a49d92', inherited: true,
  },
  {
    id: 'L1', name: 'Navigation Execution', tag: 'localization · route planning · path following · obstacle avoidance',
    io: 'goal / route / action → cmd_vel + action result', color: '#7ce0c3', inherited: true,
  },
  {
    id: 'L2', name: 'Perception & Semantic Map', tag: 'object detection · sensor fusion · persistent semantic map',
    io: 'LaserScan + Image + AMCL pose → semantic context', color: '#5bc0eb', inherited: true,
  },
  {
    id: 'L3', name: 'Semantic Reasoning', tag: 'L3a deterministic resolver · L3b VLM escalation + validation',
    io: 'instruction + context + digest → goal / route / action + audit entry', color: '#fa520f', inherited: false,
  },
  {
    id: 'L4', name: 'Mission Interface', tag: 'natural language + structured operator / fleet commands',
    io: 'operator NL / fleet cmd → instruction to L3', color: '#ffb547', inherited: false,
  },
  {
    id: 'L5', name: 'Operational Memory', tag: 'M1–M5 · cross-session reuse · shared-memory reuse',
    io: 'audit entries (from L3) → compiled digest', color: '#9b8cff', inherited: false,
  },
];

// Frozen v4.8-review L3a cascade (Algorithm 1). The guard precedes every step.
export const GUARD = { id: 'G', name: 'Negation / exclusion guard', short: 'Guard' };
export const STEPS = [
  { id: 'S0', name: 'Reuse a learned association', short: 'Learned association', note: 'accept if J1 ≥ 0.75 and J1 − J2 ≥ 0.10' },
  { id: 'S1', name: 'Explicit node ID', short: 'Node ID' },
  { id: 'S2', name: 'Node name match', short: 'Node name' },
  { id: 'S3', name: 'Object identifier match', short: 'Object ID' },
  { id: 'S4', name: 'Attribute scoring', short: 'Attribute' },
  { id: 'S5', name: 'Single object class', short: 'Class' },
  { id: 'S6', name: 'Class + proximity', short: 'Class + proximity' },
];

// Session E, first-resolving step over the 216 decision cycles outside the start gate (Fig. 5a).
export const SESSION_E = {
  cycles: 216,
  deterministic: 112,
  escalated: 104,
  byStep: [39, 18, 17, 8, 13, 3, 14],
  resolverMedianMs: 0.245,
  resolverMaxMs: 0.96,
  vlmMeanS: 9.785, // mean VLM evaluation time over 84 timed non-concurrent calls
  latencyRatio: 45443, // median accepted-L3b vs deterministic decision latency
  latencyRatioCI: [30428, 70512],
  sealed: { acceptable: 17, cells: 28, fast: 5, fastWrong: 1 },
  guard: { intents: 14, activations: 39, clarification: 22, actionable: 13, errors: 4 },
  confirmation: { agree: 8, trials: 8 },
  runs: { valid: 199, terminalMiss: 1 },
};

// M1-M5 scoped operational memory (Section 5.1, Fig. 3a).
export const MEMORY = [
  { id: 'M1', name: 'Environment', detail: 'entities · visit counts · arrival rate', scope: 'shared' },
  { id: 'M2', name: 'Temporal patterns', detail: 'recurring scene descriptions · confidence', scope: 'shared' },
  { id: 'M3', name: 'Learned instruction–node associations', detail: 'instruction key → destination · matched at Step 0', scope: 'shared' },
  { id: 'M4', name: 'Platform capabilities', detail: 'hardware · sensors · configuration', scope: 'platform' },
  { id: 'M5', name: 'Task history', detail: 'one record per decision, platform-tagged', scope: 'platform' },
];

// M3 promotion gate and the three Session E candidates (Fig. 6a). Each was observed four times.
export const GATE = { minFrequency: 3, minConsistency: 0.8 };
export const CANDIDATES = [
  { key: 'wet_gloves', f: 4, split: '4/0', c: 1.0, promoted: true },
  { key: 'quiet_corner', f: 4, split: '3/1', c: 0.75, promoted: false },
  { key: 'deliveries', f: 4, split: '2/2', c: 0.5, promoted: false },
];
