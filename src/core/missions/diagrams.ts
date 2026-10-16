// Diagram ids a mission can reference. The UI's diagram map is typed as
// Record<DiagramId, ...>, so the compiler refuses a build where any id here
// has no drawing.
export const DIAGRAM_IDS = [
  "subnet-bits",
  "dns-flow",
  "tcp-handshake",
  "socket-frames",
  "bits-adder",
  "gate-circuit",
  "cpu-datapath",
  "cache-map",
  "memory-layout",
  "fork-exec",
  "proc-tree",
  "led-circuit",
  "rc-curve",
  "morse-timing",
  "pi-dashboard",
  "maze-grid",
  "dungeon-bsp",
  "sql-schema",
  "kv-log",
  "jump-arc",
  "perceptron-plane",
  "container-layers",
  "interpreter-pipeline",
] as const;

export type DiagramId = (typeof DIAGRAM_IDS)[number];
