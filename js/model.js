/**
 * Dataset vocabulary, decoding, shared filter and summary helpers.
 *
 * Rows are the points of the production Government Officer dataset as the research sheet “CityMETER Government
 * Office Thailand — รายชื่อรอยืนยัน 2026-11-05” holds them (05_PRODUCTION_ROWS, reconciled with production district
 * by district at build time). One row = one production point, as production counts them (release 0.2.0, owner
 * 2026-11-06: “อยากได้ทั้งสี่แสนจุด”). Nothing here merges, moves or mutates a row.
 *
 * Groups: the government-office groups (admin, police, fire, justice, military, unclassified — personnel applies)
 * arrive with data/offices.json; education, religion and community are the other places of the same production
 * dataset (data/groups/<group>.json). The default scope is every group: the page loads every file at start.
 *
 * Two measures (a contract, see DATA_METHOD.md §2):
 *   count (default) — points (“แห่ง”, LDS `count`): one production point, one row.
 *   staff           — personnel production records at the office (“คน”, LI `li.supply`), only for types that record
 *                     a count at the site; an office without one adds nothing and is counted apart
 *                     (“ไม่ทราบจำนวนบุคลากร”), never as zero; a place (education, religion, community) has none and
 *                     is never “unknown”. Personnel is counted once per office (its repeated points) and once per
 *                     local-government organisation (row.staffShared names the point that counts it on the others).
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
/**
 * Filter values of the group scope: '' (default) = every group — every production point; SCOPE_OFFICES = the six
 * government-office groups; a group id = that group. `all` (the 0.1.0 value of every group) reads as ''.
 */
export const SCOPE_ALL = '';
export const SCOPE_OFFICES = 'offices';
export const scopeValue = (value, groups = []) => {
  const v = String(value || '');
  return v === SCOPE_OFFICES || groups.some(g => g.id === v) ? v : SCOPE_ALL;
};

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
 * Unit words of a measure for a scope (one place for the app and the tests): government offices are “หน่วยงาน”,
 * places of education, religion or community are “สถานที่” (a temple is not a government office), both together
 * “หน่วยงานและสถานที่” (the default scope: every production point). A chosen type decides by its own group. `aha` is
 * what the first finding counts (“…% ของ<aha>ใน<province>”): the type when one is chosen, else the group, else the
 * scope. `offices` = only government offices in the scope; `personnel` = personnel applies to some of it.
 */
