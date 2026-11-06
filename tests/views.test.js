import test from 'node:test';
import assert from 'node:assert/strict';
import {load, loadAll} from './helpers.js';
import {buildOverview, buildAreaProfile, buildOfficeDetail, buildBuildingProfile, buildTypeProfile, buildStationProfile, stationsOf, nearbyOf, nearestServicesOf, servicePresence, listOrder, unplacedOf, distanceM, NEARBY_RADIUS_M, SERVICES} from '../js/profile-model.js';
import {renderOverview, renderArea, renderBuilding, renderOffice, renderStation, renderTypeCard, renderFilterChips, provenance, pct, meters, staffText} from '../js/panel.js';
import {summarizeAreaInsight, filterAreaRows} from '../js/area-insight.js';
import {summarize, productionLink, filterRows, unitFor, hasPoint, stationLink, typeParam} from '../js/model.js';
import {buildChartModel, areaMatrix, typeRanking} from '../js/chart-model.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText, productionHref} from '../js/breadcrumb.js';
import {CUES, CUE_PATHS, GROUP_SERIES, cueMarkup, seriesOf} from '../js/cues.js';
import {contextActions} from '../js/ask.js';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const ctxFor = (data, index, {metric = 'count', group = '', type = null, filtered = false} = {}) => ({meta: data.meta, unit: unitFor({metric, groups: data.groups, group, type}), index, groups: data.groups, filtered});
/** เทศบาลนครหาดใหญ่: a city municipality with recorded personnel, outside Bangkok (every service slot applies). */
const HATYAI = '280dc7ddb7';
/** สำนักงานปลัดกระทรวงการท่องเที่ยวและกีฬา: a head office in Bangkok that moved (06), agency-wide personnel kept apart. */
const MOTS = 'e129d81ac9';
/** A municipality office whose personnel production counts at the organisation's other office. */
const SHARED = '790028a561';
const detail = (data, index, r, scopeRows = data.rows) => buildOfficeDetail(r, {scopeRows, allRows: data.rows, index, groups: data.groups});

/**
 * Every panel as the page draws it: scope 'all' = the default (every production point, every group loaded), scope
 * 'offices' = the government offices only (the หมวด filter “หน่วยงานรัฐทุกหมวด”, with only offices.json loaded).
 */
function views(metric = 'count', scope = 'all') {
  const {data, index} = scope === 'all' ? loadAll() : load();
  const group = scope === 'all' ? '' : 'offices';
  const rows = filterRows(data.rows, {group}), ctx = ctxFor(data, index, {metric, group});
  const insight = summarizeAreaInsight(rows, index, {metric});
  const station = data.stations.find(s => s.id === 'RAILCAT:MRT_PINK:PK12');
  const police = filterRows(rows, {type: '1070'}), t1070 = data.types.find(t => t.id === '1070');
  return {
    overview: renderOverview({insight, summary: summarize(filterAreaRows(rows, new Set(insight.areaIds))), overview: buildOverview(rows, index, {groups: data.groups, metric, events: data.events}),
      focusMode: 'auto', provinces: [], unknownProvince: 0, province: '', group, groups: data.groups, stations: stationsOf(rows, metric), ctx}),
    area: renderArea(buildAreaProfile(rows, '3001', index, data.groups, {metric, events: data.events}), () => '#000', ctx),
    office: renderOffice(detail(data, index, rows.find(r => r.id === HATYAI), rows), ctx),
    headOffice: renderOffice(detail(data, index, rows.find(r => r.id === MOTS), rows), ctx),
    station: renderStation(buildStationProfile(station, {scopeRows: rows, allRows: data.rows, groups: data.groups, metric, province: 'BKK'}), ctx),
    building: renderBuilding(buildBuildingProfile({key: 'osm:1', kind: 'osm', rows: rows.filter(r => r.area === '3001').slice(0, 3), height: 24}, index, data.groups), ctx),
    type: renderOverview({insight: summarizeAreaInsight(police, index, {metric}), summary: summarize(police), overview: buildOverview(police, index, {groups: data.groups, metric}),
      focusMode: 'auto', province: '', group, groups: data.groups, ctx: ctxFor(data, index, {metric, group, type: t1070}),
      typeCard: renderTypeCard(buildTypeProfile('1070', {allRows: data.rows, scopeRows: police, index, data, groups: data.groups, metric}), ctxFor(data, index, {metric, group, type: t1070}))}),
  };
}

