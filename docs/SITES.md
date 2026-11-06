# Office sites (research — not on the page)

Owner, 2026-11-06: “ใช้วิธีนี้ และเพิ่มวิธีตาม skill ใหม่เพิ่มเติม osm-area-site-join และ campus-site-join”, then
“เรียงลำดับแบบฉลาดนะ เอาแบบ quick win เอา low hanging fruit ก่อน แค่ให้ครอบคลุมทั้งประเทศ ถ้าสำคัญน้อย เอายาก ก็ไม่เอาครับ”.

0.3.0 picks one building per office for the camera (`docs/BUILDING_CHOICE.md`) and keeps doing so. A **site** adds the
other buildings of the office's compound — the annexes of a district office, the flats of a police station, the wings of
a prison, the buildings of a campus — as one display grouping. A site is never a deed, a parcel, a land area or
ownership. Nothing of this is on the page or in `data/` yet (§5); the drafts live in the researcher's scratch space.

## 1. Order of the work (quick wins first)

| Step | What | Done |
|---|---|---|
| 1 | OpenStreetMap area frames round every office's point, nationwide, automatic (skill `osm-area-site-join`) | government offices and universities and colleges, 2026-11-06 |
| 2 | The same frames where the point stands just outside, or where only repeated points of the same office (or its own fire unit) stand inside | 2026-11-06 |
| 3 | Site layouts on official web pages, one office at a time (skill `campus-site-join`) | not started: slow, and rarely published for government compounds |
| 4 | Department of Lands parcels on LandsMaps (20 searches a day) | not started |
| 5 | Offices where the page draws OpenStreetMap buildings (outside the CityMETER units) | waits for an OSM-building candidates helper (owner) |
| 6 | Frames reaching more than 600 m from the point (large camps, large universities) | skipped: too large for one site |
| — | Schools, places of worship and community places | not started: too many points for the browser route; a production run from a dated Thailand OSM file fits them (§5) |

Police boxes and service points (`1080`) are left out: one small structure each.

## 2. Method

- **Points.** Government offices with a point (`data/offices.json`, 15,942 without the police boxes); universities and
  colleges (`data/groups/education.json`, types 2010–2040, 1,266).
- **OpenStreetMap.** The Overpass API from the owner's browser on this repository's page (the container cannot reach
  it), one query per set of 0.5° boxes round the points: 231 boxes in 4 queries for the offices (OSM data of
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
  is not ที่ 1), part words (บ้านพัก แฟลต สนาม หอประชุม …) send a frame to review.
- **Tiers kept as drafts.** `own` (the skill's rule); `own_family` (inside a frame with the office's name, where the
  other points inside are repeated points of the same office or, for local government, its own fire unit);
  `near_named` (the point within 60 m outside a frame with the office's name and no other office inside).
- **Buildings.** `node scripts/site-candidates.mjs candidates <key> --reach <m>` (ported from montri-th/hotel): CityMETER
  Building V4 as the page draws it (production `building/detailMvt` z14) round the office, each with a point well inside
  it; it stops where the page draws OpenStreetMap buildings (`osm_area`). `--cache` keeps the tiles of one run.
- **Join** (`osm_join.py` of the skill): a building belongs to the site when its interior point stands in the frame;
  `ok` = 2 or more buildings; buildings across the line are listed (`edge`). Every site image was looked at.

## 3. Results (OpenStreetMap 2026-11-06)

| | Government offices | Universities and colleges |
|---|---|---|
| Points | 15,942 | 1,266 |
| With a frame at or near the point | 1,649 | 346 |
| `own` · `review` · `wrong` · `building` · `none` | 126 · 282 · 149 · 347 · 745 | 120 · 132 · 53 · 0 · 41 |
| Candidates (`own` + `own_family` + `near_named`) | 202 | 179 |
| — sent back to review by the checks | 5 | 0 |
| — outside the CityMETER units (`osm_area`) | 36 | 18 |
| — frame reaching past 600 m | 15 | 53 |
| Joined | 146 | 108 |
| **Sites with 2+ buildings** | **138** (130 frames, 2,942 buildings) | **107** (97 frames, 3,691 buildings) |
| One building · frame without buildings | 6 · 2 | 1 · 0 |

Government sites by group: ปกครองและท้องถิ่น 42 · ตำรวจ 40 · ศาลและยุติธรรม 39 (เรือนจำ 34) · ยังไม่ระบุหมวด 8 (กรม/กระทรวง) ·
ทหาร 6 · ดับเพลิง 3; median 10 buildings a site. Campuses: วิทยาลัยรัฐ 76 · มหาวิทยาลัยรัฐ 15 · วิทยาลัยเอกชน 11 ·
มหาวิทยาลัยเอกชน 5.

Reading (inference): OpenStreetMap names the compound of fewer than 1 office in 100 (138 of 15,942), mostly prisons,
police stations and local government; campuses are mapped far better (107 of 1,266, more for large universities beyond
600 m). The court of 0.3.0 (`?office=b86ab4e816`) has no frame. A few frames are long or irregular and want a person's
eye before use (a strip-shaped municipal frame, a long prison frame); 38 government sites have a building across the
line.

## 4. Rules

- OpenStreetMap is ODbL. Frames, and building groups derived from them, form a derivative database: internal use carries
  no obligation; publishing one needs the credit “© OpenStreetMap contributors” and share-alike — the legal team reviews
  first (this is not legal advice). No frame and no group derived from one goes into this repository or onto the web
  until the owner approves the source and the review is done.
- `boundary_source`: Government Office has no site contract yet. The Hotel contract (0.3.6) accepts only
  `dol_parcels+site_layout` and `site_layout`; a frame from OpenStreetMap is a draft or a check until the owner approves a
  new source (proposed `osm_polygon+site_layout`). Never `osm_area`: that code means the page draws OpenStreetMap
  buildings there.
- A point inside a frame is not a site: the name, the kind and the unit number must agree, and a neighbour's building
  added by mistake is worse than one missing.
- What may ever be published of a site: the interior points of its buildings, their count, the `boundary_source`, a
  public layout link and the date. Frames, deed numbers, parcel data, notes and reviewers stay in the research sheet.
- The page changes only by a rebuild from the research sheet; never edit `data/` by hand.

## 5. Waiting for the owner

1. Accept OpenStreetMap frames as a site source for this dataset (`osm_polygon`, or with a layout), after the ODbL review.
2. Where site rows live: a tab of the government research sheet (the Hotel tab `49_SITE_BOUNDARY_CHECK` is for stays).
3. Whether to build the candidates helper for OpenStreetMap buildings (36 + 18 offices waiting, and every office
   outside the CityMETER units).
4. A production run by the development team from a dated Thailand OSM extract (Geofabrik + osmium) instead of Overpass —
   the route for schools, places of worship and community places.

## 6. Reproduce

```sh
# browser (owner's Chrome, on this repository's page): osm_fetch.js of the skill per set of boxes → pairs and frames
# container: classes (osm_match.py --dataset government|school), then per office
node scripts/site-candidates.mjs candidates <key> --reach <min(600, reach of the frame + 20)> --cache <dir>
python3 -I osm_join.py <work> <geom.txt> --candidates sites --classes own,own_family,near_named
```
