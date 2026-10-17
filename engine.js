// ===== Graduation Blueprint rules engine (no DOM) =====
const GP = {"A":4,"A-":3.67,"B+":3.33,"B":3,"B-":2.67,"C+":2.33,"C":2,"C-":1.67,"D+":1.33,"D":1,"D-":0.67,"F":0};
const KIND_W = {second:8, ask:7, retake:9, prereq:9, req:8, global:6, elective:6, minor:6, core:3, free:0, abroad:0};

const alts = p => String(p).split("|");
function termIdx(c){ return (+c.slice(1))*2 + (c[0]==="F"?1:0); }
function termCode(i){ return (i%2?"F":"S") + Math.floor(i/2); }
function termName(c){ return (c[0]==="F"?"Fall ":"Spring ") + c.slice(1); }
function isUpper(code){ const m = code.match(/(\d)\d{4}$/); return !!m && +m[1] >= 3; }

function parseTranscript(text, D){
  const rows = [], unknown = [], bad = [];
  (text||"").split(/\n|;/).forEach(raw => {
    const line = raw.trim(); if(!line) return;
    const m = line.toUpperCase().match(/^([A-Z]{3,4})\s*([0-9X]{4,5})\s+([ABCDF][+-]?|IP|T|W|P)\b/);
    if(!m){ bad.push(line); return; }
    const code = m[1]+" "+m[2], g = m[3];
    if(g === "W") return; // withdrawn: no credit
    if(D.courses[code]) rows.push({code, grade:g});
    else unknown.push({code, grade:g, line});
  });
  return {rows, unknown, bad};
}

function gradeMeets(g, min){
  if(g==="IP"||g==="T"||g==="P"||g==="SUB"||g==="EX") return true;
  if(!(g in GP)) return false;
  return GP[g] >= GP[min||"D-"] && g !== "F";
}

