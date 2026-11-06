# CityMETER · Government Office — data and method

How `data/offices.json` and `data/groups/*.json` are built, what one row and one figure mean, and what the demo never
claims. Every number below is a snapshot of release 0.2.0 (data built 2026-11-06 from the research sheet as it stood on
2026-11-06, read cell by cell the same day); the page computes everything from the data at run time, so these are
fixtures, not constants. Release 0.2.0 (owner 2026-11-06, “อยากได้ทั้งสี่แสนจุด”): every production point is a row and
the page reads every group by default; 0.1.0 read the six government-office groups by default and kept the repeated
points of one office as one row.

## วิธีนับ — อ่านตัวเลขในหน้าอย่างไร

หน้าจอไม่มีคำเตือน (กติกาเดียวกับ CityMETER · Hotel ที่เจ้าของตั้งไว้ 1 พ.ย. 2569: “ไม่มี caveats เลย”) ทุกบรรทัดที่มาท้ายหน้ามีลิงก์ “วิธีนับ” มาที่นี่ ขอบเขตของตัวเลขอยู่ตรงนี้ที่เดียว

- **แห่ง** = หนึ่งจุดของ CityMETER Government Officer (production) — 1 จุด = 1 แห่ง เท่ากับที่ production นับ (440,005 จุดทั่วประเทศ) จุดซ้ำของหน่วยงานเดียวกันก็นับแยกตาม production ชุดข้อมูลเป็นรายชื่อรอยืนยันของทีมวิจัย ยังไม่ได้ตรวจภาคสนามว่าเปิดทำการอยู่ที่จุดนั้น ไม่ใช่ทะเบียนหน่วยงานราชการอย่างเป็นทางการ
- **หน่วยงานและสถานที่** = ทุกหมวดของชุดข้อมูล (ค่าเริ่มต้นของหน้า) · **หน่วยงาน** = หน่วยงานรัฐ 6 หมวด · **สถานที่** = การศึกษา ศาสนา และชุมชน (ไม่มีบุคลากร)
- **บุคลากร** = จำนวนที่ production บันทึกไว้ที่หน่วยงาน (`officer`) รวมต่อพื้นที่ เฉพาะประเภทที่บันทึกรายแห่ง (อบต. ทต. ทม. ทน. สถานีดับเพลิง ศาลจังหวัด ศาลแขวง ค่ายทหาร …) ไม่ใช่จำนวนข้าราชการทั้งหมดของพื้นที่ ประชากรกลางวัน หรือกำลังให้บริการต่อประชากร หน่วยงานที่ไม่ทราบจำนวนบุคลากรไม่นับเป็น 0 คน (แท่ง “ไม่ทราบ” ลายทแยง และ “—” ในช่องตัวเลข)
- **บุคลากรนับที่อีกจุด** = อปท. (อบต. ทต. ทม. ทน.) ที่มีหลายจุด production บันทึกบุคลากรของทั้งองค์กรซ้ำทุกจุด และจุดซ้ำของหน่วยงานเดียวกัน (ประเภทและชื่อเดียวกัน จังหวัดเดียวกัน ห่างกันเป็นทอด ๆ ไม่เกิน 100 ม.) ชุดข้อมูลนี้นับบุคลากรครั้งเดียวที่จุดหนึ่ง จุดอื่นบอกว่านับที่ไหน
- **ทั้งหน่วยงาน** = สำนักงานใหญ่ที่ production ยังไม่ระบุหมวด บันทึกบุคลากรของทั้งหน่วยงาน (ทุกสาขา) ไว้ที่จุดเดียว แสดงที่หน่วยงานนั้นเท่านั้น ไม่รวมเข้ายอดพื้นที่
- **หมวด** = จัดกลุ่มเพื่ออ่านแผนที่จากหมวดของ production: ปกครองและท้องถิ่น · ตำรวจ · ดับเพลิง · ศาลและยุติธรรม · ทหาร · ยังไม่ระบุหมวด (หน่วยงานรัฐ) และการศึกษาและแหล่งเรียนรู้ · ศาสนาและโบราณสถาน · ชุมชนและสมาคม (สถานที่) · ค่าเริ่มต้นคือทุกหมวด
- **ประเภท** = รหัสและชื่อประเภทของ production (`gov_sub_office_id`) ไม่แก้ชื่อ ไม่จัดใหม่จากชื่อหน่วยงาน
- **สัดส่วนของจังหวัด** = หน่วยงาน (หรือบุคลากร) ในพื้นที่ ÷ ทั้งจังหวัดในตัวกรอง
- **ใกล้รถไฟฟ้า** = ห่างจุดอ้างอิงของสถานีที่เปิดแล้วไม่เกิน 500 ม. เป็นระยะตรง ไม่ใช่ระยะเดิน เวลาเดินทาง หรือเขตพื้นที่บริการ (ตัวตั้งและตัวหารอยู่ในคำอธิบายของแต่ละแท่ง)
- **บริการรัฐที่ใกล้ที่สุด** = หน่วยงานของ 5 บริการ (ที่ว่าการอำเภอ · สำนักงานท้องถิ่น · สถานีตำรวจ · สถานีดับเพลิง · ศาล) ที่จุดใกล้ที่สุดในระยะตรง 30 กม. แสดงเฉพาะบริการที่ production มีประเภทนั้นในจังหวัดของจุด (production ไม่มีที่ว่าการอำเภอ สำนักงานท้องถิ่น และศาลแบบระบุประเภทในกรุงเทพมหานคร จึงไม่แสดงสามช่องนั้นในกรุงเทพฯ) ไม่ใช่เขตอำนาจ เขตพื้นที่บริการ หรือหน่วยงานที่ต้องติดต่อ
- **หน่วยงานรอบ ๆ** = หน่วยงานหมวดเดียวกันในระยะตรง 2 กม. เรียงใกล้ก่อน และจำนวนทุกหมวดในระยะเดียวกัน
- **ย้ายและเปิดใหม่** = เหตุการณ์ 2567–2569 ที่ทีมวิจัยพบว่า production ยังไม่มีที่ตั้งใหม่: ย้ายที่ตั้ง · เปิดอาคารสำนักงานใหม่ · เปิดสำนักงานใหม่ · เปิดจุดบริการ พร้อมวันที่ตามประกาศ ความหมายของวันที่ และลิงก์ประกาศ “จุดเดิมใน CityMETER” = แถวของ production ที่ชีตระบุว่าเหตุการณ์นั้นแทน
- **อาคาร** = อาคารบนแผนที่ (CityMETER Building V4 หรือ OpenStreetMap ตามพื้นที่) ความสูง “สูงราว” เป็นค่าประมาณของชุดข้อมูล “หน่วยงานในอาคารนี้” = หมุดของหน่วยงานอยู่ในขอบอาคาร หมุดคือจุดของ production ไม่ใช่ทางเข้าหรือขอบเขตที่ดิน
- **อาคารใกล้หมุด** = เมื่อหมุดไม่อยู่ในขอบอาคารใด มุมมองอาคาร 3 มิติเปิดที่อาคารบนแผนที่ที่ใกล้หมุดที่สุดภายใน 300 ม. (ไม่มีก็ขยายเป็น 800 ม.) โดยมีหมุดในภาพ เป็นการเลือกมุมกล้องเท่านั้น
- **ภูมิประเทศ** = พื้นดินรอบหมุด (รัศมี 500 ม. ต้นไม้ 300 ม.) จาก SRTM 30 ม. (สำรวจปี 2543) และแผนที่ OSM ไม่ใช่การประเมินความเสี่ยง
- **สถานีที่กำลังสร้าง** = โครงการ ยังไม่ใช่บริการ

