// LEAN REFRESH REGENERATION — usage-conscious.
// Key savings vs. the old approach:
//   1. SNAP_PRE is FROZEN (pre-tournament baseline). We DO NOT recompute it — we
//      read the existing constant straight out of the file. Saves one full 60k sim.
//   2. Only TWO simulations run: "now" (current results) and "yesterday" (for the
//      movers panel). Both at a configurable N (default 30k — title odds are stable
//      to <0.1% by 30k; movers below ~0.3% are already disclosed as noise).
// Usage: node /tmp/regen_lean.js <yesterday_cutoff_index> [N]
//   yesterday_cutoff_index = number of results that count as "through yesterday"
//   (i.e. results.length BEFORE today's newly added matches).
const fs=require('fs');
const SRC='/mnt/user-data/outputs/worldcup2026.jsx';
const src=fs.readFileSync(SRC,'utf8');
const cutoff=parseInt(process.argv[2]);
const N=parseInt(process.argv[3]||'30000');
if(isNaN(cutoff)){ console.error('Need yesterday cutoff index'); process.exit(1); }

// ENFORCED VERIFICATION (cannot be skipped): run the SAME checks as the standalone
// verifier and ABORT before any simulation if the file isn't safe. This is the
// guardrail the operator can't walk around — regen physically won't run on a bad file.
const {verify}=require(__dirname+'/refresh_verify.js');
const vr=verify(src);
console.log(vr.lines.join('\n'));
if(!vr.pass){
  console.log('\nABORT: verification failed ('+vr.fail+' issue(s)). No simulation run. Fix the file and rerun.');
  process.exit(1);
}
console.log('  -> verification passed; proceeding to simulate.\n');

// Build the engine (everything up to MiniBar)
const lines=src.split('\n');
let end=0;for(let i=0;i<lines.length;i++){if(lines[i].startsWith('function MiniBar')){end=i;break;}}
let code=lines.slice(0,end).join('\n').replace(/^import[^\n]*\n/,'');
code+="\nmodule.exports={buildBaseProbs,buildStaticProbs,buildMarketProbs,WEIGHT_PRESETS,runMonteCarlo,seedElo,applyEloResult,liveBlendProbs,OFFICIAL_RESULTS,SNAP_PRE,gradeResult};";
fs.writeFileSync('/tmp/_eng.js',code);
const M=require('/tmp/_eng.js');
const w=M.WEIGHT_PRESETS.evidence,mods={};

// Scorecard folded in (cheap — no sim, just grading vs frozen pre-tournament model).
try{
  const eng2=fs.readFileSync('/tmp/_eng.js','utf8');
  if(/gradeResult/.test(eng2)){
    const G=require('/tmp/_eng.js');
    if(G.gradeResult){
      const bp=G.buildBaseProbs(w,{},null);
      let c=0,d=0,bs=0,n=0;
      for(const r of G.OFFICIAL_RESULTS){const g=G.gradeResult(r,bp);bs+=g.brier;n++;if(g.correct===null)continue;d++;if(g.correct)c++;}
      console.log('SCORECARD: '+c+'/'+d+' decisive ('+(d?(100*c/d).toFixed(0):0)+'%) | draws '+(n-d)+' | Brier '+(bs/n).toFixed(3)+' over '+n);
    }
  }
}catch(e){ /* grading optional */ }
function fc(rs,n){
  const sp=M.buildStaticProbs(w,mods),mp=M.buildMarketProbs(w,mods,null),b=M.buildBaseProbs(w,mods,null);
  let el=M.seedElo(b);
  for(const r of rs) if(r.scoreA!=null) el=M.applyEloResult(el,r).elo;
  const played=rs.filter(r=>r.scoreA!=null).length;
  const sW=w.wFIFA,mW=(w.wPredMarket||0)+(w.wSportsBook||0);
  return M.runMonteCarlo(M.liveBlendProbs({staticProbs:sp,marketProbs:mp,elo:el,matchesPlayed:played,marketWeight:mW,staticWeight:sW,marketAgeHours:0,baseProbs:b}),n);
}
const all=M.OFFICIAL_RESULTS, prev=all.slice(0,cutoff);
const f=v=>Math.round(v*100000)/100000;
const t0=Date.now();
// ONLY two sims (SNAP_PRE is reused, not recomputed):
const now=fc(all,N), yest=fc(prev,N);
console.log('Ran 2 sims at N='+N+' in '+((Date.now()-t0)/1000).toFixed(1)+'s (SNAP_PRE reused from stored constant — not recomputed)');

