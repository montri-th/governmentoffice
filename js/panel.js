/**
 * Reading panel views as HTML strings. Pure: no DOM access, no map.
 *
 * Every actionable element carries data-action (+ data-id / data-value); the app binds one delegated handler.
 * Actions: select-area · select-office · select-building · select-station · select-province · filter-type ·
 * filter-group · set-metric · back · explore-top · clear-focus · open-charts · open-table · clear-filter · leave-area.
 *
 * Copy (the Hotel rule of 2026-11-01, “เรื่องภาษา ขอที่ กระชับอ่านเข้าใจง่าย ใช้ symbol, logo, icon, charts มาช่วยทำให้
 * text กระชับ … ตรงกับ context ของ ICP ตาม product statement ไม่มี caveats เลย และเป็นธรรมชาติ”): short Thai in the words
 * of people who plan services, choose a site or deal with government offices; pictograms and small bar charts carry
 * what a sentence used to; no caveat on screen. Exactness comes from the names themselves — “บุคลากรที่บันทึก”,
 * “ระยะตรง”, a rank “จาก N”, the numerator and denominator of every share (visible, or in the tile's title and
 * accessible name) — and from one provenance line per view: dataset · source · date · boundary, then “วิธีนับ”
 * (DATA_METHOD.md, where the method and its limits live). Two measures (js/model.js#METRICS): หน่วยงาน (default) ·
 * บุคลากร. Unknown personnel is never 0 (“ไม่ทราบจำนวนบุคลากร”, a hatched bar). Distances are straight lines (the
 * distance pictogram; “ระยะตรง” in titles). An office's pin inside a drawn building is “หน่วยงานในอาคารนี้” /
 * “อีก N แห่งในอาคารนี้”, never “ตั้งอยู่ใน”. Sources, methods and ids sit in one closed <details>.
 */
import {productionLink, provinceByCode, hasPoint, stationLink, typeParam, SCHOOL_SITE} from './model.js';
import {areaWord} from './areas.js';
import {cueMarkup} from './cues.js';
import {actionBar} from './ask.js';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const num = n => NUMBER.format(n);
/** Whole-number share; a non-zero part never prints as 0% ("<1%"). */
export const pct = (part, whole) => (!whole ? '—' : part && Math.round((part / whole) * 100) === 0 ? '<1%' : `${NUMBER.format(Math.round((part / whole) * 100))}%`);
/** A number and its unit never split across lines in running text. */
const nw = html => `<span class="nowrap">${html}</span>`;
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
/** Straight-line distance for display: "320 ม." / "1.4 กม.". */
export const meters = m => (!Number.isFinite(m) ? '' : m < 1000 ? `${num(Math.round(m / 10) * 10)} ม.` : `${(m / 1000).toLocaleString('th-TH', {maximumFractionDigits: 1})} กม.`);
/** A decorative pictogram of the approved subset (js/navigation.js PICTOGRAM_CONTRACT); the text carries the meaning. */
const pic = (kind, cls = '') => `<i class="${cls ? `${cls} ` : ''}pictogram pic-${esc(kind)}" aria-hidden="true"></i>`;
/** The method and its limits (one link at the end of every provenance line). */
export const METHOD_URL = 'DATA_METHOD.md';

export function link(url, label, cls = 'source-link') {
  const u = safeURL(url);
  return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
}
/** A source page's host as its link label ("mfa.go.th"). */
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** The line under an office's name: its agency as production names it, when that is not the office's own name. */
export function subLine(r, cls, tag = 'p') {
  const agency = r?.agency && r.agency !== r.name ? r.agency : '';
  const text = [agency, r?.ministry && r.ministry !== agency ? r.ministry : ''].filter(Boolean).join(' · ');
  return text ? `<${tag} class="${cls}">${esc(text)}</${tag}>` : '';
}

