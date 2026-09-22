'use strict';
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs');
const upper=s=>s?String(s).charAt(0).toLocaleUpperCase('cs')+String(s).slice(1):'';
const safeImage=s=>typeof s==='string'&&/^images\/[a-zA-Z0-9_./-]+\.(?:webp|jpe?g|png)$/i.test(s)&&!s.includes('..')?s:'';
const thumbPath=s=>s.replace(/^images\//,'images/thumbs/');
const months=['leden','únor','březen','duben','květen','červen','červenec','srpen','září','říjen','listopad','prosinec'];
const currentMonth=new Date().getMonth()+1;
const collator=new Intl.Collator('cs');
const pageSize=40;
const GROUP_ORDER=['Výtrusné cévnaté rostliny','Nahosemenné rostliny','Krytosemenné – jednoděložné','Krytosemenné – dvouděložné'];
const colorButtons=[
  ['bílá','#fffdf8','#3a382e'],['žlutá','#d9b654','#3a382e'],['oranžová','#ce8146','#fff'],
  ['červená','#af5d50','#fff'],['růžová','#d49d9f','#3a382e'],['fialová','#8d7899','#fff'],
  ['modrá','#7a98ac','#fff'],['zelená','#8c9973','#3a382e'],['hnědá','#94755c','#fff'],['černá','#34342f','#fff']
];
const compoundColorMap={
  'červenofialová':['červená','fialová'],'modrofialová':['modrá','fialová'],'růžovofialová':['růžová','fialová'],
  'žlutobílá':['žlutá','bílá'],'zelenobílá':['zelená','bílá'],'žlutozelená':['žlutá','zelená'],'červenohnědá':['červená','hnědá']
};
const sectionLabel=section=>{
  if(section.startsWith('1.'))return 'Výtrusné cévnaté rostliny';
  if(section.startsWith('2.'))return 'Nahosemenné rostliny';
  if(section.startsWith('3.'))return 'Krytosemenné – jednoděložné';
  if(section.startsWith('4.'))return 'Krytosemenné – dvouděložné';
  return section||'Ostatní';
};
const monthInRange=(month,from,to)=>{
  if(!from||!to)return false;
  if(from<=to)return month>=from&&month<=to;
  return month>=from||month<=to;
};
const monthRangeLabel=p=>{
  if(p.flower_colors.includes('nekvete'))return 'Netvoří květy';
  if(!p.flowering_from||!p.flowering_to)return 'Neuvedeno';
  if(p.flowering_from===p.flowering_to)return upper(months[p.flowering_from-1]);
  return `${upper(months[p.flowering_from-1])} – ${months[p.flowering_to-1]}`;
};
const colorMatches=(plantColor,filter)=>plantColor===filter||(compoundColorMap[plantColor]||[]).includes(filter);

let plants=[];
let state={group:'',colors:new Set(),page:1,floweringNow:false};
let opened=new Set();
let galleryState=null;
let deferredInstallPrompt=null;
let swRegistration=null;
let offlineAssets=[];
let offlinePackComplete=false;
let dataReady=false;


function updateNetworkStatus(){
  const el=$('network-status');
  if(!el)return;
  const online=navigator.onLine;
  el.textContent=online?'Online':'Offline';
  el.classList.toggle('offline',!online);
}
function setOfflinePackUI(mode,message=''){
  const button=$('offline-pack');
  const progress=$('offline-progress');
  if(!button||!progress)return;
  progress.classList.remove('offline-error','offline-ok');
  if(mode==='complete'){
    offlinePackComplete=true;
    button.textContent='✓ Fotky offline';
    button.classList.add('active');
    button.disabled=true;
    progress.textContent=message||'Celý atlas je uložený offline.';
    progress.classList.add('offline-ok');
  }else if(mode==='loading'){
    button.textContent='⬇ Stahuji fotky…';
    button.disabled=true;
    button.classList.remove('active');
    progress.textContent=message;
  }else if(mode==='error'){
    offlinePackComplete=false;
    button.textContent='↻ Zkusit fotky offline';
    button.disabled=false;
    button.classList.remove('active');
    progress.textContent=message;
    progress.classList.add('offline-error');
  }else{
    offlinePackComplete=false;
    button.textContent='⬇ Fotky offline';
    button.disabled=false;
    button.classList.remove('active');
    progress.textContent=message;
  }
}
function serviceWorkerTarget(){
  return navigator.serviceWorker?.controller||swRegistration?.active||swRegistration?.waiting||swRegistration?.installing||null;
}
function checkOfflinePack(){
  const target=serviceWorkerTarget();
  if(target)target.postMessage({type:'CHECK_OFFLINE_PACK',expectedTotal:offlineAssets.length});
}
async function downloadOfflinePack(){
  if(!('serviceWorker' in navigator)){
    setOfflinePackUI('error','Offline režim tento prohlížeč nepodporuje.');
    return;
  }
  if(!offlineAssets.length){
    setOfflinePackUI('error','Seznam fotografií ještě není připravený.');
    return;
  }
  if(!navigator.onLine){
    setOfflinePackUI('error','Pro první stažení fotografií je potřeba připojení k internetu.');
    return;
  }
  try{
    if(navigator.storage?.persist)await navigator.storage.persist();
    await navigator.serviceWorker.ready;
    const target=serviceWorkerTarget();
    if(!target)throw new Error('Service worker není aktivní');
    setOfflinePackUI('loading',`Připravuji ${offlineAssets.length.toLocaleString('cs-CZ')} souborů…`);
    target.postMessage({type:'DOWNLOAD_OFFLINE_PACK',assets:offlineAssets});
  }catch(err){
    console.error(err);
    setOfflinePackUI('error','Offline balíček se nepodařilo spustit. Zkus to znovu.');
  }
}
function handleServiceWorkerMessage(event){
  const data=event.data||{};
  if(data.type==='OFFLINE_PACK_STATUS'){
    if(data.complete)setOfflinePackUI('complete');
    else setOfflinePackUI('idle');
  }else if(data.type==='OFFLINE_PACK_PROGRESS'){
    const pct=data.total?Math.round(data.done/data.total*100):0;
    setOfflinePackUI('loading',`${pct}% · ${data.done.toLocaleString('cs-CZ')}/${data.total.toLocaleString('cs-CZ')} souborů`);
  }else if(data.type==='OFFLINE_PACK_DONE'){
    if(data.complete)setOfflinePackUI('complete',`Hotovo · ${data.total.toLocaleString('cs-CZ')} souborů je offline.`);
    else setOfflinePackUI('error',`Některé soubory se nepodařilo uložit (${data.failed}). Klepni a zkus to znovu.`);
  }
}
async function setupPWA(){
  updateNetworkStatus();
  window.addEventListener('online',updateNetworkStatus);
  window.addEventListener('offline',updateNetworkStatus);

  const installButton=$('install-app');
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredInstallPrompt=event;
    installButton.hidden=false;
  });
  window.addEventListener('appinstalled',()=>{
    deferredInstallPrompt=null;
    installButton.hidden=true;
  });
  installButton.addEventListener('click',async()=>{
    if(!deferredInstallPrompt)return;
    deferredInstallPrompt.prompt();
    try{await deferredInstallPrompt.userChoice;}catch(_){}
    deferredInstallPrompt=null;
    installButton.hidden=true;
  });

  $('offline-pack').disabled=true;
  if(!('serviceWorker' in navigator)){
    setOfflinePackUI('error','Offline režim není v tomto prohlížeči dostupný.');
    return;
  }
  navigator.serviceWorker.addEventListener('message',handleServiceWorkerMessage);
  navigator.serviceWorker.addEventListener('controllerchange',()=>setTimeout(checkOfflinePack,150));
  try{
    swRegistration=await navigator.serviceWorker.register('service-worker.js',{scope:'./'});
    await navigator.serviceWorker.ready;
    $('offline-pack').disabled=!dataReady;
    checkOfflinePack();
  }catch(err){
    console.error('PWA registration failed',err);
    setOfflinePackUI('error','Offline režim se nepodařilo aktivovat.');
  }
}

