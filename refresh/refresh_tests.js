// REGRESSION TESTS — invariants the forecast engine must never violate.
//
// Motivated by the continue-from-reality fix (model review §16) and the reviewer
// recommendation to lock its guarantees in permanently. Before that fix, the Monte
// Carlo re-simulated the whole tournament every run, so eliminated teams kept
// title probability. These tests make that class of bug impossible to reintroduce
// silently: they assert that every forward-looking probability is CONDITIONAL on
// the actual current tournament state.
//
// Usage:  node refresh_tests.js
// Exit 0 = all pass, 1 = a failure (safe to wire into CI or a pre-swap check).
//
// The suite builds the SAME engine module regen/verify use, so it tests real code.

const fs=require('fs');
const SRC=__dirname+'/worldcup2026.jsx';

// ---- build the engine exactly as refresh_regen.js does -----------------------
(function buildEngine(){
  const src=fs.readFileSync(SRC,'utf8');
  const lines=src.split('\n');
  let end=0;
  for(let i=0;i<lines.length;i++){ if(lines[i].startsWith('function MiniBar')){ end=i; break; } }
  let code=lines.slice(0,end).join('\n').replace(/^import[^\n]*\n/,'');
  code+="\nmodule.exports={runMonteCarlo,resolveKnockoutRounds,knockoutFrontier,"
      +"OFFICIAL_RESULTS,FIXTURES,WEIGHT_PRESETS,buildBaseProbs,buildStaticProbs,"
      +"buildMarketProbs,seedElo,applyEloResult,liveBlendProbs,countTeamsAlive,seedRNG,ROUNDS};";
  fs.writeFileSync('/tmp/_eng_test.js',code);
})();
const M=require('/tmp/_eng_test.js');

// ---- tiny test harness -------------------------------------------------------
// Assertions are tallied per invariant CATEGORY so the summary shows where the
// coverage lives. If a refactor suddenly doubles one category's count, that tells
// you immediately where the behaviour changed. Categories:
//   Probability   — range, normalization/mass conservation
//   Tournament    — reached rounds, eliminated teams, finalists
//   Transition    — winner advances / loser out, local & round conservation
//   Temporal      — monotonicity, extinction permanence
//   Engine        — deterministic seed, from-scratch fallback
let passed=0, failed=0; const failures=[];
const catCounts={}; // category -> {passed, failed}
let _cat="Uncategorized";
function category(name){ _cat=name; if(!catCounts[name]) catCounts[name]={passed:0,failed:0}; }
function check(name, cond, detail){
  if(!catCounts[_cat]) catCounts[_cat]={passed:0,failed:0};
  if(cond){ passed++; catCounts[_cat].passed++; }
  else { failed++; catCounts[_cat].failed++; failures.push("["+_cat+"] "+name+(detail?('  — '+detail):'')); }
}
function approx(a,b,tol=0.02){ return Math.abs(a-b)<=tol; }

// ---- helpers: build a live forecast from a given result set ------------------
const KO=["R32","R16","QF","SF","Final"];
function forecast(results, N=20000){
  const w=M.WEIGHT_PRESETS.evidence;
  const sp=M.buildStaticProbs(w,{}), mp=M.buildMarketProbs(w,{},null), b=M.buildBaseProbs(w,{},null);
  let el=M.seedElo(b);
  for(const r of results) if(r.scoreA!=null&&r.scoreB!=null) el=M.applyEloResult(el,r).elo;
  const played=results.filter(r=>r.scoreA!=null&&r.scoreB!=null).length;
  const sW=w.wFIFA, mW=(w.wPredMarket||0)+(w.wSportsBook||0);
  const probs=M.liveBlendProbs({staticProbs:sp,marketProbs:mp,elo:el,matchesPlayed:played,
    marketWeight:mW,staticWeight:sW,marketAgeHours:0,baseProbs:b,teamsAlive:M.countTeamsAlive(results)});
  return M.runMonteCarlo(probs, N, results, M.FIXTURES);
}

// Winner/loser of a played knockout match, honoring pkWinner.
function outcome(r){
  if(r.scoreA==null||r.scoreB==null) return null;
  let winner;
  if(r.pkWinner) winner=r.pkWinner;
  else if(r.scoreA>r.scoreB) winner=r.teamA;
  else if(r.scoreB>r.scoreA) winner=r.teamB;
  else return null;
  const loser = winner===r.teamA ? r.teamB : r.teamA;
  return {winner, loser};
}

