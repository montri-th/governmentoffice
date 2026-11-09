/**
 * Contextual outbound actions: the next question a reader has at each view, answered outside the demo.
 *
 *  - ถาม Google AI — Google Search with a question written for the view: an office (opening hours, how to get in
 *    touch, services, recent moves), a district or a station (which offices serve it and where), a type (how many,
 *    where), a building, or the country/province overview (offices, moves and new buildings). Google answers at the
 *    top of the results (AI Overview) and its AI Mode tab carries the question on. Never a link straight into AI Mode
 *    (`udm=50`): Google stops one that comes from another site at “Continue with this search?” (Hotel 0.3.3, measured
 *    2026-11-02 for long and short questions, with or without a referrer; a typed address or Google's own AI Mode tab
 *    opens without it). Owner 2026-11-02: “ทำให้มันตอบทันเลยได้มั้ย”;
 *  - Street View — only where the view has a point (the office's production point, or a station's reference point,
 *    which is not an entrance: the label says "ใกล้");
 *  - Google Maps — a search by the office's place name (mapsPlaceName: สำนักงานเทศบาล… · ที่ว่าการอำเภอ… where production
 *    names the organisation or the area alone) + district + province (or the type + place).
 *
 * Pure: builds labels and https URLs from public names only (no user data, no internal ids). The Google names on the
 * buttons say where the answers come from (owner 2026-11-01: no caveat lines).
 * An English page (citymeter-shell 0.5.x) asks Google AI in English, with the English area and station names the data
 * gives (js/lang.js); an office keeps its Thai name (the dataset has no English one), and Google Maps keeps the Thai
 * place name measured above, which is what finds the office. The button labels are translated by js/shell/i18n.js.
 */
import {LANG, englishName, translate} from './shell/i18n.js';

const enc = encodeURIComponent;
export const googleAskURL = q => `https://www.google.com/search?q=${enc(q)}`;
export const mapsSearchURL = q => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
/**
 * Street View at a viewpoint; with `heading` (and `pitch`) the panorama opens turned that way — the building the view
 * looks at (js/office-building.js#streetViewOf, owner 2026-11-06: “streetview ถ้าเลือกแล้วต้องให้หันหน้าเข้าหาอาคารด้วยนะ”).
 */
