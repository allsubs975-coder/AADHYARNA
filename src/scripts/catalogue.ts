/**
 * Catalogue behaviour: read filter state from the URL, apply it to the
 * server-rendered cards, keep every control copy in sync, and reflect the
 * state back into the address bar.
 *
 * No product data is shipped to the client — the cards in the DOM are the
 * data source (they carry the filterable public fields as data attributes).
 */

import {
  applyFilters,
  activeChips,
  clearAllFilters,
  emptyFilterState,
  parseFilters,
  removeChip,
  serializeFilters,
  type ActiveChip,
  type FilterState,
  type SortId,
} from '../lib/filters';
import type { Diamond } from '../lib/types';
import { LIST_CHANGE_EVENT, onListChange, pruneToInventory } from '../lib/storage';
import { familyLabel } from '../config/shapes';

const mainForm = document.querySelector<HTMLFormElement>('[data-filter-form]');
const drawerForm = document.querySelector<HTMLFormElement>('[data-drawer-form]');

if (mainForm) {
  const form = mainForm;
  const drawer = drawerForm;
  const pathFamily = form.dataset.pathFamily ?? '';
  /* /wishlist renders the same catalogue restricted to the visitor's saved
     list — filters, sort and search then work on top of that set. */
  const savedOnly = form.dataset.savedOnly === 'true';
  const countEl = document.querySelector<HTMLElement>('[data-result-count]');
  const chipsEl = document.querySelector<HTMLElement>('[data-chips]');
  const emptyEl = document.querySelector<HTMLElement>('[data-empty-state]');
  const badgeEl = document.querySelector<HTMLElement>('[data-filter-badge]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-filters-dialog]');
  const moreWrap = document.querySelector<HTMLElement>('[data-show-more-wrap]');
  const moreBtn = document.querySelector<HTMLButtonElement>('[data-show-more]');
  const pills = [...document.querySelectorAll<HTMLButtonElement>('[data-shape-pill]')];
  /* Sticky-bar sort select — a UI mirror of the primary #cat-sort so state
     is only ever read from one place. */
  const sortM = document.querySelector<HTMLSelectElement>('#cat-sort-m');

  /* Progressive reveal: the grid shows PAGE_SIZE matches at a time so a
     145-card list never becomes a 40 000-pixel scroll. Without JavaScript
     every card stays visible — `hidden` is only ever set from here. */
  const PAGE_SIZE = 24;
  let visibleLimit = PAGE_SIZE;

  /* ------------------------------------------------------------- records */

  const toNumber = (value: string | undefined): number | null => {
    if (value === undefined || value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  interface Record_ {
    id: string;
    el: HTMLElement;
    d: Diamond;
  }

  const records: Record_[] = [...document.querySelectorAll<HTMLElement>('[data-diamond-card][data-family]')]
    .map((el): Record_ => {
      const ds = el.dataset;
      return {
        id: ds.id ?? '',
        el,
        d: {
          id: ds.id ?? '',
          availability: ds.availability ?? '',
          shape: ds.shape ?? '',
          shapeFamily: ds.family ?? '',
          weight: toNumber(ds.weight) ?? 0,
          color: ds.color ?? '',
          colorType: ds.colorType === 'fancy' ? 'fancy' : 'letter',
          clarity: ds.clarity ?? '',
          cut: null,
          polish: ds.polish || null,
          symmetry: ds.sym || null,
          fluorescence: ds.fl || null,
          measurements: '',
          depth: toNumber(ds.depth),
          table: toNumber(ds.table),
          hasReport: ds.report === 'yes',
        },
      };
    })
    .filter((r) => r.id !== '');

  const total = records.length;
  /* Denominator shown to the visitor: the whole inventory, even on a family
     page where only that family's cards exist in the DOM. */
  const totalAll = Number(form.dataset.totalAll) || total;

  /* ----------------------------------------------------------- saved list */

  let savedIds = new Set<string>();

  function refreshSaved(): void {
    if (!savedOnly) return;
    const valid = new Set(records.map((r) => r.id));
    savedIds = new Set(pruneToInventory('wishlist', valid));
  }

  function savedCandidates(): Diamond[] {
    return records.map((r) => r.d).filter((d) => savedIds.has(d.id));
  }

  /* --------------------------------------------------------------- state */

  const NUMBER_FIELDS = [
    'caratMin',
    'caratMax',
    'depthMin',
    'depthMax',
    'tableMin',
    'tableMax',
  ] as const;

  function readScope(scope: ParentNode): FilterState {
    const state = emptyFilterState();

    scope.querySelectorAll<HTMLInputElement>('[data-filter-input]').forEach((input) => {
      const name = input.name;
      if (!name) return;

      if (input.type === 'checkbox') {
        if (!input.checked) return;
        switch (name) {
          case 'family':
            state.families.push(input.value);
            break;
          case 'color':
            state.colors.push(input.value);
            break;
          case 'clarity':
            state.clarities.push(input.value);
            break;
          case 'polish':
            state.polishes.push(input.value);
            break;
          case 'sym':
            state.symmetries.push(input.value);
            break;
          case 'fl':
            state.fluorescent.push(input.value);
            break;
          case 'availability':
            state.availability.push(input.value);
            break;
          default:
            break;
        }
        return;
      }

      if (input.type === 'radio') {
        if (name === 'report' && input.checked) {
          state.report = input.value === 'yes' || input.value === 'no' ? input.value : 'any';
        }
        return;
      }

      if ((NUMBER_FIELDS as readonly string[]).includes(name)) {
        const key = name as (typeof NUMBER_FIELDS)[number];
        state[key] = toNumber(input.value);
        return;
      }

      if (name === 'q') state.q = input.value.trim();
      else if (name === 'sort') state.sort = input.value as SortId;
      else if (name === 'shape') state.shape = input.value.trim();
    });

    return state;
  }

  /** Filter inputs live in both copies; q/sort exist only in the main form. */
  function currentState(scope: ParentNode): FilterState {
    const state = readScope(scope);
    const base = readScope(form);
    state.q = base.q;
    state.sort = base.sort;
    state.shape = base.shape;
    return state;
  }

  function syncControls(state: FilterState): void {
    const scopes: ParentNode[] = [form, ...(drawer ? [drawer] : [])];

    for (const scope of scopes) {
      scope.querySelectorAll<HTMLInputElement>('[data-filter-input]').forEach((input) => {
        const name = input.name;
        if (!name) return;

        if (input.type === 'checkbox') {
          const list = multiValues(state, name);
          input.checked = list.includes(input.value);
          return;
        }
        if (input.type === 'radio') {
          input.checked = name === 'report' ? input.value === state.report : input.checked;
          return;
        }
        if ((NUMBER_FIELDS as readonly string[]).includes(name)) {
          const key = name as (typeof NUMBER_FIELDS)[number];
          const value = state[key];
          input.value = value === null ? '' : String(value);
          return;
        }
        if (name === 'q') input.value = state.q;
        else if (name === 'sort') input.value = state.sort;
        else if (name === 'shape') input.value = state.shape;
      });
    }

    for (const btn of pills) {
      const id = btn.dataset.shapePill;
      btn.setAttribute('aria-pressed', id !== undefined && state.families.includes(id) ? 'true' : 'false');
    }

    if (sortM) sortM.value = state.sort;
  }

  function multiValues(state: FilterState, name: string): string[] {
    switch (name) {
      case 'family':
        return state.families;
      case 'color':
        return state.colors;
      case 'clarity':
        return state.clarities;
      case 'polish':
        return state.polishes;
      case 'sym':
        return state.symmetries;
      case 'fl':
        return state.fluorescent;
      case 'availability':
        return state.availability;
      default:
        return [];
    }
  }

  /* ----------------------------------------------------------------- URL */

  function urlFor(state: FilterState): string {
    const onlyPathFamily =
      pathFamily !== '' && state.families.length === 1 && state.families[0] === pathFamily;

    /* The path carries the family while the selection matches it exactly;
       anything else moves the state into the query string on /diamonds. */
    let pathname = window.location.pathname;
    if (pathFamily !== '') {
      pathname = onlyPathFamily ? `/diamonds/family/${pathFamily}/` : '/diamonds';
    }

    const forQuery: FilterState = onlyPathFamily ? { ...state, families: [] } : state;

    const query = serializeFilters(forQuery);
    return query ? `${pathname}?${query}` : pathname;
  }

  function pushUrl(state: FilterState): void {
    const next = urlFor(state);
    const nextPath = next.split('?')[0];
    const current = `${window.location.pathname}${window.location.search}`;

    /* A family page only holds that family's cards: when the selection no
       longer matches the path, load the matching page instead of filtering
       cards that are not there. */
    if (nextPath !== window.location.pathname) {
      window.location.assign(next);
      return;
    }
    if (next !== current) window.history.replaceState(null, '', next);
  }

  /* -------------------------------------------------------------- chips */

  function chipText(chip: ActiveChip): string {
    if (chip.text) return chip.text;
    if (chip.key === 'family') return `Shape: ${familyLabel(chip.value)}`;
    return `${chip.key}: ${chip.value}`;
  }

  function renderChips(state: FilterState): void {
    if (!chipsEl) return;
    chipsEl.textContent = '';

    const chips = activeChips(state);

    for (const chip of chips) {
      const text = chipText(chip);
      const el = document.createElement('span');
      el.className = 'chip';

      const label = document.createElement('span');
      label.className = 'chip__label';
      label.textContent = text;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'chip__remove';
      remove.dataset.chipKey = chip.key;
      remove.dataset.chipValue = chip.value;
      remove.setAttribute('aria-label', `Remove filter: ${text}`);
      remove.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

      el.append(label, remove);
      chipsEl.append(el);
    }

    if (chips.length > 0) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn btn--ghost btn--sm';
      clear.dataset.clear = '';
      clear.textContent = 'Clear all';
      chipsEl.append(clear);
    }

    if (badgeEl) {
      badgeEl.hidden = chips.length === 0;
      badgeEl.textContent = String(chips.length);
    }
  }

  /* --------------------------------------------------------------- apply */

  function apply(state: FilterState, options: { updateUrl?: boolean } = {}): void {
    const matched = applyFilters(savedOnly ? savedCandidates() : records.map((r) => r.d), state);
    /* applyFilters returns the sorted order — it drives `style.order` so the
       grid follows the chosen sort without moving nodes in the DOM. */
    const orderById = new Map(matched.map((d, i) => [d.id, i]));

    for (const record of records) {
      const order = orderById.get(record.id);
      const visible = order !== undefined && order < visibleLimit;
      record.el.hidden = !visible;
      record.el.style.order = order === undefined ? '' : String(order);
    }

    if (moreWrap && moreBtn) {
      const remaining = Math.max(0, matched.length - visibleLimit);
      moreWrap.hidden = remaining === 0;
      moreBtn.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more`;
    }

    if (countEl) {
      const denominator = savedOnly ? savedIds.size : totalAll;
      countEl.textContent = `Showing ${matched.length} of ${denominator} diamonds`;
    }
    if (emptyEl) {
      emptyEl.hidden = matched.length !== 0;
      const title = emptyEl.querySelector<HTMLElement>('[data-empty-title]');
      if (title) {
        title.textContent =
          savedOnly && savedIds.size === 0
            ? 'Nothing saved yet'
            : savedOnly
              ? 'No saved diamonds match these filters'
              : 'No diamonds match these filters';
      }
    }

    renderChips(state);
    if (options.updateUrl !== false) pushUrl(state);
  }

  function refresh(scope: ParentNode, updateUrl = true): void {
    visibleLimit = PAGE_SIZE;
    const state = currentState(scope);
    syncControls(state);
    apply(state, { updateUrl });
  }

  /* -------------------------------------------------------------- events */

  const debounceTimers = new WeakMap<HTMLInputElement, number>();

  form.addEventListener('change', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('[data-filter-input]')) refresh(form);
  });

  sortM?.addEventListener('change', () => {
    const primary = form.querySelector<HTMLSelectElement>('#cat-sort');
    if (primary) primary.value = sortM.value;
    refresh(form);
  });

  drawer?.addEventListener('change', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('[data-filter-input]')) refresh(drawer);
  });

  const onDebouncedInput = (scope: ParentNode) => (event: Event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target || !target.matches('[data-filter-input]')) return;
    if (target.type !== 'search' && target.type !== 'number' && target.type !== 'text') return;

    window.clearTimeout(debounceTimers.get(target));
    const timer = window.setTimeout(() => refresh(scope), 220);
    debounceTimers.set(target, timer);
  };

  form.addEventListener('input', onDebouncedInput(form));
  drawer?.addEventListener('input', onDebouncedInput(drawer));

  function onSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const submitted = event.currentTarget as HTMLFormElement;
    refresh(submitted);
    if (dialog?.open) dialog.close();
  }

  form.addEventListener('submit', onSubmit);
  drawer?.addEventListener('submit', onSubmit);

  /* Clicking a chip button must not blur the focused filter input first:
     blur fires `change`, which re-renders the chips and would detach the
     button before its click event could reach the document. */
  chipsEl?.addEventListener('mousedown', (event) => event.preventDefault());

  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target) return;

    const remove = target.closest<HTMLElement>('.chip__remove');
    if (remove) {
      const key = remove.dataset.chipKey as Parameters<typeof removeChip>[1];
      const value = remove.dataset.chipValue ?? '';
      const state = removeChip(currentState(form), key, value);
      visibleLimit = PAGE_SIZE;
      syncControls(state);
      apply(state);
      return;
    }

    if (target.closest('[data-clear]')) {
      const state = clearAllFilters(currentState(form));
      visibleLimit = PAGE_SIZE;
      syncControls(state);
      apply(state);
    }
  });

  document.querySelector('[data-filters-open]')?.addEventListener('click', () => {
    dialog?.showModal();
  });

  document.querySelector('[data-filters-close]')?.addEventListener('click', () => {
    dialog?.close();
  });

  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  moreBtn?.addEventListener('click', () => {
    visibleLimit += PAGE_SIZE;
    apply(currentState(form), { updateUrl: false });
  });

  for (const btn of pills) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.shapePill;
      if (!id) return;
      const box = form.querySelector<HTMLInputElement>(
        `input[name="family"][value="${CSS.escape(id)}"]`,
      );
      if (!box) return;
      box.checked = !box.checked;
      refresh(form);
    });
  }

  window.addEventListener('popstate', () => {
    const state = initialFromUrl();
    visibleLimit = PAGE_SIZE;
    syncControls(state);
    apply(state, { updateUrl: false });
  });

  /* --------------------------------------------------------------- start */

  function initialFromUrl(): FilterState {
    const state = parseFilters(window.location.search);
    if (pathFamily !== '' && state.families.length === 0) {
      state.families = [pathFamily];
    }
    return state;
  }

  const initial = initialFromUrl();

  if (savedOnly) {
    refreshSaved();
    const reapplySaved = (): void => {
      refreshSaved();
      apply(currentState(form), { updateUrl: false });
    };
    window.addEventListener(LIST_CHANGE_EVENT, reapplySaved);
    onListChange('wishlist', reapplySaved);
  }

  syncControls(initial);
  apply(initial, { updateUrl: false });
}
