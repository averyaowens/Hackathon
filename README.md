# Graduation Blueprint

A working prototype for the Neeley AI Forward competition (Advanced Track: *The Graduation Blueprint*). It turns a TCU Neeley student's degree audit or course record into a checked, semester-by-semester plan, explains every recommendation with its source, and sends anything it can't verify to an academic advisor.

**Open it:** `index.html` is the whole app in one file. Double-click it, or host it anywhere that serves static files.

## What it does

- **Start from a real record.** Upload a TCU Academic Advising Report (PDF, read in the browser; name and student ID are discarded), load the sample audit, or pick a demo student.
- **First year, no advising report yet.** Pick your entering term and intended major (or *Undecided*) and get a four-year plan right away. If you're in your first semester now, it assumes a full 15-hour load; list your current courses to be exact. Undecided students get a plan of the business courses every major shares.
- **Find your major (survey).** Eight quick questions rank all eight Neeley majors, explain each match ("Because you picked…"), list careers to explore, and build a plan with one click.
- **Get involved.** Recommends Neeley programs (Neeley Next Step, Neeley Fellows, BNSF, EIF and more), centers and business clubs, based on the student's major, interests and year. First-year programs rise to the top for first-years; selective ones are marked "Apply".
- **Plan.** Builds every remaining semester for any of the 8 Neeley majors, 8 minors and 3 certificates: prerequisites (including C- minimums), fall-only and spring-only courses, corequisites, hour caps, upper-division and TCU-residency minimums, study abroad, and sample section times.
- **Suggestions.** Finds ways to finish sooner, courses to register for first, minors that fit without delay, and warnings (retakes, GPA, AP Statistics).
- **What if.** Switch majors, add a second major, or add a minor/certificate and see what still counts, what stops counting, what's new, and the effect on the finish date.
- **Credit by exam.** AP, IB and CLEP scores mapped to TCU courses using TCU's tables.
- **Before you register.** Independent rule checks and a copyable summary for the student's advisor.
- **Findings, Validation, Cost of a delay.** The Part 1 analysis, a live test suite, and a cost calculator for the pitch.
- **Guided demo** (header button) walks through all four judging scenarios, plus the survey and first-year path.

## Share it with others

Pick one:

| Option | Steps | Notes |
|---|---|---|
| **Claude artifact link** (already live) | Open the artifact in Claude → **Share** → choose who can view | Viewers signed in to Claude also get the Claude features (plain-language intake, plan explanations, course ideas). |
| **GitHub Pages** (free public URL) | Repo **Settings → Pages → Source: Deploy from a branch → `main` / root** | Serves `index.html` at `https://avaannino.github.io/hackathon/`. Rebuild `index.html` before pushing. |
| **Netlify / any web server** | Drag `index.html` onto app.netlify.com/drop, or copy it to any web folder | No server code, database or API keys needed. |
| **Email / USB** | Send `index.html` | Opens offline in any modern browser. PDF upload needs an internet connection (it loads the PDF reader from a CDN); pasting the report text works offline. |

Outside Claude, the Claude-powered buttons hide themselves and everything else works. Nothing a student enters is stored or sent anywhere.

## Update the data without touching the code

All academic data lives in JSON files, separate from the app code:

| File | Contents | How to refresh |
|---|---|---|
| `courselist.json` | 3,888 TCU course descriptions | `python3 import_courselist.py TCU_COURSE_LIST.xlsx` |
| `catalog.json` | Programs, courses, prerequisites, offering terms, policies, sources, exam credit, known issues, clubs and programs (`involvement`), major descriptions (`majorInfo`) and the major survey (`survey`) | `python3 import_programs.py TCU_Neeley_Programs.xlsx` and `python3 import_exams.py TCU_Credit_by_Exam.xlsx`; small fixes can be edited by hand |
| `students.json` | Demo students (all made up) | Edit by hand |
| `sample-audit.txt` | Sample audit in the registrar's format (made up) | Edit by hand |

Then rebuild and test:

```
python3 build.py       # writes index.html
node run-tests.js      # 47 engine checks; must all pass
```

Importers need Python 3 with `openpyxl` (`pip install openpyxl`). Section times in `catalog.json → sections` are samples; replace them with an export from Purple Schedule Builder.

## How it's built

```
engine.js     rules engine: requirements, scheduler, checks, bottlenecks, suggestions, what-if, audit parser,
              survey scoring, club/program recommender (no UI code; also runs in Node)
ui.js         planner interface, first-year start, Get involved tab
views.js      Find your major, Programs, Findings, Validation, Cost of a delay, guided demo
template.html page layout and styles
```

Design rule: **the rules engine decides, Claude explains.** Requirements, prerequisites and scheduling are computed in code from cited sources. Claude (when available) turns plain language into proposed changes and explains plans; every course code it returns is checked against the course list, and nothing changes until the student applies it.

## Known limitations

- Most courses have no published fall/spring pattern; they are labeled "assumed."
- Section times are synthetic.
- Only post–Summer 2025 program requirements are fully loaded; older catalog years are refused for the catalog planner (audit upload still works).
- 105 prerequisite sets were read automatically from course descriptions and are labeled "auto-read."
- TCU Core overlap is approximated.
- Survey weights and club fit are our team's judgment. Club names come from TCU's official list; confirm current status on TCU Engage.
- Not an official degree audit; it never certifies graduation eligibility.

Sources and data issues are listed in the app under **Sources** and **Findings**.
