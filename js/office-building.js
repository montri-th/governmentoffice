/**
 * The building of an office: which drawn building the camera turns to, and where Street View stands to face it.
 *
 * Release 0.3.0, owner 2026-11-06 (CityMETER · Government Office): “ทำไมจุดในภาพถึงเลือกอาคารผิด … อยากให้พี่หาเคสที่
 * spatial join ผิดให้เจอ … แต่ละแบบควรแก้อย่างไรถึงจะดีที่สุด แล้วลงมือปรับแก้” and “streetview ถ้าเลือกแล้วต้องให้หันหน้า
 * เข้าหาอาคารด้วยนะ”. Up to 0.2.0 the camera took the drawn building holding the pin, however small — the Juvenile and
 * Family Court of Ubon Ratchathani turned to a 104 m² coffee shop at its gate while the 1,413 m² court stands 45 m
 * behind it — and, when the pin fell in no building, the nearest one. A production point is where a researcher dropped
 * the pin: on the building, at the gate, on the drive, on the lawn, across the road. Measured against the buildings
 * OpenStreetMap names for 946 offices (docs/BUILDING_CHOICE.md): 58 % of the pins stand in no building, 13 % are more
 * than 150 m from the named building, and the 0.2.0 rule picked the named building for 63 % of the offices whose
 * named building stands within 150 m of the pin.
 *
 * chooseBuilding scores every drawn building within the reach of the pin (pieces grouped as js/building-join.js groups
 * them; footprints as js/massing.js keeps them) and keeps the best — a conditional-logit fit on those offices
 * (docs/BUILDING_CHOICE.md §3):
 *   - name: an OpenStreetMap point of interest of the office's kind within POI_REACH_M of the pin, named as the office
 *     (OpenFreeMap tiles, the same the map draws), lends the building holding it CHOICE.name — decisive within reach;
 *   - pin: +CHOICE.pin when the pin falls inside the building;
 *   - distance: −d / CHOICE.lambdaM, d the pin's distance to the outline (0 inside);
 *   - road: −CHOICE.across when a street (OpenFreeMap `transportation`, not a service road or a track) runs between
 *     the pin and the building — a pin and its building stand on the same side of the street;
 *   - size, for a type with a floor in TYPE_FOOTPRINT_M2 (district offices, municipalities, police stations, courts,
 *     prisons, camps …; never a police box, a village office, a shrine, or the places of the other groups):
 *     CHOICE.size·ln(area / floor) below the floor, CHOICE.area·ln(area / 300 m²) for every building (an office's
 *     own building is the large one of its compound), and +CHOICE.setback per 25 m it stands back from the street
 *     (up to 60 m; the shops and kiosks of a compound line the street).
 * It stays a camera choice — named “อาคารที่หมุดตก” only when the pin falls in it, else “อาคารใกล้หมุด” — never a
 * join, a count or a located-in claim (the building panel still lists the pins inside its outline,
 * js/building-join.js#joinRows).
 *
 * streetViewOf puts Street View on the street in front of that building and turns it to face the building (Google
 * Maps URLs: map_action=pano, viewpoint, heading, pitch).
 *
 * Pure: no map, no DOM. js/app.js passes the drawn footprints, POIs and streets (js/massing.js); the audit
 * (scripts/audit-building-choice.mjs) runs the same code over CityMETER Building V4 tiles.
 */
import {pointInRing} from './geometry.js';

/**
 * Footprint floor (m²) of the main building of a government-office type: a building below it loses
 * CHOICE.size·ln(floor/area). Fitted with the other weights (docs/BUILDING_CHOICE.md §3, twice the first guesses
 * fitted best). A type not listed — a police box, an unclassified office, every place of education, religion and
 * community (no reference buildings to fit them on) — has no size term.
 */
