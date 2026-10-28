/* Local drawing archive. Same-origin report-folder reads; writes use the browser picker. */
((root)=>{
'use strict';
function collect(datasets,stateAPI,readSaved,readMounted=()=>null,storageScope='',viewAPI=null){
 const charts=[];
 for(const [key,data] of Object.entries(datasets)){
  try{
   const codec=stateAPI.create(data.rows,data.overlays),live=readMounted(key),raw=live||readSaved('paaa.drawings.v1.'+(storageScope?storageScope+'.':'')+data.symbol+'.'+data.tf);
   const state=typeof raw==='string'?JSON.parse(raw):raw;
   if(state&&(state.version!==1||state.symbol!==data.symbol||state.tf!==data.tf))throw Error('股票、周期或版本不匹配');
   const drawings=state?codec.decode(state.drawings):[],hidden=codec.decodeHidden(state?.hiddenAnalysis),suppressed=new Set([...hidden,...drawings.map(d=>d.sourceId).filter(Boolean)]);
   const original=codec.analysis.filter(d=>d.type!=='mark');
   charts.push({version:1,symbol:data.symbol,tf:data.tf,captured:data.captured,drawings:codec.encode(drawings),hiddenAnalysis:hidden,analysisVisible:state?.analysisVisible??true,...(state?.view?{view:viewAPI?viewAPI.validate(viewAPI.rebase(state.view,data.rows,data.previousTimeAxis),data.rows):state.view}:{}),originalAnalysis:codec.encode(original),effectiveDrawings:codec.encode([...original.filter(d=>!suppressed.has(d.sourceId)),...drawings])});
  }catch(e){throw Error(key+' 导出失败：'+e.message);}
 }
 return {format:'paaa-drawings-archive',version:1,exportedAt:new Date().toISOString(),charts};
}
function prepareImport(archive,datasets,stateAPI,viewAPI,storageScope=''){
 if(archive?.format!=='paaa-drawings-archive'||archive.version!==1||!Array.isArray(archive.charts)||!archive.charts.length||archive.charts.length>Object.keys(datasets).length)throw Error('请选择“导出全部画线”生成的 JSON 文件');
 const seen=new Set();
 return archive.charts.map(c=>{
  const key=c.symbol+'|'+c.tf,data=datasets[key];
  if(!data||seen.has(key)||c.version!==1)throw Error(key+' 不匹配或重复');
  seen.add(key);
  const codec=stateAPI.create(data.rows,data.overlays),drawings=codec.decode(c.drawings),hidden=codec.decodeHidden(c.hiddenAnalysis);
  const ids=new Set(codec.analysis.map(d=>d.sourceId).filter(Boolean));
  const unmatched=[...hidden,...drawings.map(d=>d.sourceId).filter(Boolean)].filter(id=>!ids.has(id));
  // A refreshed report can still hold edits/deletions from an older algorithm.
  // Transfer those identities unchanged only when the exported base matches exactly;
  // never attach a historical edit or deletion to a different generated line.
  const sameBase=JSON.stringify(c.originalAnalysis)===JSON.stringify(codec.encode(codec.analysis.filter(d=>d.type!=='mark')));
  function historicalIdentity(id){
   try{
    const suffix=id.slice(id.lastIndexOf(':')+1),parts=JSON.parse(id.slice(8,id.lastIndexOf(':')));
    return /^(0|[1-9]\d*)$/.test(suffix)&&Array.isArray(parts)&&parts.length===3&&['horizontal','trend','rect','channel','fib'].includes(parts[0])&&typeof parts[1]==='string'&&Array.isArray(parts[2])&&parts[2].length>0&&parts[2].every(p=>Array.isArray(p)&&p.length===2&&/^\d{4}-\d{2}-\d{2}$/.test(p[0])&&Number.isFinite(p[1]));
   }catch{return false;}
  }
  if(unmatched.length&&(!sameBase||!unmatched.every(historicalIdentity)))throw Error(key+' 的分析线与当前报告不匹配');
  return {key,storageKey:'paaa.drawings.v1.'+(storageScope?storageScope+'.':'')+data.symbol+'.'+data.tf,state:{version:1,symbol:data.symbol,tf:data.tf,drawings:codec.encode(drawings),hiddenAnalysis:hidden,analysisVisible:c.analysisVisible!==false,...(c.view?{view:viewAPI.validate(c.view,data.rows)}:{})}};
 });
}
function commitImport(entries,storage,backupKey,readMounted=()=>null){
 const before=entries.map(e=>({key:e.key,storageKey:e.storageKey,raw:storage.getItem(e.storageKey),live:readMounted(e.key)}));
 // Keep a recoverable copy before any replacement, including unsaved mounted state.
 storage.setItem(backupKey,JSON.stringify({format:'paaa-before-import',savedAt:new Date().toISOString(),entries:before}));
 const written=[];
 try{for(const e of entries){
  if(!e.state.view){const b=before.find(b=>b.key===e.key);let previous=b.live;try{previous=previous||JSON.parse(b.raw);}catch{}if(previous?.view)e.state.view=previous.view;}
  storage.setItem(e.storageKey,JSON.stringify(e.state));written.push(e.storageKey);}}
 catch(err){let failed=false;for(const b of before.filter(b=>written.includes(b.storageKey))){try{if(b.raw===null)storage.removeItem(b.storageKey);else storage.setItem(b.storageKey,b.raw);}catch{failed=true;}}
  throw Error(failed?'写入失败，部分状态未能恢复；导入前备份仍保留：'+backupKey:'写入失败，已恢复原标注：'+err.message);
 }
}
// Compare annotations, not viewport changes caused by scrolling/resizing charts.
function annotationSignature(archive){
 return JSON.stringify(archive.charts.map(c=>({key:c.symbol+'|'+c.tf,drawings:c.drawings,hiddenAnalysis:c.hiddenAnalysis,analysisVisible:c.analysisVisible!==false})).sort((a,b)=>a.key.localeCompare(b.key)));
}
// Apply each published viewport revision once; subsequent local zoom remains local.
function needsViewSync(current,incoming,baseline){
 if(!incoming.charts.some(c=>c.view))return false;
 if(baseline&&Date.parse(incoming.exportedAt)<Date.parse(baseline.exportedAt))return false;
 if(baseline?.viewExportedAt&&Date.parse(incoming.exportedAt)<=Date.parse(baseline.viewExportedAt))return false;
 const views=a=>JSON.stringify(a.charts.map(c=>({key:c.symbol+'|'+c.tf,view:c.view||null})).sort((a,b)=>a.key.localeCompare(b.key)));
 return views(current)!==views(incoming);
}
function autoDecision(current,incoming,baseline){
 const local=annotationSignature(current),remote=annotationSignature(incoming);
 if(local===remote)return 'same';
 if(baseline&&Date.parse(incoming.exportedAt)<=Date.parse(baseline.exportedAt))return 'older';
 const dirty=baseline?local!==baseline.signature:current.charts.some(c=>c.drawings.length||c.hiddenAnalysis.length||c.analysisVisible===false);
 return dirty?'conflict':'import';
}
if(typeof module!=='undefined'&&module.exports){module.exports={collect,prepareImport,commitImport,annotationSignature,autoDecision,needsViewSync};return;}
const readers=new Map(),writers=new Map();root.ReportDrawingExport={register:(key,read,write)=>{readers.set(key,read);writers.set(key,write);},unregister:key=>{readers.delete(key);writers.delete(key);}};
const report=decodeURIComponent(location.pathname.split('/').slice(-2,-1)[0]||'report'),storageKey=location.pathname;
let directory=null,db=null,busy=false;
const syncKey='paaa.annotation-sync.'+(root.REPORT_STORAGE_SCOPE||storageKey);
function currentArchive(){return collect(root.REPORT_CHARTS,root.ReportDrawingState,key=>localStorage.getItem(key),key=>readers.get(key)?.(),root.REPORT_STORAGE_SCOPE||'',root.ReportViewport);}
function rememberSync(archive){localStorage.setItem(syncKey,JSON.stringify({exportedAt:archive.exportedAt,signature:annotationSignature(archive),viewExportedAt:archive.exportedAt}));}
function applyArchive(archive,entries){
 commitImport(entries,localStorage,'paaa.before-import.'+storageKey,key=>readers.get(key)?.());
 let refreshFailed=false;
 for(const entry of entries){try{writers.get(entry.key)?.(entry.state);}catch{refreshFailed=true;}}
 document.dispatchEvent(new CustomEvent('report:drawings-imported',{detail:{keys:entries.map(e=>e.key)}}));
 if(entries.length===Object.keys(root.REPORT_CHARTS).length)rememberSync(archive);
 return refreshFailed;
}
const ready=new Promise(resolve=>{
 try{const request=indexedDB.open('paaa-export-directories',1);request.onupgradeneeded=()=>request.result.createObjectStore('directories');request.onerror=()=>resolve();request.onblocked=()=>resolve();request.onsuccess=()=>{db=request.result;const get=db.transaction('directories').objectStore('directories').get(storageKey);get.onsuccess=()=>{directory=get.result||null;resolve();};get.onerror=()=>resolve();};}catch{resolve();}
});
function remember(handle){directory=handle;if(db){try{const tx=db.transaction('directories','readwrite');tx.objectStore('directories').put(handle,storageKey);}catch{}}}
function message(button,text){const panel=button.closest('.interactive-panel'),status=panel?.querySelector('.drawing-status')||document.querySelector('.archive-status');if(status){status.hidden=false;status.textContent=text;}}
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-export-all]');if(!button||busy)return;
 busy=true;button.disabled=true;
 try{
  const archive=collect(root.REPORT_CHARTS,root.ReportDrawingState,key=>localStorage.getItem(key),key=>readers.get(key)?.(),root.REPORT_STORAGE_SCOPE||'',root.ReportViewport);archive.report=report;archive.storageScope=root.REPORT_STORAGE_SCOPE||'';
  const text=JSON.stringify(archive,null,2),stamp=new Date().toISOString().replace(/[:.]/g,'-'),name=report+'-全部画线-'+stamp+'.json';
  if(button.hasAttribute?.('data-export-download')||!root.showDirectoryPicker){download(text,name);message(button,'已发起全部 '+archive.charts.length+' 张图的标注下载。请在浏览器下载记录中确认完成，并将文件放入当前报告目录／标注。');return;}
  await ready;
  if(!directory||e.shiftKey){message(button,'请选择当前报告目录，将自动保存到其中的“标注”文件夹。');remember(await root.showDirectoryPicker({id:'paaa-annotations',mode:'readwrite',...(directory?{startIn:directory}:{})}));}
  let permission=await directory.queryPermission({mode:'readwrite'});
  if(permission!=='granted')permission=await directory.requestPermission({mode:'readwrite'});
  if(permission!=='granted')throw Error('所选目录未获写入权限；按住 Shift 点击可重新选择目录');
  const folder=directory.name==='标注'?directory:await directory.getDirectoryHandle('标注',{create:true});
  const file=await folder.getFileHandle(name,{create:true}),writer=await file.createWritable();
  try{await writer.write(text);await writer.close();}catch(err){await writer.abort().catch(()=>{});throw err;}
  rememberSync(archive);
  message(button,'已保存全部 '+archive.charts.length+' 张图的标注：'+directory.name+(directory.name==='标注'?'':'／标注')+'／'+name);
 }catch(err){message(button,err.name==='AbortError'?'目录选择已取消或未完成，文件尚未保存；可点击“下载备份 JSON”导出。':'全部画线未导出：'+err.message);}
 finally{busy=false;button.disabled=false;}
});
document.addEventListener('change',async e=>{
 const input=e.target;if(!input.matches('[data-import-all]')||busy)return;
 const file=input.files[0];if(!file)return;
 busy=true;input.disabled=true;const footer=input.closest('.drawing-archive');footer?.setAttribute('aria-busy','true');
 try{
  if(file.size>25*1024*1024)throw Error('文件超过25MB');
  const archive=JSON.parse(await file.text()),entries=prepareImport(archive,root.REPORT_CHARTS,root.ReportDrawingState,root.ReportViewport,root.REPORT_STORAGE_SCOPE||'');
  const refreshFailed=applyArchive(archive,entries);
  message(input,'已导入 '+entries.length+' 张图的标注，导入前状态已在本地备份。'+(refreshFailed?'部分图表需刷新页面后显示。':''));
 }catch(err){message(input,'全部画线导入失败：'+err.message);}
 finally{busy=false;input.disabled=false;input.value='';footer?.removeAttribute('aria-busy');}
});
// The local static server lists the report's own annotation directory. For file://
// reports use the previously selected directory only when read access is still granted.
async function readFolderArchives(){
 const files=[];
 if(location.protocol==='http:'||location.protocol==='https:'){
  const response=await fetch(new URL('./annotations.json',location.href),{cache:'no-store'});
  if(!response.ok)throw Error('无法读取已发布的标注');
  const text=await response.text();if(text.length>25*1024*1024)throw Error('标注备份超过25MB');
  files.push({name:'annotations.json',text});
 }else{
  await ready;if(!directory)return [];
  if(await directory.queryPermission({mode:'read'})!=='granted')throw Error('请点击“导出全部画线”重新授权标注文件夹，或手动导入最新备份');
  const folder=directory.name==='标注'?directory:await directory.getDirectoryHandle('标注');
  for await(const [name,handle] of folder.entries())if(handle.kind==='file'&&name.endsWith('.json')){const file=await handle.getFile();if(file.size>25*1024*1024)throw Error('标注备份超过25MB');files.push({name,text:await file.text()});}
 }
 return files.map(file=>{let archive;try{archive=JSON.parse(file.text);}catch{throw Error(file.name+' 不是有效的标注 JSON');}return {...file,archive};})
  .filter(f=>f.archive.format==='paaa-drawings-archive'&&Number.isFinite(Date.parse(f.archive.exportedAt)))
  .sort((a,b)=>Date.parse(b.archive.exportedAt)-Date.parse(a.archive.exportedAt)||a.name.localeCompare(b.name));
}
async function autoImportLatest(){
 const statusTarget={closest:()=>null};
 try{
  const files=await readFolderArchives();if(!files.length)return;
  // Do not fall back to an older file if the newest archive is incompatible.
  const {archive,name}=files[0];
  if(archive.storageScope&&archive.storageScope!==root.REPORT_STORAGE_SCOPE)throw Error('最新备份属于其他月报');
  const entries=prepareImport(archive,root.REPORT_CHARTS,root.ReportDrawingState,root.ReportViewport,root.REPORT_STORAGE_SCOPE||'');
  if(entries.length!==Object.keys(root.REPORT_CHARTS).length)throw Error('最新备份不是本月报的完整标注');
  for(const c of archive.charts){const data=root.REPORT_CHARTS[c.symbol+'|'+c.tf],codec=root.ReportDrawingState.create(data.rows,data.overlays);if(c.captured!==data.captured||JSON.stringify(c.originalAnalysis)!==JSON.stringify(codec.encode(codec.analysis.filter(d=>d.type!=='mark'))))throw Error('最新备份的行情或分析线版本与本月报不同，请手动核对后导入');}
  if(busy){message(statusTarget,'自动导入已跳过：正在导出或导入标注。');return;}
  let baseline=null;try{baseline=JSON.parse(localStorage.getItem(syncKey));}catch{}
  const current=currentArchive(),decision=autoDecision(current,archive,baseline);
  if(decision==='conflict'){message(statusTarget,'发现最新文件 '+name+'，但浏览器有未同步的标注，已保留当前修改；请先导出备份，再手动选择要导入的版本。');return;}
  if(decision==='older')return;
  if(decision==='same'&&!needsViewSync(current,archive,baseline)){if(!baseline||Date.parse(archive.exportedAt)>=Date.parse(baseline.exportedAt))rememberSync(archive);message(statusTarget,'已核对最新标注：'+name+'，与当前浏览器一致。');return;}
  busy=true;
  try{const failed=applyArchive(archive,entries);message(statusTarget,'已自动导入最新标注与缩放视图：'+name+'（'+entries.length+' 张图，导入前状态已备份）'+(failed?'；部分图表请刷新后查看。':''));}finally{busy=false;}
 }catch(err){message(statusTarget,'标注自动加载未完成：'+err.message+'。当前浏览器标注已保留。');}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',autoImportLatest,{once:true});
else if(document.readyState)autoImportLatest();
})(globalThis);
