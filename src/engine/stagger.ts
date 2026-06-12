// Stage B — choose one candidate cut plan per row to realise the selected
// stagger mode. Greedy, seeded, rule-aware (MVP; the design upgrades this to
// simulated annealing later). All five modes share this engine, differing only
// in which candidates are eligible and how one is scored/selected.

import type { RowCandidate } from './candidates';
import type { StaggerConfig } from '../model/types';
import type { Rng } from './rng';

export interface RowSelection {
  seams: number[];
  cutLengths: number[];
  relaxed: boolean; // min-offset had to be relaxed for this row
}

interface Ctx {
  length: number;
  cfg: StaggerConfig;
  rng: Rng;
  history: number[][]; // chosen seam arrays for prior rows (top → bottom)
  columnUse: Map<number, number>; // seam position → times used as a seam
}

export function chooseLayout(
  rowCandidates: RowCandidate[][],
  cfg: StaggerConfig,
  rng: Rng,
  length: number,
): RowSelection[] {
  const ctx: Ctx = { length, cfg, rng, history: [], columnUse: new Map() };
  const result: RowSelection[] = [];

  for (let r = 0; r < rowCandidates.length; r++) {
    const all = rowCandidates[r];
    if (all.length === 0) {
      result.push({ seams: [], cutLengths: [], relaxed: false });
      ctx.history.push([]);
      continue;
    }
    const sel = selectForRow(all, r, ctx);
    result.push(sel);
    ctx.history.push(sel.seams);
    for (const s of sel.seams) ctx.columnUse.set(s, (ctx.columnUse.get(s) ?? 0) + 1);
  }
  return result;
}

function selectForRow(all: RowCandidate[], row: number, ctx: Ctx): RowSelection {
  const { cfg } = ctx;

  // trueRandom ignores all aesthetic rules.
  if (cfg.mode === 'trueRandom') {
    const c = ctx.rng.pick(all);
    return { seams: c.seams, cutLengths: c.cutLengths, relaxed: false };
  }

  // Hard min-offset against the immediately previous row.
  const prev = ctx.history[row - 1];
  let pool = all;
  let relaxed = false;
  if (prev && prev.length) {
    const ok = all.filter((c) => minGap(c.seams, prev) >= cfg.minSeamOffset);
    if (ok.length) pool = ok;
    else relaxed = true; // nothing satisfies it → relax and warn
  }

  // Limit work to the most promising candidates by estimated waste.
  const ranked = [...pool].sort((a, b) => a.estWaste - b.estWaste).slice(0, 200);

  const scored = ranked.map((c) => ({ c, e: energy(c, row, ctx) }));

  if (cfg.mode === 'staggered') {
    // Deterministic: take the best match to the regular target.
    scored.sort((a, b) => a.e - b.e);
    const best = scored[0].c;
    return { seams: best.seams, cutLengths: best.cutLengths, relaxed };
  }

  // Otherwise soft-min sample so results vary with the seed but favour low energy.
  const best = softminSample(scored, ctx.rng);
  return { seams: best.seams, cutLengths: best.cutLengths, relaxed };
}

/** Combined energy: lower is better. Mixes waste with mode-specific aesthetics. */
function energy(c: RowCandidate, row: number, ctx: Ctx): number {
  const { cfg, length } = ctx;
  const looks = clamp01(cfg.wasteVsLooks);
  const wWaste = 1 - looks;
  const wLooks = looks;

  const wasteTerm = c.estWaste / Math.max(1, length); // normalise to ~[0,1]

  let aesthetic = alignmentPenalty(c.seams, row, ctx) + spreadPenalty(c.seams, ctx);
  aesthetic += stairPenalty(c.seams, row, ctx);
  aesthetic += modeTerm(c.seams, row, ctx);

  return wWaste * wasteTerm + wLooks * aesthetic;
}

/** Penalise seams that sit close to seams in nearby prior rows. */
function alignmentPenalty(seams: number[], row: number, ctx: Ctx): number {
  const { cfg } = ctx;
  let pen = 0;
  for (let back = 1; back <= cfg.lookahead; back++) {
    const r = ctx.history[row - back];
    if (!r) break;
    const weight = 1 / back; // closer rows matter more
    for (const s of seams) {
      for (const s2 of r) {
        const d = Math.abs(s - s2);
        if (d < cfg.minSeamOffset) pen += weight * 3; // near miss
        else pen += weight * Math.max(0, 1 - d / (cfg.minSeamOffset * 3));
      }
    }
  }
  return pen;
}

/** Penalise overusing the same joist column for seams across the whole field. */
function spreadPenalty(seams: number[], ctx: Ctx): number {
  let pen = 0;
  for (const s of seams) pen += 0.4 * (ctx.columnUse.get(s) ?? 0);
  return pen;
}

/** Penalise a monotone "staircase": seams marching the same way ≥3 rows. */
function stairPenalty(seams: number[], row: number, ctx: Ctx): number {
  const r1 = ctx.history[row - 1];
  const r2 = ctx.history[row - 2];
  if (!r1 || !r2 || !seams.length || !r1.length || !r2.length) return 0;
  const a = median(r2);
  const b = median(r1);
  const c = median(seams);
  const up = b > a && c > b;
  const down = b < a && c < b;
  return up || down ? 1.5 : 0;
}

/** Mode-specific shaping term. */
function modeTerm(seams: number[], row: number, ctx: Ctx): number {
  const { cfg, length } = ctx;
  switch (cfg.mode) {
    case 'jitteredBrick':
    case 'staggered': {
      // Target a regular running offset; jitteredBrick adds seeded noise.
      const base = length / 3;
      let target = ((row * base) % length);
      if (cfg.mode === 'jitteredBrick') {
        target += (ctx.rng.next() - 0.5) * cfg.minSeamOffset * 2;
      }
      const nearest = seams.length
        ? Math.min(...seams.map((s) => Math.abs(s - target)))
        : length;
      return nearest / Math.max(1, length);
    }
    case 'maxScatter': {
      // Reward seams far from all recent seams (maximise the minimum distance).
      let minD = Infinity;
      for (let back = 1; back <= cfg.lookahead; back++) {
        const r = ctx.history[row - back];
        if (!r) break;
        for (const s of seams) for (const s2 of r) minD = Math.min(minD, Math.abs(s - s2));
      }
      if (!isFinite(minD)) return 0;
      return 1 - Math.min(1, minD / (length / 2)); // far apart → low energy
    }
    default:
      return 0; // randomWithRules: aesthetics handled by the shared penalties
  }
}

// ---- helpers ----

function minGap(a: number[], b: number[]): number {
  if (!a.length || !b.length) return Infinity;
  let m = Infinity;
  for (const x of a) for (const y of b) m = Math.min(m, Math.abs(x - y));
  return m;
}

function median(arr: number[]): number {
  const s = [...arr].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Sample favouring low energy, seeded for reproducibility. */
function softminSample(
  scored: { c: RowCandidate; e: number }[],
  rng: Rng,
): RowCandidate {
  if (scored.length === 1) return scored[0].c;
  const min = Math.min(...scored.map((s) => s.e));
  const weights = scored.map((s) => Math.exp(-(s.e - min) * 6));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = rng.next() * total;
  for (let i = 0; i < scored.length; i++) {
    t -= weights[i];
    if (t <= 0) return scored[i].c;
  }
  return scored[scored.length - 1].c;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