export function thaiDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d} ${months[m - 1]} ${y + 543}`;
}

/** Metric tile with a decorative pictogram; value may be a preformatted string. `detail` (numerator and denominator)
 *  is the tile's title and part of its accessible text. */
export function metricTile(value, label, kind = '', detail = '') {
  const shown = typeof value === 'string' ? value : num(value);
  return `<div class="metric${kind ? ` metric-${kind}` : ''}"${detail ? ` title="${esc(detail)}"` : ''}>${pic(kind || 'plain', 'metric-symbol')}<strong class="data-number">${esc(shown)}</strong><span>${esc(label)}</span>${detail ? `<span class="sr-only">${esc(detail)}</span>` : ''}</div>`;
}
/** The personnel tile: the recorded total, or “—” (its title says why) when no office of the selection records one. */
const staffTile = (staff, count, label = 'บุคลากร') => (staff || !count
  ? metricTile(staff || 0, label, 'staff', staff ? 'บุคลากรที่ production บันทึกในหน่วยงานที่บันทึกรายแห่ง' : '')
  : metricTile('—', label, 'staff', 'ไม่ทราบจำนวนบุคลากร'));
/** "1,200 คน", or “ไม่ทราบจำนวนบุคลากร” for offices whose personnel is all unknown (never “0 คน”). */
const staffOf = (staff, count = 1) => (staff ? `${num(staff)} คน` : count ? 'ไม่ทราบจำนวนบุคลากร' : '0 คน');
/**
 * The personnel tile of a selection where personnel applies (a government office in it, `offices`): its recorded
 * total or “—”; nothing for a selection of places only (education, religion, community — personnel does not apply).
 */
const staffTileOf = (p, unit, label) => {
  const offices = p?.offices ?? p?.count ?? 0;
  return unit?.personnel !== false && offices > 0 ? staffTile(p.staff, offices, label) : '';
};
/** Personnel beside an office count in a list: recorded, unknown (government offices only), or nothing for places. */
const staffNote = (x, unit) => {
  if (unit?.personnel === false) return '';
  const offices = x.offices ?? x.count;
  return x.staff ? `${num(x.staff)} คน` : offices ? 'ไม่ทราบจำนวนบุคลากร' : '';
};
export const heading = (kind, text, id = '') => `<h3${id ? ` id="${esc(id)}"` : ''}>${pic(kind)}${esc(text)}</h3>`;

const provinceName = code => provinceByCode(code)?.th || code || '';
/** "เขตวัฒนา" / "อำเภอเมืองภูเก็ต". */
const placeName = a => (a ? `${areaWord(a.province)}${a.name}` : '');
/** One word for a list of districts: เขต (all Bangkok), อำเภอ (none), else เขต/อำเภอ. */
export const words = areas => {
  const p = new Set(areas.map(a => a.province));
  return p.size === 1 ? areaWord([...p][0]) : 'เขต/อำเภอ';
};
const valueText = (v, unit) => nw(`<strong class="data-number">${num(v)}</strong> ${esc(unit.one)}`);
/** The heading of the group bars: หมวดหน่วยงาน for government offices only, หมวด when places are in the scope. */
const groupWord = unit => (unit?.offices === false || unit?.place === 'สถานที่' ? 'หมวด' : 'หมวดหน่วยงาน');
/** An office's personnel in a list: recorded, counted at its organisation's other office, or unknown. */
export const staffText = r => (r?.staff ? `${num(r.staff)} คน` : r?.staffShared ? 'บุคลากรนับรวมกับอีกจุด' : r && !r.office ? '' : 'ไม่ทราบจำนวนบุคลากร');
/** "อโศก (สุขุมวิท)" — next to the rail pictogram; "สถานีอโศก (สุขุมวิท)" in running text. */
const stationShort = s => (s ? `${s.name}${s.lines?.length ? ` (${s.lines.join(' · ')})` : ''}` : '');
const stationName = s => (s ? `สถานี${stationShort(s)}` : '');

/* ---------- vocabularies (source details only) ---------- */

/** How the row's district was matched at build time (row.admin). */
export const ADMIN_TH = Object.freeze({
  overlay: 'ตามขอบเขตตำบล/แขวงที่ production วางจุดนี้',
});
/** Pictogram of a recent event kind (06_RECENT_PROD_GAPS). */
const EVENT_PIC = ['moved', 'opened', 'opened', 'service'];

/**
 * The provenance line every view that shows numbers ends with: dataset · source · date · boundary (each part in
 * `data-prov`, its word for screen readers), then the method link. Rail, recent events and terrain sources join the
 * source part when the view shows them.
 */
export function provenance(ctx = {}, boundary = '', {rail = false, terrain = false, events = false} = {}) {
  const meta = ctx.meta || {};
  const sources = ['CityMETER Government Officer', events ? 'ประกาศของหน่วยงาน 2567–2569' : '',
    rail ? `CityMETER Transit ${thaiDate(meta.context?.rail?.asOf || '')}`.trim() : '',
    terrain ? `SRTM 30 ม. (2543)${ctx.osmDate ? ` · OSM ${thaiDate(ctx.osmDate)}` : ''}` : ''].filter(Boolean);
  return `<p class="hint panel-foot provenance"><span class="prov-part" data-prov="dataset">${pic('dataset')}<span class="sr-only">ชุดข้อมูล </span>CityMETER Government Office</span> <span class="prov-part" data-prov="source"><span class="sr-only">แหล่ง</span>จาก ${esc(sources.join(' · '))}</span><span class="prov-part" data-prov="date">${pic('date')}<span class="sr-only">ตรวจ </span>${esc(thaiDate(meta.checkedOn || ''))}</span><span class="prov-part" data-prov="boundary">${pic('area')}<span class="sr-only">ขอบเขต </span>${esc(boundary)}</span><span class="prov-part prov-method"><a href="${METHOD_URL}" target="_blank" rel="noopener">วิธีนับ</a></span></p>`;
}

/* ---------- shared fragments ---------- */

/** Bars per group in the group's series colour + shape cue; value = the measure. */
function groupBars(byGroup, unit) {
  const val = g => (unit.id === 'count' ? g.count : g.staff);
  // Under personnel only the government-office groups are bars: it does not apply to places (never “unknown”).
  const list = byGroup.filter(g => g.count > 0 && (unit.id === 'count' || g.office)).sort((a, b) => val(b) - val(a) || b.count - a.count || a.index - b.index);
  if (!list.length) return `<p class="hint">ไม่มี${esc(unit.subject)}</p>`;
  const max = Math.max(1, ...list.map(val));
  return `<ul class="mix-list" aria-label="หมวดหน่วยงาน (${esc(unit.one)})">${list.map(g => {
    const unknown = unit.id === 'staff' && !g.staff;
    return `
    <li><button type="button" class="mix-row" data-action="filter-group" data-value="${esc(g.id)}" title="ดูเฉพาะ${esc(g.th)}${unknown ? ' · ไม่ทราบจำนวนบุคลากร' : ''}"><span class="mix-label">${cueMarkup(g.series)}${esc(g.th)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill ${unknown ? 'legend-nodata' : `category-${g.series}`}" style="width:${unknown ? 100 : Math.max(3, Math.round((val(g) / max) * 100))}%"></span></span>
      <span class="mix-value data-number">${unknown ? '—' : num(val(g))}</span></button></li>`;
  }).join('')}</ul>`;
}

function rowMeta(r, {showArea = false, index = null, distance = null} = {}) {
  const area = showArea && index && r.area ? index.byId.get(r.area) : null;
  const d = distance?.get?.(r.id);
  return [r.type?.short || '', staffText(r), area ? placeName(area) : '', Number.isFinite(d) ? meters(d) : ''].filter(Boolean).join(' · ');
}

/** Offices: cue (group) + name, then type · personnel · where · distance. */
export function officeList(rows, opts = {}) {
  return `<ul class="outlet-list">${rows.map(r => `<li><button type="button" class="brand-row" data-action="select-office" data-id="${esc(r.id)}">${cueMarkup(r.series, {className: 'row-cue'})}<span class="row-text"><strong>${esc(r.name || 'ไม่มีชื่อ')}</strong><span class="row-meta">${esc(rowMeta(r, opts))}</span></span></button></li>`).join('')}</ul>`;
}

/** "ดูทั้งหมด 193 แห่ง" under a shortened list. */
const moreButton = count => `<p class="list-more"><button type="button" class="link-button" data-action="open-table">ดูทั้งหมด ${num(count)} แห่ง</button></p>`;

/** The chip figure of a type: the measure; personnel unknown → its offices (“2 แห่ง”), never “0”. */
const chipFigure = (x, unit) => (unit.id === 'count' ? num(x.count) : x.staff ? num(x.staff) : `${num(x.count)} แห่ง`);
const chipTitle = x => `${num(x.count)} แห่ง${x.type?.group && !x.type.group.office ? '' : ` · ${x.staff ? `${num(x.staff)} คน` : 'ไม่ทราบจำนวนบุคลากร'}`}`;

/** Types as chips (group cue + short name); each filters the map to that type. */
function typeChips(list, unit) {
  if (!list.length) return '<p class="hint">ไม่มีประเภทในตัวกรองนี้</p>';
  return `<ul class="chip-list">${list.map(c => `<li><button type="button" class="brand-chip" data-action="filter-type" data-value="${esc(typeParam(c.type.id))}" title="${esc(c.type.th)} — ${chipTitle(c)} (ดูเฉพาะประเภทนี้)">${cueMarkup(c.series, {className: 'chip-cue'})}<span>${esc(c.type.short)}</span><small class="data-number">${chipFigure(c, unit)}</small></button></li>`).join('')}</ul>`;
}

/** Districts ranked by the measure, bars in the map's 41-sample ramp colour (classOf). */
function areaRanking(list, classOf, unit, {title, note = '', limit = 10, showProvince = false, id = 'rank-title'} = {}) {
  const top = list.filter(a => a.value > 0).slice(0, limit);
  if (!top.length) return '';
  const max = Math.max(1, ...top.map(a => a.value));
  return `<section class="panel-section" aria-labelledby="${esc(id)}">
    <div class="section-heading">${heading('area', title, id)}<span class="hint">${esc(note)}</span></div>
    <ol class="rank-list">${top.map((a, i) => {
      const other = unit.id !== 'count' ? `${num(a.count)} แห่ง` : staffNote(a, unit);
      const where = [showProvince ? provinceName(a.province) : '', `${num(a.value)} ${unit.one}`, other].filter(Boolean).join(' · ');
      return `<li><button type="button" class="rank-row" data-action="select-area" data-id="${esc(a.id)}" aria-label="อันดับ ${i + 1} ${esc(placeName(a))} ${showProvince ? esc(provinceName(a.province)) : ''} ${num(a.value)} ${esc(unit.one)} ${esc(other)}">
        <span class="rank-index data-number" aria-hidden="true">${i + 1}</span>
        <span class="rank-name">${esc(placeName(a))}<small>${esc(where)}</small></span>
        <span class="rank-track" aria-hidden="true"><span class="rank-fill" style="width:${Math.max(3, Math.round((a.value / max) * 100))}%;background:${esc(classOf(a))}"></span></span>
        <span class="rank-value data-number" aria-hidden="true">${num(a.value)}</span></button></li>`;
    }).join('')}</ol>
  </section>`;
}

/** Stations of CityMETER · Transit whose 500 m holds the most of the measure (each row at its nearest station). */
function stationRanking(list, unit, {title = 'สถานีที่มีหน่วยงานรอบ ๆ มากที่สุด', limit = 6} = {}) {
  const top = list.filter(s => s.value > 0).slice(0, limit);
  if (!top.length) return '';
  const max = Math.max(1, ...top.map(s => s.value));
  return `<section class="panel-section"><div class="section-heading">${heading('rail', title)}<span class="hint" title="ระยะตรงจากสถานีที่เปิดแล้ว">${pic('distance', 'hint-pic')}≤ 500 ม.</span></div>
    <ol class="rank-list">${top.map((s, i) => `<li><button type="button" class="rank-row" data-action="select-station" data-id="${esc(s.station.id)}" aria-label="${esc(stationName(s.station))} ${num(s.value)} ${esc(unit.one)}">
      <span class="rank-index data-number" aria-hidden="true">${i + 1}</span>
      <span class="rank-name">${esc(stationShort(s.station))}<small>${esc([`${num(s.count)} แห่ง`, staffNote(s, unit)].filter(Boolean).join(' · '))}</small></span>
      <span class="rank-track" aria-hidden="true"><span class="rank-fill rail-fill" style="width:${Math.max(3, Math.round((s.value / max) * 100))}%"></span></span>
      <span class="rank-value data-number" aria-hidden="true">${num(s.value)}</span></button></li>`).join('')}</ol></section>`;
}

/** "x จาก y แห่ง ห่างสถานีที่เปิดแล้วไม่เกิน 500 ม." — the title and accessible text of a rail share. */
const railDetail = (s, unit) => `${num(s.within)} จาก ${num(s.base)} ${unit.one} ห่างสถานีรถไฟฟ้าที่เปิดแล้วไม่เกิน 500 ม. (ระยะตรง)`;

/**
 * Recent moves, new office buildings and new service points (06_RECENT_PROD_GAPS), newest first: the kind, the date
 * the announcement gives with what the date means, the new place, and the announcement itself.
 */
function eventsSection(events, {limit = 6, title = 'ย้ายและเปิดใหม่ล่าสุด', showProvince = true} = {}) {
  if (!events?.length) return '';
  const top = events.slice(0, limit), rest = events.length - top.length;
  const item = e => {
    const where = [e.place, showProvince ? provinceName(e.province) : ''].filter(Boolean).join(' · ');
    const evidence = e.evidence.slice(0, 2).map((u, i) => link(u, i ? `แหล่งเพิ่ม (${hostOf(u)})` : `ประกาศ (${hostOf(u)})`)).filter(Boolean).join(' · ');
    const old = e.row ? `<button type="button" class="link-button" data-action="select-office" data-id="${esc(e.row)}">จุดเดิมใน CityMETER</button>` : '';
    return `<li class="event-row"><span class="event-kind">${pic(EVENT_PIC[e.kind] || 'opened')}${esc(e.kindTh)}</span>
      <strong>${esc(e.name)}</strong>
      <span class="event-meta"><span title="${esc(e.dateMeaning)}">${pic('date')}${esc(thaiDate(e.date))}</span>${where ? ` · ${esc(where)}` : ''}</span>
      <span class="event-links">${[evidence, old].filter(Boolean).join(' · ')}</span></li>`;
  };
  return `<section class="panel-section"><div class="section-heading">${heading('moved', title)}<span class="hint">${num(events.length)} รายการ · 2567–2569</span></div>
    <ul class="event-list">${top.map(item).join('')}</ul>${rest ? `<details class="more-events"><summary>อีก ${num(rest)} รายการ</summary><ul class="event-list">${events.slice(limit).map(item).join('')}</ul></details>` : ''}</section>`;
}

/**
 * Under a หมวด filter, the way back to the rest of the same production dataset: every group (the default scope), the
 * government offices together, and the places of education, religion and heritage, community. The default scope
 * already lists every group in its bars, so it shows nothing here.
 */
function datasetSection(groups, group) {
  if (!group || group === 'all') return '';
  const total = groups.reduce((s, g) => s + g.rows, 0), offices = groups.filter(g => g.office);
  const officeRows = offices.reduce((s, g) => s + g.rows, 0);
  const pressed = v => `${group === v ? ' is-selected' : ''}" aria-pressed="${group === v}`;
  const chip = g => `<li><button type="button" class="brand-chip${pressed(g.id)}" data-action="filter-group" data-value="${esc(g.id)}" title="${esc(g.th)} ${num(g.rows)} แห่ง">${cueMarkup(g.series, {className: 'chip-cue'})}<span>${esc(g.th)}</span><small class="data-number">${num(g.rows)}</small></button></li>`;
  return `<section class="panel-section"><div class="section-heading">${heading('dataset', 'หมวดอื่นในชุดข้อมูลเดียวกัน')}<span class="hint">ทั้งชุด ${num(total)} แห่ง</span></div>
    <ul class="chip-list"><li><button type="button" class="brand-chip${pressed('')}" data-action="filter-group" data-value="">${pic('dataset', 'chip-pic')}<span>ทุกหมวด</span><small class="data-number">${num(total)}</small></button></li><li><button type="button" class="brand-chip${pressed('offices')}" data-action="filter-group" data-value="offices">${pic('office', 'chip-pic')}<span>หน่วยงานรัฐ</span><small class="data-number">${num(officeRows)}</small></button></li>${groups.filter(g => !g.office).map(chip).join('')}</ul>
    ${group === 'education' ? `<p class="fact-line">${pic('school', 'fact-icon')}โรงเรียนรายแห่ง นักเรียน และค่าเรียน · ${link(SCHOOL_SITE, 'CityMETER School')}</p>` : ''}</section>`;
}

/* ---------- Type card (ประเภท filter) ---------- */

export function renderTypeCard(p, ctx = {}) {
  if (!p) return '';
  const unit = ctx.unit, t = p.type;
  const rail = p.rail?.base ? metricTile(pct(p.rail.within, p.rail.base), 'ใกล้รถไฟฟ้า', 'rail', railDetail(p.rail, unit)) : '';
  return `<section class="brand-card detail-head" aria-labelledby="type-title">
      <div class="identity"><span class="identity-cue">${cueMarkup(t.group?.series || 9)}</span><div>
        <p class="eyebrow">ประเภท · ${esc(t.group?.th || '')}</p>
        <h2 id="type-title">${esc(t.th)}</h2></div></div>
      ${p.scopeCount ? `<div class="metrics compact">${metricTile(p.scopeCount, 'แห่ง', 'office')}${t.group?.office && (p.scopeStaff || t.staff === 'site') ? staffTile(p.scopeStaff, p.scopeCount) : ''}${metricTile(p.provinces, 'จังหวัด', 'province')}${rail}</div>` : ''}
      ${actionBar({kind: 'type', type: t})}
      <div class="detail-actions"><button type="button" class="btn quiet" data-action="clear-filter" data-id="type">ดูทุกประเภท</button></div>
    </section>`;
}

/* ---------- Overview ---------- */

/** The district(s) with the most of the measure outside the leading province — every district tied at that value. */
function outsideLine(insight, home, unit, province) {
  const o = insight.outside;
  if (!o || province || o.value < 2) return '';
  const linkTo = a => `<button type="button" class="link-button" data-action="select-area" data-id="${esc(a.id)}">${esc(placeName(a))}</button> ${esc(provinceName(a.province))}`;
  const tied = o.tied || [o];
  const top = insight.areas[0];
  const lead = `${pic('rank')}อันดับ 1 นอก${esc(home)}`;
  if (tied.length === 1) {
    const more = top && o.value > top.value ? ` · มากกว่าทุก${esc(areaWord(insight.home))}ของ${esc(home)}` : '';
    return `<p class="aha-secondary">${lead}: ${linkTo(tied[0])} ${valueText(o.value, unit)}${more}</p>`;
  }
  const shown = tied.slice(0, 3), rest = tied.length - shown.length;
  return `<p class="aha-secondary">${lead} (เท่ากัน ${num(tied.length)} พื้นที่): ${shown.map(linkTo).join(' · ')}${rest ? ` +${num(rest)}` : ''} · ${valueText(o.value, unit)}</p>`;
}

/** Rail comparison of the Aha as two bars: the focus vs the rest of the province (bases in the title and for screen
 *  readers); hidden when nothing is near rail. */
function railCompare(insight, unit, count, w) {
  const f = insight.rail?.focus, r = insight.rail?.rest;
  if (!f || !r || !f.base || !r.base || !(f.within + r.within)) return '';
  const here = count === 1 ? placeName(insight.areas[0]) : `${num(count)} ${w}นี้`;
  const bar = (label, s) => `<li title="${esc(railDetail(s, unit))}"><span class="mix-label">${esc(label)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill rail-fill" style="width:${Math.max(2, Math.round((s.within / s.base) * 100))}%"></span></span>
      <span class="mix-value data-number">${pct(s.within, s.base)}</span><span class="sr-only">${esc(railDetail(s, unit))}</span></li>`;
  return `<div class="aha-rail"><p class="aha-rail-title">${pic('rail')}ใกล้รถไฟฟ้า ≤ 500 ม.</p>
    <ul class="mix-list rail-compare">${bar(here, f)}${bar(`${w}อื่น`, r)}</ul></div>`;
}

/**
 * focusMode: 'auto' (default top districts) · 'explicit' (user-chosen) · 'none' (every district).
 */
export function renderOverview({insight, summary, overview, focusMode = 'auto', classOf = () => 'var(--scale-count-3)', provinces = [], unknownProvince = 0,
  province = '', group = '', typeCard = '', stations = [], groups = [], ctx = {}}) {
  const unit = ctx.unit;
  const count = insight.areas.length;
  const w = words(insight.areas);
  const names = insight.areas.map(a => `<button type="button" class="link-button" data-action="select-area" data-id="${esc(a.id)}">${esc(a.name)}</button>`).join(' · ');
  const home = provinceName(insight.home);
  const subject = unit.aha || unit.subject;
  let aha;
  if (!summary.count && focusMode !== 'explicit') {
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p><h2>ไม่พบ${esc(unit.place || 'หน่วยงาน')}ตามตัวกรองนี้</h2>
      <div class="aha-actions"><button type="button" data-action="clear-filter" data-id="all" class="btn">ล้างตัวกรอง</button></div></section>`;
  } else if (focusMode === 'explicit') {
    aha = `<section class="aha is-focused" aria-label="ข้อค้นพบ"><p class="eyebrow">โฟกัส ${num(count)} ${esc(w)}</p>
      <h2>${insight.areas.map(a => esc(a.name)).join(' · ')}</h2>
      <p class="aha-copy">${valueText(insight.value, unit)}${unit.id === 'count' ? '' : ` · ${nw(`${num(insight.count)} แห่ง`)}`}</p>
      <div class="aha-actions"><button type="button" data-action="clear-focus" class="btn">ดูทุกพื้นที่</button><button type="button" data-action="open-charts" class="btn quiet">เปรียบเทียบพื้นที่</button></div></section>`;
  } else if (!count && insight.spread) {
    const sw = areaWord(insight.home), sp = insight.spread;
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p>
      <h2><span class="aha-number data-number">${num(sp.areas)}</span><span class="aha-headline">${esc(sw)}ใน${esc(home)} มี${esc(subject)}เท่ากัน ${esc(sw)}ละ ${num(sp.value)} ${esc(unit.one)}</span></h2>
      ${outsideLine(insight, home, unit, province)}
      <div class="aha-actions"><button type="button" data-action="open-charts" class="btn quiet">เปรียบเทียบพื้นที่</button></div></section>`;
  } else if (!count) {
    aha = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p><h2><span class="aha-number data-number">${num(summary.count)}</span><span class="aha-headline">แห่ง · ไม่ระบุเขต/อำเภอ</span></h2>
      <div class="aha-actions"><button type="button" data-action="open-table" class="btn">ดูรายชื่อ</button></div></section>`;
  } else {
    const toggle = focusMode === 'auto'
      ? '<button type="button" data-action="clear-focus" class="btn">ดูทุกพื้นที่</button>'
      : `<button type="button" data-action="explore-top" class="btn primary">โฟกัส ${num(count)} ${esc(w)}นี้</button>`;
    const where = count === 1 ? esc(placeName(insight.areas[0])) : ` ${nw(`${num(count)} ${esc(w)}นี้`)}`;
    const total = insight.homeValue ?? insight.homePlacedValue;
    aha = `<section class="aha${focusMode === 'auto' ? ' is-auto' : ''}" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบ</p>
      <h2><span class="aha-number data-number">${pct(insight.value, total)}</span><span class="aha-headline">ของ${esc(subject)}ใน${esc(home)} อยู่ใน${where}</span></h2>
      <p class="aha-copy">${names}<br>${nw(`<strong class="data-number">${num(insight.value)}</strong> จาก ${num(total)} ${esc(unit.one)}`)}</p>
      ${railCompare(insight, unit, count, w)}${outsideLine(insight, home, unit, province)}
      <div class="aha-actions">${toggle}<button type="button" data-action="open-charts" class="btn quiet">เปรียบเทียบพื้นที่</button></div></section>`;
  }
  const narrowed = focusMode !== 'none' && count > 0 && summary.count !== overview.count;
  const metrics = `<section class="metrics" aria-label="${narrowed ? 'ตัวเลขของพื้นที่ที่โฟกัส' : 'ตัวเลขรวมของข้อมูลที่เลือก'}">
    ${metricTile(summary.count, `แห่ง${narrowed ? ' ในโฟกัส' : ''}`, 'office')}
    ${staffTileOf(summary, unit, `บุคลากร${narrowed ? ' ในโฟกัส' : ''}`) || metricTile(summary.types, 'ประเภท', 'type')}
    ${metricTile(summary.areas, narrowed ? w : 'เขต/อำเภอ', 'area')}
    ${metricTile(summary.provinces, 'จังหวัด', 'province')}
  </section>`;
  const scopeText = province ? provinceName(province) : 'ประเทศไทย';
  const provinceRows = p => `<li><button type="button" class="province-row" data-action="select-province" data-id="${esc(p.code)}" aria-label="${esc(p.name)} ${num(p.value)} ${esc(unit.one)} กดเพื่อดูจังหวัด"><i class="province-swatch" style="background:${esc(p.fill)}" aria-hidden="true"></i><span class="province-name">${esc(p.name)}</span><span class="province-count data-number">${num(p.value)}<small>${esc(unit.one)}</small></span></button></li>`;
  const shown = provinces.slice(0, 8), rest = provinces.slice(8);
  const unknown = unknownProvince ? `<p class="hint">ไม่ระบุจังหวัด ${nw(`${num(unknownProvince)} แห่ง`)}</p>` : '';
  const provinceList = provinces.length > 1 ? `<section class="panel-section" aria-labelledby="province-title">
    <div class="section-heading">${heading('province', `จังหวัดที่มี${unit.subject}มากที่สุด`, 'province-title')}<span class="hint">${num(provinces.length)} จังหวัด</span></div>
    <ul class="province-list">${shown.map(provinceRows).join('')}</ul>
    ${rest.length ? `<details class="more-provinces"><summary>อีก ${num(rest.length)} จังหวัด</summary><ul class="province-list">${rest.map(provinceRows).join('')}</ul></details>` : ''}
    ${unknown}</section>` : '';
  const rw = province ? areaWord(province) : 'เขต/อำเภอ';
  const ranking = areaRanking(overview.ranking, classOf, unit, {title: `${rw}ที่มี${unit.subject}มากที่สุด`, note: `${num(overview.ranking.filter(a => a.value > 0).length)} ${rw}`, showProvince: !province});
  const mix = overview.count ? `<section class="panel-section"><div class="section-heading">${heading('segment', groupWord(unit))}<span class="hint">${esc(unit.one)}</span></div>${groupBars(overview.mix.byGroup, unit)}</section>` : '';
  const types = overview.types.length && !typeCard ? `<section class="panel-section"><div class="section-heading">${heading('type', `ประเภทที่มี${unit.subject}มากที่สุด`)}<span class="hint"><button type="button" class="link-button" data-action="open-charts" data-value="types">ดูทุกประเภท</button></span></div>${typeChips(overview.types, unit)}</section>` : '';
  const rail = stationRanking(stations, unit, {title: `สถานีที่มี${unit.subject}รอบ ๆ มากที่สุด`});
  const events = eventsSection(overview.events, {showProvince: !province});
  return `${typeCard}${aha}${metrics}${provinceList}${ranking}${mix}${types}${events}${rail}${datasetSection(groups, group)}${typeCard ? '' : actionBar({kind: 'overview', province: province ? provinceName(province) : ''})}${provenance(ctx, scopeText, {rail: Boolean(rail || insight.rail?.focus?.within), events: Boolean(events)})}`;
}