export const TYPE_FOOTPRINT_M2 = Object.freeze({
  // Administration and local government
  1010: 800, // ที่ว่าการอำเภอ
  1050: 1200, // เทศบาลนคร
  1040: 800, // เทศบาลเมือง
  1030: 500, // เทศบาลตำบล
  1020: 400, // องค์การบริหารส่วนตำบล
  1060: 800, // ท้องถิ่นรูปแบบพิเศษ
  // Police, fire
  1070: 500, // สถานีตำรวจ
  1090: 600, // ศูนย์ฝึกอบรมตำรวจ
  1121: 240, // สถานีดับเพลิง
  // Justice
  1142: 800, 1152: 1600, 1162: 1200, 1172: 1200, 1182: 1200, 1192: 1000, 1202: 1000, 1210: 1200,
  1130: 600, // เรือนจำ/ทัณฑสถาน
  // Military
  1100: 400, 1110: 400,
});

/** Scoring weights (docs/BUILDING_CHOICE.md §3; λ, setback in metres). */
export const CHOICE = Object.freeze({pin: 0.9, lambdaM: 23, across: 1.15, size: 1.25, area: 0.45, setback: 0.3, name: 6, nameMin: 0.72, slackM: 10});
/**
 * Types that are a kiosk themselves (a police box or service point, an administrative checkpoint): the nearest
 * building. Every other type without a footprint floor keeps the 0.2.0 tie-break — among the buildings scoring within
 * CHOICE.slackM of distance of the best, the largest (“an office block before a kiosk beside the pin”).
 */
export const KIOSK_TYPES = new Set(['1080', '4043']);
/** A point of interest named as the office lends its name within this distance of the pin … */
export const POI_REACH_M = 150;
/** … and, when the name is the office's own word for word and no other office carries it, within this distance — a pin
 *  dropped far from the building OpenStreetMap names (13 % of the named offices are more than 150 m from it). */
export const POI_FAR_M = 800;
/** The name weight fades with a building's distance from the point (exp(−d/POI_FADE_M)): a point in the open of a
 *  compound lends most to the buildings next to it. */
export const POI_FADE_M = 15;
/** OpenMapTiles `poi` classes that can be an office or a place itself (never a bus stop, a shop, a restaurant …). */
export const POI_CLASSES = new Set(['town_hall', 'office', 'police', 'fire_station', 'prison', 'military', 'school', 'college',
  'library', 'museum', 'place_of_worship', 'religion', 'cemetery', 'monument', 'castle', 'hospital', 'community_centre']);
/** Streets that part a pin from a building (OpenMapTiles `transportation`): not a service road, a track or a path. */
export const PARTING_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']);

