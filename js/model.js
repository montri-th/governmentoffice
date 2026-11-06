/**
 * Dataset vocabulary, decoding, shared filter and summary helpers.
 *
 * Rows are the offices of the production Government Officer dataset as the research sheet “CityMETER Government
 * Office Thailand — รายชื่อรอยืนยัน 2026-11-05” holds them (05_PRODUCTION_ROWS, 440,005 production points reconciled
 * with production district by district at build time). One row = one office: a production point, or the repeated
 * points of one office (same type and name in the same province, within 100 m — the point with the smallest UUID;
 * row.points says how many). Nothing here merges, moves or mutates a row.
 *
 * Groups: the office groups (admin, police, fire, justice, military, unclassified) are the default scope and arrive
 * with data/offices.json; education, religion and community are other places of the same production dataset and
 * load on demand (data/groups/<group>.json) when the reader asks for them.
 *
 * Two measures (a contract, see DATA_METHOD.md §2):
 *   count (default) — offices (“แห่ง”, LDS `count`).
 *   staff           — personnel production records at the office (“คน”, LI `li.supply`), only for types that record
 *                     a count at the site; an office without one adds nothing and is counted apart
 *                     (“ไม่ทราบจำนวนบุคลากร”), never as zero. A local government's personnel is counted once, at the
 *                     organisation's first office (row.staffShared names it on the others).
 * Area = the เขต/อำเภอ (DISTRICT) of CityMETER production that holds the point's production overlay subdistrict.
 */
import {seriesOf} from './cues.js';

/** Short labels for tight places (matrix columns); the full Thai label stays in titles, legends and lists. */
export const GROUP_SHORT = Object.freeze({
  admin: 'ปกครอง', police: 'ตำรวจ', fire: 'ดับเพลิง', justice: 'ศาล', military: 'ทหาร', unclassified: 'ไม่ระบุหมวด',
  education: 'การศึกษา', religion: 'ศาสนา', community: 'ชุมชน',
});
/** What the first finding counts when one group is the scope (“…% ของ<noun>ใน<province>”). */
export const GROUP_NOUN = Object.freeze({
  admin: 'หน่วยงานปกครองและท้องถิ่น', police: 'หน่วยงานตำรวจ', fire: 'หน่วยงานดับเพลิง', justice: 'หน่วยงานศาลและยุติธรรม',
  military: 'หน่วยงานทหาร', unclassified: 'หน่วยงานที่ยังไม่ระบุหมวด', education: 'สถานศึกษาและแหล่งเรียนรู้',
  religion: 'ศาสนสถานและโบราณสถาน', community: 'สถานที่ของชุมชนและสมาคม',
});
/** The filter value of the default scope (the office groups) and of every group of the dataset. */
export const SCOPE_OFFICES = '';
export const SCOPE_ALL = 'all';

/** Measures: `count` (default) and `staff`. */
export const METRICS = Object.freeze({
  count: Object.freeze({id: 'count', one: 'แห่ง', label: 'หน่วยงาน', subject: 'หน่วยงาน', per: 'แห่ง'}),
  staff: Object.freeze({id: 'staff', one: 'คน', label: 'บุคลากร', subject: 'บุคลากร', per: 'คน'}),
});
export const DEFAULT_METRIC = 'count';
export const metricOf = id => METRICS[id] || METRICS[DEFAULT_METRIC];
/** Unit words for a measure. */
export const unitWords = (metric = DEFAULT_METRIC) => ({...metricOf(metric), mode: metricOf(metric).id});
/**
 * Unit words of a measure for a scope (one place for the app and the tests): offices are “หน่วยงาน”; with education,
 * religion or community places in the scope a count is of “สถานที่” (a temple is not a government office). `aha` is
 * what the first finding counts (“…% ของ<aha>ใน<province>”): the type when one is chosen, else the group, else the
 * government offices; `offices` says whether personnel applies to the scope.
 */