test('every panel view ends with one provenance line — dataset · source · date · boundary, then the method — and carries no caveat on screen', () => {
  for (const [scope, metric] of [['all', 'count'], ['all', 'staff'], ['offices', 'count'], ['offices', 'staff']]) {
    for (const [name, html] of Object.entries(views(metric, scope))) {
      const t = text(html);
      for (const k of ['dataset', 'source', 'date', 'boundary']) assert.equal((html.match(new RegExp(`data-prov="${k}"`, 'g')) || []).length, 1, `${name}: ${k}`);
      assert.ok(t.includes('ชุดข้อมูล CityMETER Government Office'), `${name}: dataset`);
      assert.ok(/แหล่ง\s*จาก CityMETER Government Officer/.test(t), `${name}: source`);
      assert.ok(t.includes('ตรวจ 6 พ.ย. 2569'), `${name}: date`);
      assert.ok(/ขอบเขต \S/.test(t), `${name}: boundary`);
      assert.ok(html.includes('<span class="prov-part prov-method"><a href="DATA_METHOD.md"'), `${name}: the method link`);
      assert.equal((html.match(/class="hint panel-foot provenance"/g) || []).length, 1, `${name}: exactly one provenance line`);
      // The Hotel rule of 2026-11-01: “ไม่มี caveats เลย” — exactness comes from names, numerators and denominators, and
      // the provenance line.
      const caveat = /ไม่ใช่|ยังไม่ได้ตรวจ|อาจเป็น|ไม่ได้แปลว่า|ยืนยันแล้ว|ค่าประมาณ|นับในยอดรวม|โปรดตรวจสอบ/;
      assert.ok(!caveat.test(t), `${name}: no caveat on screen — ${(t.match(new RegExp(`.{0,40}(${caveat.source}).{0,40}`)) || [''])[0]}`);
      assert.ok(!/ตั้งอยู่ใน|ส่วนแบ่งตลาด|รายได้|ความหนาแน่น|เขตพื้นที่บริการ|เวลาเดินทาง|เดินถึงใน|อันดับหน่วยงาน|ประสิทธิภาพ/.test(t), `${name}: no located-inside, share, revenue, density, catchment, travel-time or performance claim`);
      assert.ok(!/ 0 คน/.test(t), `${name}: unknown personnel never reads 0 คน`);
    }
  }
});

test('first screen (every point): the Aha with numerator and denominator, the outside finding, every group, the recent moves and openings', () => {
  const o = text(views().overview);
  assert.ok(o.includes('17% ของหน่วยงานและสถานที่ในนครราชสีมา อยู่ใน 3 อำเภอนี้'), o.slice(0, 300));
  assert.ok(o.includes('เมืองนครราชสีมา · ปักธงชัย · ด่านขุนทด') && o.includes('3,466 จาก 20,003 แห่ง'), 'the share of the province\'s whole total');
  assert.ok(!o.includes('ใกล้รถไฟฟ้า ≤ 500 ม.'), 'no rail comparison where nothing is near an operating station');
  assert.ok(o.includes('อันดับ 1 นอกนครราชสีมา: อำเภอเมืองเชียงราย เชียงราย 2,054 แห่ง · มากกว่าทุกอำเภอของนครราชสีมา'));
  assert.ok(o.includes('3,466 แห่ง ในโฟกัส 6,732 บุคลากร ในโฟกัส'), 'personnel of the government offices among them');
  assert.ok(o.includes('หมวด แห่ง ชุมชนและสมาคม 232,181 ศาสนาและโบราณสถาน 111,421 การศึกษาและแหล่งเรียนรู้ 75,835 ปกครองและท้องถิ่น 9,667 ตำรวจ 6,548'), 'every group of the dataset in its bars');
  assert.ok(o.includes('ประเภทที่มีหน่วยงานและสถานที่มากที่สุด') && o.includes('ที่ทำการผู้ใหญ่บ้าน 80,764'));
  assert.ok(o.includes('ย้ายและเปิดใหม่ล่าสุด 97 รายการ') && o.includes('เปิดอาคารสำนักงานใหม่ สำนักตรวจเงินแผ่นดินจังหวัดตราด 20 ต.ค. 2569'));
  assert.ok(!o.includes('หมวดอื่นในชุดข้อมูลเดียวกัน'), 'the default scope lists every group in its bars already');
  const s = text(views('staff').overview);
  assert.ok(s.includes('66% ของบุคลากรที่บันทึกในชลบุรี อยู่ใน 3 อำเภอนี้') && s.includes('14,314 จาก 21,533 คน'));
  assert.ok(s.includes('อันดับ 1 นอกชลบุรี: อำเภอเมืองลพบุรี ลพบุรี 9,101 คน · มากกว่าทุกอำเภอของชลบุรี'));
  assert.ok(s.includes('ตำรวจ — ยังไม่ระบุหมวด —'), 'groups whose offices record no personnel read “—”, never 0');
  assert.ok(!/ชุมชนและสมาคม —|ศาสนาและโบราณสถาน —/.test(s), 'places are no personnel group: never “—” (unknown)');
});

