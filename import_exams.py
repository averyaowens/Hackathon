"""Import AP/IB/CLEP equivalencies into catalog.json.
Usage: python3 import_exams.py TCU_Credit_by_Exam.xlsx
"""
import json, re, openpyxl
wb = openpyxl.load_workbook(__import__('sys').argv[1])
D = json.load(open('catalog.json'))
rows = []
def codes(s):
    out = []
    for part in str(s).split(';'):
        m = re.match(r'\s*([A-Z]{3,4}) (\d{5})(?:\s+(.*?))?(?:\s*\(x(\d)\))?\s*$', part.strip())
        if m:
            n = int(m.group(4) or 1)
            for _ in range(n): out.append({'code': f'{m.group(1)} {m.group(2)}', 'title': (m.group(3) or '').replace('(x2)','').strip()})
    return out
for name, typ in (('AP','AP'), ('CLEP','CLEP'), ('IB','IB')):
    ws = wb[name]
    for r in list(ws.iter_rows(values_only=True))[3:]:
        if not r[0] or not r[2] or str(r[0]).startswith(('Total','Number')) or str(r[2]).startswith('TCU Equivalent'): continue
        sc = str(r[1])
        if typ == 'CLEP': scores = {'min': int(sc)}
        else:
            nums = [int(x) for x in re.findall(r'\d', sc)]
            lvl = 'HL' if 'HL' in sc else 'SL' if 'SL' in sc else None
            scores = {'any': nums, **({'level': lvl} if lvl else {})}
        core = r[4] if typ != 'CLEP' else None
        if typ == 'IB': core = r[4]
        note = r[5] if typ == 'IB' and len(r) > 5 else (r[4] if typ == 'CLEP' else None)
        rows.append({'type': typ, 'exam': str(r[0]).strip(), 'scoreText': sc, **scores, 'courses': codes(r[2]), 'hrs': r[3], 'core': (str(core) if core else ''), 'note': note})
pol = [ (r[0], r[1]) for r in list(wb['Policies & Other'].iter_rows(values_only=True))[3:] if r[0] ]
D['exams'] = {'rows': rows, 'policies': [{'topic': a, 'text': b} for a, b in pol]}
D['sources']['S13'] = {'title': 'TCU Credit by Exam (AP, IB, CLEP equivalencies)', 'owner': 'TCU Office of Admission', 'url': 'https://admissions.tcu.edu/apply/first-year/college-credits/credit-by-exam.php', 'accessed': '2026-10-17', 'governs': 'Which TCU course and how many hours each exam score earns; 66-hour limit; no letter grade; no duplicate credit', 'kind': 'official'}
json.dump(D, open('catalog.json', 'w'), indent=1)
print(len(rows), 'exam rows;', sum(1 for r in rows if r['type']=='AP'), 'AP')
