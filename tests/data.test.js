import test from 'node:test';
import assert from 'node:assert/strict';
import {load, loadAll, readJSON, frameFiles, sha256} from './helpers.js';
import {hasPoint, filterRows, summarize, rowValue, unitWords, pinSizeOf, staffUnknown, groupsOfScope, scopeValue, typeIdOf, typeParam} from '../js/model.js';
import {distanceM} from '../js/profile-model.js';

test('offices.json decodes to the government offices of 05_PRODUCTION_ROWS, nothing dropped, keys unique', () => {
  const {raw, data} = load();
  assert.equal(data.dropped, 0);
  assert.equal(data.rows.length, raw.meta.counts.officeRows);
  assert.equal(data.rows.length, data.groups.filter(g => g.office).reduce((s, g) => s + g.rows, 0), 'the office groups are the default scope');
  assert.ok(data.rows.every(r => r.office), 'only government offices arrive with the page');
  assert.equal(new Set(data.rows.map(r => r.id)).size, data.rows.length);
  assert.ok(data.rows.every(r => /^[0-9a-f]{10}$/.test(r.id)), 'the key is the first 10 hex of the production UUID');
  for (const [tab, t] of Object.entries(raw.meta.tabs)) assert.match(t.sha256, /^[a-f0-9]{64}$/, `${tab}: its rows are bound by a hash`);
  assert.equal(raw.meta.tabs['05_PRODUCTION_ROWS'].rows, raw.meta.points, 'one production point per row of 05');
  assert.equal(raw.meta.registryId, 'research.TH.government_office');
  assert.equal(raw.meta.productDataset, 'governmentOfficer');
  assert.match(raw.meta.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(raw.meta.problems, [], 'the build reports no open problem');
});

test('production reconciliation: rows and Σ officer per district × category equal production government-agency info', () => {
  const {raw} = load();
  const r = raw.meta.reconciliation;
  assert.equal(r.mismatches, 0);
  assert.ok(r.cells > 9000, `${r.cells} district × category cells compared`);
  assert.equal(r.countryRows, raw.meta.points, 'the country total of production is every point of the sheet');
  assert.equal(r.receipt.status, 200);
  assert.match(r.receipt.sha256, /^[a-f0-9]{64}$/);
  assert.equal(r.receipt.url, 'https://landometer.com/api/v2/citymeter-v3/government-agency/info/lv0');
});

test('every group file is the bytes the dataset names; all groups together are every production point, one row each', () => {
  const {raw, data, files} = loadAll();
  for (const g of data.groups) {
    if (g.office) { assert.equal(g.file, ''); continue; }
    const f = files[g.id];
    assert.equal(f.bytes.length, g.bytes, `${g.id}: bytes`);
    assert.equal(sha256(f.bytes), g.sha256, `${g.id}: sha256`);
    assert.equal(f.appended, g.rows, `${g.id}: every row decodes into an existing district`);
    assert.equal(f.json.meta.group, g.id);
    assert.ok(g.loaded, `${g.id}: marked loaded`);
  }
  assert.equal(data.dropped, 0);
  assert.equal(data.rows.length, raw.meta.rows);
  assert.equal(raw.meta.rows, raw.meta.points, 'every production point is a row (release 0.2.0)');
  assert.equal(new Set(data.rows.map(r => r.id)).size, data.rows.length, 'keys unique across every group');
  for (const g of data.groups) assert.equal(filterRows(data.rows, {group: g.id}).length, g.rows, g.id);
  assert.equal(filterRows(data.rows, {group: ''}).length, data.rows.length, 'the default scope is every group');
  assert.equal(filterRows(data.rows, {group: 'all'}).length, data.rows.length, 'the 0.1.0 value of every group still reads as every group');
  assert.equal(filterRows(data.rows, {group: 'offices'}).length, raw.meta.counts.officeRows, 'the government offices, one filter');
  assert.deepEqual(groupsOfScope(data.groups, '').map(g => g.id), data.groups.map(g => g.id));
  assert.deepEqual(groupsOfScope(data.groups, 'offices').map(g => g.id), ['admin', 'police', 'fire', 'justice', 'military', 'unclassified']);
  assert.deepEqual([scopeValue('all', data.groups), scopeValue('', data.groups), scopeValue('offices', data.groups), scopeValue('religion', data.groups), scopeValue('nope', data.groups)],
    ['', '', 'offices', 'religion', '']);
});

test('one row per production point: repeated points of one office stay rows, their personnel is counted once', () => {
  const {raw, data} = loadAll();
  assert.equal(raw.meta.repeats.rows, raw.meta.points);
  assert.match(raw.meta.repeats.rule, /same type and same name/);
  assert.match(raw.meta.repeats.rule, /every point stays a row/);
  assert.equal(raw.meta.repeats.repeatPoints, raw.meta.counts.repeatPoints);
  assert.ok(data.rows.every(r => r.points === undefined), 'no row stands for several points');
  // A repeated point names the point where its office's personnel is counted (same type, name and province).
  const byId = new Map(data.rows.map(r => [r.id, r]));
  const norm = v => String(v).normalize('NFC').replace(/[\u200B-\u200D\uFEFF\s]/g, '');
  const repeats = data.rows.filter(r => r.staffShared && !raw.meta.staffOnce.types.includes(r.type.id));
  assert.ok(repeats.length > 0);
  for (const r of repeats) {
    const at = byId.get(r.staffShared);
    assert.ok(at.staff > 0 && at.type.id === r.type.id && at.province === r.province && norm(at.name) === norm(r.name), r.id);
  }
  assert.equal(data.rows.filter(r => r.staffShared).length, raw.meta.counts.staffSharedRows);
  assert.equal(raw.meta.counts.staffSharedRows, raw.meta.counts.staffSharedRepeatRows + raw.meta.counts.staffSharedOrgRows);
});

test('measure contract: personnel only where the type records it at the site; unknown is never 0; local government counted once', () => {
  const {raw, data} = load();
  const rule = id => raw.meta.staffRules.types[id];
  const known = data.rows.filter(r => r.staff);
  assert.ok(known.every(r => rule(r.type.id) === 'site' && Number.isInteger(r.staff) && r.staff > 0), 'a recorded count only for site types');
  assert.ok(data.rows.every(r => r.staff === null || r.staff > 0), 'no 0-person office: unknown is null');
  assert.equal(known.reduce((s, r) => s + r.staff, 0), raw.meta.counts.staff);
  assert.equal(known.length, raw.meta.counts.staffRows);
  const s = summarize(data.rows);
  assert.equal(s.staff, raw.meta.counts.staff);
  assert.equal(s.staffShared, raw.meta.counts.staffSharedRows);
  assert.equal(s.staffUnknown + s.staffShared + known.length, data.rows.length);
  // A local government's personnel is the organisation's: counted once, at one office; the others name it.
  const byId = new Map(data.rows.map(r => [r.id, r]));
  for (const r of data.rows.filter(x => x.staffShared)) {
    const at = byId.get(r.staffShared);
    assert.ok(at && at.staff > 0 && r.staff === null && !at.staffShared, `${r.id} → ${r.staffShared}: the point that counts it`);
    assert.ok(at.type.id === r.type.id && at.province === r.province, `${r.id}: same type, same province`);
    assert.equal(staffUnknown(r), false, 'counted at the other office, not unknown');
  }
  assert.equal(staffUnknown({office: false, staff: null, staffShared: ''}), false, 'a place: personnel does not apply, never “unknown”');
  // Head offices: the agency's whole workforce, kept apart (never added to a district).
  assert.ok(data.rows.filter(r => r.agencyStaff).every(r => rule(r.type.id) === 'agency' && r.staff === null));
  assert.equal(data.rows.filter(r => r.agencyStaff).length, raw.meta.counts.agencyStaffRows);
  assert.equal(rowValue({staff: null}, 'staff'), 0, 'an unknown adds nothing to a personnel total');
  assert.equal(rowValue({staff: null}, 'count'), 1);
  assert.deepEqual([unitWords('staff').one, unitWords('count').one, unitWords('').one], ['คน', 'แห่ง', 'แห่ง']);
  assert.deepEqual([null, 49, 50, 249, 250].map(pinSizeOf), [0, 0, 1, 1, 2]);
});

test('types are production’s own codes and labels; a row’s group is its type’s group; the counts are the rows', () => {
  const {data} = loadAll();
  assert.equal(new Set(data.types.map(t => t.id)).size, data.types.length);
  assert.ok(data.rows.every(r => r.type && r.type.group?.index === r.group), 'the group follows the type');
  for (const t of data.types) assert.equal(data.rows.filter(r => r.type === t).length, t.rows, t.id);
  assert.equal(typeParam(''), 'none');
  assert.equal(typeIdOf('none'), '');
  assert.equal(filterRows(data.rows, {group: 'all', type: 'none'}).length, data.types.find(t => t.id === '').rows, 'the points without a category');
  assert.deepEqual(['1010', '1070', '1121', '3030'].map(id => data.types.find(t => t.id === id).th), ['ที่ว่าการอำเภอ', 'สถานีตำรวจ', 'สถานีดับเพลิง', 'วัด']);
});

test('membership: every row sits in the production district of its overlay subdistrict, in its own province', () => {
  const {data, index} = loadAll();
  for (const r of data.rows) {
    const a = index.byId.get(r.area);
    assert.ok(a, r.id);
    assert.equal(a.province, r.province);
    assert.equal(r.admin, 'overlay');
  }
});

test('points are the production points, inside Thailand, six decimals; never invented', () => {
  const {raw, data} = load();
  const pts = data.rows.filter(hasPoint);
  assert.equal(pts.length, data.rows.length, 'every production point carries its coordinates');
  assert.ok(pts.every(r => Math.round(r.latitude * 1e6) / 1e6 === r.latitude && Math.round(r.longitude * 1e6) / 1e6 === r.longitude));
  assert.equal(raw.meta.counts.rows, raw.meta.rows);
});

test('context from CityMETER Transit: straight-line distances agree with the published points', () => {
  const {raw, data} = load();
  assert.match(raw.meta.context.rail.commit, /^[0-9a-f]{40}$/);
  assert.match(raw.meta.context.rail.sha256, /^[0-9a-f]{64}$/);
  let checked = 0;
  for (const r of data.rows) {
    if (r.rail) {
      assert.ok(hasPoint(r) && r.rail.station.status === 'operating' && r.rail.m <= 2000, r.id);
      if (checked++ < 400) assert.ok(Math.abs(distanceM(r.latitude, r.longitude, r.rail.station.lat, r.rail.station.lon) - r.rail.m) <= 1.5, r.id);
    }
    if (r.railNext) assert.equal(r.railNext.station.status, 'construction');
  }
  assert.ok(checked > 100);
});

test('recent moves and openings (06): dated, kinds of the tab, public https announcements; linked rows exist', () => {
  const {raw, data} = load();
  assert.equal(data.events.length, raw.meta.counts.events);
  assert.equal(data.events.length, raw.meta.tabs['06_RECENT_PROD_GAPS'].rows);
  for (let i = 1; i < data.events.length; i++) assert.ok(data.events[i - 1].date >= data.events[i].date, 'newest first');
  for (const e of data.events) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(raw.eventKinds[e.kind] === e.kindTh && e.kindTh, e.id);
    assert.ok(e.evidence.length > 0 && e.evidence.every(u => /^https:\/\//.test(u)), `${e.id}: a public https announcement`);
    assert.ok(e.dateMeaning, `${e.id}: what the date means`);
  }
  const linked = data.events.filter(e => e.row);
  assert.equal(linked.length, raw.meta.counts.eventsMatched);
  const byId = new Map(data.rows.map(r => [r.id, r]));
  for (const e of linked) assert.ok(byId.get(e.row)?.events.includes(e), `${e.id} → ${e.row}`);
  assert.equal(data.rows.reduce((n, r) => n + r.events.length, 0), linked.length);
});

test('the text filter keeps the rows that hold every word, whatever letter a word begins with', () => {
  // The rule in plain `includes`: every word in the row's own names and agency, its district and province, or its type.
  const {data} = load();
  const lower = v => String(v || '').toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '');
  const own = r => lower([r.name, r.agency, r.ministry].filter(Boolean).join(' '));
  const keeps = text => { const terms = lower(text).trim().split(/\s+/).filter(Boolean); return data.rows.filter(r => terms.every(t => own(r).includes(t) || (r.areaText || '').includes(t) || r.typeText.includes(t))); };
  // Words that begin with ก to ฎ go the needle's way (js/shell/fuzzy.js#needle); the others are looked for as they are.
  for (const text of ['กรุงเทพ', 'ชลบุรี', 'ขอนแก่น', 'กรม', 'จังหวัด', 'งาน', 'คลอง', 'กก', 'ภูเก็ต', 'เชียงใหม่', 'สถานีตำรวจ ชลบุรี', 'กรม ตำรวจ', 'ศาล จังหวัด', 'Police', 'zzzz']) {
    const want = keeps(text), got = filterRows(data.rows, {search: text});
    assert.equal(got.length, want.length, text);
    assert.ok(got.every((r, i) => r === want[i]), `${text}: the same rows in the same order`);
  }
  assert.ok(filterRows(data.rows, {search: 'กรุงเทพ'}).length > 0 && filterRows(data.rows, {search: 'ชลบุรี'}).length > 0 && filterRows(data.rows, {search: 'กรม ตำรวจ'}).length > 0);
  assert.equal(filterRows(data.rows, {search: '  '}).length, data.rows.length, 'no word keeps every row');
});

test('publication hygiene: no contact field, full production id, researcher note or private link; links are https', () => {
  const {raw} = load();
  for (const f of ['phone', 'website', 'address', 'email_address', 'gov_office_id']) assert.ok(raw.meta.excludedFields.includes(f), f);
  assert.ok(raw.meta.excludedFields.some(f => f.startsWith('production_row_id')));
  const text = JSON.stringify(raw);
  for (const k of ['phone', 'address', 'email', 'website', 'uuid']) assert.ok(!Object.keys(raw.cols).includes(k), k);
  assert.ok(!/(docs|drive)\.google\.com/.test(text), 'no Google document link');
  assert.ok(!/google\.[a-z.]+\/maps|maps\.app\.goo\.gl/.test(text), 'no map links');
  assert.ok(!/landometer\.com\/api\//.test(raw.urls.join(' ')), 'no internal API link as a source link');
  assert.ok(!/github\.com\/theshifters\//.test(text), 'no link into the private production repository');
  assert.ok(raw.urls.every(u => /^https:\/\//.test(u)), 'source links are https');
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(JSON.stringify(raw.cols)), 'no full production UUID in the rows');
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(text.replace(/https:\/\/[^"\s]+/g, '')), 'no e-mail address');
});

test('boundaries: 928 districts and 77 provinces from production; per-province frames match the index; receipts bound by hash', () => {
  const {raw, index, indexJSON, provincesGeo} = load();
  assert.equal(index.areas.length, 928);
  assert.equal(index.provinces.length, 77);
  assert.equal(provincesGeo.features.length, 77);
  assert.ok(index.areas.every(a => a.km2 > 0 && Array.isArray(a.label) && Array.isArray(a.bbox)), 'production area, label and bbox for every district');
  const files = frameFiles();
  assert.equal(files.length, 77);
  let areas = 0;
  for (const f of files) {
    const code = f.replace('.json', ''), frame = readJSON(`data/frames/${f}`), p = index.provinceById.get(code);
    assert.ok(p, code);
    assert.equal(frame.areas.features.length, p.areaTotal, `${code} districts`);
    for (const ft of frame.areas.features) assert.equal(index.byId.get(String(ft.id ?? ft.properties.id))?.province, code);
    areas += frame.areas.features.length;
  }
  assert.equal(areas, 928);
  const receipts = readJSON('data/boundary-receipts.json');
  assert.equal(Object.keys(receipts.base).length, 78, 'the country list + 77 province base-info responses');
  assert.equal(indexJSON.metadata.receipts, 78);
  for (const r of Object.values(receipts.base)) {
    assert.match(r.sha256, /^[a-f0-9]{64}$/);
    assert.match(r.url, /^https:\/\/landometer\.com\/api\/v2\/citymeter-v3\/base\/info\//);
    assert.equal(r.status, 200);
  }
  const py = v => (Array.isArray(v) ? `[${v.map(py).join(', ')}]` : v && typeof v === 'object'
    ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}: ${py(v[k])}`).join(', ')}}` : JSON.stringify(v));
  assert.equal(sha256(Buffer.from(py(receipts.base))), receipts.baseSha256);
  assert.equal(indexJSON.metadata.receiptsSha256, receipts.baseSha256);
  assert.equal(raw.meta.gazetteer.receiptsSha256, receipts.baseSha256, 'the dataset was built on the same gazetteer');
});
