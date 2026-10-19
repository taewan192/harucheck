const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {IDBFactory}=require('fake-indexeddb');
const I=require('../src/i18n.js'),Media=require('../src/alert-media.js');
const template=fs.readFileSync(require.resolve('../src/template.html'),'utf8');
const EVENT_KEY='harucheck.events.v1';
const freshEvent=(changes={})=>({id:'existing',title:'My title / 제목 / 名前',date:'2026-11-01',time:'',status:'pending',reminder:null,...changes});
async function until(predicate){for(let i=0;i<300;i++){if(predicate())return;await new Promise(resolve=>setImmediate(resolve));}assert.fail('Async operation did not complete');}
function boot({permission='granted',supported=true,stored={},idb=new IDBFactory(),decodeFails=false}={}){
 const dom=new JSDOM(template,{url:'https://harucheck.test/harucheck.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,notifications=[],sources=[],vibrations=[],intervals=[];
 Object.defineProperty(w,'isSecureContext',{value:true});Object.defineProperty(w,'indexedDB',{value:idb});
 w.setInterval=fn=>{intervals.push(fn);return intervals.length;};w.setTimeout=()=>1;w.clearTimeout=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 let requests=0;
 if(supported){w.Notification=class {static permission=permission;static requestPermission(){requests++;this.permission='granted';return Promise.resolve('granted');}};}
 else delete w.Notification;
 const registration={showNotification:async(title,options)=>notifications.push({title,options})};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>registration,ready:Promise.resolve(registration)}});
 w.navigator.vibrate=pattern=>{vibrations.push(pattern);return true;};
 w.AudioContext=class {constructor(){this.state='suspended';this.currentTime=0;this.destination={};}resume(){this.state='running';return Promise.resolve();}decodeAudioData(data){return decodeFails||new Uint8Array(data)[0]===0?Promise.reject(new Error('bad audio')):Promise.resolve({duration:2});}createBufferSource(){return {connect(){},start(...args){sources.push({kind:'file',args});},stop(){}};}createOscillator(){return {frequency:{value:0},connect(){},start(){sources.push({kind:'tone'});},stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}};
 for(const [key,value] of Object.entries(stored))w.localStorage.setItem(key,value);
 for(const name of ['theme-init.js','reminder-core.js','i18n.js','alert-media.js','app.js'])w.eval(fs.readFileSync(require.resolve('../src/'+name),'utf8'));
 const $=id=>w.document.getElementById(id);
 const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 const input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));};
 const submit=()=>$('task-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const records=()=>JSON.parse(w.localStorage.getItem(EVENT_KEY)||'[]');
 return {w,$,dom,change,input,submit,records,notifications,sources,vibrations,intervals,idb,get requests(){return requests;}};
}
function dispose(app){app.dom.window.close();}
function upload(app,file){Object.defineProperty(app.$('sound-file'),'files',{value:[file],configurable:true});app.$('sound-file').dispatchEvent(new app.w.Event('change',{bubbles:true}));}
function prepareEvent(app,title='Reminder with sound'){
 app.$('add-task').click();app.input('task-name',title);app.change('reminder-select','custom');app.input('reminder-custom','2027-12-31T10:00');
}

test('all ten locales cover every UI key and preserve interpolation parameters',()=>{
 const expected=Object.keys(I.dictionaries.en).sort();assert.equal(I.locales.length,10);
 for(const {code} of I.locales){assert.deepEqual(Object.keys(I.dictionaries[code]).sort(),expected);for(const key of expected){const value=I.dictionaries[code][key];assert.ok(value.trim(),code+'/'+key);assert.deepEqual((value.match(/\{\w+\}/g)||[]).sort(),(I.dictionaries.en[key].match(/\{\w+\}/g)||[]).sort(),code+'/'+key);}}
 for(const match of template.matchAll(/data-i18n(?:-aria|-placeholder)?="([^"]+)"/g))assert.ok(I.dictionaries.ko[match[1]],match[1]);
});

test('permission gate blocks calendar and mutations until an explicit grant, and re-locks on revocation',async()=>{
 const a=boot({permission:'default'});try{
 assert.equal(a.requests,0);assert.equal(a.$('app-content').inert,true);assert.equal(a.$('permission-gate').classList.contains('hidden'),false);
 a.$('add-task').click();assert.equal(a.$('task-dialog').open,false);a.$('permission-request').click();await until(()=>!a.$('app-content').inert);assert.equal(a.requests,1);
 a.$('add-task').click();assert.equal(a.$('task-dialog').open,true);a.w.Notification.permission='denied';a.w.dispatchEvent(new a.w.Event('focus'));assert.equal(a.$('app-content').inert,true);assert.equal(a.$('task-dialog').open,false);assert.equal(a.$('permission-request').disabled,true);assert.equal(a.$('permission-reason').textContent,I.translate('ko','permissionDenied'));
 }finally{dispose(a);}
});