export function unitFor({metric = DEFAULT_METRIC, groups = [], group = '', type = null} = {}) {
  const u = unitWords(metric), offices = groupsOfScope(groups, group).every(g => g.office);
  const noun = type ? type.th : group === SCOPE_ALL ? 'สถานที่ทุกหมวด' : GROUP_NOUN[group];
  if (u.id === 'staff') return {...u, aha: 'บุคลากรที่บันทึก', place: offices ? 'หน่วยงาน' : 'สถานที่', offices};
  return offices ? {...u, aha: noun || 'หน่วยงานรัฐ', place: 'หน่วยงาน', offices}
    : {...u, label: 'สถานที่', subject: 'สถานที่', aha: noun || 'สถานที่', place: 'สถานที่', offices};
}

/**
 * Symbol size on the map (the Hotel contract, owner 2026-11-01): the symbol's AREA grows with the recorded personnel —
 * radius = k(zoom) · √(staff / SIZE_UNIT), personnel capped at STAFF_SIZE_CAP, never below PIN_MIN_RADIUS. An office
 * with unknown personnel is drawn hollow at the UNKNOWN_STAFF_SIZE size (EVID-05: never a measured 0). PIN_SCALE
 * gives k (px of radius for SIZE_UNIT people) by zoom; the legend and the HTML pins use the same numbers.
 */
export const PIN_SCALE = Object.freeze([[6, 0.9], [8, 1.3], [10, 2.0], [12, 3.2], [14, 4.8], [16, 5.8], [18, 6.4]]);
export const STAFF_SIZE_CAP = 1000;
export const SIZE_UNIT = 100;
export const PIN_MIN_RADIUS = 1.6;
export const UNKNOWN_STAFF_SIZE = 40;
export function pinK(zoom) {
  const s = PIN_SCALE;
  if (!(zoom > s[0][0])) return s[0][1];
  for (let i = 1; i < s.length; i++) if (zoom <= s[i][0]) return s[i - 1][1] + (s[i][1] - s[i - 1][1]) * (zoom - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
  return s.at(-1)[1];
}
/** Symbol radius in px for a row's personnel at a zoom (unknown → the UNKNOWN_STAFF_SIZE size, drawn hollow by the caller). */
export const pinRadius = (staff, zoom) => {
  const n = Number.isFinite(staff) && staff > 0 ? Math.min(staff, STAFF_SIZE_CAP) : UNKNOWN_STAFF_SIZE;
  return Math.max(PIN_MIN_RADIUS, pinK(zoom) * Math.sqrt(n / SIZE_UNIT));
};
/**
 * The same size as a MapLibre expression of feature property `r` (personnel, 0 = unknown): min(cap, `factor` × radius)
 * + `add` px (zoom stays the top-level input, as MapLibre requires).
 */
export function pinSizeExpression(factor = 1, add = 0, cap = 1e6) {
  const at = k => ['+', add, ['min', cap, ['*', factor, ['max', PIN_MIN_RADIUS, ['*', k, ['sqrt', ['/', ['case', ['>', ['get', 'r'], 0], ['min', ['get', 'r'], STAFF_SIZE_CAP], UNKNOWN_STAFF_SIZE], SIZE_UNIT]]]]]]];
  return ['interpolate', ['linear'], ['zoom'], ...PIN_SCALE.flatMap(([z, k]) => [z, at(k)])];
}
/** Size class kept for HTML pins and lists: 0 small (< 50 people or unknown), 1 medium (50–249), 2 large (≥ 250). */
export const pinSizeOf = n => (Number.isFinite(n) && n >= 250 ? 2 : Number.isFinite(n) && n >= 50 ? 1 : 0);

/**
 * Importance of a row for labels (the Hotel rule “important first”, owner 2026-11-01): its type's tier (1 = district
 * offices, municipalities of a city or town, courts, police and fire stations, head offices, universities…) first,
 * then its percentile among all rows by recorded personnel (an unknown value is never guessed: it ranks as the lowest
 * of its tier). Ranking only — never shown as a figure.
 */
export function importanceScores(rows) {
  const sorted = rows.map(r => r.staff).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  const n = sorted.length;
  const pct = v => {
    if (!Number.isFinite(v) || !n) return 0;
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid; }
    return lo / n;
  };
  return rows.map(r => (4 - (r.type?.tier || 3)) + pct(r.staff ?? r.agencyStaff));
}

