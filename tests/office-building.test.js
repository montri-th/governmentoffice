import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBuilding, buildingsNear, nameSimilarity, normaliseName, streetViewOf, bearingDeg, TYPE_FOOTPRINT_M2, CHOICE} from '../js/office-building.js';
import {streetViewURL, contextActions} from '../js/ask.js';

// Ubon Ratchathani, the Juvenile and Family Court's pin (owner 2026-11-06): metres → degrees here.
const X = 104.854354, Y = 15.233665;
const mx = 1 / (111320 * Math.cos((Y * Math.PI) / 180)), my = 1 / 110574;
const at = (dx, dy) => [X + dx * mx, Y + dy * my];
/** A w × h m rectangle centred dx, dy m from the pin. */
const rect = (id, dx, dy, w, h, extra = {}) => {
  const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => at(dx + (a * w) / 2, dy + (b * h) / 2));
  return {id, outer: ring, holes: [], ...extra};
};
const keys = pieces => new Map(pieces.map(p => [p.id, `cm:${p.id}`]));
const court = {longitude: X, latitude: Y, typeId: '1202', name: 'ศาลเยาวชนและครอบครัวจังหวัดอุบลราชธานี'};

test('the court case: a pin in a coffee shop at the gate turns the camera to the court behind it, not the shop', () => {
  const shop = rect(1, 0, 0, 10.4, 10);          // 104 m², the pin inside (the 0.2.0 pick)
  const courtBlock = rect(2, 40, -55, 47, 30);   // 1,410 m², its edge about 33 m from the pin
  const kiosk = rect(3, 12, -6, 6, 6);           // a 36 m² kiosk beside the shop
  const pieces = [shop, courtBlock, kiosk];
  const pick = chooseBuilding(pieces, court, {keyOfPiece: keys(pieces)});
  assert.equal(pick.key, 'cm:2');
  assert.equal(pick.inside, false, 'named “อาคารใกล้หมุด” — the pin is not in it');
  assert.equal(pick.why, 'size');
  assert.ok(pick.areaM2 > 1300 && pick.distanceM > 30 && pick.distanceM < 50, JSON.stringify(pick));
});

test('streets: a building across the street from the pin loses to one on the pin’s side; an office stands back from it', () => {
  const district = {longitude: X, latitude: Y, typeId: '1010', name: 'ที่ว่าการอำเภอเมือง'};
  const street = {cls: 'tertiary', coords: [at(-200, 12), at(200, 12)]};    // runs east–west 12 m north of the pin
  const north = rect(1, 0, 32, 36, 24);   // 864 m², across the street, 20 m away
  const south = rect(2, 0, -38, 36, 24);  // 864 m², on the pin's side, 26 m away
  const pieces = [north, south];
  assert.equal(pickOf(pieces, district).key, 'cm:1', 'without the street: the nearer');
  assert.deepEqual(pickOf(pieces, district, {roads: [street]}), {key: 'cm:2', why: 'size', inside: false});
  // A service road or a footpath parts nothing.
  assert.equal(pickOf(pieces, district, {roads: [{...street, cls: 'service'}]}).key, 'cm:1');
  // Same side, same size: the one standing back from the street (a compound's office) before the one on it (its shops).
  const shopfront = rect(3, -30, 0, 20, 20);   // 400 m², at the street (2 m off it), 20 m away
  const setBack = rect(4, 30, -40, 20, 20);    // 400 m², 42 m back from the street, 41 m away
  assert.equal(pickOf([shopfront, setBack], {...district, typeId: '1020'}).key, 'cm:3', 'without the street: the nearer');
  assert.equal(pickOf([shopfront, setBack], {...district, typeId: '1020'}, {roads: [street]}).key, 'cm:3', 'the setback never outweighs 20 m more walk');
  const setBackNear = rect(5, 22, -26, 20, 20);  // 400 m², 28 m back, 23 m away
  assert.equal(pickOf([shopfront, setBackNear], {...district, typeId: '1020'}, {roads: [street]}).key, 'cm:5');
});