/* ---------- Empty selections (EVID-05) ---------- */

/**
 * measured_zero: every district is in production's national scope, so a district with no office under the filters is
 * a measured 0 of this dataset — offered with where the same filters match. Never "no data".
 */
function selectionNote(p, place, ctx) {
  if (p.coverageState !== 'measured_zero') return '';
  const elsewhere = p.scopeCount > 0
    ? `<span>พบในพื้นที่อื่น <strong class="data-number">${num(p.scopeCount)}</strong> แห่ง</span><button type="button" class="btn quiet" data-action="leave-area">ดูพื้นที่ที่พบ</button>`
    : '';
  return `<div class="empty-note" role="note"><strong>ไม่พบ${esc(ctx.unit?.place || 'หน่วยงาน')}ใน${esc(place)}${ctx.filtered ? 'ตามตัวกรองนี้' : ''}</strong>${elsewhere}</div>`;
}

/* ---------- District (เขต/อำเภอ) ---------- */

export function renderArea(p, classOf, ctx = {}) {
  if (!p) return '';
  const unit = ctx.unit, a = p.area, w = p.words;
  const place = `${w.area}${a.name}`, prov = provinceName(a.province);
  const rank = p.rank ? `<p class="rank-line">${pic('rank')}อันดับ ${num(p.rank)} จาก ${num(p.rankOf)} ทั่วประเทศ${p.rankProvince && p.rankProvinceOf > 1 ? ` · ${num(p.rankProvince)} จาก ${num(p.rankProvinceOf)} ใน${esc(prov)}` : ''}</p>` : '';
  const listLimit = 30;
  const share = p.count && p.provinceValue ? pct(p.value, p.provinceValue) : '—';
  const shareDetail = p.count && p.provinceValue ? `${num(p.value)} จาก ${num(p.provinceValue)} ${unit.one}ของ${prov}` : '';
  const railShare = p.rail?.base ? pct(p.rail.within, p.rail.base) : '—';
  const head = `<section class="detail-head">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <p class="eyebrow">${esc(w.area)} · <button type="button" class="link-button" data-action="select-province" data-id="${esc(a.province)}">${esc(prov)}</button></p>
      <h2>${esc(place)}</h2>${a.nameEn ? `<p class="subtle">${esc(a.nameEn)}</p>` : ''}
      ${rank}
      <div class="metrics compact">${metricTile(p.count, 'แห่ง', 'office')}${staffTileOf(p, unit)}${metricTile(share, `ของ${prov}`, 'province', shareDetail)}${metricTile(railShare, 'ใกล้รถไฟฟ้า', 'rail', p.rail?.base ? railDetail(p.rail, unit) : '')}</div>
      ${selectionNote(p, place, ctx)}
      ${actionBar({kind: 'area', area: {place, province: prov}})}
      <div class="detail-actions">${p.count ? '<button type="button" class="btn" data-action="open-table">ดูรายชื่อ</button><button type="button" class="btn quiet" data-action="open-charts">เปรียบเทียบพื้นที่</button>' : ''}${link(productionLink({province: a.province, area: a.id}), 'ดูใน CityMETER', 'btn quiet source-link')}</div>
    </section>
`;
  const boundary = `${place} ${prov}`;
  const events = eventsSection(p.events, {title: `ย้ายและเปิดใหม่ใน${place}`, showProvince: false});
  if (!p.count) return `${head}${events}${provenance(ctx, boundary, {events: Boolean(events)})}`;
  return `${head}    <section class="panel-section"><div class="section-heading">${heading('segment', groupWord(unit))}<span class="hint">${esc(unit.one)}</span></div>${groupBars(p.byGroup, unit)}</section>
    <section class="panel-section"><div class="section-heading">${heading('type', 'ประเภท')}<span class="hint">${esc(unit.one)}</span></div>${typeChips(p.types, unit)}</section>
    ${events}
    ${stationRanking(p.stations, unit, {title: `สถานีใกล้${unit.place || 'หน่วยงาน'}`})}
    <section class="panel-section"><div class="section-heading">${heading('office', unit.place || 'หน่วยงาน')}<span class="hint">${unit.personnel === false ? 'เรียงตามประเภท' : 'เรียงตามประเภทและบุคลากร'}</span></div>${officeList(p.rows.slice(0, listLimit))}
      ${p.count > listLimit ? moreButton(p.count) : ''}</section>
    ${provenance(ctx, boundary, {rail: Boolean(p.rail?.base), events: Boolean(events)})}`;
}

