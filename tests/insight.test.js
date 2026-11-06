import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers.js';
import {summarizeAreaInsight, filterAreaRows, RAIL_M} from '../js/area-insight.js';
import {levelWords, areaLabel} from '../js/areas.js';
import {filterRows} from '../js/model.js';
import {buildAreaModel} from '../js/map-layers.js';
import {buildProvinceModel} from '../js/provinces.js';
import {SUPPLY_SCALE, COUNT_SCALE} from '../js/scales.js';

// Snapshot values are regression fixtures of the 2026-11-06 build, never UI constants.
test('first Aha (snapshot fixture, offices): the three อำเภอ with the most government offices in the province holding the most', () => {
  const {data, index} = load();
  const a = summarizeAreaInsight(data.rows, index);
  assert.equal(a.metric, 'count', 'offices are the default measure');
  assert.equal(a.home, 'NMA');
  assert.deepEqual(a.areas.map(x => [x.id, x.name, x.value]), [['3001', 'เมืองนครราชสีมา', 69], ['3014', 'ปักธงชัย', 47], ['3020', 'สีคิ้ว', 42]]);
  assert.deepEqual([a.value, a.homePlacedValue, a.homeValue, Math.round(a.share)], [158, 715, 715, 22], 'the share is of the province\'s whole total');
  assert.equal(a.homeAreaIds.length, 32);
  // Rail (CityMETER · Transit): no operating station in Nakhon Ratchasima — the panel hides the rail comparison.
  assert.equal(RAIL_M, 500);
  assert.deepEqual([a.rail.focus.within, a.rail.focus.base, a.rail.rest.within, a.rail.rest.base], [0, 158, 0, 557]);
  // The district with the most offices outside the province holds more than any district of it.
  assert.deepEqual([a.outside.id, a.outside.name, a.outside.province, a.outside.value], ['6001', 'เมืองนครสวรรค์', 'NSN', 84]);
  assert.ok(a.outside.value > a.areas[0].value);
  assert.deepEqual(filterAreaRows(data.rows, new Set(a.areaIds)).length, a.count);
});

test('personnel Aha: Chonburi holds the most personnel recorded at district level; unknown personnel is counted apart', () => {
  const {data, index} = load();
  const s = summarizeAreaInsight(data.rows, index, {metric: 'staff'});
  assert.equal(s.home, 'CBI');
  assert.deepEqual(s.areas.map(x => [x.name, x.value]), [['เมืองชลบุรี', 5897], ['ศรีราชา', 4665], ['สัตหีบ', 3752]]);
  assert.deepEqual([s.value, s.homeValue, s.count, s.homePlaced, s.homeStaffUnknown], [14314, 21533, 190, 385, 199]);
  assert.deepEqual([s.outside.name, s.outside.value], ['เมืองลพบุรี', 9101]);
});

test('the focus never cuts through a tie; a province where every district holds the same value is “spread”', () => {
  const {index} = load();
  const row = (area, staff, i) => ({id: `t${area}-${i}`, area, province: index.byId.get(area).province, staff, latitude: null, longitude: null});
  // Bangkok: 1033 (40), then 1037 and 1039 tied (20) above 1001 (10): only the district above the tie is the focus.
  const tie = [row('1033', 40, 1), row('1037', 20, 1), row('1039', 20, 1), row('1001', 10, 1)];
  assert.deepEqual(summarizeAreaInsight(tie, index, {metric: 'staff'}).areas.map(a => a.id), ['1033', '1037', '1039'], 'the cut after three is above the tie');
  const tie4 = [...tie, row('1002', 20, 1)];
  assert.deepEqual(summarizeAreaInsight(tie4, index, {metric: 'staff'}).areas.map(a => a.id), ['1033'], 'three districts tied at 20: only 1033 is above them');
  const spread = [row('1033', 5, 1), row('1037', 5, 1), row('1039', 5, 1), row('1001', 5, 1)];
  const s = summarizeAreaInsight(spread, index, {metric: 'staff'});
  assert.deepEqual(s.areas, []);
  assert.deepEqual(s.spread, {areas: 4, value: 5});
});

