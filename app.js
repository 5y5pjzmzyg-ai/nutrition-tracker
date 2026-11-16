'use strict';
const main = document.querySelector('#main');
const editor = document.querySelector('#editor');
const notice = document.querySelector('#notice');
let state, db, view = 'Today', selectedDay = null, period = '7', anchor = null;
let customStart = '', customEnd = '', bodyMetric = 'weight', lastDay, busy = false, showNotice;
const current = () => trackingDay(new Date(),state.prefs.boundary);
const selected = () => selectedDay || current();
const escapeText = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const displayed = (value,unit) => value == null ? '—' : format(value)+' '+unit;
const button = (text,action,attrs='') => '<button type="button" data-action="'+action+'" '+attrs+'>'+text+'</button>';
const options = (items,value) => items.map(([id,text]) => '<option value="'+escapeText(id)+'" '+(String(id)===String(value)?'selected':'')+'>'+escapeText(text)+'</option>').join('');
const input = (name,text,type='number',value='',attrs='') => '<label>'+text+'<input name="'+name+'" type="'+type+'" value="'+escapeText(value)+'" '+attrs+'></label>';
const select = (name,text,items,value) => '<label>'+text+'<select name="'+name+'">'+options(items,value)+'</select></label>';
const numberInput = (name,text,value=null,attrs='') => input(name,text,'number',value,'step="any" min="0" inputmode="decimal" '+attrs);
const primary = text => '<button class="primary" type="submit">'+text+'</button>';
const title = text => '<h1 class="today-title">'+text+'</h1>';
const byId = (rows,id) => rows.find(row => row.id === id);
const field = (data,key) => number(data.get(key));
const records = day => state.entries.filter(entry => entry.day === day);
const bodyFor = day => state.body.find(row => row.day === day) || {};
const id = () => crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
const units = {calories:'kcal',protein:'g'};

function feedback(text,undo) {
  clearTimeout(showNotice);
  notice.textContent = text;
  if (undo) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = 'Undo';
    control.onclick = undo;
    notice.append(control);
  }
  notice.hidden = false;
  showNotice = setTimeout(() => {notice.hidden = true;},undo ? 12000 : 3500);
}

function openStorage() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('nutrition-tracker',1);
    request.onupgradeneeded = () => request.result.createObjectStore('app');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
