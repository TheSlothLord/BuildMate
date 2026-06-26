// Internal project library — named decks saved to device storage.
// Native (Android/iOS): Capacitor Preferences. Web/Electron: localStorage.
// This is separate from .deck import/export, which moves projects between devices.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { Project } from '../model/types';

const native = Capacitor.isNativePlatform();
const INDEX_KEY = 'deckbuilder:index';
const itemKey = (name: string) => `deckbuilder:proj:${name}`;

async function getRaw(key: string): Promise<string | null> {
  if (native) return (await Preferences.get({ key })).value ?? null;
  return localStorage.getItem(key);
}
async function setRaw(key: string, value: string): Promise<void> {
  if (native) await Preferences.set({ key, value });
  else localStorage.setItem(key, value);
}
async function removeRaw(key: string): Promise<void> {
  if (native) await Preferences.remove({ key });
  else localStorage.removeItem(key);
}

export async function listProjects(): Promise<string[]> {
  const raw = await getRaw(INDEX_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]).sort((a, b) => a.localeCompare(b)) : [];
  } catch {
    return [];
  }
}

export async function saveProject(name: string, project: Project): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('Name required');
  await setRaw(itemKey(clean), JSON.stringify(project));
  const names = await listProjects();
  if (!names.includes(clean)) {
    names.push(clean);
    await setRaw(INDEX_KEY, JSON.stringify(names));
  }
}

export async function loadProject(name: string): Promise<Project | null> {
  const raw = await getRaw(itemKey(name));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export async function deleteProject(name: string): Promise<void> {
  await removeRaw(itemKey(name));
  const names = (await listProjects()).filter((n) => n !== name);
  await setRaw(INDEX_KEY, JSON.stringify(names));
}