## 1. Sources

| Input | What it is | Published here? |
|---|---|---|
| Research sheet “CityMETER Government Office Thailand — รายชื่อรอยืนยัน 2026-11-05” (registry `research.TH.government_office`, Google Sheets, modified 2026-11-06T03:51:53Z) | The production Government Officer dataset (`https://landometer.com/v3/citymeter?d=governmentOfficer`, dataset `government_agency`) as the research team exported it point by point, with the OPDC/DGA agency list, a DOPA/BMA office name list, recent moves and openings with their announcements, and the sources | Only the fields of §2–8, each tab bound by a hash (`meta.tabs`); never the sheet, its cells or its address |
| Tabs read | `05_PRODUCTION_ROWS` (440,005 production points) · `06_RECENT_PROD_GAPS` (97 events, with the hyperlinks of its link cells) · `01_AGENCIES` (459 agencies) · `03_RECENT_EVENTS` (7) · `04_SOURCES` (9) · `00_README` · `02_OFFICE_CANDIDATES` (17,044 names, read and hashed, not published) | — |
| CityMETER production base info (public read-only API, `base/info/lv0` and `lv1/{province}`) | Province, district and subdistrict codes, Thai names, areaSqm | Receipts only (`data/boundary-receipts.json`, 78 responses read 2026-11-06) |
| CityMETER production government-agency info (`government-agency/info/lv0`) | Points and Σ officer per district × category — the reconciliation target (§6) | Its receipt only (`meta.reconciliation.receipt`) |
| District outlines | `data/frames/{CODE}.json` (production SUBDISTRICT geometry dissolved to districts, from montri-th/pharmacy, as in Hotel and School) | Yes (display geometry) |
| CityMETER · Transit | Rail stations (montri-th/transit @5f5232d0, `data/transit.json` SHA-256 0916636a…, release `transit-data-2026-10-31-r1`) | The stations the page draws or names (`stations`) |
| Building units | `data/building-units/` copied from CityMETER · Hotel (montri-th/hotel @177e592f) by `scripts/adapt-building-units.py` (§10) | Yes |

