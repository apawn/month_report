/* Snapshot-only proximity to currently displayed, recent sloping boundaries. */
((root)=>{
'use strict';
function create(rows,tf){
 const last=rows.length-1,close=rows[last]?.close;
 // Wilder ATR(14), seeded with the first fourteen true ranges.
 let atr=null;
 for(let i=1;i<rows.length;i++){
  const r=rows[i],prev=rows[i-1].close,tr=Math.max(r.high-r.low,Math.abs(r.high-prev),Math.abs(r.low-prev));
  if(i<=14)atr=(atr||0)+tr/14;else atr=(atr*13+tr)/14;
 }
 const threshold=rows.length>=15?Math.min(atr*.5,Math.abs(close)*.02):0;
 function evaluate(lines){
  if(!(threshold>0&&close>0))return [];
  const result=[];
  for(const d of lines){
   if(!['trend','channel'].includes(d.type)||d.dash)continue;
   const [a,b,c]=d.p||[];
   if(!a||!b||a[0]===b[0]||a[1]===b[1])continue;
   const start=Math.min(a[0],b[0]),end=Math.max(a[0],b[0]);
   // A short projection only; never revive distant historical segments.
   if(last<start||(!d.extend&&last-end>(tf==='1D'?5:2)))continue;
   if(!d.extend&&Number.isFinite(d.projectionEnd)&&last>d.projectionEnd)continue;
   const slope=(b[1]-a[1])/(b[0]-a[0]),base=a[1]+slope*(last-a[0]);
   const offset=d.type==='channel'&&c?c[1]-(a[1]+slope*(c[0]-a[0])):null;
   const boundaries=offset===null?[base]:[base,base+offset];
   for(const value of boundaries){
    const distance=Math.abs(close-value);
    if(!Number.isFinite(value)||value<=0||distance>threshold)continue;
    const label=d.label||'';
    const side=offset!==null?(value===Math.max(...boundaries)?'upper':'lower'):
     (/^U\d+\s|上沿/.test(label)?'upper':/^B\d+\s|下沿/.test(label)?'lower':value>=close?'upper':'lower');
    // Once price is beyond a known edge, do not call it approaching that edge.
    const crossed=side==='upper'?close>value:close<value;
    result.push({value,distance,percent:distance/close*100,side,crossed,projected:last>end,
     kind:offset!==null||/^C\d+/.test(label)?'channel':'trend',sourceId:d.sourceId||null});
   }
  }
  result.sort((a,b)=>a.distance-b.distance);
  return result.filter((r,i)=>!result.slice(0,i).some(v=>v.side===r.side&&Math.abs(v.value-r.value)<threshold*.15)).slice(0,2);
 }
 return {evaluate,atr,threshold,date:rows[last]?.time,close};
}
const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReportLineProximity=api;
})(globalThis);
