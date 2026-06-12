# DeckBuilder — Design

A browser app that lays out parallel decking planks on one or more rectangular
decks, snapping every seam to the backing-board (joist) grid, optimizing the cut
plan (offcut reuse + saw kerf) while producing a pleasing, user-selectable seam
pattern.

---

## 1. Problem statement

This is a **2D constrained cutting-stock + aesthetic-layout** problem.

- The deck is a grid. Backing boards (joists) at spacing `S` define the **only
  legal seam positions** — joists sit at `firstOffset, firstOffset+S, …` up to
  `L`. Every butt joint (seam) must land on one. *(Hard constraint.)*
- Each **row** spans the deck length `L` and is filled with planks laid
  end-to-end. A row is therefore a partition of the deck into segments; each
  segment runs joist→joist (or edge→joist at the ends) and is covered by one
  physical plank **cut to that exact length**.
- Stock plank length and joist spacing are **independent** (e.g. 4800 mm planks,
  joists at 580 mm). So nearly every plank is cut, and the leftovers (offcuts)
  are the primary raw material for the rest of the deck.
- **Waste** = saw **kerf** (blade width removed per cut) + **scrap**
  (end remainders too short to reuse) + **usable offcuts left over** at the end
  of the job (these count as waste — single-job accounting).
- **Aesthetics** is a cross-row constraint: seams in adjacent rows must be far
  apart, and the field must avoid regular/periodic patterns.

Waste is a *within-row + global-packing* objective; looks is a *between-row*
objective. They are coupled — hence the **waste ↔ looks** trade-off slider.

---

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Platform | Web app — React + TS + Vite, SVG canvas, engine in a Web Worker, no backend |
| Seam rule | HARD: every seam sits on a joist position |
| Stock vs grid | Independent — nearly every plank is cut; offcut reuse is core |
| Kerf | Real waste, in the packing constraint (default 3 mm, editable) |
| Offcut reuse | Shared pool across all decks |
| Leftover offcuts | Count as waste (single-job accounting) |
| Optimization goal | Balance waste ↔ looks (slider scales aesthetic weights vs waste) |
| Width remainder | User choice per project (`widthFit`): rip a board to fit, add an overhanging extra board, or leave a gap |
| Min piece length | User-entered mm |
| Stagger | 5 user-selectable modes (see §6) |
| Deck shape | Rectangles only |
| Multiple decks | Independent layouts; shared inventory / offcut pool |
| Border boards | None (planks run edge to edge) |
| Units | millimetres |

---

## 3. Geometry & definitions

Per deck, with run direction along `L` (planks) and `W` across (rows):

```
Edge inset:       e = max(firstOffset, backingBoardWidth / 2)   // edge-board centre
Joist positions:  J = { e } ∪ { e + k·S : k ≥ 1, < L − e } ∪ { L − e }   // edge boards both ends
Legal seams:      interior joists J ∩ (0, L) (min-piece rule rejects edge-hugging ones)
Rows:             count = floor((W + sideGap) / (plankWidth + sideGap))
                  leftover strip handled by widthFit: rip | extra (overhang) | gap
```

A **row layout** is an ordered subset of legal seams `s₁ < s₂ < … < s_m`. It
partitions the row into segments with required (cut) lengths:

```
firstSegment      = s₁              − endGap/2
interiorSegment   = sᵢ₊₁ − sᵢ       − endGap
lastSegment       = L  − s_m        − endGap/2
(no seams)        = L               − endGap (single full-length plank)
```

Every segment length must satisfy `minPieceLength ≤ len ≤ maxStockUsable`.

---

## 4. Data model (TypeScript)