/** The value a row adds to a measure: 1 office, or its recorded personnel (known only). */
export const rowValue = (r, metric = DEFAULT_METRIC) => (metric === 'staff' ? (Number.isFinite(r?.staff) && r.staff > 0 ? r.staff : 0) : 1);
/** The value of an aggregate ({count, staff}) under a measure. */
export const valueOf = (a, metric = DEFAULT_METRIC) => (metric === 'staff' ? a?.staff || 0 : a?.count || 0);
/** A row whose personnel is unknown (neither recorded at the office nor counted at its organisation's office). */
export const staffUnknown = r => !(r.staff > 0) && !r.staffShared;

/** Every province of the production base info, keyed by the production route code (/v3/citymeter/{code}). */
let PROVINCE_LIST = [];
export function setProvinces(list) { PROVINCE_LIST = Object.freeze((list || []).map(p => Object.freeze({code: p.id, dopa: p.code, th: p.name, en: p.nameEn}))); }
export const provinces = () => PROVINCE_LIST;
export const provinceByCode = code => PROVINCE_LIST.find(p => p.code === String(code || '').toUpperCase()) || null;
/** Accept a production code (BKK), a DOPA code (10) or an English/Thai name; returns the production code or ''. */
export const provinceCodeFrom = value => {
  const v = String(value || '').trim();
  const p = PROVINCE_LIST.find(x => x.code === v.toUpperCase() || x.dopa === v || x.en.toLowerCase() === v.toLowerCase() || x.th === v);
  return p ? p.code : '';
};

/** A usable coordinate inside Thailand's bounding box (never invented). */
export const hasPoint = r => Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude) &&
  r.latitude >= 5 && r.latitude <= 21 && r.longitude >= 97 && r.longitude <= 106;

const lower = v => String(v || '').toLocaleLowerCase('th-TH').replace(/[​-‍﻿]/g, '');
const at = (col, i) => (Array.isArray(col) ? col[i] : col?.const);

/**
 * The dictionaries of data/offices.json (groups, categories, types, stations, events, urls, districts, provinces):
 * every group file's columns index into them.
 */
export function decodeMeta(json) {
  if (!Array.isArray(json?.groups) || !Array.isArray(json?.types)) throw new Error('Invalid government office dataset');
  const groups = json.groups.map((g, i) => ({...g, index: i, series: seriesOf(g.id), short: GROUP_SHORT[g.id] || g.th, loaded: Boolean(g.office)}));
  const cats = (json.cats || []).map((c, i) => ({...c, index: i, group: groups[c.group]}));
  const types = json.types.map((t, i) => ({...t, index: i, group: groups[t.group] || null, cat: cats[t.cat] || null}));
  const stations = (json.stations || []).map((s, i) => ({...s, index: i}));
  const urls = json.urls || [];
  const events = (json.events || []).map((e, i) => ({...e, index: i, kindTh: (json.eventKinds || [])[e.kind] || '',
    evidence: (e.evidence || []).map(u => urls[u]).filter(Boolean)}));
  return {meta: json.meta || {}, groups, cats, types, stations, urls, events, districts: json.districts || [], provinceCodes: json.provinces || [],
    sources: json.sources || [], history: []};
}

/**
 * Decode the columns of one file (data/offices.json or data/groups/<group>.json) into row objects.
 * `dict` = decodeMeta(offices.json); `index` = the area index (js/areas.js#buildAreaIndex): every district code must
 * exist there.
 */