const CORE_MAP = {NSC:["NSC1","NSC2"], SSC:["SSC3"], HUM:["HUM1","HUM2","HUM3"], FAR:["FA"], HT:["HT"], GA:["GA"], CA:["CA"], LT:["LT"], LIT:["LT"], RT:["RT"], CSV:["CSV"]};
function findExamRow(D, e){
  const rows = D.exams.rows.filter(r => r.type === e.type && r.exam === e.exam);
  const sc = +e.score;
  if(e.type === "CLEP") return rows.filter(r => sc >= r.min).sort((a,b) => b.min - a.min)[0] || null;
  const lv = r => !r.level || !e.level || r.level === e.level;
  const exact = rows.filter(r => r.any.includes(sc) && lv(r));
  if(exact.length) return exact;
  if(e.type !== "AP") return null;
  const below = rows.filter(r => lv(r) && Math.max(...r.any) < sc).sort((a,b) => Math.max(...b.any) - Math.max(...a.any));
  if(!below.length) return null;
  const top = Math.max(...below[0].any);
  return below.filter(r => Math.max(...r.any) === top).map(r => ({...r, assumed:true}));
}
function applyExams(exams, D, recs, flags, major){
  const out = {credits:[], slots:[], extraHours:0, countedHours:0, noCredit:[]};
  const used = new Set();
  exams.forEach(e => {
    let rows = findExamRow(D, e); if(rows && !Array.isArray(rows)) rows = [rows];
    const label = `${e.type} ${e.exam} (${e.score}${e.level?" "+e.level:""})`;
    if(!rows || !rows.length){ out.noCredit.push(label); return; }
    rows.forEach(row => {
      const credit = {label, row, codes:[], dup:[], noCount:false, assumed:!!row.assumed};
      if(row.assumed) flags.push({level:"info", text:`TCU's table lists ${e.exam} only for a score of ${row.scoreText}; the planner assumes your ${e.score} earns the same credit. Confirm with your advisor.`, src:"S13"});
      row.courses.forEach(c => {
        if(recs[c.code] && recs[c.code].grade !== "EX"){ credit.dup.push(c.code); return; }
        recs[c.code] = {code:c.code, grade:"EX", exam:label}; credit.codes.push(c.code);
      });
      const knownCr = credit.codes.filter(c => D.courses[c]).reduce((a,c) => a + (D.courses[c].cr||0), 0);
      if(credit.codes.includes("MATH 10043") && major){
        credit.noCount = true; recs["MATH 10043"].noCount = true;
        flags.push({level:"advisor", text:`${label} gives MATH 10043 Elementary Statistics, but business majors must take INSC 20153 Statistical Analysis, and TCU does not give credit for both. Expect these ${row.hrs} hours not to count once you take INSC 20153.`, src:"S13, S10"});
      } else {
        out.extraHours += Math.max(0, (+row.hrs||0) - knownCr);
        out.countedHours += +row.hrs || 0;
      }
      if(credit.dup.length) flags.push({level:"warn", text:`${label} duplicates ${credit.dup.join(", ")} already on your record. TCU does not award duplicate credit.`, src:"S13"});
      String(row.core||"").split(/[,()\s]+/).forEach(tok => {
        const t = tok.trim().toUpperCase(); const slots = CORE_MAP[t]; if(!slots) return;
        if(t === "SSC" && credit.codes.some(c => c.startsWith("ECON"))) return;
        const free = slots.find(s => !used.has(s)); if(free){ used.add(free); out.slots.push(free); }
      });
      out.credits.push(credit);
    });
  });
  if(out.countedHours > 66) flags.push({level:"warn", text:`You list ${out.countedHours} hours of exam credit; TCU awards exam credit only within your first 66 hours.`, src:"S13"});
  if(out.noCredit.length) flags.push({level:"info", text:`No TCU credit for: ${out.noCredit.join(", ")} (score below TCU's minimum).`, src:"S13"});
  return out;
}
function blockedByRestriction(code, D, recs, depth=0){
  const c = D.courses[code]; if(!c || depth > 4) return false;
  if(recs && recs[code]) return false;
  if(c.restrict) return true;
  return (c.pre||[]).some(([pp]) => alts(pp).every(p => blockedByRestriction(p, D, recs, depth+1)));
}
function programReqs(D, pid){
  const p = D.programs[pid]; if(!p) return [];
  const src = pid === "FINA" ? "S1, S12" : "S12";
  const out = [];
  p.sections.forEach((s, si) => {
    const rq = {group: s.name, src, courses: [], asks: []};
    out.push(rq);
    s.items.forEach((it, ii) => {
      if(it.type === "req"){
        if(it.code && it.code.includes("|")) rq.courses.push(it.code.split("|")[0]);
        else if(it.code && D.courses[it.code]) rq.courses.push(it.code);
        else rq.asks.push({label: it.title || it.label, hrs: +it.hrs || 3, note: it.note || "Course code not available in the loaded sources."});
      } else if(it.type === "choose"){
        let id = `${pid}-${si}-${ii}`;
        if(pid === "FINA" && /FINA elective/i.test(it.name||"")) id = "fina-elec";
        if(pid === "FINA" && /Global/i.test(it.name||"")) id = "global";
        const options = it.options.map(o => o.code && o.code.split("|")[0]).filter(c => c && D.courses[c] && it.options.find(o=>o.code&&o.code.startsWith(c)).hrs);
        const ch = {id, label: it.name && !/^Choose/.test(it.name) ? it.name : (it.label||"Choice").replace(/ from options below.*/,""), hrs: +it.hrs || 3, options};
        if(rq.choose) out.push({group: s.name, src, courses: [], asks: [], choose: ch}); else rq.choose = ch;
      }
    });
  });
  return out;
}
function eligibilityFlags(mp, major, flags){
  const who = (mp.who || "") + " " + (mp.notes||[]).join(" ");
  const subj = {"Min-Finance":["FINA","FIRE"], "Min-Accounting":["ACCT"], "Min-BIS":["BIS"], "Min-Leadership":["MANA"]}[mp.id] || [];
  if(/non-business majors only/i.test(who)) flags.push({level:"advisor", text:`${mp.name} is for non-business majors only, so a Neeley major can't add it.`, src:"S12"});
  if(subj.includes(major)) flags.push({level:"advisor", text:`${mp.name} is for students in another major; it can't be added to your own major.`, src:"S12"});
  if(/appl(y|ication)/i.test(who)) flags.push({level:"advisor", text:`${mp.name} requires an application before you can take its courses.`, src:"S12"});
}
function buildModel(st, D, opt={}){
  const cy = D.catalogYears[st.catalogYear];
  const rules = cy.verified ? cy : D.catalogYears["2025-26"];
  opt = {global: st.globalChoice || undefined, electives: st.electivesOverride || undefined, ...opt};
  const tx = parseTranscript(st.transcript, D);
  const flags = []; // {level:'advisor'|'warn'|'info', text, src}
  const recs = {};
  tx.rows.forEach(r => { const prev = recs[r.code]; if(!prev || (GP[r.grade]??5) > (GP[prev.grade]??-1) || r.grade==="IP") recs[r.code] = r; });
  const exam = applyExams(st.exams || [], D, recs, flags, st.major || "FINA");

  // which courses will be planned (requirements)
  const need = [];
  const major = st.major || "FINA";
  const reqs = major === "UND"
    ? programReqs(D, "FINA").filter(rq => /Lower-Division|Business Core/i.test(rq.group)).concat([{group:"Lower-Division Business Requirements", src:"S12", courses:["ECON 10233"], asks:[]}])
    : programReqs(D, major);
  if(major === "UND") flags.push({level:"info", text:"No major chosen yet. The plan covers the lower-division requirements and business core every Neeley major shares; major courses appear once you pick one. Try the major survey.", src:"S12"});
  const elecPref = (opt.electives) || D.careers[st.career]?.electives || [];
  const chosen = {};
  const pickChoose = (rq, kindFor) => {
    const ch = rq.choose, crOf = c => D.courses[c]?.cr || 3;
    const done = ch.options.filter(o => recs[o] && gradeMeets(recs[o].grade,"D-"));
    const picks = []; let hrs = 0;
    done.forEach(c => { if(hrs < ch.hrs - 0.001){ picks.push({code:c, done:true}); hrs += crOf(c); } });
    let pref;
    if(ch.id === "global") pref = opt.global ? [opt.global] : (st.career==="international" ? ["FINA 40623","BUSI 30383"] : ["BUSI 30383","FINA 40623"]);
    else pref = (["FINA","FIRE"].includes(major) ? elecPref : []).concat(ch.options);
    pref = pref.filter(o => ch.options.includes(o) && D.courses[o] && !D.courses[o].apply && !D.courses[o].permit && !D.courses[o].notInList && !blockedByRestriction(o, D, recs));
    const planned = new Set(need.map(n => n.code));
    const missingPre = o => (D.courses[o].pre||[]).filter(([pp]) => !alts(pp).some(x => recs[x] || planned.has(x))).length;
    pref = [...new Set(pref)].map((o, i) => ({o, i, m: missingPre(o)})).sort((a,b) => a.m - b.m || a.i - b.i).map(x => x.o);
    for(const o of pref){
      if(hrs >= ch.hrs - 0.001) break;
      if(picks.find(p=>p.code===o) || need.some(n=>n.code===o)) continue;
      if(ch.id==="global" && chosen["fina-elec"]?.find(p=>p.code===o)) continue;
      picks.push({code:o, done:false}); hrs += crOf(o);
    }
    chosen[ch.id] = picks;
    picks.forEach(p => need.push({code:p.code, kind:kindFor(ch), reqLabel: rq.group + " · " + ch.label, src:rq.src, choose:ch.id}));
    if(hrs < ch.hrs - 0.001) need.push({ask:true, cr:ch.hrs - hrs, reqLabel: rq.group + " · " + ch.label, src:rq.src, note:"No listed option could be planned automatically."});
  };
  reqs.forEach(rq => {
    rq.courses.forEach(c => need.push({code:c, kind:"req", reqLabel:rq.group, src:rq.src}));
    (rq.asks||[]).forEach(a => need.push({ask:true, cr:a.hrs, reqLabel:rq.group + " · " + a.label, src:rq.src, note:a.note}));
    if(rq.choose) pickChoose(rq, ch => ch.id==="global" ? "global" : "elective");
  });
  if(chosen["fina-elec"]?.find(p=>p.code==="FINA 40623") || chosen["global"]?.find(p=>p.code==="FINA 40623"))
    flags.push({level:"advisor", text:"FINA 40623 is listed as both a finance elective and a global-content option. Ask whether it can count for both; if so you save 3 hours.", src:"S1"});
  if(st.career === "realestate" && major === "FINA") flags.push({level:"advisor", text:"Real-estate electives require FINA 30313, which is limited to Finance with a Real Estate Concentration majors. Ask about switching to that concentration if real estate is your goal.", src:"S10"});
  if(need.some(n => n.code==="MANA 30350")) flags.push({level:"warn", text:"Your checklist lists Strategy as MANA 30350, but the TCU course list has no MANA 30350; Strategy appears there as MANA 40250. Confirm the number before registering.", src:"S1, S10, S12"});
  let secondInfo = null;
  if(st.second && D.programs[st.second] && st.second !== major){
    const sp = D.programs[st.second];
    const before2 = new Set(need.map(n => n.code).filter(Boolean)); const shared = [];
    programReqs(D, st.second).filter(rq => /major|associated/i.test(rq.group)).forEach(rq => {
      const grp = `${sp.name.replace(" (BBA)","")} (second major) · ${rq.group}`;
      rq.courses.forEach(c => { if(before2.has(c)) shared.push(c); need.push({code:c, kind:"second", reqLabel:grp, src:rq.src}); });
      (rq.asks||[]).forEach(a => need.push({ask:true, cr:a.hrs, reqLabel:grp + " · " + a.label, src:rq.src, note:a.note}));
      if(rq.choose) pickChoose({...rq, group: grp}, () => "second");
    });
    secondInfo = {id:st.second, label:sp.name, shared};
    if(["FINA","FIRE"].includes(major) && ["FINA","FIRE"].includes(st.second)) flags.push({level:"advisor", text:`Finance and Finance with a Real Estate Concentration are the same major with different concentrations, so they can't be combined as a double major.`, src:"S12"});
    if(shared.length) flags.push({level:"advisor", text:`${shared.join(", ")} ${shared.length===1?"is":"are"} required by both majors. The plan counts ${shared.length===1?"it":"them"} once for both; confirm the double-major overlap rules with your advisor.`, src:"S12"});
    flags.push({level:"info", text:`Both majors share the lower-division requirements and business core, so the second major adds only its own major and associated courses.`, src:"S12"});
  }
  let minorInfo = null;
  if(st.minor && D.programs[st.minor]){
    const mp = D.programs[st.minor];
    const mreqs = programReqs(D, st.minor);
    const before = new Set(need.map(n => n.code).filter(Boolean));
    const overlap = [];
    mreqs.forEach(rq => {
      rq.courses.forEach(c => { if(before.has(c)) overlap.push(c); need.push({code:c, kind:"minor", reqLabel:mp.name, src:rq.src}); });
      (rq.asks||[]).forEach(a => need.push({ask:true, cr:a.hrs, reqLabel:mp.name + " · " + a.label, src:rq.src, note:a.note}));
      if(rq.choose) pickChoose({...rq, group: mp.name}, () => "minor");
    });
    minorInfo = {id:st.minor, label:mp.name, src:"S12", note:mp.who, courses:need.filter(n => n.kind==="minor" || n.reqLabel?.startsWith(mp.name)).map(n=>n.code).filter(Boolean), overlap};
    eligibilityFlags(mp, major, flags, null);
    if(overlap.length && !st.allowOverlap){
      overlap.forEach(c => need.push({ask:true, askKind:"overlap", cr:D.courses[c]?.cr || 3, reqLabel:`${mp.name} · replaces ${c}`, src:"S12", note:`${c} already counts toward your major. Until an advisor confirms it may count twice, the plan reserves another course for the minor.`}));
      flags.push({level:"advisor", text:`${overlap.join(", ")} ${overlap.length===1?"is":"are"} required by both your major and the ${mp.name}. TCU's double-counting rules aren't loaded, so the plan adds ${overlap.length} replacement course${overlap.length===1?"":"s"} for the minor. If your advisor confirms they can count twice, turn on "Let minor courses also count toward my major."`, src:"S12"});
    }
    if(overlap.length && st.allowOverlap) flags.push({level:"advisor", text:`${overlap.join(", ")} ${overlap.length===1?"counts":"count"} toward both your major and the ${mp.name}, as you chose. Confirm with your advisor that double-counting is allowed.`, src:"S12"});
  }
  // completion + retakes
  const items = []; const completed = []; const inProgress = [];
  const minRequired = {}; // code -> strictest min grade as prereq
  Object.entries(D.courses).forEach(([c,info]) => (info.pre||[]).forEach(([pp,g]) => alts(pp).forEach(p => { if(!minRequired[p] || GP[g] > GP[minRequired[p]]) minRequired[p] = g; })));
  const seen = new Set();
  function addItem(code, kind, reqLabel, src){
    if(seen.has(code)) return; seen.add(code);
    const eq = !recs[code] && (D.equivalents?.[code]||[]).find(x => recs[x]);
    const r = recs[code] || (eq ? {...recs[eq], via:eq} : null), info = D.courses[code];
    if(r && r.grade === "IP"){ inProgress.push({code, reqLabel}); return; }
    if(r && gradeMeets(r.grade, "D-")){
      const mr = minRequired[code];
      const dependentPlanned = mr && GP[r.grade] < GP[mr];
      if(!dependentPlanned){ if(r.via) seen.add(r.via); completed.push({code: r.via || code, grade:r.grade, reqLabel}); return; }
      flags.push({level:"warn", text:`${code} earned ${r.grade}, below the ${mr} that later courses require. The plan schedules a retake.`, src:info.src});
      kind = "retake";
    } else if(r && r.grade === "F"){ kind = "retake"; }
    items.push({key:code, code, t:info.t, cr:info.cr, upper:isUpper(code), kind, reqLabel, src:src||info.src,
      pre:info.pre||[], conc:info.conc||[], coreq:info.coreq||[], terms:info.terms, ts:info.ts});
  }
  let askN = 0;
  need.forEach(n => {
    if(n.ask){ items.push({key:"ASKP-"+(++askN), code:null, askKind:n.askKind, ...(n.askKind==="overlap" ? {kindLabel:"Minor replacement"} : {}), t: n.askKind==="overlap" ? `Extra ${n.reqLabel.split(" · ")[0]} course (${n.reqLabel.split(" · ").pop()})` : n.reqLabel.split(" · ").pop() + " (course to be confirmed)", cr:n.cr, upper:false, kind:"ask", reqLabel:n.reqLabel, src:n.src, pre:[], conc:[], coreq:[], terms:"FS", ts:"choice", note:n.note}); return; }
    addItem(n.code, n.kind, n.reqLabel, n.src);
  });
  // prerequisite closure
  for(let guard=0; guard<5; guard++){
    let added = false;
    items.slice().forEach(it => it.pre.forEach(([pp]) => {
      if(alts(pp).some(x => seen.has(x) && (items.some(i=>i.code===x) || recs[x]))) return;
      const hit = alts(pp).find(x => recs[x] && gradeMeets(recs[x].grade, "D-"));
      const p = hit || alts(pp)[0];
      if(seen.has(p) || !D.courses[p]) return;
      const r = recs[p];
      if(r && gradeMeets(r.grade, "D-")) { seen.add(p); completed.push({code:p, grade:r.grade, reqLabel:"Prerequisite"}); return; }
      addItem(p, "prereq", "Prerequisite for " + it.code); added = true;
    }));
    if(!added) break;
  }
  const exPre = items.filter(it => it.pre.some(([pp,g]) => g !== "D-" && alts(pp).some(p => recs[p]?.grade === "EX")));
  if(exPre.length) flags.push({level:"advisor", text:`Exam credit has no letter grade. ${exPre.map(i => i.code).join(", ")} require${exPre.length===1?"s":""} a C- or better in a course you earned by exam; confirm TCU accepts exam credit for ${exPre.length===1?"that prerequisite":"those prerequisites"}.`, src:"S13, S10"});
  // in-progress records not tied to requirements still count
  Object.values(recs).forEach(r => { if(!seen.has(r.code)){ seen.add(r.code); if(r.grade==="IP") inProgress.push({code:r.code, reqLabel:"Other"}); else if(gradeMeets(r.grade,"D-")) completed.push({code:r.code, grade:r.grade, reqLabel:"Other"}); } });

  // TCU core placeholders
  const coreDone = new Set([...(st.coreDone||[]), ...exam.slots]);
  const plannedCodes = new Set(items.map(i=>i.code));
  const overlayCovered = new Set();
  [...plannedCodes, ...completed.map(c=>c.code), ...inProgress.map(c=>c.code)].forEach(c => { const k = D.courses[c]?.core; if(k && k!=="SSC") overlayCovered.add(k); });
  const distLeft = D.coreSlots.distribution.filter(s => !coreDone.has(s.id));
  const overLeft = D.coreSlots.overlay.filter(s => !coreDone.has(s.id) && !overlayCovered.has(s.id));
  distLeft.forEach((s,i) => {
    const ov = overLeft[i];
    items.push({key:"CORE-"+s.id, code:null, t:"TCU Core: " + s.label + (ov ? " + " + ov.label : ""), cr:3, upper:false, kind:"core",
      reqLabel:"TCU Core curriculum", src: ov ? "S8" : "S1", pre:[], conc:[], coreq:[], terms:"FS", ts:"choice",
      note: ov ? "Pick a course tagged for both categories (Neeley sample plans pair them, e.g. 'Humanities / LT')." : "Pick any approved course in this category."});
  });
  overLeft.slice(distLeft.length).forEach(ov => items.push({key:"CORE-"+ov.id, code:null, t:"TCU Core: " + ov.label, cr:3, upper:false, kind:"core",
    reqLabel:"TCU Core curriculum", src:"S1", pre:[], conc:[], coreq:[], terms:"FS", ts:"choice", note:"May overlap with a major course; ask your advisor."}));
  if(overLeft.length) flags.push({level:"info", text:"TCU Core overlay categories are planned as overlaps with distribution courses where possible. Overlap rules are not fully modeled; this can overstate or understate hours.", src:"S8"});

  // hours
  const cr = c => D.courses[c]?.cr || 0;
  const transferCodes = new Set(tx.rows.filter(r=>r.grade==="T").map(r=>r.code));
  const doneHours = completed.reduce((a,c)=>a+(recs[c.code]?.grade==="EX" && recs[c.code]?.noCount ? 0 : cr(c.code)),0) + (+st.otherHours||0) + exam.extraHours;
  const doneUpper = completed.filter(c=>isUpper(c.code)).reduce((a,c)=>a+cr(c.code),0) + (+st.otherUpper||0);
  const doneTransfer = completed.filter(c=>transferCodes.has(c.code)).reduce((a,c)=>a+cr(c.code),0) + (+st.otherTransfer||0) + exam.countedHours;
  const ipHours = inProgress.reduce((a,c)=>a+cr(c.code),0);
  const ipUpper = inProgress.filter(c=>isUpper(c.code)).reduce((a,c)=>a+cr(c.code),0);
  const abroadTerms = (st.abroad||[]).filter(t => termIdx(t) >= termIdx(st.startTerm));
  const abroadHours = abroadTerms.length * 12;
  abroadTerms.forEach(t => items.push({key:"ABROAD-"+t, code:null, t:"Study abroad credit (assumed 12 hrs)", cr:12, upper:false, kind:"abroad", reqLabel:"Transfer credit, applicability unverified", src:"", pre:[], conc:[], coreq:[], terms:t[0], ts:"assumed", fixedTerm:t}));
  if(abroadTerms.length) flags.push({level:"advisor", text:`Study abroad in ${abroadTerms.map(termName).join(", ")}: the plan assumes 12 transfer hours per term count as electives. Confirm course approvals before you go.`, src:""});
  const plannedReq = items.filter(i=>i.kind!=="abroad").reduce((a,i)=>a+i.cr,0);
  const plannedUpper = items.filter(i=>i.upper).reduce((a,i)=>a+i.cr,0);
  let freeNeed = Math.max(0, rules.totalHours - (doneHours + ipHours + plannedReq + abroadHours));
  let upperGap = Math.max(0, rules.upperHours - (doneUpper + ipUpper + plannedUpper));
  freeNeed = Math.max(freeNeed, upperGap);
  let n = 0;
  while(freeNeed > 0.001){
    const h = Math.min(3, freeNeed); const up = upperGap > 0.001; upperGap -= up ? h : 0; freeNeed -= h; n++;
    items.push({key:"FREE-"+n, code:null, t: up ? "Upper-level elective (30000+)" : "Free elective", cr:h, upper:up, kind:"free",
      reqLabel: up ? "Upper-level hours minimum" : "Hours to reach " + rules.totalHours, src:rules.src, pre:[], conc:[], coreq:[], terms:"FS", ts:"choice",
      note: up ? `Needed to reach ${rules.upperHours} upper-level hours.` : "Any course; a chance to add career-related coursework."});
  }

  // GPA (estimate from entered letter grades)
  const graded = tx.rows.filter(r => r.grade in GP);
  const gpa = graded.length ? graded.reduce((a,r)=>a+GP[r.grade]*cr(r.code),0) / graded.reduce((a,r)=>a+cr(r.code),0) : null;
  const majorRows = graded.filter(r => D.majorGpaPrefixes.some(p => r.code.startsWith(p)));
  const majorGpa = majorRows.length ? majorRows.reduce((a,r)=>a+GP[r.grade]*cr(r.code),0)/majorRows.reduce((a,r)=>a+cr(r.code),0) : null;

  return {secondInfo, needCodes: need.map(n => n.code).filter(Boolean), exam, reqs, st, D, cy, rules, tx, recs, items, completed, inProgress, chosen, flags, minorInfo, gpa, majorGpa,
    hours:{doneHours, doneUpper, doneTransfer, ipHours, ipUpper, abroadHours}};
}

