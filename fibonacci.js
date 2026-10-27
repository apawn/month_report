/* Two-anchor retracement in price space. No data access or automatic signals. */
((root)=>{
'use strict';
const ratios=Object.freeze([0,.236,.382,.5,.618,.786,1]);
const colors=['#697789','#bf6464','#ad8435','#369579','#288b98','#557bc1','#697789'];
function levels(points){
 if(points.length!==2)return [];
 const start=points[0][1],end=points[1][1];
 if(!Number.isFinite(start)||!Number.isFinite(end))return [];
 return ratios.map((ratio,i)=>({ratio,price:end+(start-end)*ratio,color:colors[i]}));
}
function geometry(points,pos){
 const anchors=points.map(pos);
 if(anchors.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return {points:[],segments:[]};
 if(anchors.length!==2)return {points:anchors,segments:[]};
 const left=Math.min(anchors[0].x,anchors[1].x),right=Math.max(anchors[0].x,anchors[1].x);
 const bands=levels(points).map(level=>({...level,y:pos([points[0][0],level.price]).y})).filter(level=>Number.isFinite(level.y));
 return {points:anchors,levels:bands,left,right,segments:[anchors,...bands.map(({y})=>[{x:left,y},{x:right,y}])]};
}
function draw(ctx,g,size,selected){
 if(!g.levels)return;
 ctx.save();
 for(let i=1;i<g.levels.length;i++){
  const a=g.levels[i-1],b=g.levels[i];
  ctx.fillStyle=b.color+'0c';ctx.fillRect(g.left,Math.min(a.y,b.y),g.right-g.left,Math.abs(a.y-b.y));
 }
 ctx.lineWidth=1;ctx.strokeStyle='#8793a5';ctx.setLineDash([4,4]);
 ctx.beginPath();ctx.moveTo(g.points[0].x,g.points[0].y);ctx.lineTo(g.points[1].x,g.points[1].y);ctx.stroke();
 ctx.setLineDash([]);ctx.lineWidth=selected?1.5:1;
 ctx.font='11px -apple-system, sans-serif';ctx.textBaseline='bottom';
 for(const level of g.levels){
  ctx.strokeStyle=level.color;ctx.beginPath();ctx.moveTo(g.left,level.y);ctx.lineTo(g.right,level.y);ctx.stroke();
  if(g.right<0||g.left>size.width||level.y<0||level.y>size.height)continue;
  const text=`${level.ratio}  (${level.price.toFixed(2)})`,w=ctx.measureText(text).width;
  const x=Math.max(4,Math.min(g.right-w-5,size.width-w-4)),y=Math.max(14,level.y-3);
  ctx.fillStyle='#ffffffdf';ctx.fillRect(x-2,y-12,w+4,14);ctx.fillStyle=level.color;ctx.fillText(text,x,y);
 }
 ctx.restore();
}
const api={ratios,levels,geometry,draw};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReportFibonacci=api;
})(globalThis);
