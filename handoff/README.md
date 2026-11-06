# CityMETER Government Office — handoff

สำหรับนักพัฒนาที่รับงานต่อ เอกสารในโฟลเดอร์นี้มีสองรูปแบบที่ต้องตรงกัน: Markdown สำหรับคนอ่าน และ JSON (schema `handoff.schema.json` 1.5.0) สำหรับเครื่องตรวจ (`tests/release.test.js` ตรวจ schema และเลขรุ่น)

| ไฟล์ | อ่านเพื่อ |
|---|---|
| `../PRODUCT_STATEMENT.md` · `product-statement.json` | ผู้ใช้ ปัญหา คู่เทียบ กลยุทธ์ claim boundary และสมมติฐานที่ต้องทดสอบ |
| `PRODUCT_BRIEF.md` · `product-brief.json` | สัญญาของหน้าจอ: ข้อค้นพบแรก มาตรวัด สี บริบท บริการที่ใกล้ที่สุด การย้าย แผง กราฟ กล้อง |
| `IMPLEMENTATION_PLAN.md` · `implementation-plan.json` | สถาปัตยกรรม โมดูล งาน acceptance criteria และ backlog |
| `VERIFICATION.md` | ผลตรวจของรุ่นนี้: tests, render, live attestation, live walk |
| `../DATA_METHOD.md` | ที่มาของทุกตัวเลข กติกาบุคลากร วิธีจับคู่เขต/อำเภอ บริบท และสิ่งที่ไม่เผยแพร่ |
| `../AGENTS.md` | ความต้องการของเจ้าของที่เป็นสัญญา — อ่านก่อนแก้ |

## ลำดับการทำงาน

1. แก้ข้อมูลในชีตวิจัยเท่านั้น (ไม่ commit ชีต เซลล์ของชีต หรือที่อยู่ของชีต)
2. อ่านแท็บด้วย `scripts/export-sheet-tabs.js` ในเบราว์เซอร์ที่เปิดชีตได้ — `05_PRODUCTION_ROWS` แบบ compact แล้ว `scripts/join-compact-payload.py` แท็บอื่นและลิงก์ของ 06 ด้วย `scripts/decode-sheet-payload.py`
3. `python3 -I scripts/build-data.py …` ตาม `DATA_METHOD.md` §13 (หยุดเองถ้ายอดไม่ตรง production)
4. `npm test` และ `npm run check:lds -- --lds <base> --li <profile>`
5. ขยับ `?v=YYYYMMDD-rN` ใน `index.html` + `package.json` + `design-intent.json` + handoff JSON
6. push `main` → GitHub Pages → `npm run handoff:manifest` → `npm run verify:live`
7. เดินเว็บจริงที่ 1440 และ 390 px ทั้ง light และ dark ก่อนบอกว่าเสร็จ
8. อัปเดตแถว `research.TH.government_office` ใน CityMETER Dataset Registry (คอลัมน์ demo และ Changes) ในชีตเดิม

## จุดที่ต้องระวัง

- บุคลากรที่ไม่ทราบ ≠ 0 คน · อปท. หลายจุดนับบุคลากรครั้งเดียว · บุคลากรทั้งหน่วยงานของสำนักงานใหญ่ไม่รวมเข้ายอดพื้นที่ · ระยะ = ระยะตรง · ไม่มีคำเตือนบนหน้าจอ ข้อจำกัดอยู่หลังลิงก์ “วิธีนับ” (DATA_METHOD.md)
- เขต/อำเภอของแถวมาจาก build (ตำบลใน overlay ของ production) ห้ามจับคู่ใหม่บนหน้าจอ · ประเภทเป็นรหัสของ production อย่าจัดใหม่จากชื่อ
- สถานที่การศึกษา ศาสนา และชุมชนโหลดเมื่อเลือก (`data/groups/`) ไฟล์ใหญ่ (8–18 MB) อย่าโหลดตอนเปิดหน้า
- บริการรัฐที่ใกล้ที่สุดแสดงเฉพาะบริการที่ production มีประเภทนั้นในจังหวัด (กรุงเทพฯ มีตำรวจและดับเพลิง)
- MapLibre ล็อกที่ 5.6.2 พร้อม `js/maplibre-guard.js` อย่าอัปเกรดโดยไม่ตรวจบั๊ก tile cover ซ้ำ
- ลำดับ layer มวลอาคาร x-ray สถานี และหมุด มีผลต่อมุมมองอาคาร อย่าสลับโดยไม่ทดสอบ
