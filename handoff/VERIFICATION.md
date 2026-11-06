# CityMETER Government Office 0.3.0 — verification

Release 0.3.0 (cache tag `20261106-r6`), built 2026-11-06. 0.3.0 answers the owner's requests of 2026-11-06 on the
Juvenile and Family Court of Ubon Ratchathani (“ทำไมจุดในภาพถึงเลือกอาคารผิด … อยากให้พี่หาเคสที่ spatial join ผิดให้เจอว่า
มีรายการไหนบ้าง มีสาเหตุกี่แบบ แต่ละแบบควรแก้อย่างไรถึงจะดีที่สุด แล้วลงมือปรับแก้ให้เรียบร้อยทั้งหมด”, “streetview ถ้าเลือกแล้ว
ต้องให้หันหน้าเข้าหาอาคารด้วยนะ”): the building the camera turns to for an office (`js/office-building.js`,
`docs/BUILDING_CHOICE.md`) and Street View facing it. The data files are 0.2.0's byte for byte, so §1 is 0.2.0's build
record; 0.2.0 itself answered “ทำไมมีแค่ 19,721 แห่งไม่ใช่สี่แสนครับ งง อยากได้ทั้ง สี่แสนจุดจะได้มั้ย” (every production point a
row, every group by default). The code base is CityMETER · Hotel 0.3.6 (montri-th/hotel @177e592f) through CityMETER ·
School 0.1.0; the contracts they share were verified there and are carried unchanged except the building of an office.

## 1. Data build (0.2.0, unchanged) — every reconciliation passes

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

## 2. Unit tests on the real data — 142 pass, 0 fail

`npm test` (Node 22): data contract (one row per point, the default scope = every group, `offices`, the 0.1.0 `all`,
group files by bytes and SHA-256, repeated points and personnel once, personnel rules, types, membership, points,
rail, events, hygiene, boundaries and receipts) · first Aha fixtures (every point, the government offices, personnel)
and the filters · district and province models (EVID-05, a district of places only is a measured 0 under personnel) ·
every panel view in both scopes (one provenance line, no caveat, no “0 คน”, places never “—”) · nearest services ·
offices round an office · charts (every group a column under the count, the government offices only under personnel) ·
breadcrumb · categorical cues · labels and pins · scales · icon fonts · camera, massing, building join and units, x-ray,
MapLibre guards (carried from Hotel) · the building of an office (0.3.0, `tests/office-building.test.js`: the court case,
a pin in a building of the type's size, a police box, a pin in the open, the street side and the setback, named points of
interest and the kinds that can lend a name, a stray pin and the office's own name, grouping, Thai names, Street View on
the street in front facing the building, the link's heading and pitch) · release (one cache tag, one version,
schema-valid handoff JSON, hygiene).

## 3. The building of an office (0.3.0)

- Audit (`scripts/audit-building-choice.mjs`): CityMETER Building V4 read at z16 round every government office whose
  150 m square meets a CityMETER unit — 12,736 offices, 20,658 tile requests (101 MB) to the production tile API at 4 at
  a time; 8,555 points (67 %) fall in no building, 657 have nothing drawn within 150 m, 186 no building of half their
  type's footprint floor; without names and streets 0.3.0 changes the building of 2,691 (202 whose point fell in another
  building, 2,489 whose point fell in none; 819 of these are police boxes, now the nearest structure).
