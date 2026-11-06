#!/usr/bin/env python3
"""Build data/sites.json — the buildings of an office spread over several buildings, shown on the map as one site —
from the site tab of the government-office research sheet (docs/SITES.md).

Input (internal, never committed):
  --tab       the site tab (07_SITE_BOUNDARY_CHECK) as read in the owner's browser: <tab>.json = {name, gid, ncols, rows},
              rows[0] = the header row (scripts/export-sheet-tabs.js: exportSheetTabs → scripts/decode-sheet-payload.py).
              Columns are found by name and only SITE_COLUMNS are read, so the checked rows of those columns suffice (a
              reduced read). Their digest — SHA-256 of [SITE_COLUMNS, …the checked rows' cells] as canonical JSON, the
              value siteTabDigest() of scripts/export-sheet-tabs.js prints on the sheet's page — is recorded;
              --sheet-digest stops the build when the input's digest differs from the sheet's.
  --external  a published site file of another CityMETER dataset (School, Temple; docs/SITES.md §8), repeatable.
Public input: --data (data/offices.json and data/groups/*.json: the office's own point).
Output: --out (data/sites.json).

A ROW IS PUBLISHED when boundary_status is `checked`, boundary_source is approved for this dataset (SOURCES), its office
is a row of the data, it lists at least MIN_BUILDINGS buildings and buildings_count equals them. The build stops on a
building that is not "lon,lat" in Thailand, on a building more than SITE_MAX_M from the office's own point (a sheet
error, not a site), on an unknown source code and on an office listed twice.
PUBLISHED per site: the interior points of its buildings (pts, each standing inside one building the map draws), their
number (n), the check date (on), boundary_source (src), the building source (b) and, for a site checked against the
project's own layout, the public layout link (url).
NOT PUBLISHED: the frame (boundary_geojson), the OpenStreetMap element links of frame-only sites, match tier, notes, main
building note, checker.
LICENCE: the frames, and the OpenStreetMap buildings where the map draws them, are © OpenStreetMap contributors (ODbL
1.0); the site groups derived from them are offered under the ODbL 1.0 (owner approval 2026-11-06) and every page that
shows them carries the credit.
EXTERNAL SITES (the link is prepared; no file yet): a site of another dataset names the Government Office row it is
(`go`, the row's key); it replaces this sheet's site only when its boundary_source ranks higher (RANK: a check against
the project's layout beats a frame alone; an equal rank keeps this sheet's).
"""
import argparse, datetime, hashlib, json, math, os, re, sys

SHEET_TITLE = 'CityMETER Government Office Thailand — รายชื่อรอยืนยัน 2026-11-05'
SITE_COLUMNS = ['office_key', 'boundary_status', 'boundary_source', 'boundary_evidence_url', 'buildings_in_boundary',
                'buildings_count', 'building_source', 'checked_on']
SITE_STATUS = 'checked'
SITE_MAX_M = 600      # a site building farther from the office's own point is a sheet error (Hotel SITE_MAX_M)
MIN_BUILDINGS = 2     # one building is the office's building, not a site
SOURCES = {           # boundary_source codes this dataset publishes (owner 2026-11-06) → the words of the provenance line
    'osm_polygon': 'กรอบพื้นที่ OpenStreetMap',
    'osm_polygon+site_layout': 'กรอบพื้นที่ OpenStreetMap + ผังโครงการ',
}
EXTERNAL_SOURCES = {**SOURCES, 'dol_parcels+site_layout': 'รูปแปลงกรมที่ดิน + ผังโครงการ', 'site_layout': 'ผังโครงการ'}
RANK = {'dol_parcels+site_layout': 4, 'osm_polygon+site_layout': 3, 'site_layout': 2, 'osm_polygon': 1}
BUILDING_SOURCES = {'cm_v4': 'CityMETER Building V4', 'osm_buildings': 'OpenStreetMap'}
OSM = {'licence': 'ODbL-1.0', 'licenceUrl': 'https://opendatacommons.org/licenses/odbl/1-0/',
       'credit': '© OpenStreetMap contributors', 'creditUrl': 'https://www.openstreetmap.org/copyright'}
EXCLUDED = ['boundary_geojson (the frame)', 'boundary_evidence_url of frame-only sites (OpenStreetMap element pages)',
            'match_tier', 'main_building_note', 'notes', 'checked_by', 'name, type and district (data/offices.json has them)']