```ts
type mm = number;

interface OnHandStock { length: mm; quantity: number; }          // planks I already own
interface StoreStock  { length: mm; pricePerUnit?: number; }      // purchasable, unlimited
interface PlankSpec   { width: mm; thickness: mm; onHand: OnHandStock[]; store: StoreStock[]; }
// Internally merged into StockOption { length, quantity?, pricePerUnit?, source: 'onhand'|'store' }.

interface Deck {
  id: string; label: string; length: mm; width: mm;
  spacing: mm; firstOffset: mm; noSeams: boolean;
}

interface Gaps      { sideGap: mm; endGap: mm; }
interface JoistGrid { spacing: mm; firstOffset: mm; }
interface CutConfig { kerf: mm; squareLeadingEnd: boolean; minReusableOffcut: mm; }

type StaggerMode =
  | 'trueRandom' | 'randomWithRules' | 'jitteredBrick' | 'staggered' | 'maxScatter';

interface StaggerConfig {
  mode: StaggerMode;
  minSeamOffset: mm;     // min horizontal gap between seams in adjacent rows
  minPieceLength: mm;    // anti-stub
  lookahead: number;     // rows window for alignment checks (e.g. 2)
  seed: number;          // reproducible; Reroll bumps it
  wasteVsLooks: number;  // 0 = waste-first … 1 = looks-first
}

interface Project {
  plank: PlankSpec; grid: JoistGrid; gaps: Gaps; cut: CutConfig;
  stagger: StaggerConfig; decks: Deck[];
}

// ---------- results ----------
interface Segment {
  startMm: mm; lengthMm: mm; bays: number;
  barId: string; reusedOffcut: boolean;
}
interface Row    { index: number; widthMm: mm; yStartMm: mm; segments: Segment[]; seams: mm[]; }
interface DeckLayout { deckId: string; rows: Row[]; }

interface CutInstruction {
  barId: string; stockLength: mm; source: 'onhand' | 'store';
  pieces: { lengthMm: mm; usedIn: string }[];
  cuts: number; kerfLoss: mm; endRemainder: mm; isScrap: boolean;
}
interface BomLine     { stockLength: mm; count: number; source: 'onhand' | 'store'; cost?: number; }
interface ShoppingLine { length: mm; count: number; cost?: number; }  // what to buy

interface Stats {
  totalBars: number; surfaceLength: mm; purchasedLength: mm;
  kerfLoss: mm; scrap: mm; leftover: mm; wastePct: number; cost?: number;
}
interface Result { layouts: DeckLayout[]; cutList: CutInstruction[]; bom: BomLine[]; stats: Stats; }
```

---

## 5. Pipeline (runs in a Web Worker)

```
1. Grid       → joist positions + rows (leftover width per widthFit)
2. Stage A    → per-row candidate cut plans (bounded DP, top-M by waste)
3. Stage B    → stagger: pick one candidate per row under the chosen mode
4. Stage C    → cutting-stock with kerf: pack all segments into bars + offcuts
5. Stats      → kerf / scrap / leftover / waste% / cost
```

### Stage A — per-row candidates
Recursively enumerate partitions of the legal-seam sequence into segments whose
mm-length is within `[minPieceLength, maxStockUsable]`. Score each by an
estimate of waste. Keep the top-M lowest-waste candidates (with their seam sets).
`N` (bays per row) is small, so this is cheap; cap the branching for safety.

### Stage B — stagger selection
Choose one candidate per row to satisfy the aesthetic rules. **Simulated
annealing** (seeded) over "which candidate per row":

- **Hard:** seams on joists (guaranteed by candidates); `minPieceLength`;
  `minSeamOffset` between adjacent rows.
- **Soft energy (minimize):**
  - `w_waste · estWaste`
  - `w_align · Σ` near-aligned seams within `lookahead` rows
  - `w_stair · Σ` monotone seam runs ≥ 3 rows ("staircase")
  - `w_period · Σ` low-entropy / repeating offset sequences
  - `w_spread · Σ` per-joist-column seam overuse
- Weights scaled by `wasteVsLooks`. Seed → reproducible **Reroll**.

### Stage C — cutting stock with kerf
Demand = all segment lengths across all decks (shared pool). First-Fit-Decreasing
+ local-search polish. A bar of length `Lₛ` holding pieces `p₁…pₘ`:

