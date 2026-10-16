import type { DisciplineId } from "../types.ts";

// Curated free-resource catalog. Every entry is human-curated (not inferred),
// links to the provider's own site, and records what kind of "free" it is.
// Reachability is checked by the in-app link checker and by the
// link-check GitHub Action; neither changes the curated access notes.

export type ResourceKind =
  | "course"
  | "interactive"
  | "docs"
  | "book"
  | "video"
  | "simulator"
  | "wargame"
  | "tool";

export type Access =
  /** No account needed for the learning material. */
  | "free"
  /** Free, but you sign up for an account to use it. */
  | "free-account"
  /** Core material is free; some parts (certificates, extra courses) cost money. */
  | "free-core";

export type Level = "beginner" | "intermediate" | "advanced" | "all";

export interface Resource {
  id: string;
  title: string;
  provider: string;
  url: string;
  kind: ResourceKind;
  access: Access;
  accessNote: string;
  disciplines: DisciplineId[];
  concepts: string[];
  level: Level;
  /** Curated rating of how much doing (not watching) it involves: 1 low, 3 high. */
  handsOn: 1 | 2 | 3;
  prerequisites: string;
  /** Present when the material tracks a fast-moving tool; says which version to look for. */
  versionNote?: string;
  why: string;
  curatedOn: string;
}

export const KIND_LABEL: Record<ResourceKind, string> = {
  course: "Course",
  interactive: "Interactive",
  docs: "Documentation",
  book: "Free book",
  video: "Video channel",
  simulator: "Simulator",
  wargame: "Wargame / CTF",
  tool: "Tool",
};

export const ACCESS_LABEL: Record<Access, string> = {
  free: "Free, no account",
  "free-account": "Free with account",
  "free-core": "Free core, paid extras",
};

const CURATED = "2026-10-16";

