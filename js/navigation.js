/**
 * This demo's navigation on the shared header code: the titles of its controls and its pictogram subset. The
 * nav-7 glyphs and the help dialog are js/shell/navigation.js, the dataset picker js/shell/header.js
 * (citymeter-shell: edit those in every repository at once, js/shell/manifest.json).
 */
import {installNavigation, NAV_GLYPHS, NAV_ICON_CONTRACT} from './shell/navigation.js';
import {installHeader} from './shell/header.js';

export {NAV_GLYPHS, NAV_ICON_CONTRACT};

/**
 * Metric-tile pictograms (test exception approved by the owner 2026-10-22 for the
 * Luxury Brands demo; this demo builds its own subset from the same source font with
 * scripts/build-pictogram-font.py; to be registered in LDS if it proves itself). Same family and axes as nav-7, a separate subset so the
 * approved nav-7 bytes stay unchanged. Glyph → meaning in Government Office:
 * office (account_balance) = หน่วยงาน (offices, แห่ง) · staff (badge) = บุคลากรที่บันทึก · type (label) = ประเภท ·
 * segment (category) = หมวดหน่วยงาน · moved (move_location) = ย้ายที่ตั้ง · opened (domain_add) = เปิดอาคาร/สำนักงานใหม่ ·
 * service (support_agent) = จุดบริการ · school = the CityMETER School link · area (map) = เขต/อำเภอ · province
 * (location_city) = จังหวัด · rail (train) = สถานีราง · compare (compare_arrows) = หน่วยงานรอบ ๆ / ใกล้ที่สุด ·
 * building (apartment) = อาคาร · sea (waves) · elevation (landscape) · relief (height) · forest = the ground round an
 * office. No star glyph: it would read as a rating.
 */
export const PICTOGRAM_CONTRACT = Object.freeze({
  family: 'LDS Material Symbols Rounded Pictogram',
  file: 'assets/icons/material-pictogram-300.woff2', bytes: 3764,
  sha256: '68abef6704de6bceaec0ac3856e78b7c0243a774c6f787ba4f5b8f4f4ec443da',
  manifest: 'assets/icons/material-pictogram-300.json',
  axes: Object.freeze({FILL: 0, wght: 300, GRAD: 0, opsz: 24}),
  glyphs: Object.freeze({area: '\uE55B', province: '\uE7F1', segment: '\uE72C', ai: '\uE65F', streetview: '\uE56E', maps: '\uE0C8', building: '\uEA40',
    office: '\uE84F', staff: '\uEA67', type: '\uE893', moved: '\uE741', opened: '\uEB62', service: '\uF0E2', school: '\uE80C',
    rail: '\uE570', compare: '\uE915',
    sea: '\uE176', elevation: '\uE564', relief: '\uEA16', forest: '\uEA99',
    rank: '\uF20C', date: '\uE878', distance: '\uE41C', construction: '\uEA3C', dataset: '\uF20E'}),
  status: 'test exception to LDS nav-7 (owner 2026-10-22; action and building glyphs 2026-10-29; terrain glyphs 2026-11-01; rank, date, distance, construction and dataset glyphs 2026-11-01 for short copy; government office glyphs 2026-11-06)',
  fallback: 'Text labels carry the meaning; pictograms stay hidden until the font has loaded.',
});
const TITLES = {
  'fit-map': 'ปรับแผนที่ให้เห็นพื้นที่ที่โฟกัสหรือพื้นที่ที่เลือก',
  'country-map': 'ดูทั้งประเทศรายจังหวัด',
  'toggle-3d': 'สลับ 3 มิติ / 2 มิติ',
  'toggle-neighborhoods': 'แสดงหรือซ่อนสีและขอบเขตเขต/อำเภอ',
  'mobile-panel': 'เปิดแผงข้อมูลและตัวกรอง',
  'open-help': 'เปิดวิธีใช้',
  'open-help-sheet': 'เปิดวิธีใช้',
  'toggle-insights': 'เปิดหรือย่อกราฟเปรียบเทียบพื้นที่',
  'open-table': 'เปิดตารางหน่วยงานตามตัวกรอง',
  'toggle-table': 'ปิดตารางและกลับไปแผนที่',
  'search': 'ค้นหาชื่อหน่วยงาน ต้นสังกัด เขต/อำเภอ หรือจังหวัด',
  'group': 'เลือกหมวด: ทุกหมวด (ค่าเริ่มต้น) หน่วยงานรัฐ หรือหมวดเดียว',
  'type': 'กรองตามประเภทหน่วยงาน',
  'province': 'กรองตามจังหวัด',
  'prev-page': 'ดูหน้าก่อนหน้าของตาราง',
  'next-page': 'ดูหน้าถัดไปของตาราง',
  'tab-areas': 'เปรียบเทียบหน่วยงานหรือบุคลากรของแต่ละเขต/อำเภอ',
  'tab-mix': 'ดูหมวดหน่วยงานในแต่ละเขต/อำเภอ',
  'tab-types': 'เปรียบเทียบหน่วยงานหรือบุคลากรของแต่ละประเภท',
};

if (typeof document !== 'undefined') {
  installNavigation({titles: TITLES, pictogramProbe: PICTOGRAM_CONTRACT.glyphs.office});
  installHeader();
}