test('government offices (one หมวด filter): their own Aha, groups, stations and the way back to every group', () => {
  const o = text(views('count', 'offices').overview);
  assert.ok(o.includes('22% ของหน่วยงานรัฐในนครราชสีมา อยู่ใน 3 อำเภอนี้'), o.slice(0, 300));
  assert.ok(o.includes('เมืองนครราชสีมา · ปักธงชัย · สีคิ้ว') && o.includes('165 จาก 744 แห่ง'));
  assert.ok(o.includes('อันดับ 1 นอกนครราชสีมา: อำเภอพุนพิน สุราษฎร์ธานี 92 แห่ง · มากกว่าทุกอำเภอของนครราชสีมา'));
  assert.ok(o.includes('หมวดหน่วยงาน แห่ง ปกครองและท้องถิ่น 9,667 ตำรวจ 6,548'));
  assert.ok(o.includes('สถานีที่มีหน่วยงานรอบ ๆ มากที่สุด') && o.includes('ศูนย์ราชการเฉลิมพระเกียรติ (ชมพู) 34 แห่ง · ไม่ทราบจำนวนบุคลากร'));
  assert.ok(o.includes('หมวดอื่นในชุดข้อมูลเดียวกัน ทั้งชุด 440,005 แห่ง') && o.includes('ทุกหมวด 440,005') && o.includes('หน่วยงานรัฐ 20,568') && o.includes('ศาสนาและโบราณสถาน 111,421'), 'the way back to every group');
});