export function unitFor({metric = DEFAULT_METRIC, groups = [], group = '', type = null} = {}) {
  const u = unitWords(metric), scope = type?.group ? [type.group] : groupsOfScope(groups, group);
  const offices = scope.length > 0 && scope.every(g => g.office), personnel = scope.some(g => g.office);
  const words = offices ? 'หน่วยงาน' : personnel ? 'หน่วยงานและสถานที่' : 'สถานที่';
  const v = scopeValue(group, groups);
  const noun = type ? type.th : v === SCOPE_OFFICES ? 'หน่วยงานรัฐ' : v ? GROUP_NOUN[v] : words;
  if (u.id === 'staff') return {...u, aha: 'บุคลากรที่บันทึก', place: words, offices, personnel};
  return {...u, label: words, subject: words, aha: noun || words, place: words, offices, personnel};
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
/**
 * A government office whose personnel is unknown (neither recorded at the office nor counted at another point of its
 * office or organisation). A place of the other groups is never “unknown”: personnel does not apply to it.
 */
export const staffUnknown = r => Boolean(r.office) && !(r.staff > 0) && !r.staffShared;

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

// Thai has no case: the plain lower case (fast over 440,005 names) reads Latin names the same way as th-TH would.
const ZW = /[\u200B-\u200D\uFEFF]/g, HAS_ZW = /[\u200B-\u200D\uFEFF]/;
const lower = v => { const s = String(v || '').toLowerCase(); return HAS_ZW.test(s) ? s.replace(ZW, '') : s; };
const at = (col, i) => (Array.isArray(col) ? col[i] : col?.const);
const NO_EVENTS = Object.freeze([]);
/**
 * Search text, built once per district and per type (shared by their rows) and per row only when a search first
 * needs it — 440,005 rows never carry a copy of their district's and province's names.
 */
const AREA_TEXT = new Map();
const areaText = (code, a) => {
  if (!AREA_TEXT.has(code)) {
    const p = PROVINCE_LIST.find(x => x.code === a?.province);
    AREA_TEXT.set(code, lower([a?.name, a?.nameEn, p?.th, p?.en].filter(Boolean).join(' ')));
  }
  return AREA_TEXT.get(code);
};
const typeText = (type, group) => type ? (type.text ??= lower([type.th, type.short, group?.th].filter(Boolean).join(' '))) : lower(group?.th);
const ownText = r => (r.haystack ??= lower([r.name, r.agency, r.ministry].filter(Boolean).join(' ')));
/** Every word of a search (lower case, split on spaces) is somewhere in the row's names, agency, district or type. */
export const matchesSearch = (r, terms) => terms.every(t => ownText(r).includes(t) || (r.areaText || '').includes(t) || r.typeText.includes(t));

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
  const evMap = json.rowEvents || {}, shared = json.staffShared || {};
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
    const rl = rail[k], r2 = rail2[k], ev = evMap[k];
    rows.push({
      id: c.key[i], name, index: i,
      group: group.index, groupId: group.id, series: group.series, office: Boolean(group.office),
      type, cat: type?.cat || null, agency: agencies[c.agency[i]] || '', ministry: mi >= 0 ? ministries[mi] || '' : '',
      staff: staff > 0 ? staff : null, staffShared: shared[k] || '', agencyStaff: agencyStaff[k] || null,
      area, province: a?.province || '', admin: 'overlay',
      longitude: at(c.lon, i), latitude: at(c.lat, i),
      rail: rl ? {station: dict.stations[rl[0]], m: rl[1]} : null,
      railNext: r2 ? {station: dict.stations[r2[0]], m: r2[1]} : null,
      events: ev ? ev.map(e => dict.events[e]).filter(Boolean) : NO_EVENTS,
      importance: 0, haystack: null, areaText: area ? areaText(area, a) : '', typeText: typeText(type, group),
    });
  }
  return {rows, dropped};
}

/** offices.json → {meta, rows, groups, cats, types, stations, events, sources, dict, dropped} (its groups only). */
export function decodeDataset(json, index) {
  const dict = decodeMeta(json);
  const {rows, dropped} = decodeRows(json, dict, index);
  const data = {...dict, dict, rows, dropped};
  rankRows(data);
  return data;
}

