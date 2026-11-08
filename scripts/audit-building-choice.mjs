#!/usr/bin/env node
/**
 * Audit of the building the camera turns to for each government office (owner 2026-11-06: “อยากให้พี่หาเคสที่
 * spatial join ผิดให้เจอว่ามีรายการไหนบ้าง มีสาเหตุกี่แบบ”), over the buildings the page draws inside a CityMETER unit:
 * CityMETER Building V4 tiles of the production tile API (the URLs js/shell/building-units.js#cmTileUrl requests), read at
 * z16 round each office (± REACH_M) instead of z14 — the same buildings, a sixteenth of the work for the API.
 *
 * For every office whose ± REACH_M square meets a CityMETER unit it runs the page's code on the same footprints
 * (js/massing.js#shapeCmTile → js/shell/building-join.js#joinBuildings):
 *   - 0.2.0: the building holding the pin (the smallest piece), else the nearest (js/shell/building-join.js#nearestBuilding);
 *   - 0.3.0: js/office-building.js#chooseBuilding (distance, pin, the type's smallest footprint; OpenStreetMap names
 *     are not in these tiles — the page adds them from the basemap).
 * and writes one JSON line per office (old and new building: area, distance, inside) with the cause of a change
 * (docs/BUILDING_CHOICE.md §2), plus a summary.
 *
 *   node scripts/audit-building-choice.mjs --tiles <cache dir> --out <dir> [--fetch] [--truth truth.json]
 *
 * --fetch reads missing tiles from the production API (4 at a time) into the cache; without it a missing tile is
 * reported and its office skipped. --truth adds the accuracy of both rules against reference buildings
 * ({key: {kind: 'B'|'N'|'C', x, y | ring}} in metres from the pin; docs/BUILDING_CHOICE.md §4).
 */
import {readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync} from 'node:fs';
import {gunzipSync, gzipSync} from 'node:zlib';
import {parseVectorTile, tilesForBBox} from '../js/shell/mvt.js';
import {shapeCmTile} from '../js/massing.js';
import {joinBuildings, nearestBuilding} from '../js/shell/building-join.js';
import {zonesOf, cmTileUrl} from '../js/shell/building-units.js';
import {chooseBuilding, buildingsNear, TYPE_FOOTPRINT_M2} from '../js/office-building.js';
import {ringsIntersect, pointInRing} from '../js/shell/geometry.js';

const REACH_M = 150, Z = 16;
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const flag = name => process.argv.includes(name);
const root = new URL('..', import.meta.url).pathname;
const tilesDir = arg('--tiles'), outDir = arg('--out'), truthFile = arg('--truth');
if (!tilesDir || !outDir) { console.error('usage: --tiles <dir> --out <dir> [--fetch] [--truth file]'); process.exit(2); }
mkdirSync(tilesDir, {recursive: true}); mkdirSync(outDir, {recursive: true});

/* ---------- offices and units ---------- */
const data = JSON.parse(readFileSync(`${root}data/offices.json`, 'utf8'));
const c = data.cols;
const offices = c.key.map((key, i) => ({key, name: c.name[i], typeId: data.types[c.type[i]].id, typeTh: data.types[c.type[i]].th,
  longitude: c.lon[i], latitude: c.lat[i], district: data.districts[c.district[i]] ?? ''}));
const zones = [];
for (const f of readdirSync(`${root}data/building-units`)) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  zones.push(...zonesOf(JSON.parse(readFileSync(`${root}data/building-units/${f}`, 'utf8'))));
}
const square = (lon, lat, m) => {
  const dy = m / 110574, dx = m / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy]];
};
const boxRing = ([w, s, e, n]) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const meets = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const lonOf = (x, z) => (x / 2 ** z) * 360 - 180, latOf = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const tileBox = t => [lonOf(t.x, t.z), latOf(t.y + 1, t.z), lonOf(t.x + 1, t.z), latOf(t.y, t.z)];
const zoneMeets = (z, ring) => z.polygons.some(p => ringsIntersect(p[0], ring));

/** The tile requests of one office: z16 tiles of its square × the tile units of the units meeting it. */
function requestsOf(o) {
  const sq = square(o.longitude, o.latitude, REACH_M), box = [sq[0][0], sq[0][1], sq[2][0], sq[2][1]];
  const hit = zones.filter(z => meets(z.bbox, box) && zoneMeets(z, sq));
  if (!hit.length) return {sq, reqs: [], inZone: false};
  const inZone = hit.some(z => z.polygons.some(p => pointInRing([o.longitude, o.latitude], p[0]) && !p.slice(1).some(h => pointInRing([o.longitude, o.latitude], h))));
  const reqs = [];
  for (const t of tilesForBBox(box, Z)) {
    const tb = tileBox(t), part = [Math.max(tb[0], box[0]), Math.max(tb[1], box[1]), Math.min(tb[2], box[2]), Math.min(tb[3], box[3])];
    for (const z of hit) {
      if (!zoneMeets(z, boxRing(part))) continue;
      for (const tu of z.tileUnits) if (meets(tu.bbox, part)) reqs.push({tile: t, tileUnit: tu, tileType: z.tileType, file: `${tilesDir}/${t.z}_${t.x}_${t.y}_${tu.id}.pbf.gz`});
    }
  }
  return {sq, reqs, inZone};
}