def canon(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def sha256_file(path):
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def haversine(lat1, lon1, lat2, lon2):
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def layout_url(u):
    """A public layout page: https, not a private copy, not a map link, not an OpenStreetMap element page."""
    u = (u or '').strip().split('\n')[0].strip()
    if not u.startswith('https://'):
        return ''
    if re.search(r'docs\.google\.com|drive\.google\.com|landometer\.com/api/|github\.com/theshifters/|localhost|\.local/', u):
        return ''
    if re.search(r'google\.[a-z.]+/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl/maps|earth\.google\.|openstreetmap\.org/', u):
        return ''
    return u


def site_points(parts, where):
    """[[lon, lat], …] (6 decimals) from "lon,lat;lon,lat" or a list of pairs; stops outside Thailand or on a repeat."""
    if isinstance(parts, str):
        parts = [p for p in re.split(r'[;\s]+', parts.strip()) if p]
    pts = []
    for part in parts:
        if isinstance(part, str):
            m = re.fullmatch(r'(\d{2,3}\.\d+),(\d{1,2}\.\d+)', part)
            if not m:
                sys.exit(f'{where}: building {part!r} is not "lon,lat"')
            lon, lat = float(m[1]), float(m[2])
        else:
            if not (isinstance(part, (list, tuple)) and len(part) == 2 and all(isinstance(v, (int, float)) for v in part)):
                sys.exit(f'{where}: building {part!r} is not [lon, lat]')
            lon, lat = float(part[0]), float(part[1])
        if not (97 <= lon <= 106 and 5 <= lat <= 21):
            sys.exit(f'{where}: building {lon},{lat} lies outside Thailand')
        pts.append([round(lon, 6), round(lat, 6)])
    if len({tuple(p) for p in pts}) != len(pts):
        sys.exit(f'{where}: a building is listed twice')
    return pts


def office_points(data_dir):
    """key → (lon, lat) of every row of the data (office groups and the other groups)."""
    first = json.load(open(os.path.join(data_dir, 'offices.json'), encoding='utf-8'))
    docs, out = [first], {}
    for g in first['groups']:
        if g.get('file'):
            rel = g['file'][len('data/'):] if g['file'].startswith('data/') else g['file']
            docs.append(json.load(open(os.path.join(data_dir, rel), encoding='utf-8')))
    for d in docs:
        c = d['cols']
        for k, lon, lat in zip(c['key'], c['lon'], c['lat']):
            out[k] = (lon, lat)
    return out


def read_tab(path):
    """The checked rows of SITE_COLUMNS, in the tab's order, and the tab's name and gid."""
    doc = json.load(open(path, encoding='utf-8'))
    rows = [r for r in doc['rows'] if any(str(c) != '' for c in r)]   # the HTML view's frozen-row bar is an empty row
    if not rows:
        sys.exit(f'{path}: no rows')
    header = [str(c) for c in rows[0]]
    missing = [c for c in SITE_COLUMNS if c not in header]
    if missing:
        sys.exit(f'{path}: no column {", ".join(missing)}')
    idx = [header.index(c) for c in SITE_COLUMNS]
    cell = lambda r, i: str(r[i]) if i < len(r) else ''
    checked = [[cell(r, i) for i in idx] for r in rows[1:] if cell(r, idx[1]) == SITE_STATUS]
    return doc.get('name', ''), doc.get('gid'), checked


def far_m(office, pts):
    lon0, lat0 = office
    return max(haversine(lat0, lon0, p[1], p[0]) for p in pts)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--tab', required=True, help='the site tab as read from the sheet (<tab>.json)')
    ap.add_argument('--sheet-digest', default='', help="siteTabDigest()'s digest on the sheet's page: the build stops if the input differs")
    ap.add_argument('--read-on', required=True, help='date the tab was read from the sheet (YYYY-MM-DD)')
    ap.add_argument('--read-method', default="the sheet's own HTML view in the owner's signed-in browser (scripts/export-sheet-tabs.js)")
    ap.add_argument('--frames-at', action='append', default=[], help='OpenStreetMap date of the frames (repeatable)')
    ap.add_argument('--external', action='append', default=[], help="another dataset's published site file (repeatable)")
    ap.add_argument('--data', default='data', help='directory of offices.json and groups/')
    ap.add_argument('--out', default='data/sites.json')
    a = ap.parse_args()

    name, gid, checked = read_tab(a.tab)
    digest = hashlib.sha256(canon([SITE_COLUMNS] + checked)).hexdigest()
    if a.sheet_digest and a.sheet_digest != digest:
        sys.exit(f'STOP: the input is not the sheet: digest {digest} ≠ the sheet\'s {a.sheet_digest}')
    office = office_points(a.data)
    sites, counts = {}, {'checkedRows': len(checked), 'unmatched': 0, 'fewBuildings': 0}
    for key, _status, src, url, pts_text, n_text, b, on in checked:
        where = f'{name or a.tab} {key}'
        if src not in SOURCES:
            sys.exit(f'{where}: boundary_source {src!r} is not approved for this dataset ({", ".join(SOURCES)})')
        if b not in BUILDING_SOURCES:
            sys.exit(f'{where}: building_source {b!r} is not one of {", ".join(BUILDING_SOURCES)}')
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', on):
            sys.exit(f'{where}: checked_on {on!r} is not YYYY-MM-DD')
        pts = site_points(pts_text, where)
        if n_text.strip() != str(len(pts)):
            sys.exit(f'{where}: buildings_count {n_text!r} but {len(pts)} buildings listed')
        if key in sites:
            sys.exit(f'{where}: the office is listed twice')
        if key not in office:
            counts['unmatched'] += 1
            continue
        if len(pts) < MIN_BUILDINGS:
            counts['fewBuildings'] += 1
            continue
        if far_m(office[key], pts) > SITE_MAX_M:
            sys.exit(f'{where}: a site building {far_m(office[key], pts):.0f} m from the office (more than {SITE_MAX_M} m)')
        site = {'pts': pts, 'n': len(pts), 'on': on, 'src': src, 'b': b}
        if 'site_layout' in src and layout_url(url):
            site['url'] = layout_url(url)
        sites[key] = site

    externals = []
    for x, path in enumerate(a.external):
        ext = json.load(open(path, encoding='utf-8'))
        m = ext.get('meta') or {}
        info = {'dataset': m.get('dataset', ''), 'datasetTh': m.get('datasetTh', ''), 'registryId': m.get('registryId', ''),
                'licence': m.get('licence', ''), 'credit': m.get('credit', ''), 'file': os.path.basename(path),
                'sha256': sha256_file(path), 'offered': 0, 'linked': 0, 'used': 0}
        if not info['dataset']:
            sys.exit(f'{path}: meta.dataset is missing')
        for vid, s in sorted((ext.get('sites') or {}).items()):
            key = str(s.get('go') or '').strip()
            if not key:
                continue
            info['offered'] += 1
            if key not in office:
                continue
            info['linked'] += 1
            where = f'{info["dataset"]} {vid} → {key}'
            src, b = s.get('src', ''), s.get('b', '')
            if src not in EXTERNAL_SOURCES or b not in BUILDING_SOURCES:
                sys.exit(f'{where}: source {src!r} / {b!r} is not known')
            pts = site_points(s.get('pts') or [], where)
            on = str(s.get('on') or '')
            if len(pts) < MIN_BUILDINGS or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', on):
                continue
            if far_m(office[key], pts) > SITE_MAX_M:
                sys.exit(f'{where}: a site building {far_m(office[key], pts):.0f} m from the office (more than {SITE_MAX_M} m)')
            mine = sites.get(key)
            if mine and RANK[src] <= RANK.get(mine['src'], 0):
                continue
            site = {'pts': pts, 'n': len(pts), 'on': on, 'src': src, 'b': b, 'x': x}
            if 'site_layout' in src and layout_url(s.get('url')):
                site['url'] = layout_url(s.get('url'))
            sites[key] = site
            info['used'] += 1
        externals.append(info)

    used = {s['src'] for s in sites.values()}
    by = lambda f: {k: sum(1 for s in sites.values() if s[f] == k) for k in sorted({s[f] for s in sites.values()})}
    counts.update({'sites': len(sites), 'buildings': sum(s['n'] for s in sites.values()), 'bySource': by('src'),
                   'byBuildingSource': by('b'), 'external': sum(1 for s in sites.values() if 'x' in s)})
    meta = {
        'dataset': 'CityMETER Government Office', 'datasetTh': 'หน่วยงานรัฐ', 'registryId': 'research.TH.government_office',
        'what': 'office sites: the buildings of an office spread over several buildings, one point inside each building',
        'sheetTitle': SHEET_TITLE,
        'tab': {'name': name, 'gid': gid, 'columns': SITE_COLUMNS, 'status': SITE_STATUS, 'checkedRows': len(checked),
                'digest': digest, 'digestRule': 'SHA-256 of [columns, …the checked rows] as canonical JSON (siteTabDigest)',
                'readOn': a.read_on, 'readMethod': a.read_method},
        'builtOn': datetime.date.today().isoformat(), 'checkedOn': sorted({s['on'] for s in sites.values()}),
        'framesAt': a.frames_at, 'maxM': SITE_MAX_M, 'minBuildings': MIN_BUILDINGS,
        'rule': ("a checked row of the site tab publishes the interior points of the buildings the map draws inside the "
                 "office's site (an OpenStreetMap area of the office matched by place and name; the buildings whose point "
                 "stands in it); the map shows the buildings holding those points as the office's site. The frame, the "
                 "match and the notes stay in the sheet."),
        'sources': {k: EXTERNAL_SOURCES[k] for k in sorted(used | set(SOURCES))},
        'buildingSources': BUILDING_SOURCES, 'rank': RANK,
        **OSM, 'licenceScope': 'the site groups: a database derived from OpenStreetMap areas (and OpenStreetMap buildings where the map draws them)',
        'counts': counts, 'external': externals,
        'externalRule': ("a site of another CityMETER dataset that names a row here (go = the row's key) replaces this "
                         "sheet's site only when its boundary_source ranks higher; an equal rank keeps this sheet's"),
        'excludedFields': EXCLUDED,
    }
    out = {'meta': meta, 'sites': {k: sites[k] for k in sorted(sites)}}
    raw = canon(out)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'wb') as fh:
        fh.write(raw)
    print(json.dumps({'digest': digest, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), **counts}, ensure_ascii=False))


if __name__ == '__main__':
    main()
