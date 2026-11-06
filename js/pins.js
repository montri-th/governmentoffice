/**
 * Office pins: one mark per row that carries a point, never clustered or aggregated.
 *
 * Only rows with a point are drawn (the roster's registered point; row.coordRole says whose). The map legend and the
 * panels say so; a district total never depends on the pins.
 *  - focus: rows that carry detail (the focused districts, the selected district/station/building), one symbol per
 *    row in its group's series: theme fill + the LDS shape cue of that series (js/cues.js, DATAVIZ-05), outlined
 *    in the marker stroke; the symbol's area grows with the recorded personnel (js/model.js#pinRadius, the Hotel
 *    contract of 2026-11-01) and an office with unknown personnel is drawn hollow at the 40-person size (a place of
 *    the other groups, where personnel does not apply, is filled at that size) — the colour
 *    stays the group's; larger symbols are drawn first so a small one is never hidden under a large one;
 *  - context: the whole filtered scope as quiet grey dots under the focus symbols, sized by personnel the same way
 *    (hollow = unknown) at about half the focus size and at most CONTEXT_MAX_RADIUS, not focusable and not a click
 *    target (a click there selects the district); re-sent only when the filters change.
 * From DETAIL_MIN_ZOOM the focus rows inside the viewport (≤ MAX_DETAIL_PINS, nearest the centre first) become HTML
 * buttons: keyboard-reachable (roving tabindex, arrow keys); co-located rows get bounded screen-space slots around
 * their own anchor (the point never moves; a leader line joins a hovered/selected pin to it). The accessible name is
 * the office name and its recorded personnel.
 */
import {hasPoint, pinSizeOf, pinRadius, pinSizeExpression} from './model.js';
import {cueImage, cueMarkup} from './cues.js';
import {GEOJSON_MAXZOOM} from './map-layers.js';

export const DETAIL_MIN_ZOOM = 15.5;
/** Largest quiet context dot (px of radius): context stays quiet at every zoom. */
export const CONTEXT_MAX_RADIUS = 6;
export const MAX_DETAIL_PINS = 320;
/** Longest wait for the map's first idle before the quiet context of a large scope is handed to the worker. */
export const CONTEXT_DEFER_MS = 6000;
export const PIN_LAYERS = Object.freeze({context: 'office-context', focus: 'office-focus', selected: 'office-selected'});
const SOURCES = {context: 'office-context', focus: 'office-focus', selected: 'office-selected'};

const intersects = (a, b, gap = 0) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
const inside = (p, b) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
const pointBox = (x, y, size) => ({left: x - size / 2, right: x + size / 2, top: y - size / 2, bottom: y + size / 2});
export const isSourceVisible = (point, bounds) => inside(point, bounds) && !(bounds.exclusions || []).some(b => inside(point, b));

function cssVar(name, fallback) {
  const value = typeof getComputedStyle === 'function' && typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return value || fallback;
}

/** Series fills 1–10 (theme palette, read from assets/theme.css). */
export function seriesColors(count = 10) {
  return Array.from({length: count}, (_, i) => cssVar(`--series-${i + 1}-fill`, '#8AA4AA'));
}
/** Quiet dots: filled, an open ring only for a government office with unknown personnel (`h`), like the focus symbols. */
const contextPaint = () => {
  const muted = cssVar('--text-muted', '#7B877D');
  return {'circle-color': ['case', ['==', ['get', 'h'], 1], 'rgba(0,0,0,0)', muted], 'circle-stroke-color': muted};
};
const ICON = series => `office-cue-${series}`;
const ICON_HOLLOW = series => `office-cue-${series}-hollow`;
const ICON_PX = 16;

/** Register (or refresh) the ten cue icons in the current theme colours, filled and hollow (unknown personnel). */
function installCueIcons(map) {
  const fills = seriesColors(10), stroke = cssVar('--map-marker-stroke', '#182327');
  fills.forEach((fill, i) => {
    for (const [id, image] of [[ICON(i + 1), cueImage(i + 1, {size: ICON_PX, pixelRatio: 2, fill, stroke})],
      [ICON_HOLLOW(i + 1), cueImage(i + 1, {size: ICON_PX, pixelRatio: 2, fill, stroke, hollow: true})]]) {
      if (map.hasImage(id)) map.updateImage(id, image);
      else map.addImage(id, image, {pixelRatio: 2});
    }
  });
}

