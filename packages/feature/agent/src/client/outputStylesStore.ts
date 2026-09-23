'use client';

/**
 * One shared copy of the global output-styles list for every mounted chat tab.
 *
 * Every tab's toolbar shows the NAME of its selected style, so each needs the
 * list even while its menu is closed. A per-picker fetch would issue one GET per
 * open tab on load and leave the other tabs' labels stale after an edit; a module
 * store loads once and pushes the saved list to every picker at the same time.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { BrowserRuntime } from '@cockpit/effect-runtime';
import { loadOutputStylesConfig, saveOutputStylesConfig, type OutputStyle } from './effect/agentClient';

const EMPTY: OutputStyle[] = [];
let styles: OutputStyle[] = EMPTY;
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const setStyles = (next: OutputStyle[]) => {
  styles = next;
  listeners.forEach((l) => l());
};

/** Fetch from disk. `force` re-reads even when already loaded (menu open), so a
 *  hand edit of output-styles.json shows up without a reload. */
export function refreshOutputStyles(force = false): Promise<void> {
  if (loaded && !force) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    const exit = await BrowserRuntime.runPromiseExit(loadOutputStylesConfig());
    inflight = null;
    if (exit._tag === 'Failure') {
      console.error('Failed to load output styles:', exit.cause);
      return;
    }
    loaded = true;
    setStyles(exit.value.styles ?? EMPTY);
  })();
  return inflight;
}

/** Persist the whole list; on success every picker adopts the server's normalized copy. */
export async function saveOutputStyles(next: OutputStyle[]): Promise<boolean> {
  const exit = await BrowserRuntime.runPromiseExit(saveOutputStylesConfig(next));
  if (exit._tag === 'Failure') {
    console.error('Failed to save output styles:', exit.cause);
    return false;
  }
  loaded = true;
  setStyles(exit.value.styles ?? EMPTY);
  return true;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const getSnapshot = () => styles;

export function useOutputStyles(): OutputStyle[] {
  useEffect(() => { void refreshOutputStyles(); }, []);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
