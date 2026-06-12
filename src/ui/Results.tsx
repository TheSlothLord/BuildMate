import { useState } from 'react';
import type { CutConfig, CutInstruction, DeckLayout, Result } from '../model/types';
import { DeckCanvas } from './DeckCanvas';
import { ZoomView } from './ZoomView';
import { BarView } from './BarView';

interface Props {
  result: Result;
  endGap: number;
  cut: CutConfig;
}

const m = (mm: number) => `${(mm / 1000).toFixed(2)} m`;
const barNum = (id: string) => parseInt(id.replace(/\D/g, ''), 10) || 0;

/** Small reusable column-sort state: click a header to toggle asc/desc. */
function useTableSort<K extends string>(initial: K) {
  const [sort, setSort] = useState<{ key: K; dir: 'asc' | 'desc' }>({ key: initial, dir: 'asc' });
  const toggle = (k: K) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' }));
  const arrow = (k: K) => (sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
  const sortBy = (r: number) => (sort.dir === 'asc' ? r : -r);
  return { sort, toggle, arrow, sortBy };
}

export function Results({ result, endGap, cut }: Props) {
  const { stats, layouts, cutList, bom, shoppingList, warnings } = result;
  const shoppingTotal = shoppingList.reduce((s, l) => s + (l.cost ?? 0), 0);
  const shoppingCount = shoppingList.reduce((s, l) => s + l.count, 0);
  const [zoomed, setZoomed] = useState<DeckLayout | null>(null);

  // Cut-list cut plan popup + sortable tables.
  const [barView, setBarView] = useState<{ barId: string; highlight?: string } | null>(null);
  const cutSort = useTableSort<'barId' | 'stockLength' | 'cuts' | 'remainder'>('barId');
  const shopSort = useTableSort<'length' | 'count' | 'cost'>('length');
  const bomSort = useTableSort<'stockLength' | 'source' | 'count' | 'cost'>('stockLength');

  const sortedCuts = [...cutList].sort((a, b) =>
    cutSort.sortBy(
      cutSort.sort.key === 'stockLength' ? a.stockLength - b.stockLength :
      cutSort.sort.key === 'cuts' ? a.cuts - b.cuts :
      cutSort.sort.key === 'remainder' ? a.endRemainder - b.endRemainder :
      barNum(a.barId) - barNum(b.barId),
    ),
  );
  const sortedShopping = [...shoppingList].sort((a, b) =>
    shopSort.sortBy(
      shopSort.sort.key === 'count' ? a.count - b.count :
      shopSort.sort.key === 'cost' ? (a.cost ?? 0) - (b.cost ?? 0) :
      a.length - b.length,
    ),
  );
  const sortedBom = [...bom].sort((a, b) =>
    bomSort.sortBy(
      bomSort.sort.key === 'source' ? a.source.localeCompare(b.source) :
      bomSort.sort.key === 'count' ? a.count - b.count :
      bomSort.sort.key === 'cost' ? (a.cost ?? 0) - (b.cost ?? 0) :
      a.stockLength - b.stockLength,
    ),
  );
  const openBar = (barId: string, highlight?: string) => setBarView({ barId, highlight });
  const shownBar: CutInstruction | undefined = barView ? cutList.find((c) => c.barId === barView.barId) : undefined;

  return (
    <div className="main">
      {warnings.length > 0 && (
        <div className="warnings">
          <strong>Notes</strong>
          <ul>
            {[...new Set(warnings)].map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="stats">
        <Stat k="Stock bars" v={String(stats.totalBars)} />
        <Stat k="From inventory" v={String(stats.barsFromInventory)} />
        <Stat k="To buy" v={String(stats.barsToBuy)} cls={stats.barsToBuy > 0 ? 'warn' : 'good'} />
        <Stat k="Deck surface" v={m(stats.surfaceLength)} />
        <Stat k="Waste" v={`${stats.wastePct}%`} cls={stats.wastePct <= 12 ? 'good' : 'warn'} />
        <Stat k="Kerf loss" v={m(stats.kerfLoss)} />
        <Stat k="Scrap" v={m(stats.scrap)} />
        {stats.cost != null && <Stat k="Buy cost" v={stats.cost.toFixed(2)} />}
      </div>

      {layouts.map((layout) => (
        <div className="deck-card" key={layout.deckId}>
          <h3>
            {layout.label} — {m(layout.lengthMm)} × {m(layout.widthMm)}
            <button className="zoom-open" onClick={() => setZoomed(layout)} title="Open a zoomable, full-screen view of this plan">🔍 View / zoom</button>
          </h3>
          <DeckCanvas layout={layout} endGap={endGap} onPickPlank={openBar} />
          <div className="legend">
            <span><i className="sw" style={{ background: 'var(--plank)' }} /> fresh plank</span>
            <span><i className="sw" style={{ background: 'var(--plank-alt)' }} /> cut from offcut</span>
            <span><i className="sw" style={{ background: 'var(--seam)', width: 4 }} /> seam (on joist)</span>
            <span><i className="sw" style={{ background: 'var(--joist)' }} /> backing board</span>
            <span><i className="sw" style={{ background: 'var(--muted)', opacity: 0.4 }} /> cut-off / gap / overhang</span>
          </div>
        </div>
      ))}

      <h2 style={{ marginTop: 8 }}>Shopping list</h2>
      {shoppingList.length === 0 ? (
        <p className="tagline">Nothing to buy — your inventory covers the whole job. 🎉</p>
      ) : (
        <table className="cuts">
          <thead>
            <tr>
              <th className="sortable" onClick={() => shopSort.toggle('length')}>Buy length{shopSort.arrow('length')}</th>
              <th className="sortable" onClick={() => shopSort.toggle('count')}>Qty{shopSort.arrow('count')}</th>
              <th className="sortable" onClick={() => shopSort.toggle('cost')}>Cost{shopSort.arrow('cost')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedShopping.map((l) => (
              <tr key={l.length}>
                <td>{l.length} mm</td>
                <td>{l.count}</td>
                <td>{l.cost != null ? l.cost.toFixed(2) : '—'}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td><strong>{shoppingCount}</strong></td>
              <td><strong>{shoppingTotal > 0 ? shoppingTotal.toFixed(2) : '—'}</strong></td>
            </tr>
          </tbody>
        </table>
      )}

      <h2>Materials used</h2>
      <table className="cuts">
        <thead>
          <tr>
            <th className="sortable" onClick={() => bomSort.toggle('stockLength')}>Stock length{bomSort.arrow('stockLength')}</th>
            <th className="sortable" onClick={() => bomSort.toggle('source')}>Source{bomSort.arrow('source')}</th>
            <th className="sortable" onClick={() => bomSort.toggle('count')}>Qty{bomSort.arrow('count')}</th>
            <th className="sortable" onClick={() => bomSort.toggle('cost')}>Cost{bomSort.arrow('cost')}</th>
          </tr>
        </thead>
        <tbody>
          {sortedBom.map((b) => (
            <tr key={`${b.source}-${b.stockLength}`}>
              <td>{b.stockLength} mm</td>
              <td>{b.source === 'onhand' ? 'inventory' : 'bought'}</td>
              <td>{b.count}</td>
              <td>{b.cost != null ? b.cost.toFixed(2) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Cut list</h2>
      <p className="tagline">Click a row — or a plank in a plan above — to see how that stock plank is cut. Click a column to sort.</p>
      <table className="cuts">
        <thead>
          <tr>
            <th className="sortable" onClick={() => cutSort.toggle('barId')}>Stock{cutSort.arrow('barId')}</th>
            <th className="sortable" onClick={() => cutSort.toggle('stockLength')}>Length{cutSort.arrow('stockLength')}</th>
            <th className="sortable" onClick={() => cutSort.toggle('cuts')}>Cuts{cutSort.arrow('cuts')}</th>
            <th>Boards (length)</th>
            <th className="sortable" onClick={() => cutSort.toggle('remainder')}>Remainder{cutSort.arrow('remainder')}</th>
          </tr>
        </thead>
        <tbody>
          {sortedCuts.map((c) => (
            <tr key={c.barId} className="clickable" onClick={() => openBar(c.barId)} title="Show this plank's cut plan">
              <td>{c.barId}</td>
              <td>{c.stockLength} mm <span className={`src ${c.source}`}>{c.source === 'onhand' ? 'inv' : 'buy'}</span></td>
              <td>{c.cuts}</td>
              <td>
                {c.pieces.map((p, i) => (
                  <span className={`tag${i > 0 ? ' reuse' : ''}`} key={i}>
                    {p.usedIn} <span className="tag-len">{p.lengthMm}</span>
                  </span>
                ))}
              </td>
              <td className={c.isScrap ? 'scrap' : ''}>
                {c.endRemainder} mm{c.isScrap ? ' (scrap)' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {zoomed && <ZoomView layout={zoomed} endGap={endGap} onClose={() => setZoomed(null)} />}

      {shownBar && (
        <div className="modal-backdrop" onClick={() => setBarView(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Cut plan for ${shownBar.barId}`}>
            <div className="modal-head">
              <strong>Cut plan — {shownBar.barId}</strong>
              <button className="x" aria-label="Close" onClick={() => setBarView(null)}>✕</button>
            </div>
            <BarView bar={shownBar} cut={cut} highlight={barView?.highlight} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="stat">
      <div className={`v ${cls ?? ''}`}>{v}</div>
      <div className="k">{k}</div>
    </div>
  );
}
