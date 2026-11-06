# CityMETER Government Office 0.1.0 — verification

Release 0.1.0 (cache tag `20261106-r1`), built 2026-11-06 from the research sheet “CityMETER Government Office
Thailand — รายชื่อรอยืนยัน 2026-11-05” as it stood on 2026-11-06 (read cell by cell the same day). The code base is
CityMETER · Hotel 0.3.6 (montri-th/hotel @177e592f) through CityMETER · School 0.1.0; the contracts they share were
verified there (map engine, building view, terrain, guards) and are carried unchanged — this record covers what
Government Office changes: the data, the measure, the groups loaded on demand, the panels (nearest services, offices
round an office, moves and openings), the labels, the legend, the filters and the publication.

## 1. Data build — every reconciliation passes

`python3 -I scripts/build-data.py …` (DATA_METHOD.md §13) stops on any failure; this build passed all of them:

- 440,005 production points of `05_PRODUCTION_ROWS` (the compact read rebuilt to the browser's digest by
  `scripts/join-compact-payload.py`), keys unique; 430,199 rows after the repeated points of one office (9,806 points)
  are kept once; every point in exactly one row.
- Rows and Σ officer per production district × category equal production's government-agency info lv0 read the
  same day: 9,046 cells, 0 mismatches; production's country total 440,005.
- Every district of the area index matches the production gazetteer (78 base-info responses with receipts).
- Personnel rules per type from the values themselves (`meta.staffRules`); 182 local-government offices name the
  office where their organisation's personnel is counted; 177 head offices keep their agency-wide totals apart.
- 97 events of `06_RECENT_PROD_GAPS` with dates and public https announcements; 18 linked to the production row they
  replace; map links and coordinate sources dropped. No open problem (`meta.problems` empty).

## 2. Unit tests on the real data — 128 pass, 0 fail

`npm test` (Node 22): data contract (rows, reconciliation, group files by bytes and SHA-256, repeats, personnel rules,
types, membership, points, rail, events, hygiene, boundaries and receipts) · first Aha fixtures (offices and personnel)
and the filters · district and province models (EVID-05) · every panel view (one provenance line, no caveat, no
“0 คน”) · nearest services (optimal, never itself, Bangkok police and fire only) · offices round an office · places of
the other groups (no personnel) · charts · breadcrumb (`?d=governmentOfficer`) · categorical cues · labels and pins ·
scales · icon fonts (content-addressed) · camera, massing, building join and units, x-ray, MapLibre guards (carried from
Hotel) · release (one cache tag, one version, schema-valid handoff JSON, publication hygiene).

## 3. LDS and Location Intelligence parity

`assets/theme.css` is byte-identical to CityMETER · Hotel 0.3.6 and School 0.1.0 (SHA-256 867c64b2…), and every HEX of
`js/scales.js` and `js/cues.js` is the same as School's (only labels, defaults and the group → series binding changed),
so the Hotel parity run (124 checks against the LDS base file and the Location Intelligence Profile) applies unchanged.
The two source files are not in this workspace; `npm run check:lds -- --lds <base> --li <profile>` re-runs it where they
are.

## 4. Rendered QA (build container)

Playwright with MapLibre 5.6.2 from the npm package; OpenFreeMap, unpkg and the DEM were unreachable in the container
(no basemap, no OSM buildings, no terrain), the data layers real. Desktop 1440 × 900 light and dark, phone 390 × 844
light and dark:

- First screen: “22% ของหน่วยงานรัฐในนครราชสีมา อยู่ใน 3 อำเภอนี้” with เมืองนครราชสีมา · ปักธงชัย · สีคิ้ว, 158 จาก
  715 แห่ง, no rail bars (nothing near an operating station there), the outside finding (เมืองนครสวรรค์ 84), the
  41-sample legend 1–84, the size key 50 · 250 · 1,000 คน; the three districts filled, the rest quiet; no console error.
- District (`?area=3001`), station (`?station=RAILCAT:MRT_PINK:PK12`, 34 offices within 500 m, the nearest services
  police and fire), offices (`?office=280dc7ddb7` เทศบาลนครหาดใหญ่ with every service slot; `?office=e129d81ac9` with its
  move first and the agency-wide personnel), type (`?type=1070` with the rail bars 8% · 28%), the personnel measure
  (Chonburi), the groups loaded on demand (`?group=religion`, then วัด; “ทุกหมวด” with 430,199 rows), the type chart and
  its click-through, the table, the phone sheet on an office.
- Fixed during QA: the measure switch's selector also matched the map panel (which carries `data-metric`) and emptied
  it — now scoped to the switch; the events list collided with the per-row event map in the build — renamed
  `rowEvents`; Bangkok sites were told their nearest district office was in Nonthaburi — a service slot now needs the
  service typed in the point's province.

## 5. Live

GitHub Pages (main / root), enabled on 2026-11-06 (ICT) for the release commit `a90f10f`:

- `npm run verify:live` (2026-11-06T05:43:49Z): **246 ok, 0 failed** — every published file of the manifest at
  `a90f10f` byte-identical (SHA-256) on https://montri-th.github.io/governmentoffice/ (`evidence/live-attestation.json`,
  not committed); the root document serves the `index.html` bytes.
- Walk in the owner's Chrome with the real basemap, terrain and building tiles (window 1280 × 643; the desktop and phone
  views also in same-origin frames of the live site at 1440 × 900 and 390 × 844, as in the Hotel and School walks):
  the first screen in dark (Aha, legend, the three focused districts of Nakhon Ratchasima over OpenFreeMap);
  `?office=280dc7ddb7` (เทศบาลนครหาดใหญ่): the map turned 3D and framed the drawn CityMETER Building V4 building nearest
  the pin in two-point perspective (legend “อาคารใกล้หมุด”, attribution “อาคาร: CityMETER Building V4”), terrain chips
  read from the DEM (16 ม. · ต่างระดับ 12 ม.), the five nearest services; desktop light — `?station=RAILCAT:MRT_PINK:PK12`
  with the 3D city, the dashed 500 m radius, office names near the middle and the services panel; phone light —
  `?area=3001` with the sheet open; desktop dark — `?type=1070&province=BKK` (the type card, “15% ของสถานีตำรวจใน
  กรุงเทพมหานคร”, the rail bars); phone dark — the first screen with the dock; `?group=religion&metric=staff` ready in
  4.6 s with the personnel switch off and the URL back to `?group=religion`. Launch state `ready`, map loaded, no map
  failure, no console error.

## 6. Not verified

- CVD simulation, native mobile devices, screen readers beyond the accessible names and roles in the markup.
- Whether each office is open at its production point today (a research-team task, PRODUCT_STATEMENT §7).
