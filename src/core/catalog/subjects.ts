import type { Concept, Discipline, DisciplineId } from "../types.ts";

// The subject universe. Disciplines are regions; concepts are the nodes inside
// them; `prereqs` are the edges. Cross-discipline edges are what make the map
// interesting: binary -> logic gates -> CPU -> assembly -> compilers -> OS.
// Add concepts freely; the test suite checks every edge points somewhere real
// and that the graph has no cycles.

export const DISCIPLINES: Discipline[] = [
  { id: "programming", name: "Programming", code: "PRG", blurb: "Languages, debugging, testing, compilers and how programs are put together.", neighbors: ["algorithms", "os", "data", "gamedev"] },
  { id: "algorithms", name: "Algorithms & Data Structures", code: "ALG", blurb: "Searching, sorting, graphs and the structures that make programs fast.", neighbors: ["programming", "math", "gamedev", "ai"] },
  { id: "os", name: "Operating Systems & Linux", code: "OPS", blurb: "Processes, memory, filesystems, system calls and the Linux userland.", neighbors: ["programming", "hardware", "security", "devops"] },
  { id: "security", name: "Cybersecurity", code: "SEC", blurb: "Defensive monitoring, forensics, crypto and secure programming, in authorized labs only.", neighbors: ["networking", "os", "programming", "math"] },
  { id: "hardware", name: "Computer Architecture", code: "ARC", blurb: "CPUs, registers, memory, caches, instruction sets and binary logic.", neighbors: ["electronics", "os", "embedded", "retro"] },
  { id: "embedded", name: "Embedded Systems", code: "EMB", blurb: "Microcontrollers, GPIO, buses, interrupts and firmware.", neighbors: ["electronics", "hardware", "networking"] },
  { id: "networking", name: "Networking", code: "NET", blurb: "TCP/IP, DNS, routing, packets and network programming.", neighbors: ["security", "os", "devops", "embedded"] },
  { id: "math", name: "Mathematics", code: "MTH", blurb: "Binary arithmetic, logic, discrete math, linear algebra and probability.", neighbors: ["algorithms", "hardware", "ai", "gamedev"] },
  { id: "electronics", name: "Physics & Electronics", code: "PHY", blurb: "Voltage, current, circuits, signals and the physics under the hardware.", neighbors: ["hardware", "embedded", "math"] },
  { id: "gamedev", name: "Game Development", code: "GAM", blurb: "Engines, game loops, physics, procedural generation and graphics.", neighbors: ["programming", "math", "algorithms"] },
  { id: "data", name: "Databases & Data", code: "DAT", blurb: "SQL, indexes, storage engines and data modelling.", neighbors: ["programming", "algorithms", "devops"] },
  { id: "devops", name: "DevOps & Infrastructure", code: "OPX", blurb: "Containers, automation, CI and infrastructure you can rebuild.", neighbors: ["os", "networking", "data"] },
  { id: "ai", name: "AI & Machine Learning", code: "AIM", blurb: "Learning from data, from a single perceptron up.", neighbors: ["math", "algorithms", "data"] },
  { id: "retro", name: "Retro & Homebrew", code: "RET", blurb: "Old machines, emulators, homebrew computers and technical history.", neighbors: ["hardware", "electronics", "programming"] },
];

const c = (
  id: string,
  discipline: DisciplineId,
  name: string,
  summary: string,
  prereqs: string[] = [],
  volatile = false,
): Concept => ({ id, discipline, name, summary, prereqs, volatile });

