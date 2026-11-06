# CityMETER Government Office — Implementation Plan (0.1.0)

คู่กับ `implementation-plan.json`

## สถาปัตยกรรม

Static site บน GitHub Pages · ES modules ผ่าน import map (ทุกโมดูลมี `?v=` เดียวกัน) · ไม่มี build step · Node ≥ 20 สำหรับ tests · Python 3 สำหรับสร้างข้อมูล · MapLibre GL JS 5.6.2 จาก unpkg (ล็อกรุ่น) · basemap OpenFreeMap

| โมดูล | หน้าที่ |
|---|---|
| `js/app.js` | ประสาน state, row scopes, หมวดที่โหลดเมื่อเลือก, โหมดแผง, URL, กล้อง, คลิกบนแผนที่ |
| `js/model.js` | decode `data/offices.json` และไฟล์หมวด, มาตรวัด (หน่วยงาน · บุคลากร) และคำตามขอบเขต (`unitFor`), ตัวกรอง, สรุป, ลิงก์ production/Transit |
| `js/area-insight.js` | ข้อค้นพบแรก (กฎ tie และ N − 1, บรรทัดรถไฟฟ้า) |
| `js/profile-model.js` | โมเดลแผง: overview, area, station, building, office, type; บริการรัฐที่ใกล้ที่สุด, หน่วยงานรอบ ๆ, เหตุการณ์ |
| `js/panel.js` | HTML ของแผงทุกโหมด + provenance |
| `js/charts.js` · `js/chart-model.js` | กราฟ areas / mix / types |
| `js/scales.js` · `js/cues.js` | สเกล `count` + `li.supply` 41 ระดับ, series + shape cue ของ 9 หมวด |
| `js/map-layers.js` · `js/provinces.js` · `js/frames.js` · `js/areas.js` | choropleth เขต/อำเภอ, กรอบจังหวัด, ขอบเขตรายจังหวัด, ดัชนีพื้นที่ |
| `js/pins.js` · `js/stations.js` · `js/labels.js` | หมุดหน่วยงาน (ขนาดตามบุคลากร), สถานีรถไฟฟ้าและวงรัศมี, ชื่อกลางจอ |
| `js/ask.js` · `js/breadcrumb.js` · `js/navigation.js` | ปุ่ม Google, เส้นทาง, ไอคอนและวิธีใช้ |
| `js/massing.js` · `js/camera.js` · `js/venue-xray.js` · `js/building-join.js` · `js/building-units.js` · `js/terrain.js` · `js/maplibre-guard.js` · `js/map-style.js` · `js/mvt.js` · `js/geometry.js` | มวลอาคาร กล้อง มุมมองอาคาร ภูมิประเทศ (สืบทอดจาก Hotel 0.3.6 โดยไม่เปลี่ยน) |

สคริปต์: `scripts/export-sheet-tabs.js` + `scripts/join-compact-payload.py` + `scripts/decode-sheet-payload.py` (อ่านชีตทีละเซลล์) · `scripts/build-data.py` (ข้อมูล + การกระทบยอดกับ production) · `scripts/fetch-base.py` + `scripts/build-receipts.py` (ใบรับ) · `scripts/build-boundaries.py` · `scripts/adapt-building-units.py` · `scripts/build-pictogram-font.py` · `scripts/check-lds-parity.mjs` · `scripts/build-handoff.mjs` · `scripts/verify-live.mjs`

## งาน (ทั้งหมดเสร็จในรุ่นนี้)

T1 อ่านชีตวิจัยทีละเซลล์พร้อม hash รายแท็บ (05 แบบ compact, 06 พร้อมลิงก์) · T2 สร้างข้อมูลและกระทบยอด (หนึ่งหน่วยงานต่อแถว, หมวด, ประเภท, กติกาบุคลากร, เขต/อำเภอ, รถไฟฟ้า, เหตุการณ์, ต้นสังกัด) · T3 ใบรับ production, ดัชนีเขต และหน่วยอาคาร · T4 โมเดล ตัวกรอง และการโหลดหมวดเมื่อเลือก · T5 ข้อค้นพบแรกและ choropleth · T6 แผง บริการรัฐที่ใกล้ที่สุด หน่วยงานรอบ ๆ และเหตุการณ์ · T7 กราฟและตาราง · T8 หมุด ชื่อ ไอคอน คำอธิบายแผนที่ · T9 เอกสาร handoff แท็ก release เผยแพร่ และแถวในทะเบียน

## Acceptance criteria

A1 decode ครบ ไม่หลุด · A2 ยอดตรง production ทุกช่อง · A3 ไฟล์หมวดตรง hash และรวมเป็นทุกจุด · A4 จุดซ้ำ · A5 กติกาบุคลากร ไม่ทราบ ≠ 0 · A6 ไม่เผยแพร่ข้อมูลติดต่อ ลิงก์แผนที่ หรือลิงก์ส่วนตัว · A7 ขอบเขต · A8 หมวดที่โหลดเมื่อเลือก · A9 ข้อค้นพบแรก · A10 โมเดลเขต (EVID-05) · A11 บรรทัดที่มา ไม่มีคำเตือน · A12 บริการรัฐที่ใกล้ที่สุด · A13 เหตุการณ์ย้ายและเปิดใหม่ · A14 ปุ่ม Google · A15 กราฟ · A16 สัญลักษณ์และชื่อ · A17 release · A18 live — รายละเอียดใน `implementation-plan.json`

## Backlog

B1 สำนักงานเขต กทม. และศาลในกรุงเทพฯ แบบระบุประเภทใน production · B2 ที่ตั้งใหม่ของ 79 เหตุการณ์ที่ยังไม่มีแถวใน production · B3 บุคลากรของสถานีตำรวจและที่ว่าการอำเภอจากแหล่งสาธารณะ · B4 ประเมิน CityMETER Building V4 ทุก อปท. ที่มีหน่วยงานรัฐ · B5 จำนวนผู้มาติดต่อ (เมื่อมีแหล่งเผยแพร่)
