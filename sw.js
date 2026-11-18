/* O app agora fica em /app/. Este arquivo substitui o service worker antigo da raiz:
   limpa o cache antigo e se desliga, para a página de vendas sempre abrir atualizada. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>!x.startsWith('wepill-app')).map(x=>caches.delete(x)))).then(()=>self.registration.unregister()).then(()=>self.clients.matchAll({type:'window'})).then(cs=>cs.forEach(c=>{try{const u=new URL(c.url);if(!u.pathname.includes('/app/'))c.navigate(c.url)}catch(_){}})))});