function chainLengths(items){
  const byCode = {}; items.forEach(i => { if(i.code) byCode[i.code] = i; });
  const memo = {};
  function len(code){
    if(memo[code] !== undefined) return memo[code];
    memo[code] = 0;
    let best = 0;
    items.forEach(j => { if(j.code && (j.pre.some(([p])=>alts(p).includes(code)) || j.conc.includes(code))) best = Math.max(best, 1 + len(j.code)); });
    return memo[code] = best;
  }
  const out = {}; items.forEach(i => out[i.key] = i.code ? len(i.code) : 0); return out;
}

function timesOverlap(a, b){
  if(!a.start || !b.start) return false;
  if(a.half && b.half && a.half !== b.half) return false;
  const da = new Set(a.days.match(/TR|T|R|M|W|F/g)), db = new Set(b.days.match(/TR|T|R|M|W|F/g));
  const expand = s => { const o = new Set(); s.forEach(x => x==="TR" ? (o.add("T"),o.add("R")) : o.add(x)); return o; };
  const A = expand(da), B = expand(db); let share = false; A.forEach(d => { if(B.has(d)) share = true; });
  if(!share) return false;
  return a.start < b.end && b.start < a.end;
}

function schedule(model, opt={}){
  const {st, D} = model;
  const items = model.items.map(i => ({...i}));
  const chain = chainLengths(items);
  const retakes = new Set(items.filter(i=>i.kind==="retake").map(i=>i.code));
  const planned = new Set();
  const okBefore = (pp, g) => alts(pp).some(p => okOne(p, g));
  const okOne = (p, g) => {
    if(planned.has(p)) return true;
    if(retakes.has(p)) return false;
    const r = model.recs[p];
    return r ? gradeMeets(r.grade, g) : false;
  };
  const remaining = new Set(items.map(i=>i.key));
  const terms = []; const events = [];
  const start = termIdx(st.startTerm);
  const forbid = opt.forbid || {};
  for(let ti = start; ti < start + 14 && remaining.size; ti++){
    const tc = termCode(ti);
    const term = {code:tc, items:[], credits:0, abroad:false};
    const fixed = items.filter(i => remaining.has(i.key) && i.fixedTerm === tc);
    if(fixed.length){ fixed.forEach(i => { term.items.push(i); term.credits += i.cr; remaining.delete(i.key); }); term.abroad = true; terms.push(term); continue; }
    const placedHere = new Set();
    const usedSections = []; // {code, sec}
    const tryAdd = (it) => {
      if(term.credits + it.cr > st.maxCredits + 0.001) return false;
      if(D.sections && tc === D.sectionTerm && it.code){
        const secs = D.sections[it.code];
        if(secs){
          const ok = secs.find(s => !usedSections.some(u => !(it.coreq.includes(u.code)) && timesOverlap(s, u.sec)));
          if(!ok){
            const clash = usedSections.filter(u => secs.some(s => timesOverlap(s, u.sec))).map(u=>u.code);
            events.push({type:"conflict", term:tc, code:it.code, with:clash});
            return false;
          }
          it.section = ok; usedSections.push({code:it.code, sec:ok});
        } else it.section = null;
      }
      term.items.push(it); term.credits += it.cr; placedHere.add(it.code||it.key); remaining.delete(it.key);
      return true;
    };
    for(let pass=0; pass<3; pass++){
      const cands = items.filter(i => remaining.has(i.key) && !i.fixedTerm && i.terms.includes(tc[0]) && forbid[i.code] !== tc)
        .filter(i => i.pre.every(([p,g]) => okBefore(p,g)))
        .filter(i => i.conc.every(c => okBefore(c,"D-") || alts(c).some(x => placedHere.has(x))))
        .sort((a,b) => {
          const sa = (chain[a.key]||0)*10 + KIND_W[a.kind] + (a.terms.length===1?3:0);
          const sb = (chain[b.key]||0)*10 + KIND_W[b.kind] + (b.terms.length===1?3:0);
          return sb - sa;
        });
      let any = false;
      for(const it of cands){
        if(!remaining.has(it.key)) continue;
        if(it.coreq.length){
          const partners = it.coreq.map(c => items.find(x=>x.code===c && remaining.has(x.key))).filter(Boolean);
          const tot = it.cr + partners.reduce((a,p)=>a+p.cr,0);
          if(term.credits + tot > st.maxCredits + 0.001) continue;
          if(!partners.every(p => p.terms.includes(tc[0]) && p.pre.every(([q,g]) => okBefore(q,g)))) continue;
          if(tryAdd(it)){ partners.forEach(p => tryAdd(p)); any = true; }
        } else if(tryAdd(it)) any = true;
      }
      if(!any) break;
    }
    term.items.forEach(i => { if(i.code) planned.add(i.code); });
    terms.push(term);
  }
  while(terms.length && !terms[terms.length-1].items.length) terms.pop();
  const leftovers = items.filter(i => remaining.has(i.key));
  const grad = terms.length ? terms[terms.length-1].code : st.startTerm;
  return {terms, grad, leftovers, events, delay: termIdx(grad) - termIdx(st.target)};
}