/** Drawn hollow: an office whose personnel is unknown (a place where personnel does not apply is filled). */
export const hollowOf = r => Boolean(r.office) && !(Number.isFinite(r.staff) && r.staff > 0);
/** GeoJSON points for rows (source coordinate unchanged; id = position in the list). */
export function pointCollection(rows) {
  const features = [];
  for (const r of rows) {
    if (!hasPoint(r)) continue;
    features.push({type: 'Feature', geometry: {type: 'Point', coordinates: [r.longitude, r.latitude]},
      properties: {k: r.id, s: r.series, z: pinSizeOf(r.staff), r: Number.isFinite(r.staff) && r.staff > 0 ? r.staff : 0, h: hollowOf(r) ? 1 : 0}});
  }
  return {type: 'FeatureCollection', features};
}
/**
 * The quiet context as GeoJSON for the worker, only what its layer reads (r = personnel for the size and the order,
 * h = hollow). Every production point of the scope (440,005 at most) crosses to the worker on a filter change, so
 * the dots that look the same — no recorded personnel, filled or hollow — travel as one MultiPoint each; a row with
 * recorded personnel keeps its own point (its size). Display only: a context dot is never a target.
 */
export function contextCollection(rows) {
  const features = [], filled = [], hollow = [];
  for (const r of rows) {
    if (!hasPoint(r)) continue;
    const staff = Number.isFinite(r.staff) && r.staff > 0 ? r.staff : 0;
    if (staff) features.push({type: 'Feature', geometry: {type: 'Point', coordinates: [r.longitude, r.latitude]}, properties: {r: staff, h: 0}});
    else (hollowOf(r) ? hollow : filled).push([r.longitude, r.latitude]);
  }
  if (filled.length) features.push({type: 'Feature', geometry: {type: 'MultiPoint', coordinates: filled}, properties: {r: 0, h: 0}});
  if (hollow.length) features.push({type: 'Feature', geometry: {type: 'MultiPoint', coordinates: hollow}, properties: {r: 0, h: 1}});
  return {type: 'FeatureCollection', features};
}

/** Compact display-only slots for co-located anchors (bounded offset; caller supplies visible anchors). */
export function separatePins(points, bounds, spacing = 8, {minSpacing = 0.5, maxOffset = 36} = {}) {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.id.localeCompare(b.id));
  for (let pitch = spacing; pitch >= minSpacing; pitch = pitch > 2 ? pitch - 1 : pitch / 2) {
    const offsets = [], used = new Map(), placed = [];
    const ring = Math.ceil(maxOffset / pitch);
    for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
      const x = dx * pitch, y = dy * pitch, d = x * x + y * y;
      if (d <= maxOffset * maxOffset + 0.001) offsets.push({x, y, d});
    }
    offsets.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    const collision = (x, y) => {
      const cx = Math.floor(x / pitch), cy = Math.floor(y / pitch);
      for (let a = cx - 1; a <= cx + 1; a++) for (let b = cy - 1; b <= cy + 1; b++) {
        for (const q of used.get(`${a},${b}`) || []) if (Math.abs(x - q.x) < pitch - 0.001 && Math.abs(y - q.y) < pitch - 0.001) return true;
      }
      return false;
    };
    for (const p of sorted) {
      let found = null;
      for (const o of offsets) {
        const x = p.x + o.x, y = p.y + o.y, box = pointBox(x, y, pitch);
        if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom ||
            (bounds.exclusions || []).some(b => intersects(box, b)) || collision(x, y)) continue;
        found = {...p, x, y, anchorX: p.x, anchorY: p.y, spacing: pitch};
        break;
      }
      if (!found) break;
      placed.push(found);
      const key = `${Math.floor(found.x / pitch)},${Math.floor(found.y / pitch)}`;
      if (!used.has(key)) used.set(key, []);
      used.get(key).push(found);
    }
    if (placed.length === sorted.length) return placed;
  }
  throw new Error('Local viewport is too small for individual pins');
}