export const RESOURCES: Resource[] = [
  {
    id: "cs50", title: "CS50x: Introduction to Computer Science", provider: "Harvard University", url: "https://cs50.harvard.edu/x/",
    kind: "course", access: "free-core", accessNote: "Lectures, notes and problem sets are free; a verified certificate via edX costs money.",
    disciplines: ["programming", "algorithms", "data"], concepts: ["prog-basics", "c-lang", "pointers", "data-structures", "sql", "python"],
    level: "beginner", handsOn: 3, prerequisites: "None.", why: "Weekly problem sets with an automated checker; you write real C, Python and SQL.", curatedOn: CURATED,
  },
  {
    id: "odin", title: "The Odin Project", provider: "The Odin Project", url: "https://www.theodinproject.com/",
    kind: "course", access: "free", accessNote: "Entirely free and open source; an account only tracks progress.",
    disciplines: ["programming", "devops"], concepts: ["git", "http", "prog-basics", "testing"],
    level: "beginner", handsOn: 3, prerequisites: "None.", versionNote: "Web tooling moves fast; check lesson dates.", why: "Project-first web development curriculum where you set up a real environment.", curatedOn: CURATED,
  },
  {
    id: "exercism", title: "Exercism", provider: "Exercism", url: "https://exercism.org/",
    kind: "interactive", access: "free-account", accessNote: "Free for everyone; donations optional.",
    disciplines: ["programming", "algorithms"], concepts: ["prog-basics", "testing", "rust-lang", "c-lang", "python"],
    level: "all", handsOn: 3, prerequisites: "Basic syntax of the chosen language.", why: "Test-driven exercises in 70+ languages, solvable locally with their CLI, plus optional human mentoring.", curatedOn: CURATED,
  },
  {
    id: "linux-journey", title: "Linux Journey (now hosted by LabEx)", provider: "LabEx", url: "https://labex.io/linuxjourney",
    kind: "course", access: "free-core", accessNote: "linuxjourney.com now redirects here. The lessons are readable; LabEx also sells paid plans, so check what a lab needs before signing up.",
    disciplines: ["os"], concepts: ["cli", "linux-fs", "processes", "logs"],
    level: "beginner", handsOn: 2, prerequisites: "None.", why: "Short, well-ordered lessons on the Linux command line and system internals.", curatedOn: CURATED,
  },
  {
    id: "overthewire", title: "OverTheWire Wargames (Bandit first)", provider: "OverTheWire", url: "https://overthewire.org/wargames/",
    kind: "wargame", access: "free", accessNote: "Free; you connect over SSH to their purpose-built servers, which is authorized use.",
    disciplines: ["security", "os"], concepts: ["cli", "linux-fs", "processes"],
    level: "beginner", handsOn: 3, prerequisites: "An SSH client (built into Windows 11).", why: "Each level is a small puzzle on a real Linux box built for exactly this.", curatedOn: CURATED,
  },
  {
    id: "portswigger", title: "Web Security Academy", provider: "PortSwigger", url: "https://portswigger.net/web-security",
    kind: "interactive", access: "free-account", accessNote: "Free with a PortSwigger account. Labs are hosted, intentionally vulnerable targets you are authorized to attack.",
    disciplines: ["security"], concepts: ["web-vulns", "http", "secure-coding"],
    level: "all", handsOn: 3, prerequisites: "HTTP basics.", why: "The best free hands-on web security labs, with clear written explanations.", curatedOn: CURATED,
  },
  {
    id: "picoctf", title: "picoCTF", provider: "Carnegie Mellon University", url: "https://picoctf.org/",
    kind: "wargame", access: "free-account", accessNote: "Free with an account; the practice gym is open year-round.",
    disciplines: ["security"], concepts: ["classical-crypto", "web-vulns", "log-forensics", "assembly"],
    level: "beginner", handsOn: 3, prerequisites: "None.", why: "Beginner-friendly CTF challenges across crypto, forensics, web and reversing.", curatedOn: CURATED,
  },
  {
    id: "nand2tetris", title: "Nand2Tetris", provider: "Nisan & Schocken", url: "https://www.nand2tetris.org/",
    kind: "course", access: "free", accessNote: "Book chapters for part 1, software tools and projects are free on the site.",
    disciplines: ["hardware", "programming", "retro"], concepts: ["logic-gates", "adders", "sequential-logic", "cpu-cycle", "isa", "assembly", "compilers"],
    level: "intermediate", handsOn: 3, prerequisites: "Some programming.", why: "Build a computer from NAND gates up to a compiler, one working project at a time.", curatedOn: CURATED,
  },
  {
    id: "osdev", title: "OSDev Wiki", provider: "OSDev.org community", url: "https://wiki.osdev.org/",
    kind: "docs", access: "free", accessNote: "Free community wiki.",
    disciplines: ["os", "hardware"], concepts: ["syscalls", "virtual-memory", "assembly", "scheduling"],
    level: "advanced", handsOn: 2, prerequisites: "C and assembly basics.", why: "The reference for writing your own kernel: bootloaders, paging, interrupts.", curatedOn: CURATED,
  },
  {
    id: "wokwi", title: "Wokwi", provider: "Wokwi", url: "https://wokwi.com/",
    kind: "simulator", access: "free-core", accessNote: "Browser simulator usable free; some advanced/private features are paid.",
    disciplines: ["embedded", "electronics"], concepts: ["mcu-basics", "gpio", "interrupts", "uart", "i2c-spi"],
    level: "all", handsOn: 3, prerequisites: "None.", why: "Simulates Arduino, ESP32 and Pi Pico with parts and a serial monitor, so no hardware is needed.", curatedOn: CURATED,
  },
  {
    id: "falstad", title: "Falstad Circuit Simulator", provider: "Paul Falstad", url: "https://www.falstad.com/circuit/",
    kind: "simulator", access: "free", accessNote: "Free in the browser; an offline desktop build is also offered on the site.",
    disciplines: ["electronics"], concepts: ["ohms-law", "series-parallel", "rc-circuits", "diodes-leds", "transistors", "logic-gates"],
    level: "all", handsOn: 3, prerequisites: "None.", why: "Animated current flow makes circuits visible; great for RC timing and dividers.", curatedOn: CURATED,
  },
  {
    id: "khan", title: "Khan Academy (Math & Physics)", provider: "Khan Academy", url: "https://www.khanacademy.org/",
    kind: "course", access: "free", accessNote: "Free nonprofit; an account saves progress.",
    disciplines: ["math", "electronics"], concepts: ["linear-algebra", "calculus-basics", "probability", "ohms-law"],
    level: "beginner", handsOn: 2, prerequisites: "None.", why: "Practice problems with instant feedback for the math under computing.", curatedOn: CURATED,
  },
  {
    id: "3b1b", title: "3Blue1Brown", provider: "Grant Sanderson", url: "https://www.3blue1brown.com/",
    kind: "video", access: "free", accessNote: "Free videos and written lessons.",
    disciplines: ["math", "ai"], concepts: ["linear-algebra", "calculus-basics", "gradient-descent", "probability"],
    level: "all", handsOn: 1, prerequisites: "None.", why: "Visual intuition for linear algebra, calculus and neural networks. Watch, then do a mission.", curatedOn: CURATED,
  },
  {
    id: "godot-docs", title: "Godot Engine Documentation (stable)", provider: "Godot Engine", url: "https://docs.godotengine.org/en/stable/",
    kind: "docs", access: "free", accessNote: "Free and open source.",
    disciplines: ["gamedev"], concepts: ["godot", "game-loop", "tilemaps", "kinematics"],
    level: "all", handsOn: 2, prerequisites: "None.", versionNote: "Use docs matching your Godot 4.x version; Godot 3 tutorials use different APIs.", why: "Official manual and 'Your first 2D game' tutorial.", curatedOn: CURATED,
  },
  {
    id: "gdquest", title: "GDQuest", provider: "GDQuest", url: "https://www.gdquest.com/",
    kind: "course", access: "free-core", accessNote: "Many free tutorials and open-source demos; full courses are paid.",
    disciplines: ["gamedev"], concepts: ["godot", "state-machines", "procgen"],
    level: "all", handsOn: 2, prerequisites: "None.", versionNote: "Check that a tutorial targets Godot 4.", why: "High-quality Godot tutorials and free 'Learn GDScript from Zero' app.", curatedOn: CURATED,
  },
  {
    id: "netacad", title: "Cisco Networking Academy", provider: "Cisco", url: "https://www.netacad.com/",
    kind: "course", access: "free-account", accessNote: "Many self-paced courses free with an account; some instructor-led courses are not.",
    disciplines: ["networking", "security"], concepts: ["osi-tcpip", "ip-addressing", "routing", "tcp-udp"],
    level: "beginner", handsOn: 2, prerequisites: "None.", versionNote: "Course catalog changes; confirm a course is listed as free before enrolling.", why: "Structured networking courses with Packet Tracer labs.", curatedOn: CURATED,
  },
  {
    id: "wireshark-docs", title: "Wireshark User's Guide", provider: "Wireshark Foundation", url: "https://www.wireshark.org/docs/",
    kind: "docs", access: "free", accessNote: "Free and open source.",
    disciplines: ["networking", "security"], concepts: ["packet-analysis", "tcp-udp", "dns", "http"],
    level: "all", handsOn: 2, prerequisites: "None.", versionNote: "Display-filter syntax is stable; UI menus move between major versions.", why: "Official guide to capture and display filters.", curatedOn: CURATED,
  },
  {
    id: "mit-ocw", title: "MIT OpenCourseWare", provider: "MIT", url: "https://ocw.mit.edu/",
    kind: "course", access: "free", accessNote: "Free course materials, no account required.",
    disciplines: ["math", "programming", "hardware", "algorithms"], concepts: ["discrete-math", "linear-algebra", "complexity", "cpu-cycle"],
    level: "intermediate", handsOn: 2, prerequisites: "Varies by course.", why: "Full university courses: 6.006 algorithms, 18.06 linear algebra, 6.004 computation structures.", curatedOn: CURATED,
  },
  {
    id: "fcc", title: "freeCodeCamp", provider: "freeCodeCamp.org", url: "https://www.freecodecamp.org/",
    kind: "interactive", access: "free", accessNote: "Free nonprofit; an account saves progress and certifications.",
    disciplines: ["programming", "data", "ai"], concepts: ["prog-basics", "python", "sql", "http"],
    level: "beginner", handsOn: 3, prerequisites: "None.", why: "In-browser coding challenges plus certification projects you build yourself.", curatedOn: CURATED,
  },
  {
    id: "missing-semester", title: "The Missing Semester of Your CS Education", provider: "MIT", url: "https://missing.csail.mit.edu/",
    kind: "course", access: "free", accessNote: "Free lecture notes and videos.",
    disciplines: ["os", "devops", "programming"], concepts: ["cli", "git", "debugging"],
    level: "beginner", handsOn: 3, prerequisites: "None.", why: "Shell, Vim, Git, debugging and profiling, with exercises after each lecture.", curatedOn: CURATED,
  },
  {
    id: "ostep", title: "Operating Systems: Three Easy Pieces", provider: "Remzi & Andrea Arpaci-Dusseau", url: "https://pages.cs.wisc.edu/~remzi/OSTEP/",
    kind: "book", access: "free", accessNote: "Chapters are free PDFs from the authors; printed copies cost money.",
    disciplines: ["os"], concepts: ["processes", "virtual-memory", "scheduling", "syscalls", "signals-ipc"],
    level: "intermediate", handsOn: 2, prerequisites: "C basics.", why: "Readable OS textbook with homework simulators you run yourself.", curatedOn: CURATED,
  },
  {
    id: "beej-net", title: "Beej's Guide to Network Programming", provider: "Brian 'Beej' Hall", url: "https://beej.us/guide/bgnet/",
    kind: "book", access: "free", accessNote: "Free online and as PDF.",
    disciplines: ["networking", "programming"], concepts: ["sockets", "tcp-udp", "c-lang"],
    level: "intermediate", handsOn: 3, prerequisites: "C basics.", why: "The classic, friendly guide to the sockets API.", curatedOn: CURATED,
  },
  {
    id: "crafting-interpreters", title: "Crafting Interpreters", provider: "Robert Nystrom", url: "https://craftinginterpreters.com/",
    kind: "book", access: "free", accessNote: "Free to read online; print and ebook editions cost money.",
    disciplines: ["programming"], concepts: ["parsing", "compilers"],
    level: "intermediate", handsOn: 3, prerequisites: "Comfortable in one language.", why: "Build two complete interpreters, step by step, with every line of code shown.", curatedOn: CURATED,
  },
  {
    id: "rust-book", title: "The Rust Programming Language", provider: "Rust Project", url: "https://doc.rust-lang.org/book/",
    kind: "book", access: "free", accessNote: "Free official book.",
    disciplines: ["programming"], concepts: ["rust-lang"],
    level: "beginner", handsOn: 2, prerequisites: "Some programming.", versionNote: "Tracks the current stable Rust edition.", why: "The official guide; each chapter ends in a small project.", curatedOn: CURATED,
  },
  {
    id: "python-docs", title: "Python 3 Documentation", provider: "Python Software Foundation", url: "https://docs.python.org/3/",
    kind: "docs", access: "free", accessNote: "Free official docs.",
    disciplines: ["programming"], concepts: ["python", "sockets", "bytes-io"],
    level: "all", handsOn: 1, prerequisites: "None.", versionNote: "Select your installed 3.x version in the docs version picker.", why: "Library reference for socket, struct, ipaddress, hashlib, sqlite3.", curatedOn: CURATED,
  },
  {
    id: "godbolt", title: "Compiler Explorer", provider: "Matt Godbolt", url: "https://godbolt.org/",
    kind: "tool", access: "free", accessNote: "Free in the browser.",
    disciplines: ["programming", "hardware"], concepts: ["assembly", "compilers", "isa"],
    level: "intermediate", handsOn: 3, prerequisites: "C or another compiled language.", why: "See the assembly your code becomes, live, across compilers and flags.", curatedOn: CURATED,
  },
  {
    id: "circuitverse", title: "CircuitVerse", provider: "CircuitVerse", url: "https://circuitverse.org/",
    kind: "simulator", access: "free", accessNote: "Free open-source digital logic simulator; an account saves circuits.",
    disciplines: ["hardware", "electronics"], concepts: ["logic-gates", "adders", "sequential-logic"],
    level: "all", handsOn: 3, prerequisites: "None.", why: "Drag-and-drop gates, subcircuits and truth-table checking in the browser.", curatedOn: CURATED,
  },
  {
    id: "ben-eater", title: "Ben Eater (breadboard computers)", provider: "Ben Eater", url: "https://eater.net/",
    kind: "video", access: "free", accessNote: "Free videos; parts kits are sold separately.",
    disciplines: ["hardware", "electronics", "retro", "networking"], concepts: ["cpu-cycle", "sequential-logic", "homebrew-cpu", "signals", "osi-tcpip"],
    level: "intermediate", handsOn: 2, prerequisites: "None.", why: "Builds an 8-bit computer and a 6502 computer on breadboards, explaining every wire.", curatedOn: CURATED,
  },
  {
    id: "sqlbolt", title: "SQLBolt", provider: "SQLBolt", url: "https://sqlbolt.com/",
    kind: "interactive", access: "free", accessNote: "Free, no account.",
    disciplines: ["data"], concepts: ["sql"],
    level: "beginner", handsOn: 3, prerequisites: "None.", why: "Short interactive SQL lessons that run in the browser.", curatedOn: CURATED,
  },
  {
    id: "sqlite-docs", title: "SQLite Documentation", provider: "SQLite", url: "https://www.sqlite.org/docs.html",
    kind: "docs", access: "free", accessNote: "Free; SQLite is public domain.",
    disciplines: ["data"], concepts: ["sql", "indexes", "storage-engines"],
    level: "all", handsOn: 1, prerequisites: "None.", why: "Includes the query planner docs and the file-format spec.", curatedOn: CURATED,
  },
  {
    id: "cryptopals", title: "The Cryptopals Crypto Challenges", provider: "Cryptopals", url: "https://cryptopals.com/",
    kind: "wargame", access: "free", accessNote: "Free; all challenges run on your own machine.",
    disciplines: ["security", "math"], concepts: ["classical-crypto", "symmetric-crypto", "bytes-io"],
    level: "intermediate", handsOn: 3, prerequisites: "Comfortable programming.", why: "Break real crypto constructions yourself, offline.", curatedOn: CURATED,
  },
  {
    id: "arduino-docs", title: "Arduino Documentation", provider: "Arduino", url: "https://docs.arduino.cc/",
    kind: "docs", access: "free", accessNote: "Free official docs.",
    disciplines: ["embedded"], concepts: ["mcu-basics", "gpio", "interrupts", "uart", "nonblocking-timing"],
    level: "beginner", handsOn: 2, prerequisites: "None.", versionNote: "Arduino IDE 2.x is current; older guides show IDE 1.8 menus.", why: "Language reference (millis, attachInterrupt, Serial) and built-in examples.", curatedOn: CURATED,
  },
  {
    id: "rpi-docs", title: "Raspberry Pi Documentation", provider: "Raspberry Pi Ltd", url: "https://www.raspberrypi.com/documentation/",
    kind: "docs", access: "free", accessNote: "Free official docs.",
    disciplines: ["embedded", "os"], concepts: ["sbc-linux", "gpio", "i2c-spi"],
    level: "beginner", handsOn: 2, prerequisites: "None.", versionNote: "Raspberry Pi OS releases change GPIO libraries; check your OS version.", why: "Setup, GPIO pinout, configuration and the Linux side of the Pi.", curatedOn: CURATED,
  },
  {
    id: "juice-shop", title: "OWASP Juice Shop", provider: "OWASP", url: "https://owasp.org/www-project-juice-shop/",
    kind: "wargame", access: "free", accessNote: "Free and open source; you run it yourself on localhost.",
    disciplines: ["security"], concepts: ["web-vulns", "secure-coding", "http"],
    level: "all", handsOn: 3, prerequisites: "Docker or Node.js to run it locally.", versionNote: "Run the current container image; challenge list changes between releases.", why: "A deliberately insecure shop you run locally and attack legally.", curatedOn: CURATED,
  },
  {
    id: "red-blob", title: "Red Blob Games", provider: "Amit Patel", url: "https://www.redblobgames.com/",
    kind: "interactive", access: "free", accessNote: "Free interactive articles.",
    disciplines: ["algorithms", "gamedev"], concepts: ["graph-search", "shortest-paths", "procgen"],
    level: "all", handsOn: 2, prerequisites: "None.", why: "Interactive explanations of BFS, A*, hex grids and noise.", curatedOn: CURATED,
  },
  {
    id: "docker-docs", title: "Docker Docs: Get started", provider: "Docker", url: "https://docs.docker.com/get-started/",
    kind: "docs", access: "free", accessNote: "Docs are free; Docker Desktop is free for personal use (paid for larger companies).",
    disciplines: ["devops"], concepts: ["containers"],
    level: "beginner", handsOn: 2, prerequisites: "Command line basics.", versionNote: "Docker Desktop and Compose versions change; prefer 'docker compose' (v2) syntax.", why: "Official walkthrough for images, containers and multi-stage builds.", curatedOn: CURATED,
  },
  {
    id: "mdn-http", title: "MDN Web Docs: HTTP", provider: "Mozilla", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP",
    kind: "docs", access: "free", accessNote: "Free, no account needed.",
    disciplines: ["networking", "security"], concepts: ["http"],
    level: "all", handsOn: 1, prerequisites: "None.", why: "Clear reference for methods, headers, status codes and cookies.", curatedOn: CURATED,
  },
  {
    id: "karpathy-zth", title: "Neural Networks: Zero to Hero", provider: "Andrej Karpathy", url: "https://karpathy.ai/zero-to-hero.html",
    kind: "video", access: "free", accessNote: "Free videos and code.",
    disciplines: ["ai"], concepts: ["gradient-descent", "perceptron", "ml-basics"],
    level: "intermediate", handsOn: 3, prerequisites: "Python, some calculus.", why: "Builds backpropagation and small language models from scratch, in code you type along with.", curatedOn: CURATED,
  },
];