test('district, station, type, building and office panels: ranks, shares, straight-line context and the nearest services', () => {
  const v = views('count', 'offices');
  const a = text(v.area);
  assert.ok(a.includes('อำเภอเมืองนครราชสีมา') && a.includes('อันดับ 10 จาก 925 ทั่วประเทศ · 1 จาก 32 ในนครราชสีมา'), a.slice(0, 240));
  assert.ok(a.includes('10% ของนครราชสีมา 74 จาก 744 แห่งของนครราชสีมา'), 'the share tile carries numerator and denominator');
  assert.ok(a.includes('ย้ายและเปิดใหม่ในอำเภอเมืองนครราชสีมา 2 รายการ') && a.includes('ย้ายที่ตั้ง สถานีตำรวจภูธรโพธิ์กลาง 14 ก.พ. 2567'));
  assert.ok(a.includes('ดูทั้งหมด 74 แห่ง'));
  // Every point (the default): the same district with its places.
  const all = views();
  const aa = text(all.area);
  assert.ok(aa.includes('อันดับ 28 จาก 925 ทั่วประเทศ · 1 จาก 32 ในนครราชสีมา') && aa.includes('6% ของนครราชสีมา 1,185 จาก 20,003 แห่งของนครราชสีมา'), aa.slice(0, 300));
  assert.ok(aa.includes('หมวด แห่ง ชุมชนและสมาคม 675') && aa.includes('1,185 แห่ง 5,031 บุคลากร'));
  assert.ok(text(all.office).includes('ทุกหมวดรอบ 2 กม. 231 แห่ง ชุมชน 127 การศึกษา 59 ศาสนา 37 ตำรวจ 5 ดับเพลิง 3'));
  assert.ok(text(all.building).includes('หน่วยงานและสถานที่ในอาคารนี้ 3 แห่ง'));
  const s = text(v.station);
  assert.ok(s.includes('สถานีศูนย์ราชการเฉลิมพระเกียรติ') && s.includes('34 แห่ง') && s.includes('500 ม. รอบสถานี'));
  assert.ok(s.includes('กรมคุ้มครองสิทธิและเสรีภาพ ไม่ระบุประเภท · ไม่ทราบจำนวนบุคลากร · เขตหลักสี่ · 350 ม.'), 'a list row: type, personnel, district, straight-line distance');
  assert.ok(s.includes('บริการรัฐที่ใกล้สถานีที่สุด ระยะตรง สถานีตำรวจ · 1.1 กม. สถานีตำรวจนครบาลทุ่งสองห้อง'));
  assert.ok(!s.includes('ที่ว่าการอำเภอ ·') && !s.includes('ศาล ·'), 'Bangkok: production types no district office or court there — no slot');
  assert.ok(v.station.includes('pic-distance'), 'the straight-line radius carries the distance pictogram');
  const o = text(v.office);
  assert.ok(o.includes('เทศบาลนครหาดใหญ่') && o.includes('ทน. 2,500 คน อำเภอหาดใหญ่ · สงขลา'));
  assert.ok(o.includes('บริการรัฐที่ใกล้ที่สุด ระยะตรง ที่ว่าการอำเภอ · 2.3 กม. ที่ว่าการอำเภอหาดใหญ่ สำนักงานท้องถิ่น · 2.9 กม. เทศบาลเมืองคอหงส์ สถานีตำรวจ · 1.4 กม.'));
  assert.ok(o.includes('หน่วยงานรอบ ๆ 0 แห่ง ปกครองและท้องถิ่น ≤ 2 กม.') && o.includes('ทุกหมวดรอบ 2 กม. 8 แห่ง'));
  const h = text(v.headOffice);
  assert.ok(h.includes('ย้ายที่ตั้ง · 2 มี.ค. 2569') && h.includes('จาก อาคารถนนราชดำเนินนอก กรุงเทพมหานคร'), 'its own move first, dated, with the old place');
  assert.ok(h.includes('ทั้งหน่วยงาน 390 คน'), 'agency-wide personnel stated as such, never added to a district');
  assert.match(v.headOffice, /href="https:\/\/secretary\.mots\.go\.th[^"]*"[^>]*>ประกาศ \(secretary\.mots\.go\.th\)</);
  assert.ok(h.indexOf('ย้ายที่ตั้ง') < h.indexOf('ทั้งหน่วยงาน'), 'the move comes before the figures');
  const t = text(v.type);
  assert.ok(t.includes('ประเภท · ตำรวจ สถานีตำรวจ 1,843 แห่ง 77 จังหวัด 1% ใกล้รถไฟฟ้า 23 จาก 1,843 แห่ง'), t.slice(0, 200));
  assert.ok(t.includes('15% ของสถานีตำรวจในกรุงเทพมหานคร อยู่ใน 3 เขตนี้'));
  assert.ok(t.includes('ใกล้รถไฟฟ้า ≤ 500 ม. 3 เขตนี้ 8% 1 จาก 13 แห่ง') && t.includes('เขตอื่น 27% 20 จาก 73 แห่ง'), 'both bases in the accessible text');
  const b = text(v.building);
  assert.ok(b.includes('สูงราว 24 ม.') && b.includes('หน่วยงานในอาคารนี้ 3 แห่ง') && b.includes('หมุดในขอบอาคาร OpenStreetMap'));
  assert.deepEqual([meters(84), meters(1291), meters(2000)], ['80 ม.', '1.3 กม.', '2 กม.']);
});

