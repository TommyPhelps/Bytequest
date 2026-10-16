import type { Rng } from "../rng.ts";
import type { GenOutput, Tier } from "../types.ts";
import { atLeast, fmt } from "./util.ts";

// ---------- Cache simulation ----------

export interface CacheConfig {
  lines: number; // total cache lines
  blockSize: number; // bytes per line
  ways: number; // 1 = direct mapped
}

export interface CacheResult {
  hits: number;
  misses: number;
  trace: { addr: number; set: number; tag: number; hit: boolean }[];
}

/** Set-associative cache with LRU replacement (ways = 1 gives direct-mapped). */
export function simulateCache(cfg: CacheConfig, addrs: readonly number[]): CacheResult {
  const sets = cfg.lines / cfg.ways;
  const store: number[][] = Array.from({ length: sets }, () => []); // most recent last
  let hits = 0;
  const trace: CacheResult["trace"] = [];
  for (const addr of addrs) {
    const block = Math.floor(addr / cfg.blockSize);
    const set = block % sets;
    const tag = Math.floor(block / sets);
    const ways = store[set];
    const at = ways.indexOf(tag);
    const hit = at >= 0;
    if (hit) {
      hits++;
      ways.splice(at, 1);
    } else if (ways.length >= cfg.ways) {
      ways.shift();
    }
    ways.push(tag);
    trace.push({ addr, set, tag, hit });
  }
  return { hits, misses: addrs.length - hits, trace };
}

export function genCache(rng: Rng, tier: Tier): GenOutput {
  const blockSize = rng.pick([4, 8, 16]);
  const lines = rng.pick([4, 8]);
  const ways = atLeast(tier, "expert") ? 2 : 1;
  const cfg: CacheConfig = { lines, blockSize, ways };
  const span = lines * blockSize; // cache size in bytes
  // A sequential walk (spatial locality), a repeat (temporal), and a conflict pair that maps to the same set.
  const base = rng.int(0, 15) * blockSize;
  const walk = Array.from({ length: rng.int(6, 10) }, (_, i) => base + i * 4);
  const conflictA = rng.int(0, lines - 1) * blockSize + 512;
  const conflictB = conflictA + span; // same set in direct-mapped
  const conflict = [conflictA, conflictB, conflictA, conflictB];
  const repeat = rng.sample(walk, 3);
  const addrs = [...walk, ...conflict, ...repeat, ...(atLeast(tier, "operator") ? [conflictA + 4, conflictB + 8, base] : [])];
  const r = simulateCache(cfg, addrs);
  const offsetBits = Math.log2(blockSize);
  const indexBits = Math.log2(lines / ways);
  const tsv = addrs.map((a) => `0x${a.toString(16).padStart(4, "0")}`).join("\n") + "\n";
  return {
    params: {
      lines: String(lines),
      blockSize: String(blockSize),
      ways: ways === 1 ? "direct-mapped" : `${ways}-way set associative (LRU)`,
      count: String(addrs.length),
      sizeBytes: String(span),
    },
    files: [{ name: "trace.txt", content: tsv, note: "Byte addresses accessed, in order." }],
    answers: [
      { label: "Address split", value: `offset ${offsetBits} bits, index ${indexBits} bits, rest is tag` },
      { label: "Hits / misses", value: `${r.hits} hits, ${r.misses} misses` },
      { label: "Hit rate", value: `${fmt((100 * r.hits) / addrs.length, 3)}%` },
      { label: "Per access (H = hit, M = miss)", value: r.trace.map((t) => (t.hit ? "H" : "M")).join(" ") },
    ],
    diagram: { lines, blockSize, ways },
  };
}

// ---------- Mazes ----------

export interface Maze {
  w: number;
  h: number;
  grid: string[]; // rows of '#', '.', 'S', 'G' or digits 1-9 for weighted tiles
}

/** Recursive-backtracker perfect maze on a (2w+1) x (2h+1) grid, plus optional loops. */
export function makeMaze(rng: Rng, w: number, h: number, loops: number): Maze {
  const W = 2 * w + 1;
  const H = 2 * h + 1;
  const g = Array.from({ length: H }, () => Array<string>(W).fill("#"));
  const seen = new Set<number>();
  const stack: [number, number][] = [[0, 0]];
  seen.add(0);
  g[1][1] = ".";
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      .map(([dx, dy]) => [cx + dx, cy + dy, dx, dy] as const)
      .filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h && !seen.has(y * w + x));
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, dx, dy] = rng.pick(options);
    g[2 * cy + 1 + dy][2 * cx + 1 + dx] = ".";
    g[2 * ny + 1][2 * nx + 1] = ".";
    seen.add(ny * w + nx);
    stack.push([nx, ny]);
  }
  for (let i = 0; i < loops; i++) {
    const y = rng.int(1, H - 2);
    const x = rng.int(1, W - 2);
    if (g[y][x] === "#" && ((x % 2 === 1 && y % 2 === 0) || (x % 2 === 0 && y % 2 === 1))) g[y][x] = ".";
  }
  g[1][1] = "S";
  g[H - 2][W - 2] = "G";
  return { w: W, h: H, grid: g.map((r) => r.join("")) };
}

