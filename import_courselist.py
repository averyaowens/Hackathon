"""Convert the TCU course list spreadsheet (Subject Code, Catalog Number, Description) into courselist.json.
Usage: python3 import_courselist.py TCU_COURSE_LIST.xlsx
"""
import json, re, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
rows = list(wb.worksheets[0].iter_rows(values_only=True))[1:]
out = {f"{r[0]} {r[1]}": re.sub(r'\s+', ' ', str(r[2] or '')).strip() for r in rows if r[0]}
json.dump(out, open('courselist.json', 'w'), separators=(',', ':'))
print(len(out), 'courses written to courselist.json')