test('nearest services: one per kind, straight line ≤ 30 km, nearest first, never the office itself; only where production types the service', () => {
  const {data} = load();
  const hy = data.rows.find(r => r.id === HATYAI);
  const list = nearestServicesOf({lat: hy.latitude, lon: hy.longitude}, data.rows, {exclude: hy, province: hy.province});
  assert.deepEqual(list.map(s => s.service.id), SERVICES.map(s => s.id));
  for (const s of list) {
    assert.ok(s.row && s.row !== hy && s.service.types.includes(s.row.type.id) && s.m <= 30000, s.service.id);
    // Nothing of that kind is nearer (straight line between the published points).
    for (const r of data.rows) {
      if (r === hy || !hasPoint(r) || !s.service.types.includes(r.type.id)) continue;
      assert.ok(distanceM(hy.latitude, hy.longitude, r.latitude, r.longitude) >= s.m - 1e-6, `${s.service.id}: ${r.id} is nearer`);
    }
  }
  const presence = servicePresence(data.rows);
  assert.deepEqual(['district', 'local', 'court'].map(id => presence.get(id).has('BKK')), [false, false, false], 'production types none of them in Bangkok');
  assert.ok(presence.get('police').has('BKK') && presence.get('fire').has('BKK'));
  const mots = data.rows.find(r => r.id === MOTS);
  assert.deepEqual(nearestServicesOf({lat: mots.latitude, lon: mots.longitude}, data.rows, {province: 'BKK'}).map(s => s.service.id), ['police', 'fire']);
  assert.equal(nearestServicesOf(null, data.rows).length, 0);
});

test('nearby offices: same group, straight line ≤ 2 km, nearest first, never itself; everything round it beside', () => {
  const {data} = load();
  for (const id of [HATYAI, MOTS]) {
    const h = data.rows.find(r => r.id === id);
    const c = nearbyOf(h, data.rows);
    assert.equal(c.radius, NEARBY_RADIUS_M);
    assert.ok(c.rows.every(x => x.row !== h && x.row.group === h.group && x.m <= 2000));
    for (let i = 1; i < c.rows.length; i++) assert.ok(c.rows[i - 1].m <= c.rows[i].m);
    assert.ok(c.around.count >= c.matches);
    assert.equal(nearbyOf({...h, latitude: null, longitude: null}, data.rows), null);
  }
});

test('personnel counted once per local government: the other office names where it is counted', () => {
  const {data, index} = load();
  const r = data.rows.find(x => x.id === SHARED);
  const t = text(renderOffice(detail(data, index, r), ctxFor(data, index)));
  assert.ok(t.includes('278 คน · นับที่อีกจุด'));
  assert.equal(staffText(r), 'บุคลากรนับรวมกับอีกจุด');
  assert.equal(staffText({office: false, staff: null}), '', 'a place of the other groups has no personnel line');
  assert.equal(staffText({office: true, staff: null}), 'ไม่ทราบจำนวนบุคลากร');
});

test('missing stays missing: unknown personnel, an empty district — each says so, never 0 or a guessed place', () => {
  const {data, index} = load();
  const ctx = ctxFor(data, index);
  const unknown = data.rows.find(r => r.office && !r.staff && !r.staffShared && !r.agencyStaff);
  assert.ok(text(renderOffice(detail(data, index, unknown), ctx)).includes('ไม่ทราบ'));
  const u = unplacedOf(data.rows);
  assert.deepEqual([u.noArea, u.noProvince], [0, 0], 'every office sits in the production district of its point');
  const empty = buildAreaProfile([], '1039', index, data.groups);
  assert.equal(empty.coverageState, 'measured_zero');
  assert.ok(text(renderArea(empty, () => '#000', ctx)).includes('ไม่พบหน่วยงานและสถานที่ในเขตวัฒนา'), 'every group (the default)');
  assert.ok(text(renderArea(empty, () => '#000', ctxFor(data, index, {group: 'offices'}))).includes('ไม่พบหน่วยงานในเขตวัฒนา'), 'the government offices');
  // A district whose offices all have unknown personnel reads “—” with its reason in the title, never 0 people.
  const html = renderArea(buildAreaProfile([{...unknown, area: '1039', province: 'BKK', staff: null}], '1039', index, data.groups), () => '#000', ctx);
  assert.match(html, /title="ไม่ทราบจำนวนบุคลากร"/);
});

