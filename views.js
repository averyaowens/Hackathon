(function(){
const D = JSON.parse(document.getElementById("catalog-data").textContent);
const STUDENTS = JSON.parse(document.getElementById("student-data").textContent);
const SAMPLE_AUDIT = document.getElementById("sample-audit").textContent;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => "$" + Math.round(n).toLocaleString("en-US");
const srcLink = ids => String(ids||"").split(/,\s*/).filter(Boolean).map(id => {
  const s = D.sources[id]; if(!s) return esc(id);
  return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">[${esc(id)}]</a>` : `<span title="${esc(s.title)}">[${esc(id)}]</span>`;
}).join(" ");

// ---------- view switching ----------
const VIEWS = [["planner","Plan a student"],["survey","Find your major"],["programs","Programs"],["findings","Findings"],["validation","Validation"],["cost","Cost of a delay"]];
let built = {};
function show(v){
  VIEWS.forEach(([k]) => { $("view-"+k).hidden = k !== v; });
  document.querySelectorAll("#viewnav button").forEach(b => b.setAttribute("aria-current", b.dataset.v === v ? "page" : "false"));
  if(!built[v]){ built[v] = true; ({survey:renderSurvey, programs:renderPrograms, findings:renderFindings, validation:renderValidation, cost:renderCost})[v]?.(); }
  try { history.replaceState(null, "", v === "planner" ? location.pathname : "#" + v); } catch {}
}
$("viewnav").innerHTML = VIEWS.map(([k,l]) => `<button data-v="${k}">${l}</button>`).join("");
$("viewnav").onclick = e => { const b = e.target.closest("button"); if(b) show(b.dataset.v); };

// ---------- major survey ----------
let answers = D.survey.questions.map(() => null), surveyResult = null;
function renderSurvey(){
  const Q = D.survey.questions;
  const done = answers.filter(a => a !== null).length;
  let h = `<p class="tabintro" style="margin-top:0">Not sure which Neeley major fits you? Answer eight quick questions. The survey ranks all eight majors, explains each match, and suggests clubs and programs for your interests. Then build a plan around the one you like.</p>
  <div class="section"><div class="checks">${Q.map((q, qi) => `<div class="sq"><fieldset><legend>${qi+1}. ${esc(q.q)}</legend>${q.opts.map((o, oi) => `<label><input type="radio" name="sq${qi}" value="${oi}" ${answers[qi]===oi?"checked":""}>${esc(o[0])}</label>`).join("")}</fieldset></div>`).join("")}</div></div>
  <div class="section" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn primary" id="svGo" ${done < 4 ? "disabled" : ""}>See my matches</button><span class="hint" id="svCount">${done} of ${Q.length} answered${done < 4 ? " · answer at least 4" : ""}</span><button class="btn" id="svReset">Start over</button></div>
  <div id="svOut"></div>`;
  $("view-survey").innerHTML = h;
  $("view-survey").querySelectorAll("input[type=radio]").forEach(r => r.onchange = () => {
    answers[+r.name.slice(2)] = +r.value; const n = answers.filter(a => a !== null).length;
    $("svCount").textContent = `${n} of ${Q.length} answered${n < 4 ? " · answer at least 4" : ""}`; $("svGo").disabled = n < 4;
  });
  $("svGo").onclick = () => { surveyResult = scoreSurvey(D, answers); showResults(); };
  $("svReset").onclick = () => { answers = Q.map(() => null); surveyResult = null; renderSurvey(); };
  if(surveyResult) showResults();
}
function showResults(){
  const {ranked, tags} = surveyResult;
  const progHrs = id => { const p = D.programs[id]; const s = p?.sections.find(x => /major/i.test(x.name)); return s?.stated || ""; };
  const card = (r, i) => { const mi = D.majorInfo[r.major]; const p = D.programs[r.major];
    return `<div class="match ${i===0?"top":""}"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap"><h3>${i+1}. ${esc(mi.short)}</h3><span class="chip ${i===0?"k-acc":""}">${r.pct}% match</span></div>
      <div class="mbar"><i style="width:${r.pct}%"></i></div>
      <p style="margin:0">${esc(mi.about)} ${srcLink("S16")}</p>
      ${r.why.length ? `<p style="margin:0;font-size:.88rem"><b>Because you picked:</b> ${r.why.slice(0,3).map(w => `“${esc(w)}”`).join(", ")}</p>` : ""}
      <p class="hint" style="margin:0">Careers to explore: ${esc(mi.careers.join(", "))}.${progHrs(r.major) ? ` Major: ${esc(progHrs(r.major))} hours ${srcLink("S12")}.` : ""} These are possibilities, not guarantees.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-plan="${r.major}">Build my plan with ${esc(mi.short)}</button>${BP.isStudent() ? `<button class="btn" data-wi="${r.major}">Compare in What if</button>` : ""}</div></div>`; };
  const inv = recommendInvolvement(D, {major: ranked[0].major, year:"first", tags}).slice(0, 6);
  $("svOut").innerHTML = `<div class="section"><h3>Your top matches</h3><div class="checks">${ranked.slice(0,3).map(card).join("")}</div>
    <details class="how2" style="margin-top:10px"><summary>See all eight majors</summary><div class="tablewrap" style="margin-top:8px"><table><tbody>${ranked.map(r => `<tr><td><b>${esc(D.majorInfo[r.major].short)}</b></td><td style="width:50%"><div class="mbar"><i style="width:${r.pct}%"></i></div></td><td class="num">${r.pct}%</td></tr>`).join("")}</tbody></table></div></details></div>
    <div class="section"><h3>Clubs and programs for you</h3><div class="inv">${inv.map(x => `<article class="invc"><div class="tags"><span class="chip">${esc(x.kind)}</span><span class="chip">${esc(x.when)}</span>${x.apply?`<span class="chip k-warn">Apply / selective</span>`:""}</div><h4>${esc(x.name)}</h4><p>${esc(x.what)}</p><p class="hint">${srcLink(x.src)}</p></article>`).join("")}</div></div>
    <p class="hint">${esc(D.survey.note)} Neeley requires a 3.0 GPA to declare a major after your first year ${srcLink("S5")}.</p>`;
  document.querySelectorAll("[data-plan]").forEach(b => b.onclick = () => { show("planner"); BP.useMajor(b.dataset.plan, tags); });
  document.querySelectorAll("#svOut [data-wi]").forEach(b => b.onclick = () => { show("planner"); BP.whatIf("major", b.dataset.wi); BP.setTab("whatif"); });
  $("svOut").scrollIntoView({behavior:"smooth", block:"start"});
}

// ---------- programs ----------
function renderPrograms(){
  const P = Object.values(D.programs);
  const cats = [["Major","Majors"],["Minor","Minors"],["Certificate","Certificates"],["Accounting pathway","Accounting pathway"],["Graduate","Graduate"]];
  const hrsOf = p => p.sections.reduce((a,s) => a + s.items.reduce((x,it) => x + (it.type==="req" ? (+it.hrs||0) : it.type==="choose" ? (+it.hrs||0) : 0), 0), 0);
  const termTag = c => { const x = D.courses[c]; return x && x.terms.length===1 ? ` <span class="chip k-acc">${x.terms==="F"?"Fall only":"Spring only"}</span>` : ""; };
  const row = it => it.type==="choose"
    ? `<tr><td colspan="2"><b>${esc(it.name && !/^Choose/.test(it.name) ? it.name : "Choose")}</b> · ${esc((it.label||"").replace(/ from options below.*/,""))}<div class="muted" style="font-size:.82rem;margin-top:4px">${it.options.map(o => `<span class="mono">${esc(o.code||"(code n/a)")}</span> ${esc(o.title||"")}`).join(" · ")}</div></td><td class="num">${it.hrs ?? ""}</td></tr>`
    : `<tr><td class="mono">${esc(it.code ? it.code.replace("|"," / ") : it.label || "")}${it.code ? termTag(it.code.split("|")[0]) : ""}</td><td>${esc(it.title||"")}${it.type==="rec" ? ` <span class="chip">Recommended</span>` : ""}${it.note ? `<div class="muted" style="font-size:.8rem">${esc(it.note)}</div>` : ""}</td><td class="num">${it.hrs ?? ""}</td></tr>`;
  $("view-programs").innerHTML = `
    <p class="tabintro" style="margin-top:0">Every Neeley undergraduate program the planner knows, built from the team's programs workbook ${srcLink("S12")}. Majors and minors here are the same data the planner uses, so updating the workbook updates the planner.</p>
    <div class="field" style="max-width:420px;margin-top:12px"><label for="progFind">Find a program or course</label><input id="progFind" type="search" placeholder="e.g. Marketing, Fintech, INSC 30833" style="width:100%;background:var(--sunk);border:1px solid var(--line);border-radius:7px;padding:7px 9px"></div>
    ${cats.map(([c,label]) => { const ps = P.filter(p => p.category===c); if(!ps.length) return ""; return `<div class="section"><h3>${label}</h3><div class="checks">${ps.map(p => `
      <details class="panel prog" data-q="${esc((p.name+" "+JSON.stringify(p.sections)).toUpperCase())}"><summary><span><b>${esc(p.name)}</b> <span class="muted" style="font-weight:400;font-size:.86rem">· ${p.reference ? "reference only" : fmt(hrsOf(p)) + " itemized hrs"}</span></span></summary>
        <p class="muted" style="margin:0 0 8px;font-size:.88rem">${esc(p.who||"")}</p>
        ${(p.notes||[]).slice(p.reference?0:2).filter(n => /DISCREPANCY|NOTE|Eligibility|Variations|Cannot|may substitute|Open to|Total|Policies|Degree/i.test(n)).map(n => `<p class="hint" style="margin:0 0 6px">${esc(n)}</p>`).join("")}
        ${p.sections.map(s => `<h4 style="margin:12px 0 6px;font-size:.9rem">${esc(s.name)}${s.stated ? ` <span class="muted" style="font-weight:400">· ${esc(s.stated)} hrs stated</span>` : ""}</h4>${s.note ? `<p class="hint" style="margin:0 0 6px">${esc(s.note)}</p>` : ""}<div class="tablewrap"><table><tbody>${s.items.map(row).join("")}</tbody></table></div>`).join("")}
      </details>`).join("")}</div></div>`; }).join("")}`;
  $("progFind").addEventListener("input", e => { const q = e.target.value.trim().toUpperCase(); document.querySelectorAll(".prog").forEach(d => { d.hidden = q.length > 1 && !d.dataset.q.includes(q); }); });
}

// ---------- findings ----------
const FINDINGS = [
  {id:"F1", sharp:true, title:"Real-estate electives are listed for Finance majors but closed to them.",
   evidence:"Finance checklist lists FINA 30313, 30623, 40603 and 40613 as electives. The FINA 30313 description restricts it to declared Finance with a Real Estate Concentration majors, and the other three require FINA 30313.", src:"S1, S10",
   impact:"4 of the 13 listed electives (31%) cannot be taken. A student who discovers this as a senior must pick different electives or switch to the Real Estate concentration (27 major hours instead of 24 per the checklists), which can add a semester if it surfaces late.",
   who:"Finance majors drawn to real estate who are not in the concentration.", conf:"High"},
  {id:"F2", title:"Checklist prerequisites are looser than the official course descriptions.",
   evidence:"FINA 30153 also requires ECON 10223 with a C-; FINA 30203 requires ECON 10223 and 10233; INSC 40813 requires all four core BIS courses, not two.", src:"S1, S4, S10",
   impact:"A student planning from the checklist can be blocked at registration. Missing ECON 10223 at C- holds back FINA 30153, which gates a four-course chain (30203/30213 → 30233 → 40153): about one semester.",
   who:"Every Finance and BIS major; transfer students whose ECON credit arrives late.", conf:"High"},
  {id:"F3", title:"One-term-only courses turn a single miss into a lost year.",
   evidence:"FINA 40623 is fall only; INSC 30723, 30823, 40813 and 40843 are fall only; INSC 30833 and 30853 are spring only (checklists).", src:"S1, S4",
   impact:"A miss waits a full year for the next offering. In the Jordan scenario, a fall abroad pushes International Finance to Fall 2028 (+1 semester) until the planner swaps the elective. Seniors and double majors with little slack are most exposed.",
   who:"BIS majors and double majors, students studying abroad in fall.", conf:"High"},
  {id:"F4", title:"The same student faces different rules depending on catalog year.",
   evidence:"Current checklist: 36 upper-level and 45 TCU hours, 16-hour business core. Earlier checklist and a Fall 2024 audit: 42 upper-division and 58 residency hours, 37-hour business core.", src:"S1, S2, S9",
   impact:"+6 upper-level and +13 residency hours for earlier entrants. A planner that ignores catalog year gives wrong answers to every pre-2025 student.",
   who:"Students who entered before Summer 2025, transfers, students changing majors.", conf:"High"},
  {id:"F5", title:"The registrar's audit counts hours without naming courses, and its substitutions live nowhere else.",
   evidence:"A real audit showed 'B Core Requirement: 37 required, 34 used, 3 needed' with no course named, and two advisor substitutions (INSC 30273 → 40843, INSC 30283 → 30833).", src:"S9, S10",
   impact:"The final semester cannot be planned without an advisor meeting. A catalog-only tool would wrongly report two BIS courses as missing.",
   who:"Seniors, double majors, anyone with substitutions.", conf:"Medium"},
  {id:"F6", title:"Official sources disagree on course names and even existence.",
   evidence:"FINA 30233 is 'Investments II' on the checklist but 'Financial Derivatives' on the audit; MANA 30350 (required) and BUSI 10153 are missing from the course list.", src:"S1, S9, S10",
   impact:"Students and AI tools that match by title make wrong matches; the planner must match by course number and flag gaps.",
   who:"All students; any automated tool.", conf:"Medium"},
  {id:"F8", title:"The Strategy course has two numbers, and checklists disagree with the catalog on program size.",
   evidence:"Strategy is MANA 30350 on the Accounting, Finance, Management and Supply Chain checklists but MANA 40250 on the BIS, Entrepreneurship and Marketing checklists; only MANA 40250 is in the course list. The catalog lists Accounting at 21 hours and Supply & Value Chain with a different 21-hour structure; the checklists say 25.5 and 22.", src:"S10, S12",
   impact:"A student registering for the wrong number, or planning from the catalog, can be short a required course or several hours in the senior year.",
   who:"Every Neeley major (Strategy); Accounting and Supply & Value Chain majors (program size).", conf:"High"},
  {id:"F9", title:"Some minors are off-limits depending on your major, and some courses need a separate admission.",
   evidence:"Finance, Accounting, Leadership and Global Business minors are for other business majors only; General Business and Entrepreneurship minors are for non-business majors only. INSC 30273 and 30283 require admission to the Fintech certificate.", src:"S12, S10",
   impact:"A student can plan a minor they are not eligible for, or count on Fintech courses as substitutions without being admitted.",
   who:"Students adding a minor or certificate.", conf:"High"},
  {id:"F10", title:"AP Statistics doesn't help business students, and some AP scores earn less than students expect.",
   evidence:"AP Statistics (3–5) earns MATH 10043, but business majors must take INSC 20153 and the course list bars credit for both. AP Macroeconomics and Microeconomics earn credit only at a 4. Exam credit carries no grade, yet FINA 30153 requires ECON 10223 with a C-.", src:"S13, S10, S12",
   impact:"A first-year counting on AP Statistics loses 3 hours and still has to take INSC 20153. A 3 on AP Macro means ECON 10233 must still be scheduled before upper-division business courses. Students with several exam credits have fewer graded courses carrying their 2.75 lower-division GPA.",
   who:"First-year students with AP, IB or CLEP credit, especially intended business majors.", conf:"High"},
  {id:"F7", title:"One low grade can block graduation through the major GPA.",
   evidence:"BBA graduation requires a 2.5 major GPA; finance prerequisites require C-.", src:"S6, S1",
   impact:"In the Jordan scenario a single D moves the estimated major GPA to 2.25 and forces a retake that shifts the rest of the chain.",
   who:"Students with a D or F in a major course.", conf:"High"}
];
function curriculumRanking(){
  const codes = Object.keys(D.courses);
  const down = {};
  const direct = c => codes.filter(x => (D.courses[x].pre||[]).some(([p]) => p.split("|").includes(c)) || (D.courses[x].conc||[]).includes(c));
  const all = (c, seen = new Set()) => { direct(c).forEach(x => { if(!seen.has(x)){ seen.add(x); all(x, seen); } }); return seen; };
  codes.forEach(c => down[c] = all(c));
  return codes.map(c => ({code:c, t:D.courses[c].t, n:down[c].size, terms:D.courses[c].terms, ts:D.courses[c].ts, restrict:D.courses[c].restrict,
    score: down[c].size * (D.courses[c].terms.length === 1 ? 2 : 1) + (D.courses[c].restrict ? 5 : 0)}))
    .filter(r => r.n > 0 || r.restrict).sort((a,b) => b.score - a.score || b.n - a.n).slice(0, 12);
}
function renderFindings(){
  const sharp = FINDINGS.find(f => f.sharp);
  const rank = curriculumRanking();
  $("view-findings").innerHTML = `
  <div class="section"><p class="tabintro" style="margin-top:0">Part 1 of the case: how the requirements fit together and where students get stuck. Every finding cites the official source it rests on; impact estimates show their assumptions.</p></div>
  <div class="callout" style="margin-top:12px"><span class="kicker" style="display:block;color:var(--accent)">Sharpest bottleneck</span><b>${esc(sharp.title)}</b><br>${esc(sharp.impact)} ${srcLink(sharp.src)}</div>
  <div class="section"><h3>Findings</h3><div class="tablewrap"><table><thead><tr><th>#</th><th>Finding</th><th>Evidence</th><th>Student impact</th><th>Affected students</th><th>Confidence</th></tr></thead><tbody>
  ${FINDINGS.map(f => `<tr class="${f.sharp?"hot":""}"><td class="mono">${f.id}</td><td><b>${esc(f.title)}</b></td><td>${esc(f.evidence)} ${srcLink(f.src)}</td><td>${esc(f.impact)}</td><td>${esc(f.who)}</td><td><span class="chip ${f.conf==="High"?"k-ok":"k-acc"}">${f.conf}</span></td></tr>`).join("")}
  </tbody></table></div></div>
  <div class="section"><h3>Course dependency analysis</h3><p class="muted" style="margin:0 0 8px;font-size:.88rem;max-width:75ch">Computed from the loaded prerequisites: how many later courses each course unlocks, directly or indirectly. One-term-only and restricted courses rank higher because missing them costs more.</p>
  <div class="tablewrap"><table><thead><tr><th>Course</th><th>Unlocks</th><th>Runs</th><th>Why it matters</th></tr></thead><tbody>
  ${rank.map(r => `<tr><td><span class="mono">${esc(r.code)}</span><br><span class="muted">${esc(r.t)}</span></td><td class="num">${r.n} course${r.n===1?"":"s"}</td><td>${r.terms==="F"?"Fall only":r.terms==="S"?"Spring only":"Fall & spring"}${r.ts==="assumed"?" <span class=\"muted\">(assumed)</span>":""}</td><td>${r.restrict ? "Restricted: " + esc(r.restrict) + ". " : ""}${r.terms.length===1 ? "A miss waits a full year. " : ""}${r.n>=3 ? "Gates a long chain; take it early." : ""}</td></tr>`).join("")}
  </tbody></table></div></div>
  <div class="section"><h3>Requirements map: two student profiles</h3><div class="tablewrap"><table><thead><tr><th>Rule</th><th>Finance BBA, entered Summer 2025 or later</th><th>BIS + Finance double major, Fall 2024 requirement term</th></tr></thead><tbody>
    <tr><td>Source</td><td>Current Finance checklist ${srcLink("S1")}</td><td>Registrar audit ${srcLink("S9")}</td></tr>
    <tr><td>Total hours</td><td>120</td><td>120 (audit shows a 120–135 band)</td></tr>
    <tr><td>Upper-division hours (30000–40000 level)</td><td>36</td><td>42</td></tr>
    <tr><td>Lower-division business requirements</td><td>ECON 10223, 10233, ENGL 10803, MATH 10283, INSC 20153, ACCT 20353, INSC 20263; 2.75 GPA across them ${srcLink("S1, S11")}</td><td>24-hour LDR course list incl. ENTR 20153 and BUSI 10153; LDR GPA 2.75 ${srcLink("S9")}</td></tr>
    <tr><td>Hours at TCU</td><td>45</td><td>58</td></tr>
    <tr><td>Business core</td><td>16 hrs (FINA 30153, ENTR 20263, INSC 30313, INSC 30801, MANA 30250 + 30350, MARK 30153)</td><td>37 hrs, lower-division courses included</td></tr>
    <tr><td>Major</td><td>Finance 24 hrs: 6 required + 2 electives</td><td>BIS 21 hrs + Finance second major 18 required + 6 elective</td></tr>
    <tr><td>Other gates</td><td>3.0 GPA to declare; 2.5 cumulative and major GPA to graduate ${srcLink("S5, S6")}</td><td>Same GPA rules, plus 6 Writing Emphasis hours at TCU and one HMVV per course ${srcLink("S9")}</td></tr>
    <tr><td>What can't be automated</td><td>Core overlap choices, transfer equivalency</td><td>Which course fills unnamed business-core hours; substitutions</td></tr>
  </tbody></table></div></div>`;
}

// ---------- validation ----------
function student(id, patch){ return {...JSON.parse(JSON.stringify(STUDENTS[id])), globalChoice:null, electivesOverride:null, ...(patch||{})}; }
function invariants(r){
  const errs = [];
  const when = {}; r.plan.terms.forEach((t,ix) => t.items.forEach(i => { if(i.code) when[i.code] = ix; }));
  r.plan.terms.forEach((t,ix) => {
    if(t.credits > r.model.st.maxCredits + 0.001 && !t.abroad) errs.push(`${termName(t.code)} has ${t.credits} hrs, over the cap`);
    t.items.forEach(i => {
      if(!i.code || i.kind === "abroad") return;
      if(!i.terms.includes(t.code[0])) errs.push(`${i.code} placed in ${termName(t.code)} but runs ${i.terms==="F"?"fall":"spring"} only`);
      (i.pre||[]).forEach(([pp]) => { const opts = pp.split("|"); const planned = opts.filter(p => when[p] !== undefined); if(planned.length && planned.every(p => when[p] >= ix) && !opts.some(p => r.model.recs[p])) errs.push(`${i.code} before ${pp}`); });
      (i.coreq||[]).forEach(c => { if(when[c] !== undefined && when[c] !== ix) errs.push(`${i.code} not with ${c}`); });
    });
  });
  return errs;
}
const TESTS = [
  {id:"T1", scenario:"Scenario 1 · On time", name:"Maya finishes by her Spring 2029 target", run:() => {
    const r = runAll(student("maya"), D);
    return [["status is on track", r.status.kind === "ok"], ["finish is Spring 2029", r.plan.grad === "S2029"],
      ["all checklist courses accounted for", r.val.checks[0].status === "pass"], ["hours ≥ 120 and upper-level ≥ 36", r.val.total >= 120 && r.val.upper >= 36], ["no invariant violations", invariants(r)]];
  }},
  {id:"T2", scenario:"Scenario 3 · Conflict", name:"Time clash in Spring 2027 is detected and resolved", run:() => {
    const r = runAll(student("maya"), D);
    const ev = r.plan.events.find(e => e.code === "ACCT 30253");
    const t1 = r.plan.terms[0].items.map(i=>i.code);
    return [["clash between ACCT 30253 and FINA 30213 reported", !!ev && ev.with.includes("FINA 30213")], ["FINA 30213 kept (longer chain)", t1.includes("FINA 30213")], ["ACCT 30253 moved later", !t1.includes("ACCT 30253")]];
  }},
  {id:"T3", scenario:"Scenario 2 · Minor", name:"Adding BIS shows its scheduling cost", run:() => {
    const a = runAll(student("maya"), D), b = runAll(student("maya", {minor:"Min-BIS"}), D);
    const bnB = bottlenecks(b.model, b.plan), bnA = bottlenecks(a.model, a.plan);
    return [["both plans finish Spring 2029", a.plan.grad === "S2029" && b.plan.grad === "S2029"], ["BIS adds one-term-only courses", b.plan.terms.flatMap(t=>t.items).filter(i=>i.code&&i.terms.length===1).length > a.plan.terms.flatMap(t=>t.items).filter(i=>i.code&&i.terms.length===1).length],
      ["BIS fills free-elective hours instead of adding hours", b.val.planned === a.val.planned && b.plan.terms.flatMap(t=>t.items).filter(i=>i.kind==="free").length < a.plan.terms.flatMap(t=>t.items).filter(i=>i.kind==="free").length], ["all four required BIS minor courses planned", ["INSC 30723","INSC 30823","INSC 30833","INSC 30853"].every(c => b.plan.terms.some(t => t.items.some(i => i.code===c)))]];
  }},
  {id:"T4", scenario:"Scenario 3 · Bottleneck", name:"Jordan's fall-only course and abroad term", run:() => {
    const s = student("jordan"); const r = runAll(s, D); const alt = findAlternative(r.model, s, D);
    return [["projected late (Fall 2028)", r.plan.grad === "F2028" && r.status.kind === "late"], ["FINA 30213 retake planned (D < C-)", r.model.items.some(i => i.code==="FINA 30213" && i.kind==="retake")],
      ["alternative found that finishes Spring 2028", !!alt && alt.found && alt.plan.grad === "S2028"], ["major GPA below 2.5 flagged", r.model.flags.some(f => /major GPA/.test(f.text))], ["no invariant violations", invariants(r)]];
  }},
  {id:"T5", scenario:"Scenario 4 · AI gets it wrong", name:"Sam's unsupported record is refused", run:() => {
    const r = runAll(student("sam"), D);
    return [["status is 'see an advisor'", r.status.kind === "advisor"], ["older catalog year rejected", !r.model.cy.verified], ["2 unmatched transfer courses not guessed", r.model.tx.unknown.length === 2],
      ["GPA below thresholds reported", r.status.reasons.some(x => /GPA/.test(x))]];
  }},
  {id:"T6", scenario:"Audit import", name:"Sample audit is read and planned", run:() => {
    const a = parseAudit(SAMPLE_AUDIT); const r = runAudit(a, {career:"consulting", maxCredits:15}, D);
    const codes = r.plan.terms.flatMap(t=>t.items).map(i=>i.code);
    return [["33 courses and 4 open requirements read", a.history.length === 33 && a.unmet.length === 4], ["name and ID detected and discarded", a.identityRemoved && !JSON.stringify(a).includes("Riley")],
      ["substitution INSC 30283 → 30833 applied", !!r.model.recs["INSC 30833"]], ["FINA 30233 and 40153 planned as required", codes.includes("FINA 30233") && codes.includes("FINA 40153")],
      ["unnamed business-core hours sent to advisor", r.model.resolutions.some(x => x.conf === "low")], ["finishes Spring 2027", r.plan.grad === "S2027"], ["no invariant violations", invariants(r)]];
  }},
  {id:"T7", scenario:"Audit import", name:"Lower hour cap delays the audit student", run:() => {
    const r = runAudit(parseAudit(SAMPLE_AUDIT), {career:"consulting", maxCredits:12}, D);
    return [["finish moves to Fall 2027", r.plan.grad === "F2027"], ["status is behind goal", r.status.kind === "late"], ["no term over 12 hours", invariants(r)]];
  }},
  {id:"T8", scenario:"Finding F1", name:"Real-estate interest never schedules a restricted course", run:() => {
    const r = runAll(student("maya", {career:"realestate"}), D);
    const codes = r.plan.terms.flatMap(t=>t.items).map(i=>i.code);
    return [["no FINA 30313 / 30623 / 40603 / 40613 planned", !["FINA 30313","FINA 30623","FINA 40603","FINA 40613"].some(c => codes.includes(c))], ["advisor flag about the concentration", r.model.flags.some(f => /Real Estate Concentration/.test(f.text))]];
  }},
  {id:"T10", scenario:"Upper / lower division", name:"Upper-division count matches the registrar's audit", run:() => {
    const a = parseAudit(SAMPLE_AUDIT); const r = runAudit(a, {career:"consulting", maxCredits:15}, D); const B = levelBreakdown(r.model, r.plan);
    const m = runAll(student("maya"), D); const Bm = levelBreakdown(m.model, m.plan);
    return [["audit's 42-hour upper-division rule detected", B.upperMin === 42], [`planner count (${B.L.upper.done + B.L.upper.ip}) equals audit's ${a.upperReq?.used} hours used`, B.L.upper.done + B.L.upper.ip === a.upperReq?.used],
      ["Maya's plan reaches 36 upper-division hours", Bm.L.upper.done + Bm.L.upper.ip + Bm.L.upper.planned >= 36], ["lower-division business list shows every LDR course", Bm.ldr.length === D.ldr.courses.length]];
  }},
  {id:"T11", scenario:"Reusability", name:"Every Neeley major and minor produces a valid plan", run:() => {
    const majors = Object.values(D.programs).filter(p => p.category==="Major");
    const out = majors.map(p => { const r = runAll(student("maya", {major:p.id}), D); return [`${p.id}: all requirements placed, no rule broken`, r.plan.leftovers.length===0 && r.val.checks[0].status!=="fail" && invariants(r).length===0]; });
    const mins = Object.values(D.programs).filter(p => p.category==="Minor"||p.category==="Certificate");
    const bad = mins.filter(p => { const r = runAll(student("maya", {minor:p.id}), D); return r.plan.leftovers.length || invariants(r).length; }).map(p => p.id);
    out.push([`${mins.length} minors and certificates plan without breaking a rule${bad.length?": "+bad.join(", "):""}`, bad.length===0]);
    const fin = runAll(student("maya", {minor:"Min-Finance"}), D);
    out.push(["Finance minor on a Finance major is flagged as not allowed", fin.model.flags.some(f => /own major/.test(f.text))]);
    const gb = runAll(student("maya", {minor:"Min-General Business"}), D);
    out.push(["General Business minor (non-business majors only) is flagged", gb.model.flags.some(f => /non-business majors only/.test(f.text))]);
    return out;
  }},
  {id:"T12", scenario:"Suggestions", name:"Suggestions are correct when applied", run:() => {
    const run = s => { const r = runAll(s, D); r.bn = bottlenecks(r.model, r.plan); return r; };
    const st0 = student("maya"); const r = run(st0); const S = suggest(r, st0, D, run);
    const early = S.find(s => s.id === "early"), applied = early && run({...st0, ...early.action.set});
    const minor = S.find(s => s.id.startsWith("minor-")), withMinor = minor && run({...st0, ...minor.action.set});
    const j = student("jordan"); const rj = run(j); const Sj = suggest(rj, j, D, run);
    return [["Maya: early-finish suggestion found", !!early], ["applying it really finishes a semester earlier", !!applied && termIdx(applied.plan.grad) < termIdx(r.plan.grad) && invariants(applied).length===0],
      ["suggested minor keeps her finish date", !!withMinor && withMinor.plan.grad === r.plan.grad], ["no suggested minor is one she's ineligible for", S.filter(s=>s.id.startsWith("minor-")).every(s => !run({...st0, ...s.action.set}).model.flags.some(f => /non-business majors only|own major/.test(f.text)))],
      ["Jordan: retake suggested, early-finish not suggested while late", Sj.some(s=>s.id==="retake") && !Sj.some(s=>s.id==="early")]];
  }},
  {id:"T13", scenario:"First year + exam credit", name:"Noah's AP scores are applied correctly", run:() => {
    const run = s => { const r = runAll(s, D); r.bn = bottlenecks(r.model, r.plan); return r; };
    const s = student("noah"); const r = run(s); const ex = r.model.exam; const codes = r.plan.terms.flatMap(t => t.items.map(i => i.code));
    const S = suggest(r, s, D, run);
    return [["Calculus AB 4 → MATH 10524, which satisfies business math (MATH 10283 not planned)", !!r.model.recs["MATH 10524"] && !codes.includes("MATH 10283")],
      ["English Language 4 → ENGL 10803 and 20803", ["ENGL 10803","ENGL 20803"].every(c => r.model.recs[c]?.grade === "EX") && !codes.includes("ENGL 10803")],
      ["Macroeconomics 3 earns nothing, so ECON 10233 is planned", ex.noCredit.some(n => /Macro/.test(n)) && codes.includes("ECON 10233")],
      ["AP Statistics hours excluded and flagged; INSC 20153 still required", ex.credits.some(c => c.noCount) && r.model.inProgress.some(c => c.code==="INSC 20153") && S.some(x => x.id==="apstats")],
      ["19 exam hours counted, US History fills TCU Core HT", ex.countedHours === 19 && ex.slots.includes("HT")],
      ["exam credit excluded from GPA", r.model.gpa === null],
      ["no invariant violations", invariants(r)]];
  }},
  {id:"T14", scenario:"Audit import", name:"Audits for other majors are understood", run:() => {
    const txt = "Academic Advising Report\nFor Test,Student (000000001)\nBusiness - Undergraduate Program 2025 Fall Term Not Satisfied 2028 Spring Term\nMarketing BBA Major 2025 Fall Term Not Satisfied\nGPA TCU Earned Transferred Test Credit Other Credit Cum In Prog.\n3.400 75.00 0.00 0.00 0.00 75.00 15.00\nNot Satisfied: MARK-BBA Major Requirements, 9 hrs\nUnits: 9.00 required, 6.00 used, 3.00 needed\nNot Satisfied: MARK-BBA Major Electives 12 hrs\nUnits: 12.00 required, 3.00 used, 9.00 needed\nCourse History\n25 Fall MARK 30153 Marketing Management A 3.00 EN\n26 Spring MARK 30113 Marketing Research A 3.00 EN\n26 Spring INSC 20153 Statistical Analysis A 3.00 EN\n26 Fall MARK 30243 Customer Insights 3.00 IP\n26 Fall MARK 30233 Marketing Analytics 3.00 IP";
    const a = parseAudit(txt); const r = runAudit(a, {career:"consulting", maxCredits:15}, D);
    const req = r.model.resolutions.find(x => /9 hrs/.test(x.name)), el = r.model.resolutions.find(x => /Electives/.test(x.name));
    const picks = el ? el.picks.map(p => p.code) : [];
    return [["Marketing requirement lines matched (none sent to advisor)", r.model.resolutions.every(x => x.conf !== "low")], ["the missing required course is MARK 40203", !!req && req.picks[0]?.code === "MARK 40203"],
      ["3 Marketing electives picked from the approved list", picks.length === 3 && picks.every(c => /^(MARK|INSC)/.test(c))], ["honors-only and permission-only courses skipped", !picks.includes("MARK 40033")], ["no invariant violations", invariants(r)]];
  }},
  {id:"T15", scenario:"Minor overlap", name:"Minors don't assume double-counting", run:() => {
    const a = runAll(student("maya", {minor:"Min-Accounting"}), D), b = runAll(student("maya", {minor:"Min-Accounting", allowOverlap:true}), D);
    const reps = x => x.plan.terms.flatMap(t => t.items).filter(i => i.askKind === "overlap").length;
    return [["4 overlapping courses get replacement slots by default", reps(a) === 4], ["advisor flag explains the rule", a.model.flags.some(f => /double-counting rules aren't loaded/.test(f.text))], ["turning on overlap removes the replacements", reps(b) === 0]];
  }},
  {id:"T16", scenario:"What if", name:"Major and minor what-ifs are accurate", run:() => {
    const s = student("maya");
    const mk = whatIf(s, D, {major:"MARK"}), ac = whatIf(s, D, {second:"ACCT"}), re = whatIf(s, D, {second:"FIRE"}), bis = whatIf(s, D, {minor:"Min-BIS"});
    return [["switching to Marketing: ACCT 30153 stops counting (it's a Finance requirement)", mk.stopCounting.includes("ACCT 30153")],
      ["switching keeps the shared business core (FINA 30153, MARK 30153)", ["FINA 30153","MARK 30153"].every(c => mk.stillCount.includes(c))],
      ["Accounting as a second major adds its own courses", ac.added.includes("ACCT 30273") && ac.added.includes("ACCT 40253")],
      ["Finance + Real Estate double major is blocked", re.blockers.length > 0],
      ["BIS minor adds its required courses", ["INSC 30723","INSC 30823","INSC 30833","INSC 30853"].every(c => bis.added.includes(c))],
      ["what-if plans break no rules", invariants(mk.alt).length===0 && invariants(ac.alt).length===0]];
  }},
  {id:"T17", scenario:"First year + survey", name:"Freshman start, major survey and club recommendations", run:() => {
    const und = runAll({...student("noah"), major:"UND", exams:[], transcript:"", freshman:true}, D);
    const r = scoreSurvey(D, [0,4,0,0,0,1,4,1]); const r2 = scoreSurvey(D, [1,3,1,1,2,4,0,2]);
    const inv = recommendInvolvement(D, {major:"FINA", year:"first", tags:["investing"]});
    const invS = recommendInvolvement(D, {major:"SVCM", year:"junior", tags:["supplychain"]});
    return [["undecided first-year gets a valid plan of shared business requirements", und.val.checks[0].status === "pass" && invariants(und).length === 0 && !und.plan.terms.some(t => t.items.some(i => /^FINA 30[2-9]/.test(i.code||"")))],
      ["finance-leaning answers rank Finance first", r.ranked[0].major === "FINA"], ["marketing-leaning answers rank Marketing first", r2.ranked[0].major === "MARK"],
      ["first-years see first-year programs near the top", inv.slice(0,6).some(x => x.year === "first")], ["finance clubs recommended for a finance student", inv.some(x => x.name === "Finance Club")],
      ["supply-chain junior gets the Center for Supply Chain Innovation", invS.slice(0,5).some(x => /Supply Chain/.test(x.name))],
      ["every recommendation cites a source", inv.every(x => x.src)]];
  }},
  {id:"T9", scenario:"Data integrity", name:"Every planner course exists in the TCU course list", run:() => {
    const list = JSON.parse(document.getElementById("course-list").textContent);
    const missing = Object.keys(D.courses).filter(c => !list[c]);
    const flagged = missing.every(c => D.courses[c].notInList);
    return [[`courses missing from the list are flagged (${missing.join(", ")||"none"})`, flagged]];
  }}
];
function renderValidation(){
  const rows = TESTS.map(t => {
    let checks, err = null;
    try { checks = t.run().map(([label, v]) => Array.isArray(v) ? [label + (v.length ? `: ${v.join("; ")}` : ""), v.length === 0] : [label, !!v]); }
    catch(e){ checks = []; err = String(e && e.message || e); }
    const pass = !err && checks.every(c => c[1]);
    return {t, checks, pass, err};
  });
  const n = rows.reduce((a,r) => a + r.checks.length, 0), ok = rows.reduce((a,r) => a + r.checks.filter(c=>c[1]).length, 0);
  $("view-validation").innerHTML = `
  <p class="tabintro" style="margin-top:0">These tests run live in your browser against the same rules engine the planner uses, every time this page opens. Each one states what an independently checked plan must show.</p>
  <div class="facts" style="margin-top:12px;font-size:1rem"><span>Tests <b>${rows.filter(r=>r.pass).length} / ${rows.length}</b> passing</span><span>Checks <b>${ok} / ${n}</b></span><span>Independent advisor review <b>pending</b></span></div>
  <div class="section"><div class="checks">${rows.map(r => `<div class="ck ${r.pass?"pass":"fail"}"><span class="ic">${r.pass?"✓":"✕"}</span><div><b>${r.t.id} · ${esc(r.t.name)}</b> <span class="chip">${esc(r.t.scenario)}</span>
    ${r.err ? `<p>Test error: ${esc(r.err)}</p>` : `<ul class="issues" style="margin-top:6px">${r.checks.map(([l,v]) => `<li style="color:${v?"var(--muted)":"var(--bad)"}">${v?"✓":"✕"} ${esc(l)}</li>`).join("")}</ul>`}</div></div>`).join("")}</div></div>
  <div class="section"><h3>Every plan must also satisfy</h3><ul class="issues">
    <li>No course before its prerequisites, including C- minimums and either-or prerequisites.</li>
    <li>No fall-only course in spring and no spring-only course in fall.</li>
    <li>No semester over the student's hour cap; corequisites in the same term.</li>
    <li>The planner never names a course that isn't in the loaded data, and never claims a student is cleared to graduate.</li></ul></div>
  <div class="section"><h3>Known limitations and wrong answers we found</h3><ul class="issues">
    <li>TCU Core overlap is approximated, so hour totals for core-heavy students can be off by a course or two.</li>
    <li>Section times are synthetic; time-clash checks prove the logic, not the real schedule.</li>
    <li>Early versions used checklist prerequisites; the course list showed FINA 30153 also needs ECON 10223 with a C-. The planner now uses course descriptions.</li>
    <li>Early versions suggested real-estate electives to Finance majors. Test T8 now guards against that.</li>
    <li>We first reported that adding BIS courses gave Maya a one-semester risk. That came from checklist prerequisites; with the course-description prerequisites her plan has enough slack, so test T3 now checks what is actually true: BIS uses her free-elective hours.</li>
    <li>The planner can't verify non-course requirements such as junior standing, a declared major or dean approval.</li></ul></div>`;
}

// ---------- cost of a delay ----------
const COA = {year:"2026–27", tuition:66520, sga:90, housingFood:18780, books:700, transport:1374, personal:2278, url:"https://financialaid.tcu.edu/cost/cost-of-attendance/undergraduate.php"};
function renderCost(){
  $("view-cost").innerHTML = `
  <p class="tabintro" style="margin-top:0">What an avoidable extra semester costs, and who bears it. Costs are TCU's published ${COA.year} cost of attendance for an on-campus undergraduate (<a href="${COA.url}" target="_blank" rel="noopener">TCU Financial Aid</a>), halved for one semester. Change the assumptions to match a student or a pilot.</p>
  <div class="costgrid">
    <section class="panel">
      <div class="field"><label for="c-aid">Scholarships and grants (% of tuition)</label><input id="c-aid" type="number" min="0" max="100" value="0"><span class="hint">Set to the student's aid to see their net cost.</span></div>
      <div class="field"><label for="c-salary">First-year salary given up ($/yr)</label><input id="c-salary" type="number" min="0" step="1000" value="0"><span class="hint">Starting a job a semester late. Left at 0 because no Neeley salary source is loaded.</span></div>
      <div class="field"><label for="c-students">Students in the pilot</label><input id="c-students" type="number" min="0" value="500"></div>
      <div class="field"><label for="c-rate">Share who would otherwise add a semester (%)</label><input id="c-rate" type="number" min="0" max="100" step="0.5" value="5"><span class="hint">Assumption to replace with pilot data.</span></div>
      <div class="field"><label for="c-prevent">Share of those delays the tool prevents (%)</label><input id="c-prevent" type="number" min="0" max="100" step="5" value="30"><span class="hint">Assumption; most delays have causes a planner can't fix.</span></div>
    </section>
    <div id="costOut" style="min-width:0"></div>
  </div>`;
  const calc = () => {
    const v = id => Math.max(0, +$(id).value || 0);
    const aid = Math.min(100, v("c-aid")) / 100;
    const tuition = COA.tuition / 2, living = (COA.housingFood + COA.books + COA.transport + COA.personal) / 2, fees = COA.sga / 2;
    const sticker = tuition + fees + living;
    const netTuition = tuition * (1 - aid);
    const marginal = netTuition + fees + living;
    const lostPay = v("c-salary") / 2;
    const student = marginal + lostPay;
    const n = v("c-students"), delayed = n * Math.min(100, v("c-rate")) / 100, prevented = delayed * Math.min(100, v("c-prevent")) / 100;
    $("costOut").innerHTML = `
      <div class="tablewrap"><table><thead><tr><th>One extra semester, per student</th><th style="text-align:right">Amount</th></tr></thead><tbody>
        <tr><td>Tuition (flat rate, half of ${money(COA.tuition)})</td><td class="num" style="text-align:right">${money(tuition)}</td></tr>
        <tr><td>Housing and food, books, transportation, personal (half-year)</td><td class="num" style="text-align:right">${money(living)}</td></tr>
        <tr><td>Student government fee</td><td class="num" style="text-align:right">${money(fees)}</td></tr>
        <tr><td><b>Total cost of attendance for the semester</b></td><td class="num" style="text-align:right"><b>${money(sticker)}</b></td></tr>
        <tr><td>Less scholarships and grants (${Math.round(aid*100)}% of tuition)</td><td class="num" style="text-align:right">−${money(tuition - netTuition)}</td></tr>
        <tr><td><b>Marginal cost the student actually avoids</b></td><td class="num" style="text-align:right"><b>${money(marginal)}</b></td></tr>
        ${lostPay ? `<tr><td>Plus half a year of salary given up</td><td class="num" style="text-align:right">${money(lostPay)}</td></tr>` : ""}
      </tbody></table></div>
      <div class="callout" style="margin-top:12px"><b>Pilot estimate:</b> ${Math.round(n).toLocaleString()} students × ${v("c-rate")}% who would add a semester × ${v("c-prevent")}% prevented ≈ <b>${prevented.toFixed(1)} semesters avoided</b>, worth about <b>${money(prevented * student)}</b> to those students and families.</div>
      <div class="section"><h3>Who bears the cost</h3><ul class="issues">
        <li><b>Students and families</b> pay the marginal cost above. Living costs are avoided only if the student would otherwise stay enrolled and in Fort Worth.</li>
        <li><b>TCU</b> collects about ${money(netTuition)} in net tuition for the extra semester, so preventing delays lowers that revenue. It also frees a seat in a constrained course and improves the four-year graduation rate, which TCU reports publicly (73% for the Fall 2018 cohort; <a href="https://ie.tcu.edu/accreditation/student-achievement/" target="_blank" rel="noopener">TCU Institutional Effectiveness</a>).</li>
        <li><b>Advisors</b> spend less time on routine sequencing questions and more on substitutions, exceptions and career conversations.</li>
      </ul><p class="hint">The pilot assumptions are placeholders. Replace them with measured delay rates before presenting them as results.</p></div>`;
  };
  $("view-cost").addEventListener("input", calc); calc();
}

// ---------- guided demo ----------
const TOUR = [
  {v:"planner", go:()=>BP.loadSample(), tab:"plan", spot:".answer", title:"Start from the student's real record", text:"Riley uploaded a degree audit (this one is a made-up sample in the registrar's format). In one line: can Riley finish on time, and exactly what to register for next.", rub:"Usability · Impact"},
  {v:"planner", tab:"left", spot:"#tabbody", title:"Every open requirement, with confidence", text:"Each 'Not Satisfied' line from the audit is filled with a course. Certain means only one course fits; Suggested means any approved course works; Ask advisor means the records don't name it.", rub:"Accuracy · Transparency"},
  {v:"planner", go:()=>BP.loadStudent("noah"), tab:"sug", spot:"#tabbody", title:"A first-year with AP credit", text:"Noah brought six AP scores. The planner finds he can finish a semester early, and warns that AP Statistics won't help a business major because TCU won't give credit for both MATH 10043 and INSC 20153.", rub:"Personalization · Problem-solving"},
  {v:"planner", tab:"exam", spot:"#tabbody", title:"What each exam score really earns", text:"Every score is looked up in TCU's credit-by-exam tables, including the ones that earn nothing (a 3 on AP Macro).", rub:"Accuracy"},
  {v:"survey", go:()=>{ answers = [0,4,0,0,0,1,4,1]; surveyResult = scoreSurvey(D, answers); renderSurvey(); }, spot:"#svOut", title:"Not sure of a major? Take the survey", text:"An undecided first-year answers eight questions. The survey ranks all eight Neeley majors, explains each match, suggests clubs and programs, and builds a plan with one click.", rub:"Personalization"},
  {v:"planner", go:()=>BP.useMajor("FINA", ["investing","leadership","honors"]), tab:"inv", spot:"#tabbody", title:"First-year plan, no advising report needed", text:"Freshmen can start without an audit: entering term plus intended major. The Get involved tab recommends programs like Neeley Next Step and Neeley Fellows, and clubs that match their interests.", rub:"Intake · Personalization"},
  {v:"planner", go:()=>{ BP.loadStudent("maya"); BP.setCompare("Min-BIS"); }, tab:"cmp", spot:"#tabbody", title:"Scenario 2: adding a minor", text:"Maya compares Finance alone with Finance plus the BIS minor: finish date, hours, free electives, and how fragile the plan becomes with fall-only and spring-only courses.", rub:"Scenario 2"},
  {v:"planner", go:()=>{ BP.loadStudent("maya"); BP.whatIf("major","MARK"); }, tab:"whatif", spot:"#tabbody", title:"What if I switch majors?", text:"Maya tries Marketing. The planner rebuilds her whole plan: which of her courses still count, which become plain electives, what's new, and whether her finish date moves. The table compares every Neeley major at once.", rub:"Late major change"},
  {v:"planner", go:()=>BP.loadStudent("jordan"), tab:"plan", spot:".answer", title:"Scenario 3: the bottleneck", text:"Jordan's International Finance runs fall only and he's abroad that fall, so he'd finish a semester late. The planner proposes an elective swap that meets the same requirements and gets him back on time.", rub:"Scenario 3"},
  {v:"planner", go:()=>BP.applyFix(), tab:"plan", spot:".answer", title:"One click fixes it", text:"With the swap applied, Jordan finishes in Spring 2028. Nothing changes in his official record; this is a plan to take to his advisor.", rub:"Problem-solving"},
  {v:"planner", go:()=>BP.loadStudent("sam"), tab:"chk", spot:".answer", title:"Scenario 4: when the AI should say no", text:"Sam is on an older catalog year with transfer credit that doesn't match TCU's course list. The planner refuses to present a plan as valid and writes a summary for his advisor instead.", rub:"Responsible AI"},
  {v:"validation", spot:"#view-validation", title:"Proof it works", text:"These tests run live in the page every time it opens, against every scenario, every major and minor, and the audit format. Failures we found and fixed are listed too.", rub:"Completeness · Technical"},
  {v:"findings", spot:".callout", title:"What we found in TCU's own data", text:"Our sharpest bottleneck: real-estate electives listed for Finance majors are closed to them. Every finding cites its source.", rub:"Part 1"},
  {v:"cost", spot:"#costOut", title:"Why it matters", text:"One avoidable extra semester costs a student about $44,900 at TCU's 2026–27 cost of attendance. Change the pilot assumptions to size the impact.", rub:"Impact"}
];
let ti = -1;
function tourGo(i){
  document.querySelectorAll(".spot").forEach(n => n.classList.remove("spot"));
  if(i < 0 || i >= TOUR.length){ ti = -1; $("tour").hidden = true; document.body.classList.remove("touring"); return; }
  ti = i; const s = TOUR[i];
  show(s.v); if(s.go) s.go(); if(s.tab) BP.setTab(s.tab);
  $("tourStep").textContent = `Step ${i+1} of ${TOUR.length}`; $("tourTitle").textContent = s.title; $("tourText").textContent = s.text; $("tourRubric").textContent = s.rub;
  $("tourBack").disabled = i === 0; $("tourNext").textContent = i === TOUR.length - 1 ? "Finish" : "Next";
  $("tour").hidden = false; document.body.classList.add("touring");
  setTimeout(() => { const el = document.querySelector(`#view-${s.v} ${s.spot}`) || document.querySelector(s.spot); if(el){ el.classList.add("spot"); el.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"start"}); } }, 60);
}
$("demoBtn").onclick = () => tourGo(0);
$("tourNext").onclick = () => tourGo(ti + 1);
$("tourBack").onclick = () => tourGo(ti - 1);
$("tourX").onclick = () => tourGo(-1);
document.addEventListener("keydown", e => { if(ti < 0) return; if(e.key === "Escape") tourGo(-1); if(e.key === "ArrowRight") tourGo(ti + 1); if(e.key === "ArrowLeft") tourGo(ti - 1); });

window.BPV = {show};
const start = (location.hash || "").slice(1);
show(VIEWS.some(([k]) => k === start) ? start : "planner");
})();
