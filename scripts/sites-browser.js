// sites-browser.js — office sites from OpenStreetMap area frames, in the owner's browser (docs/SITES.md §6). Paste the
// whole file into Claude in Chrome javascript_tool on this repository's page (https://montri-th.github.io/governmentoffice/
// or any file of it), after a window.__SITES_IN line; it returns at once and works in the background:
//   window.__SITES_IN = {dates: ['2026-11-06T12:05:51Z', …], rows: ['key|w123|own|go|0|0', …], check: [key, …], code: ''}
//       a row: office key | OSM element (w/r + id) | match tier | go, too_big or review | metres outside the frame | date index;
//       check: sites a person looks at first (status review); code: where the modules load from when this page's copy is
//       older (e.g. https://cdn.jsdelivr.net/gh/montri-th/governmentoffice@<commit>/) — the data always load from this page
//   JSON.stringify(window.__SITES.state())                    poll until done
//   window.__SITES.show('tsv' | 'digest' | 'osm')             puts one text on the page for get_page_text (sha256 in state)
// tsv: the rows of the research sheet's site tab (header first); digest: key|status|source|count|sha256 of the buildings;
// osm: key|buildings for the sites drawn from OpenStreetMap buildings (the container cannot reach OpenFreeMap).
// Frames come from the Overpass API at the date the frames were matched; buildings from scripts/site-buildings.mjs.
// OpenStreetMap data © OpenStreetMap contributors, ODbL.
(() => {
  const base = new URL('.', location.href).href.replace(/\/scripts\/$/, '/');
  const S = window.__SITES = {status: 'start', err: null, t0: Date.now(), done: 0, rows: [], text: {}, sha: {}};
  const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const clean = s => String(s || '').replace(/[\t\r\n]+/g, ' ').trim();
  function joinWays(ws) {
    const rings = [], pool = ws.map(w => w.slice());
    while (pool.length) {
      let cur = pool.shift(), guard = 0;
      while (!same(cur[0], cur[cur.length - 1]) && guard++ < 5000) {
        const end = cur[cur.length - 1];
        let f = -1, rev = false;
        for (let j = 0; j < pool.length; j++) { const w = pool[j]; if (same(w[0], end)) { f = j; rev = false; break; } if (same(w[w.length - 1], end)) { f = j; rev = true; break; } }
        if (f < 0) break;
        const w = pool.splice(f, 1)[0];
        cur = cur.concat((rev ? w.slice().reverse() : w).slice(1));
      }
      if (cur.length >= 4 && same(cur[0], cur[cur.length - 1])) rings.push(cur);
    }
    return rings;
  }
  const r6 = ring => ring.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]);
  async function overpass(q) {
    for (const wait of [0, 20000, 40000, 80000]) {
      if (wait) await new Promise(res => setTimeout(res, wait));
      try { const r = await fetch('https://overpass-api.de/api/interpreter', {method: 'POST', body: 'data=' + encodeURIComponent(q)}); if (r.ok) return r.json(); if (r.status === 400) throw new Error(await r.text()); }
      catch (e) { S.err = clean(String(e)).slice(0, 200); }
    }
    throw new Error('Overpass did not answer');
  }
  S.show = name => { document.body.innerHTML = '<pre id="out"></pre>'; document.getElementById('out').textContent = S.text[name]; return {name, len: S.text[name].length, sha: S.sha[name]}; };
  S.state = () => ({status: S.status, err: S.err, s: Math.round((Date.now() - S.t0) / 1000), done: S.done, rows: S.rows.length,
    text: Object.fromEntries(Object.keys(S.text).map(k => [k, {len: S.text[k].length, sha: S.sha[k]}])), counts: S.counts || null});
  S.run = async () => {
    try {
      const code = window.__SITES_IN?.code || base;
      const M = await import(`${code}scripts/site-buildings.mjs`);
      const BU = await import(`${code}js/shell/building-units.js`), MS = await import(`${code}js/shell/map-style.js`);
      const off = await (await fetch(`${base}data/offices.json`)).json();
      const pre = Object.fromEntries(off.types.map(t => [t.id, t.prefix || '']));
      const rowsOf = new Map();
      for (const cols of [off.cols, ...(await Promise.all(off.groups.filter(g => g.file).map(async g => (await (await fetch(`${base}${g.file}`)).json()).cols)))]) {
        cols.key.forEach((k, i) => { const t = off.types[cols.type[i]]; const n = cols.name[i] || ''; rowsOf.set(k, {name: n.charCodeAt(0) === 1 ? pre[t.id] + n.slice(1) : n, type: t.short || t.th, lon: cols.lon[i], lat: cols.lat[i], district: cols.district[i]}); });
      }
      const zones = (await Promise.all(off.provinces.map(async p => { try { return BU.zonesOf(await (await fetch(`${base}data/building-units/${p}.json`)).json()); } catch { return []; } }))).flat();
      const template = (await (await fetch(MS.TILEJSON_URL)).json()).tiles[0];
      const input = window.__SITES_IN, cache = new Map();
      const fetchBytes = url => {
        if (!cache.has(url)) cache.set(url, (async () => { for (let k = 0; k < 3; k++) { try { const r = await fetch(url); if (r.ok) return new Uint8Array(await r.arrayBuffer()); if (r.status < 500) throw new Error(`${r.status} ${url}`); } catch (e) { if (k === 2) throw e; } await new Promise(res => setTimeout(res, 1500 * (k + 1))); } })());
        return cache.get(url);
      };
      const rows = input.rows.map(l => { const [key, el, tier, step, d, di] = l.split('|'); return {key, el, tier, step, d: Number(d), date: input.dates[Number(di)]}; });
      // Frames by id, at the date they were matched.
      const frames = new Map(), bases = {};
      for (const [di, date] of input.dates.entries()) {
        const mine = rows.filter(r => r.date === date), ways = mine.filter(r => r.el[0] === 'w').map(r => r.el.slice(1)), rels = mine.filter(r => r.el[0] === 'r').map(r => r.el.slice(1));
        if (!ways.length && !rels.length) continue;
        const data = await overpass(`[out:json][timeout:180][date:"${date}"];(${ways.length ? `way(id:${ways.join(',')});` : ''}${rels.length ? `relation(id:${rels.join(',')});` : ''});out tags geom;`);
        bases[di] = data.osm3s?.timestamp_osm_base || date;
        for (const e of data.elements) {
          let outers = [], inners = [];
          if (e.type === 'way' && e.geometry) { const r = e.geometry.map(p => [p.lon, p.lat]); if (r.length >= 4 && same(r[0], r[r.length - 1])) outers = [r]; }
          else if (e.type === 'relation') { const o = [], i = []; for (const m of e.members || []) { if (m.type !== 'way' || !m.geometry) continue; (m.role === 'inner' ? i : o).push(m.geometry.map(p => [p.lon, p.lat])); } outers = joinWays(o); inners = joinWays(i); }
          const t = e.tags || {}, k = ['amenity', 'office', 'landuse', 'military', 'government', 'leisure', 'building'].find(k => t[k]);
          if (outers.length) frames.set(e.type[0] + e.id, {outers: outers.map(r6), inners: inners.map(r6), tag: k ? `${k}:${t[k]}` : ''});
        }
      }
      const header = ['office_key', 'name', 'type', 'district', 'boundary_status', 'boundary_source', 'boundary_evidence_url', 'boundary_geojson', 'buildings_in_boundary', 'buildings_count',
        'building_source', 'match_tier', 'main_building_note', 'checked_by', 'checked_on', 'notes'];
      const out = [header.join('\t')], digest = [], osm = [], counts = {};
      const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Bangkok'}).format(new Date());
      const work = rows.map(r => async () => {
        const v = rowsOf.get(r.key), f = frames.get(r.el);
        let status = r.step === 'go' ? '' : r.step, members = [], source = '', notes = [];
        if (!v || !f) { status = 'review'; notes.push(!v ? 'office not in the data' : 'frame not found at the date'); }
        const fr = v ? M.localFrame(v.lon, v.lat) : null;
        const area = f && fr ? f.outers.reduce((s, ring) => s + Math.abs(M.ringAreaM2(ring, fr)), 0) - f.inners.reduce((s, ring) => s + Math.abs(M.ringAreaM2(ring, fr)), 0) : 0;
        if (!status) {
          const need = Math.max(...f.outers.flat().map(p => Math.hypot(...fr.toM(p))));
          if (need + 20 > M.MAX_SITE_M) status = 'too_big';
          else {
            const res = await M.siteCandidates({lon: v.lon, lat: v.lat, reach: Math.max(150, Math.min(M.MAX_SITE_M, Math.round(need) + 20)), zones, fetchBytes, osmTemplate: template});
            source = res.source === 'cm' ? 'cm_v4' : 'osm_buildings';
            members = M.joinFrame(res.candidates, f).map(c => c.point);
            status = members.length >= 2 ? 'checked' : members.length === 1 ? 'single_building' : 'frame_only';
          }
        }
        if ((input.check || []).includes(r.key) && status === 'checked') { status = 'review'; notes.push('กรอบยาวหรือรูปร่างแปลก ให้คนตรวจก่อนใช้'); }
        counts[status] = (counts[status] || 0) + 1;
        const pts = M.pointsText(members), geo = f ? (() => {
          const polys = f.outers.map(o => [o, ...f.inners.filter(h => M.inRing(h[0], o))]);
          return JSON.stringify(polys.length === 1 ? {type: 'Polygon', coordinates: polys[0]} : {type: 'MultiPolygon', coordinates: polys});
        })() : '';
        notes.unshift(`OSM ${bases[input.dates.indexOf(r.date)] || r.date}`, f?.tag || '', area ? `${(area / 1600).toFixed(1)} ไร่` : '', r.tier === 'near_named' ? `หมุดอยู่นอกกรอบ ${r.d} ม.` : '');
        S.rows.push({key: r.key, line: [r.key, clean(v?.name), clean(v?.type), v?.district || '', status, 'osm_polygon', `https://www.openstreetmap.org/${r.el[0] === 'w' ? 'way' : 'relation'}/${r.el.slice(1)}`, geo, pts,
          members.length || '', source, r.tier, '', 'Claude (osm-area-site-join)', today, notes.filter(Boolean).join(' · ')].join('\t'),
          digest: [r.key, status, source, members.length, await sha256(pts)].join('|'), osm: source === 'osm_buildings' && status === 'checked' ? `${r.key}|${pts}` : ''});
        S.done++;
      });
      const queue = work.slice();
      await Promise.all(Array.from({length: 4}, async () => { while (queue.length) await queue.shift()(); }));
      const order = new Map(rows.map((r, i) => [r.key, i]));
      S.rows.sort((a, b) => order.get(a.key) - order.get(b.key));
      S.text.tsv = [out[0], ...S.rows.map(r => r.line)].join('\n');
      S.text.digest = S.rows.map(r => r.digest).join('\n');
      S.text.osm = S.rows.map(r => r.osm).filter(Boolean).join('\n');
      for (const k of Object.keys(S.text)) S.sha[k] = await sha256(S.text[k]);
      S.counts = counts; S.status = 'done';
    } catch (e) { S.err = clean(String(e && e.stack || e)).slice(0, 400); S.status = 'failed'; }
  };
  S.run();
  return JSON.stringify({started: true, rows: window.__SITES_IN?.rows?.length || 0});
})()
