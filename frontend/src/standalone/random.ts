/** Small deterministic + stochastic helpers used by the standalone engine. */

/** Uniform float in [min, max) — mirrors Python's `random.uniform`. */
export function uniform(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Uniform integer in [min, max] inclusive — mirrors `random.randint`. */
export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Uniform choice from a non-empty array — mirrors `random.choice`. */
export function choice<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Gaussian sample via Box–Muller — mirrors `random.gauss`. */
export function gauss(mean = 0, std = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Return a shuffled copy, like `random.shuffle` on a copy. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A small seeded PRNG (mulberry32) exposing the subset of `random.Random`
 * used by the mock vision detector, so a frame scans deterministically.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  random(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/** FNV-1a 32-bit hash — a dependency-free stand-in for zlib.crc32. */
export function hash32(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