test('the Aha follows the filters: a province, a group, a type, nothing', () => {
  const {data, index} = load();
  const cmi = summarizeAreaInsight(filterRows(data.rows, {province: 'CMI'}), index);
  assert.equal(cmi.home, 'CMI');
  assert.equal(cmi.areas[0].name, 'เมืองเชียงใหม่');
  assert.equal(cmi.outside, null, 'a one-province selection has no outside finding');
  const police = summarizeAreaInsight(filterRows(data.rows, {type: '1070'}), index);
  assert.deepEqual([police.home, police.areas.map(a => a.name)], ['BKK', ['หนองจอก', 'ธนบุรี', 'ลาดกระบัง']], 'police stations: Bangkok first');
  assert.ok(police.rail.focus.base > 0 && police.rail.rest.within > 0, 'Bangkok has rail: the comparison is shown');
  const unclassified = summarizeAreaInsight(filterRows(data.rows, {group: 'unclassified'}), index);
  assert.equal(unclassified.home, 'BKK', 'head offices: Bangkok');
  const none = summarizeAreaInsight([], index);
  assert.deepEqual([none.areas.length, none.share, none.home], [0, 0, '']);
});

test('district model: EVID-05 — a district without an office is a measured 0; offices with unknown personnel are no data, never 0', () => {
  const {data, index} = load();
  const count = buildAreaModel(data.rows, index);
  assert.equal(count.areas.length, 928);
  assert.equal(count.ramp.scaleId, COUNT_SCALE.scaleId);
  assert.deepEqual([count.ramp.min, count.ramp.max, count.ramp.steps], [1, 84, 41]);
  assert.equal(count.zeroCount, 3, 'three districts hold no government office: measured zero, not no data');
  assert.ok(count.areas.filter(a => a.state === 'measured_zero').every(a => a.count === 0));
  assert.equal(count.byId.get('6001').fill, COUNT_SCALE.lut[40], 'เมืองนครสวรรค์ (the national maximum) closes the ramp on sample 40');
  const staff = buildAreaModel(data.rows, index, {metric: 'staff'});
  assert.equal(staff.ramp.scaleId, SUPPLY_SCALE.scaleId);
  assert.deepEqual([staff.ramp.min, staff.ramp.max], [2, 9101]);
  assert.ok(staff.areas.filter(a => a.state === 'no_data').length > 0, 'districts whose offices all have unknown personnel');
  assert.ok(staff.areas.filter(a => a.state === 'no_data').every(a => a.count > 0 && a.staff === 0));
  // A district whose offices all have unknown personnel: no_data under personnel, a measured value under offices.
  const unknown = [{id: 'u1', area: '1001', province: 'BKK', staff: null, office: true}, {id: 'k1', area: '1033', province: 'BKK', staff: 120, office: true}];
  assert.equal(buildAreaModel(unknown, index, {province: 'BKK', metric: 'staff'}).byId.get('1001').state, 'no_data');
  assert.equal(buildAreaModel(unknown, index, {province: 'BKK', metric: 'count'}).byId.get('1001').state, 'measured');
});

test('province frames total the measure per province; every province holds an office', () => {
  const {data, provincesGeo} = load();
  const m = buildProvinceModel(data.rows, provincesGeo);
  assert.equal(m.provinces.length, 77);
  const by = new Map();
  for (const r of data.rows) if (r.province) by.set(r.province, (by.get(r.province) || 0) + 1);
  for (const p of m.provinces) assert.equal(p.value, by.get(p.code) || 0, p.code);
  assert.equal(m.provinces.find(p => p.code === 'NMA').fill, COUNT_SCALE.lut[40], 'Nakhon Ratchasima closes the province ramp');
  assert.equal(m.zeroCount, 0, 'every province holds an office');
  const none = buildProvinceModel([], provincesGeo);
  assert.ok(none.provinces.every(p => p.state === 'measured_zero'));
});

test('level words follow the province: เขต in Bangkok, อำเภอ elsewhere', () => {
  const {index} = load();
  assert.deepEqual(levelWords('BKK'), {area: 'เขต'});
  assert.deepEqual(levelWords('PKT'), {area: 'อำเภอ'});
  assert.equal(areaLabel(index.byId.get('1039')), 'เขตวัฒนา');
  assert.equal(areaLabel(index.byId.get('8301')), 'อำเภอเมืองภูเก็ต');
});
