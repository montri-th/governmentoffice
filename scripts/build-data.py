#!/usr/bin/env python3
"""Build data/offices.json and data/groups/{education,religion,community}.json from the government-office research
sheet, CityMETER production base info, the production totals of the Government Officer dataset and CityMETER · Transit.

Inputs (internal, never committed):
  --tabs     directory of the research sheet's tabs as read in the owner's browser (scripts/export-sheet-tabs.js:
             <tab>.json = {name, gid, ncols, rows}, rows[0] = the header row) of “CityMETER Government Office Thailand —
             รายชื่อรอยืนยัน 2026-11-05” (Google Sheets, registry id research.TH.government_office). The sheet is too large
             for a Drive export (28 MB); every tab is read cell by cell from the sheet's own HTML view and the SHA-256 of
             its rows (canonical JSON) is recorded in meta.tabs. Tabs read: 00_README, 01_AGENCIES,
             02_OFFICE_CANDIDATES, 03_RECENT_EVENTS, 04_SOURCES, 05_PRODUCTION_ROWS, 06_RECENT_PROD_GAPS
             (+ 06_RECENT_PROD_GAPS.links.json: the hyperlinks of that tab's link cells).
  --api      production base info and government-agency info lv0 with receipts (scripts/fetch-base.py)
Public inputs:
  --index    data/area-index.json (district gazetteer)
  --transit  a checkout of montri-th/transit (data/transit.json: rail stations of CityMETER · Transit)

Outputs: data/offices.json (the government-office groups + every dictionary + provenance), data/groups/<group>.json
(the rows of the other groups; the page loads every file at start), data/build-report.json (counts and checks).

ONE ROW = one production point: a point of 05_PRODUCTION_ROWS (one UUID of the CityMETER production Government Officer
dataset, government_agency, as production's overlay returns it: 440,005 points in 77 provinces). Release 0.2.0 (owner
2026-11-06, “อยากได้ทั้งสี่แสนจุด”): every point is its own row, as production counts them — nothing is merged, moved,
split or re-labelled; the key is the first 10 hex digits of the UUID (unique across the dataset, checked).

REPEATED POINTS OF ONE OFFICE (same type, same name — spaces and zero-width characters ignored — same province, chained
within REPEAT_M metres) stay separate rows; only their personnel is counted once: at the point with the smallest UUID
that records it, the other points naming that point (staffShared).

RECONCILIATION (the build stops on any failure): the rows per district and category, and the recorded personnel per
district and category, equal production's government-agency info lv0 read today, district by district.

DISTRICT = the production district of the point's overlay subdistrict (05.overlay_subdistrict_ids → base info lv1
subdistrict → its district code): production's own spatial membership, never re-assigned.

GROUPS (presentation of production's 13 categories and the points without one): admin (ปกครอง), police (ตำรวจ), fire
(ดับเพลิง), justice (ยุติธรรม), military (ทหาร) and unclassified (no category yet) are the government-office groups
(personnel applies); education (มหาวิทยาลัย · โรงเรียน · แหล่งความรู้), religion (ศาสนา · โบราณสถาน) and community
(ชุมชน · ความปลอดภัยชุมชน · สมาคม / มูลนิธิ) are the other places of the same dataset, published in their own files.
The page's default scope is every group (every production point).
TYPES = production's gov_sub_office_id with production's own labels.

PERSONNEL (production's `officer`, “บุคลากร” on production): a row's personnel is known only when its type records a
count at that site. Per type of the office groups, from the values themselves:
  constant   ≥ 90 % of the positive values are one value (a default, not a count): unknown
  scale      90th percentile of the positive values below 10 (not a staff count for that kind of office): unknown
  none       no positive value: unknown
  agency     the points without a category are agencies' head offices whose value is the agency's whole workforce:
             kept apart as agencyStaff (shown on the office, never summed into an area)
  site       otherwise: the positive value is the personnel recorded at that office
Every other group: production's value means something else (students, 1 per point, 0) — unknown here.
Blank and 0 are unknown, never zero personnel.

CONTEXT
  rail      nearest operating rail station of CityMETER · Transit and nearest station under construction, straight line
            from the production point, within RAIL_MAX_M
  events    06_RECENT_PROD_GAPS: dated moves, new office buildings and service points of 2567–2569 that production does
            not hold at their new place — linked to the production row they replace where the sheet names its UUID
  ministry  01_AGENCIES: the row's agency name (gov_name, else its own name) equal to an agency of OPDC/DGA gives the
            parent organisation as the sheet records it

Not copied (meta.excludedFields): telephone numbers, e-mail addresses, postal addresses, websites, full UUIDs,
production office ids, researcher notes and summaries, private sheet links, 02_OFFICE_CANDIDATES rows (a name list
with repeats, not offices). Source links are public https pages only.
"""
import argparse, collections, datetime, hashlib, json, math, os, re, sys, unicodedata, urllib.parse

RAIL_MAX_M = 2000
REPEAT_M = 100
# Local-government types whose personnel belongs to the organisation named in gov_name.
ORG_STAFF_TYPES = {'1020', '1030', '1040', '1050'}
TABS = ['00_README', '01_AGENCIES', '02_OFFICE_CANDIDATES', '03_RECENT_EVENTS', '04_SOURCES', '05_PRODUCTION_ROWS',
        '06_RECENT_PROD_GAPS']
SHEET_TITLE = 'CityMETER Government Office Thailand — รายชื่อรอยืนยัน 2026-11-05'
KEY_LEN = 10