/* ---------- Nearest services (offices of the key types, straight line) ---------- */

function servicesSection(services, {title = 'บริการรัฐที่ใกล้ที่สุด'} = {}) {
  if (!services?.length) return '';
  const item = s => (s.row
    ? `<li><button type="button" class="brand-row" data-action="select-office" data-id="${esc(s.row.id)}">${cueMarkup(s.row.series, {className: 'row-cue'})}<span class="row-text"><strong>${esc(s.service.th)} · ${nw(esc(meters(s.m)))}</strong><span class="row-meta">${esc(s.row.name)}</span></span></button></li>`
    : `<li><span class="brand-row is-quiet"><span class="row-text"><strong>${esc(s.service.th)}</strong><span class="row-meta">ไม่พบในระยะ 30 กม.</span></span></span></li>`);
  return `<section class="panel-section"><div class="section-heading">${heading('compare', title)}<span class="hint" title="ระยะตรงจากจุดนี้">${pic('distance', 'hint-pic')}ระยะตรง</span></div>
    <ul class="outlet-list services">${services.map(item).join('')}</ul></section>`;
}

/* ---------- Station (CityMETER · Transit) ---------- */

export function renderStation(p, ctx = {}) {
  if (!p) return '';
  const unit = ctx.unit, s = p.station;
  const building = s.status !== 'operating';
  const listLimit = 40;
  const head = `<section class="detail-head station">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <div class="identity">${pic('rail', 'identity-pic')}<div>
        <p class="eyebrow">สถานีรถไฟฟ้า${s.lines?.length ? ` · ${esc(s.lines.join(' · '))}` : ''}${building ? ` · ${pic('construction')}กำลังสร้าง` : ''}</p>
        <h2>สถานี${esc(s.name)}</h2>${s.nameEn ? `<p class="subtle">${esc(s.nameEn)}</p>` : ''}</div></div>
      <div class="metrics compact">${metricTile(p.count, 'แห่ง', 'office')}${staffTileOf(p, unit)}${metricTile(p.radius, 'ม. รอบสถานี', 'distance', `ระยะตรงจากจุดอ้างอิงของสถานี ${meters(p.radius)}`)}</div>
      ${actionBar({kind: 'station', station: s, point: {lat: s.lat, lon: s.lon, role: 'station'}})}
      <div class="detail-actions">${link(stationLink(s), 'ดูใน CityMETER Transit', 'btn quiet source-link')}</div>
    </section>
`;
  const boundary = `รัศมี ${meters(p.radius)} จากสถานี${s.name}`;
  const services = servicesSection(p.services, {title: 'บริการรัฐที่ใกล้สถานีที่สุด'});
  if (!p.count) return `${head}<div class="empty-note" role="note"><strong>ไม่พบ${esc(unit.place || 'หน่วยงาน')}รอบสถานีนี้</strong></div>${services}${provenance(ctx, boundary, {rail: true})}`;
  return `${head}    <section class="panel-section"><div class="section-heading">${heading('segment', groupWord(unit))}<span class="hint">${esc(unit.one)}</span></div>${groupBars(p.byGroup, unit)}</section>
    ${services}
    <section class="panel-section"><div class="section-heading">${heading('office', unit.place || 'หน่วยงาน')}<span class="hint">${unit.personnel === false ? 'เรียงตามประเภท' : 'เรียงตามประเภทและบุคลากร'}</span></div>${officeList(p.rows.slice(0, listLimit), {showArea: true, index: ctx.index, distance: p.distance})}
      ${p.count > listLimit ? moreButton(p.count) : ''}</section>
    ${provenance(ctx, boundary, {rail: true})}`;
}