function bottlenecks(model, plan){
  const out = [];
  plan.terms.forEach(t => t.items.forEach(it => {
    if(!it.code || it.kind==="abroad") return;
    const alt = schedule(model, {forbid:{[it.code]: t.code}});
    const slip = (alt.leftovers.length ? 99 : termIdx(alt.grad) - termIdx(plan.grad));
    const downstream = model.items.filter(j => j.pre.some(([p])=>alts(p).includes(it.code)) || j.conc.includes(it.code)).map(j=>j.code);
    out.push({code:it.code, t:it.t, term:t.code, slip, downstream, terms:it.terms, ts:it.ts, kind:it.kind});
  }));
  return out.sort((a,b) => b.slip - a.slip || b.downstream.length - a.downstream.length);
}

function findAlternative(model0, st, D){
  // try other elective/global choices to recover a late plan
  const base = schedule(model0);
  if(base.delay <= 0) return null;
  const tries = [];
  const careerKeys = Object.keys(D.careers);
  const globals = ["BUSI 30383","FINA 40623"];
  careerKeys.forEach(k => globals.forEach(g => {
    const m = buildModel(st, D, {electives: D.careers[k].electives, global:g});
    const p = schedule(m);
    const els = (m.chosen["fina-elec"]||[]).map(x=>x.code).join(", ");
    tries.push({career:k, global:g, electives:els, plan:p, model:m});
  }));
  tries.sort((a,b) => termIdx(a.plan.grad) - termIdx(b.plan.grad));
  const best = tries[0];
  if(!best || termIdx(best.plan.grad) >= termIdx(base.grad)) return {found:false};
  return {found:true, ...best};
}

function preIssue(model, when, ix, pp, g){
  const opts = alts(pp);
  if(opts.some(p => when[p] !== undefined && when[p] < ix)) return null;
  if(opts.some(p => model.recs[p] && gradeMeets(model.recs[p].grade, g) && !(model.items.some(x => x.code===p && x.kind==="retake")))) return null;
  const label = opts.join(" or ");
  if(opts.some(p => when[p] !== undefined)) return `is planned before or with its prerequisite ${label}`;
  if(opts.some(p => model.recs[p])) return `needs ${label} with ${g} or higher`;
  return `needs ${label}, which is not on the record`;
}
function validate(model, plan){
  const {D, rules, st} = model;
  const checks = [];
  const add = (status, label, detail, src) => checks.push({status, label, detail, src});
  // 1. every requirement accounted for
  const accounted = new Set([...model.completed.map(c=>c.code), ...model.inProgress.map(c=>c.code)]);
  plan.terms.forEach(t => t.items.forEach(i => i.code && accounted.add(i.code)));
  const missing = [];
  const askLabels = new Set(plan.terms.flatMap(t=>t.items).filter(i=>i.kind==="ask").map(i=>i.reqLabel));
  model.reqs.forEach(rq => { rq.courses.forEach(c => { if(!accounted.has(c) && !(D.equivalents?.[c]||[]).some(x => accounted.has(x))) missing.push(c); });
    if(rq.choose){ const have = rq.choose.options.filter(o=>accounted.has(o)).reduce((a,o)=>a+(D.courses[o]?.cr||3),0); if(have < rq.choose.hrs - 0.001 && ![...askLabels].some(l=>l.endsWith(rq.choose.label))) missing.push(`${rq.choose.label} (${fmt(have)}/${fmt(rq.choose.hrs)} hrs)`); }});
  add(missing.length||plan.leftovers.length ? "fail":"pass", "Every required course is completed, in progress, or planned",
      missing.length ? "Missing: " + missing.join(", ") : plan.leftovers.length ? "Could not place: " + plan.leftovers.map(l=>l.code||l.t).join(", ") : `All ${D.programs[model.st.major||"FINA"]?.name || "major"} course requirements are covered.`, "S1");
  // 2. prereq order (independent re-check)
  const when = {}; plan.terms.forEach((t,ix) => t.items.forEach(i => { if(i.code) when[i.code] = ix; }));
  const prob = [];
  plan.terms.forEach((t,ix) => t.items.forEach(i => { if(!i.code) return;
    i.pre.forEach(([pp,g]) => { const e = preIssue(model, when, ix, pp, g); if(e) prob.push(`${i.code} ${e}`); });
    i.conc.forEach(c => { const w = alts(c).map(x => when[x]).filter(x => x !== undefined); if(w.length && Math.min(...w) > ix) prob.push(`${i.code} needs ${c.replace(/\|/g," or ")} first or at the same time`); });
    i.coreq.forEach(c => { if(when[c] !== undefined && when[c] !== ix) prob.push(`${i.code} must be taken in the same term as ${c}`); });
  }));
  add(prob.length ? "fail":"pass", "Prerequisites and corequisites are in order", prob.length ? prob.join("; ") : "Re-checked independently of the scheduler, including C- minimums and the MANA 30250/30350 pairing.", "S1");
  // 3. time conflicts next term
  const nt = plan.terms.find(t => t.code === D.sectionTerm);
  const confl = plan.events.filter(e => e.type==="conflict");
  const noSec = nt ? nt.items.filter(i => i.code && !i.section && i.kind!=="abroad").map(i=>i.code) : [];
  add(confl.length ? "warn" : noSec.length ? "warn" : "pass", `No meeting-time conflicts in ${termName(D.sectionTerm)}`,
    (confl.length ? confl.map(e => `${e.code} conflicts with ${e.with.join(", ")} in every listed section, so it moved to a later term.`).join(" ") + " " : "") +
    (noSec.length ? `No section data for ${noSec.join(", ")}. ` : "") + "Section times are sample data, not live registration data.", "SX");
  // 4. offerings
  const assumed = []; plan.terms.forEach(t => t.items.forEach(i => { if(i.code && i.ts==="assumed") assumed.push(`${i.code} (${termName(t.code)})`); }));
  add(assumed.length ? "warn":"pass", "Courses are placed in terms they are offered",
    `${assumed.length} placements rely on an assumed fall-and-spring pattern; fall-only and spring-only courses are enforced from the checklist.`, "S1");
  // 5. hours
  const planned = plan.terms.reduce((a,t)=>a+t.credits,0);
  const total = model.hours.doneHours + model.hours.ipHours + planned;
  const upper = model.hours.doneUpper + model.hours.ipUpper + plan.terms.reduce((a,t)=>a+t.items.filter(i=>i.upper).reduce((x,i)=>x+i.cr,0),0);
  const tcu = total - model.hours.doneTransfer - model.hours.abroadHours;
  add(total >= rules.totalHours ? "pass":"fail", `At least ${rules.totalHours} total hours`, `${fmt(total)} hours (completed ${fmt(model.hours.doneHours)}, in progress ${fmt(model.hours.ipHours)}, planned ${fmt(planned)}).`, rules.src);
  add(upper >= rules.upperHours ? "pass":"fail", `At least ${rules.upperHours} upper-level hours`, `${fmt(upper)} upper-level hours.`, rules.src);
  add(tcu >= rules.tcuHours ? "pass":"fail", `At least ${rules.tcuHours} hours at TCU`, `${fmt(tcu)} TCU hours.`, rules.src);
  // 6. GPA
  if(model.gpa !== null){
    const g = model.gpa;
    const mg = model.majorGpa;
    add(g < 2.5 ? "fail" : ((mg!==null && mg < 2.5) || (!st.declared && g < 3.0)) ? "warn" : "pass", "GPA thresholds",
      `Estimated ${g.toFixed(2)} cumulative${model.majorGpa!==null?`, ${model.majorGpa.toFixed(2)} major`:""} from entered grades only. Graduation needs 2.50 cumulative and 2.5 major; declaring a major needs 3.0. Your official GPA comes from the registrar.`, "S5, S6");
  }
  // 7. target date
  add(plan.delay <= 0 ? "pass":"fail", `Finishes by ${termName(st.target)}`, plan.delay <= 0 ? `Projected finish ${termName(plan.grad)} at up to ${st.maxCredits} hours a term.` : `Projected finish ${termName(plan.grad)}, ${plan.delay} semester${plan.delay>1?"s":""} late.`, "");
  // 8. catalog year
  add(model.cy.verified ? "pass":"fail", "Requirements match the student's catalog year", model.cy.verified ? model.cy.label + " requirements loaded from the official checklist." : model.cy.note, model.cy.src);
  // 9. in-progress
  if(model.inProgress.length) add("warn", "In-progress courses assumed passed", `${model.inProgress.map(c=>c.code).join(", ")} are assumed to finish with C- or better. Re-run the plan after grades post.`, "S1");
  add("info", "Not an official degree audit", "This plan does not certify graduation eligibility. Only the registrar's audit and your advisor can confirm that.", "");
  return {checks, total, upper, tcu, planned};
}

