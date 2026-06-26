import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Launcher } from './apps/launcher/Launcher';
import { App as DeckApp } from './apps/deck/ui/App';
import './shared/styles.css';

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
  </React.StrictMode>,
);
