# CityMETER Government Office 0.2.0 — verification

Release 0.2.0 (cache tag `20261106-r2`), built 2026-11-06 from the research sheet “CityMETER Government Office
Thailand — รายชื่อรอยืนยัน 2026-11-05” as it stood on 2026-11-06 (read cell by cell the same day). 0.2.0 answers the
owner's request of 2026-11-06 (“ทำไมมีแค่ 19,721 แห่งไม่ใช่สี่แสนครับ งง อยากได้ทั้ง สี่แสนจุดจะได้มั้ย”): every production
point is a row and the page reads every group by default, so its totals equal production's. The code base is CityMETER ·
Hotel 0.3.6 (montri-th/hotel @177e592f) through CityMETER · School 0.1.0; the contracts they share were verified there
(map engine, building view, terrain, guards) and are carried unchanged — this record covers what Government Office
changes: the data, the measure, the scope of every group, the panels (nearest services, offices round an office, moves
and openings), the labels, the legend, the filters, the performance of 440,005 rows and the publication.

## 1. Data build — every reconciliation passes

`python3 -I scripts/build-data.py …` (DATA_METHOD.md §13) stops on any failure; this build passed all of them:

- 440,005 production points of `05_PRODUCTION_ROWS` (the compact read rebuilt to the browser's digest by
  `scripts/join-compact-payload.py`), keys unique; 440,005 rows — one per point, nothing merged (the 0.1.0 inputs rebuild
  the 0.1.0 files byte for byte, so only the row rule changed).
- Rows and Σ officer per production district × category equal production's government-agency info lv0 read the
  same day: 9,046 cells, 0 mismatches; production's country total 440,005 = this dataset's 440,005 rows.
- Government offices 20,568 (`data/offices.json`) + places 419,437 (`data/groups/{education,religion,community}.json`).
- Personnel: Σ 535,745 people at 10,095 offices, unchanged from 0.1.0. 9,806 points repeat an office: they stay rows;
  562 of them name the point that counts their office's personnel (47,393 people not counted twice), and 182 local
  government offices name their organisation's office (14,548 people) — `staffShared` 744 rows, every one naming a point
  that records personnel itself. 177 head offices keep their agency-wide totals apart.
- 97 events of `06_RECENT_PROD_GAPS` with dates and public https announcements; 18 linked to the production row they
  replace; map links and coordinate sources dropped. No open problem (`meta.problems` empty).

## 2. Unit tests on the real data — 130 pass, 0 fail

`npm test` (Node 22): data contract (one row per point, the default scope = every group, `offices`, the 0.1.0 `all`,
group files by bytes and SHA-256, repeated points and personnel once, personnel rules, types, membership, points,
rail, events, hygiene, boundaries and receipts) · first Aha fixtures (every point, the government offices, personnel)
and the filters · district and province models (EVID-05, a district of places only is a measured 0 under personnel) ·
every panel view in both scopes (one provenance line, no caveat, no “0 คน”, places never “—”) · nearest services ·
offices round an office · charts (every group a column under the count, the government offices only under personnel) ·
breadcrumb · categorical cues · labels and pins · scales · icon fonts · camera, massing, building join and units, x-ray,
MapLibre guards (carried from Hotel) · release (one cache tag, one version, schema-valid handoff JSON, hygiene).

## 3. LDS and Location Intelligence parity

`assets/theme.css` is byte-identical to CityMETER · Hotel 0.3.6 and School 0.1.0 (SHA-256 867c64b2…), and every HEX of
`js/scales.js` and `js/cues.js` is the same as School's (only labels, defaults and the group → series binding changed),
so the Hotel parity run (124 checks against the LDS base file and the Location Intelligence Profile) applies unchanged.
The quiet context dots now read the hollow flag (`h`), so a place is a filled grey dot like its focus symbol.

## 4. Rendered QA and performance (build container)

Playwright with MapLibre 5.6.2 from the npm package; OpenFreeMap, unpkg and the DEM were unreachable in the container
(no basemap, no OSM buildings, no terrain), the data layers real, files served uncompressed from localhost.

- First screen at 1440 × 900 light and dark, 390 × 844 light and dark: “17% ของหน่วยงานและสถานที่ในนครราชสีมา อยู่ใน
  3 อำเภอนี้” with เมืองนครราชสีมา · ปักธงชัย · ด่านขุนทด, 3,466 จาก 20,003 แห่ง, the outside finding (เมืองเชียงราย
  2,054), the measure switch “หน่วยงานและสถานที่ | บุคลากร”, the 41-sample legend 1–2,054, the size key, every group in
  the bars, the three districts filled and their symbols, every other point a quiet grey dot; no console error.
- Deep links: `?office=280dc7ddb7`, `?station=RAILCAT:MRT_PINK:PK12`, `?group=religion`, `?group=all` (reads as every
  group, URL cleaned), `?type=1070&province=BKK`, `?area=3001`, `?metric=staff`, `?group=offices&office=e129d81ac9`,
  `?search=วัดพระแก้ว`; the filter flow religion → วัด → clear → personnel → หน่วยงานรัฐ → every group → types chart →
  a type → table.
- Ready (launch card gone) in about 1.6–1.9 s on localhost; the fills and the focus symbols draw first, the quiet dots
  of every point follow at the map's first idle (one multipoint per look). A selection (office, station) re-renders in
  about 0.1 s, a change of scope or measure in 0.2–0.4 s, the first search in about 0.6 s (headless Chromium, software
  GL) — the Aha, the overview and the district and province summaries are computed once per scope and measure.
- Fixed during QA: the legend's measure word split at “สถาน|ที่” on a phone (now one line); the count option took the
  personnel word under the personnel measure (now always what is counted); places read “—” in the personnel bars (now
  only the government-office groups are personnel bars and matrix columns).

## 5. Live

Recorded after the deploy of the release commit in the commit that follows it (GitHub Pages, main / root):
`npm run handoff:manifest`, `npm run verify:live` (every published file byte-identical, SHA-256) and the walk of the
live site at desktop and phone width in light and dark.

## 6. Not verified

- CVD simulation, native mobile devices, screen readers beyond the accessible names and roles in the markup.
- Memory and load time on a low-end phone (about 9 MB of data over the wire, gzip).
- Whether each office is open at its production point today (a research-team task, PRODUCT_STATEMENT §7).
