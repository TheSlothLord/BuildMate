import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Capacitor } from '@capacitor/core';

// Offers to install BuildMate to the home screen whenever it isn't already
// installed — native prompt on Android/Chrome, short manual instructions
// otherwise (iOS Safari, in-app/Custom-Tab contexts where no prompt fires).
// Skipped in the Electron/Capacitor native builds. Only THIS app being installed
// hides it (via getInstalledRelatedApps) — other installed apps don't.

const KEY = 'buildmate-a2hs-dismissed';
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isElectron = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
// Only offer install on phones/tablets — desktop browsers don't need it.
const isMobile = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || isIOS();

type BIP = Event & { prompt: () => void; userChoice: Promise<unknown> };

async function appInstalled(): Promise<boolean> {
  if (isStandalone()) return true;
  const nav = navigator as unknown as { getInstalledRelatedApps?: () => Promise<unknown[]> };
  if (nav.getInstalledRelatedApps) {
    try { return (await nav.getInstalledRelatedApps()).length > 0; } catch { /* ignore */ }
  }
  return false;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIP | null>(null);
  const [ready, setReady] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || isElectron) return;
    if (localStorage.getItem(KEY) === '1') return;
    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e as BIP); };
    window.addEventListener('beforeinstallprompt', onBIP);
    let cancelled = false;
    let t = 0;
    appInstalled().then((inst) => {
      if (!cancelled && !inst) t = window.setTimeout(() => { if (!cancelled) setReady(true); }, 1200);
    });
    return () => { cancelled = true; window.removeEventListener('beforeinstallprompt', onBIP); clearTimeout(t); };
  }, []);

  const dismiss = () => { setReady(false); try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } };
  const add = () => {
    if (deferred) { deferred.prompt(); setDeferred(null); setReady(false); }
    else setManual(true);
  };

  if (!ready || isStandalone() || !isMobile()) return null;

  const wrap: CSSProperties = {
    position: 'fixed', left: '50%', transform: 'translateX(-50%)',
    top: 'calc(env(safe-area-inset-top) + 10px)', zIndex: 80,
    width: 'calc(100% - 24px)', maxWidth: 420,
    display: 'flex', flexDirection: 'column', gap: '0.75rem',
    padding: '14px 16px', borderRadius: 14, background: '#1c1a15',
    border: '1.5px solid #e8782f', boxShadow: '0 16px 44px rgba(0,0,0,.6)',
    color: '#f0ece3', fontFamily: 'system-ui, sans-serif',
    animation: 'bm-slidedown .3s ease',
  };
  const kf = <style>{'@keyframes bm-slidedown{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}'}</style>;
  const btn: CSSProperties = { font: 'inherit', fontSize: '0.85rem', padding: '0.45rem 0.8rem', borderRadius: 9, cursor: 'pointer' };
  const no: CSSProperties = { ...btn, border: '1px solid #3a352b', background: 'transparent', color: '#f0ece3' };
  const yes: CSSProperties = { ...btn, border: 0, fontWeight: 600, background: '#e8782f', color: '#1a1206' };

  if (manual) {
    return (
      <div style={wrap} role="dialog">
        {kf}
        <span style={{ fontSize: '0.9rem', lineHeight: 1.55 }}>
          {isIOS()
            ? <>In Safari, tap <b>Share</b> then <b>Add to Home Screen</b> to install BuildMate.</>
            : <>Open the menu (<b>⋮</b>) and tap <b>Install app</b> (or <b>Add to Home screen</b>). If you only see <b>Open Vector</b> / no install option, tap <b>Open in Chrome</b> first, then install.</>}
        </span>
        <button style={{ ...yes, alignSelf: 'flex-end' }} onClick={dismiss}>Got it</button>
      </div>
    );
  }
  return (
    <div style={wrap} role="dialog">
      {kf}
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}>
        <img src="./buildmate-icon.svg" alt="" style={{ width: '2rem', height: '2rem', borderRadius: 8, flex: '0 0 auto' }} />
        Add BuildMate to your home screen?
      </span>
      <span style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button style={no} onClick={dismiss}>Not now</button>
        <button style={yes} onClick={add}>Add</button>
      </span>
    </div>
  );
}