test('places of education, religion and community read as places: no personnel tile or line, their own subject', () => {
  const {data, index} = loadAll();
  const rel = filterRows(data.rows, {group: 'religion'});
  const insight = summarizeAreaInsight(rel, index);
  const ctx = {meta: data.meta, unit: unitFor({groups: data.groups, group: 'religion'}), index, groups: data.groups};
  const t = text(renderOverview({insight, summary: summarize(filterAreaRows(rel, new Set(insight.areaIds))), overview: buildOverview(rel, index, {groups: data.groups}),
    focusMode: 'auto', provinces: [], group: 'religion', groups: data.groups, stations: stationsOf(rel), ctx}));
  assert.ok(t.includes('22% ของศาสนสถานและโบราณสถานในเชียงใหม่ อยู่ใน 3 อำเภอนี้') && t.includes('1,035 จาก 4,711 แห่ง'));
  assert.ok(t.includes('เขต/อำเภอที่มีสถานที่มากที่สุด') && t.includes('ประเภทที่มีสถานที่มากที่สุด') && t.includes('วัด 46,196'));
  assert.ok(t.includes('หมวดอื่นในชุดข้อมูลเดียวกัน ทั้งชุด 440,005 แห่ง'), 'the way back to every group');
  assert.ok(!t.includes('บุคลากร') && !t.includes('ไม่ทราบจำนวน'), 'personnel does not apply to a temple');
  assert.ok(!t.includes('ย้ายและเปิดใหม่'), 'the office moves stay with the offices');
  assert.equal(unitFor({groups: data.groups, group: ''}).aha, 'หน่วยงานและสถานที่', 'every group: offices and places');
  assert.equal(unitFor({groups: data.groups, group: 'all'}).aha, 'หน่วยงานและสถานที่', 'the 0.1.0 value of every group');
  assert.equal(unitFor({groups: data.groups, group: 'offices'}).aha, 'หน่วยงานรัฐ');
  assert.equal(unitFor({groups: data.groups, group: 'police'}).aha, 'หน่วยงานตำรวจ');
  assert.equal(unitFor({groups: data.groups, metric: 'staff'}).aha, 'บุคลากรที่บันทึก');
  const wat = data.types.find(t => t.id === '3030'), pol = data.types.find(t => t.id === '1070');
  assert.deepEqual([unitFor({groups: data.groups, type: wat}).place, unitFor({groups: data.groups, type: pol}).place], ['สถานที่', 'หน่วยงาน'], 'a chosen type speaks of its own group');
  assert.deepEqual([unitFor({groups: data.groups}).personnel, unitFor({groups: data.groups, group: 'religion'}).personnel], [true, false]);
});

