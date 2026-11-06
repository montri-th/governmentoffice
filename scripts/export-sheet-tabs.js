/**
 * Read tabs of a large Google Sheet cell by cell from the sheet's own HTML view, in the browser of someone who can
 * open the sheet (the government-office research sheet is too large for a Drive export: 05_PRODUCTION_ROWS alone is
 * 440,005 rows × 16 columns).
 *
 * How it was used for Government Office 0.1.0 (2026-11-06): the owner's Chrome, signed in, on the sheet's page; this
 * script run through Claude in Chrome, then
 *   - the small tabs with exportSheetTabs(…, {into: 'page'}) → scripts/decode-sheet-payload.py → <tab>.json;
 *   - 05_PRODUCTION_ROWS with exportCompactTab(…) — the same cells in a compact form (repeated values as dictionaries,
 *     mostly-empty columns as sparse maps), gzip + base64, shown page by page for a reader tool → joined, checked
 *     against the browser's digest and expanded back to rows by scripts/join-compact-payload.py;
 *   - the hyperlinks of 06_RECENT_PROD_GAPS with exportTabLinks(…) → <tab>.links.json (one list per row and cell, the
 *     sheet's redirect links unwrapped).
 * Every <tab>.json = {name, gid, ncols, rows} (rows[0] = the header row). scripts/build-data.py records the SHA-256 of
 * each tab's rows as canonical JSON (meta.tabs), the same digest this script prints, so a later read can be compared
 * tab by tab.
 *
 * The sheet's address is never written here: the script reads the page it runs on (`location`). Nothing leaves the
 * browser; the output is a file the reader saves (download) or a payload block in the page (`into: 'page'`).
 *
 *   await exportSheetTabs([{name: '06_RECENT_PROD_GAPS', gid: 73110606}, {name: '01_AGENCIES', gid: 102}], {into: 'page'});
 *   await exportCompactTab({name: '05_PRODUCTION_ROWS', gid: 73110605}); showCompactPage(0); … showCompactPage(n − 1);
 *   await exportTabLinks({name: '06_RECENT_PROD_GAPS', gid: 73110606}, {into: 'page'});
 *   await siteTabDigest({name: '07_SITE_BOUNDARY_CHECK', gid: <gid>});  // scripts/build-sites.py --sheet-digest
 *
 * Long runs: a console call may outlive a tool's time limit; run it in the background
 * (`window.__cms = exportSheetTabs(...)`) and read `window.__cmsProgress` until it settles.
 */