// PRECOMPUTED_MC block
const entries=Object.entries(now).sort((a,b)=>b[1].Champion-a[1].Champion);

// Delta log (ChatGPT #4): compare new title odds vs the PREVIOUS PRECOMPUTED_MC in
// the file, so a refresh self-reports movement. Big jumps deserve investigation.
try{
  const prevSrc=fs.readFileSync(SRC,'utf8');
  const pm=prevSrc.match(/const PRECOMPUTED_MC=\{([\s\S]*?)\n\};/);
  if(pm){
    const oldC={};
    for(const ln of pm[1].split('\n')){const mm=ln.match(/"?([\w\s-]+)"?:\{.*Champion:([\d.]+)/);if(mm)oldC[mm[1].replace(/"/g,'').trim()]=parseFloat(mm[2]);}
    let maxd=0,maxt='';
    const deltas=entries.slice(0,6).map(([t,c])=>{const d=(c.Champion-(oldC[t]||0))*100;if(Math.abs(d)>Math.abs(maxd)){maxd=d;maxt=t;}return t+' '+(d>=0?'+':'')+d.toFixed(1);});
    console.log('DELTAS vs last refresh (title %): '+deltas.join(', '));
    if(Math.abs(maxd)>4) console.log('  ** LARGE MOVE: '+maxt+' '+(maxd>=0?'+':'')+maxd.toFixed(1)+'pp — verify this is expected (a contender result?), not a data error.');
  }
}catch(e){ /* delta log optional */ }

let s='// Precomputed Monte Carlo distribution — '+N.toLocaleString()+' simulations.\n';
s+='// SNAP_PRE (pre-tournament baseline) is FROZEN and reused, never recomputed.\n';
s+='// Regenerate "now"+"yesterday" only when new results or odds arrive.\n';
s+='const PRECOMPUTED_MC_N='+N+';\nconst PRECOMPUTED_MC={\n';
for(const[t,c] of entries) s+='  '+JSON.stringify(t)+':{Groups:'+f(c.Groups)+',R32:'+f(c.R32)+',R16:'+f(c.R16)+',QF:'+f(c.QF)+',SF:'+f(c.SF)+',Final:'+f(c.Final)+',Champion:'+f(c.Champion)+'},\n';
s+='};';
fs.writeFileSync('/tmp/_pc.txt',s);

// SNAP_YESTERDAY only — SNAP_PRE is left exactly as-is in the file.
function slim(mc){const o={};for(const[t,c] of Object.entries(mc))o[t]={C:f(c.Champion),R16:f(c.R16)};return o;}
const sy=slim(yest);
let ss='const SNAP_YESTERDAY={\n';
for(const t of Object.keys(sy)) ss+='  '+JSON.stringify(t)+':{C:'+sy[t].C+',R16:'+sy[t].R16+'},\n';
ss+='};';
fs.writeFileSync('/tmp/_sy.txt',ss);
console.log('Wrote /tmp/_pc.txt (PRECOMPUTED_MC) and /tmp/_sy.txt (SNAP_YESTERDAY only).');
console.log('Top 6:');
entries.slice(0,6).forEach(([t,c],i)=>console.log('  '+(i+1)+'. '+t+'  '+(c.Champion*100).toFixed(1)+'%'));
