// The drawn buildings round an office and the frame join of a site (docs/SITES.md). Shared by
// scripts/site-candidates.mjs (Node) and scripts/sites-browser.js (the owner's browser on this repository's page, where
// OpenFreeMap tiles are reached). Buildings are read with the code the page draws them with: CityMETER Building V4
// inside a CityMETER unit (js/massing.js#shapeCmTile, whole buildings), OpenStreetMap elsewhere (OpenFreeMap tiles,
// js/massing.js#shapeTile, the pieces of one building grouped as the page groups them, js/building-join.js#groupPieces).
// Every building comes with one point well inside it, so the page finds it again with js/building-join.js#buildingsAtPoints.
import {tilesForRegions, planCmRequests, shapeCmTile, shapeTile, roundingRadiusM, encloseOffsetM} from '../js/massing.js';
import {parseVectorTile} from '../js/mvt.js';
import {zoneAt, cmTileUrl} from '../js/building-units.js';
import {footprint, containsPoint, interiorOf, groupPieces} from '../js/building-join.js';

export const MAX_SITE_M = 600; // a site building farther from the office's point is not one site (Hotel SITE_MAX_M)
export const SITE_ZOOM = 14;   // the page's focus tier (js/massing.js TILE_ZOOM)

/** A local plane in metres round [lon0, lat0]. */
export function localFrame(lon0, lat0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
  return {lon0, lat0, kx, ky, toM: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky], toLL: ([x, y]) => [+(lon0 + x / kx).toFixed(6), +(lat0 + y / ky).toFixed(6)]};
}

export function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function edgeDist(p, rings) { let d = Infinity; for (const r of rings) for (let i = 0; i < r.length - 1; i++) d = Math.min(d, segDist(p, r[i], r[i + 1])); return d; }

/** Signed area (m²) of a lon/lat ring on the local plane. */
export function ringAreaM2(ring, fr) { let a = 0; const r = ring.map(fr.toM); for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; }

/** A point well inside the building (the farthest from its walls on a fine grid), checked with the map's own test; null if none. */
export function deepPoint(fp, fr) {
  const rings = [fp.outer, ...(fp.holes || [])].map(r => r.map(fr.toM)), out = rings[0];
  const xs = out.map(p => p[0]), ys = out.map(p => p[1]);
  let best = null, bestD = -1;
  const scan = (x0, x1, y0, y1, step) => {
    for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) {
      const p = [x, y];
      if (!inRing(p, out) || rings.slice(1).some(h => inRing(p, h))) continue;
      const d = edgeDist(p, rings);
      if (d > bestD) { bestD = d; best = p; }
    }
  };
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), step = Math.max(0.25, Math.min(w, h) / 24);
  scan(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), step);
  if (best) scan(best[0] - step, best[0] + step, best[1] - step, best[1] + step, step / 6);
  const pt = best ? fr.toLL(best) : null;
  if (pt && containsPoint(fp, pt)) return pt;
  const alt = interiorOf(fp.outer).map(v => +v.toFixed(6));
  return containsPoint(fp, alt) ? alt : null;
}

/** The square (lon/lat ring) of half-size `m` metres round a point. */
export function squareRing(lon, lat, m) {
  const fr = localFrame(lon, lat), dLon = m / fr.kx, dLat = m / fr.ky;
  return [[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]];
}

/**
 * The buildings the page draws within `reach` m (a square) of an office's point.
 * zones: CityMETER units (js/building-units.js#zonesOf); fetchBytes(url, key) → Uint8Array (an empty array for a 204);
 * osmTemplate: the OpenFreeMap tile URL template ({z}/{x}/{y}) for OpenStreetMap buildings; source: 'auto' (the
 * page's choice at the point), 'cm' or 'osm'.
 * → {source, reach, requests, candidates: [{cid, point, area_m2, height_m, dist_m, pieces, outer, holes}]} nearest first.
 */
