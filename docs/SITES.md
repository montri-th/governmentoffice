# Office sites (release 0.4.0)

Owner, 2026-11-06: “ใช้วิธีนี้ และเพิ่มวิธีตาม skill ใหม่เพิ่มเติม osm-area-site-join และ campus-site-join”, then
“เรียงลำดับแบบฉลาดนะ เอาแบบ quick win เอา low hanging fruit ก่อน แค่ให้ครอบคลุมทั้งประเทศ ถ้าสำคัญน้อย เอายาก ก็ไม่เอาครับ”,
and on the four open questions of the research round: “อนุมัติ ทุกข้อ” (OpenStreetMap frames as a site source, published
under the ODbL with the credit, codes `osm_polygon` and `osm_polygon+site_layout`) · “OK” (site rows in a tab of the
government research sheet) · “OK” (a candidates helper for OpenStreetMap buildings) · “ยังไม่ต้อง เดี๋ยวไว้ไปทำที่ dataset
โรงเรียน วัด แล้ว เชื่อมกลับมาอีกที เตรียมเชื่อมไว้ละกัน” (no production run for schools and temples now; prepare the link).

The camera still picks one building per office (`docs/BUILDING_CHOICE.md`). A **site** adds the other buildings of the
office's compound — the annexes of a district office, the flats of a police station, the wings of a prison, the
buildings of a campus — as one display grouping: the map draws them all in the data colour and frames them with the pin
(legend “อาคารในบริเวณหน่วยงาน”), the panel says “ทั้งบริเวณ N อาคาร”, Street View still faces the building of the office.
A site is never a deed, a parcel, a land area or ownership.

## 1. Order of the work (quick wins first)

| Step | What | Done |
|---|---|---|
| 1 | OpenStreetMap area frames round every office's point, nationwide, automatic (skill `osm-area-site-join`) | government offices and universities and colleges, 2026-11-06 |
| 2 | The same frames where the point stands just outside, or where only repeated points of the same office (or its own fire unit) stand inside | 2026-11-06 |
| 3 | Buildings where the page draws OpenStreetMap buildings (outside the CityMETER units) | 2026-11-06: `scripts/site-buildings.mjs`, run in the owner's browser |
| 4 | Site layouts on official web pages, one office at a time (skill `campus-site-join`, `osm_polygon+site_layout`) | not started: slow, and rarely published for government compounds |
| 5 | Department of Lands parcels on LandsMaps (20 searches a day) | not started |
| 6 | Frames reaching more than 600 m from the point (large camps, large universities) | skipped: too large for one site |
| — | Schools and places of worship | in their own datasets later; the link back is prepared (§8) |

Police boxes and service points (`1080`) are left out: one small structure each.

## 2. Method

- **Points.** Government offices with a point (`data/offices.json`, 15,942 without the police boxes); universities and
  colleges (`data/groups/education.json`, types 2010–2040, 1,266).
- **OpenStreetMap frames.** The Overpass API from the owner's browser on this repository's page (the container cannot
  reach it), one query per set of 0.5° boxes round the points: 231 boxes in 4 queries for the offices (OSM data of
  2026-11-06 12:01–12:05 UTC), 174 boxes in 2 queries for the campuses (12:19–12:20 UTC). Ways and relations with
  geometry; offices: `amenity` = townhall, courthouse, police, fire_station or prison, `office=government`, `government=*`,
  `landuse=military`, `military` = barracks, base, naval_base, training_area, office or airfield; campuses:
  `amenity` = university, college or school, `landuse=education`.
- **Pairs and classes** (`osm_match.py` of the skill, in the browser where the data are, checked against the Python on
  real pairs): a pin inside a frame or within 60 m of it; `own` = inside a frame carrying the office's own name, the
  only office inside, 300 m²–5 km² (campuses 1,000 m²–5 km²); `review`, `wrong`, `building`, `none` as the skill.
  Government words: only office words are generic (สำนักงาน ที่ทำการ ศูนย์ราชการ); organisation words stay in the name
  (a police compound never matches the district office of the same place); abbreviations are spelled out as
  `js/office-building.js` does (สภ. อบต. ทต. …) and สถานีตำรวจภูธร/นครบาล read as สถานีตำรวจ; campus names are read with
  their type prefix (`js/model.js`).