test('charts: districts by the measure, district × group matrix with equal cells, types by the measure', () => {
  const {data, index} = load();
  const m = buildChartModel(data.rows, index, data.groups);
  assert.equal(m.areas.length, 20);
  assert.equal(m.totalAreas, 925);
  assert.equal(m.unplacedValue, 0);
  assert.deepEqual(m.areas.slice(0, 3).map(a => [a.name, a.value]), [['พุนพิน', 92], ['เมืองเชียงใหม่', 89], ['เมืองนครสวรรค์', 85]]);
  for (let i = 1; i < m.areas.length; i++) assert.ok(m.areas[i - 1].value >= m.areas[i].value);
  const mx = areaMatrix(m);
  assert.equal(mx.groups.length, 6, 'only the groups the selection holds are columns');
  assert.equal(mx.cells.length, 12 * 6);
  for (const a of mx.areas) assert.equal(mx.cells.filter(c => c.areaId === a.id).reduce((s, c) => s + c.value, 0), a.value, 'cells add up to the district');
  const staff = buildChartModel(data.rows, index, data.groups, {metric: 'staff'});
  assert.deepEqual([staff.areas[0].name, staff.areas[0].value], ['เมืองลพบุรี', 9101]);
  const sm = areaMatrix(staff);
  assert.ok(sm.cells.some(c => c.unknown && c.groupId === 'police' && c.count > 0 && c.value === 0), 'police record no personnel: unknown cells, never a measured 0');
  const tr = typeRanking(data.rows);
  assert.equal(tr.total, 22);
  assert.deepEqual(tr.types.slice(0, 3).map(x => [x.type.short, x.count]), [['อบต.', 5776], ['จุดบริการตำรวจ', 4626], ['ทต.', 2494]]);
  // Every point: every group a column under the count; under personnel only the government-office groups.
  const all = loadAll().data;
  const am = buildChartModel(all.rows, index, all.groups);
  assert.deepEqual([am.totalRows, areaMatrix(am).groups.length], [440005, 9]);
  assert.deepEqual(am.areas.slice(0, 2).map(a => [a.name, a.value]), [['เมืองเชียงราย', 2054], ['เมืองขอนแก่น', 1871]]);
  assert.equal(areaMatrix(buildChartModel(all.rows, index, all.groups, {metric: 'staff'})).groups.length, 6, 'personnel does not apply to places');
  assert.equal(typeRanking(all.rows).total, 61);
});

test('breadcrumb follows production: ประเทศไทย › จังหวัด › เขต/อำเภอ with /D/ deep links and the governmentOfficer dataset', () => {
  const {index} = load();
  const area = index.byId.get('1039');
  const crumbs = buildBreadcrumb({province: 'BKK', area});
  assert.equal(breadcrumbText(crumbs), 'ประเทศไทย › กรุงเทพมหานคร › เขตวัฒนา');
  assert.equal(crumbs.at(-1).current, true);
  assert.equal(crumbs[2].href, 'https://landometer.com/v3/citymeter/BKK/D/1039?d=governmentOfficer');
  assert.equal(productionHref(crumbs), 'https://landometer.com/v3/citymeter/BKK/D/1039?d=governmentOfficer');
  assert.ok(renderBreadcrumb(crumbs).includes('aria-current="location"'));
  assert.equal(breadcrumbText(buildBreadcrumb({area: index.byId.get('3001')})), 'ประเทศไทย › นครราชสีมา › อำเภอเมืองนครราชสีมา');
  assert.equal(productionLink(), 'https://landometer.com/v3/citymeter?d=governmentOfficer');
  assert.equal(productionLink({province: 'NMA'}), 'https://landometer.com/v3/citymeter/NMA?d=governmentOfficer');
  assert.equal(stationLink({id: 'RAILCAT:BTS_SUKHUMVIT:E4'}), 'https://montri-th.github.io/transit/?station=RAILCAT%3ABTS_SUKHUMVIT%3AE4');
});

test('groups bind to LDS series by stable id with the series shape cue; no star (it would read as a rating)', () => {
  const {data} = load();
  assert.deepEqual(CUES, ['circle', 'square', 'triangle', 'diamond', 'cross', 'star', 'hexagon', 'ring', 'dash', 'plus']);
  assert.deepEqual(GROUP_SERIES, {admin: 1, police: 2, fire: 3, justice: 4, military: 5, unclassified: 9, education: 7, religion: 8, community: 10});
  assert.ok(!Object.values(GROUP_SERIES).includes(6));
  assert.equal(new Set(Object.values(GROUP_SERIES)).size, 9, 'one series per group');
  for (const g of data.groups) assert.equal(g.series, seriesOf(g.id));
  for (const name of CUES) assert.ok(CUE_PATHS[name].startsWith('M'));
  assert.match(cueMarkup(2), /class="cue-shape category-2".*data-cue="square".*aria-hidden="true"/);
});