The sheet is too large for a Drive export: every tab was read from the sheet's own HTML view in the owner's browser
(`scripts/export-sheet-tabs.js`; `05_PRODUCTION_ROWS` in its compact form, rebuilt by `scripts/join-compact-payload.py`,
the other tabs decoded by `scripts/decode-sheet-payload.py`), and the SHA-256 of each tab's rows as canonical JSON is
recorded in `meta.tabs` so a later read can be compared tab by tab. The tab files stay outside the repository.

## 2. One row, two measures

One row = one production point: a point of `05_PRODUCTION_ROWS` (one production UUID), as production counts them —
440,005 points, 440,005 rows. Nothing is merged, moved, split or re-labelled; the key is the first 10 hex digits of the
UUID (unique, checked). A row is a production point, not a field-verified office. 9,806 points repeat an office (same
type, same name — spaces and zero-width characters ignored — same province, chained within 100 m): they stay rows, as
production has them; only their personnel is counted once (§3).

| Measure | Definition | Unit | Scale |
|---|---|---|---|
| `count` (default) | rows | แห่ง | LDS `count` |
| `staff` | Σ personnel production records at the office (§3), known values only | คน | LI `li.supply` |

The default scope is every group — every production point (“หน่วยงานและสถานที่”, 440,005 rows). The government
offices (“หน่วยงาน”, `?group=offices`, 20,568 rows: ปกครองและท้องถิ่น 9,667 · ตำรวจ 6,548 · ดับเพลิง 2,270 ·
ยังไม่ระบุหมวด 903 · ทหาร 708 · ศาลและยุติธรรม 472) arrive with `data/offices.json`; the places (“สถานที่”, 419,437
rows: การศึกษาและแหล่งเรียนรู้ 75,835 · ศาสนาและโบราณสถาน 111,421 · ชุมชนและสมาคม 232,181) with
`data/groups/<group>.json` (bytes and SHA-256 in `data/offices.json`); the page loads every file before its first paint.
Personnel does not apply to places: production's value there means something else (students, 1 per point, 0), so a
place is never “unknown personnel”, adds nothing to a personnel total, and the personnel switch is off for a scope of
places only.

## 3. Personnel (production's `officer`)

A row's personnel is known only when its type records a count at that site. The rule per type of the office groups is
read from the values themselves (`meta.staffRules`):

| Rule | When | Types (production codes) | Shown as |
|---|---|---|---|
| `site` | otherwise | อบต. 1020 · ทต. 1030 · ทม. 1040 · ทน. 1050 · สถานีดับเพลิง 1121 · ศาลจังหวัด 1182 · ศาลแขวง 1192 · ศาลอุทธรณ์ภาค 1152 · สนง.ศาลยุติธรรมภาค 1142 · ค่ายทหาร 1100 · ศูนย์ฝึกทหาร 1110 | the recorded count |
| `constant` | ≥ 90 % of the positive values are one value (a default, not a count) | จุดบริการตำรวจ 1080 · ศูนย์ฝึกตำรวจ 1090 · ศาลปกครอง 1210 · เรือนจำ 1130 | unknown |
| `scale` | 90th percentile of the positive values below 10 | ที่ว่าการอำเภอ 1010 · ศาลเยาวชนฯ 1202 · ศาลคดีทุจริตภาค 1162 · ศาลแรงงานภาค 1172 | unknown |
| `none` | no positive value | สถานีตำรวจ 1070 · ท้องถิ่นรูปแบบพิเศษ 1060 | unknown |
| `agency` | the points without a category are agencies' head offices; the value is the agency's whole workforce | ยังไม่ระบุประเภท | “ทั้งหน่วยงาน N คน” on the office only (177 rows), never in an area total |

