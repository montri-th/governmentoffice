#!/usr/bin/env python3
"""Split the payload of scripts/export-sheet-tabs.js into one JSON per tab ({name, gid, ncols, rows}), or write the
hyperlinks of a tab (exportTabLinks) as <tab>.links.json (one list per row and cell, aligned with the tab's rows).

  python3 -I scripts/decode-sheet-payload.py PAYLOAD OUTDIR

PAYLOAD is either the downloaded .json.gz file, or a text/JSON file holding the page block CMSBEGIN<base64 gzip>CMSEND
(for instance a reader tool's saved output of the page). Prints the size and SHA-256 of each stage and, per tab, the
row count, the width and the SHA-256 of its rows as canonical JSON (the digest scripts/build-data.py records).
OUTDIR is internal (never committed): it holds the research master's cells.
"""
import base64, gzip, hashlib, json, os, sys


def payload_bytes(path):
    raw = open(path, 'rb').read()
    if raw[:2] == b'\x1f\x8b':
        return raw
    text = raw.decode('utf-8')
    try:
        doc = json.loads(text)
        if isinstance(doc, list):
            text = ''.join(x.get('text', '') for x in doc if isinstance(x, dict))
    except ValueError:
        pass
    a, b = text.index('CMSBEGIN') + 8, text.index('CMSEND')
    return base64.b64decode(text[a:b])


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    gz = payload_bytes(sys.argv[1])
    print('gzip', len(gz), 'sha256', hashlib.sha256(gz).hexdigest())
    raw = gzip.decompress(gz)
    print('json', len(raw), 'sha256', hashlib.sha256(raw).hexdigest())
    doc = json.loads(raw)
    os.makedirs(sys.argv[2], exist_ok=True)
    if 'links' in doc:
        print(f"{doc['name']}: hyperlinks of {len(doc['links'])} rows")
        with open(os.path.join(sys.argv[2], doc['name'] + '.links.json'), 'w', encoding='utf-8') as fh:
            json.dump(doc['links'], fh, ensure_ascii=False)
        return
    for tab in doc['tabs']:
        bad = sum(1 for r in tab['rows'] if len(r) != tab['ncols'])
        canon = json.dumps(tab['rows'], ensure_ascii=False, separators=(',', ':')).encode()
        print(f"{tab['name']}: {len(tab['rows']) - 1} rows × {tab['ncols']} · ragged {bad} · sha256 {hashlib.sha256(canon).hexdigest()}")
        with open(os.path.join(sys.argv[2], tab['name'] + '.json'), 'w', encoding='utf-8') as fh:
            json.dump(tab, fh, ensure_ascii=False)


if __name__ == '__main__':
    main()
