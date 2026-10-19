(()=>{'use strict';
const R=window.HaruReminders,I=window.HaruI18n,M=window.HaruMedia;
const $=id=>document.getElementById(id),MIN='2026-01-01',MAX='2027-12-31';
const KEY='harucheck.events.v1',LOCALE_KEY='harucheck.locale.v1',THEME_KEY='harucheck.theme.v1',RECEIPTS_KEY='harucheck.reminder-receipts.v1';
let language='ko';try{language=I.normalize(localStorage.getItem(LOCALE_KEY));}catch{}
const t=(key,values)=>I.translate(language,key,values),intl=options=>new Intl.DateTimeFormat(I.locale(language),{calendar:'gregory',...options});
const pad=n=>String(n).padStart(2,'0'),dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,parseDate=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12);};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>=MIN&&s<=MAX&&dateKey(parseDate(s))===s;
const todayKey=dateKey(new Date());
let selected=todayKey<MIN?MIN:todayKey>MAX?MAX:todayKey,viewYear=parseDate(selected).getFullYear(),viewMonth=parseDate(selected).getMonth(),periodYear=viewYear;
let editing=null,events=[],toastTimer,lastStored=null,editingConflict=false,storageInvalid=false;
let alarmQueue=[],memoryReceipts={},alarmCheckRunning=false,notificationRegistration=null;
let formAlert=M.options(),pendingFile=null,formVersion=0,fileVersion=0,fileLoading=false,saving=false;
const icons={check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>',cross:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M7 17 17 7"/></svg>',circle:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>',edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z"/></svg>'};
const statuses=['pending','done','failed'];
function textNode(tag,cls,text){const el=document.createElement(tag);el.className=cls;el.textContent=text;return el;}
function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function warning(key){$('storage-warning').dataset.i18n=key;$('storage-warning').textContent=t(key);$('storage-warning').classList.remove('hidden');}
function decode(raw){if(raw===null)return [];const parsed=JSON.parse(raw);if(!Array.isArray(parsed)||!parsed.every(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&e.title.trim()&&e.title.length<=100&&validDate(e.date)&&typeof e.time==='string'&&(!e.time||/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time))&&statuses.includes(e.status)&&R.isValid(e.reminder)&&M.validAlert(e.alert))||new Set(parsed.map(e=>e.id)).size!==parsed.length)throw new Error('invalid');return parsed;}
try{lastStored=localStorage.getItem(KEY);events=decode(lastStored);}catch{storageInvalid=true;warning('storageLoadError');}
function syncStorage(raw){const next=decode(raw);storageInvalid=false;if($('task-dialog').open){editingConflict=true;$('form-error').textContent=t('storageConflict');}events=next;lastStored=raw;render();}
function persist(next){
 if(M.permissionState(window)!=='granted'){updatePermission();return false;}
 try{if(storageInvalid){notify(t('storageLoadError'));return false;}const raw=localStorage.getItem(KEY);if(raw!==lastStored){syncStorage(raw);notify(t('storageCorrupt'));return false;}if(editingConflict){notify(t('storageConflict'));return false;}const serialized=JSON.stringify(next);localStorage.setItem(KEY,serialized);lastStored=serialized;events=next;return true;}
 catch{warning('storageWriteError');notify(t('storageWriteError'));return false;}
}
async function cleanSound(id){if(!id)return;try{const latest=decode(localStorage.getItem(KEY));if(!latest.some(e=>e.alert?.soundId===id))await M.remove(id);}catch{/* A failed cleanup must never remove referenced audio. */}}
function applyTheme(theme,save=false){const mode=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=mode;document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===mode)));document.querySelector('meta[name="theme-color"]').content=mode==='dark'?'#11161F':'#F6F7FB';if(save)try{localStorage.setItem(THEME_KEY,mode);}catch{notify(t('saveError'));}}
function reminderOptions(){const select=$('reminder-select'),value=select.value||'none';select.replaceChildren();for(const [v,label] of [['none',t('none')],...Array.from({length:11},(_,i)=>[String(i*30),i?t('before',{n:i*30}):t('atStart')]),['custom',t('custom')]]){const o=textNode('option','',label);o.value=v;select.append(o);}select.value=value;}
function applyLocale(code,save=false){language=I.normalize(code);document.documentElement.lang=language;document.title=t('app')+' · 2026–2027';document.querySelectorAll('[data-i18n]').forEach(n=>n.textContent=t(n.dataset.i18n));document.querySelectorAll('[data-i18n-aria]').forEach(n=>n.setAttribute('aria-label',t(n.dataset.i18nAria)));document.querySelectorAll('[data-i18n-placeholder]').forEach(n=>n.placeholder=t(n.dataset.i18nPlaceholder));$('settings-language').value=language;reminderOptions();updateFormText();updateReminderForm();updateSoundForm();updatePermission();render();if($('period-dialog').open)renderPeriod();if(save)try{localStorage.setItem(LOCALE_KEY,language);}catch{notify(t('saveError'));}}
for(const locale of I.locales){const option=textNode('option','',locale.name);option.value=locale.code;option.lang=locale.code;$('settings-language').append(option);}
$('settings-language').addEventListener('change',()=>applyLocale($('settings-language').value,true));
document.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>applyTheme(b.dataset.themeChoice,true)));
$('settings-open').addEventListener('click',()=>{updatePermission();$('settings-dialog').showModal();});
for(const id of ['settings-close','settings-done'])$(id).addEventListener('click',()=>$('settings-dialog').close());