/* ---------- Building (display-time spatial join) ---------- */

/** Where a drawn building's outline and height come from (the Hotel rule of 2026-11-01, point 3: per อปท./เขต). */
export const BUILDING_SOURCE_TH = Object.freeze({osm: 'OpenStreetMap', cm: 'CityMETER Building V4'});

export function renderBuilding(b, ctx = {}) {
  if (!b) return '';
  const w = b.words;
  const area = b.area ? `${w.area}${b.area.name}` : '';
  const source = BUILDING_SOURCE_TH[b.kind] || BUILDING_SOURCE_TH.osm;
  // “สูงราว”: a CityMETER height is the dataset's model estimate, an OSM height a tag or the schema's default; the
  // source is named in the title and in the provenance line.
  const height = b.height != null ? `<span title="ความสูงจาก ${esc(source)}">สูงราว ${num(Math.round(b.height))} ม.</span>` : '';
  const withPoint = b.rows.find(hasPoint);
  return `<section class="detail-head building">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <p class="eyebrow">${pic('building')} ${b.area ? `<button type="button" class="link-button" data-action="select-area" data-id="${esc(b.area.id)}">${esc(area)}</button>` : 'อาคาร'}${height ? ` · ${height}` : ''}</p>
      <h2>${esc(ctx.unit?.place || 'หน่วยงาน')}ในอาคารนี้</h2>
      <div class="metrics compact">${metricTile(b.count, 'แห่ง', 'office')}${staffTileOf(b, ctx.unit)}</div>
      ${actionBar({kind: 'building', rows: b.rows, area: b.area ? {place: area, province: provinceName(b.area.province)} : null,
        point: withPoint ? {lat: withPoint.latitude, lon: withPoint.longitude, role: 'point'} : null})}
    </section>
    <section class="panel-section"><div class="section-heading">${heading('office', ctx.unit?.place || 'หน่วยงาน')}<span class="hint">${num(b.count)}</span></div>${officeList(b.rows.slice(0, 40), {showArea: b.areaCount > 1, index: ctx.index})}
      ${b.count > 40 ? moreButton(b.count) : ''}</section>
    ${provenance(ctx, `หมุดในขอบอาคาร ${source}${area ? ` · ${area}` : ''}`)}`;
}

