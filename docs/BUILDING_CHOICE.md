# The building of an office (release 0.3.0)

Owner, 2026-11-06, on the Juvenile and Family Court of Ubon Ratchathani (`?office=b86ab4e816`): “ทำไมจุดในภาพถึงเลือก
อาคารผิด building ที่พี่ join มา กด google streetview แล้วกลายเป็นร้านกาแฟ ไม่ใช่ศาล … อยากให้พี่หาเคสที่ spatial join
ผิดให้เจอว่ามีรายการไหนบ้าง มีสาเหตุกี่แบบ แต่ละแบบควรแก้อย่างไรถึงจะดีที่สุด แล้วลงมือปรับแก้ให้เรียบร้อยทั้งหมด” and
“streetview ถ้าเลือกแล้วต้องให้หันหน้าเข้าหาอาคารด้วยนะ”.

Choosing an office opens the two-point camera on one drawn building. Up to 0.2.0 that building was the one the
production point falls in, however small, else the nearest one (the larger within 10 m of it). This document records
why that picked the wrong building, how often and for what reasons, what 0.3.0 does instead (`js/office-building.js`)
and which rows still need the research team (`handoff/building-choice-audit.json`). The choice remains a camera
choice: no row, point, count or district membership changes, and the building panel still lists only the points
inside an outline (“หน่วยงานในอาคารนี้”).

## 1. The court

