import { useEffect, useMemo, useRef, useState } from 'react';
import type { Deck, Project, StaggerMode, WidthFit } from '../model/types';
import { defaultProject } from '../model/defaults';
import { optimize } from '../engine/optimize';
import { saveFile } from '../platform/save';
import { Results } from './Results';

const MODES: { value: StaggerMode; label: string; desc: string }[] = [
  {
    value: 'trueRandom',
    label: 'True random',
    desc: 'Seams placed at random legal joists with no aesthetic rules. Can look messy or accidentally aligned — useful only as a baseline.',
  },
  {
    value: 'randomWithRules',
    label: 'Random with rules',
    desc: "Random placement, but enforces the minimum seam offset and avoids aligned seams, staircases and repeating patterns. The natural, 'not too structured' look.",
  },
  {
    value: 'jitteredBrick',
    label: 'Jittered brick',
    desc: 'Aims for a roughly consistent offset between rows, with random jitter so it never becomes an exact running-bond pattern.',
  },
  {
    value: 'staggered',
    label: 'Staggered',
    desc: 'A regular, deterministic offset step between rows — the classic orderly running-bond look.',
  },
  {
    value: 'maxScatter',
    label: 'Maximum scatter',
    desc: 'Pushes every seam as far as possible from seams in nearby rows. The most chaotic, least patterned result.',
  },
];

const WIDTH_FITS: { value: WidthFit; label: string; desc: string }[] = [
  {
    value: 'rip',
    label: 'Cut board to fit',
    desc: 'Rip the last board down to the leftover width. The cut-off strip is shown faded grey.',
  },
  {
    value: 'extra',
    label: 'Extra board (overhang)',
    desc: 'Add a full extra board that overhangs the deck; the deck edge is drawn through it.',
  },
  {
    value: 'gap',
    label: 'Leave a gap (no board)',
    desc: 'Leave the leftover strip uncovered; a faded grey board marks where it would have gone.',
  },
];

