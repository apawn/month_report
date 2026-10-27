/* One drawing toolbar for the active local chart. */
(() => {
 const bar=document.querySelector('.global-drawing-toolbar');if(!bar)return;
 const controls=new Map();let active=null,queued=false;
 const label=bar.querySelector('.active-chart-label'),toggle=bar.querySelector('.show-analysis');
 function sync(){
  const api=controls.get(active),state=api?.state();
  label.textContent=active?active.dataset.chart.replace('|1D',' · 日线').replace('|1W',' · 周线'):'请选择图表';
  for(const b of bar.querySelectorAll('button')){b.disabled=!api;if(b.dataset.tool)b.classList.toggle('active',b.dataset.tool===state?.tool);}
  toggle.disabled=!api;toggle.checked=state?.analysisVisible??true;
 }
 function activate(panel,carry=false){
  if(panel===active||!controls.has(panel))return;
  const previous=controls.get(active),tool=carry?previous?.state().tool:'select';
  previous?.choose('select');active?.classList.remove('active-chart');
  active=panel;active.classList.add('active-chart');controls.get(active).choose(tool||'select');sync();
 }
 function track(){
  queued=false;if(controls.get(active)?.state().tool!=='select'&&active)return;
  const edge=bar.getBoundingClientRect().bottom+20;
  const candidates=[...controls.keys()].filter(p=>{const r=p.getBoundingClientRect();return r.bottom>edge&&r.top<innerHeight;});
  candidates.sort((a,b)=>Math.abs(a.getBoundingClientRect().top-edge)-Math.abs(b.getBoundingClientRect().top-edge));
  const covering=candidates.find(p=>p.getBoundingClientRect().top<=edge);
  if(covering||candidates[0])activate(covering||candidates[0]);
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(track);}}
 window.ReportToolbar={
  register(panel,api){controls.set(panel,api);if(!active)activate(panel);schedule();},
  unregister(panel){controls.delete(panel);if(active===panel){active.classList.remove('active-chart');active=null;sync();schedule();}},
  activate, sync
 };
 bar.addEventListener('click',e=>{const b=e.target.closest('button');const api=controls.get(active);if(!b||!api)return;if(b.dataset.tool)api.choose(b.dataset.tool);else if(b.dataset.action)api.action(b.dataset.action);sync();});
 toggle.addEventListener('change',()=>{controls.get(active)?.toggle(toggle.checked);sync();});
 document.addEventListener('pointerdown',e=>{const p=e.target.closest('.interactive-panel');if(p)activate(p,true);},true);
 document.addEventListener('pointerover',e=>{const p=e.target.closest('.interactive-panel');if(p&&!e.buttons)activate(p,true);});
 window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);sync();
})();