test('unsupported and denied environments keep language/settings available but never unlock events',()=>{
 for(const args of [{supported:false},{permission:'denied'}]){const a=boot(args);try{a.$('settings-open').click();assert.equal(a.$('settings-dialog').open,true);a.change('settings-language','fr');assert.equal(a.w.document.documentElement.lang,'fr');assert.equal(a.$('app-content').inert,true);a.$('permission-recheck').click();assert.equal(a.$('app-content').inert,true);}finally{dispose(a);}}
});

test('language changes translate dates, form copy, aria labels and persist without changing user titles',()=>{
 const a=boot({stored:{[EVENT_KEY]:JSON.stringify([freshEvent()])}});try{
 assert.equal(a.w.document.querySelectorAll('.header-actions [data-theme-choice]').length,0);
 for(const {code} of I.locales){a.change('settings-language',code);assert.equal(a.w.document.documentElement.lang,code);assert.equal(a.$('settings-open').getAttribute('aria-label'),I.translate(code,'settings'));assert.equal(a.$('task-name').placeholder,I.translate(code,'placeholder'));assert.equal(a.$('reminder-select').options.length,13);assert.equal(a.$('prev-month').getAttribute('aria-label'),I.translate(code,'prev'));assert.equal(a.w.localStorage.getItem('harucheck.locale.v1'),code);assert.equal(a.records()[0].title,'My title / 제목 / 名前');}
 a.w.document.querySelector('[data-theme-choice="dark"]').click();assert.equal(a.w.document.documentElement.dataset.theme,'dark');assert.equal(a.w.localStorage.getItem('harucheck.theme.v1'),'dark');
 assert.equal(a.w.document.getElementById('notification-enable'),null);assert.equal(a.w.document.querySelector('.notification-settings'),null);
 }finally{dispose(a);}
});

test('create, edit and reload preserve sound/vibration preferences and legacy events',async()=>{
 const a=boot();try{prepareEvent(a);a.$('alert-sound').checked=false;a.$('alert-vibration').checked=true;a.submit();await until(()=>a.records().length===1);
 let item=a.records()[0];assert.equal(item.alert.sound,false);assert.equal(item.alert.vibration,true);assert.equal(item.alert.soundId,null);
 a.w.document.querySelector('.task .edit').click();assert.equal(a.$('alert-sound').checked,false);assert.equal(a.$('alert-vibration').checked,true);a.$('alert-vibration').checked=false;a.input('task-name','Changed title');a.submit();await until(()=>a.records()[0].title==='Changed title');item=a.records()[0];assert.equal(item.alert.vibration,false);
 const reloaded=boot({stored:{[EVENT_KEY]:JSON.stringify([item,freshEvent()])}});try{assert.equal(reloaded.records().length,2);assert.equal(reloaded.$('storage-warning').classList.contains('hidden'),true);}finally{dispose(reloaded);}
 }finally{dispose(a);}
});

test('custom audio survives reload in IndexedDB, can play, and is removed only after successful reset',async()=>{
 const a=boot();let item;try{prepareEvent(a);const file=new File([new Uint8Array([1,2,3,4])],'my-sound.wav',{type:'audio/wav'});upload(a,file);await until(()=>a.$('sound-name').textContent==='my-sound.wav');a.submit();await until(()=>a.records().length===1&&!a.$('task-dialog').open);item=a.records()[0];assert.ok(item.alert.soundId);assert.equal((await a.w.HaruMedia.get(item.alert.soundId)).blob.size,4);
 const b=boot({stored:{[EVENT_KEY]:JSON.stringify([item])},idb:a.idb});try{
 await b.w.HaruMedia.unlock();assert.equal((await b.w.HaruMedia.play(item.alert)).sound,'played');assert.equal(b.sources[0].kind,'file');
 assert.ok(b.w.document.querySelector('.task .edit'));b.w.document.querySelector('.task .edit').click();assert.equal(b.$('sound-name').textContent,'my-sound.wav');b.$('form-cancel').click();
 assert.equal((await b.w.HaruMedia.get(item.alert.soundId)).name,'my-sound.wav');
 }finally{dispose(b);}
 a.w.document.querySelector('.task .edit').click();a.$('sound-reset').click();a.submit();await until(()=>a.records()[0].alert.soundId===null);await until(()=>!a.$('task-dialog').open);await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));assert.equal(await a.w.HaruMedia.get(item.alert.soundId),undefined);
 }finally{dispose(a);}
});

test('cancelling an audio selection writes no blob or event; invalid and oversized files are rejected',async()=>{
 assert.throws(()=>Media.validateFile({name:'big.mp3',type:'audio/mpeg',size:Media.MAX_BYTES+1}),/fileTooLarge/);assert.throws(()=>Media.validateFile({name:'not-a-sound.exe',type:'application/octet-stream',size:10}),/fileInvalid/);
 const a=boot();try{prepareEvent(a);let writes=0;const put=a.w.HaruMedia.put;a.w.HaruMedia.put=async(...args)=>{writes++;return put(...args);};upload(a,new File([new Uint8Array([0])],'broken.wav',{type:'audio/wav'}));await until(()=>a.$('sound-feedback').textContent.includes(I.translate('ko','fileInvalid')));assert.equal(a.records().length,0);upload(a,new File([new Uint8Array([1])],'valid.wav',{type:'audio/wav'}));await until(()=>a.$('sound-name').textContent==='valid.wav');a.$('form-cancel').click();assert.equal(writes,0);a.$('add-task').click();assert.equal(a.$('sound-name').textContent,I.translate('ko','defaultSound'));}finally{dispose(a);}
});

