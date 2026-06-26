// BuildMate launcher — pick a tool. The deck builder is live; the rest are
// placeholders for tools to come (each will be its own app under src/apps/).

interface Tool {
  id: string;
  name: string;
  desc: string;
  icon: string;
  ready: boolean;
}

const TOOLS: Tool[] = [
  { id: 'deck', name: 'Deck builder', desc: 'Plank layout & cut optimizer for decks.', icon: '🪵', ready: true },
  { id: 'siding', name: 'Wall siding', desc: 'Cladding board layout & cut lists.', icon: '🧱', ready: false },
  { id: 'furniture', name: 'Furniture', desc: 'Tables, chairs, benches, sofas…', icon: '🪑', ready: false },
  { id: 'fence', name: 'Fence', desc: 'Pickets, rails & posts.', icon: '🚧', ready: false },
];

export function Launcher({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className="launcher">
      <header className="launcher-head">
        <h1>🛠️ BuildMate <span className="ver">v{__APP_VERSION__}</span></h1>
        <p className="tagline">Layout &amp; cut-list tools for building projects — pick one to start.</p>
      </header>
      <div className="tiles">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tile${t.ready ? '' : ' soon'}`}
            disabled={!t.ready}
            onClick={t.ready ? () => onOpen(t.id) : undefined}
            title={t.ready ? `Open ${t.name}` : `${t.name} — coming soon`}
          >
            <div className="tile-icon">{t.icon}</div>
            <div className="tile-name">{t.name}</div>
            <div className="tile-desc">{t.desc}</div>
            {!t.ready && <div className="tile-badge">Coming soon</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
