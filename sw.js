const WB_CACHE="warboost-v20-5-34-shell-1";
const WB_SHELL=["/","/index.html","/manifest.webmanifest","/warboost-icon-192.png","/warboost-icon-512.png","/warboost-apple-touch-icon.png"];

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(WB_CACHE);
    await Promise.allSettled(WB_SHELL.map(async url=>{
      try{const response=await fetch(new Request(url,{cache:"reload"}));if(response&&response.ok)await cache.put(url,response.clone())}catch{}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith("warboost-")&&k!==WB_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});

self.addEventListener("fetch",event=>{
  const req=event.request;if(req.method!=="GET")return;
  const url=new URL(req.url);if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith("/api/")){event.respondWith(fetch(req));return;}
  if(req.mode==="navigate"){
    event.respondWith((async()=>{
      try{const response=await fetch(req);if(response&&response.ok){const copy=response.clone();caches.open(WB_CACHE).then(c=>c.put("/index.html",copy));return response}}catch{}
      return (await caches.match("/index.html")) || new Response("WarBoost indisponible hors connexion.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
    })());
    return;
  }
  event.respondWith((async()=>{
    try{const response=await fetch(req);if(response&&response.ok)return response}catch{}
    return (await caches.match(req)) || new Response("",{status:504});
  })());
});