export const streetViewURL = (lat, lon, {heading, pitch} = {}) => (Number.isFinite(lat) && Number.isFinite(lon)
  ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}${Number.isFinite(heading) ? `&heading=${Math.round(heading)}${Number.isFinite(pitch) ? `&pitch=${Math.round(pitch)}` : ''}` : ''}` : '');

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const join = (...parts) => clean(parts.filter(Boolean).join(' '));

/*
 * The name Google Maps finds as the office — not the area it serves. Production often names a local government, a
 * district office or a unit by its organisation or its area alone (เทศบาลนครเชียงใหม่, อำเภอเมืองสมุทรปราการ, เมืองพัทยา,
 * ตำบลชัยบาดาล), and Google Maps opens that municipality, district or city as a boundary (owner 2026-11-06: “มันควรจะได้
 * ตรงสำนักงานเทศบาลนครเชียงใหม่ แต่ตอนนี้กลายเป็น ขอบเขตเทศบาลเชียงใหม่ใน google maps”). Measured in Google Maps the same day,
 * with the district and province after the name: สำนักงานเทศบาลนครเชียงใหม่ · ที่ว่าการอำเภอเมืองสมุทรปราการ · ศาลาว่าการ
 * เมืองพัทยา · สำนักงานเทศบาลตำบลด่านสำโรง · องค์การบริหารส่วนตำบลบางโปรง open the office; เทศบาลนครเชียงใหม่ ·
 * อำเภอเมืองสมุทรปราการ · เมืองพัทยา open the boundary (a viewport at the point does not change that).
 */
const NAME_NOISE = /[​-‍⁠﻿]/g;
const nameOf = s => clean(String(s ?? '').normalize('NFC').replace(NAME_NOISE, '').replace(/ํา/g, 'ำ'));
/** A name that starts as an administrative area does (Google Maps reads it as that area). */
const AREA_START = /^(?:กิ่ง)?อำเภอ|^เขต|^ตำบล|^แขวง|^จังหวัด|^เทศบาล|^เมือง|^นคร|^กรุงเทพ/;
/** A name that already says what kind of place it is (an office, a station, a school, a temple …). */
const OWN_WORD = /^(?:สำนัก|เขต(?:ห้ามล่า|รักษาพันธุ์|อุทยาน|สงวน|สอบสวน|งาน)|ที่ว่าการ|ที่ทำการ|ศาลาว่าการ|ศาลากลาง|สถานี|แขวงทางหลวง|แขวงการทาง|งาน|ศูนย์|กอง|กรม|ศาล(?!า)|องค์การ|องค์กร|สมาคม|สโมสร|มูลนิธิ|โรงเรียน|โรงพยาบาล|วัด|ห้องสมุด|กศน|หน่วย|ที่พัก|ป้อม|ตู้|จุด)/;
/** Municipalities: the level word of each type (เทศบาลตำบล · เทศบาลเมือง · เทศบาลนคร). */
const MUNICIPAL = {1030: 'ตำบล', 1040: 'เมือง', 1050: 'นคร'};
/** What other kinds of place are called before an area name (กศน.ตำบล…, โรงเรียนเทศบาล…, วัดนคร…). */
const PLACE_WORD = {1080: 'ที่พักสายตรวจ', 2050: 'โรงเรียน', 2110: 'โรงเรียน', 2150: 'โรงเรียน', 2170: 'ศูนย์พัฒนาเด็กเล็ก', 2190: 'กศน.',
  2200: 'ห้องสมุดประชาชน', 2210: 'พิพิธภัณฑ์', 3010: 'โบราณสถาน', 3020: 'โบราณสถาน', 3030: 'วัด', 3040: 'สำนักสงฆ์'};

/** row: {name, type: {id}} → the name to search for in Google Maps ('' without a name). */
export function mapsPlaceName(row) {
  const n = nameOf(row?.name), id = String(row?.type?.id ?? '');
  if (!n) return '';
  if (id === '1010') { // ที่ว่าการอำเภอ
    if (/^ที่ว่าการอำเภอ/.test(n)) return n;
    const i = n.lastIndexOf('อำเภอ');
    if (OWN_WORD.test(n) && i < 0) return n;
    return `ที่ว่าการอำเภอ${i >= 0 ? n.slice(i + 'อำเภอ'.length) : n}`;
  }
  if (MUNICIPAL[id]) {
    // The municipality's own name (production's spelling, เทศบาบ… included), or a city's district: สำนักงานแขวงเม็งราย.
    if (/^(?:เทศบา|แขวง|เขต)/.test(n) && !OWN_WORD.test(n)) return `สำนักงาน${n}`;
    if (OWN_WORD.test(n)) return n; // the office's own name, or another organisation's (as production holds it)
    return `สำนักงานเทศบาล${n.startsWith(MUNICIPAL[id]) ? '' : MUNICIPAL[id]}${n}`;
  }
  if (id === '1020') { // อบต.
    if (/ส่วนตำบล|^อบต|^อง(?:ค์)?การ/.test(n)) return n; // the organisation's name, production's spelling included
    if (/^เทศบา/.test(n)) return `สำนักงาน${n}`;
    if (OWN_WORD.test(n)) return n;
    return `องค์การบริหารส่วน${n.startsWith('ตำบล') ? '' : 'ตำบล'}${n}`;
  }
  if (id === '1060' && /^เมืองพัทยา/.test(n)) return `ศาลาว่าการ${n}`;
  if (id === '1121') return /ดับเพลิง|^สถานี/.test(n) ? n : `สถานีดับเพลิง${n}`;
  if (PLACE_WORD[id] && AREA_START.test(n) && !OWN_WORD.test(n)) return `${PLACE_WORD[id]}${n}`;
  return n;
}
/**
 * ctx: {kind: 'office'|'building'|'area'|'station'|'type'|'overview', row?, area?: {place, province}, station?, type?,
 *       province?, point?: {lat, lon, role}, rows?}
 * → [{id, label, href, note}] in display order (only the actions that apply).
 */
export function contextActions(ctx = {}, lang = LANG) {
  const out = [], place = ctx.area ? join(ctx.area.place, ctx.area.province) : '';
  const add = (id, label, href, note = '') => { if (href) out.push({id, label, href, note}); };
  if (lang === 'en') englishQuestions(ctx, add);
  else if (ctx.kind === 'office' && ctx.row) {
    const r = ctx.row, name = clean(r.name);
    const what = r.office ? 'เปิดทำการวันและเวลาไหน ติดต่อและให้บริการเรื่องอะไรบ้าง ย้ายที่ตั้งหรือมีจุดบริการใหม่ไหม และเดินทางไปอย่างไร'
      : 'คืออะไร อยู่ตรงไหน และเดินทางไปอย่างไร';
    add('ai', 'ถาม Google AI', googleAskURL(`${join(name, place ? `(${place})` : '')} ${what}`));
    add('maps', 'Google Maps', mapsSearchURL(join(mapsPlaceName(r) || name, ctx.area?.place, ctx.area?.province)));
  } else if (ctx.kind === 'building') {
    const names = [...new Set((ctx.rows || []).map(r => clean(r.name)).filter(Boolean))].slice(0, 2);
    add('ai', 'ถาม Google AI', googleAskURL(`${join(names.join(' และ '), place)} อยู่ในอาคารหรือบริเวณเดียวกันไหม และรอบ ๆ มีหน่วยงานอะไรอีกบ้าง`));
  } else if (ctx.kind === 'area' && ctx.area) {
    add('ai', 'ถาม Google AI', googleAskURL(`หน่วยงานราชการใน${clean(ctx.area.place)} ${clean(ctx.area.province)} มีที่ว่าการอำเภอ สำนักงานเขตหรือเทศบาล สถานีตำรวจ สถานีดับเพลิง และศาลที่ไหนบ้าง มีที่ไหนย้ายหรือเปิดใหม่ล่าสุด`));
    add('maps', 'Google Maps', mapsSearchURL(`สถานที่ราชการ ${join(ctx.area.place, ctx.area.province)}`));
  } else if (ctx.kind === 'station' && ctx.station) {
    const s = ctx.station, line = (s.lines || []).join(' ');
    add('ai', 'ถาม Google AI', googleAskURL(`หน่วยงานราชการใกล้สถานี${clean(s.name)}${line ? ` (${clean(line)})` : ''} มีที่ไหนบ้าง เดินไปกี่นาที และให้บริการอะไร`));
    add('maps', 'Google Maps', mapsSearchURL(`สถานที่ราชการใกล้สถานี${clean(s.name)}`));
  } else if (ctx.kind === 'type' && ctx.type) {
    add('ai', 'ถาม Google AI', googleAskURL(`${clean(ctx.type.th)} ในประเทศไทยมีกี่แห่ง ให้บริการอะไร และมีแห่งไหนย้ายหรือเปิดใหม่ล่าสุด`));
  } else if (ctx.kind === 'overview') {
    const where = clean(ctx.province) || 'ประเทศไทย';
    add('ai', 'ถาม Google AI', googleAskURL(`หน่วยงานราชการใน${where} ล่าสุดมีสำนักงานไหนย้ายที่ตั้ง เปิดอาคารใหม่ หรือเปิดจุดบริการใหม่บ้าง`));
  }
  const p = ctx.point;
  if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
    add('streetview', p.role === 'station' ? 'Street View ใกล้สถานี' : 'Street View', streetViewURL(p.lat, p.lon, p),
      Number.isFinite(p.heading) ? 'หันหน้าเข้าหาอาคารที่กำลังดูบนแผนที่' : '');
  }
  return out;
}

/** The Google AI questions of an English page (the Maps searches stay the Thai ones that find the place). */
function englishQuestions(ctx, add) {
  // N: a name (the data's English, else as given); T: a word of the dictionary (a type, a line), else as given.
  const N = s => englishName(clean(s)), T = s => translate(clean(s)) ?? clean(s);
  const where = ctx.area ? [N(ctx.area.place), N(ctx.area.province)].filter(Boolean).join(', ') : '';
  if (ctx.kind === 'office' && ctx.row) {
    const r = ctx.row, name = clean(r.name);
    const what = r.office ? 'what are its opening days and hours, how do I contact it, which services does it offer, has it moved or opened a new service point, and how do I get there?'
      : 'what is it, where is it, and how do I get there?';
    add('ai', 'ถาม Google AI', googleAskURL(`${name}${where ? ` (${where})` : ''}: ${what}`));
    add('maps', 'Google Maps', mapsSearchURL(join(mapsPlaceName(r) || name, ctx.area?.place, ctx.area?.province)));
  } else if (ctx.kind === 'building') {
    const names = [...new Set((ctx.rows || []).map(r => clean(r.name)).filter(Boolean))].slice(0, 2);
    add('ai', 'ถาม Google AI', googleAskURL(`Are ${names.join(' and ')}${where ? ` (${where})` : ''} in the same building or compound, and which other offices are around them?`));
  } else if (ctx.kind === 'area' && ctx.area) {
    add('ai', 'ถาม Google AI', googleAskURL(`Government offices in ${where}: where are the district office, the district or municipal office, police stations, fire stations and courts, and which have moved or opened recently?`));
    add('maps', 'Google Maps', mapsSearchURL(`สถานที่ราชการ ${join(ctx.area.place, ctx.area.province)}`));
  } else if (ctx.kind === 'station' && ctx.station) {
    const s = ctx.station, line = (s.lines || []).map(T).join(', ');
    add('ai', 'ถาม Google AI', googleAskURL(`Government offices near ${N(s.name)} station${line ? ` (${line})` : ''}: where are they, how many minutes' walk, and what services do they offer?`));
    add('maps', 'Google Maps', mapsSearchURL(`สถานที่ราชการใกล้สถานี${clean(s.name)}`));
  } else if (ctx.kind === 'type' && ctx.type) {
    add('ai', 'ถาม Google AI', googleAskURL(`${T(ctx.type.th)} in Thailand: how many are there, what services do they offer, and which have moved or opened recently?`));
  } else if (ctx.kind === 'overview') {
    const place = N(ctx.province) || 'Thailand';
    add('ai', 'ถาม Google AI', googleAskURL(`Government offices in ${place}: which offices have recently moved, opened a new building or opened a new service point?`));
  }
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** The action bar (icon + short label). '' when nothing applies. */
export function actionBar(ctx) {
  const list = contextActions(ctx);
  if (!list.length) return '';
  return `<div class="ask-bar" role="group" aria-label="ค้นต่อใน Google">${list.map(a => `<a class="ask-link ask-${esc(a.id)}" href="${esc(a.href)}" target="_blank" rel="noopener noreferrer"${a.note ? ` title="${esc(a.note)}"` : ''}><i class="pictogram pic-${a.id === 'ai' ? 'ai' : a.id === 'streetview' ? 'streetview' : 'maps'}" aria-hidden="true"></i><span>${esc(a.label)}</span></a>`).join('')}</div>`;
}