```
Σ pᵢ  +  cuts · kerf  +  (squareLeadingEnd ? kerf : 0)  ≤  Lₛ
cuts = m   (each piece separated by a kerf; the trailing remainder is free)
```

Prefer the **shortest** bar/offcut that fits (incl. kerf) → consumes offcuts
before opening fresh stock. End remainders `≥ minReusableOffcut` re-enter the
pool; the rest is scrap.

**Inventory first, then buy.** When a new bar must be opened, prefer **on-hand**
stock (finite quantities, already owned) before **store** stock (unlimited,
priced); within a source, shortest-fit, tie-break on price. Bars carry their
`source`, so the result reports a **shopping list** (store planks to buy to cover
the shortfall) separately from inventory used, and cost counts only what's bought.

**Optional feedback loop:** if Stage C waste is poor, perturb a few rows' seams
and re-run a slice of Stage B — this is where the waste↔looks slider pays off.

---

## 6. Stagger modes (one engine, five presets)

| Mode | Behaviour | Hard rules |
|---|---|---|
| **trueRandom** | Random legal seams, no aesthetic scoring | structural + min-piece |
| **randomWithRules** | Random + min-offset, no-align, no-stair, no-period | all aesthetic |
| **jitteredBrick** | Targets a base row offset, adds seeded jitter | min-offset; jitter≠0 |
| **staggered** | Deterministic fixed offset step per row | min-offset |
| **maxScatter** | Maximizes min-distance / entropy between nearby seams | all aesthetic |

---

## 7. Waste accounting

```
surfaceLength   = Σ segment lengths                (actual deck surface)
purchasedLength = Σ stockLength of bars opened
kerfLoss        = Σ cuts · kerf
scrap           = Σ end remainders < minReusableOffcut
leftover        = Σ usable offcuts unused at job end   (counts as waste)
wastePct        = (purchasedLength − surfaceLength) / purchasedLength
                = (kerfLoss + scrap + leftover) / purchasedLength
cost            = Σ bar prices (if provided)
```

---

## 8. Architecture

```
src/
  model/      types.ts            — domain types + light validation
  engine/     rng.ts              — seeded RNG (mulberry32)
              grid.ts             — joist positions, rows (widthFit handling)
              candidates.ts       — Stage A per-row cut plans
              stagger.ts          — Stage B selection + aesthetic scoring
              cutstock.ts         — Stage C FFD packing with kerf
              optimize.ts         — orchestrator → Result
  worker/     optimizer.worker.ts — wraps engine, posts progress (future)
  ui/         App.tsx             — inputs + state
              DeckCanvas.tsx      — SVG plan (seams on joist grid)
              Results.tsx         — BOM, cut list, stats
  main.tsx, styles.css
```

- **Engine is pure** (no React/DOM) → unit-testable, worker-portable.
- MVP runs the engine inline; promote to a Web Worker once layouts get large.
- **Persistence (later):** localStorage projects; JSON import/export.
- **Exports (later):** plan → SVG/PNG/PDF; cut list → CSV.

---

## 9. Build order

1. **MVP** — single/multi rectangle, grid + SVG render, engine inline, all 5
   stagger modes via greedy+rules, cutting-stock with kerf, BOM/stats. *(this scaffold)*
2. **Annealing** — replace greedy Stage B with seeded simulated annealing;
   move engine into a Web Worker with progress events.
3. **Polish** — persistence, JSON/CSV/PDF/PNG exports, validation messages.
4. **Extras (out of current scope)** — L/T shapes, continuous multi-deck boards,
   picture-frame borders.

---

## 10. Edge cases

- `L` not a multiple of `S` → short final bay; last segment cut to fit; warn.
- Stock shorter than `minPieceLength` or one bay → invalid input.
- `minSeamOffset` too large for the bay count → no valid stagger; auto-relax + warn.
- Short deck where one plank covers a row → no seam (ideal).
- Width remainder near zero → effectively no partial rows.
- A row whose waste-optimal plan fights the stagger rules → slider decides;
  surfaced in stats.
