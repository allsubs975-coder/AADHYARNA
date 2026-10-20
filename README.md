# AADHYARNA

Premium lab-grown diamond discovery website — a fast, mobile-first, static
catalogue with filtering, comparison, wishlists and direct WhatsApp enquiry.

No backend, no database, no accounts, no analytics, no cookies. Every page is
pre-built at deploy time; the browser receives only whitelisted public data.

**Status: development complete — all checks green.** Remaining work is
owner/domain items + deployment only (see
[§23 Remaining work](#23-remaining-work-launch-checklist)).

---

## Table of contents

0. [Project status — what is complete](#0-project-status--what-is-complete)
1. [What this site is](#1-what-this-site-is)
2. [Tech stack](#2-tech-stack)
3. [Quick start](#3-quick-start)
4. [Commands](#4-commands)
5. [Project structure](#5-project-structure)
6. [Inventory pipeline (Excel → site)](#6-inventory-pipeline-excel--site)
7. [Public / private data split](#7-public--private-data-split)
8. [Data model](#8-data-model)
9. [Configuration guide](#9-configuration-guide)
10. [Design system](#10-design-system)
11. [Pages and routing](#11-pages-and-routing)
12. [Filtering and URL state](#12-filtering-and-url-state)
13. [Wishlist and compare](#13-wishlist-and-compare)
14. [Enquiries, WhatsApp and sharing](#14-enquiries-whatsapp-and-sharing)
15. [SEO and structured data](#15-seo-and-structured-data)
16. [Accessibility](#16-accessibility)
17. [Performance](#17-performance)
18. [Testing and verification](#18-testing-and-verification)
19. [Deployment](#19-deployment)
20. [Content editing guide](#20-content-editing-guide)
21. [What is still unconfirmed](#21-what-is-still-unconfirmed)
22. [Known constraints](#22-known-constraints)
23. [Remaining work (launch checklist)](#23-remaining-work-launch-checklist)

---

## 0. Project status — what is complete

All 7 build phases (scaffold → inventory → design system → catalogue →
compare/wishlist/share → SEO/a11y/perf → tests/docs) plus the final image
polish are **done**. Nothing in this list needs rebuilding:

| Area | Status |
| --- | --- |
| Build | 177 pages, `npm run build` clean |
| Types/templates | `npm run check` → **0 errors / 0 warnings / 0 hints** |
| Unit + dist tests | `npm test` → **32 + 35 = 67 checks green** |
| Visual/a11y sweep | `npm run check:visual` → 12 routes × 2 viewports OK (axe clean) |
| Interaction tests | `npm run test:browser` → **39/39 green** |
| Visual theme | **Rich light + dark drama** pass applied site-wide (see §10): warm ambient washes, gold hairline edges, dark hero/ink sections, 3D tilt diamond cards |
| Inventory | 145 diamonds imported from the Excel source; audit report generated |
| Privacy | 0 grading-report numbers, media hosts or URLs in `dist/` (automated scan) |
| Pages | homepage, `/diamonds` + 22 family pages, 145 detail pages, wishlist, compare, education, about, contact, privacy, terms, 404 |
| Features | filters/URL state, sort, chips, search, compare (4), wishlist, share, WhatsApp deep links |
| SEO | titles/descriptions/h1 on every page; canonical/OG/JSON-LD/sitemap **gated** on `site.url` (both states tested) |
| Images | responsive WebP sets, lazy below-fold art, 1.4 KB WebP favicon, 1200×630 OG card — re-runnable via `npm run images:optimize` |
| Accessibility | WCAG-oriented markup, focus handling, reduced-motion, zero serious/critical axe issues |
| WhatsApp | `+39 351 146 5617` confirmed and live in all enquiry flows (never with report numbers) |

**Do not change what is green.** Any future edit = change → `npm run check`
→ `npm run build` → `npm test` → `npm run check:visual` →
`npm run test:browser` (all five must pass).

---

## 1. What this site is

- **Catalogue** of 145 lab-grown diamonds (single Excel source), with search,
  filters, sorting, and shareable filter URLs.
- **22 shape-family landing pages** (e.g. `/diamonds/family/oval/`) — each is a
  real static page listing that family only.
- **145 detail pages** (`/diamonds/HM-21/`) with full specifications, Save /
  Compare / Share / WhatsApp actions and related stones.
- **Compare** (up to 4 side-by-side) and **Wishlist** (saved stones) — both
  stored only in the visitor's browser (`localStorage`).
- **Education, About, Contact, Privacy, Terms, 404** pages.
- Static `robots.txt` + `sitemap.xml`, both **gated** until a production URL is
  configured.

## 2. Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Astro 7 (`output: 'static'`, directory URLs) |
| Language | TypeScript 5.9, strict (`astro check` → 0 errors / 0 warnings / 0 hints) |
| UI | Plain Astro components + vanilla TS client scripts — no React/Vue/etc. |
| Styling | Hand-written CSS (design tokens → global → per-component `<style>`) |
| Data | Excel → `scripts/import-inventory.mjs` (`xlsx`, dev-only) → JSON |
| Tests | Node-native `.mjs` scripts (unit + static dist checks), Playwright-core + axe-core for browser checks |

Runtime dependencies: **none**. Everything in `devDependencies` is build/test
tooling. Node `>=22.22.0` (native TypeScript type stripping is used by the
import script and unit tests).

## 3. Quick start

```bash
npm install
npm run inventory:import   # Excel → src/data/inventory.json (+ audit report)
npm run images:optimize    # regenerate responsive WebP/OG assets (idempotent)
npm run dev                # http://localhost:4321
npm run build              # → dist/ (177 pages)
npm run preview            # serve dist/
```

Source assets live in the project root and must never be modified or deleted:
`Ahuja diamonds POLISH STOCK-18.xlsx` and `monogram.jpeg`.

## 4. Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm run check` | `astro check` — types + template diagnostics (must stay at 0/0/0) |
| `npm run inventory:import` | Re-import the workbook (see flags below) |
| `npm run images:optimize` | Regenerate every responsive WebP/OG asset from the artwork masters (idempotent; `-- --force` to redo) |
| `npm run check:visual` | 12 default routes × 2 viewports: status, console, overflow, broken images, h1, duplicate IDs, accessible names, axe serious/critical → `.visual/` |
| `npm run test:browser` | 39 end-to-end interaction checks against a preview server (starts its own if `BASE_URL` is unset) |
| `npm test` | `test-filters.mjs` (32 unit checks on pure libs) **then** `verify-dist.mjs` (34 static checks on `dist/`) |

Inventory import flags:

```bash
npm run inventory:import -- --dry-run     # validate + audit report only
npm run inventory:import -- --check-urls  # live HTTP check of every media URL
npm run inventory:import -- <file.xlsx>   # import a different workbook
```

Verification scripts accept `BASE_URL` (e.g. `BASE_URL=http://localhost:4321`)
and `check:visual` accepts `ROUTES` (space-separated) to test other paths.

## 5. Project structure

```
Ahuja diamonds POLISH STOCK-18.xlsx   source workbook (read-only)
monogram.jpeg                         brand source art (read-only)
scripts/                              import + verification tooling
  import-inventory.mjs                workbook → JSON/audit (Node, no bundler)
  optimize-images.mjs                 regenerate all responsive WebP/OG assets
  test-filters.mjs                    unit tests (imports src/lib/*.ts directly)
  verify-dist.mjs                     static checks on dist/
  visual-check.mjs                    per-route browser + axe sweep
  browser-test.mjs                    end-to-end interaction suite
private/                              PRIVATE — never shipped (see §7)
  inventory.private.json              report numbers, media URLs, raw values
reports/
  inventory-audit.md                  generated import report (read it after import)
public/                               copied verbatim to dist/ (fonts, brand, icons)
src/
  config/                             brand, site, features, shapes, content (copy)
  data/inventory.json                 PUBLIC product data (the only one shipped)
  lib/                                pure shared logic (filters, format, storage…)
  scripts/                            client-side behaviour (actions, catalogue, compare)
  components/  layouts/  pages/       UI
  styles/                             tokens.css, fonts.css, global.css
dist/                                 build output (static host serves this)
.visual/                              screenshots from check:visual
```

## 6. Inventory pipeline (Excel → site)

```
Ahuja diamonds POLISH STOCK-18.xlsx   (opened read-only, never written)
        │  npm run inventory:import
        ├─→ src/data/inventory.json         public, whitelisted fields only
        ├─→ private/inventory.private.json  full records + private fields
        └─→ reports/inventory-audit.md      validation + review list
```

Normalisation rules applied at import:

- **IDs** must be unique (49 raw shapes → 22 families via `src/config/shapes.ts`).
- **Depth / table** values that are implausible are published as `null`
  (rendered `—`, and they sort last — never as zero).
- **Cut / Polish / Symmetry** values outside the known vocabulary are published
  as `null` and listed under “requires review” in the audit.
- **Cut** is unusable in 143/145 records → `features.cutFilter: false`.
- **No prices exist** in the source → `features.price: false`. Never invent
  prices; turn the toggle on only when real prices are in the inventory.
- Blocking errors (duplicate ID, missing weight, bad URL protocol, …) abort the
  import with exit 1 and write **no** inventory JSON.

After changing the workbook or import rules: `npm run inventory:import`, read
`reports/inventory-audit.md`, then `npm run build`.

## 7. Public / private data split

**Published to the browser** (only these keys reach markup, JSON, URLs or
metadata — enforced by `verify-dist.mjs`):

`id`, `availability`, `shape`, `shapeFamily`, `weight`, `color`, `colorType`,
`clarity`, `cut`, `polish`, `symmetry`, `fluorescence`, `measurements`,
`depth`, `table`, `hasReport`

**Never published**: grading report numbers, third-party media URLs, all `*Raw`
source values, `sourceRow`, validation flags.

- Detail pages say **“On file — number shared on request”** / **“No report
  recorded”** — never the number itself.
- The report filter matches on *presence* only (`hasReport`), never on a number.
- WhatsApp messages and share links must never contain report numbers.
- `verify-dist.mjs` scans every text file in `dist/` for all 138 report numbers
  and all media hosts/URLs; the build fails if anything leaks.
- `private/` is excluded from version control; the browser never requests it.

## 8. Data model

`src/lib/types.ts` → `Diamond` (published fields above) and `Filters`
(what the URL serialises). Supporting details:

- `colorType` is `'letter' | 'fancy'`; the special URL key `fancy` matches any
  fancy colour (`Colour: Fancy` chip).
- `hasReport: boolean` powers the report chip/filter.
- `shapeFamily` is the canonical family id (`oval`, `old-miner`, …) used for
  family pages, chips and card data attributes.
- `diamondTitle(d)` / `formatCarat` / `formatPercent` / `availabilityLabel` in
  `src/lib/format.ts` keep labels identical across cards, pages and tests.
- `diamondSpecs(d)` (`src/lib/specs.ts`) renders the detail spec table and the
  compare table — one definition, both places.

## 9. Configuration guide

Everything editable lives in `src/config/`; components never hard-code brand
strings, nav or marketing copy. **Rebuild after any change** (`npm run build`).

| File | Controls |
| --- | --- |
| `site.ts` | **`site.url` — production origin.** Leave `''` until the owner confirms the domain; canonical tags, `og:url` and JSON-LD stay off, `robots.txt`/`sitemap.xml` stay gated until then. Also: default title/description, locale, `primaryNav`, footer columns, sitemap/newsletter toggles. |
| `brand.ts` | Name, monogram assets, **`contact.whatsappDigits` (`393511465617`, confirmed)**, display number, `email` / `phone` / `address` (empty → nothing rendered), social links (empty array → omitted). |
| `features.ts` | Feature toggles: `wishlist`, `compare`, `share`, `whatsapp`, `price` (off), `cutFilter` (off), `search`, `dimensionsFilters`, `education`, `reportFilter`. Each toggle removes markup *and* scripts cleanly. `compareLimit = 4`. |
| `shapes.ts` | The 22 shape families (id, label, silhouette id, aliases) + `familyForShape()`. Add a family here, re-import, rebuild. |
| `content.ts` | All homepage copy, section order (`homeSections`), featured-selection note. |

To go live with SEO: set `site.url = 'https://www.example.com'` (no trailing
slash), rebuild — canonical/OG/JSON-LD appear, `robots.txt` gains a `Sitemap:`
line and `sitemap.xml` becomes a full `urlset` (verified automatically).

## 10. Design system

- `src/styles/tokens.css` — the single source for colours (incl.
  `--color-whatsapp: #0e7468`), spacing, radii, shadows, type scale, motion.
  Brand colours are defined **only here**, never inside components.
- **Theme direction: “rich light + dark drama”.** Layered CSS-only effects —
  no images, no filters beyond the header blur:
  - `--wash-warm` / `--wash-ink` / `--wash-ink-deep` — reusable radial ambient
    washes (warm gold veils) applied to the body, `.section--ink`, footer and
    CTA bands.
  - `--edge-gold` — champagne gradient hairline used as the top accent on
    elevated panels, cards, `.section--paper` / `.section--ink`, header and
    footer.
  - `--shadow-card` / `--shadow-card-hover` — resting and hover elevation for
    cards/panels; `--glow-gold` / `--glow-ink` — gold-rim glow states.
  - Dark drama: the hero panel and all `section--ink` bands (brand, CTA,
    footer) use ink gradients with gold pools; the hero panel swaps to the
    `Logo variant="ink"` monogram.
- **Diamond cards (`DiamondCard.astro`)**: pointer-driven 3D tilt
  (`perspective(900px) rotateX/rotateY` via `--rx`/`--ry`) + 6px lift, gold
  crown hairline, one-shot media light sweep, gold silhouette on hover. The
  effect is driven by a ~1 KB inline delegated script that runs **only** on
  fine-pointer devices and never under `prefers-reduced-motion`; touch
  devices get CSS-only fallbacks (no tilt, no sweep).
- `src/styles/fonts.css` — self-hosted `@font-face` (no external font CDN).
- `src/styles/global.css` — resets, base typography, layout utilities, `.prose`
  for editorial pages, `[hidden]` override, and the JS-gating utilities
  (`[data-js-only]` / `[data-nojs]`).
- Components are scoped-style Astro files; shared primitives: `Icon`,
  `ShapeSilhouette`/`SilhouetteSprite` (15 inline SVG paths), `Breadcrumbs`,
  `Logo`, `WhatsAppButton`.
- Mobile-first: breakpoints and touch targets follow the token scale; the
  catalogue sidebar collapses into an accessible drawer on small screens.

## 11. Pages and routing

| Route | Notes |
| --- | --- |
| `/` | Homepage — sections ordered by `content.ts#homeSections` |
| `/diamonds/` | Full catalogue: 145 server-rendered cards + filters |
| `/diamonds/family/<id>/` | 22 pages; only that family's cards are in the HTML |
| `/diamonds/<id>/` | 145 detail pages: breadcrumbs, silhouette, specs, actions, related, Product JSON-LD (only when `site.url` is set) |
| `/wishlist/` | Catalogue in “saved only” mode (`localStorage`) |
| `/compare/` | Full 145-column table; columns revealed by selection |
| `/education/`, `/about/`, `/contact/` | Editorial pages |
| `/privacy/`, `/terms/` | **Drafts** with visible draft notices — owner must approve |
| `/404.html` | Built from `src/pages/404.astro` |

All directory routes end with a trailing slash (`build.format: 'directory'`).

## 12. Filtering and URL state

- **URL is the source of truth.** Filter/sort/search state serialises into the
  query string; updates use `history.replaceState` (no history spam). Filter
  inputs are rendered **twice** — sidebar (`side…` ids) and mobile drawer
  (`drawer…` ids) — and kept in sync.
- Filtering reads each card's `data-*` attributes (no client-side JSON
  payload); sorting writes `style.order` from the same pure
  `applyFilters()` the unit tests cover (`src/lib/filters.ts`).
- Active filters appear as dismissible chips; “Clear all” only appears when
  the state is not empty (`isFilterEmpty` ignores sort — sort is a preference).
- Family pages: when the current selection still matches the page's family,
  the canonical URL stays `/diamonds/family/<id>/`; widening the selection
  moves to `/diamonds` via full navigation (`location.assign`), since the page
  only contains its own family's cards.
- Deep links (`?shape=oval&color=G&sort=carat-desc`) are shareable and are
  covered by tests.
- Without JavaScript: cards render server-side, filters stay visible but
  inert, and a note explains that filtering needs JS (`html.js` class gates
  the interactivity).

## 13. Wishlist and compare

- Both are **browser-local only** (`localStorage`, keys in
  `src/lib/storage.ts`), no accounts, no server, nothing in URLs beyond ids.
- **Wishlist**: heart toggles on cards/details; `/wishlist/` re-renders as the
  catalogue filtered to saved stones (invalid ids are pruned against the live
  inventory), denominators and empty-state copy adapt to saved-only mode, and
  changes on other tabs re-apply via a `storage`-backed `LIST_CHANGE_EVENT`.
- **Compare**: up to `compareLimit = 4` diamonds; the 5th add is refused with
  a toast. `/compare/` ships the complete table in the HTML; `compare.ts`
  reveals only the selected columns (`data-col`). Private pages are
  `noindex`.
- Counters (“N saved”, “N compared”) update everywhere from one
  `refreshCounters()`; badges use `data-empty` / `data-compare-status` to
  avoid attribute collisions with grid empty states.

## 14. Enquiries, WhatsApp and sharing

- Floating WhatsApp button site-wide + per-detail WhatsApp deep link:
  `https://wa.me/393511465617?text=…` — message includes the stone **ID**,
  shape, carat, colour, clarity… **never a report number**.
- Contact page and footer render phone/email/address only when configured in
  `brand.ts` (currently only WhatsApp).
- **Share**: Web Share API → clipboard copy fallback → toast confirmation
  (`sharePage()` in `src/scripts/actions.ts`).

## 15. SEO and structured data

- Every page: unique `<title>` + meta description, one `<h1>`, semantic
  landmarks, descriptive link text (verified for all 177 pages).
- **Gated on `site.url`**: `<link rel="canonical">`, `og:url`, `twitter:url`,
  `og:image`, and JSON-LD (`Organization`/`WebSite` in the layout,
  `Product` on detail pages). With the domain empty, none of these are
  rendered at all — never half-filled URLs.
- `robots.txt`: `Allow: /` always; `Sitemap:` line appears only once
  `site.url` is set.
- `sitemap.xml`: while unconfigured it is a placeholder **not referenced by
  robots.txt**; once configured it lists the 7 static routes + 22 families +
  145 details, all absolute on `site.url`.
- `/compare/` and `/wishlist/` are `noindex` (private tool pages).
- No third-party scripts, no trackers.

## 16. Accessibility

- WCAG-oriented: semantic HTML first, visible focus, skip link, labelled
  controls, `aria-live` toast, drawer/dialog semantics with focus handling,
  `aria-hidden` on decorative SVG.
- Text-transform uppercase copy uses visually-hidden text instead of
  `aria-label` (avoids label-content-name-mismatch).
- Colour contrast checked against the token palette; axe-core serious/critical
  issues are zero on every route × viewport in `check:visual`.
- Respects `prefers-reduced-motion`; touch targets sized for mobile.
- Works without JS for reading; every enhancement is additive.

## 17. Performance

- Fully static HTML + CSS; ~4–11 KB of vanilla JS per page (catalogue,
  actions, compare — loaded only where used). Card 3D tilt adds a ~1 KB
  inline script (one delegated `pointermove`, fine-pointer devices only).
- **Images**: the only raster assets are the monogram, the two icons and the
  Open Graph card. Every `<img>` uses a responsive `srcset`/`sizes` pair
  generated at exactly the widths declared in `config/brand.ts#logoAssets`
  (header logo 2.2–15.8 KB instead of the 58 KB master; brand panel 7.3–32.6
  KB instead of 50.7 KB), below-the-fold art is `loading="lazy"`, a 1.4 KB
  WebP favicon is linked first with the PNG fallback behind it, and
  `og-image.jpg` is a purpose-built 1200×630 card. Re-run
  `npm run images:optimize` after changing widths or adding artwork.
- Inline SVG silhouettes for all diamond cards (no raster product images to
  ship) and explicit width/height everywhere to avoid layout shift.
- Self-hosted fonts with `font-display: swap` — no external requests.
- No frameworks, no web fonts from CDNs, no analytics payloads.
- Note for ops: serve `dist/` with **gzip/brotli on** — the catalogue HTML is
  ~550 KB raw (mostly repeated server-rendered card markup) and compresses to
  a fraction of that; enable precompression or dynamic compression at the
  host/CDN.

## 18. Testing and verification

Run in this order (all must pass before shipping):

```bash
npm run check          # types/templates — 0 errors, 0 warnings, 0 hints
npm run build          # 177 pages, no errors
npm test               # 32 unit checks + 35 static dist checks
npm run check:visual   # 12 routes × desktop+mobile: status, console, overflow,
                       # images, h1, dup IDs, names, axe → .visual/
npm run test:browser   # 39 interaction checks (filtering, chips, sort, deep
                       # links, family nav, drawer, wishlist, compare, console)
```

- `test-filters.mjs` imports `src/lib/filters.ts` etc. directly (Node type
  stripping) — pure logic only.
- `verify-dist.mjs` needs `dist/` to exist and re-checks the privacy split,
  SEO gating, link + srcset integrity, h1/title/description coverage,
  sitemap/robots consistency, catalogue completeness, image responsiveness.
- `visual-check.mjs` and `browser-test.mjs` need a server; both spawn
  `astro preview` automatically when `BASE_URL` is unset.
- The house rule: `astro check` must stay at **0/0/0** — treat any new hint as
  a failure.

## 19. Deployment

- Output is plain static files: deploy `dist/` to any static host (Netlify,
  Vercel, Cloudflare Pages, S3+CDN, nginx).
- Trailing-slash/directory URLs: configure the host accordingly (or rely on
  the host's automatic `index.html` resolution); `404.html` is served for
  unknown paths.
- Set the production domain **in `src/config/site.ts`** before the SEO
  features go live, then rebuild — do not hard-code domains anywhere else.
- Enable compression (gzip/brotli) and long-lived caching for `/fonts`,
  `/brand` and hashed CSS/JS; HTML should be revalidated.
- Build command: `npm run build` · publish directory: `dist` · Node `>=22.22`.

## 20. Content editing guide

| Want to change… | Edit… | Then |
| --- | --- | --- |
| Homepage copy / section order | `src/config/content.ts` | `npm run build` |
| Navigation / footer links | `src/config/site.ts` (`primaryNav`, `footerColumns`) | rebuild |
| WhatsApp number | `src/config/brand.ts` (both `whatsappDigits` + `whatsappDisplay`) | rebuild |
| Monogram / logo sizes or widths | `src/config/brand.ts` → `logoAssets` | `npm run images:optimize` then rebuild |
| New image added to `public/` | Run `npm run images:optimize` — it lists any raster file not covered by a job; add a job in `scripts/optimize-images.mjs` if it needs responsive variants | rebuild |
| Feature switches (price, compare limit…) | `src/config/features.ts` (`compareLimit` too) | rebuild |
| Shape families / new family | `src/config/shapes.ts` + re-import | `npm run inventory:import` then build |
| Diamond data | re-export the Excel workbook → `npm run inventory:import` → read `reports/inventory-audit.md` | rebuild |
| Education / About / Contact / legal text | `src/pages/<page>/index.astro` | rebuild |
| Colours / spacing / type | `src/styles/tokens.css` only | rebuild |
| SEO title/description defaults | `src/config/site.ts` | rebuild |

Never edit `src/data/inventory.json`, `reports/inventory-audit.md` or `dist/`
by hand — they are generated.

## 21. What is still unconfirmed

These were deliberately left **empty** — do not invent values:

| Item | Where to set it | Current behaviour while empty |
| --- | --- | --- |
| Production domain | `site.ts` → `site.url` | No canonical/`og:url`/JSON-LD; sitemap gated; robots has no Sitemap line |
| Email, phone, address | `brand.ts` → `contact.*` | Those fields are simply not rendered |
| Social profiles | `brand.ts` → `social: []` | Footer omits them |
| Privacy policy & terms approval | `src/pages/privacy`, `src/pages/terms` | Pages carry visible **draft** notices — owner must review and approve |
| Prices | Excel + `features.price` | Not shown anywhere (no price data exists) |

Confirmed already: WhatsApp number `+39 351 146 5617` / `393511465617`.

## 22. Known constraints

- **Cut filter is off** by design: 143/145 source rows have no usable Cut value.
- **Depth/table missing values** are published as `null` (shown `—`, sorted
  last) because the source contains implausible numbers.
- **10 items require review** — see `reports/inventory-audit.md` §review list.
- Compare/wishlist state is per-browser: clearing site data clears them.
- Detail pages hide grading report numbers by policy; the number is shared
  on request (WhatsApp).
- The catalogue page is large as raw HTML (145 server-rendered cards) —
  acceptable because it compresses well; enable host-side compression.
- `/compare/` ships all 145 columns in the HTML (needed for a no-JS-readable
  table); it is also the largest client of the compression note above.

## 23. Remaining work (launch checklist)

Development is finished — what follows is **owner/data confirmation + deploy
only**. No code rebuild is required beyond config edits. Work through in
order; after each step re-run the five commands in §18.

### 1. Configure the production domain (SEO gate)

1. Get the final domain (e.g. `https://www.aadhyarna.com`).
2. In `src/config/site.ts` set `url: 'https://www.example.com'` — **no
   trailing slash**, and nothing else hard-codes the domain.
3. `npm run build` → verify automatically:
   - `npm test` proves canonical/`og:url`/JSON-LD now render and
     `sitemap.xml` is a full 174-URL `urlset` referenced by `robots.txt`.
4. Optional SEO extras once live: Google Search Console + sitemap submission,
   `og:image` card becomes active with the domain.

### 2. Confirm business details (contact/footer/contact page)

1. `src/config/brand.ts` → `contact.*`: `email`, `phone`, `addressLine`,
   `city`, `country` — currently empty, so **nothing renders** (by design).
2. Social profiles → `brand.social: []` (add `{ label, href }` entries or
   leave empty to omit).
3. Rebuild + smoke-test `/contact/` and the footer (empty fields must stay
   hidden, never blank placeholders).
4. WhatsApp is already confirmed (`393511465617`) — leave as is.

### 3. Privacy policy & Terms — owner approval

1. Review `src/pages/privacy/index.astro` and `src/pages/terms/index.astro`
   (both carry visible **draft** notices today).
2. Owner approves or supplies final legal text (a lawyer/CA review is
   recommended for commercial sites).
3. Remove the draft-notice markup only after approval, rebuild, confirm on
   `/privacy/` and `/terms/`.

### 4. Deploy to Vercel

1. Push the project to a Git repository (exclude nothing — `private/` is
   already git-ignored by design; keep the Excel + `monogram.jpeg` sources
   in the repo root).
2. Vercel project settings:
   - **Framework preset**: Astro
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
   - **Node version**: ≥ 22.22 (`engines` in `package.json`)
3. Add the production domain (step 1) in Vercel → Domains; HTTPS is automatic.
4. Enable Vercel's compression/CDN defaults; cache headers for `/fonts` and
   `/brand` can be set in `vercel.json` if desired (see §19).

### 5. Live testing after deploy

```bash
BASE_URL=https://<production-domain> npm run check:visual
BASE_URL=https://<production-domain> npm run test:browser
```

Manual pass on a real phone:
- Catalogue filters + chips + sort; family page navigation.
- Compare (max 4) and Wishlist persistence across reloads.
- WhatsApp button opens a chat with a pre-filled message containing the
  **stone ID and specs — never a report number**.
- Detail pages show “On file — number shared on request”.
- Privacy/Terms (post-approval), 404 behaviour, and page weight
  (Network → Enable “Disable cache” off, confirm gzip/brotli active).

### 6. Optional follow-ups (not required to launch)

- Owner review of the 10 flagged inventory rows in
  `reports/inventory-audit.md`.
- Prices: only if real price data arrives — set `features.price = true` then
  (never invent prices).
- Search Console verification, analytics (only if owner opts in — currently
  zero scripts by policy).