# Groups: id, Thai, English, office (default scope), file (non-office groups load on demand).
GROUPS = [
    ('admin', 'ปกครองและท้องถิ่น', 'Administration and local government', True),
    ('police', 'ตำรวจ', 'Police', True),
    ('fire', 'ดับเพลิง', 'Fire and rescue', True),
    ('justice', 'ศาลและยุติธรรม', 'Courts and justice', True),
    ('military', 'ทหาร', 'Military', True),
    ('unclassified', 'ยังไม่ระบุหมวด', 'Category not yet assigned', True),
    ('education', 'การศึกษาและแหล่งเรียนรู้', 'Education and learning', False),
    ('religion', 'ศาสนาและโบราณสถาน', 'Religion and heritage', False),
    ('community', 'ชุมชนและสมาคม', 'Community and associations', False),
]
GROUP_INDEX = {g[0]: i for i, g in enumerate(GROUPS)}
# Production categories (category_id → label of the production page) and their group; '' = no category yet.
CATS = [
    ('1', 'ปกครอง', 'admin'), ('2', 'ตำรวจ', 'police'), ('4', 'ดับเพลิง', 'fire'), ('5', 'ยุติธรรม', 'justice'),
    ('3', 'ทหาร', 'military'), ('', 'รอการยืนยัน', 'unclassified'),
    ('6', 'มหาวิทยาลัย', 'education'), ('7', 'โรงเรียน', 'education'), ('8', 'แหล่งความรู้', 'education'),
    ('10', 'ศาสนา', 'religion'), ('9', 'โบราณสถาน', 'religion'),
    ('11', 'ชุมชน', 'community'), ('12', 'ความปลอดภัยชุมชน', 'community'), ('13', 'สมาคม / มูลนิธิ', 'community'),
]
CAT_INDEX = {c[0]: i for i, c in enumerate(CATS)}
# Types: production's gov_sub_office_id with production's own label (web-v3 dataset-government-agency/styles.ts),
# a short form for tight places, and a label tier (1 = named first near the middle of the view).
TYPES = [
    ('1010', 'ที่ว่าการอำเภอ', 'ที่ว่าการอำเภอ', 1), ('1050', 'เทศบาลนคร', 'ทน.', 1), ('1040', 'เทศบาลเมือง', 'ทม.', 1),
    ('1030', 'เทศบาลตำบล', 'ทต.', 2), ('1020', 'องค์การบริหารส่วนตำบล', 'อบต.', 2),
    ('1060', 'องค์กรปกครองส่วนท้องถิ่นรูปแบบพิเศษ', 'ท้องถิ่นรูปแบบพิเศษ', 2),
    ('1070', 'สถานีตำรวจ', 'สถานีตำรวจ', 1), ('1080', 'ที่พักสายตรวจ/จุดบริการประชาชนของตำรวจ', 'จุดบริการตำรวจ', 3),
    ('1090', 'ศูนย์ฝึกอบรมตำรวจ', 'ศูนย์ฝึกตำรวจ', 2),
    ('1121', 'สถานีดับเพลิง', 'สถานีดับเพลิง', 1),
    ('1182', 'ศาลจังหวัด', 'ศาลจังหวัด', 1), ('1192', 'ศาลแขวง', 'ศาลแขวง', 1), ('1202', 'ศาลเยาวชนและครอบครัวจังหวัด', 'ศาลเยาวชนฯ', 1),
    ('1152', 'ศาลอุทธรณ์ภาค', 'ศาลอุทธรณ์ภาค', 1), ('1162', 'ศาลอาญาคดีทุจริตและประพฤติมิชอบภาค', 'ศาลคดีทุจริตภาค', 1),
    ('1172', 'ศาลแรงงานภาค', 'ศาลแรงงานภาค', 1), ('1210', 'ศาลปกครองภูมิภาค (ศาลปกครองชั้นต้น)', 'ศาลปกครอง', 1),
    ('1142', 'สำนักงานศาลยุติธรรมประจำภาค', 'สนง.ศาลยุติธรรมภาค', 2), ('1130', 'เรือนจำ/ทัณฑสถาน', 'เรือนจำ', 2),
    ('1100', 'ค่ายทหาร', 'ค่ายทหาร', 2), ('1110', 'ศูนย์ฝึกทางทหาร', 'ศูนย์ฝึกทหาร', 2),
    ('', 'ยังไม่ระบุประเภท', 'ไม่ระบุประเภท', 1),
    ('2010', 'มหาวิทยาลัย (ในสังกัดของรัฐ)', 'มหาวิทยาลัยรัฐ', 1), ('2020', 'มหาวิทยาลัย (เอกชน)', 'มหาวิทยาลัยเอกชน', 1),
    ('2030', 'วิทยาลัย (ในสังกัดของรัฐ)', 'วิทยาลัยรัฐ', 2), ('2040', 'วิทยาลัย (เอกชน)', 'วิทยาลัยเอกชน', 2),
    ('2050', 'โรงเรียนที่เปิดสอนในระดับชั้นมัธยม ประถม และอนุบาล (ในสังกัดของรัฐ)', 'โรงเรียนรัฐ อนุบาล–มัธยม', 3),
    ('2060', 'โรงเรียนที่เปิดสอนในระดับชั้นมัธยม ประถม และอนุบาล (เอกชน)', 'โรงเรียนเอกชน อนุบาล–มัธยม', 3),
    ('2070', 'โรงเรียนที่เปิดสอนในระดับชั้นมัธยม และประถม (ในสังกัดของรัฐ)', 'โรงเรียนรัฐ ประถม–มัธยม', 3),
    ('2080', 'โรงเรียนที่เปิดสอนในระดับชั้นมัธยม และประถม (เอกชน)', 'โรงเรียนเอกชน ประถม–มัธยม', 3),
    ('2090', 'โรงเรียนที่เปิดสอนในระดับชั้นมัธยม (ในสังกัดของรัฐ)', 'โรงเรียนรัฐ มัธยม', 3),
    ('2100', 'โรงเรียนที่เปิดสอนในระดับชั้นมัธยม (เอกชน)', 'โรงเรียนเอกชน มัธยม', 3),
    ('2110', 'โรงเรียนที่เปิดสอนในระดับชั้นประถม และอนุบาล (ในสังกัดของรัฐ)', 'โรงเรียนรัฐ อนุบาล–ประถม', 3),
    ('2120', 'โรงเรียนที่เปิดสอนในระดับชั้นประถม และอนุบาล (เอกชน)', 'โรงเรียนเอกชน อนุบาล–ประถม', 3),
    ('2130', 'โรงเรียนที่เปิดสอนในระดับชั้นประถม (ในสังกัดของรัฐ)', 'โรงเรียนรัฐ ประถม', 3),
    ('2140', 'โรงเรียนที่เปิดสอนในระดับชั้นประถม (เอกชน)', 'โรงเรียนเอกชน ประถม', 3),
    ('2150', 'โรงเรียนที่เปิดสอนในระดับชั้นอนุบาล (ในสังกัดของรัฐ)', 'โรงเรียนรัฐ อนุบาล', 3),
    ('2160', 'โรงเรียนที่เปิดสอนในระดับชั้นอนุบาล (เอกชน)', 'โรงเรียนเอกชน อนุบาล', 3),
    ('2170', 'สถานรับเลี้ยงเด็ก/ศูนย์พัฒนาเด็กเล็ก (ในสังกัดของรัฐ)', 'ศูนย์เด็กเล็กรัฐ', 3),
    ('2180', 'สถานรับเลี้ยงเด็ก/ศูนย์พัฒนาเด็กเล็ก (เอกชน)', 'ศูนย์เด็กเล็กเอกชน', 3),
    ('2190', 'ศูนย์การศึกษานอกระบบและการศึกษาตามอัธยาศัย (กศน.)', 'กศน.', 3),
    ('2200', 'หอสมุด/ห้องสมุด', 'ห้องสมุด', 3), ('2210', 'พิพิธภัณฑ์', 'พิพิธภัณฑ์', 2),
    ('3030', 'วัด', 'วัด', 3), ('3040', 'สำนักสงฆ์', 'สำนักสงฆ์', 3), ('3050', 'ศาสนสถานของศาสนาอิสลาม', 'มัสยิด', 3),
    ('3060', 'ศาสนสถานของศาสนาคริสต์', 'โบสถ์คริสต์', 3), ('3070', 'ศาสนสถานของศาสนาพราหมณ์-ฮินดู', 'เทวสถาน', 3),
    ('3080', 'ศาสนสถานของศาสนาซิกข์', 'ศาสนสถานซิกข์', 3), ('3090', 'ศาลเจ้า (ขึ้นทะเบียนศาลเจ้าแล้ว)', 'ศาลเจ้าขึ้นทะเบียน', 3),
    ('3100', 'ศาลเจ้า (ที่ยังไม่ขึ้นทะเบียนศาลเจ้า)', 'ศาลเจ้า', 3),
    ('3110', 'สุสาน/ฌาปนสถาน (ได้รับใบอนุญาตจัดตั้งแล้ว)', 'สุสาน/ฌาปนสถาน', 3),
    ('3120', 'สุสาน/ฌาปนสถาน (ที่ยังไม่ได้รับใบอนุญาตจัดตั้ง)', 'สุสาน/ฌาปนสถาน (ไม่มีใบอนุญาต)', 3),
    ('3010', 'โบราณสถาน/อุทยานประวัติศาสตร์/แหล่งโบราณคดี (ขึ้นทะเบียนกับกรมศิลปากรแล้ว)', 'โบราณสถานขึ้นทะเบียน', 2),
    ('3020', 'โบราณสถาน/อุทยานประวัติศาสตร์/แหล่งโบราณคดี (อยู่ระหว่างการจดทะเบียน/ยังไม่จดทะเบียนกับกรมศิลปากร)', 'โบราณสถาน', 3),
    ('4013', 'ที่ทำการผู้ใหญ่บ้าน/ผู้นำชุมชน', 'ที่ทำการผู้ใหญ่บ้าน', 3), ('4023', 'ที่ทำการกองทุนหมู่บ้าน', 'กองทุนหมู่บ้าน', 3),
    ('4033', 'ศาลาประชาคม/ศาลากลางบ้าน', 'ศาลาประชาคม', 3), ('4043', 'ป้อม/จุดตรวจ/จุดสกัด ของเจ้าหน้าที่ฝ่ายปกครอง', 'จุดตรวจฝ่ายปกครอง', 3),
    ('4050', 'สำนักงานมูลนิธิ', 'มูลนิธิ', 3), ('4060', 'สำนักงานสมาคม', 'สมาคม', 3),
]
TYPE_INDEX = {t[0]: i for i, t in enumerate(TYPES)}
EVENT_KINDS = ['ย้ายที่ตั้ง', 'เปิดอาคารสำนักงานใหม่', 'เปิดสำนักงานใหม่', 'เปิดจุดบริการ']
SOURCES = [
    ('production', 'CityMETER Government Officer (หน่วยงานรัฐและบุคลากรของ CityMETER production)',
     'https://landometer.com/v3/citymeter?d=governmentOfficer'),
]
EXCLUDED = ['phone', 'website', 'address', 'email_address', 'production_row_id (full UUID; the key is its first 10 hex)',
            'gov_office_id', 'overlay_subdistrict_ids', 'researcher summaries and gap reasons (06)', 'private sheet links',
            '02_OFFICE_CANDIDATES rows (DOPA/BMA name list with repeats)', '01_AGENCIES contact addresses and evidence ids',
            'map links and coordinate source links (06 แหล่งพิกัด)']


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def canon(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def read_tabs(d):
    out, shas = {}, {}
    for t in TABS:
        doc = json.load(open(os.path.join(d, t + '.json'), encoding='utf-8'))
        rows = [r for r in doc['rows'] if any(c != '' for c in r)]   # the HTML view's frozen-row bar is an empty row
        shas[t] = {'gid': doc.get('gid'), 'rows': len(rows) - 1, 'columns': len(rows[0]), 'sha256': hashlib.sha256(canon(rows)).hexdigest()}
        out[t] = rows
    return out, shas


def th_norm(s):
    s = unicodedata.normalize('NFC', str(s or ''))
    s = re.sub(r'[​‌‍﻿]', '', s)
    return re.sub(r'\s+', '', s).strip()


def iso(d):
    d = (d or '').strip()
    m = re.fullmatch(r'(\d{4})-(\d{2})-(\d{2})', d)
    if m:
        return d
    m = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', d)
    return f'{int(m[3]):04d}-{int(m[1]):02d}-{int(m[2]):02d}' if m else ''


def haversine(lat1, lon1, lat2, lon2):
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


class Grid:
    """Points bucketed in ~0.02° cells for nearest-within-radius queries."""
    def __init__(self, items, cell=0.02):
        self.cell, self.cells = cell, collections.defaultdict(list)
        for it in items:
            self.cells[(int(it['lat'] // cell), int(it['lon'] // cell))].append(it)

    def nearest(self, lat, lon, max_m):
        reach = int(math.ceil((max_m / 111320) / self.cell)) + 1
        ci, cj = int(lat // self.cell), int(lon // self.cell)
        best, best_d = None, max_m + 1e-9
        for i in range(ci - reach, ci + reach + 1):
            for j in range(cj - reach, cj + reach + 1):
                for it in self.cells.get((i, j), ()):
                    d = haversine(lat, lon, it['lat'], it['lon'])
                    if d < best_d:
                        best, best_d = it, d
        return (best, best_d) if best else (None, None)


def public_url(u):
    u = (u or '').strip().split('\n')[0].strip()
    if u.startswith('http://'):
        return ''
    if not u.startswith('https://'):
        return ''
    # Private copies (Drive, Docs), the production API, the private production repository and local hosts are never
    # published as a source link.
    if re.search(r'docs\.google\.com|drive\.google\.com|landometer\.com/api/|github\.com/theshifters/|localhost|\.local/', u):
        return ''
    # A map link is where someone dropped a pin, not an announcement or a source: never published.
    if re.search(r'google\.[a-z.]+/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl/maps', u):
        return ''
    return u


def repo_commit(path):
    head = open(os.path.join(path, '.git', 'HEAD')).read().strip()
    if head.startswith('ref:'):
        ref = head.split(' ', 1)[1]
        p = os.path.join(path, '.git', ref)
        if os.path.exists(p):
            return open(p).read().strip()
        for line in open(os.path.join(path, '.git', 'packed-refs')):
            if line.strip().endswith(ref):
                return line.split()[0]
    return head


def staff_rule(values):
    """The personnel status of one office type from its rows' positive values (see the module docstring)."""
    pos = sorted(v for v in values if v > 0)
    if not pos:
        return 'none'
    mode_n = collections.Counter(pos).most_common(1)[0][1]
    if mode_n / len(pos) >= 0.9:
        return 'constant'
    if pos[min(len(pos) - 1, int(len(pos) * 0.9))] < 10:
        return 'scale'
    return 'site'


def common_prefix(names, share=0.6, min_len=6):
    """The longest prefix (≥ min_len characters) that at least `share` of the names start with; '' when none."""
    if len(names) < 50:
        return ''
    best = ''
    for n in range(min_len, 60):
        c = collections.Counter(x[:n] for x in names if len(x) > n)
        if not c:
            break
        p, k = c.most_common(1)[0]
        if k / len(names) < share:
            break
        best = p
    return best


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--tabs', required=True)
    ap.add_argument('--api', required=True)
    ap.add_argument('--index', required=True)
    ap.add_argument('--transit', required=True)
    ap.add_argument('--read-on', default='2026-11-06', help='date the tabs were read from the sheet')
    ap.add_argument('--sheet-modified', default='2026-11-06T03:51:53Z', help="the sheet's Drive modifiedTime when read")
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    tabs, tab_shas = read_tabs(a.tabs)
    prod = tabs['05_PRODUCTION_ROWS']
    H = {h: i for i, h in enumerate(prod[0])}
    rows_in = prod[1:]
    problems = []

    # ---------- gazetteer (production base info) ----------
    lv0 = json.load(open(os.path.join(a.api, 'base-lv0.json'), encoding='utf-8'))['value']['provinceInfos']
    prov_by_dopa = {p['code']: p['abbrEn'] for p in lv0}
    prov_by_th = {th_norm(p['nameTh']): p['abbrEn'] for p in lv0}
    sub_to_district, district_uuid, district_by_name = {}, {}, {}
    for p in lv0:
        base = json.load(open(os.path.join(a.api, f"base-{p['id']}.json"), encoding='utf-8'))['value']
        for d in base['districtInfos']:
            district_uuid[d['id']] = d['code']
            district_by_name[(p['abbrEn'], th_norm(d['nameTh']))] = d['code']
        for s in base['subdistrictInfos']:
            sub_to_district[s['id']] = (s['code'][:4], p['abbrEn'], p['code'])
    receipts = {f: json.load(open(os.path.join(a.api, f), encoding='utf-8')) for f in sorted(os.listdir(a.api)) if f.endswith('.meta.json') and f.startswith('base-')}
    receipts_sha = hashlib.sha256(json.dumps(receipts, sort_keys=True).encode()).hexdigest()
    index = json.load(open(a.index, encoding='utf-8'))
    index_ids = set(index['areas']['id'])
    index_prov = dict(zip(index['areas']['id'], index['areas']['province']))

    # ---------- transit ----------
    transit_path = os.path.join(a.transit, 'data', 'transit.json')
    transit = json.load(open(transit_path, encoding='utf-8'))
    tlines = {l['id']: l for l in transit['lines']}
    stations = []
    for s in transit['stations']:
        if not (isinstance(s.get('lat'), (int, float)) and isinstance(s.get('lng'), (int, float))):
            continue
        if s.get('status') not in ('operating', 'construction'):
            continue
        stations.append({'id': s['id'], 'name': s['name'], 'nameEn': s.get('nameEn') or '', 'lat': s['lat'], 'lon': s['lng'], 'status': s['status'],
                         'lines': [tlines[l]['short'] or tlines[l]['name'] for l in s.get('lineIds', []) if l in tlines],
                         'lineIds': s.get('lineIds', [])})
    stations.sort(key=lambda s: s['id'])
    for i, s in enumerate(stations):
        s['i'] = i
    grid_op = Grid([s for s in stations if s['status'] == 'operating'])
    grid_cx = Grid([s for s in stations if s['status'] == 'construction'])

    # ---------- agencies (01) ----------
    ag = tabs['01_AGENCIES']
    AG = {h: i for i, h in enumerate(ag[0])}
    agency_parent = {}
    for r in ag[1:]:
        name = th_norm(r[AG['ชื่อหน่วยงาน / เครือข่าย']])
        if name:
            agency_parent[name] = (r[AG['ต้นสังกัดตามแหล่ง']].strip(), r[AG['ประเภทองค์กร']].strip())

    # ---------- rows ----------
    type_values = collections.defaultdict(list)
    recs = []
    keys = set()
    for r in rows_in:
        uuid = r[H['production_row_id']].strip()
        key = uuid.replace('-', '')[:KEY_LEN]
        if not re.fullmatch(r'[0-9a-f]{%d}' % KEY_LEN, key) or key in keys:
            sys.exit(f'05: bad or repeated key {key} ({uuid})')
        keys.add(key)
        cat, sub = r[H['category_id']].strip(), r[H['gov_sub_office_id']].strip()
        if cat not in CAT_INDEX:
            sys.exit(f'05: category {cat!r} has no rule')
        if sub not in TYPE_INDEX:
            sys.exit(f'05: gov_sub_office_id {sub!r} has no rule')
        sd = r[H['overlay_subdistrict_ids']].strip()
        if sd not in sub_to_district:
            sys.exit(f'05: overlay subdistrict {sd} of {key} is not in production base info')
        dcode, pcode, pdopa = sub_to_district[sd]
        if pdopa != r[H['overlay_province_codes']].strip():
            sys.exit(f'05: {key} overlay province {r[H["overlay_province_codes"]]} ≠ its subdistrict province {pdopa}')
        if dcode not in index_ids or index_prov[dcode] != pcode:
            sys.exit(f'05: district {dcode} of {key} is not in the area index')
        lat, lon = float(r[H['lat']]), float(r[H['lon']])
        if not (5 <= lat <= 21 and 97 <= lon <= 106):
            sys.exit(f'05: {key} point outside Thailand')
        off = r[H['officer']].strip()
        raw = int(off) if re.fullmatch(r'\d+', off) else 0
        if off and not re.fullmatch(r'\d+', off):
            sys.exit(f'05: officer {off!r} of {key} is not a whole number')
        group = CATS[CAT_INDEX[cat]][2]
        recs.append({'uuid': uuid, 'key': key, 'name': r[H['name']], 'cat': cat, 'type': sub, 'group': group,
                     'agency': r[H['gov_name']].strip(), 'raw': raw, 'lat': round(lat, 6), 'lon': round(lon, 6),
                     'district': dcode, 'province': pcode})
        if GROUPS[GROUP_INDEX[group]][3]:
            type_values[sub].append(raw)
        # a type belongs to exactly one category
    type_cat = {}
    for rec in recs:
        if type_cat.setdefault(rec['type'], rec['cat']) != rec['cat']:
            sys.exit(f"type {rec['type']} appears in categories {type_cat[rec['type']]} and {rec['cat']}")

    # ---------- reconciliation with production government-agency info lv0 ----------
    ga = json.load(open(os.path.join(a.api, 'ga-info-lv0.json'), encoding='utf-8'))['value']['value']
    ga_receipt = json.load(open(os.path.join(a.api, 'ga-info-lv0.meta.json'), encoding='utf-8'))
    mine = collections.defaultdict(lambda: [0, 0])
    for rec in recs:
        k = (rec['district'], rec['cat'] or '__NULL__')
        mine[k][0] += 1
        mine[k][1] += rec['raw']
    theirs = {}
    for duuid, d in ga['districtDatas'].items():
        code = district_uuid.get(duuid)
        if not code:
            sys.exit(f'production district {duuid} is not in base info')
        for cid, st in (d.get('categoryStats') or {}).items():
            if st.get('count') or st.get('population'):
                theirs[(code, cid)] = [int(st['count']), int(round(float(st['population'])))]
    mismatch = sorted(k for k in set(mine) | set(theirs) if tuple(mine.get(k, [0, 0])) != tuple(theirs.get(k, [0, 0])))
    country = ga['countryDatas']['00000000-0000-0000-0000-000000000000']
    if mismatch:
        for k in mismatch[:10]:
            print('mismatch', k, mine.get(k), theirs.get(k), file=sys.stderr)
        sys.exit(f'reconciliation: {len(mismatch)} district × category cells differ from production')
    if country['statistics']['totalGovernmentAgencies'] != len(recs):
        sys.exit('reconciliation: country total differs')

    # ---------- personnel per type ----------
    type_rule = {}
    groups_of_type = {}
    for rec in recs:
        groups_of_type.setdefault(rec['type'], rec['group'])
    for code, *_ in TYPES:
        g = groups_of_type.get(code)
        if g is None:
            type_rule[code] = 'none'
        elif not GROUPS[GROUP_INDEX[g]][3]:
            type_rule[code] = 'other'
        elif g == 'unclassified':
            type_rule[code] = 'agency'
        else:
            type_rule[code] = staff_rule(type_values[code])
    # ---------- repeated points of one office (build time, never at runtime) ----------
    # Points of the same type and the same name (spaces and zero-width characters ignored) in the same province,
    # chained within REPEAT_M of each other, are one office. Every one of them stays a row (production counts them
    # all); the office's personnel is counted once (below). Different places that share a generic name stay apart
    # (distance).
    by_name = collections.defaultdict(list)
    for i, rec in enumerate(recs):
        by_name[(rec['type'], th_norm(rec['name']), rec['province'])].append(i)
    rep_of = list(range(len(recs)))
    for idx in by_name.values():
        if len(idx) < 2:
            continue
        parent = {i: i for i in idx}

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for x in range(len(idx)):
            for y in range(x + 1, len(idx)):
                ra, rb = recs[idx[x]], recs[idx[y]]
                if abs(ra['lat'] - rb['lat']) > 0.002 or abs(ra['lon'] - rb['lon']) > 0.002:
                    continue
                if haversine(ra['lat'], ra['lon'], rb['lat'], rb['lon']) <= REPEAT_M:
                    parent[find(idx[x])] = find(idx[y])
        comps = collections.defaultdict(list)
        for i in idx:
            comps[find(i)].append(i)
        for members in comps.values():
            if len(members) < 2:
                continue
            members.sort(key=lambda i: recs[i]['uuid'])
            for i in members:
                rep_of[i] = members[0]
    repeat_points = collections.Counter(rec['group'] for i, rec in enumerate(recs) if rep_of[i] != i)
    points_total = len(recs)
    by_uuid = {rec['uuid']: rec for rec in recs}

    for rec in recs:
        rule = type_rule[rec['type']]
        rec['staff'] = rec['raw'] if rule == 'site' and rec['raw'] > 0 else None
        rec['agencyStaff'] = rec['raw'] if rule == 'agency' and rec['raw'] > 0 else None
        p = agency_parent.get(th_norm(rec['agency'])) or (agency_parent.get(th_norm(rec['name'])) if rec['group'] == 'unclassified' else None)
        rec['ministry'] = p[0] if p and p[0] and th_norm(p[0]) != th_norm(rec['agency']) else ''

    # Personnel once per office: the repeated points of one office record its personnel once — at the point with the
    # smallest UUID that records any (its own value); the other points of the office name that point (staffShared).
    office_points = collections.defaultdict(list)
    for i, rec in enumerate(recs):
        office_points[rep_of[i]].append(rec)
    for members in office_points.values():
        members.sort(key=lambda r: r['uuid'])
    repeat_shared_rows = repeat_shared_staff = 0
    for members in office_points.values():
        if len(members) < 2:
            continue
        counted = next((r for r in members if r['staff']), None)   # members are in UUID order
        if not counted:
            continue
        for r in members:
            if r is counted:
                continue
            if r['staff']:
                repeat_shared_staff += r['staff']
            repeat_shared_rows += 1
            r['staffShared'] = counted['key']
            r['staff'] = None

    # Personnel once per organisation: a local government's personnel is the organisation's (gov_name), repeated on
    # every office of that organisation in the province; it is counted at the office with the smallest key, and the
    # others point to it (staffShared).
    org = collections.defaultdict(list)
    for rec in recs:
        if rec['type'] in ORG_STAFF_TYPES and rec['staff']:
            org[(rec['type'], th_norm(rec['agency']), rec['province'], rec['staff'])].append(rec)
    org_shared_rows = org_shared_staff = 0
    for members in org.values():
        if len(members) < 2:
            continue
        members.sort(key=lambda r: r['key'])
        for r in members[1:]:
            org_shared_rows += 1
            org_shared_staff += r['staff']
            r['staffShared'] = members[0]['key']
            r['staff'] = None
    # One hop: a point that names a point whose personnel moved on to its organisation's office names that office.
    by_key_all = {rec['key']: rec for rec in recs}
    for rec in recs:
        k, hops = rec.get('staffShared'), 0
        while k and by_key_all[k].get('staffShared'):
            k, hops = by_key_all[k]['staffShared'], hops + 1
            if hops > 4:
                sys.exit(f"staffShared chain does not end at {rec['key']}")
        if k:
            rec['staffShared'] = k
            if not by_key_all[k]['staff']:
                sys.exit(f"staffShared of {rec['key']} names {k}, which records no personnel")
    shared_rows = sum(1 for rec in recs if rec.get('staffShared'))

    # ---------- rail ----------
    for rec in recs:
        st, d = grid_op.nearest(rec['lat'], rec['lon'], RAIL_MAX_M)
        rec['rail'] = (st['i'], int(round(d))) if st else None
        st, d = grid_cx.nearest(rec['lat'], rec['lon'], RAIL_MAX_M)
        rec['rail2'] = (st['i'], int(round(d))) if st else None

    # ---------- recent events (06, with the hyperlinks of its link cells) ----------
    ev_rows = tabs['06_RECENT_PROD_GAPS']
    EV = {h: i for i, h in enumerate(ev_rows[0])}
    links_raw = json.load(open(os.path.join(a.tabs, '06_RECENT_PROD_GAPS.links.json'), encoding='utf-8'))
    raw06 = json.load(open(os.path.join(a.tabs, '06_RECENT_PROD_GAPS.json'), encoding='utf-8'))['rows']
    if len(links_raw) != len(raw06):
        sys.exit('06: hyperlinks do not align with the tab rows')
    link_of = {}
    for cells, links in zip(raw06, links_raw):
        if any(c != '' for c in cells):
            link_of[tuple(cells)] = links
    ev03 = {r[11]: r for r in tabs['03_RECENT_EVENTS'][1:]}
    urls, url_index = [], {}

    def url_id(u):
        u = public_url(u)
        if not u:
            return -1
        if u not in url_index:
            url_index[u] = len(urls)
            urls.append(u)
        return url_index[u]

    events = []
    for r in ev_rows[1:]:
        links = link_of.get(tuple(r)) or [None] * len(r)
        col = lambda name: r[EV[name]].strip()
        lnk = lambda name: [x for x in (links[EV[name]] or []) if x]
        kind = col('เหตุการณ์')
        if kind not in EVENT_KINDS:
            sys.exit(f'06: event kind {kind!r} has no rule')
        prov = prov_by_th.get(th_norm(col('จังหวัด')))
        if not prov:
            sys.exit(f"06: province {col('จังหวัด')!r} is not a production province")
        dname = th_norm(re.sub(r'^(อำเภอ|เขต|อ\.)\s*', '', col('อำเภอ / เขต')))
        dcode = district_by_name.get((prov, dname)) or ''
        uuid = col('UUID แถวเดิมใน prod')
        rec = by_uuid.get(uuid) if uuid else None
        if uuid and not rec:
            sys.exit(f'06: production row {uuid} is not in 05')
        lat, lon = col('ละติจูด'), col('ลองจิจูด')
        point = [round(float(lon), 6), round(float(lat), 6)] if lat and lon else None
        ref = col('รหัสอ้างอิงแท็บ 03')
        host = ev03[ref][5].strip() if ref and ref in ev03 else ''
        ev = {'id': col('รหัสเหตุการณ์'), 'name': col('ชื่อสำนักงาน / จุดบริการ'), 'kind': EVENT_KINDS.index(kind),
              'date': iso(col('วันที่ (ค.ศ.)')), 'dateMeaning': col('ความหมายของวันที่'), 'province': prov, 'district': dcode,
              'districtTh': col('อำเภอ / เขต'), 'place': col('ที่ตั้งใหม่'), 'oldPlace': col('ที่ตั้งเดิม'), 'agency': col('หน่วยงานต้นสังกัด'),
              'host': host, 'matched': col('ผลเทียบ production'), 'row': rec['key'] if rec else '',
              'evidence': [i for i in (url_id(u) for u in lnk('หลักฐานเหตุการณ์') + lnk('หลักฐานประกอบ') + lnk('แหล่งเพิ่มเติม')) if i >= 0],
              'point': point, 'pointMeaning': col('ความหมายของหมุด')}
        if not ev['date']:
            sys.exit(f"06: event {ev['id']} has no readable date")
        if not ev['evidence']:
            problems.append(f"06: event {ev['id']} has no public evidence link")
        events.append(ev)
    events.sort(key=lambda e: (e['date'], e['id']), reverse=True)
    by_key = {rec['key']: rec for rec in recs}
    for i, e in enumerate(events):
        if e['row']:
            by_key[e['row']].setdefault('events', []).append(i)

    # ---------- encode ----------
    provinces = [p['id'] for p in index['provinces']]
    pidx = {c: i for i, c in enumerate(provinces)}
    districts = list(index['areas']['id'])
    didx = {c: i for i, c in enumerate(districts)}
    type_rows = collections.Counter(rec['type'] for rec in recs)
    prefixes = {}
    for code, *_ in TYPES:
        g = groups_of_type.get(code)
        if g and not GROUPS[GROUP_INDEX[g]][3]:
            prefixes[code] = common_prefix([rec['name'] for rec in recs if rec['type'] == code])

    def encode(group_ids):
        """Columnar rows of some groups: dense columns for what every row has, sparse maps for the rest."""
        part = [rec for rec in recs if rec['group'] in group_ids]
        part.sort(key=lambda rec: (rec['district'], TYPE_INDEX[rec['type']], rec['key']))
        agencies, aidx, agency_ministry = [], {}, []
        ministries, midx = [], {}

        def intern(lst, idx, v):
            if v not in idx:
                idx[v] = len(lst)
                lst.append(v)
            return idx[v]
        cols = {k: [] for k in ('key', 'name', 'type', 'agency', 'staff', 'lat', 'lon', 'district')}
        agency_staff, ev_map, rail, rail2, row_ministry, shared = {}, {}, {}, {}, {}, {}
        for i, rec in enumerate(part):
            pre = prefixes.get(rec['type'], '')
            name = rec['name']
            cols['key'].append(rec['key'])
            cols['name'].append('\u0001' + name[len(pre):] if pre and name.startswith(pre) and len(name) > len(pre) else name)
            cols['type'].append(TYPE_INDEX[rec['type']])
            new_agency = rec['agency'] not in aidx
            ai = intern(agencies, aidx, rec['agency'])
            if new_agency:
                p = agency_parent.get(th_norm(rec['agency']))
                agency_ministry.append(intern(ministries, midx, p[0]) if p and p[0] and th_norm(p[0]) != th_norm(rec['agency']) else -1)
            if rec['ministry'] and (agency_ministry[ai] < 0 or ministries[agency_ministry[ai]] != rec['ministry']):
                row_ministry[str(i)] = intern(ministries, midx, rec['ministry'])
            cols['agency'].append(ai)
            cols['staff'].append(rec['staff'] if rec['staff'] else -1)
            cols['lat'].append(rec['lat'])
            cols['lon'].append(rec['lon'])
            cols['district'].append(didx[rec['district']])
            if rec['rail']:
                rail[str(i)] = list(rec['rail'])
            if rec['rail2']:
                rail2[str(i)] = list(rec['rail2'])
            if rec['agencyStaff']:
                agency_staff[str(i)] = rec['agencyStaff']
            if rec.get('staffShared'):
                shared[str(i)] = rec['staffShared']
            if rec.get('events'):
                ev_map[str(i)] = rec['events']
        if all(v == -1 for v in cols['staff']):
            cols['staff'] = {'const': -1}
        doc = {'agencies': agencies, 'agencyMinistry': agency_ministry, 'ministries': ministries, 'cols': cols,
               'rowMinistry': row_ministry, 'rail': rail, 'rail2': rail2, 'agencyStaff': agency_staff, 'rowEvents': ev_map,
               'staffShared': shared}
        # round trip of the names and the ministries
        for i, rec in enumerate(part):
            n = cols['name'][i]
            back = prefixes.get(rec['type'], '') + n[1:] if n.startswith('\u0001') else n
            if back != rec['name']:
                sys.exit(f"name encoding failed for {rec['key']}")
            m = row_ministry.get(str(i), agency_ministry[cols['agency'][i]])
            if (ministries[m] if m >= 0 else '') != rec['ministry']:
                sys.exit(f"ministry encoding failed for {rec['key']}")
        return part, doc

    os.makedirs(os.path.join(a.out, 'data', 'groups'), exist_ok=True)
    office_ids = [g[0] for g in GROUPS if g[3]]
    files = {}
    group_docs = {}
    for g in GROUPS:
        if g[3]:
            continue
        part, doc = encode([g[0]])
        doc = {'meta': {'group': g[0], 'rows': len(part), 'keysSha256': hashlib.sha256('\n'.join(r['key'] for r in part).encode()).hexdigest()}, **doc}
        raw = canon(doc)
        path = os.path.join(a.out, 'data', 'groups', f'{g[0]}.json')
        open(path, 'wb').write(raw)
        files[g[0]] = {'file': f'data/groups/{g[0]}.json', 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'rows': len(part)}
        group_docs[g[0]] = part

    office_part, office_doc = encode(office_ids)

    # ---------- dictionaries and provenance ----------
    def gstats(part):
        st = [r['staff'] for r in part if r['staff']]
        return {'rows': len(part), 'staffRows': len(st), 'staff': sum(st),
                'staffShared': sum(1 for r in part if r.get('staffShared')), 'agencyStaffRows': sum(1 for r in part if r['agencyStaff'])}
    by_group = collections.defaultdict(list)
    for rec in recs:
        by_group[rec['group']].append(rec)
    groups_out = []
    for g in GROUPS:
        s = gstats(by_group[g[0]])
        groups_out.append({'id': g[0], 'th': g[1], 'en': g[2], 'office': g[3], 'file': files.get(g[0], {}).get('file', ''),
                           'bytes': files.get(g[0], {}).get('bytes', 0), 'sha256': files.get(g[0], {}).get('sha256', ''), **s})
    cats_out = [{'id': c[0], 'th': c[1], 'group': GROUP_INDEX[c[2]], 'rows': sum(1 for r in recs if r['cat'] == c[0])} for c in CATS]
    types_out = []
    for code, th, short, tier in TYPES:
        g = groups_of_type.get(code)
        types_out.append({'id': code, 'th': th, 'short': short, 'tier': tier, 'cat': CAT_INDEX[type_cat.get(code, '')] if code in type_cat else -1,
                          'group': GROUP_INDEX[g] if g else -1, 'rows': type_rows.get(code, 0), 'staff': type_rule[code],
                          'prefix': prefixes.get(code, '')})
    stations_out = [{'id': s['id'], 'name': s['name'], 'nameEn': s['nameEn'], 'lat': s['lat'], 'lon': s['lon'], 'status': s['status'], 'lines': s['lines']} for s in stations]

    staff_types = {t['id']: t['staff'] for t in types_out}
    if len(recs) != points_total:
        sys.exit('every production point must be a row')
    counts = {
        'points': points_total, 'rows': len(recs), 'officeRows': len(office_part),
        'repeatPoints': sum(repeat_points.values()), 'repeatPointsByGroup': dict(repeat_points),
        'staffSharedRows': shared_rows, 'staffSharedRepeatRows': repeat_shared_rows, 'staffSharedRepeatPersonnel': repeat_shared_staff,
        'staffSharedOrgRows': org_shared_rows, 'staffSharedOrgPersonnel': org_shared_staff,
        'groups': {g['id']: g['rows'] for g in groups_out},
        'staffRows': sum(1 for r in recs if r['staff']), 'staff': sum(r['staff'] for r in recs if r['staff']),
        'agencyStaffRows': sum(1 for r in recs if r['agencyStaff']),
        'rawOfficer': sum(r['raw'] for r in recs), 'districts': len({r['district'] for r in recs}),
        'provinces': len({r['province'] for r in recs}), 'events': len(events), 'eventsMatched': sum(1 for e in events if e['row']),
        'eventsWithPoint': sum(1 for e in events if e['point']), 'ministryRows': sum(1 for r in recs if r['ministry']),
        'railWithin2km': sum(1 for r in recs if r['rail']),
    }
    sources_04 = [{'id': r[0], 'th': r[2], 'unit': r[3], 'period': r[5], 'url': public_url(r[7])} for r in tabs['04_SOURCES'][1:] if r[0]]
    meta = {
        'dataset': 'CityMETER Government Office', 'datasetTh': 'หน่วยงานรัฐ', 'registryId': 'research.TH.government_office',
        'registryRole': 'research sheet of the production dataset governmentOfficer (government_agency)',
        'productDataset': 'governmentOfficer', 'productionApi': 'government-agency',
        'sheetTitle': SHEET_TITLE, 'sheetStatus': 'รายชื่อรอยืนยัน (names pending confirmation)', 'sheetModified': a.sheet_modified,
        'readOn': a.read_on, 'readMethod': "the sheet's own HTML view, cell by cell, in the owner's signed-in browser (scripts/export-sheet-tabs.js)",
        'tabs': tab_shas, 'checkedOn': '2026-11-06', 'builtOn': datetime.date.today().isoformat(),
        'rows': len(recs), 'points': points_total, 'counts': counts,
        'unit': {'row': 'one point of the production Government Officer dataset (every production point is a row, as production counts them)',
                 'count': 'แห่ง — points of the selection', 'staff': 'คน — personnel production records at the office (types with a site count only)'},
        'staffRules': {'constant': '≥ 90% of the type\'s positive values are one value: a default, not a count',
                       'scale': 'the type\'s 90th percentile is below 10: not a staff count for that kind of office',
                       'none': 'no positive value', 'agency': "head offices of agencies: the agency's whole workforce, kept apart",
                       'other': "places that are not offices: production's value means students, 1 per point or 0",
                       'site': 'personnel recorded at the office', 'types': staff_types},
        'reconciliation': {'target': ga_receipt['url'], 'receipt': {k: ga_receipt[k] for k in ('url', 'status', 'bytes', 'sha256', 'retrievedAt')},
                           'cells': len(theirs), 'mismatches': 0, 'countryRows': country['statistics']['totalGovernmentAgencies'],
                           'countryPersonnel': country['modeValues']['population'], 'rule': 'rows and Σ officer per production district × category equal government-agency info lv0'},
        'adminMethods': {'overlay': "the district of the point's production overlay subdistrict"},
        'repeats': {'rule': 'same type and same name (spaces and zero-width characters ignored), same province, chained within %d m: points of one office — every point stays a row; the office\'s personnel is counted once, at the point with the smallest UUID that records it' % REPEAT_M,
                    'points': points_total, 'rows': len(recs), 'repeatPoints': sum(repeat_points.values()),
                    'staffSharedRows': repeat_shared_rows, 'staffSharedPersonnel': repeat_shared_staff},
        'staffOnce': {'types': sorted(ORG_STAFF_TYPES), 'rule': "local government personnel is the organisation's (gov_name): counted once per organisation and province, at its office with the smallest key",
                      'rows': org_shared_rows, 'personnel': org_shared_staff},
        'gazetteer': {'source': 'CityMETER production base info', 'receipts': len(receipts), 'receiptsSha256': receipts_sha},
        'context': {
            'rail': {'source': 'CityMETER · Transit (montri-th/transit)', 'commit': repo_commit(a.transit), 'file': 'data/transit.json',
                     'sha256': sha256_file(transit_path), 'release': (transit.get('meta') or {}).get('release', ''), 'asOf': (transit.get('meta') or {}).get('asOf', ''),
                     'rule': 'operating = on the operator roster of CityMETER · Transit; construction = a project station, not a service; straight-line distance from the production point to the station reference point, up to %d m' % RAIL_MAX_M},
            'events': {'tab': '06_RECENT_PROD_GAPS', 'rows': len(events), 'rule': 'dated moves, new office buildings and service points 2024–2026 that production does not hold at their new place; linked to the production row the sheet names'},
            'ministry': {'tab': '01_AGENCIES', 'rows': len(agency_parent), 'rule': "exact name of the row's agency (gov_name; for points without a category also the point's own name) = an agency of OPDC/DGA"},
        },
        'sources04': sources_04,
        'excludedFields': EXCLUDED, 'problems': problems,
    }
    out = {'meta': meta, 'groups': groups_out, 'cats': cats_out, 'types': types_out, 'stations': stations_out,
           'urls': urls, 'provinces': provinces, 'districts': districts, 'sources': [{'id': s[0], 'th': s[1], 'url': s[2]} for s in SOURCES],
           'eventKinds': EVENT_KINDS, 'events': events, **office_doc}
    raw = canon(out)
    open(os.path.join(a.out, 'data', 'offices.json'), 'wb').write(raw)
    report = {'builtOn': meta['builtOn'], 'rows': len(recs), 'counts': counts, 'files': {'data/offices.json': {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'rows': len(office_part)},
              **{v['file']: {k: v[k] for k in ('bytes', 'sha256', 'rows')} for v in files.values()}},
              'reconciliation': meta['reconciliation'], 'problems': problems, 'staffRules': staff_types}
    with open(os.path.join(a.out, 'data', 'build-report.json'), 'w', encoding='utf-8') as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(json.dumps(counts, ensure_ascii=False))
    print('offices.json', len(raw), 'bytes;', {k: v['bytes'] for k, v in files.items()})
    print('staff rules', {k: v for k, v in staff_types.items() if groups_of_type.get(k) in office_ids})
    if problems:
        print('problems', problems[:5], file=sys.stderr)


if __name__ == '__main__':
    main()