const ABBREVIATIONS = [
  [/สภ\.\s*/g, 'สถานีตำรวจภูธร'], [/สน\.\s*/g, 'สถานีตำรวจนครบาล'],
  [/อบต\.\s*/g, 'องค์การบริหารส่วนตำบล'], [/อบจ\.\s*/g, 'องค์การบริหารส่วนจังหวัด'],
  [/ทต\.\s*/g, 'เทศบาลตำบล'], [/ทม\.\s*/g, 'เทศบาลเมือง'], [/ทน\.\s*/g, 'เทศบาลนคร'],
  [/(^|[\s(])จ\.\s*/g, '$1จังหวัด'], [/(^|[\s(])อ\.\s*/g, '$1อำเภอ'], [/(^|[\s(])ต\.\s*/g, '$1ตำบล'],
];
/** An office name as words to compare: abbreviations spelled out, “เเ” as “แ”, no spaces, punctuation or case. */
export function normaliseName(s) {
  let t = String(s ?? '').normalize('NFC').replace(/[​-‍﻿]/g, '').replace(/เเ/g, 'แ');
  for (const [re, to] of ABBREVIATIONS) t = t.replace(re, to);
  return t.toLowerCase().replace(/[\s()[\]{}.,\-–—_'"“”‘’/\\:;!?]+/g, '');
}
const bigrams = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
/** 0…1: character-bigram Dice of the normalised names; one name inside the other (≥ 8 characters) reads 0.9. */
export function nameSimilarity(a, b) {
  const x = normaliseName(a), y = normaliseName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ga = bigrams(x), gb = bigrams(y);
  let common = 0;
  for (const [g, n] of ga) common += Math.min(n, gb.get(g) || 0);
  const dice = (2 * common) / Math.max(1, x.length - 1 + y.length - 1);
  const shorter = x.length < y.length ? x : y, longer = shorter === x ? y : x;
  return longer.includes(shorter) && shorter.length >= 8 ? Math.max(dice, 0.9) : dice;
}

/** Local plane at a latitude: metres per degree. */
const scaleAt = lat => [111320 * Math.cos((lat * Math.PI) / 180), 110574];
const bboxOf = ring => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
};
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Area (m²) of a lon/lat ring on the local plane. */
function areaM2(ring, kx, ky) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] + ring[i][0]) * kx * (ring[j][1] - ring[i][1]) * ky;
  return Math.abs(s / 2);
}
/** Pin → piece: inside (outer, not in a hole) and the distance to its outline (0 inside). */
function measure(p, [lon, lat], kx, ky) {
  const holes = p.holes || [];
  const inHole = holes.find(h => pointInRing([lon, lat], h));
  const inside = !inHole && pointInRing([lon, lat], p.outer);
  if (inside) return {inside, d: 0};
  let d = Infinity;
  const px = lon * kx, py = lat * ky;
  for (const ring of inHole ? [inHole] : [p.outer, ...holes]) {
    for (let i = 0; i < ring.length - 1; i++) d = Math.min(d, segDist(px, py, ring[i][0] * kx, ring[i][1] * ky, ring[i + 1][0] * kx, ring[i + 1][1] * ky));
  }
  return {inside, d};
}

/**
 * The drawn buildings round a point, one record per building (pieces grouped by `keyOfPiece`): {key, pieces (ids),
 * pieceId (the piece nearest the point), d (m to the outline, 0 inside), inside, area (m², the outline of a building
 * mapped in parts, else the sum of its pieces), at ([lon, lat], the vertex mean of its largest piece)}, within `maxM`.
 */
export function buildingsNear(pieces, [lon, lat], {keyOfPiece = null, maxM = 300} = {}) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
  const [kx, ky] = scaleAt(lat), dLon = maxM / kx, dLat = maxM / ky;
  const groups = new Map();
  for (const p of pieces || []) {
    if (!Array.isArray(p?.outer) || p.outer.length < 4) continue;
    const [w, s, e, n] = p.bbox || bboxOf(p.outer);
    if (lon < w - dLon || lon > e + dLon || lat < s - dLat || lat > n + dLat) continue;
    const {inside, d} = measure(p, [lon, lat], kx, ky);
    const key = keyOfPiece?.get(p.id) ?? `piece:${p.id}`;
    const area = areaM2(p.outer, kx, ky);
    let g = groups.get(key);
    if (!g) groups.set(key, g = {key, pieces: [], rings: [], pieceId: p.id, d: Infinity, inside: false, partsArea: 0, outlineArea: 0, main: null, mainArea: -1});
    g.pieces.push(p.id); g.rings.push(p.outer);
    if (p.outline) g.outlineArea = Math.max(g.outlineArea, area); else g.partsArea += area;
    if (area > g.mainArea) { g.mainArea = area; g.main = p.outer; }
    if (inside) g.inside = true;
    if (d < g.d || (d === g.d && !p.outline)) { g.d = d; g.pieceId = p.id; }
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.d > maxM) continue;
    const n = Math.max(1, g.main.length - 1);
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) { x += g.main[i][0]; y += g.main[i][1]; }
    out.push({key: g.key, pieces: g.pieces, rings: g.rings, pieceId: g.pieceId, d: g.d, inside: g.inside, area: g.outlineArea || g.partsArea, at: [x / n, y / n]});
  }
  return out;
}

/** Distance (m) from a point to a building's outline (0 inside). */
function distanceTo(b, [lon, lat]) {
  const [kx, ky] = scaleAt(lat);
  let d = Infinity;
  for (const ring of b.rings) d = Math.min(d, measure({outer: ring}, [lon, lat], kx, ky).d);
  return d;
}