- **Checks added for this dataset.** The frame's kind must fit the office's type (a fire station never takes an office
  compound, a police station only a police, military or government frame …), unit numbers must agree (กองพันทหารม้าที่ 11
  is not ที่ 1), part words (บ้านพัก แฟลต สนาม หอประชุม …) send a frame to review; four long or irregular frames are left
  for a person (status `review`).
- **Tiers.** `own` (the skill's rule); `own_family` (inside a frame with the office's name, where the other points inside
  are repeated points of the same office or, for local government, its own fire unit); `near_named` (the point within
  60 m outside a frame with the office's name and no other office inside).
- **Buildings** (`scripts/site-buildings.mjs`, the page's own map code): the buildings the page draws round the office —
  CityMETER Building V4 inside a CityMETER unit (whole buildings), OpenStreetMap buildings elsewhere (OpenFreeMap tiles,
  the pieces of one building grouped as the page groups them) — each with one point well inside it. In the container:
  `node scripts/site-candidates.mjs candidates <key>`; in the owner's browser for all sites at once:
  `scripts/sites-browser.js` (OpenFreeMap answers there), which fetches each frame by id at the date it was matched.
- **Join** (`joinFrame`, the rule of the skill's `osm_join.py`): a building belongs to the site when its interior point
  stands in the frame (outside its holes); 2 or more buildings make a site. The reach is the frame's farthest corner
  + 20 m; a frame reaching past 600 m is `too_big`.

## 3. Results (OpenStreetMap 2026-11-06, buildings read 2026-11-06)

| | Government offices | Universities and colleges |
|---|---|---|
| Points | 15,942 | 1,266 |
| With a frame at or near the point | 1,649 | 346 |
| `own` · `review` · `wrong` · `building` · `none` | 126 · 282 · 149 · 347 · 745 | 120 · 132 · 53 · 0 · 41 |
| Rows of the site tab (`own` + `own_family` + `near_named`) | 202 | 179 |
| **Published sites (`checked`, 2+ buildings)** | **142** (2,918 buildings, median 9) | **113** (3,839 buildings, median 25) |
| — of which drawn from OpenStreetMap buildings | 8 | 6 |

The site tab's 381 rows: `checked` 255 · `too_big` 78 · `frame_only` 27 (a frame without a drawn building in it) ·
`single_building` 12 · `review` 9 (5 sent back by the checks, 4 long or irregular frames). Published offices by group:
ปกครองและท้องถิ่น 44 · ตำรวจ 42 · ศาลและยุติธรรม 38 (เรือนจำ 33) · ยังไม่ระบุหมวด 9 (กรม/กระทรวง) · ทหาร 6 · ดับเพลิง 3;
campuses: วิทยาลัยรัฐ 78 · มหาวิทยาลัยรัฐ 16 · วิทยาลัยเอกชน 14 · มหาวิทยาลัยเอกชน 5. By tier: `own` 160 · `near_named` 65 ·
`own_family` 30. The largest: มหาวิทยาลัยทักษิณ 172 buildings.

Reading (inference): OpenStreetMap names the compound of fewer than 1 office in 100, mostly prisons, police stations and
local government; campuses are mapped far better. The court of 0.3.0 (`?office=b86ab4e816`) has no frame.

## 4. Rules

- **Licence.** OpenStreetMap is © OpenStreetMap contributors under the ODbL 1.0. The site groups are a database derived
  from its frames (and from its buildings where the map draws them): `data/sites.json` is offered under the ODbL 1.0
  (owner approval 2026-11-06, “อนุมัติ ทุกข้อ”), and every view that shows a site carries the credit with a link to
  https://www.openstreetmap.org/copyright (the panel's “ที่มาและพิกัด” and the provenance line). Not legal advice.
- **`boundary_source`.** Approved for this dataset: `osm_polygon` (an OpenStreetMap frame) and `osm_polygon+site_layout`
  (a frame checked against the project's own public layout). Never `osm_area`: that code of `campus-site-join` means the
  page draws OpenStreetMap buildings there.
- **Membership.** A point inside a frame is not a site: the name, the kind and the unit number must agree, and a
  neighbour's building added by mistake is worse than one missing.
- **Published per site** (`data/sites.json`): the interior points of its buildings, their count, the date, the
  `boundary_source`, the building source and, for a layout check, the public layout page. **Stays in the research
  sheet:** the frame (`boundary_geojson`), the OpenStreetMap element link, the match tier, the notes and the checker.
- **Points** come only from `scripts/site-buildings.mjs` (never read off a map or guessed); a building more than 600 m
  from the office's own point stops the build.
- **The page changes only by a rebuild from the research sheet** (`scripts/build-sites.py`); never edit `data/` by hand.

## 5. The site tab — `07_SITE_BOUNDARY_CHECK`

A tab of the government research sheet (“CityMETER Government Office Thailand — รายชื่อรอยืนยัน 2026-11-05”, plain-text
cells), one row per office matched to a frame:

| Column | |
|---|---|
| `office_key` | the row's key (first 10 hex of the production UUID) |
| `name` · `type` · `district` | for the reader (the page takes them from `data/`) |
| `boundary_status` | `checked` (published) · `review` · `single_building` · `frame_only` · `too_big` |
| `boundary_source` | `osm_polygon` · `osm_polygon+site_layout` |
| `boundary_evidence_url` | the OpenStreetMap element (frame-only) or the public layout page (with a layout) |
| `boundary_geojson` | the frame — never published |
| `buildings_in_boundary` | “lon,lat;…” 6 decimals, sorted: one interior point per building |
| `buildings_count` | their number |
| `building_source` | `cm_v4` (CityMETER Building V4) · `osm_buildings` (OpenStreetMap) |
| `match_tier` | `own` · `own_family` · `near_named` |
| `main_building_note` · `checked_by` · `checked_on` · `notes` | the check; notes carry the OSM date, the tag, the size in ไร่ and how far a near pin stands |

A person changes a row by editing it in the sheet (for example `review` → `checked` after looking, or adding a layout and
`osm_polygon+site_layout`); the next rebuild publishes it.

## 6. Rebuild

```sh
# 1. browser (owner's Chrome, signed in, on the research sheet's page): scripts/export-sheet-tabs.js, then
#      await siteTabDigest({name: '07_SITE_BOUNDARY_CHECK', gid: <gid>})   → {digest, counts, checked, tsvSha256}
#      await exportSheetTabs([{name: '07_SITE_BOUNDARY_CHECK', gid: <gid>}], {into: 'page'})  → decode-sheet-payload.py
# 2. container
python3 -I scripts/build-sites.py --tab <dir>/07_SITE_BOUNDARY_CHECK.json --sheet-digest <digest> --read-on <date> \
  --frames-at 2026-11-06T12:05:51Z --frames-at 2026-11-06T12:20:02Z
```

The digest is the SHA-256 of the tab's checked rows in the columns the build reads (canonical JSON); equal digests prove
the build read what the sheet holds. Release 0.4.0 read the checked rows of those columns from the run that wrote the
tab, proven equal to the sheet by the digest computed on the sheet's page (`meta.tab.readMethod`).

## 7. Research run (reproduce the tab)

```sh
# browser (owner's Chrome, on this repository's page): osm_fetch.js of the skill per set of boxes → pairs and frames
# container: classes (osm_match.py --dataset government|school) → the rows key|element|tier|go|metres|date
# browser: window.__SITES_IN = {dates, rows, check}; scripts/sites-browser.js → window.__SITES.text.tsv (the tab's rows)
```

## 8. Link from School and Temple (prepared)

The School and Temple datasets will make their own sites (layouts, parcels) and link them back here. A site file of
another dataset — its published `data/sites.json` with `meta.dataset` — names the Government Office row a site is with
`go` (the row's key); `scripts/build-sites.py --external <file>` (repeatable) takes it when that row exists and the site
lies within 600 m of the row's point. Rank: `dol_parcels+site_layout` 4 · `osm_polygon+site_layout` 3 · `site_layout` 2 ·
`osm_polygon` 1 — a site of the other dataset replaces this sheet's only when it ranks higher (a layout check beats a frame
alone); an equal rank keeps this sheet's. `meta.external` records each file (dataset, SHA-256, offered · linked · used)
and the site carries `x` (its file); the panel names the dataset. None is linked in 0.4.0.
