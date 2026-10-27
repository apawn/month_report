/* Saved viewport via public Lightweight Charts APIs. No network or price data changes. */
((root)=>{
'use strict';
const validRange=r=>r&&Number.isFinite(r.from)&&Number.isFinite(r.to)&&r.from<r.to;
function validate(view,rows){
 if(!view||view.version!==1||!validRange(view.time)||typeof view.time.anchor!=='string'||!Array.isArray(view.panes)||!view.panes.length||view.panes.length>8)throw Error('图表视图格式不正确');
 const shift=rows.findIndex(r=>r.time===view.time.anchor);if(shift<0)throw Error('视图日期不在本图数据中');
 return {version:1,time:{anchor:rows[0].time,from:view.time.from+shift,to:view.time.to+shift},panes:view.panes.map(p=>{
  if(typeof p.autoScale!=='boolean'||!Number.isFinite(p.stretchFactor)||p.stretchFactor<=0||p.stretchFactor>1e9||(!p.autoScale&&!validRange(p.range))||(p.range!==null&&!validRange(p.range))||![0,1,2,3].includes(p.mode)||typeof p.invertScale!=='boolean')throw Error('价格轴视图格式不正确');
  return {autoScale:p.autoScale,range:p.range?{from:p.range.from,to:p.range.to}:null,stretchFactor:p.stretchFactor,mode:p.mode,invertScale:p.invertScale};
 })};
}
// Date-based migration when refreshed loaded data drops old leading bars.
function rebase(view,rows,previousDates=[]){
 if(!view)return null;
 if(rows.some(r=>r.time===view.time?.anchor))return view;
 const oldAnchor=previousDates.indexOf(view.time?.anchor);if(oldAnchor<0)return view;
 const indices=new Map(rows.map((r,i)=>[r.time,i]));
 const shifts=previousDates.flatMap((date,i)=>indices.has(date)?[indices.get(date)-i]:[]);
 if(!shifts.length||shifts.some(x=>x!==shifts[0]))return view;
 const shift=shifts[0]+oldAnchor;
 return {...view,time:{...view.time,anchor:rows[0].time,from:view.time.from+shift,to:view.time.to+shift}};
}
function capture(chart,rows){
 const range=chart.timeScale().getVisibleLogicalRange();if(!validRange(range))return null;
 const panes=chart.panes().map(p=>{const scale=p.priceScale('right'),options=scale.options(),range=scale.getVisibleRange();return {autoScale:options.autoScale,range:validRange(range)?range:null,stretchFactor:p.getStretchFactor(),mode:options.mode,invertScale:options.invertScale};});
 if(panes.some(p=>!p.autoScale&&!p.range))return null;
 return validate({version:1,time:{anchor:rows[0].time,...range},panes},rows);
}
function applyPrices(chart,view){
 const panes=chart.panes();view.panes.forEach((saved,i)=>{
  const pane=panes[i];if(!pane)return;
  const scale=pane.priceScale('right');scale.applyOptions({mode:saved.mode,invertScale:saved.invertScale,autoScale:saved.autoScale});
  if(!saved.autoScale&&saved.range)scale.setVisibleRange(saved.range);
 });
}
function apply(chart,rows,raw){
 const view=validate(raw,rows);view.panes.forEach((p,i)=>chart.panes()[i]?.setStretchFactor(p.stretchFactor));
 chart.timeScale().setVisibleLogicalRange({from:view.time.from,to:view.time.to});applyPrices(chart,view);return view;
}
function create(chart,rows,host,initial,onSave,onError=()=>{}){
 const events=new AbortController();let disposed=false,restoring=false,timer=null,frame=null,frame2=null,last=null,lastSignature='',restoreSerial=0,pressed=false;
 const listen=(el,type,fn)=>el.addEventListener(type,fn,{capture:true,signal:events.signal});
 function snapshot(){return restoring?last:(capture(chart,rows)||last);}
 function flush(){
  if(disposed||restoring)return;
  clearTimeout(timer);timer=null;
  try{const view=snapshot();if(!view)return;const signature=JSON.stringify(view);if(signature===lastSignature)return;onSave(view);last=view;lastSignature=signature;}catch(e){onError(e);}
 }
 function schedule(){if(disposed||restoring)return;clearTimeout(timer);timer=setTimeout(flush,140);}
 function restore(raw){
  const view=validate(raw,rows),serial=++restoreSerial;restoring=true;last=view;
  clearTimeout(timer);cancelAnimationFrame(frame);cancelAnimationFrame(frame2);
  apply(chart,rows,view);
  // The time range and pane sizes are laid out on the next animation frame.
  frame=requestAnimationFrame(()=>{frame2=requestAnimationFrame(()=>{if(disposed||serial!==restoreSerial)return;applyPrices(chart,view);restoring=false;schedule();});});
 }
 chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
 listen(host,'pointerdown',()=>{pressed=true;});
 listen(window,'pointermove',()=>{if(pressed)schedule();});
 const end=()=>{if(pressed){pressed=false;schedule();}};
 listen(window,'pointerup',end);listen(window,'pointercancel',end);
 listen(host,'dblclick',schedule);listen(host,'touchend',schedule);
 listen(window,'pagehide',flush);listen(document,'visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
 if(initial){try{restore(initial);}catch(e){restoring=false;last=null;onError(e);}}
 return {snapshot,restore,flush,dispose(){flush();disposed=true;restoreSerial++;clearTimeout(timer);cancelAnimationFrame(frame);cancelAnimationFrame(frame2);chart.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);events.abort();}};
}
const api={validate,rebase,capture,apply,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReportViewport=api;
})(globalThis);