function normalizePlant(p){
  const aliases=p.other_names_cs||[];
  return {...p,
    group:sectionLabel(p.section||''),
    aliases,
    search:normalize([p.name_cs,p.name_latin,...aliases].join(' ')),
    genus:(p.name_latin||'').split(' ')[0],
    photos:p.photos||[],
    notes:p.notes||[],
    flower_colors:p.flower_colors||[]
  };
}
function taxonomySort(a,b){
  const ga=GROUP_ORDER.indexOf(a.group),gb=GROUP_ORDER.indexOf(b.group);
  return (ga<0?99:ga)-(gb<0?99:gb)||collator.compare(a.family_cs,b.family_cs)||collator.compare(a.genus,b.genus)||collator.compare(a.name_latin,b.name_latin);
}
function updateFamilies(){
  const previous=$('family').value;
  const familyMap=new Map();
  plants.filter(p=>!state.group||p.group===state.group).forEach(p=>familyMap.set(p.family_latin,p.family_cs));
  const rows=[...familyMap].sort((a,b)=>collator.compare(a[1],b[1]));
  $('family').innerHTML='<option value="">Všechny čeledi</option>'+rows.map(([latin,czech])=>`<option value="${escapeHTML(latin)}">${escapeHTML(czech)} (${escapeHTML(latin)})</option>`).join('');
  if(rows.some(([latin])=>latin===previous))$('family').value=previous;
}
function setNowButton(){
  $('flowering-now').classList.toggle('active',state.floweringNow);
  $('flowering-now').setAttribute('aria-pressed',String(state.floweringNow));
}
function activeBaseColors(p){
  const out=new Set();
  p.flower_colors.forEach(c=>{
    if(colorButtons.some(([base])=>base===c))out.add(c);
    (compoundColorMap[c]||[]).forEach(x=>out.add(x));
  });
  return out;
}
function filtered(){
  const q=normalize($('search').value.trim());
  const tokens=q.split(/\s+/).filter(Boolean);
  const month=$('month').value;
  return plants.filter(p=>
    (!state.group||p.group===state.group)&&
    (!$('family').value||p.family_latin===$('family').value)&&
    tokens.every(t=>p.search.includes(t))&&
    (!$('only-photos').checked||p.photos.length)&&
    (!state.colors.size||[...state.colors].some(filter=>p.flower_colors.some(c=>colorMatches(c,filter))))&&
    (!state.floweringNow||monthInRange(currentMonth,p.flowering_from,p.flowering_to))&&
    (!month||(month==='none'?p.flower_colors.includes('nekvete'):monthInRange(Number(month),p.flowering_from,p.flowering_to)))
  );
}
function colorPills(p){
  if(p.flower_colors.includes('nekvete'))return '<span class="pill muted-pill">nekvete</span>';
  return p.flower_colors.map(c=>`<span class="pill">${escapeHTML(c)}</span>`).join(' ');
}
function plantMarkup(p){
  const thumb=p.photos[0];
  const blooming=monthInRange(currentMonth,p.flowering_from,p.flowering_to);
  return `<details class="plant" id="${escapeHTML(p.id)}" data-id="${escapeHTML(p.id)}" ${opened.has(p.id)?'open':''}>
    <summary>
      ${thumb?`<img class="thumb" src="${safeImage(thumbPath(thumb))}" data-fallback="${safeImage(thumb)}" alt="" loading="lazy" width="52" height="52">`:'<span class="thumb thumb-empty" aria-hidden="true">·</span>'}
      <span class="plant-name"><strong>${escapeHTML(upper(p.name_cs))}</strong><em>${escapeHTML(p.name_latin)}</em></span>
      ${blooming?'<span class="blooming">kvete teď</span>':''}
      <span class="photo-number">${p.photos.length?p.photos.length+' foto':'bez fotografie'}</span>
    </summary><div class="plant-content"></div></details>`;
}
function fillDetail(el){
  if(el.dataset.loaded)return;
  el.dataset.loaded='1';
  const p=plants.find(x=>x.id===el.dataset.id);
  const notes=p.notes.filter(Boolean).join(' · ');
  el.querySelector('.plant-content').innerHTML=`
    ${p.aliases.length?`<p class="aliases">Další názvy: ${escapeHTML(p.aliases.join(', '))}</p>`:''}
    <dl class="traits">
      <div><dt>Čeleď</dt><dd>${escapeHTML(p.family_cs)} (<em>${escapeHTML(p.family_latin)}</em>)</dd></div>
      <div><dt>Doba kvetení</dt><dd>${escapeHTML(monthRangeLabel(p))}</dd></div>
      <div><dt>Barva květu</dt><dd>${colorPills(p)}</dd></div>
      <div><dt>Skupina</dt><dd>${escapeHTML(p.group)}</dd></div>
    </dl>
    ${notes?`<p class="detail-label">Poznámky ze zdrojového dokumentu</p><p class="notes">${escapeHTML(notes)}</p>`:''}
    ${p.photos.length?`<div class="gallery">${p.photos.map((im,i)=>`<button type="button" data-plant="${escapeHTML(p.id)}" data-image="${i}" aria-label="Zvětšit: ${escapeHTML(p.name_cs)}, fotografie ${i+1}"><img src="${safeImage(im)}" alt="${escapeHTML(p.name_cs)} – fotografie ${i+1}" loading="lazy"></button>`).join('')}</div>`:'<p class="aliases">Fotografie zatím není přidaná.</p>'}`;
}
function render(){
  let found=filtered();
  const sort=$('sort').value;
  if(sort==='czech')found.sort((a,b)=>collator.compare(a.name_cs,b.name_cs));
  else if(sort==='latin')found.sort((a,b)=>collator.compare(a.name_latin,b.name_latin));
  else found.sort(taxonomySort);
  const pages=Math.max(1,Math.ceil(found.length/pageSize));
  state.page=Math.min(state.page,pages);
  const slice=found.slice((state.page-1)*pageSize,state.page*pageSize);
  $('result-count').textContent=`Zobrazeno ${found.length} z ${plants.length} položek`;
  $('title').textContent=state.group||'Všechny rostliny';
  $('reset').hidden=!state.group&&!state.colors.size&&!state.floweringNow&&!$('search').value&&!$('family').value&&!$('month').value&&!$('only-photos').checked&&sort==='taxonomy';
  let family='';
  $('results').innerHTML=slice.map(p=>{
    let heading='';
    if(sort==='taxonomy'&&family!==p.family_latin){
      family=p.family_latin;
      const count=found.filter(x=>x.family_latin===p.family_latin).length;
      heading=`<div class="family-heading"><span class="group-label">${escapeHTML(p.group)}</span><h2>${escapeHTML(p.family_cs)}</h2><em>${escapeHTML(p.family_latin)}</em><small>${count} položek</small></div>`;
    }
    return heading+plantMarkup(p);
  }).join('')||'<div class="empty"><h2>Žádná rostlina neodpovídá</h2><p>Zkus jiný název nebo zruš některý filtr.</p></div>';
  $('pagination').innerHTML=found.length>pageSize?`<button type="button" data-page="${state.page-1}" ${state.page===1?'disabled':''}>← Předchozí</button><span>${state.page} / ${pages}</span><button type="button" data-page="${state.page+1}" ${state.page===pages?'disabled':''}>Další →</button>`:'';
  document.querySelectorAll('.plant').forEach(el=>{
    if(el.open)fillDetail(el);
    el.addEventListener('toggle',()=>{if(el.open){opened.add(el.dataset.id);fillDetail(el)}else opened.delete(el.dataset.id)});
  });
  document.querySelectorAll('img.thumb[data-fallback]').forEach(img=>{
    img.addEventListener('error',()=>{
      const fallback=img.dataset.fallback;
      if(fallback&&img.getAttribute('src')!==fallback)img.setAttribute('src',fallback);
    },{once:true});
  });
}
function renderGroups(){
  const groups=[...new Set(plants.map(p=>p.group))];
  $('groups').innerHTML=[['','Všechny rostliny'],...groups.map(g=>[g,g])].map(([value,label])=>`<button class="group-button${!value?' active':''}" type="button" data-group="${escapeHTML(value)}" aria-pressed="${!value}"><span>${escapeHTML(label)}</span><b>${plants.filter(p=>!value||p.group===value).length}</b></button>`).join('');
}
function setupFilters(){
  $('month').innerHTML='<option value="">Kdykoli</option>'+months.map((m,i)=>`<option value="${i+1}">${upper(m)}</option>`).join('')+'<option value="none">Nekvete</option>';
  $('colors').innerHTML=colorButtons.map(([name,hex,check])=>`<button type="button" class="color" style="background:${hex};--check:${check}" title="${name}" aria-label="${name}" aria-pressed="false" data-color="${name}"></button>`).join('');
  $('current-month-label').textContent=`Aktuálně: ${months[currentMonth-1]}`;
}
function showPhoto(){
  const p=galleryState.plant,i=galleryState.index,im=p.photos[i];
  $('large-photo').src=safeImage(im);
  $('large-photo').alt=`${p.name_cs} (${p.name_latin}), fotografie ${i+1}`;
  $('lightbox-title').innerHTML=`${escapeHTML(upper(p.name_cs))} <em>${escapeHTML(p.name_latin)}</em>`;
  $('photo-caption').textContent=`${i+1} / ${p.photos.length}`;
  $('prev-photo').disabled=p.photos.length<2;$('next-photo').disabled=p.photos.length<2;
}
function movePhoto(delta){if(!galleryState)return;galleryState.index=(galleryState.index+delta+galleryState.plant.photos.length)%galleryState.plant.photos.length;showPhoto();}

