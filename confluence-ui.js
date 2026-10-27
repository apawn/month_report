/* Confluence overview and chart-side notes. Uses only packaged data/local drawings. */
(() => {
'use strict';
const data=window.REPORT_CHARTS,entries=new Map();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price=r=>r.high-r.low<.01?r.value.toFixed(2):`${r.low.toFixed(2)}–${r.high.toFixed(2)}`;
const name=r=>({support:'支撑叠加',resistance:'阻力叠加',mixed:'支阻交汇'}[r.side]);
const overview=document.createElement('section');overview.className='confluence-overview';
overview.setAttribute('aria-label','多线叠加重点');
document.querySelector('main>header').after(overview);
let scheduled=false;
function renderOverview(){
 scheduled=false;const all=[...entries].flatMap(([key,e])=>e.results.map(r=>({key,...r})));
 const group=(title,items,empty)=>`<div class="confluence-group"><h3>${title}</h3>${items.length?'<div class="confluence-links">'+items.map(r=>{
  const d=data[r.key];return `<a href="#${entries.get(r.key).panel.id}" data-confluence-chart="${esc(r.key)}" data-index="${r.index}"><b>${esc(d.symbol)} · ${d.tf==='1D'?'日线':'周线'}</b><span>${r.count}线${name(r)} · ${price(r)}</span><small>${r.date}${r.projected?' · 短延长线':''}</small></a>`;
 }).join('')+'</div>':`<p class="confluence-empty">${empty}</p>`}</div>`;
 overview.innerHTML='<h2>多线叠加重点</h2><p>支撑／阻力、趋势线与通道边界的几何重合。点击跳到对应图表；历史重合按现有画线回看，不表示当前买点或反转确认。</p>'+
  group('当前价格附近',all.filter(r=>r.current),'当前保存的快照价附近暂无符合条件的多线叠加。')+
  group('历史重合位置',all.filter(r=>!r.current).sort((a,b)=>b.date.localeCompare(a.date)),'暂无符合条件的历史重合。');
}
function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(renderOverview);}}
function update(key,lines){
 const e=entries.get(key);if(!e)return [];
 const signature=JSON.stringify(lines);if(signature===e.signature)return e.results;
 e.signature=signature;e.results=e.calc.evaluate(lines);
 e.box.hidden=!e.results.length;
 e.box.innerHTML=e.results.map(r=>`<div class="confluence-note ${r.side} ${r.current?'current':''}"><b>${name(r)}</b><span>${r.count}条线${r.current?' · 当前':''}</span><strong>${r.high-r.low<.01?r.value.toFixed(2):r.low.toFixed(2)+'<br>–'+r.high.toFixed(2)}</strong><small>${r.current?'当前快照':'历史重合'}</small><small class="confluence-date">${r.date}</small><small>${r.kind}${r.projected?' · 延长线':''}</small></div>`).join('');
 e.box.title='重合范围 ≤0.35 ATR(14) 且 ≤当时价格1%；价格位于附近。已排除近乎平行线、重复近似线与同一通道两侧；几何叠加不等于独立交易证据。';
 schedule();return e.results;
}
for(const panel of document.querySelectorAll('.interactive-panel')){
 const key=panel.dataset.chart,d=data[key];panel.id=`chart-${d.symbol}-${d.tf}`;
 const box=document.createElement('div');box.className='confluence-side';box.hidden=true;
 panel.querySelector('.chart-side-label>div').append(box);
 const e={panel,box,calc:window.ReportLineConfluence.create(d.rows,d.tf),results:[],signature:null};entries.set(key,e);
 const codec=window.ReportDrawingState.create(d.rows,d.overlays);let drawings=[],hidden=[],analysisVisible=true;
 try{const raw=localStorage.getItem(`paaa.drawings.v1.${window.REPORT_STORAGE_SCOPE?window.REPORT_STORAGE_SCOPE+'.':''}${d.symbol}.${d.tf}`);if(raw){const s=JSON.parse(raw);drawings=codec.decode(s.drawings);hidden=codec.decodeHidden(s.hiddenAnalysis);analysisVisible=s.analysisVisible!==false;}}
 catch{ // Do not silently present stale originals as the user's edited geometry.
  e.signature='unavailable';continue;
 }
 const suppressed=new Set([...hidden,...drawings.map(d=>d.sourceId).filter(Boolean)]);
 update(key,[...(analysisVisible?codec.analysis.filter(d=>window.ReportDrawingState.analysisVisible(d,suppressed,entries.get(key).panel.querySelector('.show-candidates')?.checked??false)):[]),...drawings.filter(d=>analysisVisible||!d.sourceId)]);
}
document.addEventListener('report:drawings-imported',event=>{
 for(const key of event.detail.keys){
  const d=data[key];if(!d)continue;
  const codec=window.ReportDrawingState.create(d.rows,d.overlays);
  const state=JSON.parse(localStorage.getItem(`paaa.drawings.v1.${window.REPORT_STORAGE_SCOPE?window.REPORT_STORAGE_SCOPE+'.':''}${d.symbol}.${d.tf}`));
  const drawings=codec.decode(state.drawings),hidden=codec.decodeHidden(state.hiddenAnalysis);
  const suppressed=new Set([...hidden,...drawings.map(d=>d.sourceId).filter(Boolean)]);
  update(key,[...(state.analysisVisible===false?[]:codec.analysis.filter(d=>window.ReportDrawingState.analysisVisible(d,suppressed,entries.get(key).panel.querySelector('.show-candidates')?.checked??false))),...drawings.filter(d=>state.analysisVisible!==false||!d.sourceId)]);
 }
});
overview.addEventListener('click',event=>{
 const a=event.target.closest('a[data-confluence-chart]');if(!a)return;
 event.preventDefault();const key=a.dataset.confluenceChart,e=entries.get(key);
 e.panel.scrollIntoView({block:'start',behavior:'auto'});
 try{history.replaceState(null,'','#'+encodeURIComponent(e.panel.id));}catch{}
 document.dispatchEvent(new CustomEvent('report:confluence-focus',{detail:{key,index:Number(a.dataset.index)}}));
});
window.ReportConfluenceUI={update};renderOverview();
})();
