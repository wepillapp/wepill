const C='wepill-app-v104';const CORE=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-180.png','zxing.min.js','abertura.webp'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const q=e.request;if(q.method!=='GET'||new URL(q.url).origin!==location.origin)return;
  if(q.mode==='navigate'){e.respondWith(fetch(q).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put('index.html',c));return r}).catch(()=>caches.match('index.html')));return}
  e.respondWith(caches.match(q).then(r=>r||fetch(q).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(q,cp))}return res})))});
/* v76: tocar na notificação do remédio abre o WePill */
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{const c=cs.find(x=>x.url.includes('/app/'));if(c)return c.focus();return self.clients.openWindow('./')}))});
/* v93: aviso do servidor (push), chega mesmo com o app fechado */
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(_){d={body:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(d.title||'Hora do remédio',{body:d.body||'Toque para abrir o WePill.',tag:d.tag||'wepill',renotify:true,requireInteraction:true,icon:'icon-192.png',badge:'icon-192.png',data:{url:d.url||'./',keys:d.keys||[]}}))});
