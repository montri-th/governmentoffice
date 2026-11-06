/**
 * Reading-panel view models. Pure: no DOM, no map.
 *
 * Every profile reads `scopeRows` (filters before any area selection) so ranks and comparisons keep the whole
 * selection as reference. A row is one office of the production Government Officer dataset (a production point, or
 * the repeated points of one office); the default measure is offices (“แห่ง”), the other is the personnel production
 * records at the office. Types are production's own (gov_sub_office_id with production's labels); nothing is joined by
 * an office name at run time. District membership is the production district of the point's overlay subdistrict.
 *
 * Distances (nearby offices, nearest services, station surroundings) are straight lines between reference points,
 * computed here from the published coordinates; they are not walking routes, travel times, service areas or
 * catchments.
 */
import {mixOf, typeMixOf, hasPoint, valueOf, rowValue, railShare, staffUnknown, DEFAULT_METRIC} from './model.js';
import {summarizeAreas, byMetric, levelWords} from './areas.js';

const COLLATOR = new Intl.Collator('th');
/** Lists: the type's tier first (district offices, courts, stations…), then most personnel (unknown last), then name. */
export const listOrder = (a, b) => (a.type?.tier || 3) - (b.type?.tier || 3) || (b.staff || 0) - (a.staff || 0) ||
  COLLATOR.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371008.8, rad = Math.PI / 180;
  const p1 = lat1 * rad, p2 = lat2 * rad, dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Types present in rows, most of the measure first (then the other measure, then the type's order). */
export function typesIn(rows, limit = 12, metric = DEFAULT_METRIC) {
  const key = metric === 'staff' ? ['staff', 'count'] : ['count', 'staff'];
  return typeMixOf(rows).map(e => ({...e, value: e[key[0]]}))
    .sort((a, b) => b[key[0]] - a[key[0]] || b[key[1]] - a[key[1]] || a.type.index - b.type.index).slice(0, limit);
}

/** Districts of a selection ranked by the measure (ties: the other measure, then name). */
export function rankAreas(rows, index, {province = '', metric = DEFAULT_METRIC} = {}) {
  return summarizeAreas(rows, index, {province}).map(a => ({...a, value: valueOf(a, metric)})).sort(byMetric(metric));
}

/** Rows of the selection that no district holds, by reason (rows are never placed by name at run time). */
export function unplacedOf(rows) {
  let noArea = 0, noProvince = 0, staff = 0;
  for (const r of rows) {
    if (r.area) continue;
    staff += r.staff || 0;
    if (r.province) noArea++;
    else noProvince++;
  }
  return {noArea, noProvince, staff, total: noArea + noProvince};
}

const sum = (rows, metric) => rows.reduce((s, r) => s + rowValue(r, metric), 0);
/** Government offices among rows (personnel applies to them only). */
const officesIn = rows => rows.reduce((n, r) => n + (r.office ? 1 : 0), 0);

/** Recent moves and openings (06_RECENT_PROD_GAPS) of a province or district, newest first. */
export function eventsOf(events = [], {province = '', area = ''} = {}) {
  return events.filter(e => (!province || e.province === province) && (!area || e.district === area));
}

export function buildOverview(scopeRows, index, {province = '', groups = [], metric = DEFAULT_METRIC, events = []} = {}) {
  return {ranking: rankAreas(scopeRows, index, {province, metric}), types: typesIn(scopeRows, 12, metric), unplaced: unplacedOf(scopeRows),
    mix: mixOf(scopeRows, groups), count: scopeRows.length, offices: officesIn(scopeRows), staff: sum(scopeRows, 'staff'),
    staffUnknown: scopeRows.filter(staffUnknown).length, rail: railShare(scopeRows, metric),
    events: eventsOf(events, {province})};
}

/**
 * EVID-05 state of a selection: every district is in the national scope of production, so a district with no office
 * is a measured zero of this dataset (“0 ที่พบ”), never no_data.
 */
const selectionState = count => (count ? 'measured' : 'measured_zero');

/**
 * Stations whose 500 m straight-line radius holds the most of the measure among `rows` (each row counted at its
 * nearest operating station only, so the list never adds a row twice).
 */
export function stationsOf(rows, metric = DEFAULT_METRIC, m = 500, limit = 6) {
  const by = new Map();
  for (const r of rows) {
    if (!r.rail || r.rail.m > m) continue;
    const s = r.rail.station, e = by.get(s.id) || {station: s, count: 0, offices: 0, staff: 0, value: 0};
    e.count++; e.offices += r.office ? 1 : 0; e.staff += r.staff || 0; e.value += rowValue(r, metric); by.set(s.id, e);
  }
  return [...by.values()].sort((a, b) => b.value - a.value || COLLATOR.compare(a.station.name, b.station.name)).slice(0, limit);
}

export function buildAreaProfile(scopeRows, areaId, index, groups, {metric = DEFAULT_METRIC, events = []} = {}) {
  const area = index.byId.get(areaId);
  if (!area) return null;
  const ranking = rankAreas(scopeRows, index, {metric});
  const inProvince = ranking.filter(a => a.province === area.province);
  const mine = scopeRows.filter(r => r.area === areaId);
  const provinceRows = scopeRows.filter(r => r.province === area.province);
  const pos = ranking.findIndex(a => a.id === areaId);
  const posProvince = inProvince.findIndex(a => a.id === areaId);
  const value = sum(mine, metric), provinceValue = sum(provinceRows, metric);
  return {
    area, words: levelWords(area.province), metric, value, count: mine.length, offices: officesIn(mine), staff: sum(mine, 'staff'), staffUnknown: mine.filter(staffUnknown).length,
    km2: area.km2, coverageState: selectionState(mine.length), scopeCount: scopeRows.length,
    rank: pos >= 0 && value > 0 ? pos + 1 : null, rankOf: ranking.filter(a => a.value > 0).length,
    rankProvince: posProvince >= 0 && value > 0 ? posProvince + 1 : null, rankProvinceOf: inProvince.filter(a => a.value > 0).length,
    provinceValue, share: provinceValue ? (value / provinceValue) * 100 : null,
    points: mine.filter(hasPoint).length, ...mixOf(mine, groups), types: typesIn(mine, 12, metric),
    rail: railShare(mine, metric), stations: stationsOf(mine, metric), events: eventsOf(events, {area: areaId}),
    rows: [...mine].sort(listOrder),
  };
}

/** Type card: its offices and personnel in the scope, the provinces and districts that hold them. */
export function buildTypeProfile(typeId, {allRows, scopeRows, index, data, groups = [], metric = DEFAULT_METRIC}) {
  const type = data.types.find(t => t.id === typeId);
  if (!type) return null;
  const all = allRows.filter(r => r.type?.id === typeId);
  const inScope = scopeRows.filter(r => r.type?.id === typeId);
  return {type, all: all.length, allStaff: sum(all, 'staff'), scopeCount: inScope.length, offices: officesIn(inScope), scopeStaff: sum(inScope, 'staff'),
    staffUnknown: inScope.filter(staffUnknown).length, ...mixOf(inScope, groups), areas: rankAreas(inScope, index, {metric}),
    provinces: new Set(inScope.map(r => r.province).filter(Boolean)).size, points: inScope.filter(hasPoint).length,
    placed: inScope.filter(r => r.area).length, rail: railShare(inScope, metric), rows: [...inScope].sort(listOrder)};
}

/**
 * A building the map draws, with the rows whose points fall inside it (building-join.js):
 * sel = {key, kind: 'osm', rows, height}. Not an office's campus: no name.
 */
export function buildBuildingProfile(sel, index, groups) {
  if (!sel?.rows?.length) return null;
  const rows = [...sel.rows].sort(listOrder);
  const area = index.byId.get(rows[0].area) || null;
  const areaIds = [...new Set(rows.map(r => r.area))];
  return {key: sel.key, kind: sel.kind || 'osm', rows, count: rows.length, offices: officesIn(rows), staff: sum(rows, 'staff'), staffUnknown: rows.filter(staffUnknown).length,
    area, areaCount: areaIds.length, words: levelWords(rows[0].province), height: Number.isFinite(sel.height) ? sel.height : null,
    types: typesIn(rows, 6), ...mixOf(rows, groups)};
}

export const NEARBY_RADIUS_M = 2000;
export const NEARBY_LIMIT = 10;

/**
 * Offices round an office (a screening aid for siting and service planning, not a service area or a ranking): offices
 * of the same group with a point within NEARBY_RADIUS_M in a straight line, nearest first; everything round it (every
 * loaded row within the radius, any group) is stated beside it. Reads every loaded row (`allRows`), so the set does
 * not move with the filters.
 */
export function nearbyOf(row, allRows, {radius = NEARBY_RADIUS_M, limit = NEARBY_LIMIT} = {}) {
  if (!hasPoint(row)) return null;
  const dLat = radius / 110574, dLon = radius / (111320 * Math.cos((row.latitude * Math.PI) / 180));
  const near = [];
  let count = 0, staff = 0;
  const byGroup = new Map();
  for (const r of allRows) {
    if (r === row || !hasPoint(r)) continue;
    if (Math.abs(r.latitude - row.latitude) > dLat || Math.abs(r.longitude - row.longitude) > dLon) continue;
    const m = distanceM(row.latitude, row.longitude, r.latitude, r.longitude);
    if (m > radius) continue;
    count++; staff += r.staff || 0;
    byGroup.set(r.group, (byGroup.get(r.group) || 0) + 1);
    if (r.group === row.group) near.push({row: r, m});
  }
  near.sort((a, b) => a.m - b.m || listOrder(a.row, b.row));
  return {radius, around: {count, staff, byGroup}, matches: near.length, rows: near.slice(0, limit), rule: {group: row.group}};
}

/**
 * The services a site is usually checked against (owner question “รอบแปลงมีหน่วยงานอะไร”): for each, the nearest office
 * of those types with a point, straight line, within SERVICE_RADIUS_M; an empty slot says none within reach.
 * A slot applies to a point only in a province where the dataset types that service at all (`province`): production
 * types no district office, local government or court in Bangkok (its district offices and courts are untyped head
 * offices or absent), so a Bangkok site is never told that the nearest ที่ว่าการอำเภอ is in Nonthaburi.
 */
export const SERVICE_RADIUS_M = 30000;
export const SERVICES = Object.freeze([
  Object.freeze({id: 'district', th: 'ที่ว่าการอำเภอ', types: ['1010']}),
  Object.freeze({id: 'local', th: 'สำนักงานท้องถิ่น', types: ['1020', '1030', '1040', '1050', '1060']}),
  Object.freeze({id: 'police', th: 'สถานีตำรวจ', types: ['1070']}),
  Object.freeze({id: 'fire', th: 'สถานีดับเพลิง', types: ['1121']}),
  Object.freeze({id: 'court', th: 'ศาล', types: ['1182', '1192', '1202', '1152', '1162', '1172', '1210']}),
]);
const PRESENCE = new WeakMap();
/** Provinces in which the dataset types each service (cached per row array). */
export function servicePresence(allRows) {
  let p = PRESENCE.get(allRows);
  if (!p) {
    p = new Map(SERVICES.map(s => [s.id, new Set()]));
    const serviceOf = new Map(SERVICES.flatMap(s => s.types.map(t => [t, s.id])));
    for (const r of allRows) {
      if (!r.office || !r.province) continue;
      const id = serviceOf.get(r.type?.id);
      if (id) p.get(id).add(r.province);
    }
    PRESENCE.set(allRows, p);
  }
  return p;
}
export function nearestServicesOf(point, allRows, {radius = SERVICE_RADIUS_M, exclude = null, province = ''} = {}) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return [];
  const dLat = radius / 110574, dLon = radius / (111320 * Math.cos((point.lat * Math.PI) / 180));
  const present = province ? servicePresence(allRows) : null;
  const best = SERVICES.filter(s => !present || present.get(s.id).has(province)).map(s => ({service: s, types: new Set(s.types), row: null, m: Infinity}));
  for (const r of allRows) {
    if (r === exclude || !hasPoint(r) || !r.office) continue;
    if (Math.abs(r.latitude - point.lat) > dLat || Math.abs(r.longitude - point.lon) > dLon) continue;
    const slot = best.find(b => b.types.has(r.type?.id));
    if (!slot) continue;
    const m = distanceM(point.lat, point.lon, r.latitude, r.longitude);
    if (m <= radius && (m < slot.m || (m === slot.m && r.id < slot.row.id))) { slot.row = r; slot.m = m; }
  }
  return best.map(b => ({service: b.service, row: b.row, m: b.row ? b.m : null}));
}