function statusOf(model, plan){
  const reasons = [];
  if(!model.cy.verified) reasons.push("catalog year requirements are not loaded");
  if(model.tx.unknown.length) reasons.push(`${model.tx.unknown.length} transcript course${model.tx.unknown.length>1?"s":""} could not be matched to the catalog`);
  if(model.tx.bad.length) reasons.push(`${model.tx.bad.length} transcript line${model.tx.bad.length>1?"s":""} could not be read`);
  if(model.gpa !== null && model.gpa < 2.5) reasons.push("estimated GPA is below the 2.50 graduation minimum");
  if(!model.st.declared && model.gpa !== null && model.gpa < 3.0) reasons.push("estimated GPA is below the 3.0 needed to declare the major");
  if(reasons.length) return {kind:"advisor", reasons};
  if(model.majorGpa !== null && model.majorGpa < 2.5) model.flags.push({level:"advisor", text:`Estimated major GPA is ${model.majorGpa.toFixed(2)}, below the 2.5 needed to graduate. Ask how a retake affects your major GPA (repeat-course policy is not loaded).`, src:"S6"});
  if(plan.leftovers.length) return {kind:"advisor", reasons:["some requirements could not be scheduled within 7 years"]};
  if(plan.delay > 0) return {kind:"late", reasons:[]};
  return {kind:"ok", reasons:[]};
}

function fmt(n){ return Number.isInteger(n) ? String(n) : n.toFixed(1); }

function runAll(st, D){
  const model = buildModel(st, D);
  const plan = schedule(model);
  const val = validate(model, plan);
  const status = statusOf(model, plan);
  return {model, plan, val, status};
}