test('audio storage failure and a concurrent tab change cannot save dangling sound references',async()=>{
 const a=boot();try{
 prepareEvent(a);upload(a,new File([new Uint8Array([1])],'new.wav',{type:'audio/wav'}));await until(()=>a.$('sound-name').textContent==='new.wav');
 const put=a.w.HaruMedia.put;a.w.HaruMedia.put=async()=>{throw new Error('disk full');};a.submit();await until(()=>a.$('form-error').textContent===I.translate('ko','fileSaveError'));await until(()=>!a.$('task-form').inert);assert.equal(a.records().length,0);assert.equal(a.$('task-dialog').open,true);
 let release;const held=new Promise(r=>release=r);let provisional;a.w.HaruMedia.put=async(id,file)=>{provisional=id;await put(id,file);await held;};a.submit();await until(()=>provisional);a.w.localStorage.setItem(EVENT_KEY,JSON.stringify([freshEvent()]));release();await until(()=>a.$('form-error').textContent===I.translate('ko','storageConflict'));await until(()=>!a.$('task-form').inert);assert.deepEqual(a.records().map(e=>e.id),['existing']);assert.equal(await a.w.HaruMedia.get(provisional),undefined);
 }finally{dispose(a);}
});

test('silent system options never combine silent=true with vibration; missing audio falls back to a tone',async()=>{
 for(const sound of [true,false])for(const vibration of [true,false]){const opts=Media.systemOptions({sound,vibration,soundId:null,soundName:''});if(opts.silent)assert.equal('vibrate' in opts,false);}
 const a=boot();try{await a.w.HaruMedia.unlock();const result=await a.w.HaruMedia.play({sound:true,vibration:true,soundId:'missing',soundName:'gone.wav'});assert.equal(result.sound,'missing');assert.equal(a.sources.filter(s=>s.kind==='tone').length,3);assert.ok(a.vibrations.some(p=>Array.isArray(p)&&p.length===5));a.w.HaruMedia.stop();assert.equal(a.vibrations.at(-1),0);
 const before=a.sources.length;const silent=await a.w.HaruMedia.play({sound:false,vibration:false,soundId:null,soundName:''});assert.equal(silent.sound,'off');assert.equal(a.sources.length,before);
 }finally{dispose(a);}
});

test('closing a form during audio unlock prevents a late preview from playing',async()=>{
 const a=boot();try{prepareEvent(a);let release;const held=new Promise(r=>release=r);a.w.HaruMedia.unlock=()=>held;a.$('sound-preview').click();a.$('form-cancel').click();release(true);await new Promise(r=>setImmediate(r));assert.equal(a.sources.length,0);assert.equal(a.$('task-dialog').open,false);}finally{dispose(a);}
});

test('revoking notification permission during an audio save re-locks the app and rolls back the new blob',async()=>{
 const a=boot();try{prepareEvent(a);upload(a,new File([new Uint8Array([1])],'valid.wav',{type:'audio/wav'}));await until(()=>a.$('sound-name').textContent==='valid.wav');let release,id;const put=a.w.HaruMedia.put,held=new Promise(r=>release=r);a.w.HaruMedia.put=async(key,file)=>{id=key;await put(key,file);await held;};a.submit();await until(()=>id);a.w.Notification.permission='denied';a.w.dispatchEvent(new a.w.Event('focus'));release();await until(()=>!a.$('task-form').inert);assert.equal(a.$('task-dialog').open,false);assert.equal(a.$('app-content').inert,true);assert.equal(a.records().length,0);assert.equal(await a.w.HaruMedia.get(id),undefined);}finally{dispose(a);}
});

test('due reminder delivers selected media and system notification once, without consuming receipts while denied',async()=>{
 const a=boot({permission:'denied'});try{
 const now=new Date(),p=n=>String(n).padStart(2,'0'),stamp=`${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}`;
 const event=freshEvent({id:'due',date:stamp.slice(0,10),reminder:{kind:'custom',at:stamp},alert:{sound:true,vibration:false,soundId:null,soundName:''}});
 a.w.localStorage.setItem(EVENT_KEY,JSON.stringify([event]));a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:EVENT_KEY}));await new Promise(r=>setImmediate(r));assert.equal(a.w.localStorage.getItem('harucheck.reminder-receipts.v1'),null);assert.equal(a.notifications.length,0);
 a.w.Notification.permission='granted';await a.w.HaruMedia.unlock();a.w.dispatchEvent(new a.w.Event('focus'));await until(()=>a.notifications.length===1);assert.equal(a.sources.filter(s=>s.kind==='tone').length,3);assert.equal(a.notifications[0].options.silent,true);assert.equal('vibrate' in a.notifications[0].options,false);
 for(const fn of a.intervals)fn();await new Promise(r=>setImmediate(r));assert.equal(a.notifications.length,1);
 }finally{dispose(a);}
});
