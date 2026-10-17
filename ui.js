(function(){
const D = JSON.parse(document.getElementById("catalog-data").textContent);
const STUDENTS = JSON.parse(document.getElementById("student-data").textContent);
const SAMPLE_AUDIT = document.getElementById("sample-audit").textContent;
let LIST = null; const courseList = () => LIST || (LIST = JSON.parse(document.getElementById("course-list").textContent));
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const KIND_LABEL = {req:"Required", retake:"Retake", prereq:"Prerequisite", global:"Global content", elective:"Elective", minor:"Minor / certificate", second:"Second major", core:"TCU Core", free:"Elective hours", abroad:"Abroad", ask:"Ask advisor"};
const PDFJS = window.__PDFJS_BASE || "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
let mode = "audit", audit = null, auditLabel = "", prefs = {target:null, maxCredits:15, career:"consulting"};
let st = null, R = null, activeTab = "plan", showDraft = false, sample = null;

const srcLink = ids => String(ids||"").split(/,\s*/).filter(Boolean).map(id => {
  const s = D.sources[id]; if(!s) return esc(id);
  return s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">[${esc(id)}]</a>` : `<span title="${esc(s.title)}">[${esc(id)}]</span>`;
}).join(" ");
const plural = (n, w) => `${n} ${w}${n===1?"":"s"}`;

// ---------- static form setup ----------
$("dataver").textContent = "Catalog data checked " + D.sources.S1.accessed;
Object.entries(D.catalogYears).forEach(([k,v]) => $("catalogYear").add(new Option(v.label, k)));
const termOpts = []; for(let i = termIdx("S2027"); i <= termIdx("F2031"); i++) termOpts.push(termCode(i));
termOpts.forEach(t => $("target").add(new Option(termName(t), t)));
$("abroad").add(new Option("None", ""));
["F2027","S2028","F2028"].forEach(t => $("abroad").add(new Option(termName(t), t)));
Object.entries(D.careers).forEach(([k,v]) => $("career").add(new Option(v.label, k)));
const PROGS = Object.values(D.programs);
PROGS.filter(p => p.category === "Major").forEach(p => $("major").add(new Option(p.name.replace(" (BBA)",""), p.id)));
$("major").add(new Option("Undecided", "UND"));
$("minorSel").add(new Option("None", ""));
PROGS.filter(p => p.category === "Minor" || p.category === "Certificate").forEach(p => $("minorSel").add(new Option(p.name, p.id)));
let cmpMinor = "Min-BIS";
// ---------- exam credit editor ----------
const EXR = D.exams.rows;
function fillExamNames(){
  const ty = $("exType").value; const names = [...new Set(EXR.filter(r => r.type === ty).map(r => r.exam))];
  $("exName").innerHTML = names.map(n => `<option>${esc(n)}</option>`).join(""); fillScores();
}
function fillScores(){
  const ty = $("exType").value, nm = $("exName").value;
  $("exClep").hidden = ty !== "CLEP"; $("exScore").hidden = ty === "CLEP";
  if(ty === "AP") $("exScore").innerHTML = [5,4,3,2,1].map(s => `<option>${s}</option>`).join("");
  if(ty === "IB"){ const lv = [...new Set(EXR.filter(r => r.type==="IB" && r.exam===nm).map(r => r.level||""))]; $("exScore").innerHTML = lv.flatMap(l => [7,6,5,4].map(s => `<option value="${s}|${l}">${s}${l?" "+l:""}</option>`)).join(""); }
}
$("exType").onchange = fillExamNames; $("exName").onchange = fillScores; fillExamNames();
$("exAdd").onclick = () => {
  const ty = $("exType").value, nm = $("exName").value;
  let score, level; if(ty === "CLEP") score = $("exClep").value; else [score, level] = $("exScore").value.split("|");
  if(!score) return;
  st.exams = [...(st.exams||[]).filter(e => !(e.type === ty && e.exam === nm)), {type:ty, exam:nm, score:String(score), ...(level ? {level} : {})}];
  renderExamList(); rebuild();
};
function renderExamList(){
  $("examList").innerHTML = (st.exams||[]).map((e,i) => `<span class="chip k-acc">${esc(e.type)} ${esc(e.exam)} · ${esc(e.score)}${e.level?" "+esc(e.level):""}<button type="button" data-rm="${i}" aria-label="Remove">×</button></span>`).join("") || `<span class="hint">None added.</span>`;
  $("examList").querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { st.exams.splice(+b.dataset.rm, 1); renderExamList(); rebuild(); });
}
const majorName = id => id === "UND" ? "Undecided" : (D.programs[id||"FINA"]?.name || "Finance (BBA)").replace(" (BBA)","");
const coreAll = [...D.coreSlots.distribution, ...D.coreSlots.overlay];
$("corechips").innerHTML = coreAll.map(s => `<label title="${esc(s.label)}"><input type="checkbox" value="${s.id}" id="core-${s.id}">${esc(s.id.replace(/(\d)$/, " $1"))}</label>`).join("");
$("scen").innerHTML = Object.values(STUDENTS).map(s => `<button data-id="${s.id}" aria-pressed="false">${esc(s.name)}<span>${esc(s.tag)}</span></button>`).join("");
$("scen").addEventListener("click", e => { const b = e.target.closest("button"); if(b) loadStudent(b.dataset.id); });

// ---------- loading records ----------
function markStart(which, studentId){
  ["optUpload","optSample","optFresh","optScen"].forEach(id => $(id).classList.toggle("on", id === which));
  document.querySelectorAll("#scen button").forEach(b => b.setAttribute("aria-pressed", b.dataset.id === studentId));
}
function loadAudit(a, label, which){
  mode = "audit"; audit = a; auditLabel = label; showDraft = false;
  prefs.target = a.expectedGrad && termOpts.includes(a.expectedGrad) ? a.expectedGrad : termCode(termIdx(auditStartTerm(a)) + 1);
  markStart(which, null); writeForm(); rebuild();
}
function loadStudent(id){
  mode = "catalog"; showDraft = false;
  st = JSON.parse(JSON.stringify(STUDENTS[id])); st.globalChoice = null; st.electivesOverride = null;
  markStart("optScen", id); writeForm(); rebuild();
}
$("sampleBtn").onclick = () => loadAudit(parseAudit(SAMPLE_AUDIT), "Sample audit · Riley (made-up student)", "optSample");

// ---------- first-year start (no advising report) ----------
Object.values(D.programs).filter(p => p.category === "Major").forEach(p => $("frMajor").add(new Option(p.name.replace(" (BBA)",""), p.id)));
$("frMajor").add(new Option("Undecided", "UND"));
$("frMajor").value = "UND";
const CAREER_TAGS = {consulting:["consulting"], investments:["investing"], realestate:["realestate"], international:["global"], tax:["accounting"]};
function freshmanStudent(term, major, courses, tags){
  const ti = termIdx(term), nowIdx = termIdx("F2026");
  const inProgress = ti <= nowIdx;
  const start = inProgress ? termCode(nowIdx + 1) : term;
  const lines = (courses||"").split(/\n|,|;/).map(s => s.trim().toUpperCase()).filter(Boolean)
    .map(s => { const m = s.match(/^([A-Z]{3,4})\s*(\d{5})(?:\s+(\S+))?/); return m ? `${m[1]} ${m[2]} ${inProgress ? (m[3] && m[3] !== "IP" ? m[3] : "IP") : (m[3] || "IP")}` : null; }).filter(Boolean);
  return {id:"fresh", name:"You (first year)", tag:"First year", blurb:"No advising report yet; built from your entering term and intended major.", freshman:true, year:"first",
    catalogYear:"2025-26", declared:false, startTerm:start, target:termCode(ti + 7), maxCredits:15, career:"consulting", abroad:[], minor:null, major,
    // A first-semester student is assumed to be carrying a full 15-hour load; courses not listed count as general (TCU Core) hours in progress.
    otherHours: inProgress ? Math.max(0, 15 - 3 * lines.length) : 0, assumedLoad: inProgress, otherUpper:0, otherTransfer:0, coreDone:[], exams:[], transcript:lines.join("\n"), tags: tags || []};
}
function loadFreshman(major, tags){
  mode = "catalog"; showDraft = false;
  st = freshmanStudent($("frTerm").value, major || $("frMajor").value, $("frCourses").value, tags); st.globalChoice = null; st.electivesOverride = null;
  if(major) $("frMajor").value = major;
  markStart("optFresh", null); writeForm(); activeTab = "plan"; rebuild();
}
$("frGo").onclick = () => loadFreshman();
$("frSurvey").onclick = () => window.BPV && BPV.show("survey");

function acceptAuditText(text, fileName){
  const a = parseAudit(text);
  if(!a.history.length && !a.unmet.length){
    $("uploadMsg").innerHTML = `<div class="err">This doesn't look like a TCU Academic Advising Report: no course history or requirement lines were found. Check that you saved the advising report (not the unofficial transcript) as a PDF, or paste its text below.</div>`;
    return;
  }
  $("uploadMsg").innerHTML = `<p class="hint" style="margin:0">Read ${plural(a.history.length, "course")} and ${plural(a.unmet.length, "open requirement")}.${a.identityRemoved ? " Name and student ID were discarded." : ""}</p>`;
  loadAudit(a, `Your audit${fileName ? " · " + fileName : ""}${a.reportDate ? " · dated " + a.reportDate : ""}`, "optUpload");
}
function loadScript(src){ return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("load")); document.head.appendChild(s); }); }
async function pdfToText(file){
  if(!window.pdfjsLib){ await loadScript(PDFJS + "pdf.min.js"); }
  if(!window.pdfjsWorker){ await loadScript(PDFJS + "pdf.worker.min.js"); }
  const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
  const doc = await lib.getDocument({data: await file.arrayBuffer(), isEvalSupported:false}).promise;
  const out = [];
  for(let p = 1; p <= doc.numPages; p++){
    const tc = await (await doc.getPage(p)).getTextContent();
    const rows = new Map();
    tc.items.forEach(it => { if(!it.str || !it.str.trim()) return; const y = Math.round(it.transform[5] / 2) * 2; if(!rows.has(y)) rows.set(y, []); rows.get(y).push(it); });
    [...rows.keys()].sort((a,b) => b - a).forEach(y => out.push(rows.get(y).sort((a,b) => a.transform[4] - b.transform[4]).map(i => i.str.trim()).join(" ")));
  }
  return out.join("\n");
}
async function handleFile(file){
  if(!file) return;
  $("uploadMsg").innerHTML = `<p class="hint" style="margin:0">Reading ${esc(file.name)}…</p>`;
  try { acceptAuditText(await pdfToText(file), file.name); }
  catch(e){ $("uploadMsg").innerHTML = `<div class="err">The PDF couldn't be read here. Open it, select all text, and paste it into the box below instead.</div>`; }
}
$("auditFile").onchange = e => handleFile(e.target.files[0]);
const drop = $("drop");
["dragenter","dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave","drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => handleFile(e.dataTransfer.files[0]));
$("auditPasteBtn").onclick = () => acceptAuditText($("auditPaste").value, "");

// ---------- goals + record form ----------
function writeForm(){
  const isA = mode === "audit";
  $("catGoals").hidden = isA; $("catRecord").hidden = !isA ? false : true; $("auditRecord").hidden = !isA;
  $("aiPanel").hidden = isA;
  if(isA){
    $("target").value = prefs.target; $("maxCredits").value = prefs.maxCredits; $("career").value = prefs.career;
    $("recordSummary").textContent = "Your record (from the audit)";
    const a = audit;
    $("auditRecord").innerHTML = `<dl class="kv">
      ${a.programs.length ? `<dt>Programs</dt><dd>${a.programs.map(p => esc(p.name)).join("<br>")}</dd>` : ""}
      ${a.catalogTerm ? `<dt>Requirement term</dt><dd>${esc(a.catalogTerm)}</dd>` : ""}
      ${a.expectedGrad ? `<dt>Expected grad</dt><dd>${termName(a.expectedGrad)}</dd>` : ""}
      ${a.gpa !== null ? `<dt>GPA</dt><dd>${a.gpa.toFixed(3)}</dd>` : ""}
      ${a.earned !== null ? `<dt>Hours</dt><dd>${a.earned} earned · ${a.inProg} in progress</dd>` : ""}
      <dt>Courses read</dt><dd>${a.history.length}</dd>
      <dt>Open requirements</dt><dd>${a.unmet.length}</dd>
      ${a.subs.length ? `<dt>Substitutions</dt><dd>${a.subs.map(s => esc(s.from + " → " + s.to)).join("<br>")}</dd>` : ""}
    </dl><p class="hint" style="margin:10px 0 0">Nothing from the audit leaves this page. Reload the page to clear it.</p>`;
  } else {
    $("recordSummary").textContent = st.freshman ? "Your record (first year, no advising report)" : "Your record (courses and grades)";
    $("catalogYear").value = st.catalogYear; $("target").value = st.target; $("maxCredits").value = st.maxCredits;
    $("abroad").value = (st.abroad||[])[0] || ""; $("career").value = st.career; $("declared").checked = st.declared;
    $("major").value = st.major || "FINA"; $("minorSel").value = st.minor || ""; $("allowOverlap").checked = !!st.allowOverlap; $("overlapRow").hidden = !st.minor; $("transcript").value = st.transcript;
    $("minorWho").textContent = st.minor ? (D.programs[st.minor]?.who || "") : "";
    $("otherHours").value = st.otherHours; $("otherUpper").value = st.otherUpper; $("otherTransfer").value = st.otherTransfer;
    coreAll.forEach(s => $("core-"+s.id).checked = (st.coreDone||[]).includes(s.id));
    renderExamList();
  }
  $("careerWhy").textContent = D.careers[$("career").value]?.why || "";
}
function readForm(){
  const target = $("target").value, max = Math.max(9, Math.min(18, +$("maxCredits").value || 15)), career = $("career").value;
  $("careerWhy").textContent = mode === "catalog" && !["FINA","FIRE"].includes($("major").value) ? "Career interest steers Finance electives only; other majors use the listed order." : (D.careers[career]?.why || "");
  if(mode === "audit"){ prefs = {target, maxCredits:max, career}; return; }
  st.catalogYear = $("catalogYear").value; st.target = target; st.maxCredits = max;
  st.abroad = $("abroad").value ? [$("abroad").value] : [];
  if(career !== st.career){ st.globalChoice = null; st.electivesOverride = null; }
  st.career = career; st.declared = $("declared").checked; st.minor = $("minorSel").value || null; st.major = $("major").value || "FINA"; st.allowOverlap = $("allowOverlap").checked; $("overlapRow").hidden = !st.minor;
  $("minorWho").textContent = st.minor ? (D.programs[st.minor]?.who || "") : "";
  st.transcript = $("transcript").value;
  st.otherHours = +$("otherHours").value || 0; st.otherUpper = +$("otherUpper").value || 0; st.otherTransfer = +$("otherTransfer").value || 0;
  st.coreDone = coreAll.filter(s => $("core-"+s.id).checked).map(s => s.id);
}
let tmr; document.querySelector("aside").addEventListener("input", e => {
  if(e.target.closest("#aiPanel")) return;
  clearTimeout(tmr); tmr = setTimeout(() => { readForm(); rebuild(); }, 250);
});

// ---------- compute ----------
function compute(s){
  const r = runAll(s, D);
  r.bn = bottlenecks(r.model, r.plan);
  r.alt = r.status.kind === "late" ? findAlternative(r.model, s, D) : null;
  return r;
}
function rebuild(){
  if(mode === "audit"){
    R = runAudit(audit, prefs, D); R.bn = bottlenecks(R.model, R.plan); R.other = null;
    R.sug = suggest(R, {...R.model.st, ...prefs}, D, s => runAudit(audit, {...prefs, maxCredits:s.maxCredits}, D));
    $("nowshow").innerHTML = `Showing: <b>${esc(auditLabel)}</b>`;
  } else {
    if(!st.minor && (cmpMinor === "Min-BIS" && st.major === "BIS")) cmpMinor = "Cert-Fintech";
    R = compute(st); R.other = compute({...st, minor: st.minor ? null : cmpMinor});
    R.sug = suggest(R, st, D, s => runAll(s, D));
    if(st.freshman){
      if(st.major === "UND") R.sug.unshift({id:"survey", kind:"act", pri:1, title:"Not sure which major? Take the 2-minute survey", body:"Eight quick questions rank the eight Neeley majors by fit and explain why. Pick one and this plan rebuilds around it. You declare a major after your first year with at least a 3.0 GPA.", action:{label:"Open the survey", view:"survey"}, src:"S5"});
      R.sug.push({id:"audit-later", kind:"act", pri:3, title:"Upload your advising report when you have one", body:"This plan uses the current Neeley checklist and what you entered. Once your Academic Advising Report is available in my.TCU, upload it for a plan checked against your official record.", src:"S9"});
    }
    const inv = recommendInvolvement(D, {major: st.major, second: st.second, year: studentYear(st, R.model), tags: involvementTags()}).slice(0, 2);
    inv.forEach((it, i) => R.sug.push({id:"inv-"+i, kind:"idea", pri:3, title:`Get involved: ${it.name}`, body:`${it.what} ${it.why.length ? "Suggested because it " + it.why.join(" and ") + "." : ""}${it.apply ? " Selective or application-based." : ""}`, action:{label:"See all clubs and programs", tab:"inv"}, src:it.src}));
    $("nowshow").innerHTML = st.freshman ? `Showing: <b>your first-year plan</b> · ${esc(majorName(st.major))} · started ${termName($("frTerm").value)} · no advising report yet${st.assumedLoad ? " · assumes a full 15-hour first semester" : ""}. Add AP/IB/CLEP scores under Your record.` : st.id === "audit" ? `Showing: <b>a plan built from your audit</b> using current requirements` : `Showing: <b>${esc(st.name)}</b>, a made-up ${esc(majorName(st.major))} student · ${esc(st.blurb)}`;
  }
  renderAnswer(); renderTabs();
}
const goalTarget = () => mode === "audit" ? R.model.st.target : st.target;
const goalMax = () => mode === "audit" ? R.model.st.maxCredits : st.maxCredits;

// ---------- the answer card ----------
function renderAnswer(){
  const {status, plan, model} = R;
  const first = plan.terms[0];
  const asks = plan.terms.reduce((a,t) => a + t.items.filter(i => i.kind === "ask").length, 0);
  const warns = R.val.checks.filter(c => c.status === "warn" || c.status === "fail").length;
  let kicker, h2, body = "", extra = "";
  if(status.kind === "ok"){
    kicker = "On track";
    h2 = `You can finish in ${termName(plan.grad)}`;
    const left = R.val.planned;
    body = `<p>${plural(plan.terms.length, "semester")} and ${fmt(left)} hours to go, at no more than ${goalMax()} hours a term.${asks ? ` ${plural(asks, "course")} still needs an advisor to name it.` : ""}</p>`;
  } else if(status.kind === "late"){
    kicker = "Behind your goal";
    h2 = `Projected finish is ${termName(plan.grad)}, ${plural(plan.delay, "semester")} after ${termName(goalTarget())}`;
    body = `<p>${lateReason()}</p>`;
    if(R.alt && R.alt.found){
      const pick = m => [...(m.chosen["fina-elec"]||[]), ...(m.chosen["global"]||[])].filter(x => !x.done).map(x => x.code);
      const cur = pick(R.model), nxt = pick(R.alt.model);
      const out_ = cur.filter(c => !nxt.includes(c)), in_ = nxt.filter(c => !cur.includes(c));
      const nm = c => `${c} ${D.courses[c].t}`;
      extra = `<div class="alt"><span><b>A fix that meets the same requirements:</b> take ${esc(in_.map(nm).join(" and "))} instead of ${esc(out_.map(nm).join(" and "))}. You'd finish in <b>${termName(R.alt.plan.grad)}</b>.</span><button class="btn" id="applyAlt">Use this fix</button></div>`;
    } else if(mode === "audit" || R.alt) extra = `<div class="alt">Try raising "Most hours a term", or ask an advisor about summer courses.</div>`;
  } else {
    kicker = "Talk to an advisor first";
    h2 = "This plan can't be trusted yet";
    body = `<p>The planner stopped because:</p><ul>${status.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul><p class="muted" style="font-size:.88rem">Take the summary on the <b>Before you register</b> tab to the Neeley Academic Advising Center.</p>`;
  }
  const nextList = first && status.kind !== "advisor" ? `<div class="next"><span class="lbl">Register next for ${termName(first.code)}</span><div class="list">${first.items.map(i => i.code ? `<span class="c"><span class="mono">${esc(i.code)}</span> ${esc(i.t)}</span>` : `<span class="c ${i.kind==="ask"?"ask":""}">${esc(i.t)}</span>`).join("")}</div></div>` : "";
  const facts = mode === "audit"
    ? `<div class="facts"><span>GPA <b>${model.gpa!==null?model.gpa.toFixed(2):"—"}</b></span><span>Hours earned <b>${model.hours.doneHours}</b></span><span>In progress <b>${model.hours.ipHours}</b></span><span>Open requirements <b>${model.resolutions.length}</b></span><span>Items to check <b>${warns}</b></span></div>`
    : `<div class="facts"><span>Hours done <b>${fmt(model.hours.doneHours)}</b> of ${model.rules.totalHours}</span><span>In progress <b>${fmt(model.hours.ipHours)}</b></span><span>Upper-level <b>${fmt(R.val.upper)}</b> / ${model.rules.upperHours}</span><span>Est. GPA <b>${model.gpa===null?"—":model.gpa.toFixed(2)}</b></span><span>Items to check <b>${warns}</b></span></div>`;
  const top = (R.sug||[]).slice(0, 3);
  const sugStrip = top.length && status.kind !== "advisor" ? `<div class="next"><span class="lbl">Suggestions for you</span><ul class="sugmini">${top.map(s => `<li><b>${esc(s.title)}</b></li>`).join("")}</ul><button class="btn" id="seeSug" style="justify-self:start">See all ${R.sug.length} suggestions</button></div>` : "";
  const dl = `<div class="dl"><button class="btn" id="dlCsv">Download plan (CSV)</button><button class="btn" id="copyPlan">Copy plan as text</button><span class="hint" id="dlMsg"></span></div>`;
  $("answer").innerHTML = `<div class="answer ${status.kind}"><span class="kicker">${kicker}</span><h2>${esc(h2)}</h2>${body}${extra}${nextList}${sugStrip}${facts}${dl}</div>`;
  const ss = $("seeSug"); if(ss) ss.onclick = () => { activeTab = "sug"; renderTabs(); $("tabs").scrollIntoView({behavior:"smooth", block:"start"}); };
  $("dlCsv").onclick = downloadCsv; $("copyPlan").onclick = copyPlan;
  const ab = $("applyAlt");
  if(ab) ab.onclick = () => { st.globalChoice = R.alt.global; st.electivesOverride = (R.alt.model.chosen["fina-elec"]||[]).map(x => x.code); writeForm(); rebuild(); };
}
function lateReason(){
  const top = R.bn[0]; const t = top && D.courses[top.code];
  if(top && t && t.terms.length === 1){
    const blocked = (mode === "catalog" ? st.abroad||[] : []).filter(a => a[0] === t.terms);
    return `${top.code} ${t.t} runs in ${t.terms==="F"?"fall":"spring"} only${blocked.length ? `, and you're abroad in ${termName(blocked[0])}` : ""}, so the earliest you can take it is ${termName(top.term)}.`;
  }
  return `What's left doesn't fit before ${termName(goalTarget())} at ${goalMax()} hours a term once prerequisites are in order.`;
}

// ---------- tabs ----------
let showMore = false;
const PRIMARY = ["plan","sug","whatif","inv","left","chk"];
function tabList(){
  const t = [["plan","Semester plan"],["sug","Suggestions"],["whatif","What if…"],["inv","Get involved"],["left","What's left"],["chk","Before you register"]];
  const more = [["levels","Lower & upper division"]];
  if(mode === "catalog") more.push(["exam","Exam credit"]);
  more.push(["bn","Risks"]);
  if(mode === "catalog") more.push(["cmp","Compare options"]);
  more.push(["src","Sources"]);
  if(!PRIMARY.includes(activeTab) && more.some(([k]) => k === activeTab)) showMore = true;
  return showMore ? t.concat(more) : t;
}
function renderTabs(){
  const tabs = tabList();
  if(!tabs.some(([k]) => k === activeTab)) activeTab = "plan";
  const fails = R.val.checks.filter(c => c.status === "fail").length + R.model.flags.filter(f => f.level === "advisor").length;
  $("tabs").innerHTML = tabs.map(([k,l]) => `<button role="tab" data-tab="${k}" aria-selected="${k===activeTab}">${l}${k==="chk"&&fails?`<span class="n">${fails}</span>`:""}</button>`).join("") + `<button class="more" data-more="1" aria-expanded="${showMore}">${showMore ? "Fewer tabs" : "More details"}</button>`;
  $("tabs").onclick = e => { const b = e.target.closest("button"); if(!b) return; if(b.dataset.more){ showMore = !showMore; if(!showMore && !PRIMARY.includes(activeTab)) activeTab = "plan"; renderTabs(); return; } activeTab = b.dataset.tab; renderTabs(); };
  ({plan:renderPlan, sug:renderSug, whatif:renderWhatIf, inv:renderInv, exam:renderExam, levels:renderLevels, left: mode==="audit" ? renderLeftAudit : renderLeftCat, bn:renderBn, cmp:renderCmp, chk:renderChk, src:renderSrc})[activeTab]();
}

function offerChip(it){
  if(!it.code || it.kind==="abroad") return it.ts==="choice" ? `<span class="chip" title="Any approved course works here">You pick the course</span>` : "";
  if(it.ts==="verified") return `<span class="chip k-acc" title="The official checklist says when this course runs">${it.terms==="F"?"Fall only":it.terms==="S"?"Spring only":"Fall & spring"}</span>`;
  return `<span class="chip" title="No published pattern; assumed to run every fall and spring">Usually fall & spring?</span>`;
}
function courseRow(it){
  const info = it.code ? D.courses[it.code] : null;
  const pre = (it.pre||[]).map(([pp,g]) => {
    const p = pp.split("|").find(x => R.model.recs[x]) || pp.split("|")[0];
    const r = R.model.recs[p]; const s = r ? (r.grade==="IP" ? "in progress" : r.grade==="SUB" ? "substitution on audit" : r.grade) : "planned earlier";
    return `${esc(pp.split("|").join(" or "))} (${g==="D-" ? "passing grade" : esc(g)+" or better"}; you: ${esc(s)})`;
  });
  const desc = it.code ? courseList()[it.code] : null;
  const sec = it.section ? `<span class="chip k-info" title="Sample section time, not live registration data">${esc(it.section.days)}${it.section.start?` ${esc(it.section.start)}–${esc(it.section.end)}`:""}${it.section.half?` · ${it.section.half===1?"1st":"2nd"} half`:""}</span>` : "";
  const notes = [info?.restrict ? `Restricted: ${info.restrict}.` : "", info?.regTitle ? (it.t === info.regTitle ? `The Finance checklist calls this "${info.t}".` : `Shown on the audit as "${info.regTitle}".`) : "", info?.note, it.note, info?.preConflict, info?.preNote, info?.preUnknown ? "Prerequisites aren't listed on the checklist; check the catalog." : "", info?.apply ? "Requires an application." : ""].filter(Boolean);
  const kl = it.kindLabel || KIND_LABEL[it.kind];
  return `<details class="course k-${it.kind}"><summary>
    <span class="code">${esc(it.code || "Course to be chosen")}</span><span class="cr">${fmt(it.cr)} ${it.cr===1?"hr":"hrs"}</span>
    <span class="ttl">${esc(it.t)}</span>
    <span class="tags">${it.code ? `<span class="chip" title="Course numbers starting with 3 or 4 are upper-division">${/^\D+\s?[34]/.test(it.code) ? "Upper-division" : "Lower-division"}</span>` : ""}<span class="chip ${it.kind==="retake"?"k-bad":it.kind==="ask"?"k-warn":it.kind==="minor"?"k-warn":""}">${esc(kl)}</span>${offerChip(it)}${sec}</span>
  </summary><div class="why">
    <div><b>Why it's here:</b> ${esc(it.reqLabel)} ${srcLink(it.src)}</div>
    ${pre.length ? `<div><b>Needs first:</b> ${pre.join("; ")} ${srcLink(info?.preSrc || info?.src)}${info?.preAuto ? ` <span class="chip" title="Read automatically from the course description; confirm before registering">auto-read</span>` : ""}</div>` : ""}
    ${info?.cond ? `<div><b>Also requires:</b> ${esc(info.cond)}</div>` : ""}
    ${info?.notInList ? `<div><b>Not in the TCU course list.</b> Confirm the course number with your advisor.</div>` : ""}
    ${desc ? `<details><summary style="cursor:pointer;color:var(--accent)">Course description</summary><div style="margin-top:4px">${esc(desc)} ${srcLink("S10")}</div></details>` : ""}
    ${it.conc?.length ? `<div><b>Before or with:</b> ${esc(it.conc.join(", "))}</div>` : ""}
    ${it.coreq?.length ? `<div><b>Same term as:</b> ${esc(it.coreq.join(", "))}</div>` : ""}
    ${notes.map(n => `<div>${esc(n)}</div>`).join("")}
  </div></details>`;
}
const HOW2 = `<details class="how2"><summary>How to read the plan</summary><dl>
  <dt><span class="chip">Required</span></dt><dd>Your major or the business core requires this exact course.</dd>
  <dt><span class="chip">Elective</span></dt><dd>A suggested pick from an approved list. Any course on that list works; open the course to see why it was suggested.</dd>
  <dt><span class="chip k-warn">Ask advisor</span></dt><dd>The hours are required, but your records don't say which course fills them.</dd>
  <dt><span class="chip k-acc">Fall only</span></dt><dd>The official checklist says when it runs. Missing it usually costs a year.</dd>
  <dt><span class="chip">Usually fall & spring?</span></dt><dd>No published schedule, so the planner assumes both terms. Confirm in Purple Schedule Builder.</dd>
  <dt><span class="chip k-info">MWF 9:00</span></dt><dd>Sample meeting time used to check for clashes. Not live registration data.</dd>
</dl><p class="muted" style="margin:8px 0 0">Click any course to see which requirement it fills, what it needs first, and the source.</p></details>`;
function renderPlan(){
  const {plan, status} = R;
  let h = `<p class="tabintro">Semester by semester, in an order that respects prerequisites and when courses run. Your next semester is highlighted.</p>${HOW2}`;
  const conflicts = plan.events.filter(e => e.type==="conflict");
  if(conflicts.length) h += `<div class="callout" style="margin-top:12px"><b>Time clash.</b> ${conflicts.map(e => `${esc(e.code)} meets at the same time as ${esc(e.with.join(", "))} in every ${termName(e.term)} section on file, so it moved to a later term. If another section opens, you can take it sooner.`).join(" ")}</div>`;
  if(status.kind === "advisor" && !showDraft){
    h += `<div class="section"><div class="empty">No plan is shown for this student until an advisor resolves the issues above.<br><button class="btn" id="showDraft" style="margin-top:10px">Show a draft anyway (for discussion only)</button></div></div>`;
    $("tabbody").innerHTML = h; $("showDraft").onclick = () => { showDraft = true; renderPlan(); }; return;
  }
  h += `<div class="${status.kind==="advisor"?"draft":""}"><div class="terms">` + plan.terms.map((t,ix) => `
    <article class="term ${t.abroad?"abroad":""} ${ix===0?"first":""}"><header><b>${termName(t.code)}${ix===0?" · next":""}</b><span>${fmt(t.credits)} hrs</span></header>
    ${t.items.map(i => courseRow(i)).join("")}</article>`).join("") + `</div></div>`;
  h += aiBlock("explain", "Explain my plan in plain English", "Claude writes a short explanation from the plan above. It can't add courses.");
  $("tabbody").innerHTML = h; wireAI("explain", explainPrompt);
}

function renderLeftAudit(){
  const res = R.model.resolutions; const when = {};
  R.plan.terms.forEach(t => t.items.forEach(i => { if(i.code) when[i.code] = t.code; }));
  const conf = {high:`<span class="chip k-ok">Certain</span>`, medium:`<span class="chip k-acc">Suggested</span>`, low:`<span class="chip k-warn">Ask advisor</span>`};
  let h = `<p class="tabintro">These are the lines your audit marks <b>Not Satisfied</b>, and how the plan fills each one. "Certain" means only one course fits; "Suggested" means you can swap in any approved course.</p>`;
  if(!res.length) h += `<div class="section"><div class="empty">Your audit shows no open requirements with hours still needed. Confirm with your advisor that you are cleared to graduate.</div></div>`;
  else h += `<div class="section"><div class="tablewrap"><table><thead><tr><th>Requirement on your audit</th><th>Still needed</th><th>Planned</th><th>Confidence</th></tr></thead><tbody>${res.map(r => `
    <tr><td>${esc(r.name)}<br><span class="muted" style="font-size:.8rem">${esc(r.how)}</span></td><td class="num">${fmt(r.needed)} hrs</td>
    <td>${r.picks.map(p => p.code ? `<span class="mono">${esc(p.code)}</span> ${esc(D.courses[p.code].t)}${when[p.code]?` <span class="muted">· ${termName(when[p.code])}</span>`:""}` : `<span class="muted">Course to be named by advisor</span>`).join("<br>")}</td>
    <td>${conf[r.conf]} ${srcLink(r.src)}</td></tr>`).join("")}</tbody></table></div></div>`;
  const a = R.model.audit;
  if(a.subs.length) h += `<div class="section"><h3>Substitutions already on your audit</h3><ul class="issues">${a.subs.map(s => `<li><span class="mono">${esc(s.from)}</span> counts as <span class="mono">${esc(s.to)}</span>. The plan treats ${esc(s.to)} as done.</li>`).join("")}</ul></div>`;
  const ip = a.history.filter(h => h.grade === "IP");
  if(ip.length) h += `<div class="section"><h3>In progress this term</h3><p class="muted" style="margin:0;font-size:.88rem">${ip.map(i => `<span class="mono">${esc(i.code)}</span> ${esc(i.title)}`).join(" · ")}</p></div>`;
  $("tabbody").innerHTML = h;
}

function renderLeftCat(){
  const m = R.model; const when = {};
  R.plan.terms.forEach(t => t.items.forEach(i => { if(i.code) when[i.code] = {t:t.code, kind:i.kind}; }));
  const stat = c => {
    const r = m.recs[c];
    if(when[c]) return when[c].kind==="retake" ? `<span class="chip k-bad">Retake ${termName(when[c].t)}</span>` : `<span class="chip k-acc">Planned ${termName(when[c].t)}</span>`;
    if(r && r.grade==="IP") return `<span class="chip k-info">In progress</span>`;
    if(r) return `<span class="chip k-ok">Done · ${esc(r.grade)}</span>`;
    return `<span class="chip k-bad">Not placed</span>`;
  };
  let h = `<p class="tabintro">Every ${esc(majorName(st.major))} requirement from the Neeley program data, with what's done and when the rest is planned. Courses picked from an option list are suggestions.</p>`;
  m.reqs.forEach(rq => {
    const rows = rq.courses.map(c => `<tr><td class="mono">${esc(c)}</td><td>${esc(D.courses[c].t)}</td><td class="num">${fmt(D.courses[c].cr)}</td><td>${stat(c)}</td></tr>`);
    if(rq.choose) (m.chosen[rq.choose.id]||[]).forEach(p => rows.push(`<tr><td class="mono">${esc(p.code)}</td><td>${esc(D.courses[p.code].t)} <span class="muted">· ${esc(rq.choose.label)}${p.done?"":" (suggested)"}</span></td><td class="num">${fmt(D.courses[p.code].cr)}</td><td>${stat(p.code)}</td></tr>`));
    h += `<div class="section"><h3>${esc(rq.group)} ${srcLink(rq.src)}</h3><div class="tablewrap"><table><thead><tr><th>Course</th><th>Title</th><th>Hrs</th><th>Status</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
      ${rq.choose ? `<p class="muted" style="font-size:.84rem;margin:6px 0 0">${esc(rq.choose.label)}: ${fmt(rq.choose.hrs)} hrs from ${rq.choose.options.map(esc).join(", ")}. Picks favor courses whose prerequisites you already have.</p>`:""}</div>`;
  });
  if(m.minorInfo) h += `<div class="section"><h3>${esc(m.minorInfo.label)} ${srcLink(m.minorInfo.src)}</h3><div class="tablewrap"><table><tbody>${m.minorInfo.courses.map(c=>`<tr><td class="mono">${esc(c)}</td><td>${esc(D.courses[c].t)}</td><td>${stat(c)}</td></tr>`).join("")}</tbody></table></div><p class="muted" style="font-size:.84rem">${esc(m.minorInfo.note)}</p></div>`;
  const done = new Set(st.coreDone||[]);
  h += `<div class="section"><h3>TCU Core curriculum</h3><div class="legend">${coreAll.map(s => `<span class="chip ${done.has(s.id)?"k-ok":""}">${esc(s.label)}${done.has(s.id)?" ✓":""}</span>`).join("")}</div></div>`;
  h += `<div class="section"><h3>Graduation rules applied</h3><ul class="issues">
    <li>${m.rules.totalHours} total hours, ${m.rules.upperHours} upper-level hours, ${m.rules.tcuHours} hours at TCU ${srcLink(m.rules.src)}</li>
    ${D.policies.map(p=>`<li>${esc(p.text)} ${srcLink(p.src)}</li>`).join("")}</ul></div>`;
  $("tabbody").innerHTML = h;
}

const SUG_ICON = {save:["Save time","k-ok"], act:["To do","k-acc"], warn:["Watch out","k-bad"], idea:["Opportunity","k-info"]};
function applySug(set){
  if(mode === "audit"){ if(set.maxCredits) prefs.maxCredits = set.maxCredits; }
  else Object.assign(st, set);
  writeForm(); rebuild(); activeTab = "plan"; renderTabs();
}
function renderSug(){
  const S = R.sug || [];
  let h = `<p class="tabintro">Ideas the planner found by re-running your plan different ways: finishing sooner, protecting the courses that matter most, and using spare hours well. Trying one changes the plan above; you can always undo it in Your goals.</p>`;
  if(!S.length) h += `<div class="section"><div class="empty">No suggestions right now. Your plan has no obvious savings or risks.</div></div>`;
  h += `<div class="section"><div class="checks">${S.map((s, i) => `<div class="ck ${s.kind==="warn"?"fail":s.kind==="save"?"pass":"info"}"><span class="ic">${i+1}</span><div>
    <span class="chip ${SUG_ICON[s.kind][1]}">${SUG_ICON[s.kind][0]}</span> <b>${esc(s.title)}</b> ${srcLink(s.src)}<p>${esc(s.body)}</p>
    ${s.action ? `<button class="btn" data-sug="${i}" style="margin-top:8px">${esc(s.action.label)}</button>` : ""}</div></div>`).join("")}</div></div>`;
  if(sample && mode === "catalog") h += `<div class="section"><h3>Courses that fit your goals</h3><p class="muted" style="margin:0 0 8px;font-size:.88rem;max-width:72ch">Claude picks free-elective courses from TCU's course list that you're eligible for and that match your career interest. Every pick is checked against the course list before it's shown.</p>
    <div class="field" style="max-width:520px"><label for="goalText">Anything specific you want to build toward?</label><input id="goalText" type="search" placeholder="e.g. data analytics, sports business, law school" style="width:100%;background:var(--sunk);border:1px solid var(--line);border-radius:7px;padding:7px 9px"></div>
    <button class="btn primary" id="ideasBtn">Suggest courses</button><div id="ideasOut"></div></div>`;
  $("tabbody").innerHTML = h;
  document.querySelectorAll("[data-sug]").forEach(b => b.onclick = () => { const a = S[+b.dataset.sug].action; if(a.view) return BPV.show(a.view); if(a.tab){ activeTab = a.tab; return renderTabs(); } applySug(a.set); });
  const ib = $("ideasBtn"); if(ib) ib.onclick = courseIdeas;
}
async function courseIdeas(){
  const out = $("ideasOut"), btn = $("ideasBtn");
  const L = courseList(); const recs = R.model.recs;
  const plannedCodes = new Set(R.plan.terms.flatMap(t => t.items.map(i => i.code)).filter(Boolean));
  const ok = c => { const x = D.courses[c]; if(!x) return false; return !(x.pre||[]).some(([pp]) => !pp.split("|").some(p => recs[p] || plannedCodes.has(p))); };
  const pool = Object.keys(D.courses).filter(c => !recs[c] && !plannedCodes.has(c) && !D.courses[c].restrict && !D.courses[c].apply && !D.courses[c].notInList && /^[A-Z]+ [34]/.test(c) && ok(c));
  const goal = $("goalText").value.trim() || D.careers[st.career]?.label || "";
  btn.disabled = true; out.innerHTML = `<div class="ai-out"><span class="ai-tag">Claude</span>\nThinking…</div>`;
  try{
    const res = await sample.json(`A TCU Neeley ${majorName(st.major)} student wants free-elective courses that build toward: "${goal}". Choose up to 4 courses ONLY from CANDIDATES (all are upper-division, not yet taken, and the student meets their loaded prerequisites). Reply with only JSON: [{"code":"MARK 30233","why":"one sentence on how it supports the goal"}]. Never invent codes. Frame benefits as possibilities, not guarantees.\n\nCANDIDATES:\n${pool.map(c => `${c} | ${D.courses[c].t} | ${(L[c]||"").replace(/Prerequisites?:[^.]*\.\s*/,"").slice(0,160)}`).join("\n")}`, {modelTier:"default"});
    const picks = (Array.isArray(res) ? res : []).filter(p => pool.includes(p.code)).slice(0, 4);
    const dropped = (Array.isArray(res) ? res : []).length - picks.length;
    out.innerHTML = picks.length ? `<div class="checks" style="margin-top:10px">${picks.map(p => `<div class="ck info"><span class="ic">+</span><div><b class="mono">${esc(p.code)}</b> · ${esc(D.courses[p.code].t)} <span class="chip">${fmt(D.courses[p.code].cr)} hrs</span><p>${esc(p.why)}</p></div></div>`).join("")}</div><p class="hint">Suggested by Claude from ${pool.length} eligible courses${dropped ? `; ${dropped} pick${dropped>1?"s":""} not on the list ${dropped>1?"were":"was"} discarded` : ""}. Use them in your free-elective hours; check sections before registering.</p>` : `<div class="ai-out">Claude didn't return any courses from the eligible list. Try describing your goal differently.</div>`;
  } catch(e){
    out.innerHTML = `<div class="ai-out">${e.code==="not_granted"||e.code==="sampling_disabled" ? "Claude isn't available here." : e.code==="rate_limited" ? "Claude is busy. Try again in a minute." : "Claude couldn't finish. Try again."}</div>`;
  } finally { btn.disabled = false; }
}

// ---------- clubs and programs ----------
let invKind = "all";
function involvementTags(){
  const s = mode === "catalog" ? st : null;
  if(s && s.tags && s.tags.length) return s.tags;
  return CAREER_TAGS[(s ? s.career : prefs.career)] || [];
}
function invProfile(){
  if(mode === "catalog") return {major: st.major, second: st.second, year: studentYear(st, R.model), tags: involvementTags()};
  const s = auditToStudent(audit, D); const h = audit.earned || 0;
  return {major: s.major, second: s.second, year: h < 30 ? "first" : h < 60 ? "sophomore" : h < 90 ? "junior" : "senior", tags: involvementTags()};
}
function renderInv(){
  const prof = invProfile(); const all = recommendInvolvement(D, prof);
  const list = all.filter(x => invKind === "all" || x.kind === invKind);
  const KIND = {club:"Club", program:"Program", center:"Center"};
  const tagsNow = new Set(prof.tags);
  let h = `<p class="tabintro">Clubs, Neeley programs and centers that fit your major, your interests and where you are in school. Programs are from Neeley's student-experience page ${srcLink("S14")}; club names are from TCU's official list ${srcLink("S15")}.</p>
    <div class="section"><span class="lbl">Your interests</span><div class="tagpick" style="margin-top:6px">${Object.entries(TAG_LABEL).filter(([k]) => k !== "explore").map(([k,l]) => `<label><input type="checkbox" data-tag="${k}" ${tagsNow.has(k)?"checked":""} ${mode==="audit"?"disabled":""}>${esc(l)}</label>`).join("")}</div>
    ${mode==="audit" ? `<p class="hint">Interests come from your career interest in Your goals.</p>` : `<p class="hint">Or take the <a href="#" id="invSurvey">major survey</a>; it fills these in for you.</p>`}</div>
    <div class="section"><div class="seg" role="group" aria-label="Filter">${[["all","All"],["program","Programs"],["club","Clubs"],["center","Centers"]].map(([k,l]) => `<button type="button" data-ik="${k}" aria-pressed="${invKind===k}">${l}</button>`).join("")}</div></div>
    <div class="section"><div class="inv">${list.slice(0, 18).map((x, i) => `<article class="invc">
      <div class="tags"><span class="chip ${x.kind==="program"?"k-acc":x.kind==="center"?"k-info":""}">${KIND[x.kind]}</span><span class="chip">${esc(x.when)}</span>${x.apply ? `<span class="chip k-warn">Apply / selective</span>` : ""}${i < 3 && invKind === "all" ? `<span class="chip k-ok">Top pick</span>` : ""}</div>
      <h4>${esc(x.name)}</h4><p>${esc(x.what)}</p>${x.why.length ? `<p><b style="color:var(--ink);font-weight:600">Why:</b> it ${esc(x.why.join(" and "))}.</p>` : ""}<p class="hint">${srcLink(x.src)}</p></article>`).join("") || `<div class="empty">Nothing matches that filter yet. Add an interest above.</div>`}</div></div>
    <p class="hint">${esc(D.involvement.note)}</p>`;
  $("tabbody").innerHTML = h;
  document.querySelectorAll("[data-ik]").forEach(b => b.onclick = () => { invKind = b.dataset.ik; renderInv(); });
  document.querySelectorAll("[data-tag]").forEach(c => c.onchange = () => { st.tags = [...document.querySelectorAll("[data-tag]:checked")].map(x => x.dataset.tag); R.sug = R.sug; renderInv(); });
  const sv = $("invSurvey"); if(sv) sv.onclick = e => { e.preventDefault(); BPV.show("survey"); };
}

// ---------- what if ----------
let wiKind = "major", wiTarget = null;
function wiBase(){
  if(mode === "catalog") return st;
  const s = auditToStudent(audit, D); s.maxCredits = prefs.maxCredits; s.career = prefs.career; if(prefs.target) s.target = prefs.target; return s;
}
function wiOptions(base){
  const P = Object.values(D.programs);
  if(wiKind === "major") return P.filter(p => p.category==="Major" && p.id !== (base.major||"FINA"));
  if(wiKind === "second") return P.filter(p => p.category==="Major" && p.id !== (base.major||"FINA") && p.id !== base.second);
  return P.filter(p => (p.category==="Minor"||p.category==="Certificate") && p.id !== base.minor);
}
const wiChange = id => wiKind === "major" ? {major:id} : wiKind === "second" ? {second:id} : {minor:id};
const pname = id => id === "UND" ? "Undecided" : (D.programs[id]?.name || id).replace(" (BBA)","");
function renderWhatIf(){
  const base = wiBase(); const opts = wiOptions(base);
  if(!wiTarget || !opts.some(p => p.id === wiTarget)) wiTarget = opts[0]?.id;
  const cur = `${pname(base.major||"FINA")}${base.second ? " + " + pname(base.second) : ""}${base.minor ? " + " + pname(base.minor) : ""}`;
  const w = whatIf(base, D, wiChange(wiTarget));
  const verb = wiKind === "major" ? `switch your major to ${pname(wiTarget)}` : wiKind === "second" ? `add ${pname(wiTarget)} as a second major` : `add the ${pname(wiTarget)}`;
  const chg = w.delay === 0 ? "no change to your finish date" : w.delay > 0 ? `${plural(w.delay,"semester")} later` : `${plural(-w.delay,"semester")} earlier`;
  const list = (codes, empty) => codes.length ? codes.map(c => `<div><span class="mono">${esc(c)}</span> ${esc(D.courses[c]?.t || "")}</div>`).join("") : `<div class="muted">${empty}</div>`;
  let h = `<p class="tabintro">Try a change before you commit to it. The planner rebuilds your whole plan under the new program and shows what you keep, what stops counting, and what it does to your finish date. Nothing changes in your official record.</p>`;
  if(mode === "audit") h += `<div class="callout" style="margin-top:10px">What-if uses the current Neeley program requirements${audit.catalogTerm ? `, while your audit follows the ${esc(audit.catalogTerm)} requirement term` : ""}. Treat the results as estimates and confirm with your advisor.</div>`;
  h += `<div class="section"><div class="wi-ctrl">
    <div class="seg" role="group" aria-label="Kind of change">${[["major","Switch major"],["second","Add a second major"],["minor","Add a minor or certificate"]].map(([k,l]) => `<button type="button" data-wk="${k}" aria-pressed="${wiKind===k}">${l}</button>`).join("")}</div>
    <div class="field" style="margin:0;min-width:240px"><label for="wiSel">${wiKind==="major" ? "New major" : wiKind==="second" ? "Second major" : "Minor or certificate"}</label><select id="wiSel">${opts.map(p => `<option value="${p.id}" ${p.id===wiTarget?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div>
  </div></div>`;
  h += `<div class="section"><div class="answer ${w.blockers.length ? "advisor" : w.late > 0 ? "late" : "ok"}" style="gap:12px">
    <span class="kicker">${w.blockers.length ? "Not allowed as planned" : w.late > 0 ? "Behind your goal" : "Fits your goal"}</span>
    <h2>If you ${esc(verb)}, you'd finish in ${termName(w.grad)}</h2>
    <p>${mode === "audit" ? `Under current requirements, ${esc(cur)} finishes ${termName(w.base.plan.grad)}` : `Now: ${esc(cur)}, finishing ${termName(w.base.plan.grad)}`}. With the change: <b>${chg}</b>, ${fmt(w.toGo)} hours still to take (${w.extra > 0 ? "+" + fmt(w.extra) : w.extra < 0 ? fmt(w.extra) : "same as now"}).</p>
    ${w.blockers.length ? `<ul>${w.blockers.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
    <div class="wi-cols">
      <div><span class="lbl">Still counts (${w.stillCount.length} of ${w.doneTotal} done or in progress)</span>${list(w.stillCount.filter(c => !w.newlyCount.includes(c)).slice(0,12), "None")}${w.stillCount.length > 12 ? `<div class="hint">and ${w.stillCount.length-12} more</div>` : ""}</div>
      <div><span class="lbl">Stops counting toward requirements</span>${list(w.stopCounting, "Nothing you've taken is lost.")}${w.stopCounting.length ? `<div class="hint">These still count toward your 120 hours as electives.</div>` : ""}</div>
      <div><span class="lbl">New courses you'd need</span>${list(w.added.slice(0,10), "No new named courses")}${w.added.length > 10 ? `<div class="hint">and ${w.added.length-10} more</div>` : ""}</div>
    </div>
    ${w.advisor.filter(a => !w.blockers.includes(a)).length ? `<details class="how2"><summary>${w.advisor.filter(a => !w.blockers.includes(a)).length} things to confirm with your advisor</summary><ul class="issues" style="margin-top:8px">${w.advisor.filter(a => !w.blockers.includes(a)).map(a => `<li>${esc(a)}</li>`).join("")}</ul></details>` : ""}
    <div><button class="btn primary" id="wiApply" ${w.blockers.length ? "disabled" : ""}>${mode === "audit" ? "Open this as an editable plan" : "Make this my plan"}</button></div>
  </div></div>`;
  const rows = opts.map(p => { const x = whatIf(base, D, wiChange(p.id)); return {p, x}; })
    .sort((a,b) => (a.x.blockers.length - b.x.blockers.length) || a.x.delay - b.x.delay || a.x.toGo - b.x.toGo);
  h += `<div class="section"><h3>Compare every ${wiKind==="minor" ? "minor and certificate" : "major"}</h3><div class="tablewrap"><table><thead><tr><th>${wiKind==="minor" ? "Program" : "Major"}</th><th>Finish</th><th>Change</th><th>Hours to go</th><th>New courses</th><th>Your courses that still count</th><th>Notes</th></tr></thead><tbody>
    ${rows.map(({p,x}) => `<tr class="${p.id===wiTarget?"hot":""}" data-wi="${p.id}" style="cursor:pointer"><td><b>${esc(pname(p.id))}</b></td><td>${termName(x.grad)}</td><td class="num">${x.delay===0?"same":x.delay>0?"+"+plural(x.delay,"sem"):plural(-x.delay,"sem")+" sooner"}</td><td class="num">${fmt(x.toGo)}</td><td class="num">${x.added.length}</td><td class="num">${x.stillCount.length} of ${x.doneTotal}</td><td>${x.blockers.length ? `<span class="chip k-bad">Not allowed</span>` : x.advisor.some(a => /application/.test(a)) ? `<span class="chip k-warn">Application</span>` : ""}</td></tr>`).join("")}
  </tbody></table></div><p class="hint" style="margin:6px 0 0">Click a row to see the details above.</p></div>`;
  $("tabbody").innerHTML = h;
  document.querySelectorAll("[data-wk]").forEach(b => b.onclick = () => { wiKind = b.dataset.wk; wiTarget = null; renderWhatIf(); });
  $("wiSel").onchange = e => { wiTarget = e.target.value; renderWhatIf(); };
  document.querySelectorAll("[data-wi]").forEach(r => r.onclick = () => { wiTarget = r.dataset.wi; renderWhatIf(); $("tabbody").scrollIntoView({block:"start"}); });
  $("wiApply").onclick = () => {
    const next = {...base, globalChoice:null, electivesOverride:null, ...wiChange(wiTarget)};
    if(mode === "audit"){ mode = "catalog"; st = {...next, blurb:"Built from your audit using current program requirements."}; markStart(null, null); }
    else st = next;
    writeForm(); activeTab = "plan"; rebuild();
  };
}

function renderExam(){
  const ex = R.model.exam || {credits:[], slots:[], noCredit:[]};
  const where = c => { const it = R.model.reqs.find(rq => rq.courses.includes(c) || rq.courses.some(x => (D.equivalents?.[x]||[]).includes(c)));
    return it ? it.group : D.courses[c] ? "Elective credit" : "Elective or TCU Core credit"; };
  let h = `<p class="tabintro">AP, IB and CLEP scores from high school can replace TCU courses. This is often where first-year students gain or lose the most time, so the planner shows exactly what each score earns and what it doesn't ${srcLink("S13")}.</p>`;
  if(!ex.credits.length && !ex.noCredit.length) h += `<div class="section"><div class="empty">No exam scores added. Add them under Your record → Credit by exam.</div></div>`;
  else h += `<div class="section"><div class="tablewrap"><table><thead><tr><th>Exam</th><th>TCU credit</th><th>Hours</th><th>Counts toward</th></tr></thead><tbody>
    ${ex.credits.map(c => `<tr class="${c.noCount?"hot":""}"><td>${esc(c.label)}${c.assumed ? ` <span class="chip k-warn">assumed</span>` : ""}</td><td>${c.codes.map(x => `<span class="mono">${esc(x)}</span>`).join(", ") || "—"}${c.dup.length ? `<div class="hint">Already on record: ${esc(c.dup.join(", "))}</div>` : ""}</td><td class="num">${c.noCount ? `<s>${esc(c.row.hrs)}</s>` : esc(c.row.hrs)}</td><td>${c.noCount ? "Likely won't count (see Suggestions)" : c.codes.map(x => esc(where(x))).filter((v,i,a)=>a.indexOf(v)===i).join("; ")}${c.row.core ? `<div class="hint">TCU Core: ${esc(c.row.core)}</div>` : ""}</td></tr>`).join("")}
    ${ex.noCredit.map(n => `<tr><td>${esc(n)}</td><td colspan="3" class="muted">No TCU credit at this score</td></tr>`).join("")}
    </tbody></table></div><div class="facts" style="margin-top:8px"><span>Hours counted <b>${fmt(ex.countedHours)}</b></span><span>TCU Core filled <b>${ex.slots.length ? ex.slots.join(", ") : "none"}</b></span></div></div>`;
  // exams that could still cover planned lower-division requirements
  const planned = R.plan.terms.flatMap(t => t.items.filter(i => i.code && /^[A-Z]+ [12]/.test(i.code)).map(i => ({code:i.code, t:t.code})));
  const opts = planned.map(p => ({...p, rows: EXR.filter(r => r.courses.some(c => c.code === p.code || (D.equivalents?.[p.code]||[]).includes(c.code)))})).filter(p => p.rows.length);
  if(opts.length) h += `<div class="section"><h3>Exams that would cover courses still in your plan</h3><p class="muted" style="margin:0 0 8px;font-size:.88rem">Useful before you arrive, or if you can still send a score. CLEP is open to current students only with the dean's prior approval.</p><div class="tablewrap"><table><thead><tr><th>Planned course</th><th>Exam and minimum score</th></tr></thead><tbody>
    ${opts.map(p => `<tr><td><span class="mono">${esc(p.code)}</span> ${esc(D.courses[p.code]?.t||"")}<div class="hint">Planned ${termName(p.t)}</div></td><td>${p.rows.map(r => `${esc(r.type)} ${esc(r.exam)}: ${esc(r.scoreText)}`).join("<br>")}</td></tr>`).join("")}</tbody></table></div></div>`;
  h += `<div class="section"><h3>TCU's rules for exam credit ${srcLink("S13")}</h3><ul class="issues">${D.exams.policies.filter(p => /Credit use|Grades|Advising|Level rule|Hour limit|Prior attempts|Current TCU/.test(p.topic)).map(p => `<li><b>${esc(p.topic)}:</b> ${esc(p.text)}</li>`).join("")}</ul></div>`;
  $("tabbody").innerHTML = h;
}

function renderLevels(){
  const B = levelBreakdown(R.model, R.plan);
  const up = B.L.upper, lo = B.L.lower;
  const upTot = up.done + up.ip + up.planned, loTot = lo.done + lo.ip + lo.planned;
  const met = upTot >= B.upperMin;
  const bar = (x, max) => { const w = v => Math.max(0, Math.min(100, v / max * 100)); return `<div class="bar"><i class="b1" style="width:${w(x.done)}%"></i><i class="b2" style="width:${w(x.ip)}%"></i><i class="b3" style="width:${w(x.planned)}%"></i></div>`; };
  const scale = Math.max(upTot, B.upperMin, loTot, 1);
  let h = `<p class="tabintro">TCU counts courses numbered 30000 and 40000 as upper-division and 10000 and 20000 as lower-division. A minimum number of upper-division hours is a graduation rule on its own, separate from your major. Neeley also has a set of lower-division business requirements you must finish, with a minimum GPA, before moving into a major.</p>
  <div class="section"><div class="levels">
    <div class="lvl"><div class="lvlhead"><b>Upper-division</b><span class="chip ${met?"k-ok":"k-bad"}">${met?"Minimum met by plan":"Below minimum"}</span></div>
      <div class="big">${fmt(upTot)} <small>of ${B.upperMin} required ${srcLink(B.upperSrc)}</small></div>${bar(up, scale)}
      <div class="facts"><span>Done <b>${fmt(up.done)}</b></span><span>In progress <b>${fmt(up.ip)}</b></span><span>Planned <b>${fmt(up.planned)}</b></span></div>
      ${B.auditUpper ? `<p class="hint" style="margin:6px 0 0">Your audit counts ${fmt(B.auditUpper.used)} upper-division hours used (including in-progress). The planner counts ${fmt(up.done + up.ip)} ${fmt(up.done+up.ip) === fmt(B.auditUpper.used) ? "— they match." : "— they differ; trust the audit and tell your advisor."}</p>` : ""}</div>
    <div class="lvl"><div class="lvlhead"><b>Lower-division</b><span class="chip">No maximum</span></div>
      <div class="big">${fmt(loTot)} <small>hours</small></div>${bar(lo, scale)}
      <div class="facts"><span>Done <b>${fmt(lo.done)}</b></span><span>In progress <b>${fmt(lo.ip)}</b></span><span>Planned <b>${fmt(lo.planned)}</b></span></div>
      <p class="hint" style="margin:6px 0 0">Lower-division hours count toward the 120 total but never toward the upper-division minimum.${B.unknownPlanned ? ` ${fmt(B.unknownPlanned)} planned hours have no course chosen yet, so their level is unknown.` : ""}</p></div>
  </div>
  <div class="legend" style="margin-top:8px"><span class="chip"><i class="sw b1"></i>Done</span><span class="chip"><i class="sw b2"></i>In progress</span><span class="chip"><i class="sw b3"></i>Planned</span></div></div>`;
  h += `<div class="section"><h3>Hours by semester</h3><div class="tablewrap"><table><thead><tr><th>Semester</th><th>Lower-division</th><th>Upper-division</th>${B.unknownPlanned?"<th>Not yet chosen</th>":""}</tr></thead><tbody>
    ${B.byTerm.map(t => `<tr><td>${termName(t.code)}</td><td class="num">${fmt(t.lower)}</td><td class="num">${fmt(t.upper)}</td>${B.unknownPlanned?`<td class="num">${fmt(t.unknown)}</td>`:""}</tr>`).join("")}
  </tbody></table></div></div>`;
  const gpaShown = B.auditLdrGpa ? B.auditLdrGpa.completed : B.ldrGpa;
  h += `<div class="section"><h3>${esc(D.ldr.label)} ${srcLink(D.ldr.src)}</h3>
    <p class="muted" style="margin:0 0 8px;font-size:.88rem">These must be done, with at least a ${D.ldr.gpa.toFixed(2)} GPA across them, to advance into a Neeley major ${srcLink(D.ldr.gpaSrc)}. ${gpaShown!==null && gpaShown!==undefined ? `${B.auditLdrGpa ? "Your audit shows" : "Estimated from entered grades:"} <b>${gpaShown.toFixed(2)}</b> ${gpaShown >= D.ldr.gpa ? "(meets it)." : "(below it — see an advisor)."}` : "Transfer credit (T) does not carry a grade into this GPA."}</p>
    <div class="tablewrap"><table><thead><tr><th>Course</th><th>Title</th><th>Status</th></tr></thead><tbody>
    ${B.ldr.map(x => `<tr><td class="mono">${esc(x.label)}</td><td>${esc(x.title)}</td><td>${x.grade ? (x.grade==="IP" ? `<span class="chip k-info">In progress</span>` : x.grade==="T" ? `<span class="chip k-ok">Transfer credit</span>` : x.grade==="EX" ? `<span class="chip k-ok">Exam credit (no grade)</span>` : `<span class="chip k-ok">Done · ${esc(x.grade)}</span>`) : x.planned ? `<span class="chip k-acc">Planned ${termName(x.planned)}</span>` : `<span class="chip k-bad">Not done</span>`}</td></tr>`).join("")}
    </tbody></table></div><p class="hint" style="margin:6px 0 0">${esc(D.ldr.note)}</p></div>`;
  if(mode === "catalog"){
    const when = {}; R.plan.terms.forEach(t => t.items.forEach(i => { if(i.code) when[i.code] = t.code; }));
    h += `<div class="section"><h3>Upper-division courses your degree requires ${srcLink("S12")}</h3><div class="tablewrap"><table><thead><tr><th>Course</th><th>Title</th><th>Part of</th><th>Status</th></tr></thead><tbody>
      ${B.upperReqCourses.map(x => { const r = R.model.recs[x.code]; return `<tr><td class="mono">${esc(x.code)}</td><td>${esc(D.courses[x.code].t)}</td><td>${esc(x.group)}</td><td>${when[x.code] ? `<span class="chip k-acc">Planned ${termName(when[x.code])}</span>` : r ? (r.grade==="IP" ? `<span class="chip k-info">In progress</span>` : `<span class="chip k-ok">Done · ${esc(r.grade)}</span>`) : `<span class="chip k-bad">Not placed</span>`}</td></tr>`; }).join("")}
    </tbody></table></div><p class="hint" style="margin:6px 0 0">Required courses alone add up to ${fmt(B.upperReqCourses.reduce((a,x)=>a+D.courses[x.code].cr,0))} upper-division hours; electives and free hours make up the rest of the ${B.upperMin}.</p></div>`;
  }
  $("tabbody").innerHTML = h;
}

function renderBn(){
  const bn = R.bn.filter(b => b.kind !== "free");
  const sharp = bn[0];
  let h = `<p class="tabintro">What happens if you can't get into a course in its planned term? The planner re-runs your plan without it and measures how far graduation moves.</p>`;
  if(sharp && sharp.slip > 0){
    const t = D.courses[sharp.code];
    h += `<div class="callout" style="margin-top:12px"><b>Biggest risk: ${esc(sharp.code)} ${esc(sharp.t)}</b><br>Missing it in ${termName(sharp.term)} pushes graduation back ${sharp.slip >= 99 ? "beyond the planning window" : plural(sharp.slip, "semester")}. ${t.terms.length===1 ? `It runs in ${t.terms==="F"?"fall":"spring"} only.` : ""} ${sharp.downstream.length ? `It unlocks ${sharp.downstream.join(", ")}.` : ""} Register for it as early as you can. ${srcLink(t.src)}</div>`;
  } else h += `<div class="callout" style="margin-top:12px"><b>No single course delays graduation if missed.</b> Your plan has enough room that any one course can slide a term.</div>`;
  h += `<div class="section"><div class="tablewrap"><table><thead><tr><th>Course</th><th>Planned</th><th>Runs</th><th>If you miss it</th><th>Unlocks</th></tr></thead><tbody>` +
    bn.map(b => `<tr class="${b.slip>0?"hot":""}"><td><span class="mono">${esc(b.code)}</span><br><span class="muted">${esc(b.t)}</span></td><td>${termName(b.term)}</td><td>${b.terms==="F"?"Fall only":b.terms==="S"?"Spring only":"Fall & spring"}${b.ts==="assumed"?" <span class=\"muted\">(assumed)</span>":""}</td><td class="num">${b.slip>=99?"can't place":b.slip>0?"+"+plural(b.slip,"semester"):"no delay"}</td><td>${esc(b.downstream.join(", ")||"—")}</td></tr>`).join("") + `</tbody></table></div></div>`;
  if(mode === "catalog") h += prereqFlow(sharp);
  $("tabbody").innerHTML = h;
}
function prereqFlow(sharp){
  const codes = new Set([...R.model.completed.map(c=>c.code), ...R.model.inProgress.map(c=>c.code), ...R.model.items.filter(i=>i.code).map(i=>i.code)]);
  const depth = {}; const d = c => { if(depth[c]!==undefined) return depth[c]; depth[c]=0; const info = D.courses[c]; let m = 0; (info?.pre||[]).forEach(([pp]) => pp.split("|").forEach(p => { if(codes.has(p)) m = Math.max(m, d(p)+1); })); (info?.conc||[]).forEach(p => { if(codes.has(p)) m = Math.max(m, d(p)); }); return depth[c]=m; };
  const isPreOf = c => [...codes].some(x => (D.courses[x]?.pre||[]).some(([p])=>p.split("|").includes(c)) || (D.courses[x]?.conc||[]).includes(c));
  const rel = [...codes].filter(c => D.courses[c] && ((D.courses[c].pre||[]).some(([p])=>p.split("|").some(q=>codes.has(q))) || isPreOf(c)));
  rel.forEach(d);
  const cols = []; rel.forEach(c => { (cols[depth[c]] = cols[depth[c]] || []).push(c); });
  const when = {}; R.plan.terms.forEach(t => t.items.forEach(i => { if(i.code) when[i.code] = {t:t.code,k:i.kind}; }));
  const cls = c => when[c]?.k==="retake" ? "retake" : when[c] ? "" : R.model.recs[c]?.grade==="IP" ? "ip" : "done";
  return `<div class="section"><h3>Prerequisite chain</h3><div class="legend" style="margin-bottom:8px"><span class="chip k-ok">Done</span><span class="chip k-info">In progress</span><span class="chip">Planned</span><span class="chip k-bad">Retake</span></div>
    <div class="flow">${cols.map((col,i) => `<div class="col"><h4>Step ${i+1}</h4>${col.sort().map(c => `<div class="node ${cls(c)} ${sharp&&sharp.slip>0&&sharp.code===c?"sharp":""}"><span class="mono">${esc(c)}</span><small>${esc(D.courses[c].t)}</small><small>${when[c]?termName(when[c].t):R.model.recs[c]?.grade==="IP"?"in progress":"done"}</small></div>`).join("")}</div>`).join("")}</div></div>`;
}

function summarize(r){
  return {grad:r.plan.grad, sems:r.plan.terms.length, planned:r.val.planned, heavy:Math.max(0, ...r.plan.terms.map(t=>t.credits)),
    single:r.plan.terms.reduce((a,t)=>a+t.items.filter(i=>i.code && i.terms.length===1).length,0),
    worst:Math.max(0, ...r.bn.map(b=>b.slip===99?9:b.slip)),
    assumed:r.plan.terms.reduce((a,t)=>a+t.items.filter(i=>i.code && i.ts==="assumed").length,0),
    advisor:r.model.flags.filter(f=>f.level==="advisor").length + r.val.checks.filter(c=>c.status==="fail").length,
    free:r.plan.terms.reduce((a,t)=>a+t.items.filter(i=>i.kind==="free").reduce((x,i)=>x+i.cr,0),0)};
}
function renderCmp(){
  const withM = st.minor ? R : R.other, without = st.minor ? R.other : R;
  const A = summarize(without), B = summarize(withM);
  const mid = st.minor || cmpMinor, mname = D.programs[mid]?.name || "minor", maj = majorName(st.major);
  const eflags = withM.model.flags.filter(f => f.level==="advisor" && f.text.includes(mname));
  const row = (label, a, b, better) => {
    let ca = "", cb = "";
    if(better && a !== b){ const bWins = better==="lower" ? b < a : b > a; cb = bWins ? "better":"worse"; ca = bWins ? "":"better"; }
    return `<tr><td>${label}</td><td class="num ${ca}">${a}</td><td class="num ${cb}">${b}</td></tr>`;
  };
  let h = `<p class="tabintro">Same student and rules, two paths: your major alone, and your major plus a minor or certificate ${srcLink("S12")}.</p>
  ${st.minor ? "" : `<div class="field" style="max-width:360px;margin-top:10px"><label for="cmpSel">Compare with</label><select id="cmpSel">${PROGS.filter(p => p.category==="Minor"||p.category==="Certificate").map(p => `<option value="${p.id}" ${p.id===mid?"selected":""}>${esc(p.name)}</option>`).join("")}</select><span class="hint">${esc(D.programs[mid]?.who||"")}</span></div>`}
  <div class="callout" style="margin-top:12px">${cmpSentence(A,B,mname)}${eflags.length ? `<br><br><b>Before you count on it:</b> ${eflags.map(f=>esc(f.text)).join(" ")}` : ""}</div>
  <div class="section"><div class="tablewrap"><table class="cmp"><thead><tr><th></th><th>A · ${esc(maj)} only</th><th>B · + ${esc(mname)}</th></tr></thead><tbody>
  ${row("Projected finish", termName(A.grad), termName(B.grad))}
  ${row("Semesters left", A.sems, B.sems, "lower")}
  ${row("Hours still to take", fmt(A.planned), fmt(B.planned), "lower")}
  ${row("Free elective hours left", fmt(A.free), fmt(B.free), "higher")}
  ${row("Heaviest semester", fmt(A.heavy)+" hrs", fmt(B.heavy)+" hrs")}
  ${row("Courses that run only one term", A.single, B.single, "lower")}
  ${row("Worst case if one course is missed", A.worst?"+"+plural(A.worst,"semester"):"no delay", B.worst?"+"+plural(B.worst,"semester"):"no delay", "lower")}
  ${row("Items for an advisor", A.advisor, B.advisor, "lower")}
  </tbody></table></div></div>`;
  h += aiBlock("cmp", "Explain the trade-off", "Claude compares the two paths for your goals using only the numbers above.");
  $("tabbody").innerHTML = h; wireAI("cmp", () => cmpPrompt(A,B,mname));
  const cs = $("cmpSel"); if(cs) cs.onchange = () => { cmpMinor = cs.value; rebuild(); };
}
function cmpSentence(A,B,mname){
  const dSem = termIdx(B.grad) - termIdx(A.grad);
  const parts = [dSem === 0 ? `<b>Adding the ${esc(mname)} doesn't change your finish date.</b>` : `<b>Adding the ${esc(mname)} moves your finish ${dSem>0?"later":"earlier"} by ${plural(Math.abs(dSem),"semester")}.</b>`];
  if(B.planned > A.planned) parts.push(`It adds ${fmt(B.planned - A.planned)} hours beyond the 120 you'd otherwise need.`);
  if(B.free < A.free) parts.push(`It uses ${fmt(A.free - B.free)} hours that would otherwise be free electives.`);
  if(B.worst > A.worst) parts.push(`The catch: some of its courses run in one term only, so missing one delays graduation by ${plural(B.worst,"semester")}.`);
  return parts.join(" ");
}

function renderChk(){
  const icon = {pass:"✓", warn:"!", fail:"✕", info:"i"};
  let h = `<p class="tabintro">Every plan is re-checked by rules that are separate from the planner. Anything the tool can't settle goes into the summary at the bottom for your advisor.</p>`;
  h += `<div class="section"><div class="checks">${R.val.checks.map(c => `<div class="ck ${c.status}"><span class="ic" aria-label="${c.status}">${icon[c.status]}</span><div><b>${esc(c.label)}</b> ${srcLink(c.src)}<p>${esc(c.detail)}</p></div></div>`).join("")}</div></div>`;
  const flags = R.model.flags.filter(f => f.level !== "info" || mode === "catalog");
  if(flags.length) h += `<div class="section"><h3>Questions the tool can't answer</h3><div class="checks">${flags.map(f => `<div class="ck ${f.level==="advisor"?"fail":f.level==="warn"?"warn":"info"}"><span class="ic">${f.level==="advisor"?"?":f.level==="warn"?"!":"i"}</span><div><b>${f.level==="advisor"?"Ask your advisor":f.level==="warn"?"Heads up":"Note"}</b> ${srcLink(f.src)}<p>${esc(f.text)}</p></div></div>`).join("")}</div></div>`;
  if(R.model.tx.unknown.length || R.model.tx.bad.length) h += `<div class="section"><h3>Courses the tool couldn't match</h3><ul class="issues">${R.model.tx.unknown.map(u=>`<li><span class="mono">${esc(u.line)}</span>: ${courseList()[u.code] ? "a real TCU course, but not part of the Finance requirements loaded here." : "not in TCU's course list."} The tool won't guess what it counts for; transfer credit needs an official evaluation.</li>`).join("")}${R.model.tx.bad.map(b=>`<li><span class="mono">${esc(b)}</span>: couldn't be read as a course and grade.</li>`).join("")}</ul></div>`;
  h += `<div class="section"><h3>Summary for your advisor</h3>
    <div class="handoff" id="handoff">${esc(handoffText())}</div><div style="margin-top:8px;display:flex;gap:8px;align-items:center"><button class="btn" id="copyHand">Copy summary</button><span class="muted" id="copied" style="font-size:.84rem"></span></div></div>`;
  $("tabbody").innerHTML = h;
  $("copyHand").onclick = async () => {
    try { await navigator.clipboard.writeText(handoffText()); $("copied").textContent = "Copied."; }
    catch { const r = document.createRange(); r.selectNodeContents($("handoff")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("copied").textContent = "Selected. Press Ctrl+C or ⌘C to copy."; }
  };
}
function handoffText(){
  const m = R.model, p = R.plan, L = [];
  L.push("Graduation planning summary (Graduation Blueprint prototype; not an official audit)");
  if(mode === "audit"){
    L.push(`Programs: ${m.audit.programs.map(x=>x.name).join(", ") || "from audit"} · Requirement term: ${m.audit.catalogTerm || "?"}`);
  } else L.push(`Program: ${majorName(st.major)} BBA${st.minor ? " + " + (D.programs[st.minor]?.name||"") : ""} · Catalog year: ${m.cy.label}${m.cy.verified?"":" (not loaded)"}`);
  L.push(`Goal: ${termName(goalTarget())} · Projected: ${termName(p.grad)}${R.status.kind==="advisor"?" (draft only)":""}`);
  L.push(""); L.push("Questions for my advisor:");
  let n = 1;
  R.status.reasons.forEach(r => L.push(`${n++}. The planner stopped because ${r}. What applies to me?`));
  m.tx.unknown.forEach(u => L.push(`${n++}. How does "${u.line}" transfer, and what does it count for?`));
  m.flags.filter(f=>f.level!=="info").forEach(f => L.push(`${n++}. ${f.text}`));
  if(mode === "audit") m.resolutions.filter(r=>r.conf==="medium").forEach(r => L.push(`${n++}. For "${r.name}", the plan suggests ${r.picks.filter(x=>x.code).map(x=>x.code).join(", ")}. Is that a good choice for me?`));
  R.val.checks.filter(c=>c.status==="fail" && !/catalog year/.test(c.label)).forEach(c => L.push(`${n++}. ${c.label}: ${c.detail}`));
  p.events.filter(e=>e.type==="conflict").forEach(e => L.push(`${n++}. ${e.code} clashes with ${e.with.join(", ")} in ${termName(e.term)}. Will another section open?`));
  if(n===1) L.push("1. Please confirm this plan against my official degree audit.");
  L.push(""); L.push(`Planned for ${termName(p.terms[0]?.code||"S2027")}: ${(p.terms[0]?.items||[]).map(i=>i.code||i.t).join(", ")}`);
  return L.join("\n");
}

function renderSrc(){
  let h = `<div class="section"><h3>How the tool works</h3><div class="how">
    <div><b>Rules decide</b>Requirements, prerequisites, grade minimums, fall/spring patterns, time clashes and hour minimums are computed from the data below, and every plan is re-checked independently.</div>
    <div><b>Claude explains</b>Claude turns plain-language descriptions into proposed updates and explains plans. It never adds a course: anything it returns is checked against the catalog first.</div>
    <div><b>Advisors approve</b>Substitutions, transfer credit and anything unverified go to the advisor summary. The tool never changes your registration or official record.</div></div></div>`;
  h += `<div class="section"><h3>Sources</h3><div class="tablewrap"><table><thead><tr><th>ID</th><th>Source</th><th>Owner</th><th>Used for</th><th>Checked</th></tr></thead><tbody>${Object.entries(D.sources).map(([k,s]) => `<tr><td class="mono">${k}</td><td>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`:esc(s.title)} ${s.kind!=="official"?`<span class="chip ${s.kind==="sample"?"k-warn":""}">${s.kind}</span>`:""}</td><td>${esc(s.owner)}</td><td>${esc(s.governs)}</td><td class="num">${esc(s.accessed)}</td></tr>`).join("")}</tbody></table></div></div>`;
  h += `<div class="section"><h3>Look up any TCU course</h3><div class="field" style="max-width:420px"><label for="lookup">Course code or keyword</label><input id="lookup" type="search" placeholder="e.g. FINA 30313 or derivatives" style="width:100%;background:var(--sunk);border:1px solid var(--line);border-radius:7px;padding:7px 9px"></div><div id="lookupOut" class="checks"></div></div>`;
  h += `<div class="section"><h3>Known data issues</h3><ul class="issues">${D.knownIssues.map(i => `<li>${esc(i.text)} ${srcLink(i.src)}</li>`).join("")}</ul>
    <p class="muted" style="font-size:.84rem">All catalog data sits in one block inside this page, separate from the code, so it can be updated each term without changing the planner.</p></div>`;
  $("tabbody").innerHTML = h;
  const run = () => {
    const q = $("lookup").value.trim().toUpperCase(); if(q.length < 3){ $("lookupOut").innerHTML = ""; return; }
    const L = courseList();
    const qc = q.replace(/^([A-Z]{3,4})(\d)/, "$1 $2");
    const byCode = Object.keys(L).filter(k => k.startsWith(qc));
    const hits = byCode.concat(Object.keys(L).filter(k => !byCode.includes(k) && L[k].toUpperCase().includes(q))).slice(0, 8);
    $("lookupOut").innerHTML = hits.length ? hits.map(k => `<div class="ck info"><span class="ic">i</span><div><b class="mono">${esc(k)}</b>${D.courses[k] ? ` · ${esc(D.courses[k].t)}` : ""}<p>${esc(L[k])}</p></div></div>`).join("") + `<p class="hint" style="margin:0">Showing up to 8 of ${Object.keys(L).length.toLocaleString()} courses ${srcLink("S10")}</p>` : `<p class="hint">No course matches "${esc($("lookup").value)}".</p>`;
  };
  $("lookup").addEventListener("input", run);
}

// ---------- export ----------
function planRows(){
  const rows = [["Term","Course","Title","Hours","Type","Why","Runs","Source"]];
  R.plan.terms.forEach(t => t.items.forEach(i => rows.push([termName(t.code), i.code||"", i.t, fmt(i.cr), i.kindLabel||KIND_LABEL[i.kind], i.reqLabel, i.code ? (i.terms==="F"?"Fall only":i.terms==="S"?"Spring only":"Fall & spring") + (i.ts==="assumed"?" (assumed)":"") : "", i.src||""])));
  return rows;
}
async function downloadCsv(){
  const csv = planRows().map(r => r.map(c => /[",\n]/.test(c) ? `"${String(c).replace(/"/g,'""')}"` : c).join(",")).join("\n");
  const msg = $("dlMsg");
  try {
    const dlc = window.claude ? await window.claude.use("downloads") : null;
    if(!dlc){
      if(window.claude){ msg.textContent = "Downloads aren't available here; use Copy plan instead."; return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"})); a.download = "graduation-plan.csv";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); msg.textContent = ""; return;
    }
    await dlc.save({filename:"graduation-plan.csv", data:csv}); msg.textContent = "";
  } catch(e){ msg.textContent = e && e.code === "declined" ? "" : "The download didn't start; use Copy plan instead."; }
}
async function copyPlan(){
  const text = `Graduation plan · projected finish ${termName(R.plan.grad)} (not an official audit)\n` + R.plan.terms.map(t => `\n${termName(t.code)} (${fmt(t.credits)} hrs)\n` + t.items.map(i => `  ${i.code ? i.code + " " : ""}${i.t} (${fmt(i.cr)})`).join("\n")).join("");
  try { await navigator.clipboard.writeText(text); $("dlMsg").textContent = "Copied."; }
  catch { $("dlMsg").textContent = "Copy isn't allowed here; use the advisor summary on Before you register."; }
}

// ---------- Claude ----------
function aiBlock(id, label, hint){
  if(!sample) return "";
  return `<div class="section"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn primary" id="ai-${id}">${label}</button><span class="muted" style="font-size:.84rem">${hint}</span></div><div id="ai-${id}-out"></div></div>`;
}
let ctl = null;
function wireAI(id, promptFn){
  const b = $("ai-"+id); if(!b) return;
  b.onclick = async () => {
    const out = $("ai-"+id+"-out");
    out.innerHTML = `<div class="ai-out"><span class="ai-tag">Claude</span>\nThinking…</div>`;
    const box = out.querySelector(".ai-out"); b.disabled = true;
    ctl?.abort(); ctl = new AbortController();
    try{
      await sample(promptFn(), {signal:ctl.signal, onText:({text}) => { box.innerHTML = `<span class="ai-tag">Claude</span>\n` + esc(text); }});
      box.insertAdjacentHTML("beforeend", `\n\n<span class="muted" style="font-size:.78rem">Written from the plan on this page. Check anything important against Sources or with your advisor.</span>`);
    } catch(e){
      if(e.code === "not_granted" || e.code === "sampling_disabled") box.textContent = "Claude isn't available here. The plan and checks above still apply.";
      else if(e.code !== "cancelled") box.textContent = (e.text ? e.text + "\n\n" : "") + (e.code==="rate_limited" ? "Claude is busy. Try again in a minute." : "Claude couldn't finish this answer. Try again.");
    } finally { b.disabled = false; }
  };
}
function planFacts(){
  const m = R.model;
  return JSON.stringify({
    goal:{finishBy:goalTarget(), maxHoursPerTerm:goalMax(), career:D.careers[mode==="audit"?prefs.career:st.career]?.label},
    source: mode==="audit" ? {type:"registrar degree audit", programs:m.audit.programs.map(p=>p.name), openRequirements:m.resolutions.map(r=>({name:r.name, hoursNeeded:r.needed, plannedWith:r.picks.map(p=>p.code||"advisor to name"), confidence:r.conf})), substitutions:m.audit.subs} : {type:"catalog requirements", catalogYear:m.cy.label, verified:m.cy.verified},
    status:R.status, projectedFinish:R.plan.grad,
    terms:R.plan.terms.map(t => ({term:t.code, hours:t.credits, courses:t.items.map(i => ({code:i.code, title:i.t, reason:i.reqLabel, offered:i.terms, offeringConfirmed:i.ts==="verified", source:i.src}))})),
    timeClashes:R.plan.events, biggestRisk:R.bn[0] ? {code:R.bn[0].code, semestersLostIfMissed:R.bn[0].slip} : null,
    questionsForAdvisor:m.flags.filter(f=>f.level!=="info").map(f=>f.text), checksNotPassed:R.val.checks.filter(c=>c.status==="warn"||c.status==="fail").map(c=>c.label+": "+c.detail)
  });
}
function explainPrompt(){
  return `Explain this degree plan to a TCU Neeley business student. Use ONLY the facts in DATA; do not add, rename or renumber courses, requirements, policies or dates. Cite source IDs in brackets like [S1] when you state a requirement. Career connections are options, never guarantees. Say plainly what to confirm with the Neeley Academic Advising Center. If status.kind is "advisor", say the plan is a draft that isn't valid yet and why. Second person, plain English, at most 180 words, no headings, short paragraphs. Start with what to register for next.\n\nDATA:\n${planFacts()}`;
}
function cmpPrompt(A,B){
  return `A TCU Neeley ${majorName(st.major)} student interested in "${D.careers[st.career]?.label}" is comparing two paths. A: ${majorName(st.major)} only. B: ${majorName(st.major)} plus the ${arguments[2]}. Using ONLY these numbers, explain the trade-off in at most 140 words: finish date, hours, flexibility, and the risk from one-term-only courses. Don't invent courses or requirements; career benefits are possibilities. End with one question to ask an advisor.\n\nA: ${JSON.stringify(A)}\nB: ${JSON.stringify(B)}`;
}
async function parseFree(){
  const text = $("freeText").value.trim(); const out = $("parseOut");
  if(!text){ out.innerHTML = `<div class="ai-out">Write a few sentences about your courses and goals first.</div>`; return; }
  const btn = $("parseBtn"); btn.disabled = true; out.innerHTML = `<div class="ai-out"><span class="ai-tag">Claude</span>\nReading…</div>`;
  const list = Object.entries(D.courses).map(([c,v]) => `${c} = ${v.t}${v.regTitle?` (also "${v.regTitle}")`:""}`).join("\n");
  const prompt = `Extract a TCU student's academic profile from their message. Reply with only JSON:
{"courses":[{"code":"FINA 30153","grade":"B+"}],"unmatched":["words you could not map to a code"],"career":"consulting|investments|realestate|international|tax|null","target":"S2029-style term code or null","abroad":"F2027-style term or null","maxCredits":number or null,"declared":true|false|null}
Use grade "IP" for in progress and "T" for transfer/AP. Only map a course if the words clearly match a code or title in COURSE LIST; otherwise add the words to "unmatched". Never invent codes or grades; skip a course with no grade or status. May graduation = S, December = F.
COURSE LIST:
${list}

STUDENT MESSAGE:
${text}`;
  try{
    const res = await sample.json(prompt, {modelTier:"default"});
    const valid = (res.courses||[]).filter(c => D.courses[c.code] && /^(A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|IP|T)$/.test(c.grade));
    const rejected = (res.courses||[]).filter(c => !valid.includes(c)).map(c => `${c.code} ${c.grade}`);
    const ch = valid.map(c => `Add ${c.code} ${c.grade}`);
    if(res.career && D.careers[res.career]) ch.push(`Career interest: ${D.careers[res.career].label}`);
    if(res.target && termOpts.includes(res.target)) ch.push(`Finish by: ${termName(res.target)}`);
    if(res.abroad && ["F2027","S2028","F2028"].includes(res.abroad)) ch.push(`Abroad: ${termName(res.abroad)}`);
    if(res.maxCredits) ch.push(`Most hours a term: ${res.maxCredits}`);
    if(typeof res.declared === "boolean") ch.push(`Major declared: ${res.declared?"yes":"no"}`);
    out.innerHTML = `<div class="ai-out"><span class="ai-tag">Claude suggests</span>\n${ch.length ? ch.map(esc).join("\n") : "No changes found."}${(res.unmatched||[]).length ? "\n\nCouldn't match (ask your advisor): " + res.unmatched.map(esc).join("; ") : ""}${rejected.length ? "\n\nRejected by the catalog check: " + rejected.map(esc).join("; ") : ""}</div>${ch.length?`<button class="btn" id="applyParse" style="margin-top:8px">Apply these changes</button>`:""}`;
    const ap = $("applyParse");
    if(ap) ap.onclick = () => {
      const lines = st.transcript.split("\n").filter(Boolean);
      valid.forEach(c => { const i = lines.findIndex(l => l.toUpperCase().startsWith(c.code)); const ln = `${c.code} ${c.grade}`; if(i>=0) lines[i] = ln; else lines.push(ln); });
      st.transcript = lines.join("\n");
      if(res.career && D.careers[res.career]) st.career = res.career;
      if(res.target && termOpts.includes(res.target)) st.target = res.target;
      if(res.abroad && ["F2027","S2028","F2028"].includes(res.abroad)) st.abroad = [res.abroad];
      if(res.maxCredits) st.maxCredits = Math.max(9, Math.min(18, +res.maxCredits));
      if(typeof res.declared === "boolean") st.declared = res.declared;
      writeForm(); rebuild(); ap.disabled = true; ap.textContent = "Applied";
    };
  } catch(e){
    out.innerHTML = `<div class="ai-out">${e.code==="invalid_json" ? "Claude's answer couldn't be read. Try rephrasing, or edit the fields directly." : e.code==="not_granted"||e.code==="sampling_disabled" ? "Claude isn't available here. Edit the fields directly." : e.code==="rate_limited" ? "Claude is busy. Try again in a minute." : e.code==="cancelled" ? "" : "Claude couldn't finish reading that. Try again."}</div>`;
  } finally { btn.disabled = false; }
}
$("parseBtn").onclick = () => parseFree();
$("parseBtn").disabled = true;
(async () => {
  try { sample = window.claude ? await window.claude.use("sample") : null; } catch { sample = null; }
  if(sample){ $("parseBtn").disabled = false; if(R) renderTabs(); }
  else { $("parseBtn").hidden = true; $("freeText").disabled = true; $("aiOff").hidden = false; }
})();

loadAudit(parseAudit(SAMPLE_AUDIT), "Sample audit · Riley (made-up student)", "optSample");
window.BP = {
  loadStudent, loadSample: () => $("sampleBtn").click(),
  setTab: k => { activeTab = k; if(!PRIMARY.includes(k)) showMore = true; renderTabs(); },
  setCompare: id => { cmpMinor = id; rebuild(); },
  whatIf: (k, id) => { wiKind = k; wiTarget = id; },
  useMajor: (major, tags) => { if(mode === "catalog" && st && !st.freshman && st.id !== "fresh"){ st.major = major; if(tags) st.tags = tags; writeForm(); activeTab = "plan"; rebuild(); } else loadFreshman(major, tags); },
  isStudent: () => mode === "catalog" && !!st && !st.freshman,
  applyFix: () => { const b = $("applyAlt"); if(b) b.click(); },
  state: () => ({mode, st, R})
};
})();