function loadStorage() {
  return new Promise((resolve,reject) => {
    const request = db.transaction('app').objectStore('app').get('state');
    request.onsuccess = () => resolve(request.result || initial());
    request.onerror = () => reject(request.error);
  });
}
async function save(change,text,undo) {
  if (busy) return false;
  busy = true;
  try {
    // Read and update in the same transaction so another tab cannot overwrite a newer change.
    state = await new Promise((resolve,reject) => {
      const transaction = db.transaction('app','readwrite');
      const store = transaction.objectStore('app');
      const request = store.get('state');
      let next, error;
      request.onsuccess = () => {
        try {
          next = change(request.result || initial());
          if (!validate(next)) throw new Error('Check the entered values and try again.');
          store.put(next,'state');
        } catch (failure) {error = failure; transaction.abort();}
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = () => reject(error || transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
    lastDay = current();
    if (editor.open) editor.close();
    render();
    feedback(text,undo);
    return true;
  } catch (error) {
    feedback(error?.message || 'Could not save. Try again before closing the app.');
    return false;
  } finally {busy = false;}
}
function progress(key,name,value,target,unknown) {
  const ratio = target ? (value || 0)/target : 0;
  const diff = target - (value || 0);
  const goal = target == null ? 'Set a daily target in Settings' : (value === null && unknown ? 'Remaining unknown' :
    (diff < 0 ? format(-diff)+' '+units[key]+' over' : format(diff)+' '+units[key]+' remaining')+' · '+format(ratio*100)+'%');
  return '<section class="card"><h2>'+name+'</h2><div class="total">'+displayed(value,units[key])+'</div><p class="small">'+(target ? 'Target '+displayed(target,units[key]) : 'Target unset')+'</p>'+
    '<progress class="meter '+key+'" max="1" value="'+Math.min(ratio,1)+'" aria-label="'+name+' target progress"></progress><p class="small">'+goal+'</p>'+
    (unknown ? '<p class="small">'+unknown+' '+(unknown===1?'entry':'entries')+' with unknown protein</p>' : '')+'</section>';
}
function savedFoods() {
  const uses = new Map();
  for (const entry of state.entries) uses.set(entry.foodId,(uses.get(entry.foodId)||0)+1);
  return [...state.foods].sort((a,b) => (state.prefs.sort==='frequency' ? (uses.get(b.id)||0)-(uses.get(a.id)||0) : 0) || a.name.localeCompare(b.name));
}
function bodySummary(day) {
  const sorted = [...state.body].sort((a,b) => b.day.localeCompare(a.day));
  const isMeasurementDay = day === current() && weekday(day) === state.prefs.measure;
  const prompt = bodyFor(day).day ? 'Body composition check completed.' : weekdays[state.prefs.measure]+' body composition check — record your measurements.';
  return '<section class="card"><div class="section-head"><h2>Body composition</h2>'+button(bodyFor(day).day ? 'Edit check-in' : 'Record', 'edit-body')+'</div>'+
    (isMeasurementDay ? '<p class="reminder small">'+prompt+'</p>' : '')+
    '<div class="trio measurements">'+metrics.map(([key,name,unit]) => {
      const [latest,prior] = sorted.filter(item => item[key] !== null);
      const delta = prior ? latest[key]-prior[key] : null;
      return '<div><span class="small">'+name+'</span><strong>'+displayed(latest?.[key],unit)+'</strong>'+
        (latest ? '<p class="small">'+prettyDay(latest.day)+'</p>' : '')+
        (delta === null ? '' : '<p class="small">'+(delta>0?'+':'')+format(delta)+' '+(unit==='%'?'percentage points':'kg')+'</p>')+'</div>';
    }).join('')+'</div></section>';
}
function today() {
  const day = selected();
  const entries = records(day).sort((a,b) => ((a.time < state.prefs.boundary)-(b.time < state.prefs.boundary)) || a.time.localeCompare(b.time));
  const totalsToday = totals(entries);
  const target = getTarget(state.targets,day);
  const foods = savedFoods().map(food => [food.id,food.name+' · '+displayed(food.calories,'kcal')+' · '+displayed(food.protein,'g')+(food.serving?' · '+food.serving:'')]);
  const row = entry => '<div class="record line"><div><h3>'+escapeText(entry.name)+'</h3><p class="small">'+entry.time+' · '+displayed(entry.calories,'kcal')+' · '+(entry.protein===null?'Unknown protein':displayed(entry.protein,'g protein'))+'</p></div><div class="actions">'+
    button('Edit','edit-entry','data-id="'+escapeText(entry.id)+'"')+button('Delete','delete-entry','data-id="'+escapeText(entry.id)+'"')+'</div></div>';
  return title(day===current()?'Today':'Food diary')+'<div class="pager">'+button('‹','previous-day','aria-label="Previous tracking day"')+
    '<input type="date" aria-label="Tracking date" id="selected-day" value="'+day+'">'+button('›','next-day','aria-label="Next tracking day"')+
    (day!==current()?button('Today','current-day'):'')+'</div>'+
    '<div class="duo">'+progress('calories','Calories',totalsToday.calories,target.calories,0)+progress('protein','Protein',totalsToday.protein,target.protein,totalsToday.unknown)+'</div>'+
    '<div class="desktop-duo"><section class="card"><h2>Saved food</h2>'+
    (foods.length ? '<form class="row" data-form="quick">'+select('food','Food',[['','Choose a food'],...foods],'')+primary('Add')+'</form>' :
      '<div class="row"><p class="small">Add foods you log regularly.</p>'+button('New food','edit-food')+'</div>')+
    '</section><section class="card"><h2>Manual entry</h2><form class="stack" data-form="manual">'+
    select('category','Meal',categories.map(name=>[name,name]),'Lunch')+
    '<div class="fields">'+numberInput('calories','Calories (kcal)',null,'required')+numberInput('protein','Protein (g), optional')+'</div>'+
    primary('Add entry')+'</form></section></div>'+
    '<section class="card"><h2>Food log</h2>'+(entries.length?entries.map(row).join(''):'<p class="small">No entries for this tracking day.</p>')+'</section>'+bodySummary(day);
}
function settings() {
  const target = getTarget(state.targets,current());
  return title('Settings')+'<section class="card"><h2>Daily targets</h2><form data-form="targets" class="stack"><div class="fields">'+
    numberInput('calories','Calories (kcal)',target.calories,'data-positive="true"')+numberInput('protein','Protein (g)',target.protein,'data-positive="true"')+
    '</div><p class="small">Target changes apply from the current tracking day.</p>'+primary('Save targets')+'</form></section>'+
    '<section class="card"><h2>Tracking preferences</h2><form data-form="preferences" class="stack"><div class="fields">'+input('boundary','Tracking day starts','time',state.prefs.boundary,'required')+
    select('measure','Body composition day',weekdays.map((name,index)=>[index,name]),state.prefs.measure)+
    '</div>'+select('sort','Saved food order',[['name','Alphabetical'],['frequency','Most used']],state.prefs.sort)+
    '<p class="small">A new cutoff applies to future logs. You can move earlier entries individually.</p>'+primary('Save preferences')+'</form></section>'+
    '<section class="card"><div class="section-head"><h2>Saved foods</h2>'+button('New food','edit-food')+'</div>'+
    savedFoods().map(food => '<div class="record line"><div><h3>'+escapeText(food.name)+'</h3><p class="small">'+displayed(food.calories,'kcal')+' · '+displayed(food.protein,'g protein')+(food.serving?' · '+escapeText(food.serving):'')+'</p></div><div class="actions">'+button('Edit','edit-food','data-id="'+escapeText(food.id)+'"')+button('Delete','delete-food','data-id="'+escapeText(food.id)+'"')+'</div></div>').join('')+
    '</section><section class="card stack"><h2>Data and backups</h2><p class="small">Your data stays on this device. Export backups to move records or recover them if browser data is cleared.</p>'+
    '<div class="actions filter">'+button('Export backup','export')+button('Import backup','import')+button('Clear data','clear','class="warning-action"')+'</div><input type="file" id="backup" accept=".json,application/json" aria-label="Backup file" hidden></section>';
}
function range() {
  const end = current();
  const date = anchor || end;
  if (period === 'week') return [monday(date),shift(monday(date),6)];
  if (period === 'month') return [monthShift(date,0),shift(monthShift(date,1),-1)];
  if (period === 'custom') return [customStart || shift(end,-29),customEnd || end];
  if (period === 'all') {
    const dates = [...state.entries,...state.body].map(row => row.day).sort();
    return [dates[0] && dates[0]<end ? dates[0] : end, dates.at(-1)>end ? dates.at(-1) : end];
  }
  return [shift(end,1-Number(period)),end];
}
function chart(points, config) {
  const {name,unit,bars=false} = config;
  const values = points.flatMap(point => [point.value,point.target]).filter(value => value != null);
  if (!values.length && !points.some(point => point.unknown)) return '<p class="small">No recorded '+name.toLowerCase()+' in this period.</p>';
  const low = bars ? 0 : values.reduce((min,value) => Math.min(min,value),Infinity);
  const top = values.reduce((max,value) => Math.max(max,value),bars ? 0 : -Infinity);
  const spread = Math.max(top-low,bars?1:.2);
  const min = bars ? 0 : Math.max(0,low-spread*.12);
  const max = top+spread*.14;
  const left = 49, right = 338, floor = 133, ceiling = 11;
  const first = Date.parse(points[0].day);
  const duration = Date.parse(points.at(-1).day)-first;
  const step = (right-left)/Math.max(points.length,1);
  const x = (day,i) => bars ? left+step*(i+.5) : left+6+(right-left-12)*(duration ? (Date.parse(day)-first)/duration : .5);
  const y = value => floor-(floor-ceiling)*(value-min)/(max-min);
  const color = name==='Protein' ? '#a76a2b' : '#347352';
  const width = Math.max(.25,Math.min(20,step*.76));
  const marks = points.map((point,i) => {
    const value = point.value;
    const detail = prettyDay(point.day)+' · '+(value==null ? (point.unknown?'Protein unknown':'No entry') : displayed(value,unit))+
      (point.unknown ? ' · '+point.unknown+' unknown' : '')+(point.target!=null ? ' · target '+displayed(point.target,unit) : '');
    const common = ' data-index="'+i+'" data-detail="'+escapeText(detail)+'"'+(points.length<=90?' tabindex="0"':'')+' aria-label="'+escapeText(detail)+'"';
    const caption = '<title>'+escapeText(detail)+'</title>';
    if (bars) {
      const filled = value!==null || point.unknown;
      return '<rect x="'+(x(point.day,i)-width/2)+'" y="'+(value===null ? (point.unknown?floor-4:floor-2) : Math.min(y(value),floor-2))+'" width="'+width+'" height="'+(value===null ? (point.unknown?4:2) : Math.max(2,floor-y(value)))+'" rx="1" fill="'+(point.unknown?'#dab182':(filled?color:'#d8dfd5'))+'"'+common+'>'+caption+'</rect>';
    }
    return value===null ? '' : '<circle cx="'+x(point.day,i)+'" cy="'+y(value)+'" r="4.6" fill="'+color+'"'+common+'>'+caption+'</circle>';
  }).join('');
  const path = key => {
    let started = false;
    return points.map((point,i) => {
      if (point[key] == null) {started = false;return '';}
      const command = started?'L':'M';
      started = true;
      return command+x(point.day,i)+' '+y(point[key]);
    }).join(' ');
  };
  const ticks = [0,.5,1].map(portion => {
    const value = min+(max-min)*portion;
    return '<line x1="'+left+'" x2="'+right+'" y1="'+y(value)+'" y2="'+y(value)+'" stroke="#e0e5d9"/><text x="43" y="'+(y(value)+4)+'" text-anchor="end">'+format(value)+'</text>';
  }).join('');
  const dateLabels = (points.length>1 ? [points[0],points.at(-1)] : points).map((p,i) => '<text x="'+(i?right:left)+'" y="151" text-anchor="'+(i?'end':'start')+'">'+escapeText(p.day.slice(5))+'</text>').join('');
  return '<p class="small">'+(bars?'Tracking day':'Measurement date')+' · '+unit+(bars&&points.some(p=>p.target!=null)?' · dashed line shows target':'')+'</p>'+
    '<svg class="chart" viewBox="0 0 345 157" role="group" aria-label="'+name+' chart">'+ticks+
    (bars?'<path d="'+path('target')+'" fill="none" stroke="#64726b" stroke-dasharray="4 3"/>':'<path d="'+path('value')+'" fill="none" stroke="'+color+'" stroke-width="2"/>')+marks+dateLabels+'</svg>'+
    '<p class="small graph-value" aria-live="polite">Select a point for details.</p>';
}
function statLine(rows,metric) {
  const summary = summarize(rows,metric);
  const unit = units[metric];
  if (!summary.count) return '<p class="small">No recorded '+metric+' values.</p>';
  return '<p class="small">Daily average '+displayed(summary.mean,unit)+' across '+summary.count+' recorded '+(summary.count===1?'day':'days')+
    (metric==='calories'?' · Low '+displayed(summary.low,unit)+' · High '+displayed(summary.high,unit):'')+'</p>'+
    (summary.eligible ? '<p class="small target-count">'+summary.reached+' of '+summary.eligible+(metric==='protein'?' complete':'')+' days with a target reached it.</p>' : '');
}
function trends() {
  const [start,end] = range();
  const weeks = period==='week' || period==='month';
  const rangeButtons = [['7','7 days'],['30','30 days'],['90','90 days'],['week','By week'],['month','By month'],['custom','Custom'],['all','All time']];
  let controls = '<div class="actions filter">'+rangeButtons.map(([value,text])=>button(text,'period','data-value="'+value+'" aria-pressed="'+(period===value)+'"')).join('')+'</div>';
  if (weeks) controls += '<div class="pager">'+button('‹','previous-period','aria-label="Previous period"')+'<strong>'+prettyDay(start)+' – '+prettyDay(end)+'</strong>'+button('›','next-period','aria-label="Next period"')+'</div>';
  if (period === 'custom') controls += '<div class="fields">'+input('start','From','date',start,'id="start"')+input('end','Through','date',end,'id="end"')+'</div>';
  if (end<start) return title('Trends')+'<section class="card stack">'+controls+'<p>Choose an end date on or after the start date.</p></section>';
  const grouped = new Map();
  for (const entry of state.entries) {
    if (entry.day < start || entry.day > end) continue;
    if (!grouped.has(entry.day)) grouped.set(entry.day,[]);
    grouped.get(entry.day).push(entry);
  }
  const rows = [];
  for (let day=start;day<=end;day=shift(day,1)) rows.push({day,...totals(grouped.get(day)||[]),target:getTarget(state.targets,day)});
  const body = state.body.filter(row => row.day>=start && row.day<=end).sort((a,b) => a.day.localeCompare(b.day));
  const [key,name,unit] = metrics.find(([metric]) => metric === bodyMetric);
  const bodyPoints = body.filter(row=>row[key]!==null).map(row=>({day:row.day,value:row[key]}));
  const change = bodyPoints.length>1 ? bodyPoints.at(-1).value-bodyPoints[0].value : null;
  const charts = ['calories','protein'].map(metric => {
    const name = metric[0].toUpperCase()+metric.slice(1);
    const points = rows.map(row=>({day:row.day,value:row[metric],target:row.target[metric],unknown:metric==='protein'?row.unknown:0}));
    return '<section class="card stack"><h2>'+name+'</h2>'+chart(points,{name,unit:units[metric],bars:true})+statLine(rows,metric)+
      (metric==='protein' && rows.some(row=>row.unknown) ? '<p class="small">Amber marks incomplete protein. The average uses known totals for days with at least one known value.</p>' : '')+'</section>';
  }).join('');
  const summary = weeks ? '<section class="card stack"><h2>'+ (period==='week'?'Weekly':'Monthly') +' summary</h2><div class="trio">'+metrics.map(([k,n,u])=>{
    const latest = [...body].reverse().find(row=>row[k]!==null);
    return '<div><span class="small">'+n+'</span><br><strong>'+displayed(latest?.[k],u)+'</strong></div>';
  }).join('')+'</div><details><summary>Daily totals</summary>'+rows.map(row=>'<p class="line small"><span>'+prettyDay(row.day)+'</span><span>'+displayed(row.calories,'kcal')+' · '+displayed(row.protein,'g')+(row.unknown?' · '+row.unknown+' unknown':'')+'</span></p>').join('')+'</details></section>' : '';
  return title('Trends')+'<section class="card stack">'+controls+'</section><div class="charts chart-panel">'+charts+'</div>'+summary+
    '<section class="card stack"><h2>Body composition</h2><div class="actions filter">'+metrics.map(([value,label])=>button(label,'metric','data-value="'+value+'" aria-pressed="'+(bodyMetric===value)+'"')).join('')+
    '</div>'+chart(bodyPoints,{name,unit})+(change===null?'':'<p class="small">Change over period '+(change>0?'+':'')+format(change)+' '+(unit==='%'?'percentage points':unit)+'</p>')+'</section>';
}
function render() {
  main.innerHTML = {Today:today,Trends:trends,Settings:settings}[view]();
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  }
}
function popup(heading,form,fields,recordId='',remove='') {
  editor.innerHTML = '<h2>'+heading+'</h2><form class="stack" data-form="'+form+'" data-id="'+escapeText(recordId)+'">'+fields+
    '<div class="actions filter">'+primary('Save')+button('Cancel','close')+(remove?button('Delete','delete-body','class="warning-action" data-id="'+remove+'"'):'')+'</div></form>';
  editor.showModal();
}
function editEntry(entry) {
  if (!entry) return;
  popup('Edit food entry','entry',input('name','Food or meal','text',entry.name,'required maxlength="120"')+
    '<div class="fields">'+numberInput('calories','Calories (kcal)',entry.calories,'required')+numberInput('protein','Protein (g), optional',entry.protein)+'</div>'+
    '<div class="fields">'+input('day','Tracking date','date',entry.day,'required')+input('time','Local time','time',entry.time,'required')+'</div>',entry.id);
}
function editFood(food={}) {
  popup(food.id?'Edit saved food':'New saved food','food',input('name','Food name','text',food.name,'required maxlength="120"')+
    '<div class="fields">'+numberInput('calories','Calories per serving',food.calories,'required')+
    numberInput('protein','Protein per serving (g)',food.protein,'required')+'</div>'+
    input('serving','Serving description, optional','text',food.serving,'maxlength="120"'),food.id);
}
function editBody(day) {
  const existing = bodyFor(day);
  popup(existing.day?'Edit body composition':'Record body composition','body',
    input('day','Measurement date','date',day,'required')+
    '<div class="trio">'+metrics.map(([key,name,unit])=>numberInput(key,name+' ('+unit+')',existing[key],unit==='%'?'max="100"':'data-positive="true"')).join('')+
    '</div><p class="small">Enter whichever measurements you have.</p>',existing.day,existing.day);
}
function removeRecord(collection,key,value,text) {
  const row = state[collection].find(item=>item[key]===value);
  if (!row) return;
  save(next=>{
    next[collection] = next[collection].filter(item=>item[key]!==value);
    return next;
  },text,()=>save(next=>{
    if (!next[collection].some(item=>item[key]===value)) next[collection].push(row);
    return next;
  },'Restored.'));
}
function exportBackup() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'nutrition-backup-'+current()+'.json';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function goTo(day) {
  selectedDay = day === current() ? null : day;
  render();
}
document.addEventListener('click',event=>{
  const target = event.target.closest('[data-view],[data-action],[data-detail]');
  if (!target || !state) return;
  if (target.hasAttribute('data-detail')) {
    target.closest('section').querySelector('.graph-value').textContent = target.dataset.detail;
    return;
  }
  if (target.dataset.view) {
    const previous = view;
    view = target.dataset.view;
    if (view === 'Today' && previous !== 'Today') selectedDay = null;
    render();
    window.scrollTo(0,0);
    return;
  }
  const value = target.dataset.id;
  switch (target.dataset.action) {
    case 'previous-day': goTo(shift(selected(),-1)); break;
    case 'next-day': goTo(shift(selected(),1)); break;
    case 'current-day': goTo(current()); break;
    case 'edit-entry': editEntry(byId(state.entries,value)); break;
    case 'edit-food': editFood(byId(state.foods,value)); break;
    case 'edit-body': editBody(selected()); break;
    case 'delete-entry': removeRecord('entries','id',value,'Entry deleted.'); break;
    case 'delete-food': removeRecord('foods','id',value,'Saved food deleted.'); break;
    case 'delete-body': removeRecord('body','day',value,'Measurement deleted.'); break;
    case 'close': editor.close(); break;
    case 'export': exportBackup(); break;
    case 'import': main.querySelector('#backup').click(); break;
    case 'clear': if (confirm('Delete all local nutrition records, measurements and settings? Export a backup first if you want to keep them.')) save(initial,'Local data cleared.'); break;
    case 'period': period = target.dataset.value; anchor = null; render(); break;
    case 'metric': bodyMetric = target.dataset.value; render(); break;
    case 'previous-period':
    case 'next-period': {
      const offset = target.dataset.action==='previous-period'?-1:1;
      anchor = period==='week' ? shift(anchor || current(),offset*7) : monthShift(anchor || current(),offset);
      render();
      break;
    }
  }
});
document.addEventListener('focusin',event=>{
  if (event.target.dataset.detail) event.target.closest('section').querySelector('.graph-value').textContent = event.target.dataset.detail;
});
document.addEventListener('change',async event=>{
  const control = event.target;
  if (control.id==='selected-day' && validDay(control.value)) goTo(control.value);
  if (control.id==='start' && validDay(control.value)) {customStart=control.value;render();}
  if (control.id==='end' && validDay(control.value)) {customEnd=control.value;render();}
  if (control.id==='backup' && control.files.length) {
    const file = control.files[0];
    control.value = '';
    try {
      const imported = JSON.parse(await file.text());
      if (!validate(imported)) throw new Error();
      if (confirm('Replace all local records and settings with this backup?')) await save(()=>imported,'Backup restored.');
    } catch {feedback('This file is not a valid Nutrition Tracker backup.');}
  }
});
document.addEventListener('submit',event=>{
  const form = event.target;
  if (!form.dataset.form || !state) return;
  event.preventDefault();
  const fields = new FormData(form);
  if ([...form.querySelectorAll('[data-positive]')].some(control=>control.value!=='' && Number(control.value)<=0)) {
    feedback('Enter a value greater than zero.'); return;
  }
  const name = fields.get('name')?.trim();
  const calories = field(fields,'calories');
  const protein = field(fields,'protein');
  const kind = form.dataset.form;
  const recordId = form.dataset.id;
  const now = new Date();
  const day = selectedDay || trackingDay(now,state.prefs.boundary);
  switch(kind) {
    case 'manual':
    case 'quick': {
      const food = byId(state.foods,fields.get('food'));
      if (kind==='quick' && !food) {feedback('Choose a saved food.');return;}
      const entry = food ? {name:food.name,calories:food.calories,protein:food.protein,foodId:food.id} :
        {name:fields.get('category'),calories,protein,foodId:null};
      const newId = id();
      save(next=>{
        next.entries.push({...entry,id:newId,day,time:localTime(now)});
        return next;
      },'Entry added.',()=>removeRecord('entries','id',newId,'Entry removed.'));
      break;
    }
    case 'entry':
      save(next=>{
        const entry = byId(next.entries,recordId);
        if (!entry) throw new Error('This entry was deleted.');
        Object.assign(entry,{name,calories,protein,day:fields.get('day'),time:fields.get('time')});
        return next;
      },'Entry updated.');
      break;
    case 'food':
      save(next=>{
        const food = {id:recordId || id(),name,calories,protein,serving:fields.get('serving').trim()};
        next.foods = next.foods.filter(item=>item.id!==food.id).concat(food);
        return next;
      },'Saved food updated.');
      break;
    case 'body': {
      const date = fields.get('day');
      const body = {day:date,...Object.fromEntries(metrics.map(([key])=>[key,field(fields,key)]))};
      if (metrics.every(([key])=>body[key]===null)) {feedback('Enter at least one measurement.');return;}
      if (date!==recordId && bodyFor(date).day && !confirm('Replace the measurements already saved for this date?')) return;
      save(next=>{
        next.body = next.body.filter(row=>row.day!==date && row.day!==recordId).concat(body);
        return next;
      },'Body composition saved.');
      break;
    }
    case 'targets':
      save(next=>{
        const date = trackingDay(now,next.prefs.boundary);
        next.targets = next.targets.filter(row=>row.day!==date).concat({day:date,calories,protein}).sort((a,b)=>a.day.localeCompare(b.day));
        return next;
      },'Targets saved.');
      break;
    case 'preferences':
      save(next=>{
        next.prefs = {boundary:fields.get('boundary'),measure:Number(fields.get('measure')),sort:fields.get('sort')};
        return next;
      },'Preferences saved.');
      break;
  }
});
const connection = document.querySelector('#connection');
const updateConnection = () => {connection.hidden = navigator.onLine;};
window.addEventListener('online',updateConnection);
window.addEventListener('offline',updateConnection);
updateConnection();
openStorage().then(async result=>{
  db = result;
  state = await loadStorage();
  lastDay = current();
  render();
  setInterval(()=>{
    const day = current();
    if (lastDay!==day && !editor.open && !main.contains(document.activeElement)) {lastDay=day;render();}
  },15000);
}).catch(()=>{
  main.textContent = 'Local storage is unavailable. Open the tracker in a browser that permits site data.';
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('Offline setup failed',error));