/** The credit OpenStreetMap asks for (ODbL 1.0) wherever its areas or buildings made a site. */
export const OSM_CREDIT = Object.freeze({credit: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', licence: 'ODbL-1.0'});

/**
 * Office sites (data/sites.json, docs/SITES.md, owner 2026-11-06 “อนุมัติ ทุกข้อ”): the buildings of an office's
 * compound as one interior point each, from the research sheet's site tab (or a site of another CityMETER dataset that
 * names the row, `x` → meta.external); the boundary itself stays in the sheet.
 * → Map(office key → {points, n, on, src, source, buildings, url, via, credit, creditUrl, licence}); fewer than 2
 * buildings is not a site. url: the project's public layout page (sites checked against it); via: the other dataset.
 */
export function decodeSites(json) {
  const m = json?.meta || {}, out = new Map();
  for (const [key, s] of Object.entries(json?.sites || {})) {
    if (!Array.isArray(s?.pts) || s.pts.length < 2 || !s.pts.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) continue;
    const ext = Number.isInteger(s.x) ? m.external?.[s.x] || null : null;
    const osm = /^osm_/.test(s.src || '') || s.b === 'osm_buildings';
    out.set(key, Object.freeze({points: s.pts, n: s.n || s.pts.length, on: s.on || '', src: s.src || '', source: m.sources?.[s.src] || '',
      buildings: m.buildingSources?.[s.b] || '', url: safeURL(s.url || ''), via: ext ? ext.datasetTh || ext.dataset || '' : '',
      credit: osm ? m.credit || OSM_CREDIT.credit : ext?.credit || '', creditUrl: osm ? safeURL(m.creditUrl || '') || OSM_CREDIT.url : '',
      licence: osm ? m.licence || OSM_CREDIT.licence : ext?.licence || ''}));
  }
  return out;
}

/** Give the rows from index `from` on their site (`row.site`); returns how many found one. */
export function attachSites(rows, sites, from = 0) {
  let n = 0;
  if (!sites?.size) return n;
  for (let i = from; i < rows.length; i++) { const s = sites.get(rows[i].id); if (s) { rows[i].site = s; n++; } }
  return n;
}

/** Importance of every loaded row (labels): one pass over the whole dataset. */
export function rankRows(data) {
  const scores = importanceScores(data.rows);
  data.rows.forEach((r, i) => { r.importance = scores[i]; });
}

/** Append the rows of a group file to a decoded dataset; `rank` recomputes importance over every loaded row. */
export function appendGroupRows(data, json, index, {rank = true} = {}) {
  const {rows, dropped} = decodeRows(json, data.dict, index);
  const gid = json?.meta?.group;
  const g = data.groups.find(x => x.id === gid);
  if (g) g.loaded = true;
  for (const r of rows) data.rows.push(r);
  data.dropped += dropped;
  if (rank) rankRows(data);
  return rows.length;
}

/** The groups a scope value asks for: '' (or the 0.1.0 `all`) = every group, `offices` = the government offices, else one group. */
export function groupsOfScope(groups, value = '') {
  const v = scopeValue(value, groups);
  if (v === SCOPE_ALL) return groups;
  if (v === SCOPE_OFFICES) return groups.filter(g => g.office);
  return groups.filter(g => g.id === v);
}

/**
 * Shared filter used by map, counters, charts, panel and table.
 * f = {search, group, type, province}: group '' = every group (default scope), `offices` = the government offices,
 * else one group. Area selection and area focus are applied by the caller (row scopes, see app.js).
 */
export function filterRows(rows, f = {}) {
  // Every word of the search, anywhere in the office's names, agency, area or type (the Hotel 0.3.4 rule).
  const terms = lower(f.search).trim().split(/\s+/).filter(Boolean);
  const group = f.group === 'all' ? '' : f.group || '';
  const type = f.type !== undefined && f.type !== '' ? typeIdOf(f.type) : null;
  return rows.filter(r => {
    if (group === SCOPE_OFFICES) { if (!r.office) return false; }
    else if (group && r.groupId !== group) return false;
    if (type !== null && r.type?.id !== type) return false;
    if (f.province && r.province !== f.province) return false;
    return !terms.length || matchesSearch(r, terms);
  });
}
/** URL value of a type: its production code, `none` for the points without a type. */
export const typeParam = id => (id === '' ? 'none' : String(id));
export const typeIdOf = value => (value === 'none' ? '' : String(value));

/**
 * Totals for a selection: rows, known personnel, government offices with unknown personnel (a place, where personnel
 * does not apply, is neither), points, placement, types.
 */
export function summarize(rows) {
  let points = 0, placed = 0, provinced = 0, staff = 0, staffUnknownN = 0, shared = 0, offices = 0;
  const types = new Set(), areas = new Set(), provinces = new Set();
  for (const r of rows) {
    if (hasPoint(r)) points++;
    if (r.area) { placed++; areas.add(r.area); }
    if (r.province) { provinced++; provinces.add(r.province); }
    if (r.office) offices++;
    if (r.staff) staff += r.staff; else if (r.staffShared) shared++; else if (r.office) staffUnknownN++;
    if (r.type) types.add(r.type.id);
  }
  return {count: rows.length, offices, staff, staffUnknown: staffUnknownN, staffShared: shared, points, placed, provinced,
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