export function decodeRows(json, dict, index) {
  const c = json?.cols;
  if (!c || !Array.isArray(c.key)) throw new Error('Invalid government office rows');
  const n = c.key.length, agencies = json.agencies || [], ministries = json.ministries || [], agencyMinistry = json.agencyMinistry || [];
  const rowMinistry = json.rowMinistry || {}, rail = json.rail || {}, rail2 = json.rail2 || {}, agencyStaff = json.agencyStaff || {};
  const evMap = json.rowEvents || {}, points = json.points || {}, shared = json.staffShared || {};
  const rows = [];
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const k = String(i);
    const area = dict.districts[c.district[i]] || '';
    const a = area ? index?.byId.get(area) : null;
    if (area && !a) { dropped++; continue; }
    const type = dict.types[c.type[i]];
    const group = type?.group || dict.groups.at(-1);
    let name = c.name[i];
    if (name.charCodeAt(0) === 1) name = (type?.prefix || '') + name.slice(1);
    const staff = at(c.staff, i);
    const mi = k in rowMinistry ? rowMinistry[k] : agencyMinistry[c.agency[i]];
    const rl = rail[k], r2 = rail2[k];
    const row = {
      id: c.key[i], name, index: i,
      group: group.index, groupId: group.id, series: group.series, office: Boolean(group.office),
      type, cat: type?.cat || null, agency: agencies[c.agency[i]] || '', ministry: mi >= 0 ? ministries[mi] || '' : '',
      staff: staff > 0 ? staff : null, staffShared: shared[k] || '', agencyStaff: agencyStaff[k] || null, points: points[k] || 1,
      area, province: a?.province || '', admin: 'overlay',
      longitude: at(c.lon, i), latitude: at(c.lat, i),
      rail: rl ? {station: dict.stations[rl[0]], m: rl[1]} : null,
      railNext: r2 ? {station: dict.stations[r2[0]], m: r2[1]} : null,
      events: (evMap[k] || []).map(e => dict.events[e]).filter(Boolean),
    };
    row.haystack = lower([row.name, row.agency, row.ministry, a?.name, a?.nameEn, type?.th, type?.short, group.th,
      PROVINCE_LIST.find(x => x.code === row.province)?.th, PROVINCE_LIST.find(x => x.code === row.province)?.en].filter(Boolean).join(' '));
    rows.push(row);
  }
  return {rows, dropped};
}

/** offices.json → {meta, rows, groups, cats, types, stations, events, sources, dict, dropped} (office groups only). */
export function decodeDataset(json, index) {
  const dict = decodeMeta(json);
  const {rows, dropped} = decodeRows(json, dict, index);
  const scores = importanceScores(rows);
  rows.forEach((r, i) => { r.importance = scores[i]; });
  return {...dict, dict, rows, dropped};
}

/** Append the rows of a group file to a decoded dataset (importance recomputed over every loaded row). */
export function appendGroupRows(data, json, index) {
  const {rows, dropped} = decodeRows(json, data.dict, index);
  const gid = json?.meta?.group;
  const g = data.groups.find(x => x.id === gid);
  if (g) g.loaded = true;
  data.rows = data.rows.concat(rows);
  data.dropped += dropped;
  const scores = importanceScores(data.rows);
  data.rows.forEach((r, i) => { r.importance = scores[i]; });
  return rows.length;
}

/** The groups a scope value asks for: '' = the office groups, 'all' = every group, else one group. */
export function groupsOfScope(groups, value = '') {
  if (value === SCOPE_ALL) return groups;
  if (!value) return groups.filter(g => g.office);
  return groups.filter(g => g.id === value);
}

/**
 * Shared filter used by map, counters, charts, panel and table.
 * f = {search, group, type, province}: group '' = the office groups (default scope), 'all' = every loaded group.
 * Area selection and area focus are applied by the caller (row scopes, see app.js).
 */
export function filterRows(rows, f = {}) {
  // Every word of the search, anywhere in the office's names, agency, area or type (the Hotel 0.3.4 rule).
  const terms = lower(f.search).trim().split(/\s+/).filter(Boolean);
  return rows.filter(r => {
    if (!f.group) { if (!r.office) return false; }
    else if (f.group !== SCOPE_ALL && r.groupId !== f.group) return false;
    if (f.type !== undefined && f.type !== '' && r.type?.id !== typeIdOf(f.type)) return false;
    if (f.province && r.province !== f.province) return false;
    return terms.every(t => r.haystack.includes(t));
  });
}
/** URL value of a type: its production code, `none` for the points without a type. */
export const typeParam = id => (id === '' ? 'none' : String(id));
export const typeIdOf = value => (value === 'none' ? '' : String(value));

