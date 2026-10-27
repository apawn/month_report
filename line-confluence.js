/* Local geometric confluence, using bar coordinates and ATR at the event date. */
((root)=>{
'use strict';
function create(rows,tf){
 const last=rows.length-1,first=Math.max(14,rows.length-(tf==='1D'?240:104));
 const atrs=[];let atr=0;
 for(let i=1;i<rows.length;i++){
  const r=rows[i],tr=Math.max(r.high-r.low,Math.abs(r.high-rows[i-1].close),Math.abs(r.low-rows[i-1].close));
  atr=i<=14?atr+tr/14:(atr*13+tr)/14;if(i>=14)atrs[i]=atr;
 }
 function evaluate(drawings){
  const segments=[];
  drawings.forEach((d,idx)=>{
   const zone=d.type==='rect'&&d.lineRole==='support';
   if((!['trend','channel','horizontal'].includes(d.type)&&!zone)||d.dash)return;
   const [a,b,c]=d.p||[],label=d.label||'';
   if(!a||!a.every(Number.isFinite))return;
   if(zone&&(!b||!b.every(Number.isFinite)))return;
   const horizontal=zone||d.type==='horizontal'||(b&&a[1]===b[1]);
   if(!horizontal&&(!b||b[0]===a[0]))return;
   const slope=horizontal?0:(b[1]-a[1])/(b[0]-a[0]);
   const start=d.type==='horizontal'?0:Math.min(a[0],b[0]),end=d.type==='horizontal'?last:Math.max(a[0],b[0]);
   const intercept=a[1]-slope*a[0],offset=d.type==='channel'&&c?c[1]-slope*c[0]-intercept:null;
   // The two edges of one channel do not count as independent structures.
   const group=/^C\d+/.exec(label)?.[0]||d.sourceId||`manual:${idx}`;
   const role=d.lineRole||(/^R\d+/.test(label)?'gap':horizontal?'support':'trend');
   const kind=role==='gap'?'缺口线':role==='support'?(zone?'支撑阻力区间':'支撑阻力线'):offset!==null||/^C\d+/.test(label)?'通道线':'趋势线';
   for(const off of offset===null?[0]:[0,offset]){
    const side=offset!==null?(off===Math.max(0,offset)?'upper':'lower'):
     /^U\d+\s/.test(label)?'upper':/^B\d+\s/.test(label)?'lower':
     /^R\d+/.test(label)?(d.color==='#208367'?'lower':'upper'):null;
    segments.push({zone,zoneLow:zone?Math.min(a[1],b[1]):null,zoneHigh:zone?Math.max(a[1],b[1]):null,slope,intercept:intercept+off,start,end,projectionEnd:d.projectionEnd,extend:!!d.extend,group,kind,side,id:segments.length});
   }
  });
  const records=[];
  for(let i=first;i<=last;i++){
   const r=rows[i],atr=atrs[i];if(!(atr>0))continue;
   const tolerance=Math.min(.35*atr,.01*Math.abs(r.close));
   const eligible=segments.filter(s=>i>=s.start+2&&(i<=s.end||s.extend||
    (i===last&&(!Number.isFinite(s.projectionEnd)||i<=s.projectionEnd)&&s.slope!==0&&i-s.end<=(tf==='1D'?5:2))))
    .map(s=>({...s,value:s.slope*i+s.intercept})).filter(s=>s.value>0&&Number.isFinite(s.value)).sort((a,b)=>a.value-b.value);
   // Treat zones as intervals: compare each line with the nearest price inside
   // the zone, not merely its edges. One rectangle remains one structure.
   const seeds=eligible.some(s=>s.zone)?[r.close,...eligible.map(s=>s.value)]:[null];
   for(const seed of seeds){
   const points=eligible.map(s=>s.zone?{...s,value:Math.max(s.zoneLow,Math.min(s.zoneHigh,seed))}:s).sort((a,b)=>a.value-b.value);
   for(let k=0;k<points.length;k++){
    const cluster=[];
    for(let j=k;j<points.length&&points[j].value-points[k].value<=tolerance;j++){
     const s=points[j];
     if(cluster.some(t=>{
      if(s.group===t.group)return true;
      if(s.zone||t.zone)return false;
      // Similar-direction traces are not a meaningful multi-line junction.
      // Relative slope avoids making this depend on chart zoom or price units.
      const maxSlope=Math.max(Math.abs(s.slope),Math.abs(t.slope));
      if(maxSlope===0||(s.slope*t.slope>0&&Math.abs(s.slope-t.slope)<=maxSlope*.2))return true;
      const lo=Math.max(s.start,t.start),hi=Math.min(s.end,t.end);
      // Near-identical traces across their common span are one structure.
      return Math.max(Math.abs((s.slope-t.slope)*lo+s.intercept-t.intercept),
       Math.abs((s.slope-t.slope)*hi+s.intercept-t.intercept))<atr*.15;
     }))continue;
     cluster.push(s);
    }
    if(cluster.length<2)continue;
    const low=cluster[0].value,high=cluster.at(-1).value,value=(low+high)/2;
    // Require price to be in the area, not an intersection floating in empty space.
    const priceDistance=i===last?Math.abs(r.close-value):Math.max(low-r.high,r.low-high,0);
    const nearThreshold=Math.min(.5*atr,.02*Math.abs(r.close));
    if(priceDistance>nearThreshold)continue;
    const sides=cluster.map(s=>s.side|| (value>=(r.high+r.low)/2?'upper':'lower'));
    const side=sides.every(s=>s==='lower')?'support':sides.every(s=>s==='upper')?'resistance':'mixed';
    records.push({index:i,date:r.time,low,high,value,count:cluster.length,side,
     kind:[...new Set(cluster.map(s=>s.kind))].join('＋'),current:i===last,
     projected:cluster.some(s=>i>s.end),ids:cluster.map(s=>s.id).sort((a,b)=>a-b),
     quality:(high-low)/tolerance+priceDistance/nearThreshold});
   }
  }
  }
  // Keep one representative per nearby episode; prefer more structures and tighter overlap.
  const chosen=[];
  records.sort((a,b)=>Number(b.current)-Number(a.current)||b.count-a.count||a.quality-b.quality||b.index-a.index);
  for(const r of records){
   if(chosen.some(s=>r.ids.some(id=>s.ids.includes(id))&&
    ((r.ids.join(',')===s.ids.join(','))||(Math.abs(r.index-s.index)<=5&&Math.abs(r.value-s.value)<=atrs[r.index]))))continue;
   chosen.push(r);
  }
  // Never drop a valid older junction just because newer ones also exist.
  const current=chosen.filter(r=>r.current);
  const history=chosen.filter(r=>!r.current).sort((a,b)=>b.index-a.index||b.count-a.count);
  return [...current,...history];
 }
 return {evaluate};
}
const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReportLineConfluence=api;
})(globalThis);