export function findChar(m: Maze, ch: string): [number, number] {
  for (let y = 0; y < m.h; y++) {
    const x = m.grid[y].indexOf(ch);
    if (x >= 0) return [x, y];
  }
  throw new Error(`no ${ch}`);
}

const passable = (c: string) => c !== "#";
const tileCost = (c: string) => (/[1-9]/.test(c) ? Number(c) : 1);

/** BFS: fewest moves from S to G (4-neighbour), or -1. */
export function bfsSteps(m: Maze): number {
  const [sx, sy] = findChar(m, "S");
  const [gx, gy] = findChar(m, "G");
  const dist = new Map<number, number>([[sy * m.w + sx, 0]]);
  const q: [number, number][] = [[sx, sy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    const d = dist.get(y * m.w + x)!;
    if (x === gx && y === gy) return d;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || !passable(m.grid[ny][nx])) continue;
      const k = ny * m.w + nx;
      if (!dist.has(k)) {
        dist.set(k, d + 1);
        q.push([nx, ny]);
      }
    }
  }
  return -1;
}

/** Dijkstra: cheapest path cost where entering a tile costs its digit (1 for '.', 'G'). */
export function dijkstraCost(m: Maze): number {
  const [sx, sy] = findChar(m, "S");
  const [gx, gy] = findChar(m, "G");
  const best = new Map<number, number>([[sy * m.w + sx, 0]]);
  const open: [number, number, number][] = [[0, sx, sy]];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [d, x, y] = open.splice(bi, 1)[0];
    if (x === gx && y === gy) return d;
    if (d > (best.get(y * m.w + x) ?? Infinity)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || !passable(m.grid[ny][nx])) continue;
      const nd = d + tileCost(m.grid[ny][nx]);
      const k = ny * m.w + nx;
      if (nd < (best.get(k) ?? Infinity)) {
        best.set(k, nd);
        open.push([nd, nx, ny]);
      }
    }
  }
  return -1;
}

export function genMaze(rng: Rng, tier: Tier): GenOutput {
  const size = !atLeast(tier, "apprentice") ? [8, 6] : !atLeast(tier, "operator") ? [12, 8] : !atLeast(tier, "expert") ? [18, 12] : [26, 16];
  const loops = atLeast(tier, "operator") ? size[0] * 2 : 0;
  const m = makeMaze(rng, size[0], size[1], loops);
  const weighted = atLeast(tier, "expert");
  if (weighted) {
    m.grid = m.grid.map((row) => row.replace(/\./g, () => (rng.chance(0.3) ? String(rng.int(2, 9)) : ".")));
  }
  const steps = bfsSteps(m);
  const answers = [{ label: "Fewest moves S to G (BFS, ignoring tile costs)", value: String(steps) }];
  if (weighted) answers.push({ label: "Cheapest cost S to G (digits = cost to enter, '.' and G = 1)", value: String(dijkstraCost(m)) });
  return {
    params: { mw: String(m.w), mh: String(m.h), weighted: weighted ? "yes" : "no" },
    files: [{ name: "maze.txt", content: m.grid.join("\n") + "\n", note: `${m.w}x${m.h} grid. # wall, . floor, S start, G goal${weighted ? ", 2-9 = tile cost" : ""}.` }],
    answers,
  };
}

// ---------- Expressions for the tiny interpreter ----------

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+)|([A-Za-z_]\w*)|(==|!=|<=|>=|[-+*/%()<>=,;]))/y;
  let m: RegExpExecArray | null;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(i))) break;
      throw new Error(`unexpected '${src[i]}' at ${i}`);
    }
    if (m[1]) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2]) out.push({ t: "id", v: m[2] });
    else if (m[3]) out.push({ t: "op", v: m[3] });
    i = re.lastIndex;
  }
  return out;
}

const PREC: Record<string, number> = { "==": 1, "!=": 1, "<": 2, ">": 2, "<=": 2, ">=": 2, "+": 3, "-": 3, "*": 4, "/": 4, "%": 4 };