The court's production point (15.233665, 104.854354) falls in a 104 m² building at the street front of the court's
compound — the coffee shop Street View showed. CityMETER Building V4 draws the court itself 1,413 m², seven floors,
45 m south of the point, and OpenFreeMap carries an OpenStreetMap point of interest named
“ศาลเยาวชนและครอบครัวจังหวัดอุบลราชธานี” (`town_hall` / `courthouse`) 69 m from the point. 0.2.0 took the coffee shop
because the point fell in it; 0.3.0 takes the court, both by its name on the map and, without the name, by its size
for a court (a provincial court's floor is 1,000 m²) and its setback from the street.

## 2. Causes — how many kinds, how many rows

Two measurements, both on the government offices (20,568 rows):

- **Named by OpenStreetMap.** 1,547 offices have a feature OpenStreetMap names for them (same kind of office, the
  same name, within 1 km of the point; §4). For 1,104 of them the named building is drawn within 150 m of the point
  (946 in CityMETER units over V4, 158 elsewhere over OpenStreetMap buildings), so whether a rule picks it can be
  judged.
- **Every office in a CityMETER unit.** `scripts/audit-building-choice.mjs` reads the V4 buildings round each of the
  12,736 government offices whose 150 m square meets a CityMETER unit and runs both rules on them (without names and
  streets, which only the browser has).

| # | Cause | What happens | Measured | 0.3.0 |
|---|---|---|---|---|
| 1 | The point falls in another building | a shop, kiosk, guardhouse or neighbour at the street front holds the point; 0.2.0 trusted it | 42 % of the judged points fall in a building; 0.2.0 was right for 80 % of them; 202 offices of the V4 audit change building | name; the type's footprint floor and the size of its buildings; the setback from the street |
| 2 | The point stands in the open; the nearest building is not the office | the point is on the drive, the lawn, the car park or the road; the nearest is a guardhouse, a canteen or the building across the street | 58 % of the judged points (67 % of the V4 audit) fall in no building; 0.2.0 was right for 59 % of them; 2,489 offices of the V4 audit change building (819 of them police boxes, now the nearest structure) | name; the side of the street; size and setback for the types with a floor |
| 3 | The point is far from the office | more than 150 m from the building OpenStreetMap names | 199 of the 1,547 named offices (13 %) | the office's own name, carried by no other office, finds its building within 800 m; otherwise a data fix |
| 4 | Nothing is drawn near the point | no building within 150 m: camps, bases and checkpoints in forest, rural sites, a stray point | 657 offices of the V4 audit (5 %) | the camera still looks 800 m round (0.2.0); a data fix |
| 5 | No building of the type's size near the point | buildings within 150 m, none of half the type's floor | 186 offices of the V4 audit | a data fix (point or building data) |
| 6 | Street View | opened at the point with Google's default heading | every office | the street in front of the chosen building, facing it (§5) |

Causes 1–2 are what a rule can fix; 3–5 are the production point or the building data, listed for the research team.

## 3. The choice in 0.3.0

`chooseBuilding` scores every drawn building within the reach of the point (300 m, 800 m once when nothing is drawn
within it) and keeps the best:

| Term | Weight |
|---|---|
| name — an OpenStreetMap point of interest that can be the office itself (`town_hall`, `office`, `police`, `fire_station`, `prison`, `school`, `place_of_worship` …; never a bus stop, a shop or a restaurant), named as the office (≥ 0.72 of character bigrams after abbreviations are spelled out: สภ. อบต. ทต. ทม. ทน. …) within 150 m — or the office's own name (≥ 0.95), carried by no other office, within 800 m | +6 · exp(−d/15 m) to the buildings at it; distance then counts from the nearer of the point and the named point |
| pin — the point falls inside | +0.9 |
| distance from the point to the outline | −d / 23 m |
| a street (motorway … minor, not service roads, tracks or paths) runs between the point and the building | −1.15 |
| below the type's footprint floor | 1.25 · ln(area / floor) |
| every building, for a type with a floor | 0.45 · ln(area / 300 m²) |
| setback from the street, for a type with a floor | +0.3 per 25 m (up to 60 m) |

Floors (`TYPE_FOOTPRINT_M2`): ที่ว่าการอำเภอ 800 m² · เทศบาลนคร 1,200 · เทศบาลเมือง 800 · เทศบาลตำบล 500 · อบต. 400 ·
สถานีตำรวจ 500 · ศูนย์ฝึกอบรมตำรวจ 600 · สถานีดับเพลิง 240 · courts 800–1,600 · เรือนจำ 600 · camps 400. A police box or
an administrative checkpoint takes the nearest building; every other type without a floor (unclassified offices and
every place of education, religion and community — no reference buildings to fit them on) keeps the 0.2.0
tie-break, the larger within 10 m of the best.

The weights are a conditional logit (one choice among the buildings within 150 m) fitted on the judged offices, the
floors scaled from first guesses (twice the guesses fitted best). Two-fold cross-validation gave 0.2.0 63 %, distance
and size 67 %, with the street side and setback 69 % on the 400 offices whose streets were read. On all judged
offices (the streets read for 558 of them):

| Judged offices | n | 0.2.0 | 0.3.0, without names |
|---|---|---|---|
| point in a building | 467 | 373 (80 %) | 380 (81 %) |
| point in no building | 637 | 373 (59 %) | 411 (65 %) |
| all | 1,104 | 746 (68 %) | 791 (72 %) |
| — named building (OSM outline) | 583 | 427 (73 %) | 449 (77 %) |
| — named point | 347 | 186 (54 %) | 205 (59 %) |
| — named compound (any building in it) | 174 | 133 (76 %) | 137 (79 %) |

The name decides wherever OpenStreetMap names the office: in a sample of 160 named offices, 157 had the name in the
OpenFreeMap tiles the page draws, within 150 m of the point. Geometry alone cannot do much better than 7 in 10 —
in the cases it misses, the office's building is not the largest, the nearest or the tallest of its block — so the
remaining gap is the point itself (causes 3–5), a research task.

The label under the legend follows the choice: “อาคารที่หมุดตก” (the point falls in it), “อาคารตามชื่อบนแผนที่” (its name
on the map decided it) or “อาคารใกล้หมุด”. A building more than 200 m from the point is framed alone.

## 4. Method of the comparison

- OpenStreetMap through the Overpass API (2026-11-06, in the owner's browser): `amenity` = townhall, courthouse,
  police, fire_station or prison; `office` = government; named `building` = government, public or civic; named
  military features — 4,663 named features with geometry in Thailand.
- A feature names an office when it is of the office's kind (district office, local government, police, fire,
  court, prison, military; by tags, else by name) and its name matches (≥ 0.75 of character bigrams, ≥ 0.9 across
  kinds), within 1 km of the point; the best match per office.
- The named building: the drawn building holding the interior point of a named building outline (within 6 m), or
  holding a named point (within 10 m); for a named compound, every drawn building inside it.
- Buildings: CityMETER Building V4 at z16 for offices in a CityMETER unit, OpenFreeMap (OpenStreetMap) buildings at
  z14 elsewhere, as the page draws them (`js/massing.js#shapeCmTile`, `shapeTile`); streets from OpenFreeMap.
- The OpenStreetMap data stays out of this repository; the verdict per office is the `openstreetmap` column of the
  audit (© OpenStreetMap contributors, ODbL).

## 5. Street View

`streetViewOf` (owner: “streetview ถ้าเลือกแล้วต้องให้หันหน้าเข้าหาอาคารด้วยนะ”): the viewpoint is the point of a street
(motorway … service, never a path, a track or a tunnel; ground level before a motorway or a bridge) nearest the centre
of the building being looked at, within 120 m, the street nearer the office's point first when two are as near (a
point is often dropped at the gate); `heading` turns the panorama from there to the building's centre and `pitch`
lifts it for a tall building close by (`map_action=pano&viewpoint=…&heading=…&pitch=…`). Without a street, the
office's point when it stands outside the building; before the building is known, the point with Google's own
heading, as before. The building panel's Street View faces its building the same way.

## 6. The audit file

`handoff/building-choice-audit.json` — columns (`cols`, described in `meta`), one row per government office that changes
building or carries a flag (3,909; spreadsheets stay out of this repository): `key` (the `?office=` key), `name`, `type`, `type_th`, `district`, `pin` (in_a_building · outside_buildings ·
nothing_within_150m · openstreetmap_buildings for an office outside the CityMETER units), `cause`
(pin_in_other_building · nearest_not_it · nothing_within_150m · no_building_of_type_size), `openstreetmap`
(named_elsewhere_<m>: 0.2.0's building was not the one OpenStreetMap names, which stands <m> from the point — 358
offices; pin_far_<m>: the point is <m> from the named place — 199 offices), and the area and distance of the 0.2.0
and 0.3.0 buildings (V4, without names and streets) with `v030_why` (pin · near · size).

```sh
node scripts/audit-building-choice.mjs --tiles <cache dir> --out <dir> --fetch   # V4 tiles round each office, both rules, causes
```

## 7. For the research team

- `pin_far_<m>` (199): the production point stands far from the office OpenStreetMap names — check and move the point.
- `nothing_within_150m` (657) and `no_building_of_type_size` (186): the point is off, or the building is missing from
  the building data.
- `named_elsewhere_<m>` (358): the page now turns to the named building; the point itself can be moved onto it.