/* ---------- tiles ---------- */
const missing = [];
async function fetchMissing(list) {
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const q = list[next++];
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const r = await fetch(cmTileUrl(q.tile, q.tileUnit, q.tileType));
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          writeFileSync(q.file, gzipSync(Buffer.from(await r.arrayBuffer())));
          break;
        } catch (e) { if (attempt === 3) console.warn('tile failed', q.file, e.message); else await new Promise(res => setTimeout(res, 2000 * (attempt + 1))); }
      }
    }
  };
  await Promise.all(Array.from({length: 4}, worker));
}
const decoded = new Map();
function layerOf(file) {
  if (decoded.has(file)) return decoded.get(file);
  const buf = gunzipSync(readFileSync(file));
  const layer = buf.length ? parseVectorTile(buf).layers['building-detail'] || {extent: 4096, features: []} : {extent: 4096, features: []};
  decoded.set(file, layer);
  if (decoded.size > 400) decoded.delete(decoded.keys().next().value);
  return layer;
}

/* ---------- causes ---------- */
/**
 * Why the 0.2.0 building differs from 0.3.0's (docs/BUILDING_CHOICE.md §2):
 *  A pin_in_other — the pin falls in a building (a shop, a kiosk, a guardhouse, the neighbour) and 0.3.0 turns to
 *    another one: larger for the type, set back from the street, on the pin's side;
 *  B nearest_not_it — the pin falls in no building and 0.3.0 turns to another than the nearest;
 * and for every office, whatever the rule picks (flags, not changes):
 *  D nothing_near — nothing drawn within REACH_M of the pin (the pin is off, or the building is missing from the data);
 *  F no_plausible — buildings near the pin, none of half the type's footprint floor within REACH_M (the office's
 *    building missing from the data, or the pin far from it).
 * `outside`: the pin falls in no building (the camera's building is “อาคารใกล้หมุด”).
 */
function causeOf(o, oldB, newB, list) {
  const floor = Number(TYPE_FOOTPRINT_M2[o.typeId]) || 0;
  if (!list.length) return 'D';
  if (oldB && newB && oldB.key !== newB.key) return oldB.inside ? 'A' : 'B';
  if (floor > 0 && !list.some(b => b.area >= floor / 2)) return 'F';
  return '';
}

