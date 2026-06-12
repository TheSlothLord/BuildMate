import type { Deck, Gaps, RowKind, WidthFit } from '../model/types';

const EPS = 1e-6;

/**
 * Interior joist (backing-board) positions along the deck length, from the
 * deck's firstOffset stepping by its spacing. The deck edges (0 and L) are not
 * joists; the far edge L is where the last plank terminates, drawn via the outline.
 */
export function joistPositions(deck: Deck): number[] {
  const out: number[] = [];
  const { spacing, firstOffset } = deck;
  if (spacing <= 0) return [0, deck.length];
  for (let x = firstOffset; x < deck.length - EPS; x += spacing) {
    if (x > EPS) out.push(round(x));
  }
  return out;
}

/** Interior joists are the only legal seam positions (strictly inside the deck). */
export function legalSeams(deck: Deck): number[] {
  return joistPositions(deck).filter((x) => x > EPS && x < deck.length - EPS);
}

export interface RowSlot {
  index: number;
  widthMm: number;
  yStartMm: number;
  kind: RowKind;
}

const MIN_REMAINDER = 1; // mm — ignore a sliver this small (it's just the trailing gap)

/**
 * Lay rows across the deck width: as many full-width boards as fit, then handle
 * the leftover strip according to `widthFit` — rip a board to fit, add an extra
 * overhanging board, or leave a gap.
 */
export function rowSlots(deck: Deck, plankWidth: number, gaps: Gaps, widthFit: WidthFit): RowSlot[] {
  const pitch = plankWidth + gaps.sideGap;
  if (pitch <= 0 || deck.width <= 0) return [];

  const full = Math.max(1, Math.floor((deck.width + gaps.sideGap) / pitch));
  const used = full * plankWidth + (full - 1) * gaps.sideGap;
  const leftover = deck.width - used; // includes the gap before any remainder board
  const remWidth = round(leftover - gaps.sideGap); // width available for a partial board

  const slots: RowSlot[] = [];
  let y = 0;
  for (let i = 0; i < full; i++) {
    slots.push({ index: i, widthMm: plankWidth, yStartMm: round(y), kind: 'full' });
    y += plankWidth + gaps.sideGap;
  }

  if (remWidth > MIN_REMAINDER) {
    const i = full;
    if (widthFit === 'extra') {
      slots.push({ index: i, widthMm: plankWidth, yStartMm: round(y), kind: 'extra' });
    } else if (widthFit === 'gap') {
      slots.push({ index: i, widthMm: remWidth, yStartMm: round(y), kind: 'gap' });
    } else {
      slots.push({ index: i, widthMm: remWidth, yStartMm: round(y), kind: 'rip' });
    }
  }
  return slots;
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
