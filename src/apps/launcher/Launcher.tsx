// BuildMate launcher — pick a tool. The deck builder is live; the rest are
// placeholders for tools to come (each will be its own app under src/apps/).
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getLatestRelease, RELEASES_URL, LATEST_RELEASE_URL, type LatestRelease } from '../deck/platform/updates';

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

// Show the native-app downloads only in a normal web browser — not when already
// running inside the Android/iOS (Capacitor) or Windows (Electron) build.
const isElectron = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
const showDownloads = !Capacitor.isNativePlatform() && !isElectron;

function Downloads() {
  const [rel, setRel] = useState<LatestRelease | null>(null);
  useEffect(() => {
    getLatestRelease().then(setRel);
  }, []);

  return (
    <section className="downloads">
      <h2>Get the app</h2>
      <p className="tagline">
        Install BuildMate on your device{rel?.version ? ` — latest is v${rel.version}` : ''}.
      </p>
      <div className="dl-buttons">
        <a className="btn" href={rel?.apkUrl ?? LATEST_RELEASE_URL} target="_blank" rel="noreferrer">
          📱 Download for Android
        </a>
        <a className="btn" href={rel?.winUrl ?? LATEST_RELEASE_URL} target="_blank" rel="noreferrer">
          🪟 Download for Windows
        </a>
      </div>
      <a className="dl-older" href={RELEASES_URL} target="_blank" rel="noreferrer">
        Older versions &amp; release notes →
      </a>
    </section>
  );
}

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
      {showDownloads && <Downloads />}
    </div>
  );
}