/* ---------- Office ---------- */

/** Offices of the same group round an office: the rule as chips, nearest first, and everything round it. */
function nearbySection(c, group, groups = []) {
  if (!c) return '';
  const rule = [`${pic('segment')}${esc(group || 'หมวดเดียวกัน')}`, `${pic('distance')}≤ ${esc(meters(c.radius))}`].map(t => `<span class="rule-chip">${t}</span>`).join('');
  const list = c.rows.length
    ? `<ul class="outlet-list compset">${c.rows.map(({row: r, m}) => `<li><button type="button" class="brand-row" data-action="select-office" data-id="${esc(r.id)}">${cueMarkup(r.series, {className: 'row-cue'})}<span class="row-text"><strong>${esc(r.name)}</strong><span class="row-meta">${esc([meters(m), r.type?.short, staffText(r)].filter(Boolean).join(' · '))}</span></span></button></li>`).join('')}</ul>`
    : '<p class="hint">ไม่พบหน่วยงานหมวดเดียวกันในระยะนี้</p>';
  const around = [...c.around.byGroup].sort((a, b) => b[1] - a[1]).map(([gi, n]) => {
    const g = groups[gi];
    return g ? `<span class="fact-chip" title="${esc(g.th)} รอบ ${esc(meters(c.radius))}">${cueMarkup(g.series)}${esc(g.short)} ${nw(num(n))}</span>` : '';
  }).join('');
  return `<section class="panel-section"><div class="section-heading">${heading('compare', 'หน่วยงานรอบ ๆ')}<span class="hint">${num(c.matches)} แห่ง</span></div>
    <p class="rule-chips" title="หมวดเดียวกัน ในระยะตรง ${esc(meters(c.radius))} เรียงใกล้ก่อน">${rule}</p>${list}
    ${c.around.count ? `<p class="fact-line">${pic('office', 'fact-icon')}ทุกหมวดรอบ ${esc(meters(c.radius))} ${nw(`<strong class="data-number">${num(c.around.count)}</strong> แห่ง`)}</p><div class="fact-chips">${around}</div>` : ''}</section>`;
}

