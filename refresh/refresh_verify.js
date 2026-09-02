// POST-APPEND VERIFIER — checks the file is safe to simulate.
// Catches: bad append (syntax), duplicate matches, market-input errors
// (negatives, denormalized sum, implausible favorite).
//
// Used TWO ways, sharing ONE implementation of the checks (verify()):
//   1. Standalone CLI:  node refresh_verify.js [expectedNewCount]
//   2. Imported by refresh_regen.js, which calls verify() and ABORTS the
//      simulation if it fails — so verification can't be skipped.
const fs=require('fs');

function verify(src){
  const out=[]; let fail=0;
  const ok=(m)=>out.push('  OK  '+m);
  const bad=(m)=>{out.push('  !!  '+m);fail++;};

  // syntax parse
  try{ require('/tmp/node_modules/@babel/standalone').transform(src,{presets:['react']}); ok('syntax parses'); }
  catch(e){ bad('SYNTAX ERROR: '+e.message.split('\n')[0]); }

  // results: count + duplicates
  const rb=src.match(/OFFICIAL_RESULTS\s*=\s*\[([\s\S]*?)\n\];/);
  if(!rb){ bad('OFFICIAL_RESULTS not found'); }
  else{
    const res=[];
    for(const line of rb[1].split('\n')){
      const d=line.match(/date:"([^"]+)"/),a=line.match(/teamA:"([^"]+)"/),b=line.match(/teamB:"([^"]+)"/);
      if(d&&a&&b) res.push({date:d[1],a:a[1],b:b[1]});
    }
    out.push('  ..  logged results: '+res.length);
    const seen=new Map(); let dups=0;
    for(const r of res){const k=r.date+'|'+[r.a,r.b].sort().join('~');if(seen.has(k)){bad('DUPLICATE: '+r.date+' '+r.a+' v '+r.b);dups++;}seen.set(k,1);}
    if(!dups) ok('no duplicate matches');
  }

  // market sanity
  for(const name of ['SPORTS_BOOK','PRED_MARKET']){
    const m=src.match(new RegExp('const '+name+'\\s*=\\s*\\{([\\s\\S]*?)\\n\\};'));
    if(!m){bad(name+' not found');continue;}
    const vals=[...m[1].matchAll(/:\s*(-?[\d.]+)/g)].map(x=>parseFloat(x[1]));
    const sum=vals.reduce((a,b)=>a+b,0), neg=vals.filter(v=>v<0).length, max=Math.max(...vals);
    if(neg) bad(name+': '+neg+' NEGATIVE probability(ies)'); else ok(name+': no negatives');
    // model renormalizes internally, so raw sum is cosmetic; far-off sum = entry error
    if(sum<0.90||sum>1.10) bad(name+': sums to '+sum.toFixed(3)+' (way off — likely entry error)');
    else ok(name+': sums to '+sum.toFixed(3)+' (fine; model renormalizes)');
    if(max>0.30) bad(name+': favorite at '+(max*100).toFixed(0)+'% (>30% — typo?)');
    else ok(name+': favorite '+(max*100).toFixed(0)+'% (plausible)');
  }

  return {pass:fail===0, fail, lines:out};
}

module.exports={verify};

// CLI mode
if(require.main===module){
  const src=fs.readFileSync(__dirname+'/worldcup2026.jsx','utf8');
  const r=verify(src);
  console.log(r.lines.join('\n'));
  console.log(r.pass? '\nVERIFY PASSED — safe to regenerate.' : '\nVERIFY FAILED ('+r.fail+' issue(s)) — fix before regenerating.');
  process.exit(r.pass?0:1);
}
