// Polygon geometry for custom deck shapes. All coordinates in millimetres,
// y increasing downward (screen/deck convention). Pure and side-effect free.

export interface Pt {
  x: number;
  y: number;
}

const EPS = 1e-6;

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Translate a polygon so its bounding box starts at (0,0) and report the box
 * size. The deck length/width are the bounding-box extents.
 */
export function normalizePolygon(points: Pt[]): {
  poly: Pt[];
  width: number; // bbox extent in x (deck length, run direction)
  height: number; // bbox extent in y (deck width, across rows)
  ox: number; // original-min x that was subtracted
  oy: number;
} {
  if (points.length === 0) return { poly: [], width: 0, height: 0, ox: 0, oy: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const ox = Math.min(...xs);
  const oy = Math.min(...ys);
  return {
    poly: points.map((p) => ({ x: round(p.x - ox), y: round(p.y - oy) })),
    width: round(Math.max(...xs) - ox),
    height: round(Math.max(...ys) - oy),
    ox,
    oy,
  };
}

/** Signed area (sign depends on winding; magnitude is the polygon area). */
export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Ray-cast point-in-polygon test. */
export function pointInPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Unit inward normal of each edge (a=poly[i] → b=poly[i+1]); points into the polygon. */
export function edgeNormals(poly: Pt[]): Pt[] {
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (!pointInPoly(mx + nx * 0.01, my + ny * 0.01, poly)) {
      nx = -nx;
      ny = -ny;
    }
    return { x: nx, y: ny };
  });
}

/** Intersection of line (p, dir d1) with line (q, dir d2); null if parallel. */
function lineIntersect(p: Pt, d1: Pt, q: Pt, d2: Pt): Pt | null {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((q.x - p.x) * d2.y - (q.y - p.y) * d2.x) / denom;
  return { x: p.x + t * d1.x, y: p.y + t * d1.y };
}

/**
 * Polygon offset inward by `d` (mitred): each edge slides inward along its normal
 * and consecutive offset edges are intersected. Returns one vertex per input
 * vertex. Suitable for small offsets (border depths); large offsets on a concave
 * shape can self-intersect — callers should validate with polygonArea.
 */
export function offsetPolygon(poly: Pt[], normals: Pt[], d: number): Pt[] {
  const n = poly.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const ep = (i - 1 + n) % n;
    const aPrev = { x: poly[ep].x + normals[ep].x * d, y: poly[ep].y + normals[ep].y * d };
    const dirPrev = { x: poly[i].x - poly[ep].x, y: poly[i].y - poly[ep].y };
    const aCur = { x: poly[i].x + normals[i].x * d, y: poly[i].y + normals[i].y * d };
    const dirCur = { x: poly[(i + 1) % n].x - poly[i].x, y: poly[(i + 1) % n].y - poly[i].y };
    const hit = lineIntersect(aPrev, dirPrev, aCur, dirCur);
    out.push(hit ? { x: round(hit.x), y: round(hit.y) } : { x: round(aCur.x), y: round(aCur.y) });
  }
  return out;
}

/** x where edge a→b crosses horizontal line y, clamped to the edge's extent. */
function clampedEdgeX(a: Pt, b: Pt, y: number): number {
  if (Math.abs(b.y - a.y) < EPS) return (a.x + b.x) / 2; // horizontal edge
  const t = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
  return a.x + (b.x - a.x) * t;
}

interface Crossing {
  x: number;
  a: Pt;
  b: Pt;
}

/** Edges crossing horizontal line y (half-open in y to avoid double-counting vertices). */
function crossingsAt(poly: Pt[], y: number): Crossing[] {
  const out: Crossing[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (Math.abs(a.y - b.y) < EPS) continue; // skip horizontal edges
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo - EPS || y >= hi - EPS) continue; // half-open [lo, hi)
    out.push({ x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), a, b });
  }
  return out.sort((p, q) => p.x - q.x);
}

/** A single covered run within one plank row, with its boundary geometry. */
export interface Span {
  xL: number; // centreline left crossing
  xR: number; // centreline right crossing
  leftTop: number; // left boundary x at the row's top edge
  leftBot: number; // left boundary x at the row's bottom edge
  rightTop: number; // right boundary x at the row's top edge
  rightBot: number; // right boundary x at the row's bottom edge
}

/**
 * Covered x-spans for a plank row occupying [yTop, yBot]. Coverage is sampled at
 * the row centreline (so a non-convex deck yields several spans); each span also
 * carries where its left/right boundary edges sit at the row's top and bottom so
 * the caller can lay an angled (bevelled) end cut.
 */
export function rowSpans(poly: Pt[], yTop: number, yBot: number): Span[] {
  const yMid = (yTop + yBot) / 2;
  const cr = crossingsAt(poly, yMid);
  const spans: Span[] = [];
  for (let k = 0; k + 1 < cr.length; k += 2) {
    const L = cr[k];
    const R = cr[k + 1];
    spans.push({
      xL: round(L.x),
      xR: round(R.x),
      leftTop: round(clampedEdgeX(L.a, L.b, yTop)),
      leftBot: round(clampedEdgeX(L.a, L.b, yBot)),
      rightTop: round(clampedEdgeX(R.a, R.b, yTop)),
      rightBot: round(clampedEdgeX(R.a, R.b, yBot)),
    });
  }
  return spans;
}