/** Nearest-first subset of rows inside the viewport (screen space), bounded. */
export function detailCandidates(rows, project, bounds, limit = MAX_DETAIL_PINS) {
  const cx = (bounds.left + bounds.right) / 2, cy = (bounds.top + bounds.bottom) / 2;
  const out = [];
  for (const r of rows) {
    if (!hasPoint(r)) continue;
    const p = project([r.longitude, r.latitude]);
    if (!isSourceVisible(p, bounds)) continue;
    out.push({row: r, x: p.x, y: p.y, d: (p.x - cx) ** 2 + (p.y - cy) ** 2});
  }
  out.sort((a, b) => a.d - b.d || a.row.id.localeCompare(b.row.id));
  return out.slice(0, limit);
}

/**
 * Mount the pin layers on a MapLibre map (call after style.load) and the HTML
 * detail overlay on its container. options.onSelect(row) on activation;
 * options.onLayout(stats) after each layout.
 */
export function installBranchPins(map, container, {onSelect, onLayout, onHover, reservedBottom = () => 90} = {}) {
  let focusRows = [], contextRows = [], contextPoints = 0, focusById = new Map(), selectedId = '', hoveredId = '', activeId = '', entries = [], frame = 0, detailKeys = [];
  // A context row is looked up only when it is selected (rare): no map over every point of the scope.
  const rowOf = id => focusById.get(id) || (id ? contextRows.find(r => r.id === id && hasPoint(r)) : null) || null;

  map.addSource(SOURCES.context, {type: 'geojson', data: {type: 'FeatureCollection', features: []}, maxzoom: GEOJSON_MAXZOOM});
  map.addSource(SOURCES.focus, {type: 'geojson', data: {type: 'FeatureCollection', features: []}, maxzoom: GEOJSON_MAXZOOM});
  map.addSource(SOURCES.selected, {type: 'geojson', data: {type: 'FeatureCollection', features: []}, maxzoom: GEOJSON_MAXZOOM});
  installCueIcons(map);
  // Quiet context: grey (a UI tone, not a data colour), area by staff at about half the focus size and never above
  // CONTEXT_MAX_RADIUS px (quiet), an open ring when the personnel is unknown; larger first.
  map.addLayer({id: PIN_LAYERS.context, type: 'circle', source: SOURCES.context,
    layout: {'circle-sort-key': ['-', 0, ['get', 'r']]},
    paint: {'circle-radius': pinSizeExpression(0.55, 0, CONTEXT_MAX_RADIUS), ...contextPaint(),
      'circle-stroke-width': ['case', ['==', ['get', 'h'], 1], 1, 0],
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.35, 13, 0.55], 'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.45, 13, 0.7]}});
  // One symbol per row: the series cue icon (fill + shape), never clustered; overlap allowed so no row is hidden.
  // Its area grows with the personnel (icon px = 2 × radius); zoom stays the top-level input (MapLibre rule).
  map.addLayer({id: PIN_LAYERS.focus, type: 'symbol', source: SOURCES.focus,
    layout: {'icon-image': ['case', ['==', ['get', 'h'], 1], ['concat', 'office-cue-', ['to-string', ['get', 's']], '-hollow'], ['concat', 'office-cue-', ['to-string', ['get', 's']]]],
      'icon-size': pinSizeExpression(2 / ICON_PX),
      'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-padding': 0, 'symbol-sort-key': ['-', 0, ['get', 'r']], 'symbol-z-order': 'source'}});
  // The selection ring sits 3.5 px outside the symbol at every size.
  map.addLayer({id: PIN_LAYERS.selected, type: 'circle', source: SOURCES.selected,
    paint: {'circle-radius': pinSizeExpression(1, 3.5), 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': cssVar('--map-selected-stroke', '#176B82'), 'circle-stroke-width': 2.5}});

  const overlay = document.createElement('div');
  overlay.className = 'store-pin-overlay';
  overlay.setAttribute('aria-label', 'หมุดหน่วยงาน ใช้ลูกศรเลือกหมุดถัดไป');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('pin-leaders');
  svg.setAttribute('aria-hidden', 'true');
  const leader = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  anchor.setAttribute('r', '3');
  svg.append(leader, anchor);
  overlay.append(svg);
  container.append(overlay);

  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };
  // While the camera moves, pins keep their last slot (offset from their own anchor) and only follow the
  // map: no candidate search, slot separation or chrome measuring per frame (an
  // area-to-area move stays one smooth animation). The full layout runs again when the move ends.
  let moving = false, placement = new Map();
  const onMoveStart = () => { moving = true; };
  const onMoveEnd = () => { moving = false; schedule(); };
  function followLayout() {
    if (map.getZoom() < DETAIL_MIN_ZOOM) return false;
    const w = container.clientWidth, h = container.clientHeight;
    for (const e of entries) {
      const slot = placement.get(e.row.id);
      if (!slot) { e.button.hidden = true; continue; }
      const p = map.project([e.row.longitude, e.row.latitude]);
      const x = p.x + slot.dx, y = p.y + slot.dy, off = !(x > 0 && y > 0 && x < w && y < h);
      e.button.hidden = off;
      if (!off) { e.button.style.left = `${x}px`; e.button.style.top = `${y}px`; }
      if (e.row.id === (hoveredId || selectedId)) {
        for (const [k, v] of Object.entries({x1: p.x, y1: p.y, x2: x, y2: y})) leader.setAttribute(k, v);
        anchor.setAttribute('cx', p.x); anchor.setAttribute('cy', p.y);
      }
    }
    return true;
  }

  function bounds() {
    const width = container.clientWidth, height = container.clientHeight;
    const panel = container.closest('.map-panel'), rect = container.getBoundingClientRect();
    const obstacle = e => { const b = e.getBoundingClientRect(); return {left: b.left - rect.left - 3, right: b.right - rect.left + 3, top: b.top - rect.top - 3, bottom: b.bottom - rect.top + 3}; };
    const blockers = panel ? [...panel.querySelectorAll('.map-toolbar button, .area-label:not([hidden]), .map-legend, .map-status, .map-aha, .maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left')]
      .filter(e => e.offsetWidth && e.offsetHeight).map(obstacle) : [];
    return {left: 5, right: width - 5, top: 5, bottom: Math.max(6, height - reservedBottom()), exclusions: blockers};
  }

  function clearDetail() {
    for (const e of entries) e.button.remove();
    entries = [];
    placement = new Map();
    if (detailKeys.length) { detailKeys = []; if (map.getLayer(PIN_LAYERS.focus)) map.setFilter(PIN_LAYERS.focus, null); }
  }

  function layout() {
    if (moving && entries.length && placement.size && followLayout()) return;
    const zoom = map.getZoom();
    const b = bounds();
    if (zoom < DETAIL_MIN_ZOOM) {
      clearDetail();
      svg.style.display = 'none';
      report(0, b);
      return;
    }
    const picked = detailCandidates(focusRows, p => map.project(p), b);
    const keys = picked.map(p => p.row.id);
    // Rebuild buttons only when the set changes; positions update every frame.
    if (keys.join('|') !== entries.map(e => e.row.id).join('|')) {
      for (const e of entries) e.button.remove();
      entries = picked.map(p => makeEntry(p.row));
      detailKeys = keys;
      map.setFilter(PIN_LAYERS.focus, keys.length ? ['!', ['in', ['get', 'k'], ['literal', keys]]] : null);
    }
    const projected = entries.map(e => { const p = map.project([e.row.longitude, e.row.latitude]); return {id: e.row.id, x: p.x, y: p.y, entry: e}; });
    let placed;
    const pitch = zoom >= 16.5 ? 13 : 11;
    try { placed = separatePins(projected, b, pitch, {minSpacing: 0.25, maxOffset: 44}); }
    catch { placed = projected.map(p => ({...p, anchorX: p.x, anchorY: p.y, spacing: 1})); }
    const ids = placed.map(p => p.id);
    if (!ids.includes(activeId)) activeId = ids[0] || '';
    for (const p of placed) {
      const {button} = p.entry;
      button.hidden = false;
      button.style.left = `${p.x}px`;
      button.style.top = `${p.y}px`;
      // The HTML pin keeps the staff size of its symbol (bounded so a co-located slot never overlaps its neighbour).
      const own = Math.max(8, Math.min(40, 2 * pinRadius(p.entry.row.staff, zoom)));
      button.style.setProperty('--pin-size', `${p.spacing > 1 && p.spacing < own ? Math.max(6, p.spacing) : own}px`);
      button.tabIndex = p.id === activeId ? 0 : -1;
      button.dataset.displaced = String(Math.hypot(p.x - p.anchorX, p.y - p.anchorY) > 2);
    }
    placement = new Map(placed.map(p => [p.id, {dx: p.x - p.anchorX, dy: p.y - p.anchorY}]));
    const focus = placed.find(p => p.id === (hoveredId || selectedId));
    svg.style.display = focus ? '' : 'none';
    if (focus) {
      for (const [k, v] of Object.entries({x1: focus.anchorX, y1: focus.anchorY, x2: focus.x, y2: focus.y})) leader.setAttribute(k, v);
      anchor.setAttribute('cx', focus.anchorX); anchor.setAttribute('cy', focus.anchorY);
    }
    report(placed.length, b);
  }

  function report(htmlPins, b) {
    let inView = 0;
    const view = map.getBounds?.();
    if (view) for (const r of focusRows) if (r.longitude >= view.getWest() && r.longitude <= view.getEast() && r.latitude >= view.getSouth() && r.latitude <= view.getNorth()) inView++;
    overlay.dataset.visiblePins = String(htmlPins);
    onLayout?.({focusInView: inView, htmlPins, contextRows: contextOnly, zoom: map.getZoom()});
  }

  function makeEntry(row) {
    const button = document.createElement('button'), dot = document.createElement('span');
    button.type = 'button';
    button.className = 'store-pin';
    button.dataset.storeId = row.id;
    button.dataset.category = String(row.series);
    button.dataset.size = String(pinSizeOf(row.staff));
    if (hollowOf(row)) button.classList.add('is-unknown-staff');
    const text = [row.name || '', row.type?.short || '', row.staff ? `${row.staff.toLocaleString('th-TH')} คน` : ''].filter(Boolean).join(' · ');
    button.setAttribute('aria-label', text);
    button.title = text;
    dot.className = 'pin-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.innerHTML = cueMarkup(row.series);
    button.append(dot);
    button.classList.toggle('is-selected', row.id === selectedId);
    button.onclick = () => { select(row.id); onSelect?.(row); };
    button.onmouseenter = () => { hoveredId = row.id; schedule(); onHover?.(row, button); };
    button.onmouseleave = () => { hoveredId = ''; schedule(); onHover?.(null); };
    button.onfocus = () => { activeId = row.id; hoveredId = row.id; for (const e of entries) e.button.tabIndex = e.row.id === activeId ? 0 : -1; schedule(); onHover?.(row, button); };
    button.onblur = () => { hoveredId = ''; schedule(); onHover?.(null); };
    button.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const visible = entries.filter(e => !e.button.hidden), i = visible.findIndex(e => e.row.id === row.id);
      const j = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : (i + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + visible.length) % visible.length;
      visible[j]?.button.focus();
    };
    overlay.append(button);
    return {row, button};
  }

  /**
   * focus = rows with detail; context = the whole filtered scope as quiet dots (not in the tab
   * order, not clickable). Focus symbols are drawn above and cover their own dot, so the context
   * only changes with the filters: a selection (area, station, building, office) re-sends the focus
   * rows only and never the context points (smooth area-to-area moves).
   * On the first draw a large context is handed to the worker once the map has drawn the focus and the area fills
   * (its first idle, else after CONTEXT_DEFER_MS), so they are not queued behind its index build.
   */
  let contextTimer = 0, firstContext = true, sentContext = null, contextOnly = 0;
  function update(focus, {context = []} = {}) {
    focusRows = focus.filter(hasPoint);
    focusById = new Map(focusRows.map(r => [r.id, r]));
    // Only rows with a published point are drawn as context dots; the focus rows are part of the scope.
    if (context !== contextRows) { contextRows = context; contextPoints = 0; for (const r of contextRows) if (hasPoint(r)) contextPoints++; }
    contextOnly = Math.max(0, contextPoints - focusRows.length);
    map.getSource(SOURCES.focus)?.setData(pointCollection(focusRows));
    clearTimeout(contextTimer);
    const sendContext = () => { firstContext = false; sentContext = contextRows; map.getSource(SOURCES.context)?.setData(contextCollection(contextRows)); };
    if (sentContext !== contextRows) {
      if (firstContext && contextRows.length > 5000) {
        let sent = false;
        const once = () => { if (sent) return; sent = true; clearTimeout(contextTimer); if (sentContext !== contextRows) sendContext(); };
        contextTimer = setTimeout(once, CONTEXT_DEFER_MS);
        // The fills and the focus symbols first: the next idle after they were handed over (a moment later at least).
        setTimeout(() => map.once('idle', once), 900);
      } else sendContext();
    }
    clearDetail();
    schedule();
  }

  function select(id) {
    selectedId = id || '';
    const r = rowOf(selectedId);
    map.getSource(SOURCES.selected)?.setData(r ? pointCollection([r]) : {type: 'FeatureCollection', features: []});
    for (const e of entries) e.button.classList.toggle('is-selected', e.row.id === selectedId);
    schedule();
  }

  /**
   * The focus row under a screen point, or null. Quiet context dots are not targets (they carry no key): a click in
   * the quiet context goes to the district underneath (move to that เขต/อำเภอ), never to a random row.
   */
  function hitTest(point, {radius = 6} = {}) {
    const box = [[point.x - radius, point.y - radius], [point.x + radius, point.y + radius]];
    const hits = map.queryRenderedFeatures(box, {layers: [PIN_LAYERS.focus].filter(id => map.getLayer(id))});
    let best = null, bestD = Infinity;
    for (const f of hits) {
      const r = focusById.get(f.properties?.k);
      if (!r) continue;
      const p = map.project([r.longitude, r.latitude]), d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2 + (f.layer.id === PIN_LAYERS.focus ? 0 : 4);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  function retheme() {
    installCueIcons(map);
    if (map.getLayer(PIN_LAYERS.context)) for (const [k, v] of Object.entries(contextPaint())) map.setPaintProperty(PIN_LAYERS.context, k, v);
    if (map.getLayer(PIN_LAYERS.selected)) map.setPaintProperty(PIN_LAYERS.selected, 'circle-stroke-color', cssVar('--map-selected-stroke', '#176B82'));
  }

  map.on('move', schedule);
  map.on('resize', schedule);
  map.on('movestart', onMoveStart);
  map.on('moveend', onMoveEnd);
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  resize?.observe(container);
  function dispose() {
    cancelAnimationFrame(frame);
    clearTimeout(contextTimer);
    map.off('move', schedule); map.off('resize', schedule); map.off('movestart', onMoveStart); map.off('moveend', onMoveEnd); resize?.disconnect(); overlay.remove();
    for (const id of Object.values(PIN_LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of Object.values(SOURCES)) if (map.getSource(id)) map.removeSource(id);
    for (let i = 1; i <= 10; i++) for (const id of [ICON(i), ICON_HOLLOW(i)]) if (map.hasImage(id)) map.removeImage(id);
  }
  return {update, select, layout: schedule, hitTest, retheme, dispose, layerIds: PIN_LAYERS, bounds};
}