Blank and 0 are unknown, never zero personnel. Personnel is counted once per office and per organisation; the points
that do not count it name the point that does (`staffShared`, 744 rows):

- repeated points of one office (§2) record its personnel once, at the point with the smallest UUID that records any
  (562 rows, 47,393 people not counted twice);
- a local government's personnel (types 1020–1050) is the organisation's (`gov_name`): production repeats it at every
  point of the organisation, so it is counted once per organisation and province, at its office with the smallest key
  (182 rows, 14,548 people not counted twice).

10,095 offices record personnel, Σ 535,745 people; 9,729 offices have unknown personnel (a hollow symbol, a hatched
bar, “—” in a tile); a district whose offices all have unknown personnel is `no_data` (hatch) under the personnel
measure, and a district with places only records none (a measured 0).

## 4. District membership (build time, never re-assigned on screen)

The district of a row is the production district of its overlay subdistrict (`overlay_subdistrict_ids` → production
base info lv1 subdistrict → its district code): production's own spatial membership. 925 of the 928 production
districts hold a point (and a government office); the other three are a measured 0, never no data. Rows are never
re-assigned by a point-in-polygon test on display coordinates or by a name at run time.

## 5. Points

Every row carries its production point (six decimals, inside Thailand). A point is where production placed the
office, not an entrance or a land parcel. Repeated points of one office (§2) are drawn where production placed each
of them.

## 6. Reconciliation with production (the build stops on any failure)

Rows and Σ officer per production district × category of `05_PRODUCTION_ROWS` equal production's government-agency
info lv0 read the same day: 9,046 district × category cells, 0 mismatches; production's country total is 440,005
points, the sheet's 440,005 rows and this dataset's 440,005 rows (`meta.reconciliation`, with the response's receipt).

## 7. Groups, types and agencies

Groups present production's 13 categories and the points without one (`js/cues.js#GROUP_SERIES`, DATAVIZ-05 series +
shape cue, no star): ปกครอง (admin, circle) · ตำรวจ (police, square) · ดับเพลิง (fire, triangle) · ยุติธรรม (justice,
diamond) · ทหาร (military, cross) · ยังไม่ระบุหมวด (unclassified, dash) · การศึกษา (education, hexagon: มหาวิทยาลัย ·
โรงเรียน · แหล่งความรู้) · ศาสนาและโบราณสถาน (religion, ring) · ชุมชนและสมาคม (community, plus: ชุมชน · ความปลอดภัย
ชุมชน · สมาคม / มูลนิธิ). Types are production's `gov_sub_office_id` with production's own labels (61 types) and a short
form for tight places; a tier orders lists and labels (1 = ที่ว่าการอำเภอ, เทศบาลนคร/เมือง, สถานีตำรวจ, สถานีดับเพลิง,
ศาล, head offices …). The agency line under an office is production's `gov_name`; its parent organisation comes from
`01_AGENCIES` (the OPDC/DGA agency list) by exact name only.

## 8. Context from the same registry and the research (straight lines, build time)

- **Rail** — the nearest operating station of CityMETER · Transit and the nearest station under construction within
  2 km of the production point (straight line to the station reference point), with the commit and SHA-256 of the
  Transit file (`meta.context.rail`).
- **Recent moves and openings** — `06_RECENT_PROD_GAPS`: 97 events (ย้ายที่ตั้ง 51 · เปิดอาคารสำนักงานใหม่ 37 ·
  เปิดจุดบริการ 7 · เปิดสำนักงานใหม่ 2), newest first, each with its date, what the date means, the new and old place
  as the sheet wrote them, and its announcements (public https pages only); 18 name the production row they replace.
  Map links and coordinate sources are not published.