/** Office detail: nearby offices of its group, the nearest services, its district's other offices and its events. */
export function buildOfficeDetail(row, {scopeRows, allRows, rowById = null, index, groups, building = null}) {
  if (!row) return null;
  const area = row.area ? index.byId.get(row.area) || null : null;
  const sameArea = row.area ? scopeRows.filter(r => r.area === row.area && r.id !== row.id) : [];
  const shared = row.staffShared ? (rowById ? rowById(row.staffShared) : allRows.find(r => r.id === row.staffShared)) || null : null;
  return {row, area, words: levelWords(row.province), group: groups[row.group], building, shared,
    nearby: nearbyOf(row, allRows), services: hasPoint(row) ? nearestServicesOf({lat: row.latitude, lon: row.longitude}, allRows, {exclude: row, province: row.province}) : [],
    sameArea: {count: sameArea.length, staff: sum(sameArea, 'staff')}, events: row.events || []};
}

export const STATION_RADIUS_M = 500;

/**
 * A rail station of CityMETER · Transit and the offices whose points lie within STATION_RADIUS_M of its reference
 * point (straight line; an office near two stations is listed at both — this view never adds stations together).
 * The nearest services read every loaded row (`allRows`), so they do not move with the filters.
 */
export function buildStationProfile(station, {scopeRows, allRows = scopeRows, groups, radius = STATION_RADIUS_M, metric = DEFAULT_METRIC, province = ''}) {
  if (!station) return null;
  const rows = [];
  const dLat = radius / 110574, dLon = radius / (111320 * Math.cos((station.lat * Math.PI) / 180));
  for (const r of scopeRows) {
    if (!hasPoint(r) || Math.abs(r.latitude - station.lat) > dLat || Math.abs(r.longitude - station.lon) > dLon) continue;
    const m = distanceM(station.lat, station.lon, r.latitude, r.longitude);
    if (m <= radius) rows.push({row: r, m});
  }
  rows.sort((a, b) => listOrder(a.row, b.row));
  const list = rows.map(x => x.row);
  return {station, radius, metric, count: list.length, offices: officesIn(list), staff: sum(list, 'staff'), staffUnknown: list.filter(staffUnknown).length,
    value: sum(list, metric), ...mixOf(list, groups), types: typesIn(list, 8, metric), rows: list,
    services: nearestServicesOf({lat: station.lat, lon: station.lon}, allRows, {province}),
    distance: new Map(rows.map(x => [x.row.id, x.m]))};
}