// ===== Degree-audit import (TCU Academic Advising Report) =====
const SEASON = {Fall:"F", Spring:"S", Summer:"U"};
function parseAudit(text){
  const flat = String(text||"").replace(/\s+/g, " ");
  const out = {identityRemoved: /For\s+[^()]{2,60}\(\s*\d{5,}\s*\)/.test(flat), programs:[], history:[], unmet:[], subs:[], gpa:null, earned:null, inProg:null, catalogTerm:null, expectedGrad:null, reportDate:null};
  let m = flat.match(/Undergraduate Program\s+(\d{4}) (Fall|Spring|Summer) Term\s+(?:Not )?Satisfied\s+(\d{4}) (Fall|Spring|Summer) Term/);
  if(m){ out.catalogTerm = m[2] + " " + m[1]; out.expectedGrad = (m[4]==="Fall"?"F":"S") + m[3]; }
  m = flat.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m) out.reportDate = `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
  const pr = /((?:[A-Z][A-Za-z&]*\s)+?(?:Major|Minor|Specialization|Certificate))\s+(\d{4}) (Fall|Spring|Summer) Term\s+(Not Satisfied|Satisfied)/g;
  while((m = pr.exec(flat))){ out.programs.push({name:m[1].replace(/^(?:(?:Fall|Spring|Summer) Term\s+)+/, "").replace(/^Satisfied\s+/, "").trim(), term:m[3]+" "+m[2], status:m[4]}); }
  m = flat.match(/In Prog\.?\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if(m){ out.gpa = +m[1]; out.earned = +m[6]; out.inProg = +m[7]; }
  const histIdx = flat.lastIndexOf("Course History");
  const hist = histIdx >= 0 ? flat.slice(histIdx) : flat;
  const row = /(\d\d) (Fall|Spring|Summer)\s+([A-Z]{2,4})\s+(\d{5})\s+(.+?)\s+(?:(A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|T|P|NC|W|I)\s+)?(\d{1,2}\.\d\d)\s+(EN|TE|TR|IP)\b/g;
  const seen = new Set();
  while((m = row.exec(hist))){
    const term = SEASON[m[2]] + "20" + m[1], code = m[3] + " " + m[4];
    const grade = m[8]==="IP" ? "IP" : (m[6] || "");
    const k = term + code + grade; if(seen.has(k)) continue; seen.add(k);
    out.history.push({term, code, title:m[5].trim(), grade, units:+m[7], type:m[8]});
  }
  const un = /Not Satisfied:\s*((?:(?!Not Satisfied:|Satisfied:|Courses Used).){3,220}?)\s*Units:\s*([\d.]+) required,\s*([\d.]+) used,\s*([\d.]+) needed/g;
  while((m = un.exec(flat))){
    out.unmet.push({name:m[1].replace(/\((?:RQ|RG)[^)]*\)/g, "").trim(), required:+m[2], used:+m[3], needed:+m[4]});
  }
  m = flat.match(/UPPER-DIVISION (\d+) HRS.*?Units:\s*([\d.]+) required,\s*([\d.]+) used/);
  if(m) out.upperReq = {required:+m[2], used:+m[3]};
  m = flat.match(/LDR GPA Requirement.*?GPA:\s*([\d.]+) required,\s*([\d.]+) completed/);
  if(m) out.ldrGpa = {required:+m[1], completed:+m[2]};
  const sb = /([A-Z]{3,4} \d{5}) has been directed to this line\.\s*((?:[A-Z]{3,4} \d{5} - [A-Z]{3,4} \d{5}\s*)+)/g;
  const subSeen = new Set();
  while((m = sb.exec(flat))){
    const pair = /([A-Z]{3,4} \d{5}) - ([A-Z]{3,4} \d{5})/g; let p;
    while((p = pair.exec(m[2]))){ const k = p[1]+">"+p[2]; if(!subSeen.has(k)){ subSeen.add(k); out.subs.push({from:p[1], to:p[2]}); } }
  }
  return out;
}

// ===== Lower- vs upper-division breakdown =====
const levelOf = code => { const m = String(code||"").match(/(\d)\d{4}$/); return m ? (+m[1] >= 3 ? "upper" : "lower") : null; };
function levelBreakdown(model, plan){
  const D = model.D;
  const z = () => ({done:0, ip:0, planned:0, unknown:0});
  const L = {lower:z(), upper:z()}; let unknownPlanned = 0;
  const byTerm = plan.terms.map(t => { const r = {code:t.code, lower:0, upper:0, unknown:0};
    t.items.forEach(i => { const lv = i.code ? levelOf(i.code) : i.kind==="free" ? (i.upper ? "upper" : "lower") : i.kind==="core" ? "lower" : i.kind==="abroad" ? "lower" : null;
      if(lv){ L[lv].planned += i.cr; r[lv] += i.cr; } else { unknownPlanned += i.cr; r.unknown += i.cr; } });
    return r; });
  if(model.mode === "audit"){
    model.audit.history.forEach(h => { if(["NC","W","F"].includes(h.grade)) return; const lv = levelOf(h.code); if(!lv) return;
      if(h.grade === "IP") L[lv].ip += h.units; else L[lv].done += h.units; });
  } else {
    model.completed.forEach(c => { const lv = levelOf(c.code); if(lv) L[lv].done += D.courses[c.code]?.cr || 0; });
    model.inProgress.forEach(c => { const lv = levelOf(c.code); if(lv) L[lv].ip += D.courses[c.code]?.cr || 0; });
    const ou = +model.st.otherUpper || 0; L.upper.done += ou; L.lower.done += Math.max(0, (+model.st.otherHours || 0) - ou);
  }
  const upperMin = model.mode === "audit" ? (model.audit.upperReq?.required ?? (/2024|2023|2022/.test(model.audit.catalogTerm||"") ? 42 : 36)) : (model.cy.upperHours || model.rules.upperHours);
  const upperSrc = model.mode === "audit" ? (model.audit.upperReq ? "S9" : "S1, S2") : model.cy.src;
  const ldr = D.ldr.courses.map(pp => { const opts = pp.split("|"); const hit = opts.find(c => model.recs[c]);
    const r = hit ? model.recs[hit] : null; const when = plan.terms.find(t => t.items.some(i => opts.includes(i.code)));
    return {code:pp, label:opts.join(" or "), title:D.courses[opts[0]]?.t || "", grade:r?.grade || null, planned: when ? when.code : null}; });
  const graded = ldr.filter(x => x.grade && x.grade in GP);
  const ldrGpa = graded.length ? graded.reduce((a,x) => a + GP[x.grade]*3, 0) / (graded.length*3) : null;
  const upperReqCourses = [];
  (model.reqs||[]).forEach(rq => rq.courses.forEach(c => { if(levelOf(c) === "upper") upperReqCourses.push({code:c, group:rq.group}); }));
  return {L, byTerm, unknownPlanned, upperMin, upperSrc, ldr, ldrGpa, auditLdrGpa: model.audit?.ldrGpa || null, auditUpper: model.audit?.upperReq || null, upperReqCourses};
}

function auditStartTerm(audit){
  const ip = audit.history.filter(h => h.grade==="IP" && h.term[0]!=="U").map(h => termIdx(h.term));
  const all = audit.history.filter(h => h.term[0]!=="U").map(h => termIdx(h.term));
  const last = ip.length ? Math.max(...ip) : all.length ? Math.max(...all) : termIdx("F2026");
  return termCode(last + 1);
}

function buildAuditModel(audit, prefs, D){
  const flags = [];
  const recs = {};
  audit.history.forEach(h => {
    if(h.grade==="NC" || h.grade==="W" || h.grade==="F") return;
    const prev = recs[h.code];
    if(!prev || h.grade==="IP" || (GP[h.grade]??4.5) >= (GP[prev.grade]??4.5)) recs[h.code] = {code:h.code, grade:h.grade || "IP", type:h.type, term:h.term, title:h.title};
  });
  audit.subs.forEach(s => { if(!recs[s.to]) recs[s.to] = {code:s.to, grade:"SUB", sub:s.from}; });
  const taken = c => !!recs[c];
  const st = {startTerm: auditStartTerm(audit), target: prefs.target || audit.expectedGrad || termCode(termIdx(auditStartTerm(audit))+1),
    maxCredits: prefs.maxCredits || 15, abroad:[], career: prefs.career, catalogYear:"audit", declared:true};
  const items = [], resolutions = [], seenCodes = new Set();
  const pref = D.careers[prefs.career]?.electives || [];
  const mkItem = (code, kind, reqLabel, src) => {
    const info = D.courses[code];
    seenCodes.add(code);
    return {key:code, code, t:info.regTitle||info.t, cr:info.cr, upper:isUpper(code), kind, reqLabel, src:src||info.src, pre:info.pre||[], conc:info.conc||[], coreq:info.coreq||[], terms:info.terms, ts:info.ts};
  };
  let ph = 0;
  const placeholder = (label, reqName, note, src) => ({key:"ASK-"+(++ph), code:null, t:label, cr:3, upper:false, kind:"ask", reqLabel:reqName, src, pre:[], conc:[], coreq:[], terms:"FS", ts:"choice", note});
  audit.unmet.forEach(u => {
    const rule = D.auditRules.find(r => r.match.some(k => u.name.toLowerCase().includes(k.toLowerCase()))) || genericAuditRule(u.name, D);
    const res = {name:u.name, needed:u.needed, used:u.used, required:u.required, picks:[], how:"", conf:"high", src: rule?.src || "S9"};
    let hrs = 0;
    const addCode = (c, kind, how) => { if(seenCodes.has(c)) return; const it = mkItem(c, kind, `Audit: ${u.name}`, rule.src); it.kindLabel = how==="required" ? "Required" : rule.label; items.push(it); res.picks.push({code:c, how}); hrs += it.cr; };
    if(!rule || rule.type === "unknown"){
      const n = Math.ceil(u.needed/3);
      for(let i=0;i<n;i++){ const it = placeholder(rule ? `${rule.label} (ask your advisor which one)` : `Course for "${u.name}"`, `Audit: ${u.name}`, rule?.note || "This requirement is not in the loaded catalog data.", rule?.src || "S9"); items.push(it); res.picks.push({code:null, how:"advisor"}); }
      res.conf = "low"; res.how = rule ? rule.note : "This requirement is not in the loaded catalog data, so the planner reserves the hours and asks an advisor to name the course.";
      flags.push({level:"advisor", text:`${u.name}: ${u.needed} hours needed, but the audit does not name the course. Ask which course satisfies it and whether it is offered in ${termName(st.startTerm)}.`, src:res.src});
    } else {
      if(rule.type === "list"){
        rule.courses.filter(c => !taken(c)).forEach(c => { if(hrs < u.needed) addCode(c, "req", "required"); });
      }
      const opts = rule.type === "choose" ? pref.filter(c => rule.options.includes(c)).concat(rule.options) : rule.options;
      if(rule.generic) flags.push({level:"info", text:`"${u.name}" was matched to the ${rule.program} requirements in the Neeley program data. Your audit's requirement term may use an older version; check the picks with your advisor.`, src:"S12"});
      opts.filter(c => !taken(c) && !D.courses[c]?.apply && !D.courses[c]?.permit && !blockedByRestriction(c, D, recs)).forEach(c => { if(hrs < u.needed) addCode(c, "elective", "suggested"); });
      const reqd = res.picks.filter(p=>p.how==="required").length, sug = res.picks.filter(p=>p.how==="suggested").length;
      res.conf = sug ? "medium" : "high";
      res.how = (reqd ? `${reqd>1?"These are the required courses":"This is the only required course"} on the ${rule.generic ? rule.program : rule.src==="S4"?"BIS":"Finance"} checklist not yet on your audit.` : "") + (sug ? ` ${reqd?"Plus a":"A"} suggested pick from the approved list; you can choose another from that list.` : "");
      if(hrs < u.needed){ const it = placeholder(`${rule.label} (ask your advisor which one)`, `Audit: ${u.name}`, "No remaining course in the loaded list fits.", rule.src); items.push(it); res.picks.push({code:null, how:"advisor"}); res.conf = "low"; }
    }
    resolutions.push(res);
  });
  // prerequisite closure
  for(let g=0; g<4; g++){
    items.slice().forEach(it => it.pre.forEach(([pp]) => {
      if(alts(pp).some(x => taken(x) || seenCodes.has(x))) return;
      const p = alts(pp)[0];
      if(!D.courses[p]) return;
      items.push(mkItem(p, "prereq", "Prerequisite for " + it.code)); flags.push({level:"warn", text:`${it.code} needs ${p}, which is not on your audit, so the plan adds it.`, src:D.courses[p].src});
    }));
  }
  if(audit.subs.length) flags.push({level:"info", text:`Advisor substitutions on your audit were applied: ${audit.subs.map(s=>`${s.from} counts as ${s.to}`).join("; ")}.`, src:"S9"});
  const ipList = audit.history.filter(h=>h.grade==="IP");
  const completed = Object.values(recs).filter(r => r.grade!=="IP").map(r => ({code:r.code, grade:r.grade, reqLabel:"Audit"}));
  const inProgress = ipList.map(h => ({code:h.code, reqLabel:"Audit"}));
  return {mode:"audit", st, D, audit, recs, items, completed, inProgress, flags, resolutions, gpa: audit.gpa, majorGpa:null, chosen:{},
    cy:{label: audit.catalogTerm ? `${audit.catalogTerm} requirement term (from audit)` : "From audit", verified:true, src:"S9"},
    rules:{src:"S9"}, tx:{unknown:[], bad:[]}, hours:{doneHours: audit.earned||0, ipHours: audit.inProg||0}};
}

