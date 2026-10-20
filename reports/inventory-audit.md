# AADHYARNA inventory audit

Generated: 2026-10-19 19:56:37 UTC  ·  Mode: import

This file is generated. Do not edit it by hand — run `npm run inventory:import`.

## 1. Summary

| Item | Value |
| --- | --- |
| Source workbook | `Ahuja diamonds POLISH STOCK-18.xlsx` (unmodified) |
| Sheet | `Sheet2` |
| Rows read below header | 145 |
| Records published (public) | 145 |
| Records stored (private) | 145 |
| Blocking errors | 0 |
| Items requiring review | 10 |

## 2. Public / private field split

Published to the browser (`src/data/inventory.json`):

`id`, `availability`, `shape`, `shapeFamily`, `weight`, `color`, `colorType`, `clarity`, `cut`, `polish`, `symmetry`, `fluorescence`, `measurements`, `depth`, `table`, `hasReport`

**Never published** — kept only in `private/inventory.private.json`:

`report` (grading report numbers), `mediaUrl` (third-party video / 360 viewer URLs), all `*Raw` source values, `sourceRow`, `flags`, `reportValid`, `mediaOk`.

## 3. Schema mapping

| Logical field | Spreadsheet header | Requirement |
| --- | --- | --- |
| Stone ID | `STONE ID` | required |
| Availability | `AVAILABALITY` | optional |
| Shape | `Shape` | required |
| Weight | `Weight` | required |
| Color | `Color` | required |
| Clarity | `Clarity` | required |
| Cut | `Cut` | optional |
| Pol | `Pol` | optional |
| Sym | `Sym` | optional |
| FL | `FL` | optional |
| Measurements | `Measurements` | optional |
| Depth | `DEPTH` | optional |
| Table | `TABLE` | optional |
| Report | `Report` | optional |
| Diamond Video | `Diamond Video` | optional |

## 4. Blocking errors

None.

## 5. Data quality

| Check | Result |
| --- | --- |
| Duplicate Stone IDs | none (import would stop if any existed) |
| Depth recorded as 0 / empty → published as unavailable | 68 |
| Table recorded as 0 / empty → published as unavailable | 68 |
| Depth outside 5–100% → unavailable | 1 |
| Table outside 5–100% → unavailable | 1 |
| Depth inconsistent with measurements (kept, flagged) | 2 |
| Cut not recorded | 143 of 145 |
| Cut value not a recognised grade | 1 |
| Grading report missing | 7 |
| Grading report format invalid | 1 |
| Media URL missing | 0 |

Media URL types: 113 interactive viewer page(s), 24 direct video(s), 3 still image(s), 5 other. Hosts: ds-360.jaykar.co.in (2), video360.in (19), view.gem360.in (1), videos.gem360.in (10), view.varnivideo.com (19), views.varnivideo.com (90), diamond.blissvideos.com (4).

## 6. Records requiring manual review

10 item(s) across 7 category(ies). No source value has been altered or corrected.

### depth-implausible (1)

- **HM10-1** — Depth 0.66 is not a usable percentage — published as unavailable

### table-implausible (1)

- **HM10-1** — Table 0.57 is not a usable percentage — published as unavailable

### cut-nonstandard (1)

- **RD1-2** — Cut value "ID" is not a recognised grade — published as unavailable (raw value kept in the private inventory)

### depth-mismatch (2)

- **BN-2** — Recorded depth 47.6% differs from 59.2% implied by the recorded measurement — value published as recorded
- **AN-1** — Recorded depth 47.8% differs from 68.8% implied by the recorded measurement — value published as recorded

### report-format (1)

- **HM7-51** — Report number "LGLG814633359" does not match the expected LG + 9 digits format

### symmetry-nonstandard (1)

- **HM18-1** — Symmetry value "FR" is not a recognised grade — published as unavailable (raw value kept in the private inventory)

### measurements-malformed (3)

- **HM16-19** — Measurements "13.42-10.25-4.92" do not match the expected L-LxD format — left exactly as recorded
- **HM18-7** — Measurements "8.15-6.40-3.88" do not match the expected L-LxD format — left exactly as recorded
- **HM7-30** — Measurements "9.07-6.72-4.44" do not match the expected L-LxD format — left exactly as recorded

## 7. Changes vs previous import

First import — no previous snapshot found.

## 8. Updating the inventory

```bash
npm run inventory:import -- --dry-run   # validate and review first
npm run inventory:import                # write inventory + audit
npm run build                           # rebuild the site
```

The source workbook is opened read-only and is never modified.
