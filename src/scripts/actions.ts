/**
 * Client behaviour shared by every page:
 *   - wishlist / compare toggle buttons (event-delegated, idempotent)
 *   - header counters
 *   - an aria-live toast for limit feedback
 *
 * Nothing here renders product data — cards, detail tables and comparison
 * rows are server-rendered. This script only keeps the buttons, counters and
 * the visitor's saved lists in sync.
 */

import { compareLimit, features } from '../config/features';
import { LIST_CHANGE_EVENT, readIds, toggleId, onListChange, type ListKey } from '../lib/storage';

const LIST_KEYS: readonly ListKey[] = ['wishlist', 'compare'];

const EVENT = LIST_CHANGE_EVENT;

function countSelector(key: ListKey): string {
  return `[data-${key}-count]`;
}

function refreshCounters(): void {
  for (const key of LIST_KEYS) {
    const total = readIds(key).length;
    document.querySelectorAll<HTMLElement>(countSelector(key)).forEach((el) => {
      el.textContent = String(total);
      el.dataset.empty = total === 0 ? 'true' : 'false';
    });
  }
}

function refreshToggles(): void {
  const active: Record<ListKey, Set<string>> = {
    wishlist: new Set(readIds('wishlist')),
    compare: new Set(readIds('compare')),
  };

  document
    .querySelectorAll<HTMLElement>('[data-wishlist-toggle], [data-compare-toggle]')
    .forEach((el) => {
      const key: ListKey = el.hasAttribute('data-wishlist-toggle') ? 'wishlist' : 'compare';
      const id = el.getAttribute(key === 'wishlist' ? 'data-wishlist-toggle' : 'data-compare-toggle');
      if (!id) return;

      const on = active[key].has(id);
      el.setAttribute('aria-pressed', String(on));

      /* The button's accessible name is its own text content (plus the sr-only
         Stone ID), so it stays in step with the visible label automatically. */
      const text = el.querySelector<HTMLElement>('[data-toggle-text]');
      if (text) {
        text.textContent = on
          ? key === 'wishlist'
            ? 'Saved'
            : 'Added'
          : key === 'wishlist'
            ? 'Save'
            : 'Compare';
      }

      const icon = el.querySelector('svg');
      if (icon && key === 'wishlist') icon.setAttribute('fill', on ? 'currentColor' : 'none');
    });
}

function refresh(): void {
  refreshCounters();
  refreshToggles();
}

/* ------------------------------------------------------------------ toast */

let toastTimer: number | undefined;

function showToast(message: string): void {
  const toast = document.querySelector<HTMLElement>('[data-toast]');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.visible = 'true';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.dataset.visible = 'false';
  }, 4000);
}

/* ------------------------------------------------------------------ events */

document.addEventListener('click', (event) => {
  const target = (event.target as Element | null)?.closest<HTMLElement>(
    '[data-wishlist-toggle], [data-compare-toggle]',
  );
  if (!target) return;

  const key: ListKey = target.hasAttribute('data-wishlist-toggle') ? 'wishlist' : 'compare';
  if (!features[key]) return;

  const attr = key === 'wishlist' ? 'data-wishlist-toggle' : 'data-compare-toggle';
  const id = target.getAttribute(attr);
  if (!id) return;

  if (key === 'compare') {
    const current = readIds('compare');
    if (!current.includes(id) && current.length >= compareLimit) {
      showToast(`You can compare up to ${compareLimit} diamonds. Remove one to add ${id}.`);
      return;
    }
  }

  const next = toggleId(key, id);
  refresh();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, id, ids: next } }));
});

window.addEventListener(EVENT, refresh);
onListChange('wishlist', refreshCounters);
onListChange('compare', refreshCounters);

/* ------------------------------------------------------------------ share */

async function sharePage(): Promise<void> {
  const url = window.location.href;
  const title = document.title;
  const shareData: ShareData = { title, url };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      /* visitor cancelled the sheet — fall through to the copy fallback only
         when sharing is genuinely unavailable */
      if ((error as DOMException)?.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard.');
  } catch {
    showToast('Copy this page\u2019s address from the browser bar.');
  }
}

document.addEventListener('click', (event) => {
  const target = (event.target as Element | null)?.closest('[data-share]');
  if (target) void sharePage();
});

/* First paint: counters and pressed states before the visitor interacts. */
refresh();