test('only a point of interest that can be the office itself lends its name (never a bus stop named after it)', () => {
  const shop = rect(1, 0, 0, 10, 10), annex = rect(2, 30, 0, 22, 25), hall = rect(3, 0, -60, 30, 20);
  const pieces = [shop, annex, hall];
  const district = {longitude: X, latitude: Y, typeId: '1010', name: 'ที่ว่าการอำเภอเมืองอุบลราชธานี'};
  const busStop = {lon: at(0, -60)[0], lat: at(0, -60)[1], name: 'ที่ว่าการอำเภอเมืองอุบลราชธานี', cls: 'bus', sub: 'bus_stop'};
  assert.notEqual(pickOf(pieces, district, {pois: [busStop]}).why, 'name');
  assert.deepEqual(pickOf(pieces, district, {pois: [{...busStop, cls: 'town_hall', sub: 'townhall'}]}), {key: 'cm:3', why: 'name', inside: false});
  assert.deepEqual(pickOf(pieces, district, {pois: [{...busStop, cls: 'office', sub: 'government'}]}).key, 'cm:3');
});

test('a pin in a building of the office type’s size keeps it; a type that can be any size keeps the building it falls in', () => {
  const office = rect(1, 0, 0, 25, 18);          // 450 m² district office, the pin inside
  const bigger = rect(2, 60, 0, 60, 40);         // a 2,400 m² market 30 m away is never preferred for its size
  const pieces = [office, bigger];
  const district = {longitude: X, latitude: Y, typeId: '1010', name: 'ที่ว่าการอำเภอเมือง'};
  assert.deepEqual(pickOf(pieces, district), {key: 'cm:1', why: 'pin', inside: true});
  const box = rect(3, 0, 0, 3, 3);               // a 9 m² police box …
  const station = rect(4, 0, 20, 30, 20);        // … in front of a 600 m² station
  const policeBox = {longitude: X, latitude: Y, typeId: '1080', name: 'ป้อมตำรวจ'};
  assert.equal(TYPE_FOOTPRINT_M2['1080'], undefined, 'a police box can be any size');
  assert.deepEqual(pickOf([box, station], policeBox), {key: 'cm:3', why: 'pin', inside: true});
});
const pickOf = (pieces, office, opts = {}) => { const p = chooseBuilding(pieces, office, {keyOfPiece: keys(pieces), ...opts}); return p && {key: p.key, why: p.why, inside: p.inside}; };

test('a pin in the open: a guardhouse nearest the pin loses to the office block of the type’s size a little farther', () => {
  const guard = rect(1, 0, 6, 5, 5);             // 25 m², 3.5 m away
  const block = rect(2, 0, -30, 30, 20);         // 600 m², 20 m away
  const district = {longitude: X, latitude: Y, typeId: '1010', name: 'ที่ว่าการอำเภอเมือง'};
  assert.deepEqual(pickOf([guard, block], district), {key: 'cm:2', why: 'size', inside: false});
  // Two buildings of the type's size: the nearer one.
  const other = rect(3, 0, 22, 30, 20);          // 600 m², 12 m away
  assert.deepEqual(pickOf([guard, block, other], district), {key: 'cm:3', why: 'size', inside: false});
  // Without a size for the type, the nearest.
  assert.deepEqual(pickOf([guard, block], {...district, typeId: ''}), {key: 'cm:1', why: 'near', inside: false});
  // Far beyond the distance scale the size never drags the camera away: 400 m² at 200 m loses to a shed at 5 m.
  const farBlock = rect(4, 0, -210, 30, 20);
  assert.equal(pickOf([guard, farBlock], district).key, 'cm:1');
  assert.equal(chooseBuilding([farBlock], district, {keyOfPiece: keys([farBlock]), maxM: 100}), null, 'nothing within the reach');
});

