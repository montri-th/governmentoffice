#!/usr/bin/env python3
"""Join the pages of a compact tab payload (scripts/export-sheet-tabs.js#exportCompactTab), gunzip, expand it back to the
tab's rows and check them against the digest the browser computed.

  python3 -I scripts/join-compact-payload.py PAGE [PAGE …] OUT.json

Each PAGE is a reader tool's saved page text (or a text file) holding one block CMSBEGIN<base64 part>CMSEND, given in
page order. OUT.json = {name, gid, readOn, ncols, sha256, rows} with rows[0] = the header row — the same shape as
scripts/decode-sheet-payload.py writes, so scripts/build-data.py reads both alike. The script stops when the rebuilt
rows do not reach the browser's canonical SHA-256 (`canonSha`). OUT is internal (never committed): it holds the
research sheet's cells.

Used for 05_PRODUCTION_ROWS of the government-office research sheet (Government Office 0.1.0, 2026-11-06).
"""
import base64, gzip, hashlib, json, sys


def block(path):
    text = open(path, encoding='utf-8').read()
    try:
        doc = json.loads(text)
        if isinstance(doc, list):
            text = ''.join(x.get('text', '') for x in doc if isinstance(x, dict))
        elif isinstance(doc, dict) and 'text' in doc:
            text = doc['text']
    except ValueError:
        pass
    a, b = text.index('CMSBEGIN') + 8, text.index('CMSEND')
    return text[a:b]


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    pages, out = sys.argv[1:-1], sys.argv[-1]
    b64 = ''.join(block(p) for p in pages)
    gz = base64.b64decode(b64)
    raw = gzip.decompress(gz)
    print('pages', len(pages), 'base64', len(b64), 'gzip', len(gz), 'json', len(raw), 'payload sha256', hashlib.sha256(raw).hexdigest())
    P = json.loads(raw)
    hdr, C, D, S = P['header'], P['cols'], P['dicts'], P['sparse']
    rows = []
    for i in range(P['n']):
        cid, cname = D['cat'][C['cat'][i]].split('\u0001')
        r = {'production_row_id': C['id'][i], 'name': C['name'][i], 'category_id': cid, 'category': cname,
             'gov_office_id': D['off'][C['off'][i]], 'gov_sub_office_id': D['sub'][C['sub'][i]], 'lat': C['lat'][i], 'lon': C['lon'][i],
             'gov_name': D['gov'][C['gov'][i]], 'officer': C['officer'][i],
             'phone': S['phone'].get(str(i), ''), 'website': S['website'].get(str(i), ''), 'address': S['address'].get(str(i), ''),
             'email_address': S['email_address'].get(str(i), ''),
             'overlay_province_codes': D['prov'][C['prov'][i]], 'overlay_subdistrict_ids': D['sd'][C['sd'][i]]}
        rows.append([r[h] for h in hdr])
    canon = json.dumps([hdr] + rows, ensure_ascii=False, separators=(',', ':')).encode()
    sha = hashlib.sha256(canon).hexdigest()
    print('rows', len(rows), 'sha256', sha, 'browser', P['canonSha'])
    if sha != P['canonSha']:
        sys.exit('the rebuilt rows do not match the browser digest')
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'name': P.get('name', '05_PRODUCTION_ROWS'), 'gid': P['gid'], 'readOn': P['readOn'], 'ncols': len(hdr), 'sha256': sha, 'rows': [hdr] + rows}, fh, ensure_ascii=False)


if __name__ == '__main__':
    main()
