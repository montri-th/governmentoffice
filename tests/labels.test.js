import test from 'node:test';
import assert from 'node:assert/strict';
import {rankLabelCandidates, shortName, labelParts, centreCandidates, placeLabels, LABEL_MIN_ZOOM, LABEL_MAX} from '../js/labels.js';

// The Hotel rule of 2026-11-01 (point 5): names near the middle of the view, most important first (the type's tier,
// then recorded personnel), short (icons before words), never covering the chrome or each other.
test('labels: importance first, then nearness to the centre; stable', () => {
  const c = [{row: {id: 'b', importance: 0.5}, d: 0.1}, {row: {id: 'a', importance: 0.9}, d: 0.9}, {row: {id: 'c', importance: 0.5}, d: 0.05}];
  assert.deepEqual(rankLabelCandidates(c).map(x => x.row.id), ['a', 'c', 'b']);
  assert.ok(LABEL_MIN_ZOOM >= 12 && LABEL_MAX.phone < LABEL_MAX.desktop);
});

test('short names use the forms Thai readers use for these offices; the place inside the name stays', () => {
  assert.equal(shortName({name: 'องค์การบริหารส่วนตำบลหนองบัวศาลา'}), 'อบต.หนองบัวศาลา');
  assert.equal(shortName({name: 'องค์การบริหารส่วนจังหวัดลำพูน'}), 'อบจ.ลำพูน');
  assert.equal(shortName({name: 'เทศบาลนครหาดใหญ่'}), 'ทน.หาดใหญ่');
  assert.equal(shortName({name: 'เทศบาลตำบลหัวทะเล'}), 'ทต.หัวทะเล');
  assert.equal(shortName({name: 'สถานีตำรวจภูธรเมืองยะลา'}), 'สภ.เมืองยะลา');
  assert.equal(shortName({name: 'สถานีตำรวจนครบาลนางเลิ้ง'}), 'สน.นางเลิ้ง');
  assert.equal(shortName({name: 'ที่ว่าการอำเภอบางพลี'}), 'อำเภอบางพลี');
  assert.equal(shortName({name: 'สถานีดับเพลิงภูเขาทอง'}), 'ดับเพลิง ภูเขาทอง');
  assert.equal(shortName({name: 'ศาลจังหวัดนครราชสีมา'}), 'ศาลจังหวัดนครราชสีมา', 'a court keeps its whole name');
  assert.equal(shortName({name: '(กรมสรรพากร)'}), 'กรมสรรพากร', 'a name wrapped in brackets loses them');
  assert.equal(shortName({name: 'อบต.'}), 'อบต.', 'never shorter than 3 characters: the full name stays');
});

test('candidates come from the central ellipse only; placement avoids blockers and other labels and respects the cap', () => {
  const rows = Array.from({length: 30}, (_, i) => ({id: `h${i}`, longitude: i, latitude: 0, importance: 1 - i / 30}));
  const box = {left: 0, right: 1000, top: 0, bottom: 600};
  const project = ([x]) => ({x: 100 + x * 30, y: 300});
  const cands = centreCandidates(rows, project, box, {skip: 'h3'});
  assert.ok(cands.every(c => Math.abs(c.x - 500) <= 360) && !cands.some(c => c.row.id === 'h3'));
  const blockers = [{left: 380, right: 520, top: 0, bottom: 600}];
  const placed = placeLabels(rankLabelCandidates(cands), () => ({w: 80, h: 20}), () => 5, box, {max: 4, blockers});
  assert.ok(placed.length <= 4);
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const p of placed) assert.ok(!blockers.some(b => overlaps(p.box, b)), 'never on the chrome');
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert.ok(!overlaps(placed[i].box, placed[j].box), 'never on another label');
});

test('label text: one short name and the recorded personnel (no number when unknown)', () => {
  assert.deepEqual(labelParts({name: 'เทศบาลนครหาดใหญ่', staff: 2500}), {site: 'ทน.หาดใหญ่', staff: 2500});
  assert.deepEqual(labelParts({name: 'สถานีตำรวจภูธรเมืองยะลา', staff: null}), {site: 'สภ.เมืองยะลา', staff: null}, 'unknown personnel → no number, never 0');
});
