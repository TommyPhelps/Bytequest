import type { Rng } from "../rng.ts";
import type { GenOutput, Tier } from "../types.ts";
import { genDns, genSocket, genSubnet } from "./net.ts";
import { genBits, genLogic } from "./logic.ts";
import { genToyCpu } from "./toycpu.ts";
import { genCache, genExpr, genMaze } from "./algo.ts";
import { genJump, genLed, genMorse, genPerceptron, genRc } from "./physical.ts";
import { genShop } from "./data.ts";

export type Generator = (rng: Rng, tier: Tier) => GenOutput;

/** Every generator is pure: same rng seed + tier gives the same output. */
export const GENERATORS: Record<string, Generator> = {
  subnet: genSubnet,
  dns: genDns,
  socket: genSocket,
  bits: genBits,
  logic: genLogic,
  toycpu: genToyCpu,
  cache: genCache,
  maze: genMaze,
  expr: genExpr,
  led: genLed,
  rc: genRc,
  jump: genJump,
  morse: genMorse,
  perceptron: genPerceptron,
  shop: genShop,
};