export const CONCEPTS: Concept[] = [
  // Mathematics
  c("binary", "math", "Binary & hexadecimal", "Base-2 and base-16 number systems and converting between bases."),
  c("twos-complement", "math", "Two's complement", "How CPUs represent negative integers and why overflow happens.", ["binary"]),
  c("boolean-algebra", "math", "Boolean algebra", "AND/OR/NOT, truth tables, De Morgan's laws, simplification.", ["binary"]),
  c("modular-arithmetic", "math", "Modular arithmetic", "Clock arithmetic; the basis of hashing and cryptography.", ["binary"]),
  c("discrete-math", "math", "Sets, relations & graphs", "The discrete structures behind data structures and networks.", []),
  c("probability", "math", "Probability & statistics", "Distributions, expectation, frequency analysis.", []),
  c("linear-algebra", "math", "Vectors & matrices", "Vector arithmetic, dot products, matrix transforms.", []),
  c("calculus-basics", "math", "Rates of change", "Derivatives and integrals as they show up in physics and learning.", ["linear-algebra"]),
  c("info-theory", "math", "Information theory", "Entropy, bits of information, compression limits.", ["probability", "binary"]),

  // Physics & Electronics
  c("ohms-law", "electronics", "Ohm's law & power", "V = IR, P = VI, and what they mean for real parts.", []),
  c("series-parallel", "electronics", "Series & parallel circuits", "Voltage dividers, current splitting, equivalent resistance.", ["ohms-law"]),
  c("rc-circuits", "electronics", "Capacitors & RC timing", "Charging curves, time constants, filtering.", ["series-parallel", "calculus-basics"]),
  c("diodes-leds", "electronics", "Diodes & LEDs", "Forward voltage, current limiting, polarity.", ["ohms-law"]),
  c("transistors", "electronics", "Transistors as switches", "How a MOSFET or BJT turns a small signal into a big one, and into logic.", ["diodes-leds"]),
  c("signals", "electronics", "Digital signals & timing", "Logic levels, clocks, rise times, debouncing.", ["rc-circuits"]),

  // Computer Architecture
  c("logic-gates", "hardware", "Logic gates", "Gates built from transistors; any function from NAND.", ["boolean-algebra", "transistors"]),
  c("adders", "hardware", "Adders & ALUs", "Half/full adders, ripple carry, flags, the arithmetic logic unit.", ["logic-gates", "twos-complement"]),
  c("sequential-logic", "hardware", "Latches, flip-flops & registers", "Circuits with memory; clocked state.", ["logic-gates", "signals"]),
  c("cpu-cycle", "hardware", "Fetch-decode-execute", "How a CPU steps through instructions with a program counter.", ["adders", "sequential-logic"]),
  c("isa", "hardware", "Instruction set architecture", "Opcodes, operands, addressing modes, the hardware/software contract.", ["cpu-cycle"]),
  c("assembly", "hardware", "Assembly language", "Reading and writing instructions by hand; calling conventions.", ["isa"]),
  c("memory-hierarchy", "hardware", "Caches & memory hierarchy", "Registers, L1-L3, RAM, locality and why access patterns matter.", ["cpu-cycle"]),

  // Programming
  c("prog-basics", "programming", "Programming fundamentals", "Variables, control flow, functions; in any language.", []),
  c("python", "programming", "Python", "Scripting, standard library, quick experiments.", ["prog-basics"], true),
  c("c-lang", "programming", "C", "Manual memory, pointers, the language under most systems.", ["prog-basics"]),
  c("rust-lang", "programming", "Rust", "Ownership, borrowing and fearless systems programming.", ["prog-basics"], true),
  c("pointers", "programming", "Pointers & memory layout", "Addresses, stack vs heap, lifetimes.", ["c-lang", "binary"]),
  c("debugging", "programming", "Debugging", "Reproduce, isolate, hypothesise, verify. Debuggers and print tracing.", ["prog-basics"]),
  c("testing", "programming", "Automated testing", "Unit tests, test cases from specs, regression tests.", ["prog-basics"]),
  c("parsing", "programming", "Parsing & interpreters", "Tokenising, grammars, turning text into structures and running it.", ["prog-basics", "data-structures"]),
  c("compilers", "programming", "Compilers", "From source to machine code: front end, optimisation, codegen.", ["parsing", "assembly"]),
  c("bytes-io", "programming", "Bytes, encodings & binary I/O", "Packing and unpacking binary formats, endianness, text encodings.", ["binary", "prog-basics"]),

  // Algorithms
  c("data-structures", "algorithms", "Core data structures", "Arrays, lists, stacks, queues, hash maps, trees.", ["prog-basics"]),
  c("complexity", "algorithms", "Big-O complexity", "Reasoning about how cost grows with input size.", ["data-structures"]),
  c("graph-search", "algorithms", "Graph search (BFS/DFS)", "Exploring graphs and grids; shortest paths in unweighted graphs.", ["data-structures", "discrete-math"]),
  c("shortest-paths", "algorithms", "Weighted shortest paths", "Dijkstra and A* with priority queues and heuristics.", ["graph-search", "complexity"]),
  c("procgen", "algorithms", "Procedural generation", "Seeds, noise and rules that create content.", ["graph-search"]),

  // Operating Systems
  c("cli", "os", "Command line", "Shells, pipes, redirection, finding your way around.", []),
  c("linux-fs", "os", "Linux filesystem & permissions", "The directory tree, users, groups, rwx bits.", ["cli"]),
  c("processes", "os", "Processes", "PIDs, fork/exec, parent and child, exit codes.", ["cli", "c-lang"]),
  c("syscalls", "os", "System calls", "The boundary between programs and the kernel.", ["processes"]),
  c("virtual-memory", "os", "Virtual memory", "Address spaces, pages, ASLR, the memory map of a process.", ["pointers", "processes"]),
  c("signals-ipc", "os", "Signals, pipes & IPC", "How processes talk and get interrupted.", ["processes"]),
  c("scheduling", "os", "Scheduling & threads", "Time slicing, threads, context switches.", ["processes"]),
  c("logs", "os", "System logs", "syslog/journald, auth logs, reading what the system recorded.", ["linux-fs"]),

  // Networking
  c("ip-addressing", "networking", "IPv4 addressing & subnetting", "Prefixes, masks, network/broadcast, CIDR and VLSM.", ["binary"]),
  c("osi-tcpip", "networking", "TCP/IP layers", "Link, internet, transport, application; encapsulation.", []),
  c("tcp-udp", "networking", "TCP & UDP", "Ports, handshakes, reliability vs speed.", ["osi-tcpip"]),
  c("dns", "networking", "DNS", "Names to addresses: resolvers, record types, caching, TTLs.", ["tcp-udp"]),
  c("http", "networking", "HTTP", "Requests, responses, headers, status codes, TLS on top.", ["tcp-udp"]),
  c("packet-analysis", "networking", "Packet analysis", "Capturing and reading real traffic with Wireshark/tcpdump.", ["osi-tcpip", "tcp-udp"]),
  c("sockets", "networking", "Socket programming", "Talking TCP/UDP from code; framing and concurrency.", ["tcp-udp", "prog-basics"]),
  c("routing", "networking", "Routing", "Routing tables, gateways, how packets find their way.", ["ip-addressing"]),

  // Security
  c("threat-modeling", "security", "Threat modelling", "What are we protecting, from whom, and how could it go wrong.", []),
  c("hashing", "security", "Hash functions", "One-way functions, collisions, integrity checks.", ["modular-arithmetic", "bytes-io"]),
  c("password-storage", "security", "Password storage", "Salts, slow KDFs, why fast hashes are wrong for passwords.", ["hashing"]),
  c("classical-crypto", "security", "Classical ciphers & cryptanalysis", "Caesar, Vigenere, and breaking them with statistics.", ["modular-arithmetic", "probability"]),
  c("symmetric-crypto", "security", "Modern symmetric crypto", "AES, modes, nonces, authenticated encryption.", ["classical-crypto", "bytes-io"]),
  c("log-forensics", "security", "Log forensics", "Reconstructing events from log evidence.", ["logs"]),
  c("incident-response", "security", "Incident response", "Detect, contain, eradicate, recover, learn.", ["log-forensics", "threat-modeling"]),
  c("web-vulns", "security", "Web vulnerabilities", "Injection, XSS, broken auth: how they work and how to fix them.", ["http", "sql"]),
  c("secure-coding", "security", "Secure programming", "Validating input, parameterised queries, least privilege.", ["web-vulns", "testing"]),
  c("hardening", "security", "System hardening", "Reducing attack surface: services, accounts, firewalls.", ["linux-fs", "tcp-udp"]),

  // Embedded
  c("mcu-basics", "embedded", "Microcontroller basics", "What an MCU is, flashing firmware, the setup/loop model.", ["prog-basics"]),
  c("gpio", "embedded", "GPIO", "Driving outputs and reading inputs; pull-ups; current limits.", ["mcu-basics", "diodes-leds"]),
  c("nonblocking-timing", "embedded", "Non-blocking timing", "millis()-style scheduling instead of delay().", ["gpio"]),
  c("interrupts", "embedded", "Interrupts", "Reacting to events immediately; ISR rules.", ["gpio", "signals"]),
  c("uart", "embedded", "UART serial", "Baud rates, framing, talking to a computer.", ["gpio", "bytes-io"]),
  c("i2c-spi", "embedded", "I2C & SPI buses", "Addressing devices, clocks, reading sensors.", ["uart"]),
  c("state-machines", "embedded", "State machines", "Modelling behaviour as states and transitions.", ["prog-basics"]),
  c("sbc-linux", "embedded", "Single-board Linux (Raspberry Pi)", "Running Linux on small hardware; sysfs, services.", ["cli", "gpio"]),

  // Game development
  c("game-loop", "gamedev", "Game loop & delta time", "Update/draw cycles and frame-rate independence.", ["prog-basics"]),
  c("kinematics", "gamedev", "Kinematics for games", "Velocity, acceleration, gravity, jump arcs.", ["calculus-basics", "game-loop"]),
  c("godot", "gamedev", "Godot engine", "Scenes, nodes, GDScript, signals.", ["game-loop"], true),
  c("tilemaps", "gamedev", "Tilemaps & level data", "Grids as levels; collision layers.", ["godot"]),
  c("transforms", "gamedev", "2D/3D transforms", "Translation, rotation, scale as matrices.", ["linear-algebra"]),

  // Data
  c("sql", "data", "SQL querying", "SELECT, JOIN, GROUP BY: asking questions of tables.", []),
  c("schema-design", "data", "Schema design", "Tables, keys, normalisation, constraints.", ["sql"]),
  c("indexes", "data", "Indexes & query plans", "B-trees, EXPLAIN, why some queries are slow.", ["sql", "complexity"]),
  c("storage-engines", "data", "Storage engines", "Logs, pages, compaction: how data hits disk.", ["indexes", "bytes-io"]),

  // DevOps
  c("git", "devops", "Git", "Commits, branches, history, recovering from mistakes.", ["cli"], true),
  c("containers", "devops", "Containers", "Images, layers, isolation; Docker/Podman.", ["processes", "linux-fs"], true),
  c("ci", "devops", "Continuous integration", "Automated builds and tests on every change.", ["git", "testing"], true),

  // AI / ML
  c("ml-basics", "ai", "Learning from data", "Features, labels, training vs test sets, overfitting.", ["probability", "linear-algebra"]),
  c("perceptron", "ai", "Perceptrons & linear classifiers", "The simplest neuron, its update rule and limits.", ["ml-basics"]),
  c("gradient-descent", "ai", "Gradient descent", "Minimising loss by following the slope.", ["perceptron", "calculus-basics"]),

  // Retro
  c("retro-machines", "retro", "Classic machines", "8-bit and 16-bit computers and what made them tick.", ["cpu-cycle"]),
  c("emulation", "retro", "Emulation", "Re-creating hardware in software, instruction by instruction.", ["isa", "data-structures"]),
  c("homebrew-cpu", "retro", "Homebrew computers", "Building a computer from chips and breadboards.", ["sequential-logic", "isa"]),
];

