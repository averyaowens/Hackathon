"""Import the Neeley programs workbook into catalog.json (majors, minors, certificates and their courses).
Usage: python3 import_programs.py TCU_Neeley_Programs.xlsx   (run import_courselist.py first)
"""
"""Parse the Neeley programs workbook into programs.json and add any new courses to data.json."""
import json, re, openpyxl

import sys
WB = sys.argv[1]
wb = openpyxl.load_workbook(WB)
LIST = json.load(open('courselist.json'))
D = json.load(open('catalog.json'))
CODE = re.compile(r'^[A-Z]{3,4} \d{5}$')

# ---------- index ----------
index = {}
for r in wb['Index'].iter_rows(values_only=True):
    if r[0] in ('Major', 'Minor', 'Certificate', 'Accounting pathway', 'Graduate', 'Common'):
        index[r[2]] = {'category': r[0], 'name': r[1], 'who': r[5]}

ID = {'ACCT Major': 'ACCT', 'BIS Major': 'BIS', 'ENTR Major': 'ENTR', 'FINA Major': 'FINA', 'FINA-Real Estate Major': 'FIRE',
      'MANA Major': 'MANA', 'MARK Major': 'MARK', 'SVCM Major': 'SVCM'}

def norm_code(c):
    c = (c or '').strip()
    if ' / ' in c:
        parts = [p.strip() for p in c.split('/')]
        if all(CODE.match(p) for p in parts):
            return '|'.join(parts)
    return c if CODE.match(c) else None

def terms_from(*texts):
    t = ' '.join(x or '' for x in texts).lower()
    if 'fall only' in t: return 'F', 'verified'
    if 'spring only' in t: return 'S', 'verified'
    return 'FS', 'assumed'

programs = {}
for tab, meta in index.items():
    if tab in ('PPA', 'MAc'):
        ws = wb[tab]
        lines = [r[0] for r in ws.iter_rows(values_only=True) if r[0] and isinstance(r[0], str)][1:6]
        programs[tab] = {'id': tab, 'tab': tab, 'name': meta['name'], 'category': meta['category'], 'who': meta['who'], 'notes': lines, 'sections': [], 'reference': True}
        continue
    ws = wb[tab]
    rows = list(ws.iter_rows(values_only=True))
    notes = []
    stated = {}
    i = 0
    while i < len(rows) and not (rows[i][0] == 'Section' and rows[i][3] == 'Counted Hours'):
        if i >= 2 and rows[i][0] and isinstance(rows[i][0], str): notes.append(rows[i][0])
        i += 1
    i += 1
    while i < len(rows) and not (rows[i][0] == 'Section' and rows[i][1] == 'Course Code'):
        r = rows[i]
        if r[0] and r[4] is not None and not str(r[0]).startswith('TOTAL'): stated[r[0]] = r[4]
        i += 1
    i += 1
    sections = []; cur = None; choose = None
    for r in rows[i:]:
        sec, code, title, hrs, typ, note, attr = (list(r) + [None]*7)[:7]
        if not sec: continue
        if isinstance(sec, str) and sec.startswith('Legend'): break
        if cur is None or cur['name'] != sec:
            cur = {'name': sec, 'note': None, 'stated': stated.get(sec), 'items': []}; sections.append(cur); choose = None
        if not code and title:
            cur['note'] = title; continue
        nc = norm_code(code)
        if typ == 'Required':
            cur['items'].append({'type': 'req', 'code': nc, 'label': code if not nc else None, 'title': title, 'hrs': hrs, 'note': note, 'attr': attr}); choose = None
        elif typ == 'Choose':
            choose = {'type': 'choose', 'label': title, 'name': code, 'hrs': hrs, 'note': note, 'options': []}; cur['items'].append(choose)
        elif typ == 'Option' and choose is not None:
            choose['options'].append({'code': nc, 'title': title, 'hrs': hrs, 'note': note, 'attr': attr})
        elif typ == 'Recommended':
            cur['items'].append({'type': 'rec', 'code': nc, 'title': title, 'hrs': hrs, 'note': note, 'attr': attr})
    pid = ID.get(tab, tab)
    programs[pid] = {'id': pid, 'tab': tab, 'name': meta['name'], 'category': meta['category'], 'who': meta['who'], 'notes': notes, 'sections': sections}

# ---------- prerequisite extraction from course descriptions ----------
GR = {'C-': 'C-', 'C': 'C', 'C+': 'C+', 'B': 'B'}
def extract(desc):
    m = re.search(r'Prerequisites?\s*:?\s*(.*?)(?:\.\s+[A-Z]|$)', desc)
    if not m: return [], [], None
    s = m.group(1)
    s = re.split(r'(?i)may not receive credit|cannot both|not for credit|no credit for both|students may not|this course and', s)[0]
    grade = 'C-' if re.search(r"C-|C minus", s) else ('C' if re.search(r"grade of (?:at least )?['\"]?C['\"]?(?!-)\b|\bC or (?:better|higher)|'C'", s) else 'D-')
    tok = re.compile(r'(?P<orhigh>or (?:higher|better|above))|(?P<cin>concurrent enrollment in)|(?P<cafter>or concurrent(?: enrollment)?)|(?P<code>(?:[A-Z]{3,4}\s?)?\d{5})|(?P<orw>\bor\b)|(?P<sep>\band\b|,|;|&)')
    pre, conc, last_subj, pending_or, conc_next = [], [], None, False, False
    for mt in tok.finditer(s):
        k = mt.lastgroup; v = mt.group(0)
        if k == 'code':
            mm = re.match(r'([A-Z]{3,4})?\s?(\d{5})', v); subj = mm.group(1) or last_subj
            if not subj: continue
            last_subj = subj; code = f'{subj} {mm.group(2)}'
            if conc_next: conc.append(code); conc_next = False
            elif pending_or and pre: pre[-1][0] += '|' + code
            else: pre.append([code, grade])
            pending_or = False
        elif k == 'cin': conc_next = True; pending_or = False
        elif k == 'cafter':
            if not re.match(r'\s*in\b', s[mt.end():]) and pre: conc.append(pre.pop()[0].split('|')[-1])
            elif re.match(r'\s*in\b', s[mt.end():]): conc_next = True
            pending_or = False
        elif k == 'orhigh': pass
        elif k == 'orw': pending_or = True
        else: pending_or = False
    pre = [p for p in pre if not any(c in p[0].split('|') for c in conc)]
    cond = s if re.search(r'major|standing|admi|approval|permission|consent|apply|certif', s, re.I) else None
    return pre, conc, cond