/** Totals for a selection: offices, known personnel, offices with unknown personnel, points, placement, types. */
export function summarize(rows) {
  let points = 0, placed = 0, provinced = 0, staff = 0, staffUnknownN = 0, shared = 0, productionPoints = 0;
  const types = new Set(), areas = new Set(), provinces = new Set();
  for (const r of rows) {
    if (hasPoint(r)) points++;
    productionPoints += r.points || 1;
    if (r.area) { placed++; areas.add(r.area); }
    if (r.province) { provinced++; provinces.add(r.province); }
    if (r.staff) staff += r.staff; else if (r.staffShared) shared++; else staffUnknownN++;
    if (r.type) types.add(r.type.id);
  }
  return {count: rows.length, staff, staffUnknown: staffUnknownN, staffShared: shared, points, productionPoints, placed, provinced,
    types: types.size, areas: areas.size, provinces: provinces.size};
}

/** Offices and personnel per group for a selection (every group listed, zero kept as a measured 0). */
export function mixOf(rows, groups) {
  const byGroup = groups.map(g => ({id: g.id, index: g.index, series: g.series, th: g.th, short: g.short, office: Boolean(g.office), count: 0, staff: 0, staffUnknown: 0}));
  const byIndex = new Map(byGroup.map(g => [g.index, g]));
  for (const r of rows) {
    const g = byIndex.get(r.group);
    if (!g) continue;
    g.count++; g.staff += r.staff || 0; if (staffUnknown(r)) g.staffUnknown++;
  }
  return {byGroup};
}

/** Offices and personnel per type, largest first (types without an office in the selection are left out). */
export function typeMixOf(rows) {
  const by = new Map();
  for (const r of rows) {
    const t = r.type;
    let e = by.get(t.id);
    if (!e) by.set(t.id, e = {type: t, id: t.id, th: t.th, short: t.short, series: r.series, count: 0, staff: 0, staffUnknown: 0});
    e.count++; e.staff += r.staff || 0; if (staffUnknown(r)) e.staffUnknown++;
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.type.index - b.type.index);
}

/** Share of the measure that lies within `m` metres (straight line) of an operating rail station; rows with a point only. */
export function railShare(rows, metric = DEFAULT_METRIC, m = 500) {
  let within = 0, base = 0, noPoint = 0;
  for (const r of rows) {
    const v = rowValue(r, metric);
    if (!hasPoint(r)) { noPoint += v; continue; }
    base += v;
    if (r.rail && r.rail.m <= m) within += v;
  }
  return {within, base, noPoint, share: base ? (within / base) * 100 : null};
}

export const safeURL = value => {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; }
  catch { return ''; }
};

/**
 * Production CityMETER deep links (the route scheme of the production bundle). Production's dataset code for
 * government agencies and personnel is `governmentOfficer`, so the link opens the same area with it.
 */
export const PRODUCTION = 'https://landometer.com/v3/citymeter';
export const PRODUCTION_DATASET = 'governmentOfficer';
export function productionLink({province = '', area = ''} = {}) {
  if (!province) return `${PRODUCTION}?d=${PRODUCTION_DATASET}`;
  if (area) return `${PRODUCTION}/${province}/D/${area}?d=${PRODUCTION_DATASET}`;
  return `${PRODUCTION}/${province}?d=${PRODUCTION_DATASET}`;
}
/** CityMETER sibling demos linked by registry id. */
export const TRANSIT_SITE = 'https://montri-th.github.io/transit/';
export const stationLink = s => (s?.id ? `${TRANSIT_SITE}?station=${encodeURIComponent(s.id)}` : '');
export const SCHOOL_SITE = 'https://montri-th.github.io/school/';
