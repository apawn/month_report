/* Saved price levels only. This module neither fetches prices nor sends notifications. */
((root)=>{
 function create({chart,series,host,panel,symbol,tf,scope,storage=localStorage}){
  const key='paaa.price-alerts.v1.'+scope+'.'+symbol+'.'+tf,events=new AbortController();
  let levels=[],lines=[],markers=[],frame=null,disposed=false,preview=null,drag=null;
  const rail=document.createElement('div');rail.className='price-alert-rail';rail.setAttribute('aria-label','价格预警操作');panel.querySelector('.chart-plot-shell').append(rail);
  const add=document.createElement('button');add.type='button';add.className='price-alert-add';add.textContent='+';add.title='在此价格添加预警';add.setAttribute('aria-label','添加预警');add.hidden=true;rail.append(add);
  const box=document.createElement('details');box.className='price-alerts';box.title='点击价格数字右侧的加号设置。仅保存价位，尚未启用到价通知。';
  panel.querySelector('.chart-panel-header').append(box);
  function error(){const status=panel.querySelector('.drawing-status');if(status){status.hidden=false;status.textContent='预警价位未能保存或恢复，请检查浏览器本地存储。';}}
  function render(){
   for(const line of lines)series.removePriceLine(line);lines=[];for(const m of markers){m.button.remove();m.handle.remove();}markers=[];box.replaceChildren();
   const summary=document.createElement('summary');summary.textContent='预警位'+(levels.length?' · '+levels.length:'');box.append(summary);
   const content=document.createElement('div');content.className='price-alert-list';const note=document.createElement('p');note.textContent='点击价格数字右侧的加号设置。仅保存价位，尚未启用到价通知。';content.append(note);
   for(const price of levels){
    lines.push(series.createPriceLine({price,color:'#a865c2',lineWidth:1,lineStyle:2,axisLabelVisible:false,title:''}));
    const row=document.createElement('div'),label=document.createElement('span'),remove=document.createElement('button');label.textContent=series.priceFormatter().format(price);remove.type='button';remove.textContent='🗑';remove.title='删除此预警位';remove.setAttribute('aria-label','删除预警位 '+label.textContent);remove.addEventListener('click',()=>commit(levels.filter(x=>x!==price)));row.append(label,remove);content.append(row);
    const button=document.createElement('button');button.type='button';button.className='price-alert-remove';button.textContent='🗑';button.title='删除预警 '+label.textContent;button.setAttribute('aria-label',button.title);button.addEventListener('click',e=>{e.stopPropagation();commit(levels.filter(x=>x!==price));});rail.append(button);const handle=document.createElement('span');handle.className='price-alert-handle';handle.textContent=series.priceFormatter().format(price);handle.title='预警价位；修改请删除后重新添加';handle.setAttribute('aria-label',handle.title);rail.append(handle);markers.push({price,button,handle});
   }box.append(content);schedule();
  }
  function commit(next){try{storage.setItem(key,JSON.stringify({version:1,symbol,tf,levels:next}));levels=next;render();}catch{error();}}
  try{const raw=storage.getItem(key);if(raw){const saved=JSON.parse(raw);if(saved.version!==1||!Array.isArray(saved.levels)||!saved.levels.every(Number.isFinite))throw Error('invalid');levels=[...new Set(saved.levels)];}}catch{error();}render();
  function position(){frame=null;if(disposed)return;const height=chart.paneSize(0).height;rail.style.height=height+'px';for(const m of markers){const y=series.priceToCoordinate(m.price);m.button.hidden=!Number.isFinite(y)||y<0||y>height;m.handle.hidden=m.button.hidden;if(!m.button.hidden){const top=Math.max(0,Math.min(height-24,y-12))+'px';m.button.style.top=top;m.handle.style.top=top;}}}
  function schedule(){if(!disposed&&frame===null)frame=requestAnimationFrame(position);}
  function priceAt(y){if(!Number.isFinite(y)||y<0||y>=chart.paneSize(0).height)return null;const raw=series.coordinateToPrice(y);if(!Number.isFinite(raw))return null;const tick=series.options().priceFormat.minMove||.01;return Number((Math.round(raw/tick)*tick).toFixed(10));}
  function clearPreview(){if(preview){series.removePriceLine(preview);preview=null;}}
  function showPreview(y){const price=priceAt(y);if(price===null){clearPreview();return;}const options={price,color:'#4285f4',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:''};if(preview)preview.applyOptions(options);else preview=series.createPriceLine(options);}
  function pointerY(e){return e.clientY-host.getBoundingClientRect().top;}
  rail.addEventListener('pointermove',e=>{if(drag)return;const y=pointerY(e),height=chart.paneSize(0).height;showPreview(y);add.hidden=y<0||y>=height||(e.target.classList.contains('price-alert-remove')||e.target.classList.contains('price-alert-handle'));if(!add.hidden){add.style.top=Math.max(0,Math.min(height-24,y-12))+'px';add.dataset.y=String(y);}}, {signal:events.signal});
  rail.addEventListener('pointerleave',()=>{add.hidden=true;if(!drag)clearPreview();},{signal:events.signal});
  rail.addEventListener('click',e=>{if(e.target!==rail&&e.target!==add)return;const y=e.target===add?Number(add.dataset.y):pointerY(e);if(!Number.isFinite(y)||y<0||y>=chart.paneSize(0).height)return;const raw=series.coordinateToPrice(y);if(!Number.isFinite(raw))return;const tick=series.options().priceFormat.minMove||.01,price=Number((Math.round(raw/tick)*tick).toFixed(10));if(!levels.includes(price))commit([...levels,price].sort((a,b)=>a-b));add.hidden=true;if(!drag)clearPreview();},{signal:events.signal});
  const primitive={updateAllViews:schedule,paneViews:()=>[]};series.attachPrimitive(primitive);schedule();
  return {dispose(){disposed=true;clearPreview();events.abort();if(frame!==null)cancelAnimationFrame(frame);series.detachPrimitive(primitive);for(const line of lines)series.removePriceLine(line);box.remove();rail.remove();}};

 }
 root.ReportPriceAlerts={create};
})(typeof window!=='undefined'?window:globalThis);