test('an OpenStreetMap point of interest named for the office lends its building the name', () => {
  const shop = rect(1, 0, 0, 10, 10);
  const courtBlock = rect(2, 0, -90, 40, 30);    // 75 m from the pin: too far for the size alone
  const annex = rect(3, 30, 0, 22, 25);          // 550 m², 19 m away
  const pieces = [shop, courtBlock, annex];
  const named = [{lon: at(0, -90)[0], lat: at(0, -90)[1], name: 'ศาลเยาวชนและครอบครัวจังหวัดอุบลราชธานี'}];
  assert.deepEqual(pickOf(pieces, court), {key: 'cm:3', why: 'size', inside: false});
  assert.deepEqual(pickOf(pieces, court, {pois: named}), {key: 'cm:2', why: 'name', inside: false});
  // Another name, or a point beyond the reach, lends nothing.
  assert.equal(pickOf(pieces, court, {pois: [{...named[0], name: 'ร้านกาแฟ'}]}).key, 'cm:3');
  const far = [{lon: at(0, -200)[0], lat: at(0, -200)[1], name: named[0].name}];
  assert.equal(pickOf([...pieces, rect(4, 0, -200, 40, 30)], court, {pois: far}).key, 'cm:3');
});

test('a type without a footprint floor keeps the 0.2.0 tie-break (the larger within 10 m); a police box takes the nearest', () => {
  const kiosk = rect(1, 6, 0, 4, 4);     // its edge 4 m from the pin
  const block = rect(2, 0, 20, 20, 20);  // 600 m², its edge 10 m from the pin
  const unclassified = {longitude: X, latitude: Y, typeId: '', name: 'สำนักงานสรรพากรพื้นที่'};
  assert.deepEqual(pickOf([kiosk, block], unclassified), {key: 'cm:2', why: 'size', inside: false});
  assert.deepEqual(pickOf([kiosk, block], {...unclassified, typeId: '1080'}), {key: 'cm:1', why: 'near', inside: false});
  const temple = {longitude: X, latitude: Y, typeId: '3030', name: 'วัดศรีอุบลรัตนาราม'};
  assert.equal(pickOf([kiosk, block], temple).key, 'cm:2', 'places too (no reference buildings to fit a floor on)');
});

test('the office’s own name, carried by no other office, finds its building far from a stray pin', () => {
  const hut = rect(1, 0, 0, 8, 8);
  const hall = rect(2, 400, -50, 40, 30);
  const far = {lon: at(400, -50)[0], lat: at(400, -50)[1], name: court.name, cls: 'town_hall', sub: 'courthouse'};
  const pieces = [hut, hall];
  const p = chooseBuilding(pieces, {...court, uniqueName: true}, {keyOfPiece: keys(pieces), pois: [far], maxM: 500});
  assert.equal(p.key, 'cm:2');
  assert.equal(p.why, 'name');
  assert.ok(Math.abs(p.poi.distanceM - 403) < 3, JSON.stringify(p.poi));
  assert.equal(pickOf(pieces, court, {pois: [far], maxM: 500}).key, 'cm:1', 'a name other offices carry (or a near match) reaches 150 m only');
  assert.equal(pickOf(pieces, {...court, uniqueName: true}, {pois: [{...far, name: 'ศาลเยาวชนและครอบครัว'}], maxM: 500}).key, 'cm:1');
});

test('buildingsNear groups the pieces of one building and measures the pin to its outline', () => {
  const a = rect(1, 0, 0, 10, 10), b = rect(2, 10, 0, 10, 10), c = rect(3, 0, 40, 10, 10);
  const keyOfPiece = new Map([[1, 'osm:1'], [2, 'osm:1'], [3, 'osm:3']]);
  const list = buildingsNear([a, b, c], [X, Y], {keyOfPiece});
  const one = list.find(x => x.key === 'osm:1');
  assert.deepEqual(one.pieces, [1, 2]);
  assert.ok(Math.abs(one.area - 200) < 2, `${one.area}`);
  assert.equal(one.inside, true);
  assert.ok(Math.abs(list.find(x => x.key === 'osm:3').d - 35) < 0.5);
  // An outline mapped in parts counts once, by its outline.
  const outline = {...rect(4, 0, 0, 30, 30), outline: true};
  const parts = buildingsNear([outline, a, b], [X, Y], {keyOfPiece: new Map([[4, 'osm:4'], [1, 'osm:4'], [2, 'osm:4']])});
  assert.ok(Math.abs(parts[0].area - 900) < 5, `${parts[0].area}`);
});

