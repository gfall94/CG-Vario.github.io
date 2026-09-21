const CACHE='cg-vario-v5';
const ASSETS=['./index.html','./styles.css?v=5','./app.js?v=5','./protocol.js?v=5','./vario.js?v=5','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('cg-vario-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  // HTML is network-first; versioned modules stay together in one release cache.
  if(request.mode==='navigate')event.respondWith(fetch(request,{cache:'no-cache'}).catch(()=>caches.match('./index.html')));
  else event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));
});