const AUDIT_PROG = [[/real estate/i,"FIRE"],[/\bACCT\b|accounting/i,"ACCT"],[/\bMARK\b|marketing/i,"MARK"],[/\bMANA\b|management|leadership/i,"MANA"],[/\bENTR\b|entrepreneur/i,"ENTR"],[/supply|\bSVCM\b|value chain/i,"SVCM"],[/business info|\bBIS\b|\bINSC\b/i,"BIS"],[/\bFINA\b|finance/i,"FINA"]];
function genericAuditRule(name, D){
  const isMinor = /minor/i.test(name), isCert = /certificate|\bCRT\b/i.test(name);
  let pid = null;
  if(isMinor || isCert){
    pid = Object.values(D.programs).find(p => (p.category==="Minor"||p.category==="Certificate") && name.toLowerCase().includes(p.name.toLowerCase().replace(/ minor| certificate|certificate in /g,"").trim().split(" ")[0]))?.id;
  } else { const hit = AUDIT_PROG.find(([re]) => re.test(name)); pid = hit && hit[1]; }
  const p = pid && D.programs[pid]; if(!p) return null;
  const secs = p.category === "Major" ? p.sections.filter(s => /major/i.test(s.name)) : p.sections;
  const courses = [], options = [];
  secs.forEach(s => s.items.forEach(it => {
    if(it.type==="req" && it.code && D.courses[it.code.split("|")[0]]) courses.push(it.code.split("|")[0]);
    if(it.type==="choose") it.options.forEach(o => { if(o.code && o.hrs && D.courses[o.code.split("|")[0]]) options.push(o.code.split("|")[0]); });
  }));
  const elective = /selection|elective|choose/i.test(name);
  return {id:"gen-"+pid, type: elective ? "choose" : "list", label: `${p.name.replace(" (BBA)","")} ${elective ? "elective" : "course"}`, courses: elective ? [] : courses, options, src:"S12", generic:true, program:p.name};
}
function auditValidate(model, plan){
  const checks = []; const add = (status, label, detail, src) => checks.push({status, label, detail, src});
  const res = model.resolutions;
  const low = res.filter(r => r.conf==="low");
  add(res.length ? (low.length ? "warn":"pass") : "info", "Every open requirement on your audit has a plan",
    res.length ? res.map(r => `${r.name}: ${r.needed} hrs → ${r.picks.map(p=>p.code||"advisor to name").join(", ")}`).join(" · ") : "Your audit shows no open requirements with hours needed.", "S9");
  const when = {}; plan.terms.forEach((t,ix) => t.items.forEach(i => { if(i.code) when[i.code] = ix; }));
  const prob = [];
  plan.terms.forEach((t,ix) => t.items.forEach(i => { if(!i.code) return;
    i.pre.forEach(([pp,g]) => { const e = preIssue(model, when, ix, pp, g); if(e) prob.push(`${i.code} ${e}`); });
    i.conc.forEach(c => { const w = alts(c).map(x => when[x]).filter(x => x !== undefined); if(w.length && Math.min(...w) > ix) prob.push(`${i.code} needs ${c.replace(/\|/g," or ")} first or at the same time`); });
  }));
  add(prob.length ? "fail":"pass", "Prerequisites are met in order", prob.length ? prob.join("; ") : "Checked against the grades on your audit, including courses in progress.", "S1, S4");
  const assumed = []; plan.terms.forEach(t => t.items.forEach(i => { if(i.code && i.ts==="assumed") assumed.push(`${i.code} (${termName(t.code)})`); }));
  add(assumed.length ? "warn":"pass", "Courses are placed in terms they are offered", assumed.length ? `Assumed offered: ${assumed.join(", ")}. Confirm in Purple Schedule Builder.` : "Every placement uses a published fall-only or spring-only pattern.", "S1, S4");
  add(plan.delay <= 0 ? "pass":"fail", `Finishes by ${termName(model.st.target)}`, plan.delay <= 0 ? `Projected finish ${termName(plan.grad)}.` : `Projected finish ${termName(plan.grad)}, ${plan.delay} semester${plan.delay>1?"s":""} late.`, "");
  if(model.gpa!==null) add(model.gpa >= 2.5 ? "pass":"fail", "GPA meets the 2.50 graduation minimum", `Official GPA on your audit: ${model.gpa.toFixed(3)}.`, "S6");
  if(model.audit.subs.length) add("info", "Advisor substitutions applied", model.audit.subs.map(s=>`${s.from} → ${s.to}`).join(", "), "S9");
  add("info", "In-progress courses assumed passed", "The plan assumes this term's courses finish with the grades later courses need. Re-import your audit after grades post.", "");
  add("info", "Not an official degree audit", "Only the registrar's audit and your advisor can confirm graduation eligibility.", "");
  const planned = plan.terms.reduce((a,t)=>a+t.credits,0);
  return {checks, planned, upper:null, tcu:null, total:null};
}

function runAudit(audit, prefs, D){
  const model = buildAuditModel(audit, prefs, D);
  const plan = schedule(model);
  const val = auditValidate(model, plan);
  const status = plan.leftovers.length ? {kind:"advisor", reasons:["some open requirements could not be scheduled"]} : plan.delay > 0 ? {kind:"late", reasons:[]} : {kind:"ok", reasons:[]};
  return {model, plan, val, status};
}

// ===== Suggestions for the student =====
function suggest(R0, st, D, runner){
  const {model, plan} = R0; const out = [];
  const add = (s) => out.push(s);
  const first = plan.terms[0]; const isA = model.mode === "audit";
  const money = n => "$" + Math.round(n).toLocaleString("en-US");
  // 1. finish earlier
  const last = plan.terms[plan.terms.length - 1];
  if(R0.status?.kind !== "late" && plan.terms.length > 1 && last && (last.credits <= 9 || last.items.every(i => ["free","core"].includes(i.kind))) && !plan.leftovers.length){
    let found = null;
    for(const cap of [st.maxCredits + 1, st.maxCredits + 2, st.maxCredits + 3].filter(c => c <= 18)){
      const r = runner({...st, maxCredits: cap});
      if(termIdx(r.plan.grad) < termIdx(plan.grad) && !r.plan.leftovers.length){ found = {cap, grad: r.plan.grad}; break; }
    }
    add({id:"early", kind:"save", pri:1, title: found ? `Finish a semester early, in ${termName(found.grad)}` : `Your last semester has only ${fmt(last.credits)} hours`,
      body: found ? `Your final term (${termName(last.code)}) holds just ${fmt(last.credits)} hours. Taking ${found.cap} hours a term instead of ${st.maxCredits}, or moving those hours to a summer session, finishes you in ${termName(found.grad)}. One fewer semester at TCU is worth about ${money(D.coa.semester)} in cost of attendance.`
                  : `Your final term (${termName(last.code)}) holds just ${fmt(last.credits)} hours. A summer course or AP/transfer credit could remove that semester; ask your advisor which courses can move.`,
      action: found ? {label:`Plan at ${found.cap} hours a term`, set:{maxCredits: found.cap}} : null, src:"S12"});
  }
  // exam credit
  const ex = model.exam;
  if(ex && ex.credits.length){
    const hrs = ex.countedHours;
    const covered = ex.credits.flatMap(c => c.codes).filter(c => c !== "MATH 10043");
    add({id:"exam", kind:"save", pri:2, title:`Your exam credit is worth ${fmt(hrs)} hours`, body:`It covers ${covered.join(", ")}${ex.slots.length ? ` and TCU Core ${ex.slots.map(s=>s.replace(/\d$/,"")).join(", ")}` : ""}. That's about ${hrs >= 15 ? "a full semester" : "part of a semester"} you don't have to take. Exam credit carries no grade, so your GPA will rest on the courses you take at TCU; make your first business courses count.`, src:"S13"});
    const lost = ex.credits.find(c => c.noCount);
    if(lost) add({id:"apstats", kind:"warn", pri:1, title:"Don't count on your AP Statistics credit", body:`It comes in as MATH 10043, but business majors must take INSC 20153, and TCU doesn't give credit for both. Plan on taking INSC 20153; the ${fmt(lost.row.hrs)} AP hours likely won't count toward your 120.`, src:"S13, S10"});
  }
  // 2. register early for the riskiest course next term
  const nextRisk = (R0.bn||[]).filter(b => b.term === first?.code && (b.slip > 0 || b.terms.length === 1 || b.downstream.length >= 2)).sort((a,b) => b.slip - a.slip || b.downstream.length - a.downstream.length)[0];
  if(nextRisk && !model.items.some(i => i.kind === "retake" && i.code === nextRisk.code)){
    const c = D.courses[nextRisk.code];
    add({id:"reg", kind:"act", pri:2, title:`Register for ${nextRisk.code} the moment your window opens`,
      body:`${nextRisk.code} ${c.t} ${c.terms.length===1 ? `runs in ${c.terms==="F"?"fall":"spring"} only` : "gates later courses"}${nextRisk.downstream.length ? ` and unlocks ${nextRisk.downstream.join(", ")}` : ""}. ${nextRisk.slip > 0 ? `Missing it in ${termName(nextRisk.term)} costs ${nextRisk.slip} semester${nextRisk.slip>1?"s":""}.` : "Getting a seat now keeps the rest of your plan on schedule."} If it fills, ask to be added to the waitlist${["elective","global"].includes(model.items.find(i=>i.code===nextRisk.code)?.kind) ? " or swap in another approved elective" : ""} and tell your advisor.`, src:c.src});
  }
  // 3. retake / GPA
  const retake = model.items.find(i => i.kind === "retake");
  if(retake) add({id:"retake", kind:"warn", pri:1, title:`Retake ${retake.code} next term`, body:`Your grade in ${retake.code} is below what later courses require, so everything after it waits. Retaking it in ${termName(plan.terms.find(t=>t.items.some(i=>i.code===retake.code))?.code || first.code)} keeps the chain moving. Ask your advisor whether the new grade replaces the old one in your GPA.`, src:"S10"});
  if(model.majorGpa !== null && model.majorGpa !== undefined && model.majorGpa < 2.7 && !isA) add({id:"gpa", kind:"warn", pri:1, title:"Protect your major GPA", body:`Your estimated major GPA is ${model.majorGpa.toFixed(2)}; 2.5 is required to graduate. Consider a lighter load in semesters with several major courses, and use TCU tutoring and office hours early.`, src:"S6"});
  // 4. study-abroad window / light semester
  const light = plan.terms.find((t, i) => i > 0 && t.items.length && t.items.every(x => ["core","free","ask"].includes(x.kind)) && !t.abroad);
  if(light && !isA && !(st.abroad||[]).length) add({id:"abroad", kind:"idea", pri:3, title:`${termName(light.code)} is a natural semester abroad`, body:`That term holds only TCU Core and free elective hours, which are usually the easiest to take abroad. Nothing in your major has to move. Confirm course approvals with Neeley's international programs office first.`, action:{label:`Try abroad in ${termName(light.code)}`, set:{abroad:[light.code]}}, src:"S12"});
  // 5. free elective room → minor / certificate fit
  const free = plan.terms.reduce((a,t) => a + t.items.filter(i => i.kind==="free").reduce((x,i) => x + i.cr, 0), 0);
  if(!isA && !st.minor){
    const fits = Object.values(D.programs).filter(p => (p.category==="Minor"||p.category==="Certificate")).map(p => {
      const r = runner({...st, minor:p.id});
      const blocked = r.model.flags.some(f => f.level==="advisor" && /non-business majors only|own major/.test(f.text));
      const apply = r.model.flags.some(f => /application/.test(f.text) && f.text.includes(p.name));
      const asks = r.plan.terms.reduce((a,t)=>a+t.items.filter(i=>i.kind==="ask" && i.askKind!=="overlap" && i.reqLabel.startsWith(p.name)).length,0);
      return {p, blocked, apply, asks, overlap: r.model.minorInfo?.overlap || [], extra: r.val.planned - (R0.val.planned||0), delay: termIdx(r.plan.grad) - termIdx(plan.grad), grad:r.plan.grad};
    }).filter(x => !x.blocked && x.asks === 0).sort((a,b) => a.delay - b.delay || a.overlap.length - b.overlap.length || a.extra - b.extra);
    fits.filter(x => x.delay <= 0).slice(0, 3).forEach((x, i) => add({id:"minor-"+x.p.id, kind:"idea", pri: i === 0 ? 2 : 3,
      title:`Add the ${x.p.name}${x.extra <= 0 ? " at no extra hours" : ` for ${fmt(x.extra)} extra hours`}`,
      body:`It fits inside your current finish date (${termName(x.grad)})${free ? `, using hours you'd otherwise spend on free electives (you have ${fmt(free)})` : ""}.${x.overlap.length && !st.allowOverlap ? ` ${x.overlap.length} of its required courses are already in your major; the plan reserves replacement courses for those until an advisor confirms they can count twice.` : ""}${x.apply ? " It requires an application, so apply early." : ""} ${x.p.who ? "Eligibility: " + x.p.who : ""}`,
      action:{label:"Add to my plan", set:{minor:x.p.id}}, src:"S12"}));
  } else if(free >= 9 && isA === false && st.minor) add({id:"room", kind:"idea", pri:3, title:`You still have ${fmt(free)} free elective hours`, body:"Use them for courses that build toward your career goal, an internship for credit, or a semester abroad.", src:""});
  // 6. career electives (finance)
  const car = D.careers[st.career];
  if(car && !isA && ["FINA","FIRE"].includes(st.major||"FINA")){
    const picks = (model.chosen["fina-elec"]||[]).filter(x => !x.done).map(x => x.code);
    if(picks.length) add({id:"career", kind:"idea", pri:3, title:`Electives that fit ${car.label.toLowerCase()}`, body:`The plan picked ${picks.map(c => `${c} ${D.courses[c].t}`).join(" and ")}. ${car.why} These are options to explore, not requirements.`, src:"S1"});
  }
  // 7. unnamed courses / advisor
  const asks = plan.terms.flatMap(t => t.items.filter(i => i.kind === "ask").map(i => ({i, t:t.code})));
  if(asks.length) add({id:"ask", kind:"act", pri:2, title:`Ask your advisor to name ${asks.length === 1 ? "one course" : asks.length + " courses"} before ${termName(asks[0].t)}`, body:`${asks.map(a => a.i.reqLabel.replace(/^Audit: /,"")).join("; ")}. Your records count the hours but don't say which course fills them. Bring the summary from "Before you register."`, src:"S9"});
  // 8. assumed offerings in next term
  const assumed = (first?.items||[]).filter(i => i.code && i.ts === "assumed");
  if(assumed.length) add({id:"check", kind:"act", pri:3, title:`Check ${termName(first.code)} sections in Purple Schedule Builder`, body:`${assumed.map(i=>i.code).join(", ")} ${assumed.length===1?"has":"have"} no published fall/spring pattern, so the planner assumed ${assumed.length===1?"it runs":"they run"} next term. Confirm before you build your schedule.`, src:"S12"});
  return out.sort((a,b) => a.pri - b.pri);
}

