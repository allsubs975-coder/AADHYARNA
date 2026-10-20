/**
 * Comparison table behaviour: reveal only the columns for diamonds in the
 * visitor's compare list, keep the count and empty state in step, and let a
 * column be removed straight from the table header.
 *
 * Every column is server-rendered and hidden until selected — no product
 * payload is fetched or embedded beyond what the page already contains.
 */
import { compareLimit, features } from '../config/features';
import {
  LIST_CHANGE_EVENT,
  onListChange,
  pruneToInventory,
  toggleId,
} from '../lib/storage';

const tableWrap = document.querySelector<HTMLElement>('[data-compare-table]');
const countEl = document.querySelector<HTMLElement>('[data-compare-status]');
const emptyEl = document.querySelector<HTMLElement>('[data-compare-empty]');

if (tableWrap && features.compare) {
  const wrap = tableWrap;
  const cellsByCol = new Map<string, HTMLElement[]>();
  document.querySelectorAll<HTMLElement>('[data-col]').forEach((cell) => {
    const id = cell.dataset.col;
    if (!id) return;
    const list = cellsByCol.get(id);
    if (list) list.push(cell);
    else cellsByCol.set(id, [cell]);
  });
  const validIds = new Set(cellsByCol.keys());

  function apply(): void {
    const ids = pruneToInventory('compare', validIds);

    for (const [id, cells] of cellsByCol) {
      const show = ids.includes(id);
      for (const cell of cells) cell.hidden = !show;
    }

    wrap.hidden = ids.length === 0;
    if (emptyEl) emptyEl.hidden = ids.length !== 0;
    if (countEl) {
      countEl.textContent =
        ids.length === 0 ? '' : `Comparing ${ids.length} of ${compareLimit} diamonds`;
    }
  }

  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-compare-remove]');
    const id = button?.getAttribute('data-compare-remove');
    if (!id || !validIds.has(id)) return;

    const ids = toggleId('compare', id);
    window.dispatchEvent(
      new CustomEvent(LIST_CHANGE_EVENT, { detail: { key: 'compare', id, ids } }),
    );
    apply();
  });

  window.addEventListener(LIST_CHANGE_EVENT, (event) => {
    const detail = (event as CustomEvent).detail as { key?: string } | undefined;
    if (detail?.key === 'compare') apply();
  });
  onListChange('compare', apply);

  apply();
}
