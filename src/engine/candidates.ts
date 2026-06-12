// Stage A — enumerate per-row candidate cut plans.
// A candidate is a set of interior seam positions (a subset of the legal joists)
// that partitions the row into segments whose cut lengths each fit a stock plank
// and respect the minimum-piece rule.

const EPS = 1e-6;

export interface RowCandidate {
  seams: number[]; // interior seam positions
  cutLengths: number[]; // segment cut lengths, left to right
  estWaste: number; // heuristic single-piece leftover (Stage C does real packing)
}

export interface CandidateParams {
  length: number; // deck length L
  legalSeams: number[]; // interior joist positions, ascending
  endGap: number;
  minPieceLength: number;
  maxUsable: number; // longest cut length obtainable from a single stock bar
  stockLengths: number[]; // available stock lengths (for waste estimate)
  kerf: number;
  cap?: number; // max candidates to enumerate (default 4000)
}

/** Cut length of a segment between two stops, accounting for seam end gaps. */
export function cutLength(
  a: number,
  b: number,
  edgeStart: boolean,
  edgeEnd: boolean,
  endGap: number,
): number {
  let len = b - a;
  if (!edgeStart) len -= endGap / 2;
  if (!edgeEnd) len -= endGap / 2;
  return round(len);
}

export function generateRowCandidates(p: CandidateParams): RowCandidate[] {
  const { length, legalSeams, endGap, minPieceLength, maxUsable } = p;
  const cap = p.cap ?? 4000;
  const stops = [...legalSeams, length]; // possible right-hand ends of a segment
  const out: RowCandidate[] = [];

  const walk = (pos: number, edgeStart: boolean, seams: number[], lens: number[]) => {
    if (out.length >= cap) return;
    for (const next of stops) {
      if (next <= pos + EPS) continue;
      const edgeEnd = Math.abs(next - length) < EPS;
      const len = cutLength(pos, next, edgeStart, edgeEnd, endGap);
      if (len > maxUsable + EPS) break; // stops are ascending → all farther are longer
      if (len < minPieceLength - EPS) continue; // too short to stop here; reach farther
      const nLens = [...lens, len];
      if (edgeEnd) {
        out.push(finalize(seams, nLens, p));
      } else {
        walk(next, false, [...seams, next], nLens);
      }
      if (out.length >= cap) return;
    }
  };

  walk(0, true, [], []);
  // Deduplicate by seam signature, then rank by estimated waste.
  const seen = new Set<string>();
  const unique = out.filter((c) => {
    const key = c.seams.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.estWaste - b.estWaste);
  return unique;
}

function finalize(seams: number[], lens: number[], p: CandidateParams): RowCandidate {
  let est = 0;
  for (const len of lens) {
    const fit = bestStockLeftover(len, p.stockLengths, p.kerf);
    est += fit;
  }
  return { seams: seams.slice(), cutLengths: lens, estWaste: round(est) };
}

/** Leftover when cutting one piece from the shortest stock that fits (incl. kerf). */
function bestStockLeftover(len: number, stockLengths: number[], kerf: number): number {
  let best = Infinity;
  for (const s of stockLengths) {
    const leftover = s - len - kerf;
    if (leftover >= -EPS && leftover < best) best = leftover;
  }
  return best === Infinity ? len : best; // no stock fits → penalize heavily
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
