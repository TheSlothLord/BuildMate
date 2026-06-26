// Update check — compares the app's built-in version against the latest GitHub
// release. Read-only and unauthenticated, so the repo/releases must be public.
const REPO = 'TheSlothLord/DeckBuilder';

export const APP_VERSION = __APP_VERSION__;
export const RELEASES_URL = `https://github.com/${REPO}/releases`;

export interface UpdateInfo {
  latest: string; // e.g. "1.0.2"
  url: string; // release page to download from
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const latest = String(data.tag_name ?? '').replace(/^v/i, '').trim();
    if (latest && isNewer(latest, APP_VERSION)) {
      return { latest, url: typeof data.html_url === 'string' ? data.html_url : RELEASES_URL };
    }
    return null;
  } catch {
    return null; // offline / rate-limited / no releases — fail quietly
  }
}

/** Numeric dotted-version compare: is `a` strictly newer than `b`? */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
