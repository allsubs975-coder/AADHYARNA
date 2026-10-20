/**
 * Wishlist / comparison persistence (localStorage, no customer accounts).
 *
 * Defensive by design:
 *  - malformed JSON never throws;
 *  - non-array and non-string entries are discarded;
 *  - duplicates are removed;
 *  - the compare list is capped at `compareLimit`;
 *  - storage that is unavailable (private mode, blocked cookies) falls back
 *    to an in-memory list so the UI keeps working for the session.
 *
 * Persisted IDs are validated against the live inventory when read by each
 * page, so diamonds that leave the catalogue disappear from saved lists
 * instead of producing broken entries.
 */

import { compareLimit, features } from '../config/features';

export type ListKey = 'wishlist' | 'compare';

/**
 * Same-page notification fired after every list change (the native `storage`
 * event only fires in *other* tabs). Payload: `{ key, id, ids }`.
 */
export const LIST_CHANGE_EVENT = 'aadhyarna:list-change';

const PREFIX = 'aadhyarna.';
const SUFFIX = '.v1';

const memory: Record<string, string[]> = {};

export function storageKey(key: ListKey): string {
  return `${PREFIX}${key}${SUFFIX}`;
}

function capacity(key: ListKey): number {
  return key === 'compare' ? compareLimit : 200;
}

function available(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

export function readIds(key: ListKey): string[] {
  if (!features[key]) return [];
  const id = storageKey(key);

  if (!available()) return dedupe(memory[key] ?? []).slice(0, capacity(key));

  try {
    const raw = window.localStorage.getItem(id);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cleaned = parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    const result = dedupe(cleaned.map((v) => v.trim())).slice(0, capacity(key));
    if (result.length !== parsed.length) writeIds(key, result); // self-heal
    return result;
  } catch {
    return [];
  }
}

export function writeIds(key: ListKey, ids: readonly string[]): void {
  const clean = dedupe(ids.filter((v) => typeof v === 'string' && v !== '')).slice(
    0,
    capacity(key),
  );
  memory[key] = clean;
  if (!available()) return;
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(clean));
  } catch {
    /* quota or blocked storage — in-memory copy already updated */
  }
}

/** Adds the id if missing, removes it if present. Returns the new list. */
export function toggleId(key: ListKey, id: string): string[] {
  const current = readIds(key);
  const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
  writeIds(key, next);
  return next;
}

export function clearList(key: ListKey): string[] {
  writeIds(key, []);
  return [];
}

export function hasId(key: ListKey, id: string): boolean {
  return readIds(key).includes(id);
}

/** Removes ids that are no longer part of the catalogue. */
export function pruneToInventory(key: ListKey, validIds: ReadonlySet<string>): string[] {
  const current = readIds(key);
  const pruned = current.filter((id) => validIds.has(id));
  if (pruned.length !== current.length) writeIds(key, pruned);
  return pruned;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Cross-tab count refresh helper. Returns an unsubscribe function. */
export function onListChange(key: ListKey, handler: (ids: string[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: StorageEvent) => {
    if (event.key === null || event.key === storageKey(key)) handler(readIds(key));
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