- Against OpenStreetMap (Overpass API 2026-11-06, in the owner's browser): 1,547 government offices named within 1 km
  of their points; 199 (13 %) points more than 150 m from the named place; 1,104 named buildings drawn within 150 m
  (946 over V4, 158 over OpenStreetMap buildings). 0.2.0 picked the named building for 746 (68 %); 0.3.0 without the
  names for 791 (72 %) — points in a building 373 → 380 of 467, points in none 373 → 411 of 637. With the names the
  named building wins: 157 of 160 sampled named offices have the name in the OpenFreeMap tiles within 150 m.
- The court (`?office=b86ab4e816`): 0.2.0 turned to the 103 m² building holding the point; 0.3.0, on the same V4 tile
  and without names, turns to the 1,413 m² court 44.5 m away (`why: size`); OpenFreeMap names it 69 m from the point.
- `handoff/building-choice-audit.json`: 3,909 offices with their cause, their OpenStreetMap verdict (358
  `named_elsewhere`, 199 `pin_far`) and both buildings.

## 4. LDS and Location Intelligence parity

`assets/theme.css` is byte-identical to CityMETER · Hotel 0.3.6 and School 0.1.0 (SHA-256 867c64b2…), and every HEX of
`js/scales.js` and `js/cues.js` is the same as School's (only labels, defaults and the group → series binding changed),
so the Hotel parity run (124 checks against the LDS base file and the Location Intelligence Profile) applies unchanged.
The quiet context dots now read the hollow flag (`h`), so a place is a filled grey dot like its focus symbol.

## 5. Rendered QA and performance (build container)

0.3.0: `?office=b86ab4e816` loads with the new module, no console error; before a building is known the office's
Street View opens at the point, as before. The building choice needs the basemap tiles (names, streets), which the
build container cannot reach: it is verified in the owner's Chrome on the live site (§6). The 0.2.0 record:

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

## 6. Live

0.3.0: recorded after publication (the commit after the release).

0.2.0 —

GitHub Pages (main / root), release commit `1932f76`:

- `npm run verify:live` (2026-11-06): **246 ok, 0 failed** — every published file of the manifest at `1932f76`
  byte-identical (SHA-256) on https://montri-th.github.io/governmentoffice/ (`evidence/live-attestation.json`, not
  committed); the root document serves the `index.html` bytes.
- Load over the real network (gzip), headless Chromium in the build container with the network throttled: 100 Mbps /
  20 ms ready in 4.6 s, 20 Mbps / 60 ms (4G) in 6.8 s, 10.1 MB over the wire; the launch card counted the files in
  (“กำลังโหลดหน่วยงานและสถานที่ 440,005 แห่ง · 1 จาก 3 หมวด” …). In the owner's Chrome the three group files (8.6 MB)
  arrived in 2.4 s, but the ES modules took until 5.2 s to load one import after another — so the follow-up commit
  preloads every module of the import map at once (`<link rel="modulepreload">`, `tests/release.test.js`): at 150 ms
  latency the page's modules were ready in 1.5 s instead of 2.6 s.
- Walk in the owner's Chrome with the real basemap, terrain and building tiles (window 1400 × 779; the phone views in
  same-origin frames of the live site at 390 × 844): desktop light first screen — “17% ของหน่วยงานและสถานที่ใน
  นครราชสีมา อยู่ใน 3 อำเภอนี้”, 3,466 จาก 20,003 แห่ง, the three districts filled with their symbols, every other point a
  quiet dot over OpenFreeMap (440,005 rows, heap about 390 MB); `?office=280dc7ddb7` (เทศบาลนครหาดใหญ่) in the 3D
  two-point view of the CityMETER Building V4 building nearest the pin, terrain chips from the DEM, the nearest
  services; `?group=offices` — “22% ของหน่วยงานรัฐในนครราชสีมา อยู่ใน 3 อำเภอนี้”, 165 จาก 744 แห่ง, the switch
  “หน่วยงาน | บุคลากร”; phone light `?area=3001` with the sheet open (อันดับ 28 จาก 925 · 1,185 แห่ง · 5,031 บุคลากร);
  phone dark first screen with the dock (the legend's word on one line); phone dark `?office=280dc7ddb7` in 3D. Launch
  state `ready`, map loaded, no map failure, no console error. The owner's saved theme was put back after the frames.

## 7. Not verified

- CVD simulation, native mobile devices, screen readers beyond the accessible names and roles in the markup.
- Memory and load time on a low-end phone (about 9 MB of data over the wire, gzip).
- Whether each office is open at its production point today (a research-team task, PRODUCT_STATEMENT §7).
- The building of the offices OpenStreetMap does not name: 0.3.0's choice there is measured only on the named ones;
  places (education, religion, community) keep the 0.2.0 tie-break, with names and the street side added.