export function App() {
  const [project, setProject] = useState<Project>(defaultProject);
  const result = useMemo(() => optimize(project), [project]);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveSession = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const name = (project.decks[0]?.label || 'deckbuilder').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    void saveFile(`${name}.deck`, blob);
  };

  const loadSession = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-loading the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Partial<Project>;
        if (!Array.isArray(data.decks) || !data.plank || !data.stagger)
          throw new Error('not a DeckBuilder session');
        // Merge with defaults so older/partial files still load, and ensure every
        // deck has the per-deck spacing fields introduced later.
        const deckBase = (i: number): Deck => ({
          id: `deck${i + 1}`,
          label: `Deck ${i + 1}`,
          length: 4000,
          width: 3000,
          spacing: 600,
          firstOffset: 600,
          noSeams: false,
        });
        const decks: Deck[] = data.decks.map((d, i) => ({ ...deckBase(i), ...d }));
        setProject({
          ...defaultProject,
          ...data,
          plank: { ...defaultProject.plank, ...data.plank },
          gaps: { ...defaultProject.gaps, ...data.gaps },
          cut: { ...defaultProject.cut, ...data.cut },
          stagger: { ...defaultProject.stagger, ...data.stagger },
          decks,
        });
      } catch (err) {
        alert(`Could not load this .deck file: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  const patch = (p: Partial<Project>) => setProject((cur) => ({ ...cur, ...p }));
  const patchPlank = (p: Partial<Project['plank']>) => patch({ plank: { ...project.plank, ...p } });
  const patchGaps = (p: Partial<Project['gaps']>) => patch({ gaps: { ...project.gaps, ...p } });
  const patchCut = (p: Partial<Project['cut']>) => patch({ cut: { ...project.cut, ...p } });
  const patchStag = (p: Partial<Project['stagger']>) =>
    patch({ stagger: { ...project.stagger, ...p } });

  const setSeed = (seed: number) => patchStag({ seed: Math.max(1, seed) });

  const updateDeck = (i: number, p: Partial<Project['decks'][number]>) => {
    const decks = project.decks.map((d, idx) => (idx === i ? { ...d, ...p } : d));
    patch({ decks });
  };
  const addDeck = () =>
    patch({
      decks: [
        ...project.decks,
        {
          id: `deck${Date.now()}`,
          label: `Deck ${project.decks.length + 1}`,
          length: 4000,
          width: 3000,
          spacing: 600,
          firstOffset: 600,
          noSeams: false,
        },
      ],
    });
  const removeDeck = (i: number) => patch({ decks: project.decks.filter((_, idx) => idx !== i) });

  /**
   * Adjust the deck's board spacing to the largest value at or below the current
   * (target) spacing that divides the deck length into equal bays, and set the
   * first offset to match so the end bays are even too.
   */
  const autoFitSpacing = (i: number) => {
    const d = project.decks[i];
    const target = d.spacing > 0 ? d.spacing : 600;
    if (d.length <= 0) return;
    const bays = Math.max(1, Math.ceil(d.length / target)); // more bays ⇒ spacing ≤ target
    const s = Math.ceil(d.length / bays); // integer mm, ≤ target for an integer target
    updateDeck(i, { spacing: s, firstOffset: s });
  };

  // On-hand inventory editors
  const updateOnHand = (i: number, field: 'length' | 'quantity', v: number) =>
    patchPlank({ onHand: project.plank.onHand.map((l, idx) => (idx === i ? { ...l, [field]: v } : l)) });
  const addOnHand = () =>
    patchPlank({ onHand: [...project.plank.onHand, { length: 4800, quantity: 1 }] });
  const removeOnHand = (i: number) =>
    patchPlank({ onHand: project.plank.onHand.filter((_, idx) => idx !== i) });

  // Store (purchasable) editors
  const updateStore = (i: number, field: 'length' | 'pricePerUnit', v: number) =>
    patchPlank({ store: project.plank.store.map((l, idx) => (idx === i ? { ...l, [field]: v } : l)) });
  const addStore = () =>
    patchPlank({ store: [...project.plank.store, { length: 4200, pricePerUnit: 0 }] });
  const removeStore = (i: number) =>
    patchPlank({ store: project.plank.store.filter((_, idx) => idx !== i) });

  const mode = MODES.find((m) => m.value === project.stagger.mode)!;
  const widthFit = WIDTH_FITS.find((w) => w.value === project.widthFit)!;

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>DeckBuilder</h1>
        <p className="tagline">Plank layout & cut optimizer</p>

        {/* Session save / load */}
        <div className="session-row">
          <button className="btn secondary" onClick={saveSession} title="Save the whole session (decks, planks, settings) to a .deck file.">💾 Save .deck</button>
          <button className="btn secondary" onClick={() => fileRef.current?.click()} title="Load a previously saved .deck session file.">📂 Load .deck</button>
          <input ref={fileRef} type="file" accept=".deck,application/json" onChange={loadSession} style={{ display: 'none' }} />
        </div>

        {/* Seed navigation */}
        <div className="seed-nav">
          <button
            onClick={() => setSeed(project.stagger.seed - 1)}
            disabled={project.stagger.seed <= 1}
            title="Go back to the previous seed (pattern)"
          >
            ◀
          </button>
          <div className="seed-label" title="The current random seed. Same seed = same pattern.">
            <span>seed {project.stagger.seed}</span>
            <small>pattern</small>
          </div>
          <button
            onClick={() => setSeed(project.stagger.seed + 1)}
            title="Next seed — generate a new pattern"
          >
            ▶
          </button>
          <button
            onClick={() => setSeed(Math.floor(Math.random() * 99999) + 1)}
            title="Jump to a random seed"
          >
            🎲
          </button>
        </div>

        <h2>Decks</h2>
        {project.decks.map((d, i) => (
          <div key={d.id} className="deck-edit">
            <Text label="Name" hint="A label for this deck, shown above its plan." value={d.label} onChange={(v) => updateDeck(i, { label: v })} />
            <Num label="Length (mm)" hint="Deck size in the direction the planks run." value={d.length} onChange={(v) => updateDeck(i, { length: v })} />
            <Num label="Width (mm)" hint="Deck size across the planks (the number of rows)." value={d.width} onChange={(v) => updateDeck(i, { width: v })} />
            <Num label="Board spacing (mm)" hint="Backing-board (joist) spacing for THIS deck, centre to centre. Seams may only land on a board." value={d.spacing} onChange={(v) => updateDeck(i, { spacing: v })} />
            <Num label="First offset (mm)" hint="Distance from the deck edge to the first backing board." value={d.firstOffset} onChange={(v) => updateDeck(i, { firstOffset: v })} />
            <div className="field" title="For short decks: lay one full-length board per row with no butt joints. Each board must be at least as long as the deck. Backing-board spacing is then ignored for the layout.">
              <label>No seams (single boards)</label>
              <input type="checkbox" checked={d.noSeams} onChange={(e) => updateDeck(i, { noSeams: e.target.checked })} />
            </div>
            <button
              className="btn secondary"
              style={{ fontSize: 12, padding: 6 }}
              disabled={d.noSeams}
              onClick={() => autoFitSpacing(i)}
              title="Set the board spacing to the largest value at or below the current one that splits the deck length into equal bays (the first even fit under your target), and even out the end bays."
            >
              ⚙ Auto-fit even spacing
            </button>
            {project.decks.length > 1 && (
              <button className="btn secondary" onClick={() => removeDeck(i)} style={{ fontSize: 12, padding: 6 }}>Remove deck</button>
            )}
          </div>
        ))}
        <button className="btn secondary" onClick={addDeck}>+ Add deck</button>

        <h2>Plank</h2>
        <Num label="Width (mm)" hint="Face width of a single decking board." value={project.plank.width} onChange={(v) => patchPlank({ width: v })} />
        <Num label="Thickness (mm)" hint="Board thickness (used for the bill of materials only)." value={project.plank.thickness} onChange={(v) => patchPlank({ thickness: v })} />
        <div className="lengths">
          <div className="field"><label title="Planks you already own. These are used first, before buying anything.">On hand · length · qty</label></div>
          {project.plank.onHand.map((l, i) => (
            <div className="row" key={i}>
              <NumberBox value={l.length} title="Length of planks you have (mm)" onCommit={(v) => updateOnHand(i, 'length', v)} />
              <NumberBox value={l.quantity} title="How many of this length you have" onCommit={(v) => updateOnHand(i, 'quantity', v)} />
              <button onClick={() => removeOnHand(i)} title="Remove this inventory line">✕</button>
            </div>
          ))}
          <button className="btn secondary" onClick={addOnHand}>+ Add on-hand</button>
        </div>

        <div className="lengths">
          <div className="field"><label title="Plank lengths the store sells (assumed unlimited), each with a unit price. The app buys from these only to cover what your inventory can't.">Store · length · price</label></div>
          {project.plank.store.map((l, i) => (
            <div className="row" key={i}>
              <NumberBox value={l.length} title="Store plank length (mm)" onCommit={(v) => updateStore(i, 'length', v)} />
              <NumberBox value={l.pricePerUnit ?? 0} title="Price per plank" onCommit={(v) => updateStore(i, 'pricePerUnit', v)} />
              <button onClick={() => removeStore(i)} title="Remove this store length">✕</button>
            </div>
          ))}
          <button className="btn secondary" onClick={addStore}>+ Add store length</button>
        </div>

        <h2>Gaps & cutting</h2>
        <Num label="Side gap (mm)" hint="Gap between adjacent rows of boards (along the width)." value={project.gaps.sideGap} onChange={(v) => patchGaps({ sideGap: v })} />
        <Num label="End gap (mm)" hint="Expansion gap at a butt joint where two boards meet over a backing board." value={project.gaps.endGap} onChange={(v) => patchGaps({ endGap: v })} />
        <Num label="Kerf (mm)" hint="Material removed by the saw blade on every cut — real waste." value={project.cut.kerf} onChange={(v) => patchCut({ kerf: v })} />
        <Num label="Min reusable (mm)" hint="Offcuts shorter than this are treated as scrap rather than reusable stock." value={project.cut.minReusableOffcut} onChange={(v) => patchCut({ minReusableOffcut: v })} />
        <div className="field" title="If on, a kerf is also spent squaring the rough leading end of every fresh plank.">
          <label>Square lead end</label>
          <input type="checkbox" checked={project.cut.squareLeadingEnd} onChange={(e) => patchCut({ squareLeadingEnd: e.target.checked })} />
        </div>
        <div className="field">
          <label title="What to do with the leftover deck width that doesn't fill a whole board.">Edge fit</label>
          <select value={project.widthFit} title={widthFit.desc} onChange={(e) => patch({ widthFit: e.target.value as WidthFit })}>
            {WIDTH_FITS.map((w) => <option key={w.value} value={w.value} title={w.desc}>{w.label}</option>)}
          </select>
        </div>
        <div className="mode-help">{widthFit.desc}</div>

        <h2>Pattern</h2>
        <div className="field">
          <label title="How seams are arranged between rows. See the description below.">Stagger mode</label>
          <select value={project.stagger.mode} title={mode.desc} onChange={(e) => patchStag({ mode: e.target.value as StaggerMode })}>
            {MODES.map((m) => <option key={m.value} value={m.value} title={m.desc}>{m.label}</option>)}
          </select>
        </div>
        <div className="mode-help">{mode.desc}</div>
        <Num label="Min seam offset (mm)" hint="Minimum horizontal distance a seam must keep from any seam in an adjacent row." value={project.stagger.minSeamOffset} onChange={(v) => patchStag({ minSeamOffset: v })} />
        <Num label="Min piece (mm)" hint="No board piece may be shorter than this (anti-stub rule), for looks and strength." value={project.stagger.minPieceLength} onChange={(v) => patchStag({ minPieceLength: v })} />
        <Num label="Lookahead rows" hint="How many neighbouring rows the alignment check considers (e.g. 2 = compare against the two rows above)." value={project.stagger.lookahead} onChange={(v) => patchStag({ lookahead: v })} />
        <div className="field range" title="Trade off material waste against the look of the pattern.">
          <label>Waste ↔ Looks</label>
          <input type="range" min={0} max={1} step={0.05} value={project.stagger.wasteVsLooks}
            onChange={(e) => patchStag({ wasteVsLooks: +e.target.value })} />
        </div>
        <div className="tagline" style={{ textAlign: 'right' }}>
          {project.stagger.wasteVsLooks < 0.4 ? 'favour low waste' : project.stagger.wasteVsLooks > 0.6 ? 'favour looks' : 'balanced'}
        </div>
      </aside>

      <Results result={result} endGap={project.gaps.endGap} />
    </div>
  );
}

/**
 * Number input that commits only on blur or Enter — never on each keystroke —
 * so a half-typed value (e.g. "5" while typing "580") can't trigger a recompute.
 * Invalid/empty input reverts to the last committed value.
 */
function NumberBox({
  value,
  onCommit,
  title,
  className,
}: {
  value: number;
  onCommit: (v: number) => void;
  title?: string;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  // Commit on the native `change` event. This fires on blur (after typing) AND
  // on each up/down stepper click, but NOT on every keystroke (that's `input`).
  // So typing doesn't recompute, yet the arrow buttons do.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => {
      const n = parseFloat(el.value);
      if (!Number.isNaN(n)) {
        if (n !== value) onCommit(n);
      } else {
        setText(String(value)); // revert empty/invalid
      }
    };
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, [value, onCommit]);

  return (
    <input
      ref={ref}
      type="number"
      className={className}
      value={text}
      title={title}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => (focused.current = true)}
      onBlur={() => (focused.current = false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function Num({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field" title={hint}>
      <label>{label}</label>
      <NumberBox value={value} onCommit={onChange} title={hint} />
    </div>
  );
}

/** Text input that likewise commits on blur or Enter. */
function Text({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  return (
    <div className="field" title={hint}>
      <label>{label}</label>
      <input
        type="text"
        value={text}
        title={hint}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (text !== value) onChange(text);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}
