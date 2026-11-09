/**
 * Government Office · page language (citymeter-shell, js/shell/i18n.js). js/app.js imports this module first, so an
 * English page is translated before anything renders. The words are in js/lang-en.js. Names come from the data's own
 * English and are never translated here (demo-platform-review §5.8): provinces and districts from the area index
 * (OpenGISData-Thailand names, DOPA-credited, data/area-index.json metadata.englishNames), stations from their nameEn,
 * the groups from groups[].en. The production dataset gives no English names for its offices and places, nor for most
 * agencies: those stay Thai (keepThai). Categories, types and ministries are words of the dictionary.
 */
import {LANG, registerDictionary, registerNames, keepThai, startTranslation} from './shell/i18n.js';
import GOV_EN from './lang-en.js';

const THAI = /[ก-ฺเ-๎]/;

if (LANG === 'en') {
  registerDictionary(GOV_EN);
  startTranslation();
  // The English is a draft until reviewed (demo-platform-review §5.8): the help dialog says so.
  const note = () => {
    const intro = document.querySelector('.usage-dialog .help-intro');
    if (!intro || document.getElementById('draft-english-note')) return;
    const p = document.createElement('p');
    p.id = 'draft-english-note';
    p.className = 'help-intro';
    p.textContent = 'English is a draft translation from the Thai. The dataset gives no English names for its offices, places and most agencies, so they stay in Thai. The product statement is in Thai.';
    intro.after(p);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', note, {once: true}); else note();
}

/** Register the English the data carries. index = js/areas.js buildAreaIndex, data = js/model.js decodeDataset. */
export function registerDataNames({index, data}) {
  if (LANG !== 'en') return;
  const labels = {};
  for (const g of data?.groups || []) if (g.th && g.en) labels[g.th] = g.en;
  registerDictionary({exact: labels});
  const pairs = [];
  for (const p of index?.provinces || []) if (p.nameEn) pairs.push([p.name, p.nameEn], [`จังหวัด${p.name}`, p.nameEn]);
  const bangkok = (index?.provinces || []).find(p => p.id === 'BKK')?.nameEn;
  if (bangkok) pairs.push(['กรุงเทพฯ', bangkok], ['กรุงเทพ', bangkok]);
  for (const a of index?.areas || []) {
    if (!a.nameEn) continue;
    pairs.push([a.name, a.nameEn], [`${a.province === 'BKK' ? 'เขต' : 'อำเภอ'}${a.name}`, a.nameEn]);
  }
  // Stations: the name alone, with “สถานี”, and with their lines as js/panel.js writes them (“อโศก (สุขุมวิท)”).
  const lineEn = l => (THAI.test(l) ? GOV_EN.exact[l] || null : l);
  const thaiStations = [];
  for (const s of data?.stations || []) {
    if (!s.nameEn) {
      const th = s.lines?.length ? `${s.name} (${s.lines.join(' · ')})` : '';
      thaiStations.push(s.name, `สถานี${s.name}`, ...(th ? [th, `สถานี${th}`] : []));
      continue;
    }
    pairs.push([s.name, s.nameEn], [`สถานี${s.name}`, `${s.nameEn} station`]);
    const lines = (s.lines || []).map(lineEn);
    if (s.lines?.length && lines.every(Boolean)) {
      const th = `${s.name} (${s.lines.join(' · ')})`, en = `(${lines.join(' · ')})`;
      pairs.push([th, `${s.nameEn} ${en}`], [`สถานี${th}`, `${s.nameEn} station ${en}`]);
    }
  }
  registerNames(pairs);
  // The moves and openings (06_RECENT_PROD_GAPS) are research records shown as written: names, agencies, places, hosts,
  // what a date and a point mean.
  const records = new Set(thaiStations);
  for (const e of data?.events || []) for (const v of [e.name, e.agency, e.place, e.oldPlace, e.host, e.dateMeaning, e.pointMeaning, e.districtTh]) if (v && THAI.test(v)) records.add(v);
  keepThai(records);
  registerRowNames(data?.rows || []);
}

/** The names of rows (offices.json, then each group file as it loads, from index `from`): Thai names stay Thai. */
export function registerRowNames(rows, from = 0) {
  if (LANG !== 'en') return;
  const thai = new Set();
  for (let i = from; i < rows.length; i++) {
    const r = rows[i];
    if (r.name && THAI.test(r.name)) thai.add(r.name);
    if (r.agency && THAI.test(r.agency)) thai.add(r.agency);
  }
  keepThai(thai);
}
