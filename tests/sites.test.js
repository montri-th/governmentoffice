import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ROOT, readJSON, readBytes, loadAll} from './helpers.js';
import {decodeSites, attachSites, unitFor, OSM_CREDIT} from '../js/model.js';
import {buildOfficeDetail} from '../js/profile-model.js';
import {renderOffice} from '../js/panel.js';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const R = 6371008.8, rad = d => (d * Math.PI) / 180;
const haversine = (lat1, lon1, lat2, lon2) => {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
/** key → [lon, lat] of every row of the data (offices.json and every group file). */
function points() {
  const out = new Map(), first = readJSON('data/offices.json');
  for (const doc of [first, ...first.groups.filter(g => g.file).map(g => readJSON(g.file))]) {
    doc.cols.key.forEach((k, i) => out.set(k, [doc.cols.lon[i], doc.cols.lat[i]]));
  }
  return out;
}

test('data/sites.json: checked sites of the research sheet’s site tab — interior points only, near their office, OpenStreetMap credited', () => {
  const doc = readJSON('data/sites.json'), m = doc.meta, at = points();
  assert.equal(m.registryId, 'research.TH.government_office');
  assert.equal(m.tab.name, '07_SITE_BOUNDARY_CHECK');
  assert.match(m.tab.digest, /^[0-9a-f]{64}$/, 'the digest of the rows read, as the sheet computes it');
  assert.deepEqual(m.tab.columns, ['office_key', 'boundary_status', 'boundary_source', 'boundary_evidence_url', 'buildings_in_boundary', 'buildings_count', 'building_source', 'checked_on']);
  assert.deepEqual([m.licence, m.credit, m.creditUrl], ['ODbL-1.0', OSM_CREDIT.credit, OSM_CREDIT.url]);
  assert.deepEqual(Object.keys(m.buildingSources).sort(), ['cm_v4', 'osm_buildings']);
  for (const code of ['osm_polygon', 'osm_polygon+site_layout']) assert.ok(m.sources[code], code);
  assert.ok(!('osm_area' in m.sources), 'osm_area is the skip code of campus-site-join (the map draws OpenStreetMap buildings), never a source');
  const keys = Object.keys(doc.sites);
  assert.equal(keys.length, m.counts.sites);
  assert.ok(keys.length >= 200, 'the nationwide pass published its checked sites');
  let buildings = 0;
  for (const [key, s] of Object.entries(doc.sites)) {
    assert.ok(at.has(key), `${key}: a row of the data`);
    assert.deepEqual(Object.keys(s).filter(k => !['pts', 'n', 'on', 'src', 'b', 'url', 'x'].includes(k)), [], `${key}: nothing else`);
    assert.ok(s.n >= m.minBuildings && s.n === s.pts.length, `${key}: n`);
    assert.ok(s.src in m.sources && s.b in m.buildingSources, `${key}: sources`);
    assert.match(s.on, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Set(s.pts.map(p => p.join(','))).size, s.pts.length, `${key}: each building once`);
    const [lon0, lat0] = at.get(key);
    for (const [lon, lat] of s.pts) {
      assert.ok(lon >= 97 && lon <= 106 && lat >= 5 && lat <= 21, `${key}: in Thailand`);
      assert.ok(Math.abs(lon * 1e6 - Math.round(lon * 1e6)) < 1e-6 && Math.abs(lat * 1e6 - Math.round(lat * 1e6)) < 1e-6, `${key}: six decimals`);
      assert.ok(haversine(lat0, lon0, lat, lon) <= m.maxM, `${key}: within ${m.maxM} m of the office's own point`);
    }
    if (s.url) assert.ok(/site_layout/.test(s.src) && /^https:\/\//.test(s.url) && !/openstreetmap\.org|google\.[a-z.]+\/maps/.test(s.url), `${key}: a public layout page`);
    buildings += s.n;
  }
  assert.equal(buildings, m.counts.buildings);
  assert.deepEqual(m.external, [], 'the School and Temple links are prepared, none is used yet');
  const raw = readBytes('data/sites.json').toString('utf8');
  for (const kept of ['openstreetmap.org/way', 'openstreetmap.org/relation', 'Polygon', 'coordinates', 'docs.google', 'drive.google', 'Claude (osm-area']) {
    assert.ok(!raw.includes(kept), `the sheet keeps ${kept}`);
  }
});

test('decodeSites: a site per office key; fewer than 2 buildings or a broken point is no site; the credit follows OpenStreetMap', () => {
  const doc = readJSON('data/sites.json');
  const sites = decodeSites(doc);
  assert.equal(sites.size, doc.meta.counts.sites);
  const s = sites.values().next().value;
  assert.equal(s.credit, OSM_CREDIT.credit);
  assert.equal(s.creditUrl, OSM_CREDIT.url);
  assert.equal(s.source, doc.meta.sources[s.src]);
  const meta = {sources: {osm_polygon: 'กรอบพื้นที่ OpenStreetMap', 'dol_parcels+site_layout': 'รูปแปลงกรมที่ดิน + ผังโครงการ'}, buildingSources: {cm_v4: 'CityMETER Building V4'},
    credit: OSM_CREDIT.credit, creditUrl: OSM_CREDIT.url, licence: 'ODbL-1.0', external: [{dataset: 'CityMETER School', datasetTh: 'โรงเรียน', credit: '', licence: ''}]};
  const two = [[100.5, 13.7], [100.501, 13.7]];
  const m = decodeSites({meta, sites: {
    a: {pts: two, n: 2, on: '2026-11-06', src: 'osm_polygon', b: 'cm_v4'},
    b: {pts: [[100.5, 13.7]], n: 1, on: '2026-11-06', src: 'osm_polygon', b: 'cm_v4'},
    c: {pts: [[100.5, 'x'], [100.5, 13.7]], n: 2, src: 'osm_polygon', b: 'cm_v4'},
    d: {pts: two, n: 2, on: '2026-12-01', src: 'dol_parcels+site_layout', b: 'cm_v4', x: 0, url: 'https://school.example/plan'},
    e: {pts: two, n: 2, on: '2026-12-01', src: 'dol_parcels+site_layout', b: 'cm_v4', url: 'javascript:alert(1)'},
  }});
  assert.deepEqual([...m.keys()], ['a', 'd', 'e']);
  assert.equal(m.get('d').via, 'โรงเรียน');
  assert.equal(m.get('d').credit, '', 'a site of parcels and CityMETER buildings owes OpenStreetMap nothing');
  assert.equal(m.get('d').url, 'https://school.example/plan');
  assert.equal(m.get('e').url, '', 'only https pages');
  const rows = [{id: 'a'}, {id: 'b'}, {id: 'd'}];
  assert.equal(attachSites(rows, m), 2);
  assert.equal(rows[0].site, m.get('a'));
  assert.equal(rows[1].site, undefined);
});

test('an office with a site: ทั้งบริเวณ N อาคาร, the site in the sources, OpenStreetMap credited once in the one provenance line', () => {
  const {data, index} = loadAll();
  const sites = decodeSites(readJSON('data/sites.json'));
  assert.equal(attachSites(data.rows, sites), sites.size, 'every site finds its row');
  const r = data.rows.find(x => x.site && x.office) || data.rows.find(x => x.site);
  const ctx = {meta: data.meta, unit: unitFor({groups: data.groups, group: ''}), index, groups: data.groups};
  const html = renderOffice(buildOfficeDetail(r, {scopeRows: data.rows, allRows: data.rows, index, groups: data.groups}), ctx);
  const t = text(html);
  assert.ok(t.includes(`ทั้งบริเวณ ${r.site.n.toLocaleString('th-TH')} อาคาร`), 'the chip');
  assert.ok(t.includes('บริเวณ') && t.includes(r.site.source), 'the sources row');
  assert.ok(html.includes(`href="${OSM_CREDIT.url}"`), 'the credit links to OpenStreetMap’s copyright page');
  assert.equal((html.match(/class="hint panel-foot provenance"/g) || []).length, 1);
  const prov = html.slice(html.indexOf('class="hint panel-foot provenance"'));
  assert.ok(text(prov).includes(`บริเวณ ${r.site.source}`) && text(prov).includes(OSM_CREDIT.credit), 'the provenance line names the site and its credit');
  assert.ok(!/openstreetmap\.org\/(way|relation)/.test(html), 'no OpenStreetMap element link: the frame stays in the sheet');
  const plain = data.rows.find(x => !x.site && x.office);
  assert.ok(!text(renderOffice(buildOfficeDetail(plain, {scopeRows: data.rows, allRows: data.rows, index, groups: data.groups}), ctx)).includes('ทั้งบริเวณ'));
});

/* scripts/build-sites.py on a small made-up data set: what it publishes, what stops it, how a site of another dataset links. */
const py = spawnSync('python3', ['--version']);
const HEADER = ['office_key', 'name', 'type', 'district', 'boundary_status', 'boundary_source', 'boundary_evidence_url', 'boundary_geojson', 'buildings_in_boundary', 'buildings_count',
  'building_source', 'match_tier', 'main_building_note', 'checked_by', 'checked_on', 'notes'];
const COLS = ['office_key', 'boundary_status', 'boundary_source', 'boundary_evidence_url', 'buildings_in_boundary', 'buildings_count', 'building_source', 'checked_on'];
const P = (dx, dy) => `${(100.5 + dx).toFixed(6)},${(13.75 + dy).toFixed(6)}`;
function workdir() {
  const dir = mkdtempSync(join(tmpdir(), 'sites-'));
  mkdirSync(join(dir, 'data'));
  writeFileSync(join(dir, 'data', 'offices.json'), JSON.stringify({groups: [{id: 'admin', file: ''}], cols: {key: ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd'], lon: [100.5, 100.5, 100.5, 100.5], lat: [13.75, 13.75, 13.75, 13.75]}}));
  return dir;
}
const row = (key, status, pts, extra = {}) => {
  const r = Object.fromEntries(HEADER.map(h => [h, '']));
  Object.assign(r, {office_key: key, name: 'ที่ว่าการอำเภอทดสอบ', boundary_status: status, boundary_source: 'osm_polygon', boundary_evidence_url: 'https://www.openstreetmap.org/way/1',
    boundary_geojson: '{"type":"Polygon","coordinates":[]}', buildings_in_boundary: pts.join(';'), buildings_count: pts.length ? String(pts.length) : '', building_source: 'cm_v4',
    match_tier: 'own', checked_by: 'Claude (osm-area-site-join)', checked_on: '2026-11-06', notes: 'OSM 2026-11-06'}, extra);
  return HEADER.map(h => r[h]);
};
const run = (dir, args) => spawnSync('python3', ['-I', join(ROOT, 'scripts', 'build-sites.py'), '--read-on', '2026-11-06', '--data', join(dir, 'data'), '--out', join(dir, 'sites.json'), ...args], {encoding: 'utf8'});

test('build-sites.py: checked rows only; the reduced read and the full export give the same file; the sheet digest guards the input', {skip: py.status !== 0 && 'python3 not available'}, () => {
  const dir = workdir();
  const rows = [HEADER, row('aaaaaaaaaa', 'checked', [P(0.0001, 0), P(-0.0001, 0.0002)]), row('bbbbbbbbbb', 'checked', [P(0, 0.0003)]),
    row('cccccccccc', 'review', [P(0, 0), P(0.001, 0)]), row('eeeeeeeeee', 'checked', [P(0, 0), P(0.0002, 0)]), new Array(16).fill(''),
    row('dddddddddd', 'checked', [P(0, 0.001), P(0.001, 0)], {boundary_source: 'osm_polygon+site_layout', boundary_evidence_url: 'https://example.go.th/plan.pdf'})];
  writeFileSync(join(dir, 'full.json'), JSON.stringify({name: '07_SITE_BOUNDARY_CHECK', gid: 7, ncols: 16, rows}));
  const idx = COLS.map(c => HEADER.indexOf(c));
  const reduced = [COLS, ...rows.slice(1).filter(r => r[4] === 'checked').map(r => idx.map(i => r[i]))];
  writeFileSync(join(dir, 'reduced.json'), JSON.stringify({name: '07_SITE_BOUNDARY_CHECK', gid: 7, ncols: 8, rows: reduced}));
  const a = run(dir, ['--tab', join(dir, 'full.json')]);
  assert.equal(a.status, 0, a.stderr);
  const out = JSON.parse(readFileSync(join(dir, 'sites.json'), 'utf8'));
  assert.deepEqual(Object.keys(out.sites), ['aaaaaaaaaa', 'dddddddddd'], 'one building is no site; a key outside the data is no site; review is not checked');
  assert.deepEqual([out.meta.counts.unmatched, out.meta.counts.fewBuildings, out.meta.counts.checkedRows], [1, 1, 4]);
  assert.equal(out.sites.dddddddddd.url, 'https://example.go.th/plan.pdf', 'a layout-checked site keeps its public layout page');
  assert.equal(out.sites.aaaaaaaaaa.url, undefined, 'a frame-only site publishes no OpenStreetMap element link');
  const full = readFileSync(join(dir, 'sites.json'));
  const b = run(dir, ['--tab', join(dir, 'reduced.json'), '--sheet-digest', JSON.parse(a.stdout).digest]);
  assert.equal(b.status, 0, b.stderr);
  assert.deepEqual(readFileSync(join(dir, 'sites.json')), full, 'the same bytes from the reduced read');
  const c = run(dir, ['--tab', join(dir, 'reduced.json'), '--sheet-digest', '0'.repeat(64)]);
  assert.notEqual(c.status, 0);
  assert.match(c.stderr, /STOP: the input is not the sheet/);
});

test('build-sites.py stops on a sheet error: a building far from its office, outside Thailand, a count that disagrees, an unapproved source', {skip: py.status !== 0 && 'python3 not available'}, () => {
  const dir = workdir();
  const bad = {
    far: row('aaaaaaaaaa', 'checked', [P(0, 0), P(0.01, 0)]),
    abroad: row('aaaaaaaaaa', 'checked', [P(0, 0), '120.000000,13.750000']),
    count: row('aaaaaaaaaa', 'checked', [P(0, 0), P(0.0001, 0)], {buildings_count: '3'}),
    source: row('aaaaaaaaaa', 'checked', [P(0, 0), P(0.0001, 0)], {boundary_source: 'osm_area'}),
  };
  for (const [name, r] of Object.entries(bad)) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({name: '07_SITE_BOUNDARY_CHECK', gid: 7, rows: [HEADER, r]}));
    const res = run(dir, ['--tab', join(dir, `${name}.json`)]);
    assert.notEqual(res.status, 0, `${name} stops the build`);
  }
});

test('build-sites.py links a site of another dataset (School, Temple) to its row: a layout check replaces a frame alone, an equal rank keeps ours', {skip: py.status !== 0 && 'python3 not available'}, () => {
  const dir = workdir();
  writeFileSync(join(dir, 'tab.json'), JSON.stringify({name: '07_SITE_BOUNDARY_CHECK', gid: 7, rows: [HEADER,
    row('aaaaaaaaaa', 'checked', [P(0, 0), P(0.0001, 0)]), row('bbbbbbbbbb', 'checked', [P(0, 0.0001), P(0.0001, 0.0001)])]}));
  const pts = [[100.5002, 13.7502], [100.5003, 13.7503], [100.5004, 13.7504]];
  writeFileSync(join(dir, 'school.json'), JSON.stringify({meta: {dataset: 'CityMETER School', datasetTh: 'โรงเรียน', registryId: 'research.TH.school'}, sites: {
    S1: {pts, n: 3, on: '2026-12-01', src: 'dol_parcels+site_layout', b: 'cm_v4', go: 'aaaaaaaaaa', url: 'https://school.example/plan'},
    S2: {pts, n: 3, on: '2026-12-01', src: 'osm_polygon', b: 'cm_v4', go: 'bbbbbbbbbb'},
    S3: {pts, n: 3, on: '2026-12-01', src: 'site_layout', b: 'cm_v4', go: 'cccccccccc'},
    S4: {pts, n: 3, on: '2026-12-01', src: 'site_layout', b: 'cm_v4', go: 'zzzzzzzzzz'},
    S5: {pts, n: 3, on: '2026-12-01', src: 'site_layout', b: 'cm_v4'},
  }}));
  const res = run(dir, ['--tab', join(dir, 'tab.json'), '--external', join(dir, 'school.json')]);
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(readFileSync(join(dir, 'sites.json'), 'utf8'));
  assert.equal(out.sites.aaaaaaaaaa.x, 0, 'parcels + layout beat a frame alone');
  assert.equal(out.sites.aaaaaaaaaa.url, 'https://school.example/plan');
  assert.equal(out.sites.bbbbbbbbbb.x, undefined, 'an equal rank keeps this sheet’s site');
  assert.equal(out.sites.cccccccccc.x, 0, 'a row without a site of its own takes the other dataset’s');
  assert.deepEqual([out.meta.external[0].offered, out.meta.external[0].linked, out.meta.external[0].used], [4, 3, 2]);
  assert.equal(out.meta.counts.external, 2);
  assert.equal(decodeSites(out).get('aaaaaaaaaa').via, 'โรงเรียน');
});
