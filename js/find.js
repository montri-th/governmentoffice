/**
 * What the search box of CityMETER · Government Office knows by name: the entries js/shell/fuzzy.js matches and js/shell/search.js
 * lists (release 0.9.0; owner 2026-11-12 12:05, VERBATIM: “ศึกษาแนวคิดเรื่อง Fuzzy search แล้ว implement กับ demo web
 * ให้ได้ user benefit สูงสุดตาม user intent ในขณะนั้น และตาม product statement”).
 *
 * The product statement reads where the offices of the state and their personnel are, by area and by type. So a name
 * typed here opens the level that answers it: a province or a เขต/อำเภอ (its offices and personnel), a group (หมวด) or
 * a type (where it is), one office (its profile), or a rail station (the offices round it). The order below is the
 * order among equal matches: places first, and an office before a station of the same name.
 *
 * The rows of a group arrive when the reader asks for the group (js/app.js#ensureGroups): searchRows() gives the
 * entries of the rows from a position on, so the ones that load later join the list.
 *
 * Pure: entries from the decoded dataset; no DOM, no numbers shown (a row names what it is and where).
 */
import {areaWord} from './areas.js';
import {provinces} from './model.js';
import {PROVINCE_AKA, withoutMueang} from './shell/fuzzy.js';

export const SEARCH_KINDS = Object.freeze([
  {id: 'province', level: 'province', auto: true}, {id: 'area', level: 'district', auto: true},
  // An office comes before a station of the same name, and the station is not chosen ahead: the page is about offices.
  {id: 'group', auto: true}, {id: 'type', auto: true}, {id: 'office'}, {id: 'station', level: 'station'},
]);
/** Words a name may begin with, or carry, that people add or leave out; an array is one word and its abbreviations. */
export const SEARCH_HEADS = Object.freeze([['สถานีตำรวจนครบาล', 'สน.'], ['สถานีตำรวจภูธร', 'สภ.'], ['องค์การบริหารส่วนตำบล', 'อบต.'], ['องค์การบริหารส่วนจังหวัด', 'อบจ.'], ['เทศบาลตำบล', 'ทต.'],
  ['เทศบาลเมือง', 'ทม.'], ['เทศบาลนคร', 'ทน.'], 'ที่ว่าการอำเภอ', 'สำนักงานเขต', 'ศาลากลางจังหวัด', 'สำนักงาน']);
/** What to try when nothing is found: the kinds of name this demo knows. */
export const SEARCH_HINT = 'ลองชื่อหน่วยงาน ประเภท หมวด สถานี เขต/อำเภอ หรือจังหวัด';

/** The names of the place a row is in — one array per place, shared by its rows (the index keeps one key for it). */
const WITHIN = new Map();
function withinOf(r, index) {
  const key = r.area || r.province || '';
  if (!WITHIN.has(key)) {
    const a = r.area ? index.byId.get(r.area) : null, p = provinces().find(x => x.code === r.province);
    WITHIN.set(key, [a?.name, a?.nameEn, p?.th, p?.en]);
  }
  return WITHIN.get(key);
}

/** The entries of data.rows from a position on: the rows of a group that loads later join the list through this. */
export function* searchRows({data, index}, from = 0) {
  // The array is read as it stands at each step, so rows that arrive while it is being read are read too.
  for (let i = from; i < data.rows.length; i++) {
    const r = data.rows[i];
    yield {id: r.id, kind: 'office', name: r.name, within: withinOf(r, index), province: r.province, area: r.area, weight: r.importance || 0, row: r};
  }
}

/** Every entry, the few places and filters first, then the offices that are loaded. */
/**
 * The English an English page shows for a word of the page's own vocabulary (js/lang-en.js through `en`, which is
 * js/shell/i18n.js#translate there and nothing on a Thai page): the list finds the entry by it and heads its row with
 * it. The data keeps these words in Thai only.
 */
const englishOf = (en, th) => { const x = en ? en(th) : null; return typeof x === 'string' && x && x !== th && !/\p{Script=Thai}/u.test(x) ? x : undefined; };

export function* searchEntries({data, index, en = null}) {
  const byCode = new Map(provinces().map(p => [p.code, p]));
  for (const p of provinces()) yield {id: p.code, kind: 'province', name: p.th, nameEn: p.en, aka: PROVINCE_AKA[p.th], codes: [p.code, p.dopa], province: p.code};
  for (const a of index.byId.values()) {
    const p = byCode.get(a.province);
    yield {id: a.id, kind: 'area', name: a.name, nameEn: a.nameEn, also: withoutMueang(a.name), codes: [a.id], within: [p?.th, p?.en], province: a.province, area: a.id};
  }
  for (const s of data.stations) yield {id: s.id, kind: 'station', name: s.name, nameEn: s.nameEn, station: s};
  for (const g of data.groups) yield {id: g.id, kind: 'group', name: g.th, nameEn: g.en, aka: [g.short]};
  // A type goes by its short name too (อบต., ทต.); the points without a type are no entry.
  for (const t of data.types) if (t.id !== '') yield {id: t.id, kind: 'type', name: t.th, nameEn: englishOf(en, t.th), aka: [t.short], type: t};
  yield* searchRows({data, index});
}

/** The line under a name in the list: what it is and where. Thai; an English page translates it part by part. */
export function searchNote(entry, {index, data}) {
  const province = code => provinces().find(p => p.code === code)?.th || '';
  if (entry.kind === 'province') return 'จังหวัด';
  if (entry.kind === 'area') return [areaWord(entry.province), province(entry.province)].filter(Boolean).join(' · ');
  // A station reads as the head of its own panel does: the word, its lines, “กำลังสร้าง” while it is being built.
  if (entry.kind === 'station') return ['สถานีรถไฟฟ้า', ...(entry.station.lines || []), entry.station.status === 'construction' ? 'กำลังสร้าง' : ''].filter(Boolean).join(' · ');
  if (entry.kind === 'group') return 'หมวด';
  if (entry.kind === 'type') return ['ประเภท', entry.type.group?.th].filter(Boolean).join(' · ');
  const r = entry.row, a = r.area ? index.byId.get(r.area) : null;
  return [r.type?.short || r.type?.th, a?.name, province(r.province)].filter(Boolean).join(' · ');
}
