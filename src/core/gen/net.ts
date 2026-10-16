import type { Rng } from "../rng.ts";
import type { GenOutput, Tier } from "../types.ts";
import { atLeast } from "./util.ts";

// ---------- IPv4 math (unsigned 32-bit) ----------

export function ipToInt(ip: string): number {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) throw new Error(`bad IPv4: ${ip}`);
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

export function intToIp(n: number): string {
  n = n >>> 0;
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function maskOf(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export interface SubnetInfo {
  network: string;
  prefix: number;
  mask: string;
  wildcard: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  usableHosts: number;
}

export function subnetInfo(ip: string, prefix: number): SubnetInfo {
  const m = maskOf(prefix);
  const net = (ipToInt(ip) & m) >>> 0;
  const size = 2 ** (32 - prefix);
  const bcast = (net + size - 1) >>> 0;
  const usable = prefix >= 31 ? (prefix === 31 ? 2 : 1) : size - 2;
  return {
    network: intToIp(net),
    prefix,
    mask: intToIp(m),
    wildcard: intToIp(~m >>> 0),
    broadcast: intToIp(bcast),
    firstHost: intToIp(prefix >= 31 ? net : net + 1),
    lastHost: intToIp(prefix >= 31 ? bcast : bcast - 1),
    usableHosts: usable,
  };
}

/** Smallest prefix whose subnet holds `hosts` usable addresses (classic rule: size - 2). */
export function prefixForHosts(hosts: number): number {
  for (let p = 30; p >= 0; p--) if (2 ** (32 - p) - 2 >= hosts) return p;
  throw new Error("too many hosts");
}

export interface VlsmAlloc {
  name: string;
  need: number;
  info: SubnetInfo;
}

/** Largest-first VLSM allocation inside base/prefix. Throws if it does not fit. */
export function vlsm(base: string, basePrefix: number, needs: { name: string; hosts: number }[]): VlsmAlloc[] {
  const start = (ipToInt(base) & maskOf(basePrefix)) >>> 0;
  const end = start + 2 ** (32 - basePrefix);
  const sorted = needs.slice().sort((a, b) => b.hosts - a.hosts || a.name.localeCompare(b.name));
  let cursor = start;
  const out: VlsmAlloc[] = [];
  for (const n of sorted) {
    const p = prefixForHosts(n.hosts);
    const size = 2 ** (32 - p);
    cursor = Math.ceil((cursor - start) / size) * size + start; // align
    if (cursor + size > end) throw new Error("VLSM plan does not fit");
    out.push({ name: n.name, need: n.hosts, info: subnetInfo(intToIp(cursor), p) });
    cursor += size;
  }
  return out;
}

function privateBase(rng: Rng, prefix: number): string {
  const kind = rng.int(0, 2);
  let ip: number;
  if (kind === 0) ip = ipToInt(`10.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(0, 255)}`);
  else if (kind === 1) ip = ipToInt(`172.${rng.int(16, 31)}.${rng.int(0, 255)}.${rng.int(0, 255)}`);
  else ip = ipToInt(`192.168.${rng.int(0, 255)}.${rng.int(0, 255)}`);
  return intToIp((ip & maskOf(prefix)) >>> 0);
}

const SITE_NAMES = ["Servers", "Office", "Lab", "Cameras", "Guest-WiFi", "Printers", "VoIP", "Management", "Workshop", "Retro-Arcade", "IoT", "Storage"];

export function genSubnet(rng: Rng, tier: Tier): GenOutput {
  if (!atLeast(tier, "apprentice")) {
    const prefix = rng.int(20, 29);
    const net = privateBase(rng, prefix);
    const size = 2 ** (32 - prefix);
    const host = intToIp(ipToInt(net) + rng.int(1, size - 2));
    const s = subnetInfo(host, prefix);
    return {
      params: { host, prefix: String(prefix), cidr: `${host}/${prefix}` },
      files: [],
      answers: [
        { label: "Subnet mask", value: s.mask },
        { label: "Network address", value: s.network },
        { label: "Broadcast address", value: s.broadcast },
        { label: "First usable host", value: s.firstHost },
        { label: "Last usable host", value: s.lastHost },
        { label: "Usable hosts", value: String(s.usableHosts) },
      ],
      diagram: { prefix, ip: host },
    };
  }
  const count = tier === "apprentice" ? 3 : tier === "operator" ? 4 : tier === "expert" ? 5 : 6;
  // Pick needs that fit comfortably, then pick the smallest base block that holds them.
  let needs: { name: string; hosts: number }[] = [];
  let basePrefix = 0;
  for (;;) {
    const names = rng.sample(SITE_NAMES, count);
    needs = names.map((name) => ({ name, hosts: rng.pick([2, 6, 12, 14, 25, 28, 30, 45, 60, 90, 110, 200, 250]) }));
    const total = needs.reduce((a, n) => a + 2 ** (32 - prefixForHosts(n.hosts)), 0);
    basePrefix = 32 - Math.ceil(Math.log2(total));
    if (basePrefix >= 20) break;
  }
  const base = privateBase(rng, basePrefix);
  const plan = vlsm(base, basePrefix, needs);
  const needsText = needs.map((n) => `${n.name}: ${n.hosts} hosts`).join(", ");
  const csv = ["name,hosts_needed", ...needs.map((n) => `${n.name},${n.hosts}`)].join("\n") + "\n";
  return {
    params: { base: `${base}/${basePrefix}`, needs: needsText, count: String(count), prefix: String(basePrefix) },
    files: [{ name: "requirements.csv", content: csv, note: "The subnets you must carve out (name, hosts needed)." }],
    answers: plan.map((a) => ({
      label: `${a.name} (${a.need} hosts)`,
      value: `${a.info.network}/${a.info.prefix}  hosts ${a.info.firstHost} - ${a.info.lastHost}  bcast ${a.info.broadcast}`,
    })).concat([{ label: "Allocation order", value: "Largest requirement first, each block aligned to its own size." }]),
    diagram: { prefix: basePrefix, ip: base },
  };
}

// ---------- DNS query packet ----------

export const DNS_TYPES: Record<string, number> = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };

export function dnsQuery(id: number, name: string, qtype: string, recursionDesired = true): Uint8Array {
  const labels = name.replace(/\.$/, "").split(".");
  const bytes: number[] = [id >> 8, id & 255, recursionDesired ? 0x01 : 0x00, 0x00, 0, 1, 0, 0, 0, 0, 0, 0];
  for (const l of labels) {
    if (l.length === 0 || l.length > 63) throw new Error(`bad label in ${name}`);
    bytes.push(l.length, ...Array.from(l, (ch) => ch.charCodeAt(0)));
  }
  bytes.push(0);
  const t = DNS_TYPES[qtype];
  if (!t) throw new Error(`unknown qtype ${qtype}`);
  bytes.push(t >> 8, t & 255, 0, 1);
  return Uint8Array.from(bytes);
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");

const DNS_NAMES = ["example.com", "wikipedia.org", "github.com", "python.org", "kernel.org", "debian.org", "iana.org", "mozilla.org"];

export function genDns(rng: Rng, tier: Tier): GenOutput {
  const id = rng.int(1, 65535);
  const name = rng.pick(DNS_NAMES);
  const qtype = atLeast(tier, "operator") ? rng.pick(["A", "AAAA", "MX", "TXT", "NS"]) : rng.pick(["A", "AAAA"]);
  const pkt = dnsQuery(id, name, qtype);
  return {
    params: { qid: `0x${id.toString(16).padStart(4, "0")}`, qidDec: String(id), qname: name, qtype },
    files: [],
    answers: [
      { label: "Query packet length", value: `${pkt.length} bytes` },
      { label: "Header (12 bytes)", value: hex(pkt.slice(0, 12)) },
      { label: "Full query (hex)", value: hex(pkt) },
      { label: "Type code", value: `${qtype} = ${DNS_TYPES[qtype]}` },
    ],
  };
}

// ---------- Socket protocol parameters ----------

export function genSocket(rng: Rng, tier: Tier): GenOutput {
  const port = rng.int(4000, 4999);
  const framing = atLeast(tier, "operator") ? rng.pick(["length-prefix", "newline"]) : "newline";
  const cmd = rng.pick(["/nick", "/who", "/me", "/time"]);
  const framingText =
    framing === "newline"
      ? "Each message is UTF-8 text ending in a single \\n."
      : "Each message is a 2-byte big-endian length followed by that many UTF-8 bytes.";
  return {
    params: { port: String(port), framing, framingText, cmd },
    files: [],
    answers: [
      { label: "Port", value: String(port) },
      { label: "Framing", value: framingText },
      {
        label: "Frame for the message 'hi'",
        value: framing === "newline" ? "68 69 0a" : "00 02 68 69",
      },
    ],
  };
}
