import test from 'node:test';
import assert from 'node:assert/strict';
import {tileToLonLat} from '../js/shell/mvt.js';
import {footprint, containsPoint} from '../js/shell/building-join.js';
import {siteCandidates, deepPoint, localFrame, joinFrame, inFrame, pointsText, squareRing, MAX_SITE_M} from '../scripts/site-buildings.mjs';
import {encodeTile, square} from './mvt-encode.js';

/* A synthetic Bangkok tile (as tests/building-units.test.js): OpenFreeMap buildings and one CityMETER unit over its left half. */
const T = {z: 14, x: 12767, y: 7560};
const ll = ring => ring.map(([px, py]) => tileToLonLat(px, py, T));
const at = (px, py) => tileToLonLat(px, py, T);
const bboxOf = ring => [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))];
const zoneRing = ll([[0, 0], [2048, 0], [2048, 4096], [0, 4096], [0, 0]]);
const ZONE = Object.freeze({id: 'unit-a', code: '04100101', name: 'เทศบาลทดสอบ', province: 'BKK', bbox: bboxOf(zoneRing), polygons: [[zoneRing]], tileType: 'MUNICIPALITY', tileUnits: [{id: 'unit-a', bbox: bboxOf(zoneRing)}]});
const osmBytes = encodeTile([{name: 'building', features: [
  {id: 301, properties: {render_height: 9, render_min_height: 0}, rings: [square(2500, 2500, 100)]},   // the office's main building
  {id: 302, properties: {render_height: 6, render_min_height: 0}, rings: [square(2700, 2500, 60)]},    // an annex
  {id: 303, properties: {render_height: 40, render_min_height: 0, hide_3d: true}, rings: [square(2500, 2800, 200)]}, // an outline in parts
  {id: 304, properties: {render_height: 40, render_min_height: 10}, rings: [square(2520, 2820, 80)]},  // its part
]}]);
const cmBytes = encodeTile([{name: 'building-detail', features: [
  {properties: {height_m: '12.50'}, rings: [square(500, 500, 90)]},
  {properties: {height_m: '8.00'}, rings: [square(650, 500, 50)]},
]}]);
const key = t => `${t.z}/${t.x}/${t.y}`;
const fetchBytes = async url => {
  if (url.includes('detailMvt/14/12767/7560')) return new Uint8Array(cmBytes);
  if (url === 'osm/14/12767/7560') return new Uint8Array(osmBytes);
  return new Uint8Array(0);
};

test('OpenStreetMap side: the buildings the page draws round a point outside the CityMETER units, one point well inside each, nearest first', async () => {
  const [lon, lat] = at(2550, 2550);
  const near = await siteCandidates({lon, lat, reach: 150, zones: [ZONE], fetchBytes, osmTemplate: 'osm/{z}/{x}/{y}'});
  assert.equal(near.source, 'osm', 'outside the unit the page draws OpenStreetMap buildings');
  assert.equal(near.candidates.length, 2, 'main building and annex; the outline reaching in is not drawn and its part stands beyond the reach');
  const res = await siteCandidates({lon, lat, reach: 300, zones: [ZONE], fetchBytes, osmTemplate: 'osm/{z}/{x}/{y}'});
  assert.equal(res.candidates.length, 3, 'main building, annex and the part of the outline (the outline itself is not drawn)');
  assert.deepEqual(res.candidates.map(c => c.cid), [1, 2, 3]);
  assert.ok(res.candidates[0].dist_m <= res.candidates[1].dist_m && res.candidates[1].dist_m <= res.candidates[2].dist_m);
  for (const c of res.candidates) assert.ok(containsPoint(footprint({key: c.cid, outer: c.outer, holes: c.holes}), c.point), 'the point stands in its building');
  assert.equal(res.candidates[0].dist_m < 30, true, 'the main building holds (nearly) the point');
});

test('CityMETER side: Building V4 inside a unit, whole buildings; a source that cannot be read stops', async () => {
  const [lon, lat] = at(540, 540);
  const res = await siteCandidates({lon, lat, reach: 150, zones: [ZONE], fetchBytes});
  assert.equal(res.source, 'cm');
  assert.equal(res.candidates.length, 2);
  assert.ok(res.candidates.every(c => c.pieces === 1));
  await assert.rejects(siteCandidates({lon, lat, reach: 150, zones: [ZONE], fetchBytes, source: 'osm'}), /OpenFreeMap tile template/);
  const [lon2, lat2] = at(4096 * 3 + 2000, 2000); // three tiles east: no CityMETER unit meets it
  await assert.rejects(siteCandidates({lon: lon2, lat: lat2, reach: 150, zones: [ZONE], fetchBytes, source: 'cm'}), /CityMETER Building V4/);
});

test('reach is kept between 100 m and the site limit', async () => {
  const [lon, lat] = at(2550, 2550);
  assert.equal((await siteCandidates({lon, lat, reach: 5000, zones: [], fetchBytes, osmTemplate: 'osm/{z}/{x}/{y}'})).reach, MAX_SITE_M);
  assert.equal((await siteCandidates({lon, lat, reach: 10, zones: [], fetchBytes, osmTemplate: 'osm/{z}/{x}/{y}'})).reach, 100);
});

test('a point well inside an L-shaped building; the join keeps the buildings whose point stands in the frame (holes excluded); the digest text is canonical', () => {
  const [lon0, lat0] = [100.5, 13.75], fr = localFrame(lon0, lat0);
  const L = [[0, 0], [40, 0], [40, 10], [10, 10], [10, 40], [0, 40], [0, 0]].map(fr.toLL);
  const p = deepPoint(footprint({key: 'L', outer: L, holes: []}), fr);
  assert.ok(p && containsPoint(footprint({key: 'L', outer: L, holes: []}), p));
  const [x, y] = fr.toM(p);
  assert.ok(Math.min(x, y) > 2, 'away from the walls');
  const outer = squareRing(lon0, lat0, 100), inner = squareRing(lon0, lat0, 20);
  const cands = [{cid: 1, point: fr.toLL([0, 0])}, {cid: 2, point: fr.toLL([50, 50])}, {cid: 3, point: fr.toLL([150, 0])}];
  assert.deepEqual(joinFrame(cands, {outers: [outer], inners: []}).map(c => c.cid), [1, 2]);
  assert.deepEqual(joinFrame(cands, {outers: [outer], inners: [inner]}).map(c => c.cid), [2]);
  assert.equal(inFrame(fr.toLL([150, 0]), {outers: [outer]}), false);
  assert.equal(pointsText([[100.5, 13.75], [100.4, 13.8]]), '100.400000,13.800000;100.500000,13.750000');
});