/** Integer semantics: / and % truncate toward zero like C; comparisons give 1 or 0. */
export function evaluate(program: string, env: Map<string, number> = new Map()): number {
  const toks = tokenize(program);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => {
    const t = toks[p++];
    if (!t || (v !== undefined && t.v !== v)) throw new Error(`expected ${v ?? "token"}`);
    return t;
  };
  const primary = (): number => {
    const t = eat();
    if (t.t === "num") return t.v;
    if (t.t === "op" && t.v === "(") { const v = expr(0); eat(")"); return v; }
    if (t.t === "op" && t.v === "-") return -primary();
    if (t.t === "id") {
      if (peek()?.v === "(") {
        eat("(");
        const args = [expr(0)];
        while (peek()?.v === ",") { eat(","); args.push(expr(0)); }
        eat(")");
        if (t.v === "max") return Math.max(...args);
        if (t.v === "min") return Math.min(...args);
        if (t.v === "abs") return Math.abs(args[0]);
        throw new Error(`unknown function ${t.v}`);
      }
      const v = env.get(t.v);
      if (v === undefined) throw new Error(`undefined variable ${t.v}`);
      return v;
    }
    throw new Error(`unexpected ${t.v}`);
  };
  const expr = (min: number): number => {
    let lhs = primary();
    for (;;) {
      const t = peek();
      if (!t || t.t !== "op" || PREC[t.v] === undefined || PREC[t.v] < min) return lhs;
      p++;
      const rhs = expr(PREC[t.v] + 1);
      switch (t.v) {
        case "+": lhs = lhs + rhs; break;
        case "-": lhs = lhs - rhs; break;
        case "*": lhs = lhs * rhs; break;
        case "/": if (rhs === 0) throw new Error("division by zero"); lhs = Math.trunc(lhs / rhs); break;
        case "%": if (rhs === 0) throw new Error("division by zero"); lhs = lhs % rhs; break;
        case "<": lhs = +(lhs < rhs); break;
        case ">": lhs = +(lhs > rhs); break;
        case "<=": lhs = +(lhs <= rhs); break;
        case ">=": lhs = +(lhs >= rhs); break;
        case "==": lhs = +(lhs === rhs); break;
        case "!=": lhs = +(lhs !== rhs); break;
      }
    }
  };
  let last = 0;
  while (p < toks.length) {
    if (toks[p].t === "id" && toks[p].v === "let") {
      p++;
      const name = eat();
      eat("=");
      const v = expr(0);
      env.set(String(name.v), v);
      last = v;
    } else {
      last = expr(0);
    }
    if (peek()?.v === ";") p++;
    else if (p < toks.length) throw new Error(`expected ';'`);
  }
  return last;
}

function randExpr(rng: Rng, depth: number, vars: string[], ops: string[]): string {
  if (depth <= 0 || rng.chance(0.25)) {
    return vars.length && rng.chance(0.4) ? rng.pick(vars) : String(rng.int(1, 20));
  }
  const op = rng.pick(ops);
  const a = randExpr(rng, depth - 1, vars, ops);
  const b = op === "/" || op === "%" ? String(rng.int(2, 9)) : randExpr(rng, depth - 1, vars, ops);
  const s = `${a} ${op} ${b}`;
  return rng.chance(0.45) ? `(${s})` : s;
}

export function genExpr(rng: Rng, tier: Tier): GenOutput {
  const ops = atLeast(tier, "operator") ? ["+", "-", "*", "/", "%"] : ["+", "-", "*"];
  const lines: string[] = [];
  const results: number[] = [];
  const count = atLeast(tier, "operator") ? 6 : 5;
  for (let i = 0; i < count; i++) {
    let src = "";
    if (atLeast(tier, "expert") && i >= 2) {
      const a = rng.int(2, 15), b = rng.int(2, 15);
      const body = randExpr(rng, 2, ["x", "y"], ops);
      const fn = rng.pick(["max", "min"]);
      src = `let x = ${a}; let y = ${b}; ${fn}(${body}, x * y) ${rng.pick(["<", ">", "=="])} ${rng.int(10, 120)}`;
    } else if (atLeast(tier, "operator") && i >= 3) {
      const a = rng.int(2, 15);
      src = `let x = ${a}; ${randExpr(rng, 3, ["x"], ops)}`;
    } else {
      src = randExpr(rng, atLeast(tier, "apprentice") ? 4 : 3, [], ops);
    }
    try {
      results.push(evaluate(src));
      lines.push(src);
    } catch {
      i--;
    }
  }
  return {
    params: { count: String(count) },
    files: [{ name: "programs.txt", content: lines.join("\n") + "\n", note: "One program per line. Your interpreter prints the value of each line." }],
    answers: lines.map((l, i) => ({ label: l, value: String(results[i]) })),
  };
}