test('names compare as words: abbreviations spelled out, doubled vowels, spaces and brackets ignored', () => {
  assert.equal(normaliseName('สภ. เมือง  อุบลราชธานี'), normaliseName('สถานีตำรวจภูธรเมืองอุบลราชธานี'));
  assert.equal(nameSimilarity('ศาลเยาวชนเเละครอบครัวจังหวัดสกลนคร', 'ศาลเยาวชนและครอบครัวจังหวัดสกลนคร'), 1);
  assert.equal(nameSimilarity('อบต.บ้านโพธิ์', 'องค์การบริหารส่วนตำบลบ้านโพธิ์'), 1);
  assert.ok(nameSimilarity('สถานีดับเพลิงบางซ่อน', 'สถานีดับเพลิงและกู้ภัยบางซ่อน') >= CHOICE.nameMin);
  assert.ok(nameSimilarity('เทศบาลตำบลบ้านโพธิ์', 'องค์การบริหารส่วนตำบลบ้านโพธิ์') < CHOICE.nameMin, 'another organisation of the same place');
  assert.ok(nameSimilarity('ศาลจังหวัดอุบลราชธานี', 'ศาลแขวงอุบลราชธานี') < CHOICE.nameMin, 'another court of the same city');
  assert.equal(nameSimilarity('', 'ศาล'), 0);
});

test('Street View stands on the street in front of the building and faces it', () => {
  const block = rect(2, 0, -40, 40, 30);         // the building, its centre 40 m south of the pin
  const front = {cls: 'minor', coords: [at(-80, 8), at(80, 8)]};          // the street the gate opens on (north)
  const side = {cls: 'minor', coords: [at(60, -120), at(60, 60)]};        // a side street 40 m east of the building
  const view = streetViewOf([block.outer], 20, at(0, 0), [front, side]);
  assert.equal(view.from, 'road');
  assert.ok(Math.abs(view.lat - at(0, 8)[1]) < 3 * my && Math.abs(view.lon - at(0, 8)[0]) < 3 * mx, 'on the front street, opposite the centre');
  assert.ok(view.heading >= 178 && view.heading <= 182, `faces south: ${view.heading}`);
  assert.ok(view.pitch >= 0 && view.pitch <= 20);
  // A footpath, a track or a tunnel is never a viewpoint; a motorway only when nothing else is near.
  const onlyPath = streetViewOf([block.outer], 20, at(0, 0), [{cls: 'path', coords: front.coords}, {cls: 'minor', brunnel: 'tunnel', coords: front.coords}]);
  assert.equal(onlyPath.from, 'pin');
  const motorway = {cls: 'motorway', coords: [at(-80, -5), at(80, -5)]};
  assert.equal(streetViewOf([block.outer], 20, at(0, 0), [motorway, side]).heading, bearingDeg(at(60, -40), at(0, -40)), 'the side street, facing west');
  // No street: from the pin when it stands outside the building; nothing when it is inside.
  const fromPin = streetViewOf([block.outer], 20, at(0, 0), []);
  assert.equal(fromPin.from, 'pin');
  assert.equal(fromPin.heading, 180);
  assert.equal(streetViewOf([block.outer], 20, at(0, -40), []), null);
  assert.equal(streetViewOf([], 20, at(0, 0), [front]), null);
});

test('the Street View link carries the heading and pitch when the view faces a building', () => {
  assert.equal(streetViewURL(15.2336654, 104.8543541), 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=15.233665,104.854354');
  assert.equal(streetViewURL(15.2336654, 104.8543541, {heading: 181, pitch: 9}), 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=15.233665,104.854354&heading=181&pitch=9');
  const row = {name: 'ศาลเยาวชนและครอบครัวจังหวัดอุบลราชธานี', office: true};
  const faced = contextActions({kind: 'office', row, point: {lat: 15.2337, lon: 104.8544, role: 'point', heading: 181, pitch: 9}});
  assert.match(faced.find(a => a.id === 'streetview').href, /&heading=181&pitch=9$/);
  const plain = contextActions({kind: 'office', row, point: {lat: 15.2337, lon: 104.8544, role: 'point'}});
  assert.doesNotMatch(plain.find(a => a.id === 'streetview').href, /heading/);
});