function bindEvents(){
  $('filters').addEventListener('submit',e=>e.preventDefault());
  $('search').addEventListener('input',()=>{state.page=1;render();});
  ['family','sort','only-photos'].forEach(id=>$(id).addEventListener('change',()=>{state.page=1;render();}));
  $('month').addEventListener('change',()=>{state.floweringNow=false;state.page=1;setNowButton();render();});
  $('flowering-now').addEventListener('click',()=>{state.floweringNow=!state.floweringNow;if(state.floweringNow)$('month').value='';state.page=1;setNowButton();render();});
  $('offline-pack').addEventListener('click',downloadOfflinePack);
  $('groups').addEventListener('click',e=>{const btn=e.target.closest('[data-group]');if(!btn)return;state.group=btn.dataset.group;state.page=1;$('family').value='';updateFamilies();document.querySelectorAll('[data-group]').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-pressed',String(b===btn));});render();});
  $('colors').addEventListener('click',e=>{const b=e.target.closest('[data-color]');if(!b)return;const c=b.dataset.color;state.colors.has(c)?state.colors.delete(c):state.colors.add(c);b.setAttribute('aria-pressed',String(state.colors.has(c)));state.page=1;render();});
  $('reset').addEventListener('click',()=>{$('filters').reset();state={group:'',colors:new Set(),page:1,floweringNow:false};document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed','false'));document.querySelectorAll('[data-group]').forEach(b=>{b.classList.toggle('active',!b.dataset.group);b.setAttribute('aria-pressed',String(!b.dataset.group));});setNowButton();updateFamilies();render();});
  $('pagination').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b||b.disabled)return;state.page=Number(b.dataset.page);render();$('result-count').scrollIntoView({block:'start'});});
  $('results').addEventListener('click',e=>{const b=e.target.closest('[data-image]');if(!b)return;galleryState={plant:plants.find(p=>p.id===b.dataset.plant),index:Number(b.dataset.image)};showPhoto();$('lightbox').showModal();});
  $('prev-photo').addEventListener('click',()=>movePhoto(-1));$('next-photo').addEventListener('click',()=>movePhoto(1));
  $('lightbox').addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();movePhoto(1);}if(e.key==='ArrowLeft'){e.preventDefault();movePhoto(-1);}});
  document.querySelectorAll('dialog .close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $('about').addEventListener('click',()=>$('about-dialog').showModal());
}

