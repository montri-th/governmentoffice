/** Shared loaders for the node tests (data files are read once per process). */
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {decodeDataset, appendGroupRows, setProvinces} from '../js/model.js';
import {buildAreaIndex, attachFrames} from '../js/areas.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
export const readJSON = path => { if (!cache.has(path)) cache.set(path, JSON.parse(readFileSync(join(ROOT, path), 'utf8'))); return cache.get(path); };
export const readBytes = path => readFileSync(join(ROOT, path));
export const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
export const frameFiles = () => readdirSync(join(ROOT, 'data/frames')).filter(f => f.endsWith('.json')).sort();

let loaded = null, everything = null;
/** The shipped data set (the government offices), decoded exactly as the browser does (outlines attached only when asked). */
export function load({frames = []} = {}) {
  if (!loaded) {
    const indexJSON = readJSON('data/area-index.json'), provincesGeo = readJSON('data/provinces.geojson');
    setProvinces(indexJSON.provinces);
    const index = buildAreaIndex(indexJSON);
    const raw = readJSON('data/offices.json');
    const data = decodeDataset(raw, index);
    loaded = {raw, data, index, indexJSON, provincesGeo};
  }
  for (const code of frames) attachFrames(loaded.index, readJSON(`data/frames/${code}.json`));
  return loaded;
}

/**
 * Every group of the dataset: the offices plus the group files the page loads before its first paint (a separate decode, so the
 * offices-only data of load() is never changed by a test).
 */
export function loadAll() {
  if (!everything) {
    const {raw, index} = load();
    const data = decodeDataset(raw, index);
    const files = {};
    for (const g of data.groups.filter(x => x.file)) {
      const bytes = readBytes(g.file);
      files[g.id] = {bytes, json: JSON.parse(bytes.toString('utf8'))};
      files[g.id].appended = appendGroupRows(data, files[g.id].json, index);
    }
    everything = {raw, data, index, files};
  }
  return everything;
}