function updatePermission(){
 const state=M.permissionState(window),granted=state==='granted';
 $('permission-gate').classList.toggle('hidden',granted);$('app-content').classList.toggle('hidden',!granted);$('app-content').inert=!granted;
 $('permission-request').disabled=state!=='default';$('permission-request').classList.toggle('hidden',state==='unsupported');
 const reason=state==='denied'?'permissionDenied':state==='unsupported'?'permissionUnsupported':null;
 $('permission-reason').textContent=reason?t(reason):'';$('settings-permission-state').textContent=t(granted?'permissionGranted':reason||'permissionBody');$('settings-notification-test').disabled=!granted;
 if(!granted){M.stop();if($('task-dialog').open&&!saving)closeForm();for(const id of ['period-dialog','delete-dialog'])if($(id).open)$(id).close();}
 return granted;
}
$('permission-request').addEventListener('click',async()=>{
 if(M.permissionState(window)!=='default')return;$('permission-request').disabled=true;
 try{const request=Notification.requestPermission();M.unlock().catch(()=>false);await request;if(updatePermission()){await getNotificationRegistration();await checkReminders();}else notify(t('requestFailed'));}catch{notify(t('requestFailed'));}finally{updatePermission();}
});
$('permission-recheck').addEventListener('click',async()=>{if(updatePermission())await checkReminders();});
async function getNotificationRegistration(){
 if(notificationRegistration)return notificationRegistration;
 if(M.permissionState(window)!=='granted'||!('serviceWorker' in navigator))return null;
 try{const reg=await navigator.serviceWorker.register('./harucheck-sw.js');notificationRegistration=await Promise.race([navigator.serviceWorker.ready,new Promise(resolve=>setTimeout(()=>resolve(null),4000))]);return notificationRegistration||(reg.active?reg:null);}catch{return null;}
}
const friendlyDate=ms=>intl({month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms));
function describeReminder(reminder){if(!reminder)return t('none');if(reminder.kind==='custom')return t('scheduled',{date:friendlyDate(R.parseLocal(reminder.at))});return reminder.minutes===0?t('atStart'):t('before',{n:reminder.minutes});}
function getFormReminder(){const value=$('reminder-select').value;return value==='none'?null:value==='custom'?{kind:'custom',at:$('reminder-custom').value}:{kind:'offset',minutes:Number(value)};}
function updateReminderForm(){
 const value=$('reminder-select').value,custom=value==='custom';$('reminder-custom-field').classList.toggle('hidden',!custom);
 const item={date:$('task-date').value,time:$('task-time').value,reminder:getFormReminder()},due=R.resolve(item);
 let text=value==='none'?t('noAlarm'):custom&&!item.reminder.at?t('customRequired'):!custom&&!item.time?t('timeRequired'):!Number.isFinite(due)?t('reminderInvalid'):t('scheduled',{date:friendlyDate(due)})+(due<Date.now()?' · '+t('past'):'');
 $('reminder-preview').textContent=text;$('reminder-preview').classList.toggle('past',Number.isFinite(due)&&due<Date.now());
 $('alert-preferences').disabled=value==='none';$('alert-preferences').classList.toggle('is-disabled',value==='none');
}
function updateSoundForm(){
 $('sound-controls').classList.toggle('hidden',!$('alert-sound').checked);$('sound-name').textContent=pendingFile?.name||formAlert.soundName||t('defaultSound');$('sound-reset').classList.toggle('hidden',!pendingFile&&!formAlert.soundId);$('sound-preview').disabled=fileLoading||(!$('alert-sound').checked&&!$('alert-vibration').checked);updateSaveButton();
}
function getFormAlert(){return {...formAlert,sound:$('alert-sound').checked,vibration:$('alert-vibration').checked};}
function updateSaveButton(){$('form-save').disabled=saving||fileLoading||!$('task-name').value.trim();}
function updateFormText(){$('form-title').textContent=t(editing?'edit':'add');$('form-save').textContent=t(editing?'update':'create');}
$('alert-sound').addEventListener('change',()=>{M.stop();updateSoundForm();});
$('alert-vibration').addEventListener('change',()=>{M.stop();updateSoundForm();});
$('sound-reset').addEventListener('click',()=>{fileVersion++;fileLoading=false;pendingFile=null;formAlert.soundId=null;formAlert.soundName='';$('sound-file').value='';$('sound-feedback').textContent='';M.stop();updateSoundForm();});
$('sound-file').addEventListener('change',async()=>{
 const file=$('sound-file').files?.[0];if(!file)return;const version=++fileVersion,opened=formVersion;fileLoading=true;updateSoundForm();$('sound-feedback').textContent='';
 try{await M.checkFile(file);if(version!==fileVersion||opened!==formVersion)return;pendingFile=file;$('sound-name').textContent=file.name;}
 catch(error){if(version===fileVersion&&opened===formVersion)$('sound-feedback').textContent=t(error.message==='fileTooLarge'?'fileTooLarge':'fileInvalid');}
 finally{if(version===fileVersion&&opened===formVersion){fileLoading=false;$('sound-file').value='';updateSoundForm();}}
});
function mediaFeedback(result){if(result.sound==='blocked')return t('audioBlocked');if(result.sound==='missing')return t('fileMissing');return '';}
$('sound-preview').addEventListener('click',async()=>{const version=formVersion;await M.unlock();if(version!==formVersion||!$('task-dialog').open)return;const result=await M.play(getFormAlert(),{file:pendingFile});if(version===formVersion&&$('task-dialog').open)$('sound-feedback').textContent=mediaFeedback(result)||t('soundReady');});
document.querySelectorAll('.stop-audio').forEach(b=>b.addEventListener('click',()=>M.stop()));
async function sendSystemNotification(item,preview=false,local=null){
 if(M.permissionState(window)!=='granted')return;
 const title=preview?t('notificationTest'):t('app')+' · '+item.title;
 const body=preview?t('testBody'):intl({dateStyle:'medium'}).format(parseDate(item.date))+' · '+(item.time||t('noTime'))+' · '+describeReminder(item.reminder);
 const options={...M.systemOptions(item.alert),body,lang:I.locale(language),tag:preview?'harucheck-test':R.token(item),data:{url:location.href,date:item.date}};
 if(document.visibilityState==='visible'&&local&&(local.sound==='played'||local.sound==='missing')){options.silent=true;delete options.vibrate;}
 if(document.visibilityState==='visible'&&local?.vibration==='requested')delete options.vibrate;
 try{const reg=await getNotificationRegistration();if(!preview&&!events.some(e=>e.id===item.id&&e.status==='pending'&&R.token(e)===R.token(item)))return;
  if(reg&&typeof reg.showNotification==='function'){await reg.showNotification(title,options);return;}
  const notification=new Notification(title,options);notification.onclick=()=>{window.focus();if(item.date)selectDate(item.date);notification.close();};
 }catch{notify(t('requestFailed'));}
}
async function deliver(item,preview=false){let local=null;if(document.visibilityState==='visible'){local=await M.play(item.alert);const message=mediaFeedback(local);if(message)notify(message);}await sendSystemNotification(item,preview,local);}
$('settings-notification-test').addEventListener('click',async()=>{if(!updatePermission())return;await M.unlock();alarmQueue=alarmQueue.filter(a=>!a.preview);alarmQueue.push({preview:true,item:{alert:M.options()},token:'preview'});renderAlarmQueue();await deliver({alert:M.options()},true);});
function renderAlarmQueue(){
 alarmQueue=alarmQueue.filter(a=>a.preview||events.some(e=>e.id===a.item.id&&e.status==='pending'&&R.token(e)===a.token));$('alarm-inbox').classList.toggle('hidden',!alarmQueue.length);$('alarm-items').replaceChildren();
 for(const alarm of alarmQueue){const row=document.createElement('div');row.className='alarm-item';const copy=document.createElement('div');copy.className='alarm-copy';copy.append(textNode('strong','',alarm.preview?t('notificationTest'):alarm.item.title));copy.append(textNode('p','',alarm.preview?t('testBody'):intl({dateStyle:'medium'}).format(parseDate(alarm.item.date))+' · '+(Date.now()-R.resolve(alarm.item)>60000?t('alarmLate'):t('alarmDue'))));const action=textNode('button','alarm-view',t(alarm.preview?'confirm':'view'));action.type='button';action.addEventListener('click',()=>{if(!alarm.preview)selectDate(alarm.item.date);alarmQueue=alarmQueue.filter(a=>a!==alarm);M.stop();renderAlarmQueue();if(!alarm.preview)$('selected-title').scrollIntoView({behavior:'smooth',block:'center'});});row.append(copy,action);$('alarm-items').append(row);}
}
$('alarms-dismiss').addEventListener('click',()=>{alarmQueue=[];M.stop();renderAlarmQueue();});
function readReceipts(){try{const parsed=JSON.parse(localStorage.getItem(RECEIPTS_KEY)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){const now=Date.now();return Object.fromEntries(Object.entries(parsed).filter(([,value])=>typeof value==='number'&&Number.isFinite(value)&&value>now-7*86400000).slice(-500));}}catch{}return {...memoryReceipts};}
async function processDueReminders(){
 if(storageInvalid||M.permissionState(window)!=='granted')return;
 try{const raw=localStorage.getItem(KEY);if(raw!==lastStored)syncStorage(raw);}catch{return;}
 const receipts=readReceipts(),due=R.dueEvents(events,{...receipts,...memoryReceipts},Date.now());if(!due.length)return;
 for(const item of due){const key=R.token(item);receipts[key]=Date.now();memoryReceipts[key]=receipts[key];}try{localStorage.setItem(RECEIPTS_KEY,JSON.stringify(receipts));}catch{}
 for(const item of due){const token=R.token(item);if(!alarmQueue.some(a=>a.token===token))alarmQueue.push({item:{...item},token});await deliver(item);}renderAlarmQueue();
}
async function checkReminders(){if(alarmCheckRunning||M.permissionState(window)!=='granted')return;alarmCheckRunning=true;try{if(navigator.locks?.request)await navigator.locks.request('harucheck-alarm-check',{ifAvailable:true},lock=>lock?processDueReminders():undefined);else await processDueReminders();}catch{}finally{alarmCheckRunning=false;}}
function selectDate(key){if(!validDate(key))return;selected=key;const d=parseDate(key);viewYear=d.getFullYear();viewMonth=d.getMonth();render();}
function moveMonth(delta){const d=new Date(viewYear,viewMonth+delta,1,12);if(d.getFullYear()<2026||d.getFullYear()>2027)return;const day=Math.min(parseDate(selected).getDate(),new Date(d.getFullYear(),d.getMonth()+1,0).getDate());selectDate(dateKey(new Date(d.getFullYear(),d.getMonth(),day,12)));}
function renderCalendar(){
 const month=new Date(viewYear,viewMonth,1,12);$('year-label').textContent=intl({year:'numeric'}).format(month);$('month-label').textContent=intl({month:'long'}).format(month);$('period-open').setAttribute('aria-label',intl({year:'numeric',month:'long'}).format(month)+' · '+t('moveTo'));$('prev-month').disabled=viewYear===2026&&viewMonth===0;$('next-month').disabled=viewYear===2027&&viewMonth===11;$('today').disabled=!validDate(todayKey);
 const weekdays=document.querySelector('.weekdays');weekdays.replaceChildren();for(let i=0;i<7;i++)weekdays.append(textNode('span','',intl({weekday:'narrow'}).format(new Date(2026,0,4+i,12))));
 const offset=month.getDay(),days=$('days');days.replaceChildren();const length=new Date(viewYear,viewMonth+1,0).getDate(),cells=Math.ceil((offset+length)/7)*7;
 for(let i=0;i<cells;i++){
  const d=new Date(viewYear,viewMonth,i-offset+1,12),key=dateKey(d),items=events.filter(e=>e.date===key).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')),b=document.createElement('button');b.type='button';b.className='day'+(d.getMonth()!==viewMonth?' outside':'')+(d.getDay()===0?' sun':'')+(d.getDay()===6?' sat':'')+(key===selected?' selected':'')+(key===todayKey?' is-today':'');b.dataset.date=key;b.disabled=!validDate(key);b.setAttribute('aria-pressed',String(key===selected));if(key===todayKey)b.setAttribute('aria-current','date');b.setAttribute('aria-label',intl({dateStyle:'full'}).format(d)+(items.length?' · '+t('taskCount',{n:items.length})+' · '+items.map(e=>e.title+' '+t(e.status)).join(', '):''));b.append(textNode('span','number',String(d.getDate())));
  const stack=textNode('span','day-labels','');stack.setAttribute('aria-hidden','true');for(const item of items){const label=textNode('span','event-label '+item.status,'');label.dataset.eventId=item.id;label.title=(item.time?item.time+' · ':'')+item.title+' · '+t(item.status);if(item.status!=='pending')label.append(textNode('span','label-status',item.status==='done'?'✓':'✕'));label.append(textNode('span','event-title',item.title));stack.append(label);}if(items.length>2)stack.append(textNode('span','day-more','+'+(items.length-2)));b.append(stack);b.addEventListener('click',()=>selectDate(key));b.addEventListener('keydown',e=>{const map={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};if(!(e.key in map))return;e.preventDefault();const n=parseDate(key);n.setDate(n.getDate()+map[e.key]);const nk=dateKey(n);if(validDate(nk)){selectDate(nk);document.querySelector(`[data-date="${nk}"]`)?.focus();}});days.append(b);
 }
 $('month-count').textContent=t('monthCount',{n:events.filter(e=>e.date.startsWith(`${viewYear}-${pad(viewMonth+1)}-`)).length});
}
function renderAgenda(){
 const d=parseDate(selected),items=events.filter(e=>e.date===selected).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
 $('date-eyebrow').textContent=intl({weekday:'long'}).format(d);$('selected-title').replaceChildren(document.createTextNode(intl({month:'short',day:'numeric'}).format(d)));if(selected===todayKey)$('selected-title').append(textNode('span','day-badge',t('today')));$('task-count').textContent=t('taskCount',{n:items.length});$('empty').classList.toggle('hidden',items.length>0);$('empty').querySelector('p').textContent=t(selected===todayKey?'emptyToday':'emptyOther');
 const done=items.filter(e=>e.status==='done').length,failed=items.filter(e=>e.status==='failed').length;$('progress-box').classList.toggle('hidden',!items.length);$('progress-copy').textContent=t('progress',{done,failed,pending:items.length-done-failed});$('progress-percent').textContent=t('doneProgress',{n:items.length?Math.round(done/items.length*100):0});$('progress-done').style.width=(items.length?done/items.length*100:0)+'%';$('progress-failed').style.width=(items.length?failed/items.length*100:0)+'%';
 $('tasks').replaceChildren();for(const item of items){const card=textNode('article','task '+item.status,'');card.dataset.id=item.id;const head=textNode('div','task-head',''),copy=textNode('div','task-copy','');copy.append(textNode('span','task-time',item.time||t('noTime')),textNode('h3','task-title',item.title));if(item.reminder)copy.append(textNode('span','task-reminder',item.status==='pending'?describeReminder(item.reminder):t('reminderOff')));const edit=textNode('button','icon-btn edit','');edit.type='button';edit.innerHTML=icons.edit;edit.setAttribute('aria-label',item.title+' · '+t('edit'));edit.addEventListener('click',()=>openForm(item.id));head.append(copy,edit);
 const bottom=textNode('div','task-bottom',''),label=textNode('span','status-label','');label.innerHTML=icons[item.status==='done'?'check':item.status==='failed'?'cross':'circle'];label.append(document.createTextNode(t(item.status)));const actions=textNode('div','status-actions','');for(const status of ['done','failed']){const b=textNode('button','status-btn '+(status==='done'?'complete':'fail'),'');b.type='button';b.innerHTML=icons[status==='done'?'check':'cross'];b.append(document.createTextNode(t(status)));b.setAttribute('aria-pressed',String(item.status===status));b.setAttribute('aria-label',item.title+' · '+t(item.status===status?'pending':status));b.addEventListener('click',()=>{const next=item.status===status?'pending':status;if(persist(events.map(e=>e.id===item.id?{...e,status:next}:e))){M.stop();render();document.querySelector(`[data-id="${item.id}"] .${status==='done'?'complete':'fail'}`)?.focus({preventScroll:true});notify(t(next==='pending'?'restored':'statusChanged',{status:t(next)}));}});actions.append(b);}bottom.append(label,actions);card.append(head,bottom);$('tasks').append(card);}
}
function render(){renderCalendar();renderAgenda();renderAlarmQueue();checkReminders();}
function openForm(id=null){
 if(!updatePermission())return;M.unlock().catch(()=>false);M.stop();formVersion++;fileVersion++;fileLoading=false;saving=false;editing=id;editingConflict=false;pendingFile=null;const item=events.find(e=>e.id===id);formAlert=M.options(item?.alert);$('task-form').reset();$('task-form').inert=false;updateFormText();$('task-name').value=item?.title||'';$('task-date').value=item?.date||selected;$('task-time').value=item?.time||'';document.querySelector(`input[name="status"][value="${item?.status||'pending'}"]`).checked=true;$('form-status').classList.toggle('hidden',!item);$('delete-open').classList.toggle('hidden',!item);$('form-error').textContent='';$('sound-feedback').textContent='';$('alert-sound').checked=formAlert.sound;$('alert-vibration').checked=formAlert.vibration;
 const reminder=item?.reminder;$('reminder-select').value=reminder?.kind==='custom'?'custom':reminder?.kind==='offset'?String(reminder.minutes):'none';$('reminder-custom').value=reminder?.kind==='custom'?reminder.at:'';for(const name of ['calendar-export','calendar-export-help'])$(name).classList.toggle('hidden',!item);updateReminderForm();updateSoundForm();$('task-dialog').showModal();$('task-name').focus();
}
function resetFormState(){M.stop();formVersion++;fileVersion++;fileLoading=false;pendingFile=null;editing=null;editingConflict=false;}
function closeForm(){if(saving)return;$('task-dialog').close();resetFormState();}
$('task-dialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});
$('task-dialog').addEventListener('close',()=>{if(!saving)resetFormState();});
function formError(key){$('form-error').textContent=t(key);}
$('task-form').addEventListener('submit',async e=>{
 e.preventDefault();if(saving||fileLoading||!updatePermission())return;
 const title=$('task-name').value.trim(),date=$('task-date').value,time=$('task-time').value,status=document.querySelector('input[name="status"]:checked').value,reminder=getFormReminder(),alert=getFormAlert();
 if(!title){formError('nameRequired');$('task-name').focus();return;}if(!validDate(date)){formError('dateInvalid');$('task-date').focus();return;}if(!R.isValid(reminder)){formError('reminderInvalid');return;}const due=R.resolve({date,time,reminder});if(reminder&&!Number.isFinite(due)){formError('timeRequired');return;}const original=events.find(x=>x.id===editing);if(reminder&&due<Date.now()&&(!original||R.resolve(original)!==due)){formError('pastReminder');return;}
 M.unlock().catch(()=>false);const wasEditing=Boolean(editing);let newSound=null;saving=true;$('task-form').inert=true;$('task-form').setAttribute('aria-busy','true');updateSaveButton();
 try{
  if(pendingFile){newSound=crypto.randomUUID?.()||'sound-'+Date.now()+'-'+Math.random().toString(36).slice(2);await M.put(newSound,pendingFile);alert.soundId=newSound;alert.soundName=pendingFile.name.slice(0,200);}
  const item={id:editing||(crypto.randomUUID?.()||'event-'+Date.now()+'-'+Math.random().toString(36).slice(2)),title,date,time,status,reminder,alert};
  const next=editing?events.map(x=>x.id===editing?item:x):[...events,item];
  if(!persist(next)){if(newSound)await M.remove(newSound).catch(()=>{});return;}
  const oldSound=original?.alert?.soundId;saving=false;closeForm();selectDate(date);notify(t(wasEditing?'updated':'added'));if(oldSound!==alert.soundId)await cleanSound(oldSound);
 }catch{formError('fileSaveError');if(newSound)await cleanSound(newSound);}
 finally{saving=false;$('task-form').inert=false;$('task-form').removeAttribute('aria-busy');updateSaveButton();if(M.permissionState(window)!=='granted')updatePermission();}
});
$('delete-open').addEventListener('click',()=>{const item=events.find(e=>e.id===editing);if(!item)return;$('delete-name').textContent=item.title;$('delete-dialog').showModal();});
$('delete-cancel').addEventListener('click',()=>$('delete-dialog').close());
$('delete-confirm').addEventListener('click',async()=>{const old=events.find(e=>e.id===editing);if(persist(events.filter(e=>e.id!==editing))){$('delete-dialog').close();closeForm();render();notify(t('deleted'));await cleanSound(old?.alert?.soundId);}});
function renderPeriod(){document.querySelectorAll('[data-year]').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.year)===periodYear));b.textContent=intl({year:'numeric'}).format(new Date(Number(b.dataset.year),0,1,12));});$('month-grid').replaceChildren();for(let m=0;m<12;m++){const date=new Date(periodYear,m,1,12),b=textNode('button',periodYear===viewYear&&m===viewMonth?'active':'',intl({month:'short'}).format(date));b.type='button';b.setAttribute('aria-label',intl({year:'numeric',month:'long'}).format(date));b.addEventListener('click',()=>{const day=Math.min(parseDate(selected).getDate(),new Date(periodYear,m+1,0).getDate());selectDate(dateKey(new Date(periodYear,m,day,12)));$('period-dialog').close();});$('month-grid').append(b);}}
$('period-open').addEventListener('click',()=>{if(!updatePermission())return;periodYear=viewYear;renderPeriod();$('period-dialog').showModal();});
$('period-close').addEventListener('click',()=>$('period-dialog').close());document.querySelectorAll('[data-year]').forEach(b=>b.addEventListener('click',()=>{periodYear=Number(b.dataset.year);renderPeriod();}));
$('prev-month').addEventListener('click',()=>moveMonth(-1));$('next-month').addEventListener('click',()=>moveMonth(1));$('today').addEventListener('click',()=>selectDate(todayKey));$('add-task').addEventListener('click',()=>openForm());for(const id of ['form-cancel','form-close'])$(id).addEventListener('click',closeForm);
$('task-name').addEventListener('input',()=>{updateSaveButton();$('form-error').textContent='';});$('reminder-select').addEventListener('change',()=>{M.stop();updateReminderForm();});for(const id of ['task-date','task-time','reminder-custom'])$(id).addEventListener('input',updateReminderForm);
$('calendar-export').addEventListener('click',()=>{const item=events.find(e=>e.id===editing);if(!item)return;const blob=new Blob([R.toICS(item,Date.now())],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='HaruCheck-'+item.date+'.ics';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify(t('exportHelp'));});
window.addEventListener('storage',e=>{if(e.key===THEME_KEY||e.key===null)applyTheme(e.key===null?'light':e.newValue);if(e.key===LOCALE_KEY||e.key===null)applyLocale(e.key===null?'ko':e.newValue);if(e.key===KEY||e.key===null)try{syncStorage(localStorage.getItem(KEY));}catch{storageInvalid=true;warning('storageLoadError');}});
window.addEventListener('focus',()=>{updatePermission();checkReminders();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){updatePermission();checkReminders();}});
// Resume foreground audio on real user interaction, including after app relaunch.
for(const type of ['pointerdown','keydown'])document.addEventListener(type,event=>{if(event.isTrusted&&M.permissionState(window)==='granted')M.unlock().catch(()=>false);},{capture:true});
if(navigator.permissions?.query)navigator.permissions.query({name:'notifications'}).then(status=>{status.addEventListener('change',()=>{updatePermission();checkReminders();});}).catch(()=>{});
applyTheme(document.documentElement.dataset.theme);applyLocale(language);setInterval(()=>{updatePermission();checkReminders();},15000);
})();