/**
 * The point of interest named as the office, of a kind that can be the office itself: name similarity ≥ nameMin
 * within POI_REACH_M of the pin, or the office's own name (≥ 0.95) within POI_FAR_M when `office.uniqueName` (no other
 * office of the data carries it). → {lon, lat, name, cls, sub, sim, dm} | null.
 */
export function namedPoi(office, pois, {nameMin = CHOICE.nameMin} = {}) {
  if (!pois?.length || !office?.name) return null;
  const [kx, ky] = scaleAt(office.latitude);
  let best = null;
  for (const q of pois) {
    if (!Number.isFinite(q?.lon) || !Number.isFinite(q?.lat) || !q.name) continue;
    if (q.cls && !POI_CLASSES.has(q.cls) && !POI_CLASSES.has(q.sub)) continue;
    const dm = Math.hypot((q.lon - office.longitude) * kx, (q.lat - office.latitude) * ky);
    if (dm > POI_FAR_M) continue;
    const sim = nameSimilarity(office.name, q.name);
    if (sim < nameMin || (dm > POI_REACH_M && !(sim >= 0.95 && office.uniqueName))) continue;
    if (!best || sim > best.sim + 1e-9 || (Math.abs(sim - best.sim) <= 1e-9 && dm < best.dm)) best = {...q, sim, dm};
  }
  return best;
}

const cross = (a, b, c, d) => {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
/** Streets that can part a pin from a building, on the local plane of the pin ([[x, y]…] metres). */
function partingStreets(roads, [lon, lat], kx, ky, reachM) {
  const out = [];
  for (const r of roads || []) {
    if (!PARTING_CLASSES.has(r?.cls) || !Array.isArray(r.coords)) continue;
    const line = r.coords.map(([x, y]) => [(x - lon) * kx, (y - lat) * ky]);
    if (line.some(([x, y]) => Math.abs(x) <= reachM && Math.abs(y) <= reachM)) out.push(line);
  }
  return out;
}

/**
 * The building the camera turns to for an office. office: {longitude, latitude, typeId (production type code), name};
 * pieces/keyOfPiece as js/building-join.js#joinBuildings; pois: [{lon, lat, name, cls, sub}] and roads: [{cls, coords}]
 * of the same basemap tiles (js/massing.js#streetsAndNames); maxM: the reach (js/app.js: 300 m, 800 m once when
 * nothing is drawn within it).
 * → {key, pieceId, distanceM, inside (the pin falls in it), why: 'name'|'pin'|'size'|'near', areaM2, poi} | null.
 * why: 'name' — the building at the office's named point of interest (`poi`: where and how far from the pin); 'pin' — the building the pin falls in;
 * 'near' — the nearest building; 'size' — another building, chosen for its size, its setback or its side of the street.
 */
export function chooseBuilding(pieces, office, {keyOfPiece = null, pois = [], roads = [], maxM = 300, weights = CHOICE, footprints = TYPE_FOOTPRINT_M2} = {}) {
  const lon = office?.longitude, lat = office?.latitude;
  const list = buildingsNear(pieces, [lon, lat], {keyOfPiece, maxM});
  if (!list.length) return null;
  const floor = Number(footprints[office.typeId]) || 0;
  const poi = namedPoi(office, pois, weights);
  const named = b => (poi && b.poiD <= 12 ? b.key : null);
  // Without the streets: name, pin, distance, size.
  for (const b of list) {
    b.poiD = poi ? distanceTo(b, [poi.lon, poi.lat]) : Infinity;
    // With a named point the office stands at the pin or at the point: distance counts from the nearer of the two.
    let s = -Math.min(b.d, b.poiD) / weights.lambdaM + (b.inside ? weights.pin : 0) + (b.poiD <= 3 * POI_FADE_M ? weights.name * Math.exp(-b.poiD / POI_FADE_M) : 0);
    if (floor > 0) s += (b.area < floor ? weights.size * Math.log(Math.max(b.area, 1) / floor) : 0) + weights.area * Math.log(Math.max(b.area, 10) / 300);
    b.score = s;
  }
  // The streets move a score by at most `across` down and `setback`·60/25 up: only the buildings within that swing of
  // the best can still win, so only they are measured against the streets.
  const [kx, ky] = scaleAt(lat);
  const top = Math.max(...list.map(b => b.score)), swing = weights.across + (floor > 0 ? (weights.setback * 60) / 25 : 0);
  const streets = roads?.length ? partingStreets(roads, [lon, lat], kx, ky, maxM + 100) : [];
  if (streets.length) {
    for (const b of list) {
      if (b.score < top - swing - 1e-9) continue;
      const at = [(b.at[0] - lon) * kx, (b.at[1] - lat) * ky];
      if (!b.inside && streets.some(line => line.some((p, i) => i > 0 && cross([0, 0], at, line[i - 1], p)))) b.score -= weights.across;
      if (floor > 0) {
        let back = 60;
        for (const ring of b.rings) for (const [x, y] of ring) {
          const px = (x - lon) * kx, py = (y - lat) * ky;
          for (const line of streets) for (let i = 1; i < line.length && back > 0; i++) back = Math.min(back, segDist(px, py, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]));
        }
        b.score += (weights.setback * back) / 25;
      }
    }
  }
  let pick = null;
  for (const b of list) if (!pick || b.score > pick.score + 1e-9 || (Math.abs(b.score - pick.score) <= 1e-9 && (b.d < pick.d || (b.d === pick.d && b.area > pick.area)))) pick = b;
  if (floor === 0 && !KIOSK_TYPES.has(String(office.typeId ?? '')) && pick.key !== named(pick)) {
    const slack = weights.slackM / weights.lambdaM;
    for (const b of list) if (b.score >= pick.score - slack - 1e-9 && b.area > pick.area && !b.inside === !pick.inside) pick = b;
  }
  const nearest = list.reduce((a, b) => (b.d < a.d || (b.d === a.d && b.area > a.area) ? b : a));
  const closest = poi ? list.reduce((a, b) => (b.poiD < a.poiD ? b : a)) : null;
  const why = poi && pick.poiD <= 3 * POI_FADE_M && (pick.key === closest.key || pick.poiD <= 12) ? 'name'
    : pick.inside ? 'pin' : pick.key === nearest.key && !list.some(b => b.inside) ? 'near' : 'size';
  return {key: pick.key, pieceId: pick.pieceId, distanceM: Math.round(pick.d * 10) / 10, inside: pick.inside, why, areaM2: Math.round(pick.area),
    poi: poi ? {lon: poi.lon, lat: poi.lat, name: poi.name, distanceM: Math.round(poi.dm)} : null};
}

