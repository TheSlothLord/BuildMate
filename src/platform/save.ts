// Cross-platform file save.
// - Native (Android/iOS via Capacitor): write to the cache dir, then open the
//   system share sheet so the user can save it to Files/Drive/email/etc.
// - Web / Electron: a normal browser download.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function saveFile(filename: string, blob: Blob): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    try {
      await Share.share({ title: filename, url: uri, dialogTitle: `Save ${filename}` });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1)); // strip "data:...;base64,"
    };
    r.readAsDataURL(blob);
  });
}
