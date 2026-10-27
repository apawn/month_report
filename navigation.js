/* Fixed stock navigation, based only on the local report DOM. */
(() => {
 const nav=document.querySelector('.stock-nav');if(!nav)return;
 const links=[...nav.querySelectorAll('a')],articles=links.map(a=>document.getElementById(a.dataset.stock));
 const tabs=[...nav.querySelectorAll('[data-category].category-tab')],groups=[...nav.querySelectorAll('.nav-category')];
 let offset=0,queued=false,manualCategory=false,currentId=null,selectedCategory=groups.find(g=>!g.hidden)?.dataset.category;
 const favoriteKey='paaa.favorites.v1.'+(window.REPORT_STORAGE_SCOPE||location.pathname);
 let favorites=new Set(),favoriteList=null,favoriteStatus=null;
 const favoriteButtons=[];
 function category(id){selectedCategory=id;for(const g of groups)g.hidden=g.dataset.category!==id;for(const t of tabs){const active=t.dataset.category===id;t.classList.toggle('active',active);t.setAttribute('aria-pressed',String(active));}}
 function mark(id,syncCategory=true){
  currentId=id;
  for(const a of nav.querySelectorAll('a[data-stock]')){const active=a.dataset.stock===id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');}
  if(syncCategory&&id&&!manualCategory){const original=links.find(a=>a.dataset.stock===id),group=original?.closest('.nav-category');if(group&&!(selectedCategory==='favorites'&&favorites.has(id)))category(group.dataset.category);}
 }
 function reportFavoriteError(message){if(favoriteStatus){favoriteStatus.textContent=message;favoriteStatus.hidden=!message;}}
 function readFavorites(raw){if(raw===null)return new Set();const value=JSON.parse(raw);if(value.version!==1||!Array.isArray(value.symbols)||!value.symbols.every(s=>typeof s==='string'))throw Error('收藏数据格式不正确');return new Set(value.symbols);}
 function renderFavorites(){
  if(!favoriteList)return;
  favoriteList.replaceChildren();
  for(const a of links)if(favorites.has(a.dataset.stock)){const copy=a.cloneNode(true);copy.removeAttribute('aria-current');copy.classList.remove('active');favoriteList.append(copy);}
  if(!favoriteList.children.length){const empty=document.createElement('span');empty.className='favorites-empty';empty.textContent='暂无收藏，点击图表左侧的 ☆ 添加';favoriteList.append(empty);}
  for(const button of favoriteButtons){const active=favorites.has(button.dataset.favorite);button.textContent=active?'★':'☆';button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',(active?'取消收藏 ':'收藏 ')+button.dataset.favorite);button.title=(active?'取消收藏 ':'收藏 ')+button.dataset.favorite;}
  mark(currentId,false);
 }
 if(tabs.length){
  const tab=document.createElement('button');tab.type='button';tab.className='category-tab';tab.dataset.category='favorites';tab.textContent='收藏';tab.setAttribute('aria-controls','nav-category-favorites');tab.setAttribute('aria-pressed','false');nav.querySelector('.category-tabs').append(tab);tabs.push(tab);
  const group=document.createElement('div');group.className='nav-category';group.id='nav-category-favorites';group.dataset.category='favorites';group.hidden=true;group.setAttribute('aria-label','收藏标的');favoriteList=document.createElement('div');favoriteList.className='category-symbols';group.append(favoriteList);nav.append(group);groups.push(group);
  favoriteStatus=document.createElement('p');favoriteStatus.className='favorite-status';favoriteStatus.setAttribute('role','alert');favoriteStatus.hidden=true;nav.append(favoriteStatus);
  try{favorites=readFavorites(localStorage.getItem(favoriteKey));}catch(e){reportFavoriteError('收藏未能恢复：'+e.message);}
  for(const panel of document.querySelectorAll('.interactive-panel[data-chart]')){
   const symbol=panel.dataset.chart.split('|')[0],label=panel.querySelector('.chart-side-label>div'),name=label?.querySelector('strong');if(!name)continue;
   const row=document.createElement('div');row.className='favorite-identity';label.insertBefore(row,name);row.append(name);
   const button=document.createElement('button');button.type='button';button.className='favorite-toggle';button.dataset.favorite=symbol;row.append(button);favoriteButtons.push(button);
   button.addEventListener('click',()=>{const next=new Set(favorites);if(next.has(symbol))next.delete(symbol);else next.add(symbol);
    try{localStorage.setItem(favoriteKey,JSON.stringify({version:1,symbols:[...next]}));favorites=next;reportFavoriteError('');renderFavorites();}catch(e){reportFavoriteError('收藏未保存：'+e.message);}
   });
  }
  renderFavorites();
  window.addEventListener('storage',e=>{if(e.key!==favoriteKey&&e.key!==null)return;try{favorites=readFavorites(e.key===null?null:e.newValue);reportFavoriteError('');renderFavorites();}catch(err){reportFavoriteError('收藏未能同步：'+err.message);}});
 }
 function track(){queued=false;let current=null;const edge=offset+20;
  for(const a of articles){if(a.hidden)continue;const r=a.getBoundingClientRect();if(r.top<=edge&&r.bottom>edge){current=a.id;break;}if(r.top>edge){if(r.top<window.innerHeight*.65)current=a.id;break;}}
  mark(current);
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(track);}}
 function measure(){const navHeight=nav.getBoundingClientRect().height,toolbar=document.querySelector('.global-drawing-toolbar'),height=navHeight+(toolbar?.getBoundingClientRect().height||0);document.documentElement.style.setProperty('--stock-nav-only-height',navHeight+'px');offset=height;document.documentElement.style.setProperty('--stock-nav-height',height+'px');document.documentElement.style.setProperty('--stock-scroll-offset',(offset+12)+'px');schedule();}
 for(const tab of tabs)tab.addEventListener('click',()=>{manualCategory=true;category(tab.dataset.category);measure();const first=groups.find(g=>g.dataset.category===tab.dataset.category)?.querySelector('a[data-stock]');if(first)jump(first);});
 function jump(link){const article=document.getElementById(link.dataset.stock);if(!article)return;manualCategory=false;measure();article.scrollIntoView({block:'start',behavior:'auto'});mark(article.id);try{history.replaceState(null,'','#'+encodeURIComponent(article.id));}catch{}}
 nav.addEventListener('click',e=>{
  const link=e.target.closest('a[data-stock]');if(!link||!nav.contains(link))return;
  e.preventDefault();jump(link);
 });
 window.addEventListener('scroll',()=>{manualCategory=false;schedule();},{passive:true});window.addEventListener('resize',measure);
 const resize=new ResizeObserver(measure);resize.observe(nav);const toolbar=document.querySelector('.global-drawing-toolbar');if(toolbar)resize.observe(toolbar);measure();
})();