const results=M.OFFICIAL_RESULTS;
const mc=forecast(results);
// Round order is derived from the engine's own ROUNDS constant (single source of
// truth — no separate copy to drift). ROUND_FIELDS is the knockout-and-beyond
// slice used by the invariants below (drops the "Groups" entry at index 0).
const ROUND_FIELDS = (M.ROUNDS || ["Groups","R32","R16","QF","SF","Final","Champion"])
  .filter(r=>r!=="Groups");

// =============================================================================
// TEST 1 — Eliminated teams have ZERO forward probability past their exit round.
// A team knocked out in the knockouts cannot reach any later round.
// =============================================================================
(function testEliminatedAreZero(){
  category("Tournament");
  // Determine each team's actual furthest round and whether they were eliminated.
  const lostAt={}; // team -> round they lost in
  for(const r of results){
    const o=outcome(r);
    if(!o||!KO.includes(r.group)) continue;
    lostAt[o.loser]=r.group;
  }
  const laterRounds=(rnd)=>{ const i=ROUND_FIELDS.indexOf(rnd); return ROUND_FIELDS.slice(i+1); };
  for(const [team,rnd] of Object.entries(lostAt)){
    // "Champion" isn't a playable round label in results, but every KO round has a
    // later round to check. A team that lost in the Final can't be Champion, etc.
    const mustBeZero = rnd==="Final" ? ["Champion"] : laterRounds(rnd).length ? laterRounds(rnd) : ["Champion"];
    for(const field of mustBeZero){
      const p=mc[team]?.[field]??0;
      check(`eliminated ${team} (lost ${rnd}) has ${field}=0`, p===0, `got ${p}`);
    }
  }
})();

// =============================================================================
// TEST 2 — A team already IN a round reaches it with probability 1.
// Every team that actually appears in a played-or-scheduled knockout match has,
// with certainty, reached that round.
// =============================================================================
(function testReachedIsCertain(){
  category("Tournament");
  const rounds=M.resolveKnockoutRounds(results, M.FIXTURES);
  for(const rnd of KO){
    for(const m of rounds[rnd]||[]){
      for(const t of [m.a,m.b]){
        // the round-reached field for round rnd is rnd itself (R32..Final)
        const p=mc[t]?.[rnd]??0;
        check(`${t} reached ${rnd} with prob 1`, approx(p,1,0.0001), `got ${p}`);
      }
    }
  }
})();

// =============================================================================
// TEST 3 — A team already in the FINAL has Final probability exactly 1. Its
// Champion probability is strictly in (0,1) while the final is UNPLAYED, and is
// exactly 0 or 1 once the final has been played (winner=1, loser=0).
// =============================================================================
(function testFinalist(){
  category("Tournament");
  const rounds=M.resolveKnockoutRounds(results, M.FIXTURES);
  const sf=rounds["SF"]||[];
  const finalRow=(rounds["Final"]||[]).find(m=>m.played); // the played final, if any
  const finalsPlayed=!!finalRow;
  // A team is a confirmed finalist if it won a played SF.
  const finalists=[];
  for(const m of sf){ if(m.played && m.winner) finalists.push(m.winner); }
  for(const t of finalists){
    check(`${t} is in the final: Final prob = 1`, approx(mc[t].Final,1,0.0001), `got ${mc[t].Final}`);
    if(finalsPlayed){
      // Final is decided — champion must be exactly the winner (1) or loser (0).
      const isWinner = finalRow.winner===t;
      check(`${t} Champion is ${isWinner?1:0} (final played)`,
        approx(mc[t].Champion, isWinner?1:0, 0.0001), `got ${mc[t].Champion}`);
    } else {
      // Final not yet played — champion share must be a genuine probability.
      check(`${t} Champion prob in (0,1) (final unplayed)`,
        mc[t].Champion>0 && mc[t].Champion<1, `got ${mc[t].Champion}`);
    }
  }
})();

// =============================================================================
// TEST 4 — Champion probabilities over ALL teams sum to 1 (a champion is always
// produced), and Final-reaching probabilities sum to 2 (two finalists).
// =============================================================================
(function testMassConservation(){
  category("Probability");
  let champSum=0, finalSum=0;
  for(const t of Object.keys(mc)){ champSum+=mc[t].Champion||0; finalSum+=mc[t].Final||0; }
  check("Champion probabilities sum to 1", approx(champSum,1,0.005), `got ${champSum.toFixed(4)}`);
  check("Final-reaching probabilities sum to 2", approx(finalSum,2,0.01), `got ${finalSum.toFixed(4)}`);
})();