export async function siteCandidates({lon, lat, reach = 400, zones = [], fetchBytes, osmTemplate = '', source = 'auto'}) {
  reach = Math.min(MAX_SITE_M, Math.max(100, Number(reach) || 400));
  const fr = localFrame(lon, lat), ring = squareRing(lon, lat, reach);
  const kind = source === 'auto' ? (zoneAt(zones, [lon, lat]) ? 'cm' : 'osm') : source;
  const radiusM = roundingRadiusM(18, lat), offsetM = encloseOffsetM(radiusM);
  const {tiles} = tilesForRegions([ring], SITE_ZOOM, 64, [lon, lat]);
  let groups = [], requests = 0;
  if (kind === 'cm') {
    const plan = planCmRequests(tiles, zones, {max: 400, center: [lon, lat]});
    if (!plan.requests.length) throw new Error('no CityMETER Building V4 tile here: the page draws OpenStreetMap buildings');
    const seen = new Set(), pieces = [];
    for (const q of plan.requests) {
      const buf = await fetchBytes(cmTileUrl(q.tile, q.tileUnit, q.tileType), q.key);
      const layer = buf?.byteLength ? parseVectorTile(buf).layers['building-detail'] || {extent: 4096, features: []} : {extent: 4096, features: []};
      pieces.push(...shapeCmTile(q.tile, layer, {regions: [ring], radiusM, offsetM, slot: q.slot, seen}).footprints);
      requests++;
    }
    groups = pieces.map(p => [p]); // whole buildings
  } else {
    if (!osmTemplate) throw new Error('OpenStreetMap buildings need the OpenFreeMap tile template');
    const pieces = [];
    for (const t of tiles) {
      const buf = await fetchBytes(osmTemplate.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y), `${t.z}/${t.x}/${t.y}`);
      const layer = buf?.byteLength ? parseVectorTile(buf).layers.building : null;
      if (layer) pieces.push(...shapeTile(t, layer, {regions: [ring], radiusM, offsetM, zones}).footprints);
      requests++;
    }
    const groupOf = groupPieces(pieces), by = new Map();
    for (const p of pieces) { const g = groupOf.get(p.id); if (!by.has(g)) by.set(g, []); by.get(g).push(p); }
    groups = [...by.values()];
  }
  const list = [];
  for (const g of groups) {
    const drawn = g.filter(p => !p.outline);
    if (!drawn.length) continue; // an outline OpenMapTiles hides in 3D: its parts stand for it
    const size = p => Math.abs(ringAreaM2(p.outer, fr)) - (p.holes || []).reduce((s, h) => s + Math.abs(ringAreaM2(h, fr)), 0);
    const main = drawn.reduce((a, b) => (size(b) > size(a) ? b : a));
    const point = deepPoint(footprint({...main, key: main.id}), fr);
    if (!point) continue;
    list.push({point, area_m2: Math.round(drawn.reduce((s, p) => s + size(p), 0)), height_m: Math.round(Math.max(...drawn.map(p => p.height || 0)) * 10) / 10,
      dist_m: Math.round(Math.hypot(...fr.toM(point))), pieces: drawn.length, outer: main.outer, holes: main.holes || []});
  }
  list.sort((a, b) => a.dist_m - b.dist_m);
  list.forEach((c, i) => { c.cid = i + 1; });
  return {source: kind, reach, requests, candidates: list};
}

/** A frame: {outers: [ring], inners: [ring]} in lon/lat. A point stands in it inside an outer ring and outside every inner. */
export function inFrame(point, frame) {
  return frame.outers.some(r => inRing(point, r)) && !(frame.inners || []).some(r => inRing(point, r));
}

/** The members of a site: the candidates whose interior point stands in the frame (the rule of the skill's osm_join.py). */
export function joinFrame(candidates, frame) { return candidates.filter(c => inFrame(c.point, frame)); }

/** The buildings_in_boundary text of a site: "lon,lat;lon,lat" with 6 decimals, sorted (its SHA-256 is the sheet's digest). */
export function pointsText(points) { return points.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).sort().join(';'); }
