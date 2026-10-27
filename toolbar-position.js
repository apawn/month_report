/* Per-chart floating toolbar placement, independent of drawing geometry. */
(() => {
 for(const panel of document.querySelectorAll('.interactive-panel')){
  const bar=panel.querySelector('.local-drawing-toolbar'),stage=panel.querySelector('.chart-stage');if(!bar||!stage)continue;
  const grip=document.createElement('button');grip.type='button';grip.className='toolbar-grip';grip.textContent='⠿';grip.title='拖动整排按钮；双击恢复默认位置';grip.setAttribute('aria-label','移动操作栏，方向键微调，双击恢复');bar.prepend(grip);
  const key='paaa.toolbar-position.v1.'+(window.REPORT_STORAGE_SCOPE||location.pathname)+'.'+panel.dataset.chart;
  let position=null,drag=null;
  function showError(){const status=panel.querySelector('.drawing-status');if(status){status.hidden=false;status.textContent='操作栏位置未能保存，浏览器存储不可用。';}}
  function apply(){if(!position)return;bar.classList.add('movable-toolbar');const maxX=Math.max(0,stage.clientWidth-bar.offsetWidth),maxY=Math.max(0,stage.clientHeight-bar.offsetHeight);bar.style.left=Math.max(0,Math.min(maxX,position.x))+'px';bar.style.top=Math.max(0,Math.min(maxY,position.y))+'px';}
  function save(){try{if(position)localStorage.setItem(key,JSON.stringify({version:1,...position}));else localStorage.removeItem(key);}catch{showError();}}
  function reset(){drag=null;position=null;bar.classList.remove('movable-toolbar');bar.style.left='';bar.style.top='';save();}
  try{const raw=localStorage.getItem(key);if(raw){const p=JSON.parse(raw);if(p.version!==1||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Invalid position');position={x:p.x,y:p.y};apply();}}catch{showError();}
  grip.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const r=bar.getBoundingClientRect(),s=stage.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:{x:r.left-s.left,y:r.top-s.top},previous:position&&{...position}};grip.setPointerCapture(e.pointerId);});
  grip.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();position={x:drag.start.x+e.clientX-drag.x,y:drag.start.y+e.clientY-drag.y};apply();});
  grip.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;drag=null;if(position){position={x:parseFloat(bar.style.left),y:parseFloat(bar.style.top)};save();}if(grip.hasPointerCapture(e.pointerId))grip.releasePointerCapture(e.pointerId);});
  grip.addEventListener('pointercancel',()=>{if(!drag)return;position=drag.previous;drag=null;if(position)apply();else{bar.classList.remove('movable-toolbar');bar.style.left='';bar.style.top='';}});
  grip.addEventListener('dblclick',reset);
  grip.addEventListener('keydown',e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();const r=bar.getBoundingClientRect(),s=stage.getBoundingClientRect(),step=e.shiftKey?10:2;position={x:r.left-s.left+delta[0]*step,y:r.top-s.top+delta[1]*step};apply();position={x:parseFloat(bar.style.left),y:parseFloat(bar.style.top)};save();});
  new ResizeObserver(apply).observe(stage);
 }
})();