// =============================================================================
// TEST 5 — Monotonicity: for every team, P(reach round k) >= P(reach round k+1).
// You cannot reach the final more often than you reach the semifinal.
// =============================================================================
(function testMonotone(){
  category("Temporal");
  for(const t of Object.keys(mc)){
    for(let i=0;i<ROUND_FIELDS.length-1;i++){
      const a=mc[t][ROUND_FIELDS[i]]??0, b=mc[t][ROUND_FIELDS[i+1]]??0;
      check(`${t} monotone ${ROUND_FIELDS[i]}>=${ROUND_FIELDS[i+1]}`, a>=b-0.001, `${a} < ${b}`);
    }
  }
})();

// =============================================================================
// TEST 6 — The from-scratch fallback still works: with NO knockout results and no
// fixtures, the engine simulates the whole tournament and produces a sane,
// 100%-summing champion distribution (no team at 0 or 1, mass conserved).
// =============================================================================
(function testFromScratchFallback(){
  category("Engine");
  const groupOnly=results.filter(r=>!KO.includes(r.group));
  const w=M.WEIGHT_PRESETS.evidence;
  const sp=M.buildStaticProbs(w,{}),mp=M.buildMarketProbs(w,{},null),b=M.buildBaseProbs(w,{},null);
  let el=M.seedElo(b);
  for(const r of groupOnly) if(r.scoreA!=null) el=M.applyEloResult(el,r).elo;
  const sW=w.wFIFA,mW=(w.wPredMarket||0)+(w.wSportsBook||0);
  const probs=M.liveBlendProbs({staticProbs:sp,marketProbs:mp,elo:el,matchesPlayed:groupOnly.length,
    marketWeight:mW,staticWeight:sW,marketAgeHours:0,baseProbs:b,teamsAlive:32});
  const fs=M.runMonteCarlo(probs, 8000, groupOnly, []); // no fixtures -> from scratch
  let sum=0,maxP=0; for(const t of Object.keys(fs)){ sum+=fs[t].Champion; maxP=Math.max(maxP,fs[t].Champion); }
  check("from-scratch: champion mass sums to 1", approx(sum,1,0.01), `got ${sum.toFixed(4)}`);
  check("from-scratch: no single team certain", maxP<0.9, `max champ ${maxP.toFixed(3)}`);
})();

// =============================================================================
// TEST 7 — Range: EVERY probability, every team, every round, lies in [0,1].
// Normalization/accumulation bugs first show up as -0.00003 or 1.0002.
// =============================================================================
(function testRange(){
  category("Probability");
  for(const t of Object.keys(mc)){
    for(const field of ROUND_FIELDS){
      const p=mc[t][field];
      check(`${t}.${field} in [0,1]`, p>=0 && p<=1, `got ${p}`);
    }
  }
})();

// =============================================================================
// TEST 8 — Round conservation from each completed knockout fixture: the winner
// reaches the next round with probability 1, the loser with probability 0. This
// validates transition logic directly from reality (both halves together).
// =============================================================================
(function testRoundConservation(){
  category("Transition");
  const nextOf={R32:"R16",R16:"QF",QF:"SF",SF:"Final",Final:"Champion"};
  for(const r of results){
    const o=outcome(r);
    if(!o||!KO.includes(r.group)) continue;
    const nxt=nextOf[r.group];
    check(`winner ${o.winner} of played ${r.group} reaches ${nxt} w.p. 1`,
      approx(mc[o.winner][nxt],1,0.0001), `got ${mc[o.winner][nxt]}`);
    check(`loser ${o.loser} of played ${r.group} reaches ${nxt} w.p. 0`,
      mc[o.loser][nxt]===0, `got ${mc[o.loser][nxt]}`);
  }
})();

// =============================================================================
// TEST 9 — Forward-probability extinction is permanent: once a team's probability
// of reaching some round is 0, it is 0 for every later round too. (A stronger,
// per-team form of monotonicity aimed at the exact bug in §16: probability must
// never "reappear" downstream of a 0.)
// =============================================================================
(function testExtinction(){
  category("Temporal");
  for(const t of Object.keys(mc)){
    let extinct=false;
    for(const field of ROUND_FIELDS){
      if(extinct){
        check(`${t}.${field}=0 after earlier extinction`, mc[t][field]===0, `got ${mc[t][field]}`);
      }
      if(mc[t][field]===0) extinct=true;
    }
  }
})();

