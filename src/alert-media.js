/* Device-local audio storage and foreground playback; never uploads audio. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.HaruMedia=api;})(typeof window!=='undefined'?window:null,function(env){
'use strict';
const MAX_BYTES=10*1024*1024,PATTERN=[250,120,250,120,500];
function validAlert(value){return value==null||(typeof value==='object'&&!Array.isArray(value)&&typeof value.sound==='boolean'&&typeof value.vibration==='boolean'&&(value.soundId===null||typeof value.soundId==='string'&&value.soundId.length>0&&value.soundId.length<=100)&&typeof value.soundName==='string'&&value.soundName.length<=200);}
function options(value){return validAlert(value)&&value?{sound:value.sound,vibration:value.vibration,soundId:value.soundId,soundName:value.soundName}:{sound:true,vibration:true,soundId:null,soundName:''};}
function validateFile(file){if(!file||!file.size||file.size>MAX_BYTES)throw new Error(file?.size>MAX_BYTES?'fileTooLarge':'fileInvalid');if(!/^audio\//i.test(file.type||'')&&!/\.(mp3|wav|ogg|m4a|aac|flac|webm|opus)$/i.test(file.name||''))throw new Error('fileInvalid');}
function permissionState(target){if(!target||!target.isSecureContext||!target.Notification||target.location?.protocol==='file:')return 'unsupported';return target.Notification.permission;}
function systemOptions(value){const a=options(value),result={silent:!a.sound};if(a.sound)result.vibrate=a.vibration?[...PATTERN]:[];return result;}
let dbPromise,context,sources=[],decodedId=null,decodedBuffer=null,playVersion=0;
function database(){if(!env?.indexedDB)return Promise.reject(new Error('fileSaveError'));if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const request=env.indexedDB.open('harucheck-audio-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('sounds',{keyPath:'id'});request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};request.onerror=()=>{dbPromise=null;reject(request.error);};request.onblocked=()=>{dbPromise=null;reject(new Error('fileSaveError'));};});return dbPromise;}
async function transaction(mode,action){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('sounds',mode);let result;const request=action(tx.objectStore('sounds'));request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||new Error('fileSaveError'));tx.onerror=()=>reject(tx.error||new Error('fileSaveError'));});}
async function put(id,file){validateFile(file);await transaction('readwrite',store=>store.put({id,name:file.name.slice(0,200),blob:file}));}
async function get(id){return id?transaction('readonly',store=>store.get(id)):null;}
async function remove(id){if(id)await transaction('readwrite',store=>store.delete(id));if(decodedId===id){decodedId=null;decodedBuffer=null;}}
function audioContext(){if(!context){const C=env?.AudioContext||env?.webkitAudioContext;if(!C)throw new Error('audioBlocked');context=new C();}return context;}
async function unlock(){try{const ctx=audioContext();if(ctx.state==='suspended')await Promise.race([ctx.resume(),new Promise(resolve=>setTimeout(resolve,1000))]);return ctx.state==='running';}catch{return false;}}
function stop(){playVersion++;for(const source of sources)try{source.stop();}catch{}sources=[];try{env?.navigator?.vibrate?.(0);}catch{}}
function tone(ctx){const now=ctx.currentTime;for(let i=0;i<3;i++){const source=ctx.createOscillator(),gain=ctx.createGain(),at=now+i*.4;source.type='sine';source.frequency.value=i===1?1174:880;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.18,at+.02);gain.gain.exponentialRampToValueAtTime(.001,at+.3);source.connect(gain);gain.connect(ctx.destination);source.start(at);source.stop(at+.32);sources.push(source);}}
async function checkFile(file){validateFile(file);try{const buffer=await audioContext().decodeAudioData(await file.arrayBuffer());if(!buffer.duration||!Number.isFinite(buffer.duration))throw new Error();return true;}catch{throw new Error('fileInvalid');}}
async function play(value,{file=null}={}){
 stop();const version=playVersion,a=options(value),result={sound:'off',vibration:'off'};
 if(a.vibration){try{result.vibration=env?.navigator?.vibrate?.(PATTERN)?'requested':'unsupported';}catch{result.vibration='unsupported';}}
 if(!a.sound)return result;
 try{const ctx=audioContext();if(ctx.state!=='running'){result.sound='blocked';return result;}let blob=file;
  if(!blob&&a.soundId){try{blob=(await get(a.soundId))?.blob;}catch{}if(!blob)result.sound='missing';}
  if(version!==playVersion)return {...result,sound:'cancelled'};
  if(blob){try{const buffer=!file&&decodedId===a.soundId?decodedBuffer:await ctx.decodeAudioData(await blob.arrayBuffer());if(version!==playVersion)return {...result,sound:'cancelled'};if(!file){decodedId=a.soundId;decodedBuffer=buffer;}const source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);source.start(0,0,Math.min(buffer.duration,30));sources.push(source);result.sound='played';return result;}catch{result.sound='missing';}}
  if(version===playVersion){tone(ctx);if(result.sound!=='missing')result.sound='played';}
 }catch{result.sound='blocked';}
 return result;
}
return {MAX_BYTES,PATTERN,validAlert,options,validateFile,permissionState,systemOptions,put,get,remove,unlock,stop,checkFile,play};
});
