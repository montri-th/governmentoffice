# CityMETER Government Office 0.4.0 — verification

Release 0.4.0 (cache tag `20261106-r8`), built 2026-11-06. 0.4.0 answers the owner's requests of 2026-11-06 “ใช้วิธีนี้
และเพิ่มวิธีตาม skill ใหม่เพิ่มเติม osm-area-site-join และ campus-site-join” and “เรียงลำดับแบบฉลาดนะ เอาแบบ quick win … แค่ให้
ครอบคลุมทั้งประเทศ”, with the decisions “อนุมัติ ทุกข้อ” · “OK” · “OK” · “ยังไม่ต้อง … เตรียมเชื่อมไว้ละกัน”: an office's site —
every drawn building of its compound — from the research sheet's new tab `07_SITE_BOUNDARY_CHECK` (`data/sites.json`,
`docs/SITES.md`), shown on the map as one site. 0.3.0 (the building the camera turns to, Street View facing it) and 0.2.0
(every production point a row) are unchanged; `data/offices.json` and the group files are 0.2.0's byte for byte, so §1
is 0.2.0's build record. The code base is CityMETER · Hotel 0.3.6 (montri-th/hotel @177e592f) through CityMETER · School
0.1.0; the contracts they share were verified there and are carried unchanged except the building of an office and the
office's site.

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

## 2. Unit tests on the real data — 152 pass, 0 fail

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
the street in front facing the building, the link's heading and pitch) · office sites (0.4.0, `tests/sites.test.js`:
`data/sites.json` against the data, decoding, the panel chip and credit, `build-sites.py` on made-up tabs — the reduced read,
the sheet digest, the stops, the School/Temple link; `tests/site-buildings.test.js`: the candidates of both building
sources) · release (one cache tag, one version,
schema-valid handoff JSON, hygiene).

## 3. Office sites (0.4.0)

- Frames: OpenStreetMap areas round 15,942 government offices and 1,266 universities and colleges (Overpass, OSM data of
  2026-11-06 12:01–12:20 UTC, in the owner's browser), matched by place and name with the dataset's checks (kind, unit
  number, part words); 381 offices and campuses took a frame (`own` 246 · `near_named` 99 · `own_family` 36).
- Buildings (`scripts/sites-browser.js` on this repository's page, `scripts/site-buildings.mjs`): each frame fetched by id
  at the date it was matched; CityMETER Building V4 inside a CityMETER unit, OpenStreetMap buildings elsewhere; a building
  belongs when its interior point stands in the frame. The container's own run (`site-candidates.mjs`) gave the same
  members for all 254 V4 sites (in 6 of them one interior point lies 0.1–0.5 m from the browser's, inside the same
  building — the browser's points, which the sheet holds, are published).
- The tab: the run's 381 rows pasted into the new tab `07_SITE_BOUNDARY_CHECK` of the research sheet (plain-text cells),
  read back from the sheet's own HTML view (`siteTabDigest`): 381 rows × 16 columns, the whole tab's text SHA-256
  `8ac6dd2b…` = the pasted text; `checked` 255 · `too_big` 78 · `frame_only` 27 · `single_building` 12 · `review` 9; digest
  of the checked rows `fbd4065a…` = the build's input (`scripts/build-sites.py --sheet-digest` stops otherwise).
- `data/sites.json`: 255 sites (142 government offices, 113 campuses), 6,757 buildings (241 sites over V4, 14 over
  OpenStreetMap buildings), every point in Thailand, six decimals, within 600 m of its office's point; ODbL 1.0 with the
  credit; no frame, OpenStreetMap element link, tier, note or checker.

## 3b. The building of an office (0.3.0)

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

0.4.0: local page in Playwright with MapLibre 5.6.2 from the npm package; OpenFreeMap answered with an empty tile set
(unreachable here), CityMETER Building V4 live. `?office=304e6e8f19` (สำนักงานตำรวจแห่งชาติ, 21 buildings), 1440 × 900
light: every building of the site drawn in the data colour and framed with the pin (zoom 17.6, pitch 75), legend
“อาคารในบริเวณหน่วยงาน”, chip “ทั้งบริเวณ 21 อาคาร”, the provenance line “บริเวณ กรอบพื้นที่ OpenStreetMap 6 พ.ย. 2569
© OpenStreetMap contributors”, Street View on the building the camera picks; `?office=47d101fb14`
(มหาวิทยาลัยราชภัฏนครสวรรค์, 132 buildings) dark: all 132 found among the drawn pieces and framed (zoom 16.9);
`?office=48fc01ad05` (สถานีตำรวจนครบาลลุมพินี, 16) at 390 × 844: framed above the sheet. The sites over OpenStreetMap
buildings need the basemap tiles: verified live (§6).

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

0.3.0 — release commits `c2314e4` (0.3.0), `be7c329` and `2529478` (Street View from the street people come in from;
cache tag `20261106-r6`):

- `npm run verify:live` (2026-11-06, commit `2529478`): **249 ok, 0 failed** — every published file byte-identical
  (SHA-256) on https://montri-th.github.io/governmentoffice/ (`evidence/live-attestation.json`, not committed).
- The court in the owner's Chrome (window 1400 × 779, real OpenFreeMap tiles, CityMETER Building V4): `?office=b86ab4e816`
  turns to the court — “อาคารตามชื่อบนแผนที่”, OpenStreetMap's “ศาลเยาวชนและครอบครัวจังหวัดอุบลราชธานี” 69 m from the point,
  the building 44.7 m from it — framed with the point; desktop light and dark; the phone in a 390 × 844 frame of the live
  site, light and dark, the sheet open on the office. Street View opens on the gate street, 9 m from the point, heading
  155°: Google's panorama (June 2024) shows the coffee shop on the right and the court's white building behind the gate.
  The first published version stood Street View on the court's drive, the next on the alley behind it (`be7c329`,
  `2529478` fixed both). The owner's saved theme was put back after the frames.
- Twelve more offices opened live: the six 0.2.0 picks OpenStreetMap names elsewhere (two police stations, two ministries'
  offices, เทศบาลนครหาดใหญ่, กรมส่งเสริมวัฒนธรรม) and two อบต. turn to their named buildings (27–99 m); a police
  station keeps the building holding its point (the audit, without the streets, had preferred a larger neighbour); offices without a
  name take a building of their type's size (28–77 m), labelled “อาคารใกล้หมุด”; a department carrying its
  municipality's name (สำนักงานงานความสะอาด เทศบาลนครเชียงใหม่) stays at its own point. A building panel (11 offices in one
  building) opens Street View facing the building. First screen as in 0.2.0; no console error.


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

- Office sites: whether each frame is the office's whole compound and nothing more is not checked against a layout or
  the parcels (`osm_polygon`, docs/SITES.md §4); the 9 rows in `review` and the 78 frames past 600 m wait for a person.
- CVD simulation, native mobile devices, screen readers beyond the accessible names and roles in the markup.
- Memory and load time on a low-end phone (about 9 MB of data over the wire, gzip).
- Whether each office is open at its production point today (a research-team task, PRODUCT_STATEMENT §7).
- The building of the offices OpenStreetMap does not name: 0.3.0's choice there is measured only on the named ones;
  places (education, religion, community) keep the 0.2.0 tie-break, with names and the street side added.
