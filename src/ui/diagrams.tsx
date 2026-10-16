import type { ReactElement } from "react";
import type { DiagramId } from "../core/missions/diagrams.ts";

// One accurate, labelled SVG per diagram id. Some take the rolled mission's
// numbers (prefix length, resistor value, jump height) so the picture matches
// the problem in front of you. Colours come from the theme via CSS classes.

type P = Record<string, string | number>;
const num = (p: P, k: string, d: number) => (typeof p[k] === "number" ? (p[k] as number) : Number(p[k] ?? d) || d);

const Arrow = () => (
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" className="fill-acc2" />
    </marker>
  </defs>
);

function Box({ x, y, w, h, label, sub, acc }: { x: number; y: number; w: number; h: number; label: string; sub?: string; acc?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} className={acc ? "box-acc" : "box"} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 3 : h / 2 + 4)} textAnchor="middle" className={acc ? "acc" : undefined}>{label}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" className="dimt" fontSize="11">{sub}</text>}
    </g>
  );
}

const line = (x1: number, y1: number, x2: number, y2: number, cls = "ln-acc2") => <line x1={x1} y1={y1} x2={x2} y2={y2} className={cls} markerEnd="url(#arr)" />;

const D: Record<DiagramId, (p: P) => ReactElement> = {
  "subnet-bits": (p) => {
    const prefix = Math.max(1, Math.min(31, num(p, "prefix", 24)));
    const cell = 18;
    return (
      <svg viewBox="0 0 640 150">
        {Array.from({ length: 32 }, (_, i) => (
          <g key={i}>
            <rect x={20 + i * cell} y={40} width={cell - 2} height={30} className={i < prefix ? "fill-acc" : "fill-dim"} opacity={i < prefix ? 0.85 : 1} />
            {i % 8 === 0 && <text x={20 + i * cell} y={34} className="dimt" fontSize="10">bit {32 - i}</text>}
          </g>
        ))}
        {[8, 16, 24].map((b) => <line key={b} x1={20 + b * cell - 1} y1={36} x2={20 + b * cell - 1} y2={74} stroke="var(--fg)" strokeWidth="2" />)}
        <text x={20} y={95} className="acc">network: {prefix} bits</text>
        <text x={20 + prefix * cell} y={95} className="acc2">host: {32 - prefix} bits</text>
        <text x={20} y={120} className="dimt">mask = {prefix} ones then zeros · block size = 2^{32 - prefix} addresses · usable = block − 2</text>
        {p.ip !== undefined && <text x={20} y={142} className="dimt">example address: {String(p.ip)}/{prefix}</text>}
      </svg>
    );
  },
  "dns-flow": () => (
    <svg viewBox="0 0 640 200">
      <Arrow />
      <Box x={10} y={80} w={100} h={40} label="your PC" sub="stub resolver" />
      <Box x={170} y={80} w={120} h={40} label="recursive" sub="resolver" acc />
      <Box x={370} y={10} w={110} h={36} label="root ." />
      <Box x={370} y={82} w={110} h={36} label="TLD .com" />
      <Box x={370} y={154} w={110} h={36} label="authoritative" />
      {line(110, 100, 168, 100)}
      {line(290, 92, 368, 30)}
      {line(290, 100, 368, 100)}
      {line(290, 110, 368, 170)}
      <text x={118} y={92} fontSize="10" className="dimt">1 query</text>
      <text x={500} y={32} fontSize="11" className="dimt">2 "ask .com servers"</text>
      <text x={500} y={104} fontSize="11" className="dimt">3 "ask example.com's NS"</text>
      <text x={500} y={176} fontSize="11" className="dimt">4 the A record + TTL</text>
      <text x={170} y={150} fontSize="11" className="dimt">caches answers for TTL seconds</text>
    </svg>
  ),
  "tcp-handshake": () => (
    <svg viewBox="0 0 640 230">
      <Arrow />
      <text x={90} y={20} textAnchor="middle" className="acc">client</text>
      <text x={550} y={20} textAnchor="middle" className="acc">server :port</text>
      <line x1={90} y1={28} x2={90} y2={220} className="ln" />
      <line x1={550} y1={28} x2={550} y2={220} className="ln" />
      {line(90, 50, 548, 80)}
      <text x={320} y={58} textAnchor="middle">SYN  seq=x</text>
      {line(550, 100, 92, 130, "ln-acc")}
      <text x={320} y={108} textAnchor="middle">SYN-ACK  seq=y ack=x+1</text>
      {line(90, 150, 548, 180)}
      <text x={320} y={158} textAnchor="middle">ACK  ack=y+1</text>
      <text x={320} y={212} textAnchor="middle" className="dimt">connection ESTABLISHED: now a reliable byte stream both ways</text>
    </svg>
  ),
  "socket-frames": () => (
    <svg viewBox="0 0 640 170">
      <text x={10} y={20} className="dimt">TCP delivers a byte stream, not messages. One recv() may return part of a message or several:</text>
      {[["H", "e", "l", "l", "o", "\\n", "h", "i"], ["\\n", "b", "y"], ["e", "\\n"]].map((chunk, ci) => {
        const x0 = [10, 230, 360][ci];
        return (
          <g key={ci}>
            <text x={x0} y={48} fontSize="10" className="dimt">recv #{ci + 1}</text>
            {chunk.map((c, i) => (
              <g key={i}>
                <rect x={x0 + i * 26} y={56} width={24} height={26} className={c === "\\n" ? "box-acc" : "box"} />
                <text x={x0 + i * 26 + 12} y={74} textAnchor="middle" className={c === "\\n" ? "acc" : undefined}>{c}</text>
              </g>
            ))}
          </g>
        );
      })}
      <text x={10} y={112}>Framing turns the stream back into messages:</text>
      <text x={10} y={132} className="acc">"Hello"  "hi"  "bye"</text>
      <text x={10} y={156} className="dimt">delimiter (\n) or length prefix (4-byte size, then payload). Buffer until a whole frame arrives.</text>
    </svg>
  ),
  "bits-adder": () => (
    <svg viewBox="0 0 640 170">
      <Arrow />
      {[0, 1, 2, 3].map((i) => {
        const x = 470 - i * 140;
        return (
          <g key={i}>
            <Box x={x} y={50} w={100} h={56} label={`FA bit ${i}`} sub="sum, carry" acc={i === 3} />
            <text x={x + 25} y={40} textAnchor="middle" fontSize="11">a{i}</text>
            <text x={x + 75} y={40} textAnchor="middle" fontSize="11">b{i}</text>
            <text x={x + 50} y={128} textAnchor="middle" className="acc">s{i}</text>
            {i < 3 && line(x, 78, x - 38, 78)}
          </g>
        );
      })}
      <text x={580} y={82} fontSize="11" className="dimt">cin=0</text>
      <text x={8} y={70} fontSize="11" className="warnt">C (carry out)</text>
      <text x={8} y={154} fontSize="11" className="dimt">V = carry into bit 3 XOR carry out of bit 3 · N = s3 · Z = all sums 0</text>
    </svg>
  ),
  "gate-circuit": () => (
    <svg viewBox="0 0 640 180">
      {["A", "B", "C"].map((v, i) => <text key={v} x={10} y={40 + i * 50} className="acc">{v}</text>)}
      <path d="M180,20 h30 a30,30 0 0 1 0,60 h-30 z" className="box" />
      <text x={205} y={55} textAnchor="middle">AND</text>
      <path d="M180,100 h30 a30,30 0 0 1 0,60 h-30 z" className="box" />
      <text x={205} y={135} textAnchor="middle">AND</text>
      <path d="M350,60 q20,30 0,60 q50,0 70,-30 q-20,-30 -70,-30 z" className="box" />
      <text x={385} y={95} textAnchor="middle">OR</text>
      <line x1={25} y1={36} x2={180} y2={36} className="ln" />
      <line x1={25} y1={86} x2={150} y2={86} className="ln" />
      <line x1={150} y1={86} x2={150} y2={64} className="ln" />
      <line x1={150} y1={64} x2={180} y2={64} className="ln" />
      <line x1={25} y1={136} x2={180} y2={136} className="ln" />
      <line x1={150} y1={86} x2={150} y2={116} className="ln" />
      <line x1={150} y1={116} x2={180} y2={116} className="ln" />
      <line x1={240} y1={50} x2={355} y2={75} className="ln" />
      <line x1={240} y1={130} x2={355} y2={105} className="ln" />
      <line x1={420} y1={90} x2={500} y2={90} className="ln-acc" />
      <text x={510} y={94} className="acc">F = AB + BC</text>
      <text x={10} y={176} fontSize="11" className="dimt">Sum of products: one AND per term, one OR to combine. Fewer terms and literals = fewer gates.</text>
    </svg>
  ),
  "cpu-datapath": () => (
    <svg viewBox="0 0 640 230">
      <Arrow />
      <Box x={10} y={20} w={80} h={40} label="PC" acc />
      <Box x={140} y={20} w={130} h={40} label="memory[256]" />
      <Box x={320} y={20} w={110} h={40} label="IR (2 bytes)" />
      <Box x={480} y={20} w={140} h={40} label="decode" sub="opcode / regs / imm" />
      <Box x={140} y={130} w={170} h={50} label="R0 R1 R2 R3" sub="register file" />
      <Box x={370} y={130} w={110} h={50} label="ALU" acc />
      <Box x={530} y={130} w={90} h={50} label="flags" sub="Z  C" />
      {line(90, 40, 138, 40)}
      {line(270, 40, 318, 40)}
      {line(430, 40, 478, 40)}
      {line(550, 60, 450, 128)}
      {line(310, 155, 368, 155)}
      {line(480, 155, 528, 155)}
      <path d="M425,180 v30 h-200 v-28" className="ln-acc2" markerEnd="url(#arr)" />
      <text x={330} y={225} textAnchor="middle" fontSize="11" className="dimt">result written back</text>
      <text x={10} y={90} fontSize="11" className="dimt">fetch: IR = mem[PC], PC += 2</text>
      <text x={10} y={106} fontSize="11" className="dimt">decode → execute → (maybe) jump</text>
    </svg>
  ),
  "cache-map": (p) => {
    const lines = num(p, "lines", 8);
    const ways = num(p, "ways", 1);
    const block = num(p, "blockSize", 16);
    const sets = Math.max(1, Math.round(lines / ways));
    const off = Math.log2(block);
    const idx = Math.log2(sets);
    return (
      <svg viewBox="0 0 640 210">
        <text x={10} y={20} className="dimt">16-bit address</text>
        <rect x={10} y={28} width={300} height={32} className="box" />
        <rect x={10 + 300 - (off / 16) * 300} y={28} width={(off / 16) * 300} height={32} className="box-acc" />
        <rect x={10 + 300 - ((off + idx) / 16) * 300} y={28} width={(idx / 16) * 300} height={32} className="box" stroke="var(--accent2)" />
        <text x={40} y={49}>tag {16 - off - idx}b</text>
        <text x={10 + 300 - ((off + idx) / 16) * 300 + 4} y={49} className="acc2" fontSize="11">idx {idx}b</text>
        <text x={10 + 300 - (off / 16) * 300 + 4} y={49} className="acc" fontSize="11">off {off}b</text>
        {Array.from({ length: Math.min(sets, 8) }, (_, s) => (
          <g key={s}>
            <text x={360} y={36 + s * 20} fontSize="10" className="dimt">set {s}</text>
            {Array.from({ length: Math.min(ways, 4) }, (_, w) => (
              <rect key={w} x={410 + w * 52} y={24 + s * 20} width={48} height={16} className="box" />
            ))}
          </g>
        ))}
        <text x={10} y={100} fontSize="11">{lines} lines × {block} B = {lines * block} B cache</text>
        <text x={10} y={118} fontSize="11">{ways === 1 ? "direct-mapped" : `${ways}-way set associative`}: {sets} sets</text>
        <text x={10} y={150} fontSize="11" className="dimt">index picks the set; tag says which block is there;</text>
        <text x={10} y={166} fontSize="11" className="dimt">offset picks the byte inside the block.</text>
      </svg>
    );
  },
  "memory-layout": () => (
    <svg viewBox="0 0 640 260">
      <Arrow />
      {[
        ["stack", "locals, return addresses: grows down", "box-acc", 10, 44],
        ["(unmapped gap)", "", "box", 54, 60],
        ["heap", "malloc/new: grows up", "box", 114, 44],
        [".bss", "zeroed globals", "box", 158, 26],
        [".data", "initialised globals", "box", 184, 26],
        [".text", "machine code (read + execute)", "box", 210, 36],
      ].map(([name, note, cls, y, h]) => (
        <g key={name as string}>
          <rect x={150} y={y as number} width={170} height={h as number} className={cls as string} strokeDasharray={name === "(unmapped gap)" ? "4 4" : undefined} />
          <text x={235} y={(y as number) + (h as number) / 2 + 4} textAnchor="middle" className={name === "stack" ? "acc" : undefined}>{name as string}</text>
          {note && <text x={340} y={(y as number) + (h as number) / 2 + 4} fontSize="11" className="dimt">{note as string}</text>}
        </g>
      ))}
      {line(130, 40, 130, 70)}
      {line(130, 150, 130, 120)}
      <text x={10} y={20} fontSize="11" className="dimt">high addresses</text>
      <text x={10} y={250} fontSize="11" className="dimt">low addresses (ASLR shifts each region per run)</text>
    </svg>
  ),
  "fork-exec": () => (
    <svg viewBox="0 0 640 200">
      <Arrow />
      <Box x={10} y={80} w={110} h={40} label="shell" sub="pid 100" acc />
      {line(120, 100, 178, 60)}
      {line(120, 100, 178, 140)}
      <Box x={180} y={40} w={150} h={40} label="parent: waitpid()" sub="pid 100" />
      <Box x={180} y={120} w={150} h={40} label="child: fork() = 0" sub="pid 101" />
      {line(330, 140, 388, 140)}
      <Box x={390} y={120} w={130} h={40} label="execvp(ls)" sub="same pid, new program" acc />
      {line(520, 140, 590, 140)}
      <text x={596} y={144} fontSize="11">exit</text>
      <path d="M600,128 C600,60 420,50 334,60" className="ln-acc2" markerEnd="url(#arr)" strokeDasharray="5 4" />
      <text x={420} y={46} fontSize="11" className="dimt">exit status → parent</text>
      <text x={10} y={190} fontSize="11" className="dimt">fork() duplicates the process; exec() replaces its program; wait() collects the exit code (no zombies).</text>
    </svg>
  ),
  "proc-tree": () => (
    <svg viewBox="0 0 640 200">
      <Arrow />
      <Box x={20} y={20} w={130} h={34} label="systemd (1)" acc />
      <Box x={200} y={8} w={140} h={30} label="sshd (812)" />
      <Box x={200} y={54} w={140} h={30} label="bash (1404)" />
      <Box x={390} y={54} w={140} h={30} label="python (2210)" acc />
      {line(150, 37, 198, 23)}
      {line(150, 37, 198, 69)}
      {line(340, 69, 388, 69)}
      <text x={20} y={120}>/proc/2210/</text>
      {["status  → name, state, PPid, VmRSS", "cmdline → argv, NUL separated", "fd/     → open file descriptors", "maps    → memory regions"].map((t, i) => (
        <text key={i} x={40} y={140 + i * 15} fontSize="11" className="dimt">{t}</text>
      ))}
    </svg>
  ),
  "led-circuit": (p) => {
    const vs = num(p, "vs", 5);
    const vf = num(p, "vf", 2);
    const r = num(p, "r", 150);
    return (
      <svg viewBox="0 0 640 200">
        <circle cx={70} cy={100} r={28} className="box-acc" />
        <text x={70} y={96} textAnchor="middle" className="acc">+</text>
        <text x={70} y={114} textAnchor="middle">{vs} V</text>
        <path d="M70,72 V30 H200" className="ln" />
        <path d="M200,30 l8,-10 l12,20 l12,-20 l12,20 l12,-20 l12,20 l8,-10" className="ln-acc" />
        <text x={240} y={60} textAnchor="middle" className="acc">R = {r} Ω</text>
        <path d="M276,30 H400" className="ln" />
        <path d="M400,14 l30,16 l-30,16 z" className="box-acc" />
        <line x1={430} y1={14} x2={430} y2={46} className="ln-acc" />
        <text x={415} y={68} textAnchor="middle" className="acc2">LED Vf ≈ {vf} V</text>
        <path d="M430,30 H560 V170 H70 V128" className="ln" />
        <text x={560} y={190} textAnchor="middle" className="dimt">GND</text>
        <text x={110} y={140} fontSize="11">I = (Vs − Vf) / R = {((vs - vf) / r * 1000).toFixed(1)} mA</text>
        <text x={110} y={158} fontSize="11" className="dimt">P(R) = I²R · resistor sets the current, LED drops ~fixed voltage</text>
      </svg>
    );
  },
  "rc-curve": (p) => {
    const tau = num(p, "tau", 1);
    const pts = Array.from({ length: 101 }, (_, i) => {
      const t = (i / 100) * 5;
      return `${60 + i * 5.2},${170 - 140 * (1 - Math.exp(-t))}`;
    }).join(" ");
    return (
      <svg viewBox="0 0 640 210">
        <line x1={60} y1={170} x2={590} y2={170} className="ln" />
        <line x1={60} y1={20} x2={60} y2={170} className="ln" />
        <polyline points={pts} className="ln-acc" />
        {[1, 2, 3, 5].map((k) => {
          const x = 60 + k * 104;
          const y = 170 - 140 * (1 - Math.exp(-k));
          return (
            <g key={k}>
              <line x1={x} y1={170} x2={x} y2={y} className="ln" strokeDasharray="3 3" />
              <text x={x} y={186} textAnchor="middle" fontSize="11">{k}τ</text>
              <text x={x + 4} y={y - 6} fontSize="10" className="acc2">{(100 * (1 - Math.exp(-k))).toFixed(0)}%</text>
            </g>
          );
        })}
        <text x={66} y={30} fontSize="11">Vc(t) = Vs(1 − e^(−t/RC))</text>
        <text x={330} y={204} fontSize="11" textAnchor="middle" className="dimt">τ = RC = {tau.toPrecision(3)} s · 63% after 1τ, ~99% after 5τ</text>
      </svg>
    );
  },
  "morse-timing": () => {
    const seq: [number, boolean][] = [[1, true], [1, false], [1, true], [1, false], [1, true], [3, false], [3, true], [1, false], [3, true], [1, false], [3, true], [7, false]];
    let x = 20;
    return (
      <svg viewBox="0 0 640 150">
        {seq.map(([u, on], i) => {
          const el = <rect key={i} x={x} y={on ? 40 : 70} width={u * 20 - 1} height={on ? 30 : 0.1} className={on ? "fill-acc" : "fill-dim"} />;
          x += u * 20;
          return el;
        })}
        <line x1={20} y1={70} x2={x} y2={70} className="ln" />
        <text x={20} y={30} fontSize="11">S = · · ·</text>
        <text x={150} y={30} fontSize="11">O = – – –</text>
        <text x={20} y={100} fontSize="11" className="dimt">dot 1 unit · dash 3 · gap inside letter 1 · between letters 3 · between words 7</text>
        <text x={20} y={120} fontSize="11" className="dimt">unit (ms) = 1200 / WPM (PARIS standard)</text>
      </svg>
    );
  },
  "pi-dashboard": () => (
    <svg viewBox="0 0 640 180">
      <Arrow />
      <Box x={10} y={60} w={120} h={50} label="sensor" sub="/sys thermal or I2C" />
      <Box x={180} y={50} w={150} h={70} label="Raspberry Pi" sub="sampler → SQLite" acc />
      <Box x={380} y={60} w={110} h={50} label="HTTP server" sub=":8000" />
      <Box x={530} y={60} w={100} h={50} label="browser" sub="your PC" />
      {line(130, 85, 178, 85)}
      {line(330, 85, 378, 85)}
      {line(490, 85, 528, 85)}
      <text x={10} y={160} fontSize="11" className="dimt">sample every N s → store with timestamp → serve JSON + a page that charts it (LAN only)</text>
    </svg>
  ),
  "maze-grid": () => {
    const g = ["#########", "#S..#...#", "#.#.#.#.#", "#.#...#.#", "#.#####.#", "#......G#", "#########"];
    const dist: Record<string, number> = {};
    const q: [number, number][] = [[1, 1]];
    dist["1,1"] = 0;
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (g[ny][nx] !== "#" && dist[`${nx},${ny}`] === undefined) {
          dist[`${nx},${ny}`] = dist[`${x},${y}`] + 1;
          q.push([nx, ny]);
        }
      }
    }
    return (
      <svg viewBox="0 0 640 200">
        {g.flatMap((row, y) =>
          [...row].map((c, x) => (
            <g key={`${x},${y}`}>
              <rect x={20 + x * 26} y={10 + y * 26} width={25} height={25} className={c === "#" ? "fill-dim" : "fill-bg3"} />
              {c !== "#" && <text x={32 + x * 26} y={27 + y * 26} textAnchor="middle" fontSize="10" className={c === "S" || c === "G" ? "acc" : "dimt"}>{c === "S" || c === "G" ? c : dist[`${x},${y}`]}</text>}
            </g>
          )),
        )}
        <text x={270} y={40} fontSize="11">BFS explores in rings of equal distance.</text>
        <text x={270} y={58} fontSize="11">The first time it reaches G is a shortest path.</text>
        <text x={270} y={86} fontSize="11" className="dimt">numbers = moves from S</text>
        <text x={270} y={104} fontSize="11" className="dimt">weighted tiles → Dijkstra (priority queue)</text>
        <text x={270} y={122} fontSize="11" className="dimt">+ admissible heuristic → A*</text>
      </svg>
    );
  },
  "dungeon-bsp": () => (
    <svg viewBox="0 0 640 220">
      <rect x={10} y={10} width={300} height={200} className="box" />
      <line x1={140} y1={10} x2={140} y2={210} className="ln-acc2" strokeDasharray="5 4" />
      <line x1={10} y1={110} x2={140} y2={110} className="ln-acc2" strokeDasharray="5 4" />
      <line x1={140} y1={80} x2={310} y2={80} className="ln-acc2" strokeDasharray="5 4" />
      <rect x={25} y={25} width={90} height={65} className="box-acc" />
      <rect x={30} y={130} width={80} height={60} className="box-acc" />
      <rect x={165} y={20} width={120} height={45} className="box-acc" />
      <rect x={170} y={105} width={110} height={85} className="box-acc" />
      <path d="M70,90 V130 M115,58 H165 M225,65 V105 M110,160 H170" className="ln-acc" />
      <text x={330} y={40}>1. split the space recursively</text>
      <text x={330} y={62}>2. place a room in each leaf</text>
      <text x={330} y={84}>3. connect sibling rooms with corridors</text>
      <text x={330} y={120} className="dimt" fontSize="11">Same seed → same dungeon. Flood fill from</text>
      <text x={330} y={136} className="dimt" fontSize="11">the start proves every room is reachable.</text>
    </svg>
  ),
  "sql-schema": () => (
    <svg viewBox="0 0 640 200">
      <Arrow />
      <Box x={10} y={20} w={140} h={60} label="customers" sub="id, name, city" />
      <Box x={200} y={20} w={150} h={60} label="orders" sub="id, customer_id, date" acc />
      <Box x={200} y={120} w={150} h={60} label="order_items" sub="order_id, product_id, qty" />
      <Box x={420} y={120} w={150} h={60} label="products" sub="id, name, category, price" />
      {line(198, 50, 152, 50)}
      {line(275, 118, 275, 82)}
      {line(352, 150, 418, 150)}
      <text x={160} y={42} fontSize="10" className="dimt">N:1</text>
      <text x={282} y={104} fontSize="10" className="dimt">N:1</text>
      <text x={370} y={142} fontSize="10" className="dimt">N:1</text>
      <text x={400} y={40} fontSize="11" className="dimt">arrows = foreign keys</text>
      <text x={400} y={58} fontSize="11" className="dimt">money = integer cents</text>
    </svg>
  ),
  "kv-log": () => (
    <svg viewBox="0 0 640 200">
      <Arrow />
      <text x={10} y={20} className="dimt" fontSize="11">vault.log (append only) →</text>
      {["SET a=1", "SET b=7", "SET a=2", "DEL b", "SET c=5"].map((r, i) => (
        <g key={i}>
          <rect x={10 + i * 120} y={30} width={116} height={34} className={i === 2 || i === 4 ? "box-acc" : "box"} />
          <text x={68 + i * 120} y={52} textAnchor="middle" className={i === 2 || i === 4 ? "acc" : undefined}>{r}</text>
          <text x={14 + i * 120} y={78} fontSize="10" className="dimt">@{i * 24}</text>
        </g>
      ))}
      <rect x={10} y={110} width={160} height={70} className="box" />
      <text x={20} y={130}>index (RAM)</text>
      <text x={20} y={150} className="acc">a → @48</text>
      <text x={20} y={168} className="acc">c → @96</text>
      {line(110, 146, 300, 66)}
      {line(110, 164, 540, 66)}
      <text x={230} y={150} fontSize="11" className="dimt">b is gone: its tombstone removed it.</text>
      <text x={230} y={168} fontSize="11" className="dimt">Compaction keeps only the green records.</text>
    </svg>
  ),
  "jump-arc": (p) => {
    const h = num(p, "h", 96);
    const t = num(p, "t", 0.4);
    const pts = Array.from({ length: 61 }, (_, i) => {
      const s = (i / 60) * 2 * t;
      const y = (2 * h / t) * s - 0.5 * (2 * h / (t * t)) * s * s;
      return `${40 + (i / 60) * 520},${180 - (y / h) * 130}`;
    }).join(" ");
    return (
      <svg viewBox="0 0 640 210">
        <line x1={30} y1={180} x2={600} y2={180} className="ln" />
        <polyline points={pts} className="ln-acc" />
        <line x1={300} y1={50} x2={300} y2={180} className="ln" strokeDasharray="4 4" />
        <text x={306} y={120} className="acc2">h = {h} px</text>
        <text x={300} y={44} textAnchor="middle" fontSize="11">apex: v = 0 at t = {t} s</text>
        <text x={40} y={198} fontSize="11">t = 0</text>
        <text x={540} y={198} fontSize="11">t = {2 * t} s</text>
        <text x={360} y={80} fontSize="11" className="dimt">g = 2h/t² = {(2 * h / (t * t)).toFixed(0)} px/s²</text>
        <text x={360} y={96} fontSize="11" className="dimt">v₀ = 2h/t = {(2 * h / t).toFixed(0)} px/s (up = −y in Godot)</text>
      </svg>
    );
  },
  "perceptron-plane": () => {
    const pts: [number, number, number][] = [[60, 40, 1], [110, 70, 1], [90, 30, 1], [160, 50, 1], [200, 30, 1], [70, 140, 0], [130, 160, 0], [210, 150, 0], [250, 120, 0], [180, 120, 0], [260, 70, 1], [40, 100, 0]];
    return (
      <svg viewBox="0 0 640 200">
        <rect x={20} y={10} width={280} height={180} className="fill-bg3" />
        <line x1={20} y1={120} x2={300} y2={70} className="ln-acc2" />
        {pts.map(([x, y, l], i) => (l ? <circle key={i} cx={x} cy={y} r={5} className="fill-acc" /> : <rect key={i} x={x - 4} y={y - 4} width={8} height={8} className="fill-dim" stroke="var(--fg)" />))}
        <text x={320} y={40}>ŷ = 1 if w₁x + w₂y + b &gt; 0</text>
        <text x={320} y={62}>on a mistake: w += lr · (y − ŷ) · x</text>
        <text x={320} y={84} className="dimt" fontSize="11">the line is where w₁x + w₂y + b = 0</text>
        <text x={320} y={110} className="dimt" fontSize="11">separable data → guaranteed to converge</text>
        <text x={320} y={126} className="dimt" fontSize="11">noisy / XOR data → never settles</text>
      </svg>
    );
  },
  "container-layers": () => (
    <svg viewBox="0 0 640 210">
      {[
        ["writable container layer", "box-acc", "created by docker run, deleted with the container"],
        ["COPY app/ .", "box", "changes every code edit"],
        ["RUN pip install -r requirements.txt", "box", "cached while requirements.txt is unchanged"],
        ["COPY requirements.txt .", "box", ""],
        ["FROM python:3.12-slim", "box", "base image layers (shared)"],
      ].map(([name, cls, note], i) => (
        <g key={i}>
          <rect x={20} y={14 + i * 38} width={300} height={32} className={cls} />
          <text x={30} y={35 + i * 38} className={i === 0 ? "acc" : undefined}>{name}</text>
          <text x={334} y={35 + i * 38} fontSize="11" className="dimt">{note}</text>
        </g>
      ))}
    </svg>
  ),
  "interpreter-pipeline": () => (
    <svg viewBox="0 0 640 200">
      <Arrow />
      <Box x={10} y={20} w={120} h={44} label='"2 + 3 * x"' sub="source" />
      <Box x={170} y={20} w={150} h={44} label="2  +  3  *  x" sub="tokens" />
      <Box x={360} y={20} w={110} h={44} label="AST" sub="tree" acc />
      <Box x={510} y={20} w={110} h={44} label="evaluate" sub="walk the tree" />
      {line(130, 42, 168, 42)}
      {line(320, 42, 358, 42)}
      {line(470, 42, 508, 42)}
      <text x={415} y={100} textAnchor="middle" className="acc">+</text>
      <line x1={410} y1={104} x2={380} y2={128} className="ln" />
      <line x1={420} y1={104} x2={450} y2={128} className="ln" />
      <text x={376} y={142} textAnchor="middle">2</text>
      <text x={455} y={142} textAnchor="middle" className="acc">*</text>
      <line x1={450} y1={146} x2={430} y2={168} className="ln" />
      <line x1={460} y1={146} x2={480} y2={168} className="ln" />
      <text x={428} y={182} textAnchor="middle">3</text>
      <text x={484} y={182} textAnchor="middle">x</text>
      <text x={10} y={120} fontSize="11" className="dimt">precedence lives in the grammar:</text>
      <text x={10} y={136} fontSize="11" className="dimt">expr := term (('+'|'-') term)*</text>
      <text x={10} y={152} fontSize="11" className="dimt">term := factor (('*'|'/') factor)*</text>
    </svg>
  ),
};

export function Diagram({ id, params, caption }: { id: string; params: P; caption: string }) {
  const draw = (D as Record<string, ((p: P) => ReactElement) | undefined>)[id];
  return (
    <figure className="diagram" style={{ margin: 0 }}>
      {draw ? draw(params) : <div className="empty">No diagram for {id}</div>}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