/* ---------- run ---------- */
const truth = truthFile ? JSON.parse(readFileSync(truthFile, 'utf8')) : null;
// --dump: the candidate buildings of every office with a reference building (for fitting the weights, §3).
const dump = flag('--dump') ? [] : null;
const planned = offices.map(o => ({o, ...requestsOf(o)})).filter(p => p.reqs.length);
for (const p of planned) for (const q of p.reqs) if (!existsSync(q.file)) missing.push(q);
const uniqueMissing = [...new Map(missing.map(q => [q.file, q])).values()];
if (uniqueMissing.length && flag('--fetch')) { console.error(`fetching ${uniqueMissing.length} tiles`); await fetchMissing(uniqueMissing); }
// Spatial order keeps the decoded tiles of neighbours in the cache.
planned.sort((a, b) => a.reqs[0].file.localeCompare(b.reqs[0].file));
const lines = [], counts = {offices: 0, inZone: 0, skipped: 0, changed: 0, outside: 0, causes: {A: 0, B: 0, D: 0, F: 0}, byType: {}};
const acc = {n: 0, old: 0, new: 0, byKind: {}};
const seenKeys = new Set();
for (const {o, sq, reqs, inZone} of planned) {
  if (reqs.some(q => !existsSync(q.file))) { counts.skipped++; continue; }
  const seen = new Set(), pieces = [];
  for (const q of reqs) {
    const shaped = shapeCmTile(q.tile, layerOf(q.file), {regions: [sq], radiusM: 3, offsetM: 1.2, slot: q.tileUnit.slot ?? 0, seen});
    pieces.push(...shaped.footprints);
  }
  const row = {id: o.key, longitude: o.longitude, latitude: o.latitude};
  const join = joinBuildings(pieces, [row], []);
  const insideKey = join.byRow.get(o.key) || null;
  const list = buildingsNear(pieces, [o.longitude, o.latitude], {keyOfPiece: join.keyOfPiece, maxM: REACH_M});
  const rec = key => { const b = list.find(x => x.key === key); return b ? {key, inside: b.inside, d: Math.round(b.d * 10) / 10, area: Math.round(b.area)} : null; };
  const near = insideKey ? null : nearestBuilding(pieces, [o.longitude, o.latitude], {keyOfPiece: join.keyOfPiece, maxM: REACH_M});
  const oldB = rec(insideKey || near?.key || null);
  const pick = chooseBuilding(pieces, o, {keyOfPiece: join.keyOfPiece, maxM: REACH_M});
  const newB = pick ? {...rec(pick.key), why: pick.why} : null;
  const cause = causeOf(o, oldB, newB, list);
  counts.offices++; if (inZone) counts.inZone++; if (list.length && !list.some(b => b.inside)) counts.outside++;
  if (cause) counts.causes[cause]++;
  if (oldB?.key !== newB?.key) counts.changed++;
  const t = (counts.byType[o.typeId] ||= {th: o.typeTh, offices: 0, A: 0, B: 0, D: 0, F: 0});
  t.offices++; if (cause) t[cause]++;
  const line = {key: o.key, name: o.name, type: o.typeId, district: o.district, inZone, outside: !list.some(b => b.inside), buildings: list.length,
    largestNear: list.reduce((m, b) => (b.d <= 60 ? Math.max(m, Math.round(b.area)) : m), 0), old: oldB, new: newB, cause};
  if (truth?.[o.key]) {
    const verdict = judge(truth[o.key], o, pieces, join.keyOfPiece, list);
    if (verdict && dump) dump.push({key: o.key, typeId: o.typeId, kind: truth[o.key].kind, truth: verdict.key || verdict.keys,
      old: oldB?.key || null, cands: list.map(b => [b.key, b.inside ? 1 : 0, Math.round(b.d * 10) / 10, Math.round(b.area)])});
    if (verdict) {
      line.truth = verdict.key ? {kind: truth[o.key].kind, key: verdict.key} : {kind: truth[o.key].kind, keys: verdict.keys};
      const ok = key => (verdict.key ? key === verdict.key : verdict.keys.includes(key));
      const k = truth[o.key].kind; (acc.byKind[k] ||= {n: 0, old: 0, new: 0}).n++; acc.n++;
      if (oldB && ok(oldB.key)) { acc.old++; acc.byKind[k].old++; }
      if (newB && ok(newB.key)) { acc.new++; acc.byKind[k].new++; }
      line.truthOk = {old: Boolean(oldB && ok(oldB.key)), new: Boolean(newB && ok(newB.key))};
    }
  }
  seenKeys.add(o.key);
  lines.push(JSON.stringify(line));
}

/**
 * The reference building of an office from its OpenStreetMap match (metres from the pin): B — a building OSM names
 * for the office (its interior point) → the drawn building holding it; N — a named point → the drawn building holding
 * it, else none within 10 m (the point stands in the open: no verdict); C — a named compound (ring) → every drawn
 * building whose interior stands in it.
 */
function judge(t, o, pieces, keyOfPiece, list) {
  const kx = 111320 * Math.cos((o.latitude * Math.PI) / 180), ky = 110574;
  const toLL = ([x, y]) => [o.longitude + x / kx, o.latitude + y / ky];
  if (t.kind === 'B' || t.kind === 'N') {
    const at = toLL([t.x, t.y]);
    const near = buildingsNear(pieces, at, {keyOfPiece, maxM: t.kind === 'B' ? 6 : 10});
    if (!near.length) return null;
    const inside = near.find(b => b.inside);
    const key = (inside || near.reduce((a, b) => (b.d < a.d ? b : a))).key;
    return list.some(b => b.key === key) ? {key} : null;
  }
  if (t.kind === 'C') {
    const ring = t.ring.map(toLL);
    const keys = list.filter(b => b.pieces.some(id => { const p = pieces.find(q => q.id === id); return p && pointInRing(interior(p.outer), ring); })).map(b => b.key);
    return keys.length ? {keys} : null;
  }
  return null;
}
function interior(ring) {
  const n = ring.length - 1;
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; }
  return [x / n, y / n];
}

writeFileSync(`${outDir}/building-choice.jsonl`, lines.join('\n') + '\n');
if (dump) writeFileSync(`${outDir}/candidates.json`, JSON.stringify(dump));
const summary = {reachM: REACH_M, zoom: Z, missingTiles: uniqueMissing.length, ...counts, accuracy: truth ? acc : undefined};
writeFileSync(`${outDir}/building-choice-summary.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({...summary, byType: undefined}, null, 1));
