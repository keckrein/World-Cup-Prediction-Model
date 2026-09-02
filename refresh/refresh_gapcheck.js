// Deterministic gap check: which fixtures on/before a cutoff date lack a result?
// Usage: node /tmp/gaps.js "Jun 23"
const fs=require('fs');
const src=fs.readFileSync('worldcup2026.jsx','utf8');
const cutoff=process.argv[2]||null;
const MON={Jun:6,Jul:7};
const toNum=d=>{const[m,day]=d.replace('"','').split(' ');return MON[m]*100+parseInt(day);};
// pull FIXTURES (the full schedule) and OFFICIAL_RESULTS (what's logged)
function rows(block){
  const out=[];
  for(const line of block.split('\n')){
    const d=line.match(/date:"([^"]+)"/), a=line.match(/teamA:"([^"]+)"/), b=line.match(/teamB:"([^"]+)"/);
    if(d&&a&&b) out.push({date:d[1],a:a[1],b:b[1],scored:/scoreA:/.test(line)});
  }
  return out;
}
const fixBlock=src.match(/FIXTURES\s*=\s*\[([\s\S]*?)\n\];/)[1];
const resBlock=src.match(/OFFICIAL_RESULTS\s*=\s*\[([\s\S]*?)\n\];/)[1];
const fixtures=rows(fixBlock), results=rows(resBlock);
const logged=new Set(results.map(r=>r.date+'|'+[r.a,r.b].sort().join('~')));
const cut=cutoff?toNum(cutoff):99999;
const missing=fixtures.filter(f=>toNum(f.date)<=cut && !logged.has(f.date+'|'+[f.a,f.b].sort().join('~')));
if(missing.length===0){ console.log('COMPLETE through '+(cutoff||'all')+': every scheduled match has a result.'); }
else{
  console.log('MISSING '+missing.length+' result(s) on/before '+(cutoff||'all')+':');
  for(const m of missing) console.log('  '+m.date+': '+m.a+' v '+m.b);
}
