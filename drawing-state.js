/* Drawing identity and version-1 storage compatibility. No I/O. */
((root)=>{
'use strict';
function roleOf(d){
 if(['trend','support','gap'].includes(d.lineRole))return d.lineRole;
 if(/^R\d+(?:\s|$)/.test(d.label||''))return 'gap';
 if(d.type==='horizontal'||(d.type==='trend'&&d.p?.length===2&&d.p[0][1]===d.p[1][1]))return 'support';
 return 'trend';
}
function appearance(d){
 const role=roleOf(d);
 if(d.dash)return {color:d.color||'#8190a9',width:d.width||1.5,dash:[5,4]};
 if(role==='gap')return {color:'#b77721',width:1.8,dash:[9,4,2,4]};
 if(role==='support')return {color:'#55cc77aa',fill:'#77dd9940',width:1.5,dash:[7,4]};
 return {color:d.color||'#2563c3',width:d.width||1.6,dash:[6,4]};
}
function analysisVisible(d,suppressed,showCandidates=false){
 return !suppressed.has(d.ownerId)&&(!d.detailOnly||showCandidates);
}
function create(rows,overlays){
 const dates=new Map(rows.map((r,i)=>[r.time,i]));
 const sourcePattern=s=>typeof s==='string'&&s.startsWith('auto:v1:')&&s.length<4000;
 const style=d=>{
  const out={};for(const k of ['color','fill'])if(typeof d[k]==='string'&&/^#[0-9a-f]{3,8}$/i.test(d[k]))out[k]=d[k];
  for(const k of ['dash','extend','border','labelAtEnd','labelAtTop'])if(typeof d[k]==='boolean')out[k]=d[k];
  if(Number.isFinite(d.width)&&d.width>=.5&&d.width<=6)out.width=d.width;
  if(typeof d.label==='string')out.label=d.label.slice(0,180);
  if(['trend','support','gap'].includes(d.lineRole))out.lineRole=d.lineRole;
  if(sourcePattern(d.sourceId))out.sourceId=d.sourceId;
  return out;
 };
 // Future anchors use a bar offset from a known date; no invented trading dates.
 const encodePoint=([i,price])=>{
  const index=Math.round(i),base=Math.min(rows.length-1,index);
  if(!Number.isSafeInteger(index)||index<0||!Number.isFinite(price))throw Error('锚点坐标不正确');
  return {time:rows[base].time,price,...(index>base?{barsAfter:index-base}:{})};
 };
 const decodePoint=p=>{
  if(!p||!dates.has(p.time)||!Number.isFinite(p.price))throw Error('锚点日期不在本图快照中');
  const offset=p.barsAfter===undefined?0:p.barsAfter;
  if(!Number.isSafeInteger(offset)||offset<0)throw Error('锚点延伸距离不正确');
  const index=dates.get(p.time)+offset;
  if(!Number.isSafeInteger(index))throw Error('锚点延伸距离过大');
  return [index,p.price];
 };
 const encode=ds=>ds.map(d=>({...style(d),type:d.type,p:d.p.map(encodePoint)}));
 function decode(ds){
  if(!Array.isArray(ds)||ds.length>1000)throw Error('画线数量或格式不正确');
  return ds.map(d=>{const size={horizontal:1,trend:2,rect:2,channel:3,fib:2}[d.type];if(!size||!Array.isArray(d.p)||d.p.length!==size)throw Error('画线类型或锚点不正确');const p=d.p.map(decodePoint);if(size>1&&d.type!=='rect'&&p[0][0]===p[1][0])throw Error('趋势线的两点日期不能相同');if(d.type==='fib'&&p[0][1]===p[1][1])throw Error('斐波那契的两点价位不能相同');return {...style(d),type:d.type,p};});
 }
 function decodeHidden(value=[]){if(!Array.isArray(value)||value.length>1000||value.some(s=>!sourcePattern(s)))throw Error('分析线删除记录格式不正确');return [...new Set(value)];}
 let owner=null;const occurrences=new Map();
 const analysis=overlays.map(d=>{
  if(d.type==='mark')return {...d,ownerId:owner};
  const base='auto:v1:'+JSON.stringify([d.type,d.identityLabel??d.label??'',(d.identityP||d.p).map(([i,p])=>[rows[i].time,p])]);
  const serial=occurrences.get(base)||0;occurrences.set(base,serial+1);owner=base+':'+serial;
  return {...d,lineRole:roleOf(d),sourceId:owner,ownerId:owner};
 });
 return {analysis,encode,decode,decodeHidden};
}
const api={create,roleOf,appearance,analysisVisible};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReportDrawingState=api;
})(globalThis);