async function start(){
  setupFilters();
  bindEvents();
  setupPWA();
  try{
    const response=await fetch('data/plants.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!Array.isArray(data))throw new Error('plants.json nemá očekávaný formát');
    plants=data.map(normalizePlant);
    plants.sort(taxonomySort);
    offlineAssets=[...new Set(plants.flatMap(p=>p.photos.flatMap(photo=>[photo,thumbPath(photo)])))];
    dataReady=true;
    if(swRegistration||navigator.serviceWorker?.controller){$('offline-pack').disabled=false;checkOfflinePack();}
    $('total').textContent=plants.length;
    $('photo-count').textContent=plants.reduce((n,p)=>n+p.photos.length,0);
    const flowering=plants.filter(p=>p.flower_colors.includes('nekvete')||(p.flowering_from&&p.flowering_to)).length;
    const colors=plants.filter(p=>p.flower_colors.length).length;
    $('coverage').textContent=`Barva květu: ${colors}/${plants.length} · Doba kvetení: ${flowering}/${plants.length} · S fotografií: ${plants.filter(p=>p.photos.length).length}/${plants.length}`;
    renderGroups();updateFamilies();setNowButton();render();
  }catch(err){
    console.error(err);
    $('result-count').textContent='Databázi se nepodařilo načíst.';
    $('results').innerHTML='<div class="empty"><h2>Nelze načíst plants.json</h2><p>Pokud atlas otevíráš přímo jako soubor z disku, spusť místní webový server pomocí přiloženého souboru <strong>START-ATLAS.bat</strong>.</p></div>';
  }
}
start();
