#!/usr/bin/env node
// Research helper for office sites (skills campus-site-join and osm-area-site-join, owner 2026-11-06: “ใช้วิธีนี้ และ
// เพิ่มวิธีตาม skill ใหม่เพิ่มเติม”). Ported from montri-th/hotel scripts/site-candidates.mjs (commit 177e592). Run from the
// root of a clone of this repo (Node 20+, no packages). It reads the buildings with the same code the demo map uses
// (js/massing.js, js/mvt.js, js/building-units.js, js/building-join.js), so a point it writes stands inside a building
// the map draws. It writes nothing in data/ — a research sheet stays the record; outputs go to sites/ (git-ignored).
// A site is a display grouping of the buildings of one office's compound, never a deed, a parcel or ownership.
//
//   node scripts/site-candidates.mjs candidates <key> [--reach 400] [--cache <dir>]
//       <key> = the ?office= key (data/offices.json or data/groups/*.json)
//       → sites/<key>/candidates.json · candidates.png (numbered buildings, north up, pin red)
//       --cache keeps the tiles read (one file per tile request) so nearby offices do not ask the API again
//   node scripts/site-candidates.mjs check <key> --points "lon,lat;lon,lat"
//       → which drawn building holds each point (a site row's buildings); exits 1 if one is outside
// The `row` step of the hotel helper (a sheet row with boundary_source) waits for the owner: Government Office has no
// site tab and no boundary source the dataset contract allows yet (docs/SITES.md).
import {readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {tilesForRegions, planCmRequests, shapeCmTile, roundingRadiusM, encloseOffsetM} from '../js/massing.js';
import {parseVectorTile} from '../js/mvt.js';
import {zonesOf, zoneAt, cmTileUrl} from '../js/building-units.js';
import {footprint, containsPoint, interiorOf} from '../js/building-join.js';

const MAX_SITE_M = 600; // the hotel build's SITE_MAX_M: a site building farther from the office's point is not one site
const [cmd, venue] = process.argv.slice(2);
const argv = process.argv.slice(4);
const opt = (k, d = '') => { const i = argv.indexOf(`--${k}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const fail = msg => { console.error(`STOP: ${msg}`); process.exit(1); };
if (!['candidates', 'check'].includes(cmd) || !venue) fail('usage: node scripts/site-candidates.mjs candidates|check <key> [options]');
if (!existsSync('js/massing.js') || !existsSync('data/offices.json')) fail('run from the root of a clone of montri-th/governmentoffice');

// The office as the map shows it (the published point): data/offices.json, else the group files it lists.
const data = JSON.parse(readFileSync('data/offices.json', 'utf8'));
let cols = data.cols, row = cols.key.indexOf(venue);
for (const g of data.groups) {
  if (row >= 0) break;
  if (!g.file || !existsSync(g.file)) continue;
  cols = JSON.parse(readFileSync(g.file, 'utf8')).cols;
  row = cols.key.indexOf(venue);
}
if (row < 0) fail(`${venue} is not in data/offices.json or the group files`);
const lon0 = cols.lon[row], lat0 = cols.lat[row], officeName = cols.name[row] || '';
const typeTh = data.types[cols.type[row]]?.th || '';
if (!Number.isFinite(lon0) || !Number.isFinite(lat0)) fail(`${venue} has no point on the map`);
const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
const toM = ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky];
const toLL = ([x, y]) => [+(lon0 + x / kx).toFixed(6), +(lat0 + y / ky).toFixed(6)];
const dir = `sites/${venue}`;
mkdirSync(dir, {recursive: true});

if (cmd === 'candidates') await candidates();
else check();

function check() {
  if (!existsSync(`${dir}/candidates.json`)) fail(`run candidates for ${venue} first`);
  const cand = JSON.parse(readFileSync(`${dir}/candidates.json`, 'utf8')).candidates.map(c => ({...c, fp: footprint({key: c.cid, outer: c.outer, holes: c.holes})}));
  const pts = opt('points').split(/[;\s]+/).filter(Boolean).map(p => p.split(',').map(Number));
  if (!pts.length || pts.some(p => p.length !== 2 || !p.every(Number.isFinite))) fail('--points must be "lon,lat;lon,lat"');
  let outside = 0;
  const held = pts.map(p => { const c = cand.filter(b => containsPoint(b.fp, p)).map(b => b.cid); if (!c.length) outside++; return c; });
  pts.forEach((p, i) => console.log(`${p.join(',')} → ${held[i].length ? `building ${held[i].join(' + ')}` : 'OUTSIDE every drawn building'}`));
  console.log(`${pts.length - outside} of ${pts.length} points stand in a drawn building; ${new Set(held.flat()).size} buildings`);
  if (outside) process.exit(1);
}

async function tileBytes(url, key) {
  const cache = opt('cache');
  const file = cache ? `${cache}/${createHash('sha1').update(url).digest('hex')}.pbf` : '';
  if (file && existsSync(file)) return new Uint8Array(readFileSync(file));
  let buf = null;
  for (let attempt = 0; attempt < 3 && !buf; attempt++) {
    try { const r = await fetch(url); if (r.ok) buf = new Uint8Array(await r.arrayBuffer()); else if (r.status < 500) fail(`tile ${key} answered ${r.status}`); }
    catch { /* retried */ }
    if (!buf) await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
  }
  if (!buf) fail(`tile ${key} did not load after 3 tries — run again later; never fill points by hand`);
  if (file) { mkdirSync(cache, {recursive: true}); writeFileSync(file, buf); }
  await new Promise(res => setTimeout(res, 250));
  return buf;
}

async function candidates() {
  const reach = Math.min(MAX_SITE_M, Math.max(100, Number(opt('reach', 400)) || 400));
  const dLon = reach / kx, dLat = reach / ky;
  const ring = [[lon0 - dLon, lat0 - dLat], [lon0 + dLon, lat0 - dLat], [lon0 + dLon, lat0 + dLat], [lon0 - dLon, lat0 + dLat], [lon0 - dLon, lat0 - dLat]];
  const zones = readdirSync('data/building-units').filter(f => /^[A-Z]{3}\.json$/.test(f))
    .flatMap(f => zonesOf(JSON.parse(readFileSync(`data/building-units/${f}`, 'utf8'))));
  if (!zoneAt(zones, [lon0, lat0])) fail('the map draws OpenStreetMap buildings at this office, not CityMETER Building V4 — skip this office (osm_area)');
  const {tiles} = tilesForRegions([ring], 14, 64, [lon0, lat0]);
  const plan = planCmRequests(tiles, zones, {max: 400, center: [lon0, lat0]});
  if (!plan.requests.length) fail('the map draws OpenStreetMap buildings here, not CityMETER Building V4 — skip this office (osm_area)');
  const pieces = [], seen = new Set();
  const radiusM = roundingRadiusM(18, lat0), offsetM = encloseOffsetM(radiusM);
  for (const q of plan.requests) {
    const buf = await tileBytes(cmTileUrl(q.tile, q.tileUnit, q.tileType), q.key);
    const layer = buf.byteLength ? parseVectorTile(buf).layers['building-detail'] || {extent: 4096, features: []} : {extent: 4096, features: []};
    pieces.push(...shapeCmTile(q.tile, layer, {regions: [ring], radiusM, offsetM, slot: q.slot, seen}).footprints);
  }
  const list = pieces.map(p => {
    const fp = footprint({...p, key: p.id});
    return {fp, point: deepPoint(fp), area_m2: Math.round(Math.abs(areaM(p.outer)) - p.holes.reduce((s, h) => s + Math.abs(areaM(h)), 0)),
      height_m: Math.round(p.height * 10) / 10, outer: p.outer, holes: p.holes};
  }).map(c => ({...c, dist_m: Math.round(Math.hypot(...toM(c.point)))})).sort((a, b) => a.dist_m - b.dist_m);
  list.forEach((c, i) => { c.cid = i + 1; });
  const out = {venue_id: venue, name: officeName, type: typeTh, point: [lon0, lat0], reach_m: reach, read_on: today(), requests: plan.requests.length,
    rule: 'CityMETER Building V4 as the demo map draws it (production building/detailMvt z14, version V4); point = a point well inside the building',
    candidates: list.map(({cid, point, area_m2, height_m, dist_m, outer, holes}) => ({cid, point, area_m2, height_m, dist_m,
      outer: outer.map(q => q.map(v => +v.toFixed(7))), holes: holes.map(h => h.map(q => q.map(v => +v.toFixed(7))))}))};
  writeFileSync(`${dir}/candidates.json`, JSON.stringify(out));
  writeFileSync(`${dir}/candidates.png`, plot(list, [], null, reach));
  console.log(`${venue} · ${officeName}: ${list.length} buildings within ${reach} m (${plan.requests.length} tiles read)`);
  console.log(`files: ${dir}/candidates.png (numbered, north up, pin red), candidates.json`);
  console.log(`the same buildings on the demo: https://montri-th.github.io/governmentoffice/?office=${encodeURIComponent(venue)}`);
}

// ---------- geometry (local metres round the office) ----------
function areaM(ring) { let a = 0; const r = ring.map(toM); for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; }
function inRing([x, y], ring) {
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
/** A point well inside the building (the farthest from its walls on a fine grid), checked against the map's own test. */
function deepPoint(fp) {
  const rings = [fp.outer, ...fp.holes].map(r => r.map(toM)), out = rings[0];
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
  const pt = best ? toLL(best) : null;
  if (pt && containsPoint(fp, pt)) return pt;
  const alt = interiorOf(fp.outer).map(v => +v.toFixed(6));
  if (!containsPoint(fp, alt)) fail('a building has no point that stays inside it at 6 decimals');
  return alt;
}
function today() { return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Bangkok'}).format(new Date()); }

// ---------- a PNG without packages: grey = CityMETER buildings, blue = site, orange = boundary, red = the office's point ----------
function plot(cands, pickedIds, boundary, reach) {
  const S = 1200, s = S / (2 * reach), img = new Uint8Array(S * S * 3).fill(246);
  const px = p => { const [x, y] = toM(p); return [S / 2 + x * s, S / 2 - y * s]; };
  const set = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= S || y >= S) return; const k = (y * S + x) * 3; img[k] = c[0]; img[k + 1] = c[1]; img[k + 2] = c[2]; };
  const fill = (rings, c) => {
    const rs = rings.map(r => r.map(px)), ys = rs.flat().map(p => p[1]);
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(S - 1, Math.ceil(Math.max(...ys))); y++) {
      const xs = [];
      for (const r of rs) for (let i = 0; i < r.length - 1; i++) {
        const [ax, ay] = r[i], [bx, by] = r[i + 1];
        if ((ay <= y + 0.5) !== (by <= y + 0.5)) xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) set(x, y, c);
    }
  };
  const line = ([ax, ay], [bx, by], c, w = 1) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay)) + 1;
    for (let i = 0; i <= n; i++) { const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n; for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < w; dy++) set(x + dx, y + dy, c); }
  };
  const outline = (rings, c, w) => { for (const r of rings) { const q = r.map(px); for (let i = 0; i < q.length - 1; i++) line(q[i], q[i + 1], c, w); } };
  const picked = new Set(pickedIds);
  for (const c of cands) { fill([c.outer, ...c.holes], picked.has(c.cid) ? [47, 127, 182] : [200, 200, 200]); outline([c.outer], picked.has(c.cid) ? [11, 61, 98] : [110, 110, 110], 1); }
  if (boundary) for (const pg of boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates) outline(pg, [240, 140, 0], 2);
  const [cx, cy] = px([lon0, lat0]);
  for (let a = 0; a < 360; a += 2) for (let r = 0; r <= 7; r++) set(cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180), r > 5 ? [255, 255, 255] : [214, 39, 40]);
  for (const c of cands) text(String(c.cid), ...px(c.point));
  line([30, S - 30], [30 + 100 * s, S - 30], [0, 0, 0], 3);
  text('100m', 30 + 50 * s, S - 48); text('N', S - 40, 40);
  return png(S, S, img);
  function text(t, x, y) {
    const F = {0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
      6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', m: '000000000000111110101010101010', N: '1000111001101011001110001'};
    const width = ch => (ch === 'm' ? 6 : ch === 'N' ? 5 : 3), sc = 2, tw = [...t].reduce((a, ch) => a + (width(ch) + 1) * sc, 0);
    let ox = Math.round(x - tw / 2), oy = Math.round(y - 5 * sc / 2);
    for (let i = -2; i < tw + 1; i++) for (let j = -2; j < 5 * sc + 2; j++) set(ox + i, oy + j, [255, 255, 255]);
    for (const ch of t) {
      const w = width(ch), bits = F[ch] || '';
      for (let r = 0; r < 5; r++) for (let col = 0; col < w; col++) if (bits[r * w + col] === '1') for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) set(ox + col * sc + a, oy + r * sc + b, [0, 0, 0]);
      ox += (w + 1) * sc;
    }
  }
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const table = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const v of b) c = table[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