// ===== What-if: switch major, add a second major, add a minor =====
function whatIf(st, D, change){
  const base = runAll(st, D);
  const alt = runAll({...st, globalChoice:null, electivesOverride:null, ...change}, D);
  const counting = m => new Set([...m.completed, ...m.inProgress].filter(c => c.reqLabel && c.reqLabel !== "Other").map(c => c.code));
  const nowC = counting(base.model), thenC = counting(alt.model);
  const doneCodes = [...base.model.completed, ...base.model.inProgress].map(c => c.code);
  const baseCodes = new Set(base.plan.terms.flatMap(t => t.items.map(i => i.code)).filter(Boolean));
  const altCodes = alt.plan.terms.flatMap(t => t.items.map(i => i.code)).filter(Boolean);
  return {base, alt,
    grad: alt.plan.grad, delay: termIdx(alt.plan.grad) - termIdx(base.plan.grad), late: termIdx(alt.plan.grad) - termIdx(st.target),
    toGo: alt.val.planned, extra: alt.val.planned - base.val.planned,
    stillCount: [...thenC], stopCounting: [...nowC].filter(c => !thenC.has(c)), newlyCount: [...thenC].filter(c => !nowC.has(c)),
    added: [...new Set(altCodes.filter(c => !baseCodes.has(c)))], dropped: [...baseCodes].filter(c => !altCodes.includes(c)),
    doneTotal: doneCodes.length,
    blockers: alt.model.flags.filter(f => f.level === "advisor" && /can't|non-business majors only|own major|can't be combined/.test(f.text)).map(f => f.text),
    advisor: alt.model.flags.filter(f => f.level === "advisor").map(f => f.text)};
}
function auditToStudent(audit, D){
  const known = audit.history.filter(h => D.courses[h.code] && !["NC","W","F"].includes(h.grade));
  const other = audit.history.filter(h => !D.courses[h.code] && !["NC","W","F"].includes(h.grade) && h.grade !== "IP");
  const majors = (audit.programs||[]).filter(p => /major/i.test(p.name)).map(p => (AUDIT_PROG.find(([re]) => re.test(p.name))||[])[1]).filter(Boolean);
  const hit = majors.length ? [null, majors[0]] : null;
  return {id:"audit", name:"Your audit", catalogYear:"2025-26", declared:true, startTerm:auditStartTerm(audit), target:audit.expectedGrad || termCode(termIdx(auditStartTerm(audit))+2),
    maxCredits:15, career:"consulting", abroad:[], minor:null, major: hit ? hit[1] : "FINA", second: majors[1] && majors[1] !== majors[0] ? majors[1] : null, exams:[],
    otherHours: other.reduce((a,h)=>a+h.units,0), otherUpper: other.filter(h => isUpper(h.code)).reduce((a,h)=>a+h.units,0), otherTransfer: other.filter(h => /T[ER]/.test(h.type)).reduce((a,h)=>a+h.units,0),
    coreDone: D.coreSlots.distribution.concat(D.coreSlots.overlay).map(s => s.id),
    transcript: known.map(h => `${h.code} ${h.grade === "IP" ? "IP" : h.grade || "T"}`).join("\n")};
}

// ===== Clubs, programs and centers =====
function studentYear(st, model){
  if(st.year) return st.year;
  const h = (model?.hours?.doneHours || 0);
  return h < 30 ? "first" : h < 60 ? "sophomore" : h < 90 ? "junior" : "senior";
}
function recommendInvolvement(D, prof){
  const YR = {first:0, sophomore:1, junior:2, senior:3, any:0};
  const yr = YR[prof.year] ?? 0, tags = new Set(prof.tags || []), majors = [prof.major, prof.second].filter(m => m && m !== "UND");
  const items = D.involvement.items.map(it => {
    const why = []; let s = 0;
    const narrow = it.majors.length < 8;
    const mHit = majors.find(m => it.majors.includes(m) || (m === "FIRE" && it.majors.includes("FINA")));
    if(mHit && narrow){ s += 4; why.push(`is a fit for ${D.majorInfo[mHit]?.short || mHit} majors`); }
    else if(!narrow) s += 1;
    const tHit = it.tags.filter(t => tags.has(t));
    if(tHit.length){ s += 3 * tHit.length; why.push(`matches your interest in ${tHit.map(t => TAG_LABEL[t] || t).join(" and ")}`); }
    const iy = YR[it.year] ?? 0, later = iy > yr;
    if(it.year === "first" && yr === 0){ s += 5; why.push("is made for first-year students"); }
    if(it.year === "first" && yr > 0) s -= 4;
    if(later) s -= (iy - yr > 1 ? 3 : 1);
    return {...it, score:s, why, later, when: later ? `From ${it.year} year` : it.year === "first" ? "First year" : "Now"};
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score || (a.later - b.later));
  return items;
}
const TAG_LABEL = {investing:"investing and finance", analytics:"data and technology", marketing:"marketing", sales:"sales", entrepreneurship:"starting businesses", leadership:"leadership", people:"people and HR", consulting:"consulting", realestate:"real estate", energy:"energy", sports:"sports business", accounting:"accounting", supplychain:"supply chain", global:"global business", impact:"social impact", community:"community", honors:"honors", explore:"exploring options"};

// ===== Major survey scoring =====
function scoreSurvey(D, answers){
  const tot = {}, why = {}, tags = new Set();
  Object.keys(D.majorInfo).forEach(m => { tot[m] = 0; why[m] = []; });
  answers.forEach((ai, qi) => {
    if(ai === null || ai === undefined) return;
    const [label, w, tg] = D.survey.questions[qi].opts[ai];
    (tg||[]).forEach(t => tags.add(t));
    Object.entries(w).forEach(([m, v]) => { tot[m] += v; if(v >= 2) why[m].push(label); });
  });
  const max = Math.max(1, ...Object.values(tot));
  const ranked = Object.keys(tot).map(m => ({major:m, score:tot[m], pct: Math.round(100 * tot[m] / max), why: why[m]})).sort((a,b) => b.score - a.score);
  return {ranked, tags:[...tags]};
}

if(typeof module !== "undefined") module.exports = {studentYear, recommendInvolvement, scoreSurvey, whatIf, auditToStudent, suggest, programReqs, levelBreakdown, parseAudit, buildAuditModel, runAudit, auditStartTerm, runAll, buildModel, schedule, bottlenecks, findAlternative, validate, statusOf, termName, termIdx, termCode, parseTranscript, fmt};