/** The office's own recent move or opening (06_RECENT_PROD_GAPS linked to this production row). */
function ownEvents(events) {
  if (!events?.length) return '';
  return events.map(e => `<div class="event-box" role="note"><p class="event-kind">${pic(EVENT_PIC[e.kind] || 'moved')}${esc(e.kindTh)} · ${esc(thaiDate(e.date))}</p>
    ${e.place ? `<p><strong>${esc(e.place)}</strong></p>` : ''}${e.oldPlace ? `<p class="hint">จาก ${esc(e.oldPlace)}</p>` : ''}
    <p class="event-links">${e.evidence.slice(0, 2).map((u, i) => link(u, i ? `แหล่งเพิ่ม (${hostOf(u)})` : `ประกาศ (${hostOf(u)})`)).filter(Boolean).join(' · ')}</p></div>`).join('');
}

export function renderOffice(d, ctx = {}) {
  if (!d) return '';
  const r = d.row, w = d.words;
  const prov = provinceName(r.province);
  const coords = hasPoint(r) ? `${r.latitude.toFixed(6)}, ${r.longitude.toFixed(6)}` : '';
  const areaChip = d.area
    ? `<button type="button" class="fact-chip" data-action="select-area" data-id="${esc(d.area.id)}">${pic('area')}${esc(w.area)}${esc(d.area.name)} · ${esc(prov)}</button>`
    : r.province ? `<button type="button" class="fact-chip" data-action="select-province" data-id="${esc(r.province)}">${pic('province')}${esc(prov)}</button>` : '<span class="fact-chip is-quiet">ไม่ระบุจังหวัด</span>';
  const staffChip = r.staff
    ? `<span class="fact-chip" title="บุคลากรที่ production บันทึกที่หน่วยงานนี้">${pic('staff')}${nw(`${num(r.staff)} คน`)}</span>`
    : r.staffShared && d.shared
      ? `<button type="button" class="fact-chip" data-action="select-office" data-id="${esc(d.shared.id)}" title="บุคลากรของ${esc(r.agency)}นับครั้งเดียวที่อีกจุด (${esc(d.shared.name)})">${pic('staff')}${esc(d.shared.staff ? `${num(d.shared.staff)} คน · นับที่อีกจุด` : 'นับที่อีกจุด')}</button>`
      : r.agencyStaff
        ? `<span class="fact-chip" title="บุคลากรทั้งหน่วยงานที่ production บันทึกไว้ที่จุดนี้">${pic('staff')}ทั้งหน่วยงาน ${nw(`${num(r.agencyStaff)} คน`)}</span>`
        : r.office ? `<span class="fact-chip is-quiet" title="ไม่ทราบจำนวนบุคลากร">${pic('staff')}ไม่ทราบ</span>` : '';
  const typeChip = r.type ? `<button type="button" class="fact-chip" data-action="filter-type" data-value="${esc(typeParam(r.type.id))}" title="${esc(r.type.th)} (ดูทุกแห่งของประเภทนี้)">${pic('type')}${esc(r.type.short)}</button>` : '';
  const railChip = r.rail ? `<button type="button" class="fact-chip" data-action="select-station" data-id="${esc(r.rail.station.id)}" title="สถานีที่เปิดแล้วที่ใกล้ที่สุด · ระยะตรง">${pic('rail')}${esc(stationShort(r.rail.station))} ${nw(esc(meters(r.rail.m)))}</button>` : '';
  const nextChip = r.railNext && (!r.rail || r.railNext.m < r.rail.m)
    ? `<span class="fact-chip" title="สถานีที่กำลังสร้างที่ใกล้ที่สุด · ระยะตรง">${pic('construction')}${esc(stationShort(r.railNext.station))} ${nw(esc(meters(r.railNext.m)))} · กำลังสร้าง</span>` : '';
  const bd = d.building;
  const buildingChip = bd?.others ? `<button type="button" class="fact-chip" data-action="select-building" data-id="${esc(bd.key)}" title="หมุดของหน่วยงานอีก ${num(bd.others)} แห่งอยู่ในอาคารนี้บนแผนที่">${pic('building')}อีก ${num(bd.others)} แห่งในอาคารนี้</button>` : '';
  const point = coords ? `<span class="data-number">${esc(coords)}</span>` : '<span>ไม่มีพิกัด</span>';
  // The production category, where the group name does not already say it (มหาวิทยาลัย, โรงเรียน, ความปลอดภัยชุมชน…).
  const cat = r.cat?.id && r.cat.th && !String(d.group?.th || '').includes(r.cat.th) ? r.cat.th : '';
  return `<section class="detail-head store">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <div class="identity"><span class="identity-cue">${cueMarkup(r.series)}</span><div>
        <p class="eyebrow eyebrow-cue">${esc(d.group?.th || '')}${cat ? ` · ${esc(cat)}` : ''}</p>
        <h2>${esc(r.name || 'ไม่มีชื่อ')}</h2>
        ${subLine(r, 'branch-name', 'p')}</div></div>
      ${ownEvents(d.events)}
      <div class="fact-chips">${typeChip}${staffChip}${areaChip}${railChip}${nextChip}${buildingChip}${coords ? '' : '<span class="fact-chip is-quiet">ไม่มีพิกัด</span>'}</div>
      ${actionBar({kind: 'office', row: r, area: d.area ? {place: `${w.area}${d.area.name}`, province: prov} : r.province ? {place: '', province: prov} : null,
        point: hasPoint(r) ? {lat: r.latitude, lon: r.longitude, role: 'point'} : null})}
      <details class="source-details"><summary>ที่มาและพิกัด</summary>
        <dl class="facts">
          <dt>แหล่ง</dt><dd>CityMETER Government Officer · ${esc(r.cat?.th || 'รอการยืนยัน')} · ${esc(r.type?.th || '')}</dd>
          ${r.agency ? `<dt>หน่วยงาน</dt><dd>${esc(r.agency)}${r.ministry ? ` · ${esc(r.ministry)}` : ''}</dd>` : ''}
          <dt>พื้นที่</dt><dd>${esc(ADMIN_TH[r.admin] || '')}</dd>
          <dt>พิกัด</dt><dd>${point}</dd>
          <dt>รหัส</dt><dd><span class="hint data-number">${esc(r.id)}</span></dd>
        </dl>
        <p class="links">${d.area ? link(productionLink({province: r.province, area: r.area}), 'ดูพื้นที่นี้ใน CityMETER') : ''}</p>
      </details>
    </section>
    ${hasPoint(r) ? `<section class="panel-section terrain-section"><div class="section-heading">${heading('elevation', 'ภูมิประเทศ')}</div>
      <div class="fact-chips terrain-chips" data-terrain-for="${esc(r.id)}"><span class="hint">กำลังอ่านภูมิประเทศ</span></div></section>` : ''}
    ${servicesSection(d.services)}
    ${nearbySection(d.nearby, d.group?.th, ctx.groups || [])}
    ${provenance(ctx, d.area ? `${w.area}${d.area.name} ${prov}` : prov || 'ไม่ระบุจังหวัด', {rail: Boolean(r.rail || r.railNext), terrain: hasPoint(r), events: Boolean(d.events?.length)})}`;
}

/** Terrain chips (js/terrain.js#terrainChips) as fact chips; '' when nothing is known. */
export function terrainChipsHTML(chips) {
  return chips.map(c => `<span class="fact-chip" title="${esc(c.title)}">${pic(c.kind)}${esc(c.text)}</span>`).join('');
}

/* ---------- Active filter chips ---------- */

export function renderFilterChips(values, labels) {
  const chips = [];
  const push = (key, text) => chips.push(`<li><button type="button" class="filter-chip" data-action="clear-filter" data-id="${esc(key)}" aria-label="ล้างตัวกรอง ${esc(text)}"><span>${esc(text)}</span><i aria-hidden="true">×</i></button></li>`);
  if (values.search) push('search', `ค้นหา “${values.search}”`);
  if (values.group) push('group', labels.group[values.group] || values.group);
  if (values.type) push('type', labels.type[values.type] || values.type);
  if (values.province) push('province', labels.province[values.province] || values.province);
  return chips.length ? `<ul class="filter-chips" aria-label="ตัวกรองที่ใช้อยู่">${chips.join('')}<li><button type="button" class="filter-chip clear-all" data-action="clear-filter" data-id="all">ล้างทั้งหมด</button></li></ul>` : '';
}