added = []
def ensure(code, title, hrs, note, attr, src='S12'):
    if not code: return
    for c in code.split('|'):
        terms, ts = terms_from(note, attr)
        if c in D['courses']:
            cc = D['courses'][c]
            if ts == 'verified' and cc.get('ts') != 'verified': cc['terms'], cc['ts'] = terms, ts
            continue
        hrs_ = hrs if isinstance(hrs, (int, float)) else (int(c[-1]) if c[-1] in '123456' else 3)
        info = {'t': (title or c).split(' (')[0] if '|' not in code else title, 'cr': hrs_, 'terms': terms, 'ts': ts, 'src': src}
        desc = LIST.get(c)
        if desc:
            pre, conc, cond = extract(desc)
            if pre: info['pre'] = pre
            if conc: info['conc'] = conc
            if cond: info['cond'] = cond[:240]
            info['preSrc'] = 'S10'; info['preAuto'] = True
        else:
            info['notInList'] = True
        if attr and re.search(r'\bCA\b', str(attr)): info['core'] = 'CA'
        if attr and re.search(r'\bGA\b', str(attr)) and 'CA or GA' not in str(attr): info['core'] = 'GA'
        if 'pre' in info: info['pre'] = [p for p in info['pre'] if c not in p[0].split('|')] or info.pop('pre') and None
        if info.get('pre') is None: info.pop('pre', None)
        D['courses'][c] = info; added.append(c)

for p in programs.values():
    for s in p['sections']:
        for it in s['items']:
            if it['type'] in ('req', 'rec'): ensure(it.get('code'), it['title'], it['hrs'], it['note'], it['attr'])
            if it['type'] == 'choose':
                for o in it['options']: ensure(o['code'], o['title'], o['hrs'], o['note'], o['attr'])

# auto-extracted prereqs may name courses not loaded; add them too (one level), so chains resolve
for c in list(D['courses']):
    for pp, g in D['courses'][c].get('pre', []):
        for p in pp.split('|'):
            if p not in D['courses'] and p in LIST:
                pre, conc, cond = extract(LIST[p])
                D['courses'][p] = {'t': p + ' (title not in loaded sources)', 'cr': int(p[-1]) if p[-1] in '123456' else 3, 'terms': 'FS', 'ts': 'assumed', 'src': 'S10', 'pre': pre, 'preSrc': 'S10', 'preAuto': True, **({'cond': cond[:240]} if cond else {})}
                added.append(p)

# Strategy appears as MANA 30350 on some checklists and MANA 40250 on others; treat them as one course for prerequisites
C = D['courses']
C['MANA 40250'].update({'t': 'Strategy', 'cr': 1.5, 'coreq': ['MANA 30250'], 'cond': 'Sophomore standing and a business major.'}); C['MANA 40250'].pop('pre', None)
C['MANA 30350']['note'] = 'The TCU course list has no MANA 30350; it lists Strategy as MANA 40250.'
C['MANA 30250']['coreq'] = ['MANA 30350', 'MANA 40250']
for x in C.values():
    for pr in x.get('pre', []):
        if 'MANA 40250' in pr[0].split('|') and 'MANA 30350' not in pr[0]: pr[0] += '|MANA 30350'
    if 'conc' in x: x['conc'] = [c2 + '|MANA 30350' if c2 == 'MANA 40250' else c2 for c2 in x['conc']]
RX = re.compile(r'honors college only|instructor permission|must apply|admitted to|admission by approval|only available to certificate|COMM major', re.I)
for p in programs.values():
    for sct in p['sections']:
        for it in sct['items']:
            for o in ([it] if it['type'] != 'choose' else it['options']):
                c = (o.get('code') or '').split('|')[0]
                txt = ' '.join(str(x) for x in (o.get('note'), o.get('attr')) if x)
                if c in D['courses'] and RX.search(txt): D['courses'][c]['permit'] = txt[:160]
for c, x in D['courses'].items():
    if x.get('cond') and re.search(r'honors college only|only available to certificate|COMM major', x['cond'], re.I) and 'permit' not in x and not x.get('apply'): x['permit'] = x['cond'][:160]
D['programs'] = programs
D['sources']['S12'] = {'title': 'TCU Neeley Programs workbook (8 majors, 8 minors, 3 certificates, PPA, MAc)', 'owner': 'Team, compiled 2026-10-17 from public TCU and Neeley pages', 'url': '', 'accessed': '2026-10-17',
                       'governs': 'Program structure, required courses, elective lists, eligibility and fall/spring notes for every Neeley program', 'kind': 'official'}
json.dump(D, open('catalog.json', 'w'), indent=1)
print('programs', len(programs), 'courses added', len(added))

