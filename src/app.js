
(()=>{'use strict';
const R=globalThis.HaruReminders;
const $=id=>document.getElementById(id), MIN='2026-01-01',MAX='2027-12-31',KEY='harucheck.events.v1';
const pad=n=>String(n).padStart(2,'0'), dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, parseDate=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>=MIN&&s<=MAX&&dateKey(parseDate(s))===s;
const todayKey=dateKey(new Date());let selected=todayKey<MIN?MIN:todayKey>MAX?MAX:todayKey, viewYear=parseDate(selected).getFullYear(),viewMonth=parseDate(selected).getMonth(),periodYear=viewYear,editing=null,events=[],toastTimer,lastStored=null,editingConflict=false,storageInvalid=false;
const icons={check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>',cross:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M7 17 17 7"/></svg>',circle:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>',edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z"/></svg>'};
const labels={pending:'예정',done:'완료',failed:'실패'};
function warning(msg){$('storage-warning').textContent=msg;$('storage-warning').classList.remove('hidden')}
function decode(raw){if(raw===null)return [];const parsed=JSON.parse(raw);if(!Array.isArray(parsed)||!parsed.every(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&e.title.trim()&&e.title.length<=100&&validDate(e.date)&&typeof e.time==='string'&&(!e.time||/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time))&&Object.hasOwn(labels,e.status)&&R.isValid(e.reminder))||new Set(parsed.map(e=>e.id)).size!==parsed.length)throw new Error('invalid');return parsed}
try{lastStored=localStorage.getItem(KEY);events=decode(lastStored)}catch(e){storageInvalid=true;warning('저장된 일정을 불러오지 못했어요. 기존 데이터를 보호하기 위해 저장을 중단했어요. 브라우저 저장 설정을 확인해주세요.')}
function syncStorage(raw){const next=decode(raw);storageInvalid=false;if($('task-dialog').open){editingConflict=true;$('form-error').textContent='다른 창에서 일정이 바뀌었어요. 취소 후 다시 열어주세요.'}events=next;lastStored=raw;render()}
function persist(next){try{if(storageInvalid){notify('저장된 일정을 읽지 못해 변경을 저장할 수 없어요.');return false}const raw=localStorage.getItem(KEY);if(raw!==lastStored){syncStorage(raw);notify('다른 창의 변경을 불러왔어요. 다시 시도해주세요.');return false}if(editingConflict){notify('변경된 일정을 확인한 뒤 다시 열어주세요.');return false}const serialized=JSON.stringify(next);localStorage.setItem(KEY,serialized);lastStored=serialized;events=next;return true}catch(e){warning('브라우저 저장 공간을 사용할 수 없어 변경 내용을 저장하지 못했어요. 브라우저 설정을 확인해주세요.');notify('저장하지 못했어요');return false}}

const THEME_KEY='harucheck.theme.v1';
function applyTheme(theme,save=false){const mode=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=mode;document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===mode)));document.querySelector('meta[name="theme-color"]').content=mode==='dark'?'#11161F':'#F6F7FB';if(save)try{localStorage.setItem(THEME_KEY,mode)}catch(e){notify('모드는 바뀌었지만 설정을 저장하지 못했어요.')}}
document.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>applyTheme(b.dataset.themeChoice,true)));applyTheme(document.documentElement.dataset.theme);
window.addEventListener('storage',e=>{if(e.key===THEME_KEY||e.key===null)applyTheme(e.key===null?'light':e.newValue)});

