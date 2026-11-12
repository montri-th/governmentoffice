/**
 * The search box of CityMETER · Government Office (0.9.0; owner 2026-11-12 12:05, VERBATIM: “ศึกษาแนวคิดเรื่อง Fuzzy search แล้ว
 * implement กับ demo web ให้ได้ user benefit สูงสุดตาม user intent ในขณะนั้น และตาม product statement”): the names
 * js/find.js gives js/shell/fuzzy.js, read from the shipped data, and what a name typed opens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {load, ROOT} from './helpers.js';
import {createIndex, key1, STEP} from '../js/shell/fuzzy.js';
import {SEARCH_KINDS, SEARCH_HEADS, SEARCH_HINT, searchEntries, searchRows, searchNote} from '../js/find.js';
import {translate, translateIn, registerDictionary} from '../js/shell/i18n.js';
import GOV_EN from '../js/lang-en.js';

const VENUE = 'office';
let built = null;
function index() {
  if (!built) {
    const loaded = load();
    const idx = createIndex({kinds: SEARCH_KINDS, heads: SEARCH_HEADS});
    idx.addAll(searchEntries(loaded));
    built = {idx, ...loaded};
  }
  return built;
}
const top = (result, n = 5) => result.items.slice(0, n).map(i => `${i.entry.kind}:${i.entry.id}`);

test('every place and every office of the data can be found by name', () => {
  const {idx} = index();
  const entries = [...searchEntries(index())];
  const nameless = entries.filter(e => !key1(e.name || '') && !key1(e.nameEn || '')).length;
  assert.ok(idx.size > 1000 && entries.length - idx.size <= nameless, `${idx.size} of ${entries.length} entries: only one whose name has no letter (${nameless}) is left out`);
  assert.deepEqual([...new Set(entries.map(e => e.kind))].sort(), SEARCH_KINDS.map(k => k.id).sort(), 'every kind the list names has entries');
  // One typed as written is on the first screens of results.
  const rows = entries.filter(e => e.kind === VENUE && key1(e.name || '')).filter((_, i) => i % 211 === 0);
  let missed = 0;
  for (const e of rows) if (!idx.search(e.name, {province: e.province, area: e.area}).items.slice(0, 40).some(i => i.entry.kind === VENUE && i.entry.id === e.id)) missed++;
  assert.equal(missed, 0, `${rows.length} typed as written`);
});

test('a name typed opens the level that answers it: a place before a office, one exact place chosen ahead', () => {
  const {idx} = index();
  let r = idx.search('จ.ภูเก็ต');
  assert.deepEqual([top(r, 1)[0], r.preselect?.kind, r.total], ['province:PKT', 'province', 1]);
  r = idx.search('phuket');
  assert.equal(top(r, 1)[0], 'province:PKT');
  r = idx.search('อ.หาดใหญ่');
  assert.deepEqual([top(r, 1)[0], r.preselect?.id], ['area:9011', '9011']);
  r = idx.search('หาดใหญ่ สงขลา');
  assert.deepEqual([top(r, 1)[0], r.items[0].step], ['area:9011', STEP.within]);
  r = idx.search('โคราช');
  assert.deepEqual([top(r, 1)[0], r.items[0].matched], ['province:NMA', 'โคราช']);
  r = idx.search('บางรัก');
  assert.deepEqual([top(r, 1)[0], r.preselect?.id, r.items[1].entry.kind], ['area:1004', '1004', 'office'], 'the district is chosen ahead; the offices that go by its name are the next rows');
  assert.equal(idx.search('สน.ทองหล่อ').items[0].entry.name, 'สถานีตำรวจนครบาลทองหล่อ', 'a word and its abbreviation are one word');
  assert.equal(idx.search('อบต.บางพระ').items[0].entry.name, 'องค์การบริหารส่วนตำบลบางพระ');
  assert.equal(idx.search('ทต.บางพระ').items[0].entry.name, 'เทศบาลตำบลบางพระ');
  r = idx.search('อบต.');
  assert.deepEqual([r.items[0].entry.kind, r.items[0].entry.name, r.preselect?.kind], ['type', 'องค์การบริหารส่วนตำบล', 'type']);
  r = idx.search('ตำรวจ');
  assert.deepEqual([r.items[0].entry.kind, r.preselect?.kind], ['group', 'group']);
  // The rows of a group that loads later join the list from where the first reading stopped.
  const {data} = index();
  assert.deepEqual([...searchRows(index(), data.rows.length - 3)].map(e => e.id), data.rows.slice(-3).map(x => x.id));
});

test('a name typed another way is still found, and a guess is said to be one', () => {
  const {idx} = index();
  let r = idx.search('เชียงใหม');
  assert.deepEqual([top(r, 1)[0], r.items[0].show], ['province:CMI', 'spelling']);
  r = idx.search('จ.เชียงหใม่');
  assert.deepEqual([top(r, 1)[0], r.items[0].show, r.preselect], ['province:CMI', 'near', null]);
  r = idx.search("g=up'.s,j");
  assert.deepEqual([r.layout, top(r, 1)[0], r.items[0].show, r.preselect], ['เชียงใหม่', 'province:CMI', 'near', null]);
  assert.equal(idx.search('zzzzqqqq').total, 0);
});

test('the list says what an entry is and where, and the page opens every kind it lists', () => {
  const {idx} = index();
  const loaded = index();
  const note = entry => searchNote(entry, loaded);
  const of = (typed, kind) => idx.search(typed).items.find(i => i.entry.kind === kind).entry;
  assert.equal(note(of('ภูเก็ต', 'province')), 'จังหวัด');
  assert.equal(note(of('อ.หาดใหญ่', 'area')), 'อำเภอ · สงขลา');
  assert.equal(note(of('เขตปทุมวัน', 'area')), 'เขต · กรุงเทพมหานคร');
  // A row names what it is and where: no caveat, and nothing left empty.
  let seen = 0;
  for (const e of searchEntries(loaded)) {
    if (e.kind === VENUE && seen++ % 53) continue;
    const line = note(e);
    // (The first part is the demo's own word; the others are names of places, and อำเภออาจสามารถ is one.)
    assert.ok(line && !/ไม่ใช่|อาจ|ยังไม่ได้/.test(line.split(' · ')[0]) && !/ ·  ·|^ · | · $/.test(line), `${e.kind} ${e.name}: ${line}`);
  }
  const app = readFileSync(join(ROOT, 'js/app.js'), 'utf8');
  for (const k of SEARCH_KINDS) assert.ok(app.includes(`entry.kind === '${k.id}'`), `js/app.js opens a ${k.id}`);
  assert.ok(SEARCH_HINT.startsWith('ลอง'));
  registerDictionary(GOV_EN);
  assert.ok(translate(SEARCH_HINT), 'the hint has English');
  // One entry, so the singular: a part of the row's line is read by where it stands.
  const part = {matches: selector => selector === '.find-where'};
  assert.deepEqual(["สถานีรถไฟฟ้า", "หมวด", "ประเภท", "จังหวัด"].map(th => translateIn(part, th)), ["Rail station", "Category", "Type", "Province"]);
});
