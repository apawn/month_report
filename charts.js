/* Local report charts. No data providers, network calls or remote resources. */
(() => {
'use strict';
const L=window.LightweightCharts, datasets=window.REPORT_CHARTS, mounted=new Map(), views=new WeakMap(),focusers=new Map();
const clone=x=>JSON.parse(JSON.stringify(x));
const fmt=x=>Number.isFinite(x)?x.toFixed(2):'—';
const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dist=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
function init(panel){
 if(panel.dataset.ready)return;
 const events=new AbortController();const on=(el,name,fn,options={})=>el?.addEventListener(name,fn,{...(typeof options==='boolean'?{capture:options}:options),signal:events.signal});
 const data=datasets[panel.dataset.chart], daily=data.tf==='1D',rows=data.rows,n=rows.length;
 // About half a month: ten trading sessions on daily charts, two weeks on weekly charts.
 const rightPadding=daily?10:2;
 const host=panel.querySelector('.chart-host'),status=panel.querySelector('.drawing-status'),legend=panel.querySelector('.chart-legend');
 const say=(s,important=false)=>{status.textContent=s;status.hidden=!important;};
 host.replaceChildren();
 const chart=L.createChart(host,{autoSize:true,layout:{background:{type:'solid',color:'#ffffff'},textColor:'#516775',fontSize:12,attributionLogo:true,panes:{separatorColor:'#e3eaf0',separatorHoverColor:'#adc4db',enableResize:true}},grid:{vertLines:{color:'#f1f4f7'},horzLines:{color:'#edf1f4'}},rightPriceScale:{borderColor:'#d9e2e9',minimumWidth:78,scaleMargins:{top:.1,bottom:.1}},timeScale:{borderColor:'#d9e2e9',timeVisible:false,rightOffset:rightPadding,barSpacing:9,minBarSpacing:2},crosshair:{mode:L.CrosshairMode.Normal,vertLine:{visible:true,labelVisible:true,color:'#7c899b',width:1,style:2},horzLine:{visible:true,labelVisible:true,color:'#7c899b',width:1,style:2}},localization:{locale:'en-US',dateFormat:'yyyy-MM-dd'},handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:{time:true,price:true},axisDoubleClickReset:{time:true,price:true},mouseWheel:false,pinch:true}});
 const candle=chart.addSeries(L.CandlestickSeries,{upColor:'#fff',downColor:'#111b24',borderUpColor:'#111b24',borderDownColor:'#111b24',wickUpColor:'#111b24',wickDownColor:'#111b24',priceLineColor:'#8797a8',priceLineWidth:1});
 candle.setData(rows.map(({time,open,high,low,close})=>({time,open,high,low,close})));
 const fullDay=daily&&data.current_day_24h;
 const premarket=daily&&!fullDay&&(data.overnight||data.premarket),extendedLabel=data.overnight?'夜盘':'盘前';
 if(premarket)candle.createPriceLine({price:premarket.price,color:'#a66317',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:extendedLabel});
 const line=(values,color,pane=0,title='')=>{const s=chart.addSeries(L.LineSeries,{color,lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,title},pane);s.setData(rows.flatMap((r,i)=>Number.isFinite(values[i])?[{time:r.time,value:values[i]}]:[]));return s;};
 line(data.ema20,'#238197');line(data.ema60,'#c67d27');if(data.ema200)line(data.ema200,'#9852b3');
 if(daily){
  const k=line(data.k,'#246cbb',1,'K');line(data.d,'#c87f28',1,'D');
  for(const price of [20,80])k.createPriceLine({price,color:'#b8c6d3',lineWidth:1,lineStyle:2,axisLabelVisible:false,title:''});
  chart.panes()[0].setStretchFactor(8.5);chart.panes()[1].setStretchFactor(1.5);
 }else{
  const vol=chart.addSeries(L.HistogramSeries,{color:'#9caab4',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false},1);
  vol.setData(rows.map(r=>({time:r.time,value:r.volume||0})));chart.panes()[0].setStretchFactor(6.5);chart.panes()[1].setStretchFactor(1);
 }
 const key='paaa.drawings.v1.'+(window.REPORT_STORAGE_SCOPE?window.REPORT_STORAGE_SCOPE+'.':'')+data.symbol+'.'+data.tf;
 let measurement=null,measureDown=null,viewport=null,initialView=null,supportClick=null,selectedAnalysis=-1;
 let drawings=[],selected=-1,tool='select',pending=[],hover=null,drag=null,undo=[],redo=[],showAnalysis=panel.querySelector('.show-analysis')?.checked??true,redraw=()=>{},saved=true;
 const indexByDate=new Map(rows.map((r,i)=>[r.time,i]));
 const codec=window.ReportDrawingState.create(rows,data.overlays),analysis=codec.analysis;
 const analysisStarts=new Map(analysis.filter(d=>d.type!=='mark').map(d=>[d.sourceId,Math.min(...d.p.map(p=>p[0]))]));
 const trendOwners=new Set(analysis.filter(d=>['trend','channel'].includes(d.type)&&window.ReportDrawingState.roleOf(d)==='trend').map(d=>d.sourceId));
 const {encode,decode}=codec;let hiddenAnalysis=new Set();
 function snapshot(){return {drawings:clone(drawings),hiddenAnalysis:[...hiddenAnalysis]};}
 function restore(state){drawings=clone(state.drawings);hiddenAnalysis=new Set(state.hiddenAnalysis);}
 function suppressed(){return new Set([...hiddenAnalysis,...drawings.map(d=>d.sourceId).filter(Boolean)]);}
 function visible(d){return !d.sourceId||showAnalysis;}
 function visibleAnalysis(d,hidden){return window.ReportDrawingState.analysisVisible(d,hidden,panel.querySelector('.show-candidates')?.checked??false);}
 const proximity=window.ReportLineProximity.create(rows,data.tf),nearBox=document.createElement('div');
 nearBox.className='line-proximity';nearBox.hidden=true;
 panel.querySelector('.chart-side-label>div').append(nearBox);
 let lastNearHTML='',confluences=[];
 function updateProximity(){
  const hidden=suppressed(),lines=[...(showAnalysis?analysis.filter(d=>visibleAnalysis(d,hidden)):[]),...drawings.filter(visible)];
  const matches=proximity.evaluate(lines);
  confluences=window.ReportConfluenceUI.update(panel.dataset.chart,lines);
  const content=matches.map(m=>`<div class="near-line ${m.side}${m.crossed?' crossed':''}"><b>${m.crossed?(m.side==='upper'?'略越上沿':'略破下沿'):(m.side==='upper'?'接近上沿':'接近下沿')}</b><span>${fmt(m.value)}</span><small>距 ${m.percent.toFixed(1)}%</small>${m.projected?'<small>延长线</small>':''}</div>`).join('');
  if(content!==lastNearHTML){nearBox.innerHTML=content;lastNearHTML=content;}
  nearBox.hidden=!matches.length;
  nearBox.title=`快照 ${proximity.date}，最新收盘/快照价 ${fmt(proximity.close)}；接近范围 ≤0.5 ATR(14) 且 ≤现价2%。日线最多延长5根、周线2根；不表示反转确认。`;
 }
 try{const raw=localStorage.getItem(key);if(raw){const state=JSON.parse(raw),loaded=decode(state.drawings),hidden=codec.decodeHidden(state.hiddenAnalysis);drawings=loaded;hiddenAnalysis=new Set(hidden);initialView=window.ReportViewport.rebase(state.view,rows,data.previousTimeAxis)||null;showAnalysis=state.analysisVisible!==false;const toggle=panel.querySelector('.show-analysis');if(toggle)toggle.checked=showAnalysis;}}catch(e){saved=false;say('本地画线未能恢复：'+e.message+'。可通过导出文件备份。',true);}
 function save(){window.ReportToolbar?.sync();try{localStorage.setItem(key,JSON.stringify({version:1,symbol:data.symbol,tf:data.tf,drawings:encode(drawings),hiddenAnalysis:[...hiddenAnalysis],analysisVisible:showAnalysis,view:viewport?.snapshot()??undefined}));saved=true;}catch(e){saved=false;}panel.dataset.drawingCount=drawings.length;say(`画线${saved?'已保存到当前浏览器':'存储不可用，请导出备份'}。分析线与手画线均可拖动端点／整线、删除、撤销。调整不重算原分析结论。`,!saved);redraw();}
 function checkpoint(){undo.push(snapshot());if(undo.length>100)undo.shift();redo=[];}
 const pos=p=>({x:chart.timeScale().logicalToCoordinate(p[0]),y:candle.priceToCoordinate(p[1])});
 function geometry(d){
  if(d.type==='fib')return window.ReportFibonacci.geometry(d.p,pos);
  const p=d.p.map(pos),width=chart.paneSize(0).width;
  if(p.some(p=>p.x===null||p.y===null))return {points:[],segments:[]};
  if(d.type==='horizontal')return {points:p,segments:[[{x:0,y:p[0].y},{x:width,y:p[0].y}]]};
  if(d.type==='rect'){if(p.length<2)return {points:p,segments:[]};const [a,b]=p;return {points:p,handles:[a,b,{x:a.x,y:b.y},{x:b.x,y:a.y}],rect:[Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y)],segments:[[a,{x:b.x,y:a.y}],[{x:b.x,y:a.y},b],[b,{x:a.x,y:b.y}],[{x:a.x,y:b.y},a]]};}
  let a=p[0],b=p[1];if(!b)return {points:p,segments:[]};
  if(d.extend){const end=chart.timeScale().logicalToCoordinate(Math.max(n-1,d.p[1][0])),slope=(b.y-a.y)/(b.x-a.x||1);b={x:end,y:a.y+slope*(end-a.x)};}
  const segments=[[a,b]];
  if(d.type==='channel'&&p[2]){const offset=p[2].y-(a.y+(b.y-a.y)*(p[2].x-a.x)/(b.x-a.x||1));segments.push([{x:a.x,y:a.y+offset},{x:b.x,y:b.y+offset}]);}
  return {points:p,segments};
 }
 let labelBoxes=[];
 function drawLabel(ctx,text,x,y,color){
  // Keep stored labels/source IDs intact so existing edited lines still match.
  if(/^[UB]\d+\s+(?:高点|低点)(?:\s|$)/.test(text||''))return;
  if(/^C\d+[ab]?(?:\s|$)/.test(text||''))return;
  if(/^R\d+(?:\s|$)/.test(text||''))text=text.replace(/^R\d+\s*/,'').replace(/首次回补/g,'回补');
  if(/\p{Script=Han}/u.test(text||''))return;
  if(/^\s*[+-]?[\d,]+(?:\.\d+)?\s*$/.test(text||''))return;
  const size=chart.paneSize(0);if(x<0||x>size.width||y<0||y>size.height)return;
  ctx.font='11px sans-serif';const w=ctx.measureText(text).width+8;
  x=Math.max(4,Math.min(x,size.width-w-4));
  for(const dy of [0,-16,16,-32,32,-48,48]){
   const yy=Math.max(14,Math.min(y+dy,size.height-6)),box={x,y:yy-12,w,h:15};
   if(labelBoxes.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y))continue;
   labelBoxes.push(box);ctx.fillStyle='#ffffffd9';ctx.fillRect(box.x-2,box.y,w,15);ctx.fillStyle=color;ctx.fillText(text,x,yy);break;
  }
 }
 function paint(ctx,d,isSelected=false){
  const g=geometry(d);if(!g.points.length)return;
  if(d.type==='mark'){
   // Hide trend/channel touch dots; editing handles and confluence fills are separate.
   if(d.origin&&(trendOwners.has(d.ownerId)||d.p[0][0]===analysisStarts.get(d.ownerId)))return;
   const p=g.points[0],size=chart.paneSize(0);if(p.x<0||p.x>size.width||p.y<0||p.y>size.height)return;
   ctx.save();ctx.fillStyle=d.color;ctx.strokeStyle=d.color;ctx.lineWidth=1.3;
   if(d.origin){ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();}
   else{const sign=d.above?-1:1;ctx.beginPath();ctx.moveTo(p.x,p.y+sign*6);ctx.lineTo(p.x,p.y+sign*24);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y+sign*3);ctx.lineTo(p.x-4,p.y+sign*11);ctx.lineTo(p.x+4,p.y+sign*11);ctx.closePath();ctx.fill();drawLabel(ctx,d.label,p.x+6,p.y+sign*31,d.color);}
   ctx.restore();return;
  }
  const style=window.ReportDrawingState.appearance(d);
  ctx.save();ctx.strokeStyle=style.color;ctx.fillStyle=style.fill||d.fill||'#3b82f615';ctx.lineWidth=isSelected?style.width+.6:style.width;ctx.setLineDash(style.dash);
  if(d.type==='fib'){window.ReportFibonacci.draw(ctx,g,chart.paneSize(0),isSelected);ctx.strokeStyle='#557bc1';}else if(g.rect){ctx.fillRect(...g.rect);if(isSelected&&window.ReportDrawingState.roleOf(d)==='support'){ctx.strokeStyle='#8aafe099';ctx.setLineDash([4,3]);ctx.strokeRect(...g.rect);}else if(d.border!==false&&window.ReportDrawingState.roleOf(d)!=='support')ctx.strokeRect(...g.rect);}else{for(const [a,b] of g.segments){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
  const paneSize=chart.paneSize(0),labelVisible=!g.rect||(g.rect[0]+g.rect[2]>=0&&g.rect[0]<=paneSize.width&&g.rect[1]+g.rect[3]>=0&&g.rect[1]<=paneSize.height);
  if(d.label&&labelVisible){const a={...g.points[d.labelAtEnd?g.points.length-1:0]};if(d.labelAtTop&&g.rect)a.y=g.rect[1];if(a.x<0&&g.points.length>1&&g.points[1].x>0){const b=g.points[1];a.y=a.y+(b.y-a.y)*(5-a.x)/(b.x-a.x);a.x=5;}drawLabel(ctx,d.label,a.x+5,a.y-7,d.color||'#456');}
  if(isSelected){ctx.setLineDash([]);let handles=g.handles||g.points;if(window.ReportDrawingState.roleOf(d)==='gap')handles=handles.length>1?[handles.reduce((right,p)=>p.x>=right.x?p:right)]:[];for(const p of handles){ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.stroke();}}
  ctx.restore();
 }
 function paintConfluences(ctx){
  for(const r of confluences){
   const p=pos([r.index,r.value]);if(p.x===null||p.y===null)continue;
   ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.strokeStyle='#aa619dbb';ctx.lineWidth=1.2;ctx.stroke();
   ctx.restore();
  }
 }
 const renderer={draw(target){target.useMediaCoordinateSpace(({context:ctx,mediaSize})=>{ctx.save();ctx.beginPath();ctx.rect(0,0,mediaSize.width,mediaSize.height);ctx.clip();labelBoxes=[];const hidden=suppressed();if(showAnalysis)for(const d of analysis)if(visibleAnalysis(d,hidden))paint(ctx,d,analysis[selectedAnalysis]===d);drawings.forEach((d,i)=>{if(visible(d))paint(ctx,d,i===selected);});paintConfluences(ctx);if(measurement)window.ReportMeasure.draw(ctx,rows,measurement.p,pos,chart.paneSize(0));if(pending.length){const p=pending.concat(hover?[hover]:[]);paint(ctx,{type:tool==='support'?'rect':tool==='fib'?'fib':'trend',lineRole:tool,p},true);}ctx.restore();});}};
 const view={zOrder:()=> 'top',renderer:()=>renderer};
 // Reduce main price-pane whitespace in pixels while leaving the axes and indicators intact.
 let marginHeight=0,marginFrame=null;
 function updatePriceMargins(){
  const height=chart.paneSize(0).height;if(!(height>0)||Math.abs(height-marginHeight)<1)return;
  marginHeight=height;cancelAnimationFrame(marginFrame);
  marginFrame=requestAnimationFrame(()=>{if(events.signal.aborted)return;chart.priceScale('right').applyOptions({scaleMargins:{top:(Math.max(6,height*.1-15)+(daily?15:20))/height,bottom:(Math.max(6,height*.1-(daily?80:60))+(daily?0:20))/height}});});
 }
 const primitive={attached({requestUpdate}){redraw=()=>{updateProximity();requestUpdate();};},paneViews:()=>[view],updateAllViews:updatePriceMargins};
 candle.attachPrimitive(primitive);
 function reset(){const count=Number(data.default);chart.priceScale('right').applyOptions({autoScale:true});chart.timeScale().setVisibleLogicalRange({from:Math.max(0,n-count)-.5,to:n-.5+rightPadding});redraw();}
 reset();
 viewport=window.ReportViewport.create(chart,rows,host,initialView||views.get(panel),view=>{
  localStorage.setItem(key,JSON.stringify({version:1,symbol:data.symbol,tf:data.tf,drawings:encode(drawings),hiddenAnalysis:[...hiddenAnalysis],analysisVisible:showAnalysis,view}));
 },err=>say('图表视图未能保存或恢复：'+err.message,true));
 focusers.set(panel.dataset.chart,()=>reset());
 function choose(t,keepMeasurement=false){supportClick=null;selectedAnalysis=-1;tool=t;window.ReportToolbar?.sync();if(!keepMeasurement)measurement=null;measureDown=null;pending=[];hover=null;selected=-1;panel.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));host.classList.toggle('drawing',t!=='select');say(t==='select'?'浏览：点击分析线或手画线，拖动端点／整线；空白处拖动平移，图内滚轮滚动页面。':({measure:'拖动或点选两个位置测量涨跌与时间；每次启用测量一次，完成后点击空白处清除。',fib:'依次点击走势起点（1）和终点（0），绘制回撤比例与价位。',trend:'依次点击两个不同日期的锚点。',support:'依次点击矩形的两个对角，设置支撑／阻力的时间范围和价格区间。',gap:'先点缺口参考价位，再点回补或结束日期，绘制橙色点划线。'}[t])+' Esc 取消。');redraw();}
 panel.querySelectorAll('[data-tool]').forEach(b=>on(b,'click',()=>choose(b.dataset.tool)));
 function hit(p){
  function check(d,ref){const g=geometry(d),handles=g.handles||g.points;for(let j=0;j<handles.length;j++)if(Math.hypot(p.x-handles[j].x,p.y-handles[j].y)<10)return {...ref,anchor:j};if(g.segments.some(([a,b])=>dist(p,a,b)<7))return {...ref,anchor:-1};if(g.rect&&p.x>=g.rect[0]&&p.x<=g.rect[0]+g.rect[2]&&p.y>=g.rect[1]&&p.y<=g.rect[1]+g.rect[3])return {...ref,anchor:-1};return null;}
  for(let i=drawings.length-1;i>=0;i--){if(!visible(drawings[i]))continue;const h=check(drawings[i],{i});if(h)return h;}
  if(showAnalysis){const hidden=suppressed();for(let i=analysis.length-1;i>=0;i--){const d=analysis[i];if(d.type==='mark'||!visibleAnalysis(d,hidden))continue;const h=check(d,{analysisIndex:i});if(h)return h;}}
  return null;
 }

 function supportRegion(h){const d=h&&(h.analysisIndex!==undefined?analysis[h.analysisIndex]:drawings[h.i]);return d?.type==='rect'&&window.ReportDrawingState.roleOf(d)==='support';}
 function eventPoint(e){const b=host.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
 function toAnchor(p){const l=chart.timeScale().coordinateToLogical(p.x),price=candle.coordinateToPrice(p.y);if(l===null||price===null||!Number.isFinite(price))return null;return [Math.max(0,Math.round(l)),price];}
 function inPane(p){const s=chart.paneSize(0);return p.x>=0&&p.y>=0&&p.x<s.width&&p.y<s.height;}
 // Wheel events scroll the page everywhere; scaling uses axis dragging.
 on(host,'pointerdown',e=>{
  supportClick=null;if(e.button!==0)return;const p=eventPoint(e);if(!inPane(p))return;const a=toAnchor(p);if(!a)return;
  const h=tool==='select'?hit(p):null;if(tool==='select'&&!h){selected=-1;selectedAnalysis=-1;measurement=null;redraw();return;}
  // Let the chart pan through an unselected support region. A completed click selects it.
  if(tool==='select'&&supportRegion(h)&&!(h.analysisIndex!==undefined?selectedAnalysis===h.analysisIndex:selected===h.i)){supportClick={hit:h,point:p,pointerId:e.pointerId};return;}
  e.preventDefault();e.stopImmediatePropagation();host.focus({preventScroll:true});host.setPointerCapture(e.pointerId);
  if(tool==='measure'){
   if(measurement&&!measurement.complete){measurement.p[1]=a;measurement.complete=true;choose('select',true);}
   else{measurement={p:[a,a],complete:false};measureDown={point:p};}
   redraw();return;
  }
  if(tool!=='select'){
   if(pending.length===1&&pending[0][0]===a[0]){say('第二个锚点请选择不同日期。',true);return;}
   if(['support','fib'].includes(tool)&&pending.length&&pending[0][1]===a[1]){say('请选择不同价位，确定区间宽度。',true);return;}
   const levelTool=tool==='gap';
   pending.push(levelTool&&pending.length?[a[0],pending[0][1]]:a);
   if(pending.length===2){checkpoint();drawings.push({type:tool==='support'?'rect':tool==='fib'?'fib':'trend',lineRole:tool,p:clone(pending)});choose('select');selected=drawings.length-1;save();}else{hover=a;redraw();}
  }else{checkpoint();selectedAnalysis=-1;if(h.analysisIndex!==undefined){const original=analysis[h.analysisIndex];drawings.push({...clone(original),label:(original.label||'分析线')+' · 已调整',extend:false});h.i=drawings.length-1;}selected=h.i;drag={...h,start:a,original:clone(drawings[h.i].p)};say('已选中 '+(drawings[h.i].label||'手画线')+'：拖端点调整，拖线移动，Delete 删除。');redraw();}
 },true);
 on(host,'pointermove',e=>{
  const p=eventPoint(e),a=toAnchor(p);if(supportClick&&Math.hypot(p.x-supportClick.point.x,p.y-supportClick.point.y)>4)supportClick=null;if(!a)return;
  if(tool==='measure'){
   if(measurement&&!measurement.complete&&inPane(p)){measurement.p[1]=a;redraw();}
   if(measureDown){e.preventDefault();e.stopImmediatePropagation();}
   return;
  }
  if(drag){e.preventDefault();e.stopImmediatePropagation();const d=drawings[drag.i];if(d.type==='rect'&&drag.anchor>=2){const xIndex=drag.anchor===2?0:1,yIndex=1-xIndex;d.p=clone(drag.original);d.p[xIndex][0]=a[0];d.p[yIndex][1]=a[1];}else if(drag.anchor>=0){const other=drag.anchor===0?1:0;if((['trend','channel','fib'].includes(d.type))&&drag.anchor<2&&a[0]===d.p[other][0])return;if(d.type==='fib'&&a[1]===d.p[other][1])return;d.p[drag.anchor]=a;if(['support','gap'].includes(d.lineRole)&&d.type==='trend'&&drag.original[0][1]===drag.original[1][1])d.p[other][1]=a[1];}else{const xs=drag.original.map(p=>p[0]);const dx=Math.max(-Math.min(...xs),a[0]-drag.start[0]),dy=a[1]-drag.start[1];d.p=drag.original.map(p=>[p[0]+dx,p[1]+dy]);}redraw();}
  else if(tool!=='select'){hover=inPane(p)?(tool==='gap'&&pending.length?[a[0],pending[0][1]]:a):null;redraw();}else{const h=inPane(p)?hit(p):null;const ready=h&&(h.analysisIndex!==undefined?selectedAnalysis===h.analysisIndex:selected===h.i);host.style.cursor=h?(supportRegion(h)&&!ready?'pointer':'move'):'';}
 },true);
 const end=e=>{if(supportClick){const click=supportClick;supportClick=null;const p=eventPoint(e);if(e.pointerId===click.pointerId&&Math.hypot(p.x-click.point.x,p.y-click.point.y)<=4&&inPane(p)){selected=click.hit.i??-1;selectedAnalysis=click.hit.analysisIndex??-1;measurement=null;redraw();}}if(measureDown){const p=eventPoint(e);if(Math.hypot(p.x-measureDown.point.x,p.y-measureDown.point.y)>4&&measurement)measurement.complete=true;measureDown=null;if(measurement?.complete)choose('select',true);else redraw();}if(drag){drag=null;save();}if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId);};
 on(host,'pointerup',end,true);on(host,'pointercancel',e=>{supportClick=null;if(measureDown){measurement=null;measureDown=null;redraw();}if(drag){restore(undo.pop());drag=null;selected=-1;redraw();}if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId);},true);
 on(host,'pointerleave',()=>{supportClick=null;});
 on(host,'keydown',e=>{if(e.key==='Escape'){if(drag){restore(undo.pop());drag=null;}choose('select');}if(['Delete','Backspace'].includes(e.key)){e.preventDefault();removeSelected();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey);}});
 function removeSelected(){supportClick=null;if(selectedAnalysis>=0){checkpoint();hiddenAnalysis.add(analysis[selectedAnalysis].sourceId);selectedAnalysis=-1;save();return;}if(measurement&&selected<0){measurement=null;measureDown=null;redraw();return;}drag=null;if(selected<0){say('先点击要删除的分析线或手画线。',true);return;}checkpoint();if(drawings[selected].sourceId)hiddenAnalysis.add(drawings[selected].sourceId);drawings.splice(selected,1);selected=-1;save();}
 function history(forward){supportClick=null;selectedAnalysis=-1;if(drag){restore(undo.pop());drag=null;selected=-1;save();return;}const source=forward?redo:undo,dest=forward?undo:redo;if(!source.length)return;dest.push(snapshot());restore(source.pop());selected=-1;pending=[];save();}
 panel.querySelectorAll('[data-action]').forEach(b=>on(b,'click',()=>{
  const action=b.dataset.action;
  if(action==='reset')reset();
  if(action==='expand'){host.classList.toggle('expanded');b.textContent=host.classList.contains('expanded')?'恢复高度':'放大图表';}
  if(action==='delete')removeSelected();if(action==='undo')history(false);if(action==='redo')history(true);
  if(action==='restore-analysis'){checkpoint();drawings=drawings.filter(d=>!d.sourceId);hiddenAnalysis.clear();selected=-1;save();say('已恢复本图原始分析线；手画线保留，可撤销。');}
  if(action==='export'){const content={version:1,symbol:data.symbol,tf:data.tf,captured:data.captured,drawings:encode(drawings),hiddenAnalysis:[...hiddenAnalysis]};const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`${data.symbol}-${data.tf}-drawings.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('已导出手画线、分析线调整与删除记录。');}
 }));
 on(panel.querySelector('.import-file'),'change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2000000)throw Error('文件过大');const j=JSON.parse(await f.text());if(j.version!==1||j.symbol!==data.symbol||j.tf!==data.tf)throw Error('股票或周期不匹配');const imported=decode(j.drawings),hidden=codec.decodeHidden(j.hiddenAnalysis);checkpoint();for(const d of imported){const i=d.sourceId?drawings.findIndex(x=>x.sourceId===d.sourceId):-1;if(i>=0)drawings[i]=d;else drawings.push(d);}for(const id of hidden)hiddenAnalysis.add(id);save();}catch(err){say('导入失败：'+err.message,true);}finally{e.target.value='';}});
 on(panel.querySelector('.show-candidates'),'change',()=>{selectedAnalysis=-1;redraw();});
 on(panel.querySelector('.show-analysis'),'change',e=>{showAnalysis=e.target.checked;if(!showAnalysis){selectedAnalysis=-1;if(drawings[selected]?.sourceId)selected=-1;}save();});
 function showValues(i=n-1,price=null){const r=rows[i];legend.innerHTML=`<b>${escapeText(data.symbol)} · ${r.time}</b>　开 ${fmt(r.open)}　高 ${fmt(r.high)}　低 ${fmt(r.low)}　收 ${fmt(r.close)}${price===null?'':`　光标 ${fmt(price)}`}　<span class="ema20">EMA20 ${fmt(data.ema20[i])}</span>　<span class="ema60">EMA60 ${fmt(data.ema60[i])}</span>${data.ema200?`　<span class="ema200">EMA200 ${fmt(data.ema200[i])}</span>`:''}${daily?`　K ${fmt(data.k[i])} / D ${fmt(data.d[i])}`:''}${data.current_day_24h_unavailable?`<br><span style="color:#a66317">${escapeText(data.current_day_24h_unavailable)}</span>`:''}${fullDay?`<br><span style="color:#a66317">${escapeText(fullDay.trading_date)} 日K含夜盘 · 24小时口径（形成中） · 北京时间 ${escapeText(fullDay.label_time)} 快照 · 历史K线及周线保留原口径</span>`:''}${premarket?`<br><span style="color:#a66317">${extendedLabel}快照 ${fmt(premarket.price)}（较昨收 ${premarket.change_percent>=0?'+':''}${fmt(premarket.change_percent)}%） · 北京时间 ${escapeText(premarket.label_time)} · 未计入K线/EMA</span>`:''}`;}
 chart.subscribeCrosshairMove(p=>{const time=typeof p.time==='string'?p.time:p.time&&typeof p.time==='object'?`${p.time.year}-${String(p.time.month).padStart(2,'0')}-${String(p.time.day).padStart(2,'0')}`:null;const i=indexByDate.get(time);showValues(i===undefined?n-1:i,p.point&&p.paneIndex===0?candle.coordinateToPrice(p.point.y):null);});
 choose('select');showValues();panel.dataset.ready='true';panel.dataset.drawingCount=drawings.length;
 window.ReportToolbar?.register(panel,{choose,state:()=>({tool,analysisVisible:showAnalysis}),action:a=>{if(a==='delete')removeSelected();if(a==='undo')history(false);},toggle:value=>{showAnalysis=value;if(!value&&drawings[selected]?.sourceId)selected=-1;save();}});
 window.ReportDrawingExport?.register(panel.dataset.chart,()=>({version:1,symbol:data.symbol,tf:data.tf,drawings:encode(drawings),hiddenAnalysis:[...hiddenAnalysis],analysisVisible:showAnalysis,view:viewport?.snapshot()??undefined}),state=>{
  const loaded=decode(state.drawings),hidden=codec.decodeHidden(state.hiddenAnalysis);
  checkpoint();drawings=loaded;hiddenAnalysis=new Set(hidden);initialView=window.ReportViewport.rebase(state.view,rows,data.previousTimeAxis)||null;showAnalysis=state.analysisVisible!==false;
  const toggle=panel.querySelector('.show-analysis');if(toggle)toggle.checked=showAnalysis;
  if(state.view)viewport.restore(state.view);
  drag=null;choose('select');save();
 });
 const priceAlerts=window.ReportPriceAlerts?.create({chart,series:candle,host,panel,symbol:data.symbol,tf:data.tf,scope:window.REPORT_STORAGE_SCOPE||location.pathname});
 mounted.set(panel,()=>{window.ReportToolbar?.unregister(panel);views.set(panel,viewport.snapshot());viewport.dispose();cancelAnimationFrame(marginFrame);window.ReportDrawingExport?.unregister(panel.dataset.chart);events.abort();priceAlerts?.dispose();chart.remove();nearBox.remove();focusers.delete(panel.dataset.chart);delete panel.dataset.ready;host.innerHTML='<div class="chart-placeholder">滚动到此处载入交互图…</div>';mounted.delete(panel);});
 // Distant canvases are released to keep the 60-chart report responsive.
}
const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&e.target.clientWidth){try{init(e.target);}catch(err){const status=e.target.querySelector('.drawing-status');status.hidden=false;status.textContent='交互图载入失败：'+err.message;console.error(err);}}for(const [panel,dispose] of mounted){const box=panel.getBoundingClientRect();if(mounted.size>6&&(box.bottom < -1800||box.top>window.innerHeight+1800))dispose();}},{rootMargin:'250px'});
document.querySelectorAll('.interactive-panel').forEach(p=>observer.observe(p));
document.addEventListener('report:confluence-focus',e=>{
 const panel=[...document.querySelectorAll('.interactive-panel')].find(p=>p.dataset.chart===e.detail.key);
 if(panel){init(panel);focusers.get(e.detail.key)?.();}
});
})();
