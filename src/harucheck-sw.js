'use strict';
// This worker only displays notifications requested by an open app.
// It has no background alarm scheduler or push subscription.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const url=new URL(event.notification.data?.url||'./harucheck.html',self.location.href);
  if(url.origin!==self.location.origin)return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>client.url.split('?')[0]===url.href.split('?')[0]);
  if(existing)return existing.focus();
  return self.clients.openWindow(url.href);
 })());
});
