// Seeded RNG (mulberry32) so layouts are reproducible and "Reroll" just changes
// the seed. Deterministic given the same seed.

export interface Rng {
  next(): number; // float in [0, 1)
  int(maxExclusive: number): number; // integer in [0, maxExclusive)
  pick<T>(arr: T[]): T;
  shuffle<T>(arr: T[]): T[];
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 1;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number) => Math.floor(next() * maxExclusive);
  return {
    next,
    int,
    pick: <T>(arr: T[]) => arr[int(arr.length)],
    shuffle: <T>(arr: T[]) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
