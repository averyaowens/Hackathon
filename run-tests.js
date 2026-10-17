// Headless test suite for the rules engine. Run: node run-tests.js
// The same scenarios also run live in the browser on the Validation page.
const fs = require("fs"), path = require("path");
const root = __dirname;
const E = require(path.join(root, "engine.js"));
const D = JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8"));
const S = JSON.parse(fs.readFileSync(path.join(root, "students.json"), "utf8"));
const AUDIT = fs.readFileSync(path.join(root, "sample-audit.txt"), "utf8");
const run = s => { const r = E.runAll(s, D); r.bn = E.bottlenecks(r.model, r.plan); return r; };
const stu = (id, patch) => ({...JSON.parse(JSON.stringify(S[id])), globalChoice:null, electivesOverride:null, ...(patch||{})});
function invariants(r){
  const errs = [], when = {};
  r.plan.terms.forEach((t, ix) => t.items.forEach(i => { if(i.code) when[i.code] = ix; }));
  r.plan.terms.forEach((t, ix) => {
    if(t.credits > r.model.st.maxCredits + 0.001 && !t.abroad) errs.push(`${t.code} over cap`);
    t.items.forEach(i => {
      if(!i.code || i.kind === "abroad") return;
      if(!i.terms.includes(t.code[0])) errs.push(`${i.code} in wrong term`);
      (i.pre||[]).forEach(([pp]) => { const o = pp.split("|"), pl = o.filter(p => when[p] !== undefined); if(pl.length && pl.every(p => when[p] >= ix) && !o.some(p => r.model.recs[p])) errs.push(`${i.code} before ${pp}`); });
    });
  });
  return errs;
}
let pass = 0, fail = 0;
const t = (name, ok) => { if(ok){ pass++; console.log("  ✓", name); } else { fail++; console.log("  ✕", name); } };
console.log("Scenario 1 · Maya on time"); { const r = run(stu("maya")); t("finishes Spring 2029", r.plan.grad === "S2029"); t("requirements covered", r.val.checks[0].status === "pass"); t("no rule broken", !invariants(r).length); t("time clash detected", r.plan.events.some(e => e.code === "ACCT 30253")); }
console.log("Scenario 2 · Minor"); { const r = run(stu("maya", {minor:"Min-BIS"})); t("BIS minor courses planned", ["INSC 30723","INSC 30823","INSC 30833","INSC 30853"].every(c => r.plan.terms.some(x => x.items.some(i => i.code === c)))); }
console.log("Scenario 3 · Jordan"); { const s = stu("jordan"), r = run(s), alt = E.findAlternative(r.model, s, D); t("late to Fall 2028", r.plan.grad === "F2028"); t("retake planned", r.model.items.some(i => i.kind === "retake")); t("fix found for Spring 2028", alt && alt.found && alt.plan.grad === "S2028"); }
console.log("Scenario 4 · Sam"); { const r = run(stu("sam")); t("refused (advisor)", r.status.kind === "advisor"); t("unknown transfer courses not guessed", r.model.tx.unknown.length === 2); }
console.log("First year · Noah"); { const r = run(stu("noah")); t("19 exam hours counted", r.model.exam.countedHours === 19); t("AP Statistics flagged", r.model.exam.credits.some(c => c.noCount)); t("no rule broken", !invariants(r).length); }
console.log("First year without an advising report");
{ const r = run(stu("noah", {major:"UND", exams:[], transcript:"", freshman:true}));
  t("undecided plan covers shared business requirements", r.val.checks[0].status === "pass"); t("no rule broken", !invariants(r).length);
  t("no major-only courses planned", !r.plan.terms.some(x => x.items.some(i => /^FINA 30[2-9]/.test(i.code||"")))); }
console.log("Major survey");
{ t("finance answers rank Finance first", E.scoreSurvey(D, [0,4,0,0,0,1,4,1]).ranked[0].major === "FINA");
  t("marketing answers rank Marketing first", E.scoreSurvey(D, [1,3,1,1,2,4,0,2]).ranked[0].major === "MARK");
  t("all 8 majors ranked", E.scoreSurvey(D, [0,0,0,0]).ranked.length === 8); }
console.log("Clubs and programs");
{ const a = E.recommendInvolvement(D, {major:"FINA", year:"first", tags:["investing"]}), b = E.recommendInvolvement(D, {major:"SVCM", year:"junior", tags:["supplychain"]});
  t("first-year programs near the top for first-years", a.slice(0,6).some(x => x.year === "first")); t("Finance Club for a finance student", a.some(x => x.name === "Finance Club"));
  t("supply-chain center for a supply-chain junior", b.slice(0,5).some(x => /Supply Chain/.test(x.name))); t("every item cites a source", a.every(x => x.src && x.src.split(/, */).every(k => D.sources[k]))); }
console.log("Audit import"); { const a = E.parseAudit(AUDIT), r = E.runAudit(a, {career:"consulting", maxCredits:15}, D); t("33 courses, 4 open requirements", a.history.length === 33 && a.unmet.length === 4); t("finishes Spring 2027", r.plan.grad === "S2027"); t("no rule broken", !invariants(r).length); }
console.log("Every major and minor"); Object.values(D.programs).filter(p => ["Major","Minor","Certificate"].includes(p.category)).forEach(p => { const r = run(stu("maya", p.category === "Major" ? {major:p.id} : {minor:p.id})); t(`${p.name}: plans without breaking a rule`, !r.plan.leftovers.length && !invariants(r).length); });
console.log("What if"); { const w = E.whatIf(stu("maya"), D, {major:"MARK"}); t("ACCT 30153 stops counting when switching to Marketing", w.stopCounting.includes("ACCT 30153")); t("Finance + Real Estate double major blocked", E.whatIf(stu("maya"), D, {second:"FIRE"}).blockers.length > 0); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
