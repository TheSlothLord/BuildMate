import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { Launcher } from './apps/launcher/Launcher';
import { App as DeckApp } from './apps/deck/ui/App';
import { InstallPrompt } from './InstallPrompt';
import './shared/styles.css';

// Disabled while all Vector apps share one hostname (vector.taile4f8f2.ts.net):
// Android identifies an installed PWA by host only, so only ONE app per host can
// install — the Vector portal is that app; BuildMate is used through it in the
// browser. Flip back to true once BuildMate has its own hostname.
const SHOW_INSTALL_PROMPT = false;

const routeOf = () => location.hash.replace(/^#\/?/, '');

/** Tiny hash router: '' → launcher, 'deck' → deck builder. */
function Root() {
  const [route, setRoute] = useState(routeOf);
  useEffect(() => {
    const onHash = () => setRoute(routeOf());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route === 'deck') return <DeckApp onHome={() => { location.hash = ''; }} />;
  return <Launcher onOpen={(id) => { location.hash = id; }} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
    {SHOW_INSTALL_PROMPT && <InstallPrompt />}
  </React.StrictMode>,
);

// Register the service worker for PWA install + offline support. Web browsers
// only — skip the Electron desktop app and Capacitor native builds (they load
// from file:// and don't need it).
const isElectron = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
if (
  'serviceWorker' in navigator &&
  !Capacitor.isNativePlatform() &&
  !isElectron &&
  location.protocol.startsWith('http')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