const RECEIPTS_KEY='harucheck.reminder-receipts.v1';
let alarmQueue=[],memoryReceipts={},alarmCheckRunning=false,reminderTimer,notificationRegistration=null;
const friendlyDate=ms=>new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms));
function getFormReminder(){const value=$('reminder-select').value;return value==='none'?null:value==='custom'?{kind:'custom',at:$('reminder-custom').value}:{kind:'offset',minutes:Number(value)}}
function updateReminderForm(){
 const value=$('reminder-select').value,custom=value==='custom';
 $('reminder-custom-field').classList.toggle('hidden',!custom);
 const event={date:$('task-date').value,time:$('task-time').value,reminder:getFormReminder()};
 const due=R.resolve(event);let text='';
 if(value==='none')text='알림을 보내지 않아요.';
 else if(custom&&!event.reminder.at)text='알림을 받을 날짜와 시간을 직접 선택해주세요.';
 else if(!custom&&!event.time)text='일정 시간을 먼저 설정해주세요.';
 else if(!Number.isFinite(due))text='올바른 날짜와 시간을 선택해주세요.';
 else text=`알림 예정 · ${friendlyDate(due)}${due<Date.now()?' (지난 시간)':''}`;
 $('reminder-preview').textContent=text;
 $('reminder-preview').classList.toggle('past',Number.isFinite(due)&&due<Date.now());
}
function fillReminderForm(item){
 const reminder=item?.reminder;
 $('reminder-select').value=reminder?.kind==='custom'?'custom':reminder?.kind==='offset'?String(reminder.minutes):'none';
 $('reminder-custom').value=reminder?.kind==='custom'?reminder.at:'';
 $('calendar-export').classList.toggle('hidden',!item);
 $('calendar-export-help').classList.toggle('hidden',!item);
 updateReminderForm();updateNotificationPermission();
}
function notificationAvailable(){return 'Notification' in window&&window.isSecureContext&&location.protocol!=='file:'}
function updateNotificationPermission(){
 const button=$('notification-enable'),note=$('notification-state');
 if(!notificationAvailable()){button.disabled=true;button.textContent='앱 안에서 알림';note.textContent=location.protocol==='file:'?'파일로 연 화면에서는 앱 안에 알림이 표시돼요.':'이 브라우저에서는 앱 안에 알림이 표시돼요.';return}
 const permission=Notification.permission;
 button.disabled=permission!=='default';button.textContent=permission==='granted'?'브라우저 알림 허용됨':permission==='denied'?'브라우저 알림 차단됨':'브라우저 알림 허용';
 note.textContent=permission==='granted'?'지원되는 기기에서는 브라우저 알림도 표시돼요.':permission==='denied'?'브라우저 설정에서 알림을 허용할 수 있어요. 앱 안의 알림은 계속 표시됩니다.':'허용하지 않아도 앱 안에서 알림을 볼 수 있어요.';
}
async function getNotificationRegistration(){
 if(notificationRegistration)return notificationRegistration;
 if(!notificationAvailable()||!('serviceWorker' in navigator))return null;
 try{const reg=await navigator.serviceWorker.register('./harucheck-sw.js');
  notificationRegistration=await Promise.race([navigator.serviceWorker.ready,new Promise(resolve=>setTimeout(()=>resolve(null),4000))]);return notificationRegistration||reg.active&&reg||null;
 }catch(e){return null}
}
async function sendSystemNotification(item,preview=false){
 if(!notificationAvailable()||Notification.permission!=='granted')return;
 const title=preview?'하루체크 · 테스트 알림':`하루체크 · ${item.title}`;
 const body=preview?'설정한 시간이 되면 이렇게 알려드려요.':`${item.date.replaceAll('-','.')} ${item.time||'시간 없음'} · ${R.describe(item.reminder)}`;
 const options={body,tag:preview?'harucheck-test':R.token(item),data:{url:location.href,date:item.date}};
 try{const reg=await getNotificationRegistration();
  if(!preview&&!events.some(e=>e.id===item.id&&e.status==='pending'&&R.token(e)===R.token(item)))return;
  if(reg&&typeof reg.showNotification==='function'){await reg.showNotification(title,options);return}
  const notification=new Notification(title,options);notification.onclick=()=>{window.focus();if(item.date)selectDate(item.date);notification.close()};
 }catch(e){$('notification-state').textContent='이 환경에서는 시스템 알림을 띄우지 못했어요. 앱 안의 알림을 확인해주세요.'}
}
function reminderSummary(item){
 if(!item.reminder)return '';
 const due=R.resolve(item);if(!Number.isFinite(due))return '';
 return item.status==='pending'?`알림 · ${R.describe(item.reminder)}`:'알림 중지';
}
function renderAlarmQueue(){
 alarmQueue=alarmQueue.filter(a=>a.preview||events.some(e=>e.id===a.item.id&&e.status==='pending'&&R.token(e)===a.token));
 $('alarm-inbox').classList.toggle('hidden',!alarmQueue.length);$('alarm-items').replaceChildren();
 for(const alarm of alarmQueue){const row=document.createElement('div');row.className='alarm-item';
  const copy=document.createElement('div');copy.className='alarm-copy';
  copy.append(textNode('strong','',alarm.preview?'테스트 알림':alarm.item.title));
  copy.append(textNode('p','',alarm.preview?'설정한 시간이 되면 이렇게 알려드려요.':`${alarm.item.date.replaceAll('-','.')} ${alarm.item.time||'시간 없음'} · ${Date.now()-R.resolve(alarm.item)>60000?'지나간 알림':'알림 시간이에요'}`));
  const action=textNode('button','alarm-view',alarm.preview?'확인':'일정 보기');
  action.addEventListener('click',()=>{if(!alarm.preview)selectDate(alarm.item.date);alarmQueue=alarmQueue.filter(a=>a!==alarm);renderAlarmQueue();if(!alarm.preview)$('selected-title').scrollIntoView({behavior:'smooth',block:'center'})});
  row.append(copy,action);$('alarm-items').append(row)
 }
}
function readReceipts(){
 try{const parsed=JSON.parse(localStorage.getItem(RECEIPTS_KEY)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){const now=Date.now();return Object.fromEntries(Object.entries(parsed).filter(([key,value])=>typeof value==='number'&&Number.isFinite(value)&&value>now-7*86400000).slice(-500))}}
 catch(e){}return {...memoryReceipts};
}
async function processDueReminders(){
 if(storageInvalid)return;
 try{const raw=localStorage.getItem(KEY);if(raw!==lastStored)syncStorage(raw)}catch(e){return}
 const receipts=readReceipts(),due=R.dueEvents(events,{...receipts,...memoryReceipts},Date.now());
 if(!due.length)return;
 for(const item of due){const key=R.token(item);receipts[key]=Date.now();memoryReceipts[key]=receipts[key]}
 try{localStorage.setItem(RECEIPTS_KEY,JSON.stringify(receipts))}catch(e){}
 for(const item of due){const token=R.token(item);if(!alarmQueue.some(a=>a.token===token))alarmQueue.push({item:{...item},token});await sendSystemNotification(item)}
 renderAlarmQueue();
}
async function checkReminders(){
 if(alarmCheckRunning)return;alarmCheckRunning=true;
 try{if(navigator.locks?.request)await navigator.locks.request('harucheck-alarm-check',{ifAvailable:true},lock=>lock?processDueReminders():undefined);else await processDueReminders()}
 catch(e){}finally{alarmCheckRunning=false}
}
function exportCalendar(){
 const item=events.find(e=>e.id===editing);if(!item)return;
 const blob=new Blob([R.toICS(item,Date.now())],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download=`하루체크-${item.date}.ics`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 notify('캘린더 파일을 내려받았어요. 가져온 뒤 알림을 확인해주세요.');
}
$('reminder-select').addEventListener('change',updateReminderForm);
for(const id of ['task-date','task-time','reminder-custom'])$(id).addEventListener('input',updateReminderForm);
$('notification-enable').addEventListener('click',async()=>{if(!notificationAvailable())return;try{await Notification.requestPermission();if(Notification.permission==='granted')await getNotificationRegistration()}catch(e){}updateNotificationPermission()});
$('notification-test').addEventListener('click',async()=>{alarmQueue=alarmQueue.filter(a=>!a.preview);alarmQueue.push({preview:true,item:{},token:'preview'});renderAlarmQueue();await sendSystemNotification({},true);notify('테스트 알림을 표시했어요. 닫기를 누르면 확인할 수 있어요.')});
$('alarms-dismiss').addEventListener('click',()=>{alarmQueue=[];renderAlarmQueue()});
$('calendar-export').addEventListener('click',exportCalendar);
window.addEventListener('focus',()=>{updateNotificationPermission();checkReminders()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkReminders()});

function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2600)}
function textNode(tag,cls,text){const el=document.createElement(tag);el.className=cls;el.textContent=text;return el}
function selectDate(key){if(!validDate(key))return;selected=key;const d=parseDate(key);viewYear=d.getFullYear();viewMonth=d.getMonth();render()}
function moveMonth(delta){const d=new Date(viewYear,viewMonth+delta,1,12);if(d.getFullYear()<2026||d.getFullYear()>2027)return;const day=Math.min(parseDate(selected).getDate(),new Date(d.getFullYear(),d.getMonth()+1,0).getDate());selectDate(dateKey(new Date(d.getFullYear(),d.getMonth(),day,12)))}
function renderCalendar(){
 $('year-label').textContent=`${viewYear}년`;$('month-label').textContent=`${viewMonth+1}월`;$('period-open').setAttribute('aria-label',`${viewYear}년 ${viewMonth+1}월 · 연도와 월 선택`);$('prev-month').disabled=viewYear===2026&&viewMonth===0;$('next-month').disabled=viewYear===2027&&viewMonth===11;$('today').disabled=!validDate(todayKey);
 const start=new Date(viewYear,viewMonth,1,12),offset=start.getDay(),days=$('days');days.replaceChildren();
 const length=new Date(viewYear,viewMonth+1,0).getDate(),cells=Math.ceil((offset+length)/7)*7;
 for(let i=0;i<cells;i++){const d=new Date(viewYear,viewMonth,i-offset+1,12),key=dateKey(d),inMonth=d.getMonth()===viewMonth,items=events.filter(e=>e.date===key),b=document.createElement('button');b.type='button';b.className='day'+(!inMonth?' outside':'')+(d.getDay()===0?' sun':'')+(d.getDay()===6?' sat':'')+(key===selected?' selected':'')+(key===todayKey?' is-today':'');b.dataset.date=key;b.disabled=!validDate(key);b.setAttribute('aria-pressed',String(key===selected));if(key===todayKey)b.setAttribute('aria-current','date');b.setAttribute('aria-label',`${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${['일','월','화','수','목','금','토'][d.getDay()]}요일${items.length?', 일정 '+items.length+'개':''}`);b.append(textNode('span','number',String(d.getDate())));const labelStack=document.createElement('span');labelStack.className='day-labels';labelStack.setAttribute('aria-hidden','true');items.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));for(const item of items){const label=textNode('span','event-label '+item.status,'');label.dataset.eventId=item.id;label.title=(item.time?item.time+' · ':'')+item.title+' · '+labels[item.status];if(item.status!=='pending')label.append(textNode('span','label-status',item.status==='done'?'✓':'✕'));label.append(textNode('span','event-title',item.title));labelStack.append(label)}b.append(labelStack);if(items.length)b.setAttribute('aria-label',b.getAttribute('aria-label')+' · '+items.map(e=>e.title+' '+labels[e.status]).join(', '));b.addEventListener('click',()=>selectDate(key));b.addEventListener('keydown',e=>{const map={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};if(!(e.key in map))return;e.preventDefault();const n=parseDate(key);n.setDate(n.getDate()+map[e.key]);const nk=dateKey(n);if(validDate(nk)){selectDate(nk);document.querySelector(`[data-date="${nk}"]`)?.focus()}});days.append(b)}
 $('month-count').textContent=events.filter(e=>e.date.startsWith(`${viewYear}-${pad(viewMonth+1)}-`)).length+'개';
}
function renderAgenda(){
 const d=parseDate(selected),dayEvents=events.filter(e=>e.date===selected).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
 $('date-eyebrow').textContent=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][d.getDay()];$('selected-title').replaceChildren(document.createTextNode(`${d.getMonth()+1}월 ${d.getDate()}일`));if(selected===todayKey)$('selected-title').append(textNode('span','day-badge','오늘'));$('task-count').textContent=dayEvents.length+'개의 일정';$('empty').classList.toggle('hidden',dayEvents.length>0);$('empty').querySelector('p').textContent=selected===todayKey?'오늘 하고 싶은 일을 하나 적어볼까요?':'이날 하고 싶은 일을 하나 적어볼까요?';
 const done=dayEvents.filter(e=>e.status==='done').length,failed=dayEvents.filter(e=>e.status==='failed').length;$('progress-box').classList.toggle('hidden',!dayEvents.length);$('progress-copy').textContent=`완료 ${done} · 실패 ${failed} · 예정 ${dayEvents.length-done-failed}`;$('progress-percent').textContent=dayEvents.length?Math.round(done/dayEvents.length*100)+'% 완료':'';$('progress-done').style.width=(dayEvents.length?done/dayEvents.length*100:0)+'%';$('progress-failed').style.width=(dayEvents.length?failed/dayEvents.length*100:0)+'%';
 $('tasks').replaceChildren();for(const item of dayEvents){const card=document.createElement('article');card.className='task '+item.status;card.dataset.id=item.id;const head=document.createElement('div');head.className='task-head';const copy=document.createElement('div');copy.className='task-copy';copy.append(textNode('span','task-time',item.time||'시간 없음'),textNode('h3','task-title',item.title));const reminderText=reminderSummary(item);if(reminderText)copy.append(textNode('span','task-reminder',reminderText));const edit=document.createElement('button');edit.className='icon-btn edit';edit.innerHTML=icons.edit;edit.setAttribute('aria-label',item.title+' 수정');edit.addEventListener('click',()=>openForm(item.id));head.append(copy,edit);const bottom=document.createElement('div');bottom.className='task-bottom';const label=textNode('span','status-label','');label.innerHTML=icons[item.status==='done'?'check':item.status==='failed'?'cross':'circle'];label.append(document.createTextNode(labels[item.status]));const actions=document.createElement('div');actions.className='status-actions';for(const status of ['done','failed']){const b=document.createElement('button');b.className='status-btn '+(status==='done'?'complete':'fail');b.innerHTML=icons[status==='done'?'check':'cross'];b.append(document.createTextNode(labels[status]));b.setAttribute('aria-pressed',String(item.status===status));b.setAttribute('aria-label',item.title+' '+(item.status===status?'예정으로 되돌리기':labels[status]+'로 변경'));b.title=item.status===status?'다시 누르면 예정으로 바뀌어요':labels[status]+'로 변경';b.addEventListener('click',()=>{const next=item.status===status?'pending':status;if(persist(events.map(e=>e.id===item.id?{...e,status:next}:e))){render();document.querySelector(`[data-id="${item.id}"] .${status==='done'?'complete':'fail'}`)?.focus({preventScroll:true});notify(next==='pending'?'예정으로 되돌렸어요':labels[next]+'로 표시했어요')}});actions.append(b)}bottom.append(label,actions);card.append(head,bottom);$('tasks').append(card)}
}
function render(){renderCalendar();renderAgenda();renderAlarmQueue();checkReminders()}
function openForm(id=null){editing=id;editingConflict=false;const item=events.find(e=>e.id===id);$('task-form').reset();$('form-title').textContent=item?'일정 수정':'일정 추가';$('form-save').textContent=item?'저장하기':'추가하기';$('task-name').value=item?.title||'';$('task-date').value=item?.date||selected;$('task-time').value=item?.time||'';document.querySelector(`input[name="status"][value="${item?.status||'pending'}"]`).checked=true;$('form-status').classList.toggle('hidden',!item);$('delete-open').classList.toggle('hidden',!item);$('form-error').textContent='';$('form-save').disabled=!$('task-name').value.trim();fillReminderForm(item);$('task-dialog').showModal();$('task-name').focus()}
function closeForm(){$('task-dialog').close();editing=null;editingConflict=false}
function renderPeriod(){document.querySelectorAll('[data-year]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.year)===periodYear)));$('month-grid').replaceChildren();for(let m=0;m<12;m++){const b=textNode('button',periodYear===viewYear&&m===viewMonth?'active':'',`${m+1}월`);b.setAttribute('aria-label',`${periodYear}년 ${m+1}월`);b.addEventListener('click',()=>{const day=Math.min(parseDate(selected).getDate(),new Date(periodYear,m+1,0).getDate());selectDate(dateKey(new Date(periodYear,m,day,12)));$('period-dialog').close()});$('month-grid').append(b)}}
 $('prev-month').addEventListener('click',()=>moveMonth(-1));$('next-month').addEventListener('click',()=>moveMonth(1));$('today').addEventListener('click',()=>selectDate(todayKey));$('add-task').addEventListener('click',()=>openForm());$('form-cancel').addEventListener('click',closeForm);$('form-close').addEventListener('click',closeForm);$('task-dialog').addEventListener('close',()=>editing=null);$('task-name').addEventListener('input',()=>{$('form-save').disabled=!$('task-name').value.trim();$('form-error').textContent=''});
 $('task-form').addEventListener('submit',e=>{e.preventDefault();const title=$('task-name').value.trim(),date=$('task-date').value,time=$('task-time').value,status=document.querySelector('input[name="status"]:checked').value;if(!title){$('form-error').textContent='일정 이름을 입력해주세요.';$('task-name').focus();return}if(!validDate(date)){$('form-error').textContent='2026년 1월 1일부터 2027년 12월 31일 사이를 선택해주세요.';$('task-date').focus();return}const reminder=getFormReminder();if(!R.isValid(reminder)){$('form-error').textContent='알림 날짜와 시간을 올바르게 선택해주세요.';return}const due=R.resolve({date,time,reminder});if(reminder&&!Number.isFinite(due)){$('form-error').textContent='일정 시간을 입력하거나 알림을 직접 설정해주세요.';return}const original=events.find(x=>x.id===editing);if(reminder&&due<Date.now()&&(!original||R.resolve(original)!==due)){$('form-error').textContent='알림 시간이 이미 지났어요. 미래 시간이나 알림 없음을 선택해주세요.';return}const wasEditing=Boolean(editing);const item={id:editing||(globalThis.crypto?.randomUUID?.()||`event-${Date.now()}-${Math.random().toString(36).slice(2)}`),title,date,time,status,reminder};const next=editing?events.map(x=>x.id===editing?item:x):[...events,item];if(persist(next)){closeForm();selectDate(date);notify(wasEditing?'일정을 수정했어요':'일정을 추가했어요')}});
 $('delete-open').addEventListener('click',()=>{const item=events.find(e=>e.id===editing);if(!item)return;$('delete-name').textContent=item.title;$('delete-dialog').showModal()});$('delete-cancel').addEventListener('click',()=>$('delete-dialog').close());$('delete-confirm').addEventListener('click',()=>{if(persist(events.filter(e=>e.id!==editing))){$('delete-dialog').close();closeForm();render();notify('일정을 삭제했어요')}});
 $('period-open').addEventListener('click',()=>{periodYear=viewYear;renderPeriod();$('period-dialog').showModal()});$('period-close').addEventListener('click',()=>$('period-dialog').close());document.querySelectorAll('[data-year]').forEach(b=>b.addEventListener('click',()=>{periodYear=Number(b.dataset.year);renderPeriod()}));
 window.addEventListener('storage',e=>{if(e.key!==KEY&&e.key!==null)return;try{syncStorage(localStorage.getItem(KEY));notify('다른 창의 변경을 반영했어요.')}catch(err){storageInvalid=true;warning('다른 창에서 변경된 일정을 읽지 못했어요. 저장 상태를 확인해주세요.')}});render();reminderTimer=setInterval(checkReminders,15000);
})();
