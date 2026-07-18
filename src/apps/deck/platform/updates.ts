// Update check + release info — compares the app's built-in version against the
// latest GitHub release. Read-only and unauthenticated, so the repo/releases
// must be public.
const REPO = 'TheSlothLord/BuildMate';

export const APP_VERSION = __APP_VERSION__;

// The BuildMate website (self-hosted). The "update available" notice and the
// in-app download links point here / to the releases list rather than straight
// at raw GitHub pages.
export const SITE_URL = 'https://buildmate.markusmedk.no';
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
export const LATEST_RELEASE_URL = `https://github.com/${REPO}/releases/latest`;

export interface UpdateInfo {
  latest: string; // e.g. "1.0.2"
  url: string; // where to send the user to get it
}

const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const latest = String(data.tag_name ?? '').replace(/^v/i, '').trim();
    if (latest && isNewer(latest, APP_VERSION)) {
      // Send users to the BuildMate site to download, not the GitHub page.
      return { latest, url: SITE_URL };
    }
    return null;
  } catch {
    return null; // offline / rate-limited / no releases — fail quietly
  }
}

export interface LatestRelease {
  version: string; // e.g. "1.9.0"
  apkUrl: string | null; // direct Android download, if present
  winUrl: string | null; // direct Windows download, if present
  pageUrl: string; // the release page (fallback)
}

/** Fetch the latest release and pick out the Android (.apk) and Windows (.zip) assets. */
export async function getLatestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const assets: Array<{ name?: string; browser_download_url?: string }> = Array.isArray(data.assets)
      ? data.assets
      : [];
    const find = (re: RegExp): string | null => {
      const a = assets.find((x) => re.test(String(x?.name ?? '')));
      return a && typeof a.browser_download_url === 'string' ? a.browser_download_url : null;
    };
    return {
      version: String(data.tag_name ?? '').replace(/^v/i, '').trim(),
      apkUrl: find(/\.apk$/i),
      winUrl: find(/win.*\.zip$/i) ? find(/win.*\.zip$/i) : find(/\.zip$/i),
      pageUrl: typeof data.html_url === 'string' ? data.html_url : LATEST_RELEASE_URL,
    };
  } catch {
    return null;
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