test('lists put the type’s tier first, then the most recorded personnel (unknown last), then name — deterministic', () => {
  const {data} = load();
  const rows = data.rows.filter(r => r.area === '3001').sort(listOrder);
  assert.deepEqual([...rows].reverse().sort(listOrder).map(r => r.id), rows.map(r => r.id), 'deterministic');
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    assert.ok(a.type.tier < b.type.tier || (a.type.tier === b.type.tier && (a.staff || 0) >= (b.staff || 0)));
  }
});

test('Google actions: public names and points only, https, the question of the view; Street View only with a point', () => {
  const {data} = load();
  const h = data.rows.find(r => r.id === HATYAI);
  const acts = contextActions({kind: 'office', row: h, area: {place: 'อำเภอหาดใหญ่', province: 'สงขลา'}, point: {lat: h.latitude, lon: h.longitude, role: 'point'}});
  assert.deepEqual(acts.map(a => a.id), ['ai', 'maps', 'streetview']);
  assert.ok(acts.every(a => a.href.startsWith('https://www.google.com/')));
  assert.ok(decodeURIComponent(acts[0].href).includes('เทศบาลนครหาดใหญ่ (อำเภอหาดใหญ่ สงขลา) เปิดทำการวันและเวลาไหน'));
  // Hotel 0.3.3 (owner 2026-11-02 “ทำให้มันตอบทันเลยได้มั้ย”): a plain Google Search, answered at the top by Google's AI
  // Overview — a link straight into AI Mode (udm=50) stops at Google's “Continue with this search?” from another site.
  const views = [acts, contextActions({kind: 'area', area: {place: 'เขตวัฒนา', province: 'กรุงเทพมหานคร'}}),
    contextActions({kind: 'station', station: {name: 'อโศก', lines: ['สุขุมวิท']}}), contextActions({kind: 'type', type: {th: 'สถานีตำรวจ'}}),
    contextActions({kind: 'overview', province: 'นครราชสีมา'}), contextActions({kind: 'building', rows: [h], area: {place: 'อำเภอหาดใหญ่', province: 'สงขลา'}})];
  for (const list of views) {
    const ai = list.find(a => a.id === 'ai');
    assert.ok(ai, 'every view asks Google AI');
    assert.match(ai.href, /^https:\/\/www\.google\.com\/search\?q=[^&]+$/, 'a plain search, the question only');
    assert.ok(!/udm=/.test(ai.href), 'never straight into AI Mode');
  }
  assert.ok(!acts.some(a => a.href.includes(h.id)), 'no internal id leaves the page');
  assert.deepEqual(contextActions({kind: 'area', area: {place: 'เขตวัฒนา', province: 'กรุงเทพมหานคร'}}).map(a => a.id), ['ai', 'maps']);
  const st = contextActions({kind: 'station', station: {name: 'อโศก', lines: ['สุขุมวิท']}, point: {lat: 13.737, lon: 100.56, role: 'station'}});
  assert.equal(st.at(-1).label, 'Street View ใกล้สถานี');
});

test('filter chips escape user text, name the filters and offer one clear-all', () => {
  const html = renderFilterChips({search: '<b>อำเภอ</b>', group: 'police', type: '1070', province: 'BKK'},
    {group: {police: 'ตำรวจ'}, type: {1070: 'สถานีตำรวจ'}, province: {BKK: 'กรุงเทพมหานคร'}});
  assert.ok(!html.includes('<b>'));
  for (const w of ['ตำรวจ', 'สถานีตำรวจ', 'กรุงเทพมหานคร']) assert.ok(text(html).includes(w), w);
  assert.equal((html.match(/data-id="all"/g) || []).length, 1);
  assert.equal(typeParam(''), 'none');
});

test('shares print whole percentages; a non-zero part never prints as 0%', () => {
  assert.equal(pct(44897, 130608), '34%');
  assert.equal(pct(1, 352), '<1%');
  assert.equal(pct(0, 10), '0%');
  assert.equal(pct(3, 0), '—');
  assert.ok(text(provenance({meta: {checkedOn: '2026-11-06', context: {rail: {asOf: '2026-10-31'}}}, unit: unitFor()}, 'x', {rail: true})).includes('CityMETER Transit 31 ต.ค. 2569'));
});
