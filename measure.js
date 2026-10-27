/* Temporary price/time ruler. Uses only loaded rows and logical bar positions. */
((root)=>{
'use strict';
function metrics(rows,a,b){
 const delta=b[1]-a[1],bars=Math.abs(b[0]-a[0]);
 const start=rows[a[0]]?.time,end=rows[b[0]]?.time;
 const days=start&&end?Math.abs(Date.parse(end)-Date.parse(start))/86400000:null;
 return {delta,percent:a[1]===0?null:delta/a[1]*100,bars,days:Number.isFinite(days)?days:null,start,end};
}
function draw(ctx,rows,points,project,size){
 if(points.length<2)return;
 const [a,b]=points.map(project);if([a.x,a.y,b.x,b.y].some(v=>v===null||!Number.isFinite(v)))return;
 const m=metrics(rows,...points),color=m.delta>=0?'#2878cf':'#d4516d';
 const signed=v=>(v>0?'+':'')+v.toFixed(2);
 const labels=[`${signed(m.delta)} (${m.percent===null?'—':signed(m.percent)+'%'})`,`${m.bars} bars${m.days===null?'':' · '+m.days+'d'}`];
 ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color+'22';ctx.lineWidth=1;ctx.setLineDash([]);
 ctx.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));
 const arrow=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();if(Math.hypot(x2-x1,y2-y1)<8)return;const t=Math.atan2(y2-y1,x2-x1);ctx.beginPath();ctx.moveTo(x2-6*Math.cos(t-.5),y2-6*Math.sin(t-.5));ctx.lineTo(x2,y2);ctx.lineTo(x2-6*Math.cos(t+.5),y2-6*Math.sin(t+.5));ctx.stroke();};
 arrow(a.x,a.y,b.x,a.y);arrow(b.x,a.y,b.x,b.y);
 for(const p of [a,b]){ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
 ctx.font='12px ui-monospace, monospace';
 const width=Math.max(...labels.map(s=>ctx.measureText(s).width))+20,height=48;
 const x=Math.max(4,Math.min((a.x+b.x-width)/2,size.width-width-4));
 let y=Math.max(a.y,b.y)+10;if(y+height>size.height-4)y=Math.min(a.y,b.y)-height-10;y=Math.max(4,Math.min(y,size.height-height-4));
 ctx.fillStyle=color;ctx.fillRect(x,y,width,height);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
 labels.forEach((s,i)=>ctx.fillText(s,x+width/2,y+14+i*20));ctx.restore();
}
const api={metrics,draw};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReportMeasure=api;
})(globalThis);