## 9. What the page computes

The first finding, the choropleth, the ranks and the charts read the same rows (`scopeRows`: every production point
by default, or the หมวด / ประเภท / จังหวัด / search filters) and the same measure.
The leading province is the one holding the most of the measure at district level; the focus is up to three of its
districts with the most of it, never cutting through a tie and never every district that holds it; the share is of
the province's whole total, with numerator and denominator; the rail comparison (focus vs the rest of the province,
rows with a point) is shown only when something is near an operating station; the outside finding is the district(s)
with the most outside that province (`js/area-insight.js`). The nearest services (`js/profile-model.js#SERVICES`) and
the offices round an office read every loaded row, so they do not move with the filters.

## 10. Map: symbols, names, terrain, buildings

One symbol = one row; never clustered. The symbol's area grows with recorded personnel (cap 1,000), the colour and
shape say the group; an office with unknown personnel is an open shape at the 40-person size; a place of the other
groups is filled at that size. Outside the focus every point of the scope is a quiet grey dot (up to 440,005; the dots
without recorded personnel travel to the map as one multipoint each, display only). Names near the middle of the view (from zoom 12.5) rank by the type's tier, then
recorded personnel; short forms are those Thai readers use (อบต. ทต. ทม. ทน. สภ. สน. …). Buildings per area: the units
of the CityMETER · Hotel build (`data/building-units/`, copied without the per-unit hotel counts): CityMETER Building V4
inside a unit where it holds at least 1.15 × the OpenStreetMap buildings, else OpenStreetMap. Terrain and the building
camera follow the Hotel 0.3.x contracts unchanged.

## 11. Not published

Telephone numbers, e-mail addresses, postal addresses and websites of 05; full production UUIDs and office ids;
overlay subdistrict ids; researcher summaries and gap reasons of 06; private sheet links; map links and coordinate
sources; the `02_OFFICE_CANDIDATES` rows (a DOPA/BMA name list with repeats, not offices); the contact addresses and
evidence ids of `01_AGENCIES` (`meta.excludedFields`). Source links are public https pages only, never the production
API, a private copy or the private production repository.

## 12. Research follow-ups (reported, not patched in `data/`)

- Bangkok: production holds no typed district office (สำนักงานเขต), local government or court there — the BMA, its
  50 district offices and Bangkok's courts are untyped head offices or absent; the services list leaves those slots
  out in Bangkok rather than naming an office in another province.
- Police stations, district offices and several court types record no usable personnel in production (`none`,
  `scale`, `constant`).
- 79 of the 97 recent events name no production row; their new places are not points of this dataset.
- 9,806 production points repeat an office (same type and name, same province, within 100 m) — counted as production
  counts them since 0.2.0. Some make a district lead: อำเภอพุนพิน holds 92 government-office points, 16 of them one police station
  (13 named สถานีตำรวจภูธรอำเภอพุนพิน, 3 with a variant of the name) within about 400 m. A cleaned production would
  lower those counts.
- 899 points have no category yet (“ยังไม่ระบุหมวด”), mostly agencies' head offices in Bangkok.

## 13. Rebuild

```sh
# 1. Read the tabs (owner's browser, signed in, on the sheet's page): scripts/export-sheet-tabs.js — the compact form
#    for 05_PRODUCTION_ROWS (python3 -I scripts/join-compact-payload.py <pages…> <tabs>/05_PRODUCTION_ROWS.json), the
#    other tabs and the hyperlinks of 06 (python3 -I scripts/decode-sheet-payload.py <payload> <tabs>)
# 2. Production base info and government-agency info with receipts; the district index and outlines
python3 -I scripts/fetch-base.py --out <api>
python3 -I scripts/build-receipts.py --api <api> --out .
python3 -I scripts/build-boundaries.py --pharmacy <montri-th/pharmacy checkout> --api <api> --ogd <OpenGISData districts.geojson> --out .
# 3. The dataset (stops on any reconciliation failure)
python3 -I scripts/build-data.py --tabs <tabs> --api <api> --index data/area-index.json --transit <montri-th/transit checkout> --out .
# 4. Building units from a montri-th/hotel checkout
python3 -I scripts/adapt-building-units.py --hotel <hotel checkout> --commit <hotel commit> --out data/building-units
```