(function () {
  'use strict';
  const base = () => location.href.replace(/[?#].*$/, '').replace(/\/(edit|htmlview|view|preview)(\/.*)?$/, '');
  // The sheet's page enforces Trusted Types: parse through a named policy of our own.
  const policy = (() => { try { return window.trustedTypes?.createPolicy?.('cms-sheet-export', {createHTML: s => s}) || null; } catch { return null; } })();
  const parse = html => new DOMParser().parseFromString(policy ? policy.createHTML(html) : html, 'text/html');

  /** Rows [r0, r1] (1-based) of one tab as arrays of cell text; [] past the end. */
  async function readRange(gid, r0, r1) {
    const url = `${base()}/htmlview/sheet?headers=false&gid=${encodeURIComponent(gid)}&range=A${r0}:ZZZ${r1}`;
    const res = await fetch(url, {credentials: 'include', cache: 'no-store'});
    if (!res.ok) throw new Error(`gid ${gid} rows ${r0}–${r1}: HTTP ${res.status}`);
    const doc = parse(await res.text());
    const table = doc.querySelector('table.waffle') || doc.querySelector('table');
    if (!table) return [];
    const rows = [];
    for (const tr of table.querySelectorAll('tbody > tr')) {
      const cells = [];
      for (const td of tr.querySelectorAll(':scope > td')) {
        // A cell's text as the sheet shows it; line breaks inside a cell stay line breaks.
        const text = (td.innerText ?? td.textContent ?? '').replace(/ /g, ' ');
        const span = Number(td.getAttribute('colspan') || 1);
        cells.push(text);
        for (let i = 1; i < span; i++) cells.push('');
      }
      rows.push(cells);
    }
    return rows;
  }

  async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function gzipBase64(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return {bytes, b64: btoa(s)};
  }

  /**
   * tabs: [{name, gid}] · batch: rows per request · into: 'download' (a .json.gz file) | 'page' (a CMSBEGIN…CMSEND
   * block replacing the page body, for a reader tool) · pad: minimum payload length (characters) of the page block.
   * Returns [{name, gid, rows, columns, sha256}].
   */
  async function exportSheetTabs(tabs, {batch = 2000, into = 'download', pad = 0} = {}) {
    const out = [], receipts = [];
    window.__cmsProgress = {state: 'running', tabs: tabs.length, done: 0};
    for (const {name, gid} of tabs) {
      const rows = [];
      for (let r0 = 1; ; r0 += batch) {
        const part = await readRange(gid, r0, r0 + batch - 1);
        rows.push(...part);
        window.__cmsProgress = {...window.__cmsProgress, tab: name, rows: rows.length};
        if (part.length < batch) break;
      }
      // Trailing empty rows are dropped; every row is padded to the header's width.
      while (rows.length && rows.at(-1).every(c => c === '')) rows.pop();
      const ncols = rows[0]?.length || 0;
      const fixed = rows.map(r => (r.length >= ncols ? r.slice(0, ncols) : [...r, ...Array(ncols - r.length).fill('')]));
      // Canonical JSON = Python's json.dumps(rows, ensure_ascii=False, separators=(',', ':')) — the build's digest.
      const sha256 = await sha256Hex(JSON.stringify(fixed));
      out.push({name, gid, ncols, rows: fixed});
      receipts.push({name, gid, rows: fixed.length - 1, columns: ncols, sha256});
      window.__cmsProgress = {...window.__cmsProgress, done: out.length};
    }
    const payload = JSON.stringify({readOn: new Date().toISOString(), tabs: out});
    const {bytes, b64} = await gzipBase64(payload);
    if (into === 'page') {
      const pre = document.createElement('pre');
      pre.id = 'cms-payload';
      pre.textContent = `CMSBEGIN${b64}CMSEND${'.'.repeat(Math.max(0, pad - b64.length))}`;
      document.body.replaceChildren(pre);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], {type: 'application/gzip'}));
      a.download = `sheet-tabs-${new Date().toISOString().slice(0, 10)}.json.gz`;
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    window.__cmsProgress = {state: 'done', receipts, payloadSha256: await sha256Hex(payload)};
    console.table(receipts);
    return receipts;
  }

  /** Rows of one tab (header first), trailing empty rows dropped, every row padded to the header's width. */
  async function readTab(gid, batch = 2000) {
    const rows = [];
    for (let r0 = 1; ; r0 += batch) {
      const part = await readRange(gid, r0, r0 + batch - 1);
      rows.push(...part);
      window.__cmsProgress = {...(window.__cmsProgress || {}), gid, rows: rows.length};
      if (part.length < batch) break;
    }
    while (rows.length && rows.at(-1).every(c => c === '')) rows.pop();
    const ncols = rows[0]?.length || 0;
    return rows.map(r => (r.length >= ncols ? r.slice(0, ncols) : [...r, ...Array(ncols - r.length).fill('')]));
  }

  /** Show one block of a payload as the page body (a reader tool saves the page text). */
  function showBlock(text, pad = 0) {
    const pre = document.createElement('pre');
    pre.id = 'cms-payload';
    pre.textContent = `CMSBEGIN${text}CMSEND${'.'.repeat(Math.max(0, pad - text.length))}`;
    document.body.replaceChildren(pre);
  }

  /**
   * 05_PRODUCTION_ROWS in compact form, exactly the cells of the tab: columns whose values repeat become an index into
   * a dictionary (`dicts`), the category id and name one dictionary entry joined by U+0001, the contact columns (mostly
   * empty, never published) a sparse map {row: value}. `canonSha` is the SHA-256 of the tab's rows as canonical JSON —
   * scripts/join-compact-payload.py rebuilds the rows and must reach the same digest. The gzip + base64 payload is
   * split into pages of `pageChars` characters: showCompactPage(i) puts page i in the page body.
   */
  async function exportCompactTab({name, gid}, {batch = 4000, pageChars = 900000} = {}) {
    window.__cmsProgress = {state: 'running', tab: name};
    const rows = await readTab(gid, batch);
    const header = rows[0], body = rows.slice(1), at = h => header.indexOf(h);
    const need = ['production_row_id', 'name', 'category_id', 'category', 'gov_office_id', 'gov_sub_office_id', 'lat', 'lon', 'gov_name', 'officer',
      'phone', 'website', 'address', 'email_address', 'overlay_province_codes', 'overlay_subdistrict_ids'];
    const missing = need.filter(h => at(h) < 0);
    if (missing.length) throw new Error(`${name}: missing columns ${missing.join(', ')}`);
    const dicts = {cat: [], off: [], sub: [], gov: [], prov: [], sd: []}, index = {};
    const intern = (d, v) => { const m = (index[d] ||= new Map()); if (!m.has(v)) { m.set(v, dicts[d].length); dicts[d].push(v); } return m.get(v); };
    const cols = {id: [], name: [], cat: [], off: [], sub: [], lat: [], lon: [], gov: [], officer: [], prov: [], sd: []};
    const sparse = {phone: {}, website: {}, address: {}, email_address: {}};
    body.forEach((r, i) => {
      cols.id.push(r[at('production_row_id')]); cols.name.push(r[at('name')]);
      cols.cat.push(intern('cat', `${r[at('category_id')]}\u0001${r[at('category')]}`));
      cols.off.push(intern('off', r[at('gov_office_id')])); cols.sub.push(intern('sub', r[at('gov_sub_office_id')]));
      cols.lat.push(r[at('lat')]); cols.lon.push(r[at('lon')]); cols.gov.push(intern('gov', r[at('gov_name')]));
      cols.officer.push(r[at('officer')]); cols.prov.push(intern('prov', r[at('overlay_province_codes')])); cols.sd.push(intern('sd', r[at('overlay_subdistrict_ids')]));
      for (const k of Object.keys(sparse)) if (r[at(k)] !== '') sparse[k][i] = r[at(k)];
    });
    const canonSha = await sha256Hex(JSON.stringify(rows));
    const payload = JSON.stringify({name, gid, readOn: new Date().toISOString(), n: body.length, header, cols, dicts, sparse, canonSha});
    const {b64} = await gzipBase64(payload);
    const pages = [];
    for (let i = 0; i < b64.length; i += pageChars) pages.push(b64.slice(i, i + pageChars));
    window.__cmsPages = pages;
    window.__cmsProgress = {state: 'done', tab: name, rows: body.length, columns: header.length, canonSha, pages: pages.length, payloadSha256: await sha256Hex(payload)};
    return window.__cmsProgress;
  }
  const showCompactPage = (i, pad = 0) => showBlock(window.__cmsPages[i], pad);

  /** Google Sheets wraps a cell's link in its redirect (google.com/url?q=…): the link itself. */
  const unwrap = href => { try { const u = new URL(href); return u.hostname.endsWith('google.com') && u.pathname === '/url' ? u.searchParams.get('q') || '' : u.href; } catch { return ''; } };

  /** The hyperlinks of every cell of one tab: one list per row (header first) of one list per cell, aligned with the rows. */
  async function exportTabLinks({name, gid}, {batch = 2000, into = 'page', pad = 0} = {}) {
    const out = [];
    for (let r0 = 1; ; r0 += batch) {
      const url = `${base()}/htmlview/sheet?headers=false&gid=${encodeURIComponent(gid)}&range=A${r0}:ZZZ${r0 + batch - 1}`;
      const res = await fetch(url, {credentials: 'include', cache: 'no-store'});
      if (!res.ok) throw new Error(`gid ${gid} rows ${r0}: HTTP ${res.status}`);
      const doc = parse(await res.text());
      const table = doc.querySelector('table.waffle') || doc.querySelector('table');
      const trs = table ? [...table.querySelectorAll('tbody > tr')] : [];
      for (const tr of trs) {
        const cells = [];
        for (const td of tr.querySelectorAll(':scope > td')) {
          cells.push([...td.querySelectorAll('a[href]')].map(a => unwrap(a.getAttribute('href'))).filter(Boolean));
          for (let i = 1; i < Number(td.getAttribute('colspan') || 1); i++) cells.push([]);
        }
        out.push(cells);
      }
      if (trs.length < batch) break;
    }
    const payload = JSON.stringify({name, gid, links: out});
    if (into === 'page') showBlock((await gzipBase64(payload)).b64, pad);
    window.__cmsProgress = {state: 'done', tab: name, rows: out.length, payloadSha256: await sha256Hex(payload)};
    return window.__cmsProgress;
  }

  /**
   * The site tab's digest for scripts/build-sites.py (docs/SITES.md): the cells of SITE_COLUMNS of the rows whose
   * boundary_status is `checked`, in the tab's order. digest = SHA-256 of [SITE_COLUMNS, …those rows] as canonical JSON
   * (the build's --sheet-digest: equal digests = the build read what the sheet holds). tsvSha256 = SHA-256 of the whole
   * tab as text (header first, cells joined by a tab, rows by a line break) — the text that was pasted, when it is.
   * window.__cmsSites.lines: one "office_key|building_source|buildings_count|sha256(buildings_in_boundary) first 6" per
   * checked row (showBlock it for a reader tool, to find a row that differs).
   */
  const SITE_COLUMNS = ['office_key', 'boundary_status', 'boundary_source', 'boundary_evidence_url', 'buildings_in_boundary',
    'buildings_count', 'building_source', 'checked_on'];
  async function siteTabDigest({name, gid}, {show = false} = {}) {
    const all = (await readTab(gid)).filter(r => r.some(c => c !== '')); // the HTML view's frozen-row bar is an empty row
    const header = all[0] || [];
    let width = header.length;
    while (width && header[width - 1] === '') width--;
    const idx = SITE_COLUMNS.map(c => header.indexOf(c));
    const missing = SITE_COLUMNS.filter((c, i) => idx[i] < 0);
    if (missing.length) throw new Error(`${name}: no column ${missing.join(', ')}`);
    const body = all.slice(1), counts = {};
    for (const r of body) counts[r[idx[1]]] = (counts[r[idx[1]]] || 0) + 1;
    const checked = body.filter(r => r[idx[1]] === 'checked').map(r => idx.map(i => r[i] ?? ''));
    const lines = [];
    for (const r of checked) lines.push([r[0], r[6], r[5], (await sha256Hex(r[4])).slice(0, 6)].join('|'));
    window.__cmsSites = {lines: lines.join('\n')};
    if (show) showBlock(window.__cmsSites.lines);
    return {name, gid, rows: body.length, columns: width, counts, checked: checked.length,
      digest: await sha256Hex(JSON.stringify([SITE_COLUMNS, ...checked])),
      tsvSha256: await sha256Hex([header, ...body].map(r => r.slice(0, width).join('\t')).join('\n')),
      linesSha256: await sha256Hex(window.__cmsSites.lines)};
  }

  window.siteTabDigest = siteTabDigest;
  window.exportCompactTab = exportCompactTab;
  window.showCompactPage = showCompactPage;
  window.exportTabLinks = exportTabLinks;
  window.exportSheetTabs = exportSheetTabs;
})();