/* ---------- Street View facing the building ---------- */

/** Road classes Street View drives (OpenMapTiles `transportation`): never paths, tracks, rail or ferries. */
export const STREET_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']);
/** Roads farther than this from the building are never its frontage. */
export const FRONTAGE_REACH_M = 120;
/** A pin within this distance of the building marks its gate: the street the pin stands on is its frontage. */
export const GATE_M = 60;

/** Area-weighted centroid of a lon/lat ring (vertex mean when degenerate). */
function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  const [x0, y0] = ring[0];
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] - x0, y1 = ring[i][1] - y0, x2 = ring[i + 1][0] - x0, y2 = ring[i + 1][1] - y0;
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const n = Math.max(1, ring.length - 1);
    return [ring.slice(0, n).reduce((s, p) => s + p[0], 0) / n, ring.slice(0, n).reduce((s, p) => s + p[1], 0) / n];
  }
  return [x0 + cx / (3 * a), y0 + cy / (3 * a)];
}

/** Compass bearing (0–360°, clockwise from north) from a to b on the local plane. */
export function bearingDeg([lon1, lat1], [lon2, lat2]) {
  const [kx, ky] = scaleAt((lat1 + lat2) / 2);
  const b = (Math.atan2((lon2 - lon1) * kx, (lat2 - lat1) * ky) * 180) / Math.PI;
  return Math.round(((b % 360) + 360) % 360);
}