// =============================================================================
// TEST 10 — Determinism: with a fixed seed, two runs produce identical output
// UNDER IDENTICAL EXECUTION CONDITIONS (same runtime/engine/platform). Without a
// seed, runs differ, confirming the seed is what pins them. Note the guarantee is
// reproducibility on a supported runtime, not bit-identity across all platforms:
// floating-point and iteration-order details can vary if the engine is ported.
// What matters here is that on this runtime a fixed seed is fully reproducible,
// which is what makes regression comparison and bisection possible.
// =============================================================================
(function testDeterminism(){
  category("Engine");
  if(typeof M.seedRNG!=="function"){ check("seedRNG exported", false, "not found"); return; }
  const w=M.WEIGHT_PRESETS.evidence;
  const sp=M.buildStaticProbs(w,{}),mp=M.buildMarketProbs(w,{},null),b=M.buildBaseProbs(w,{},null);
  let el=M.seedElo(b);
  for(const r of results) if(r.scoreA!=null) el=M.applyEloResult(el,r).elo;
  const played=results.filter(r=>r.scoreA!=null).length;
  const sW=w.wFIFA,mW=(w.wPredMarket||0)+(w.wSportsBook||0);
  const probs=M.liveBlendProbs({staticProbs:sp,marketProbs:mp,elo:el,matchesPlayed:played,
    marketWeight:mW,staticWeight:sW,marketAgeHours:0,baseProbs:b,teamsAlive:M.countTeamsAlive(results)});

  M.seedRNG(12345); const runA=M.runMonteCarlo(probs, 4000, results, M.FIXTURES);
  M.seedRNG(12345); const runB=M.runMonteCarlo(probs, 4000, results, M.FIXTURES);
  M.seedRNG(null); // restore nondeterminism so other tests / production are unaffected

  let identical=true, firstDiff=null;
  for(const t of Object.keys(runA)){
    for(const f of ROUND_FIELDS){
      if(runA[t][f]!==runB[t][f]){ identical=false; firstDiff=`${t}.${f}: ${runA[t][f]} vs ${runB[t][f]}`; break; }
    }
    if(!identical) break;
  }
  check("same seed → identical output (this runtime)", identical, firstDiff||"");
})();

// =============================================================================
// TEST 11 — Local (per-match) conservation: for every UNRESOLVED knockout match
// whose two participants are both known, exactly one advances, so
//   P(A reaches next round) + P(B reaches next round) = 1.
// This is a local conservation law that catches bracket-propagation bugs which
// global conservation (Champion sum = 1) can miss — e.g. probability leaking to a
// third team, or an unplayed match double-counting an advancer.
// =============================================================================
(function testLocalConservation(){
  category("Transition");
  const nextOf={R32:"R16",R16:"QF",QF:"SF",SF:"Final",Final:"Champion"};
  const rounds=M.resolveKnockoutRounds(results, M.FIXTURES);
  for(const rnd of KO){
    const nxt=nextOf[rnd];
    for(const m of rounds[rnd]||[]){
      if(m.played) continue;              // resolved matches are covered by Test 8
      const pa=mc[m.a]?.[nxt]??0, pb=mc[m.b]?.[nxt]??0;
      check(`local conservation ${m.a}+${m.b} -> ${nxt} = 1`,
        approx(pa+pb, 1, 0.0001), `got ${(pa+pb).toFixed(4)} (${pa}+${pb})`);
    }
  }
})();

// ---- report: overall + per-category breakdown --------------------------------
const CAT_ORDER=["Probability","Tournament","Transition","Temporal","Engine"];
console.log("\nRegression tests: "+passed+" passed, "+failed+" failed.\n");
console.log("By invariant category:");
for(const c of CAT_ORDER){
  const cc=catCounts[c]; if(!cc) continue;
  const tag = cc.failed ? (cc.failed+" FAILED") : "ok";
  console.log("  "+c.padEnd(12)+String(cc.passed).padStart(4)+" passed"+(cc.failed?("  "+tag):""));
}
// surface any category that wasn't in the expected order (guards against a new
// block being added without a category tag)
for(const c of Object.keys(catCounts)){
  if(!CAT_ORDER.includes(c)) console.log("  "+c.padEnd(12)+String(catCounts[c].passed).padStart(4)+" passed  (uncategorized — tag this block)");
}

if(failed){
  console.log("\nFAILURES:");
  for(const f of failures) console.log("  !!  "+f);
  process.exit(1);
} else {
  console.log("\nAll invariants hold. The forecast is conditional on the current state.");
  process.exit(0);
}