export const RESOURCE_BY_ID: ReadonlyMap<string, Resource> = new Map(RESOURCES.map((r) => [r.id, r]));

export interface ResourceFilter {
  text?: string;
  discipline?: DisciplineId | "";
  kind?: ResourceKind | "";
  access?: Access | "";
  level?: Level | "";
  minHandsOn?: number;
  concept?: string;
  /** Hide resources whose last link check failed. */
  hideBroken?: boolean;
}

export interface LinkStatus {
  ok: boolean;
  status: number | null;
  checkedAt: string;
  finalUrl?: string;
  error?: string;
}

export function filterResources(
  list: readonly Resource[],
  f: ResourceFilter,
  status: ReadonlyMap<string, LinkStatus> = new Map(),
): Resource[] {
  const q = (f.text ?? "").trim().toLowerCase();
  const words = q ? q.split(/\s+/) : [];
  return list.filter((r) => {
    if (f.discipline && !r.disciplines.includes(f.discipline)) return false;
    if (f.kind && r.kind !== f.kind) return false;
    if (f.access && r.access !== f.access) return false;
    if (f.level && r.level !== f.level && r.level !== "all") return false;
    if (f.minHandsOn && r.handsOn < f.minHandsOn) return false;
    if (f.concept && !r.concepts.includes(f.concept)) return false;
    if (f.hideBroken && status.get(r.id)?.ok === false) return false;
    if (words.length) {
      const hay = `${r.title} ${r.provider} ${r.why} ${r.concepts.join(" ")} ${r.disciplines.join(" ")}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

/** Hosts the link checker may contact: exactly the catalog's own hosts. */
export function resourceHosts(list: readonly Resource[] = RESOURCES): string[] {
  return [...new Set(list.map((r) => new URL(r.url).host))].sort();
}