/**
 * Street View in front of a building, turned to face it.
 * rings: the building's outer rings ([[lon, lat]…], pieces as drawn); height: its height (m); pin: the office's point;
 * roads: [{cls, brunnel?, coords: [[lon, lat]…]}].
 * The viewpoint is the point of a public street nearest the building's centre (a service road — a compound's drive or car
 * park — a motorway or a bridge only when none is near), counting the way from the pin too: in full when the pin stands at
 * the building (within GATE_M — dropped at the gate, it marks the street people come in from), a quarter otherwise; without a street within
 * FRONTAGE_REACH_M, the pin itself when it stands outside the building. heading = bearing viewpoint → centre; pitch
 * lifts the view for a tall building close by.
 * → {lat, lon, heading, pitch, from: 'road'|'pin'} | null (nothing to face it from).
 */
export function streetViewOf(rings, height, pin, roads = []) {
  const usable = (rings || []).filter(r => Array.isArray(r) && r.length >= 4);
  if (!usable.length) return null;
  let main = usable[0], mainA = -1;
  for (const r of usable) { const [kx, ky] = scaleAt(r[0][1]); const a = areaM2(r, kx, ky); if (a > mainA) { mainA = a; main = r; } }
  let target = centroid(main);
  if (!pointInRing(target, main)) target = main[Math.floor((main.length - 1) / 2)];
  const [kx, ky] = scaleAt(target[1]);
  const tx = target[0] * kx, ty = target[1] * ky;
  const hasPin = Array.isArray(pin) && Number.isFinite(pin[0]) && Number.isFinite(pin[1]);
  const pinInside = hasPin && usable.some(r => pointInRing(pin, r));
  // A pin at the building (inside or within GATE_M) marks the side people come in from: its street counts in full.
  const pinD = !hasPin ? Infinity : pinInside ? 0 : Math.min(...usable.map(r => measure({outer: r}, pin, kx, ky).d));
  const wPin = pinD <= GATE_M ? 1 : 0.25;
  // Public streets at ground level first; a service road (a compound's drive or car park, rarely a panorama), a
  // motorway or a bridge (an elevated view) only when none is near.
  let best = null;
  for (const road of roads || []) {
    if (!STREET_CLASSES.has(road?.cls) || road.brunnel === 'tunnel' || !Array.isArray(road.coords)) continue;
    const penalty = road.cls === 'service' || road.cls === 'motorway' || road.brunnel === 'bridge' ? 1000 : 0;
    const c = road.coords;
    for (let i = 0; i < c.length - 1; i++) {
      const ax = c[i][0] * kx, ay = c[i][1] * ky, bx = c[i + 1][0] * kx, by = c[i + 1][1] * ky;
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((tx - ax) * dx + (ty - ay) * dy) / (dx * dx + dy * dy || 1)));
      const qx = ax + t * dx, qy = ay + t * dy, dT = Math.hypot(qx - tx, qy - ty);
      if (dT > FRONTAGE_REACH_M || dT < 3) continue;
      const q = [qx / kx, qy / ky];
      if (usable.some(r => pointInRing(q, r))) continue; // a street under the building (an arcade) shows its inside
      const dP = hasPin ? Math.hypot(qx - pin[0] * kx, qy - pin[1] * ky) : 0;
      const cost = dT + wPin * dP + penalty;
      if (!best || cost < best.cost) best = {cost, q, dT};
    }
  }
  let from = null, view = null, dist = 0;
  if (best) { view = best.q; dist = best.dT; from = 'road'; }
  else if (hasPin && !pinInside) {
    dist = Math.hypot(pin[0] * kx - tx, pin[1] * ky - ty);
    if (dist >= 8) { view = pin; from = 'pin'; }
  }
  if (!view) return null;
  const h = Math.min(Number(height) || 6, 40);
  const pitch = Math.max(0, Math.min(20, Math.round((Math.atan2(h * 0.45 - 2.5, Math.max(dist, 5)) * 180) / Math.PI)));
  return {lat: view[1], lon: view[0], heading: bearingDeg(view, target), pitch, from};
}