export const CONCEPT_BY_ID: ReadonlyMap<string, Concept> = new Map(CONCEPTS.map((x) => [x.id, x]));
export const DISCIPLINE_BY_ID: ReadonlyMap<DisciplineId, Discipline> = new Map(DISCIPLINES.map((d) => [d.id, d]));

export function conceptName(id: string): string {
  return CONCEPT_BY_ID.get(id)?.name ?? id;
}

/** Concepts that list `id` as a prerequisite (what this unlocks). */
export function dependents(id: string): Concept[] {
  return CONCEPTS.filter((x) => x.prereqs.includes(id));
}

/** All transitive prerequisites of a concept, nearest first. */
export function ancestry(id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let frontier = [id];
  while (frontier.length) {
    const nextFrontier: string[] = [];
    for (const f of frontier) {
      for (const p of CONCEPT_BY_ID.get(f)?.prereqs ?? []) {
        if (!seen.has(p)) {
          seen.add(p);
          out.push(p);
          nextFrontier.push(p);
        }
      }
    }
    frontier = nextFrontier;
  }
  return out;
}

/** Returns the ids that form a cycle, or null if the graph is acyclic. */
export function findCycle(concepts: readonly Concept[] = CONCEPTS): string[] | null {
  const byId = new Map(concepts.map((x) => [x.id, x]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    const s = state.get(id);
    if (s === 2) return null;
    if (s === 1) return stack.slice(stack.indexOf(id)).concat(id);
    state.set(id, 1);
    stack.push(id);
    for (const p of byId.get(id)?.prereqs ?? []) {
      const r = visit(p);
      if (r) return r;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const x of concepts) {
    const r = visit(x.id);
    if (r) return r;
  }
  return null;
}
