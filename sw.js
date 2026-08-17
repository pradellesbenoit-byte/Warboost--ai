const WB_CACHE="warboost-v20-5-6-shell-1";
const WB_SHELL=[
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/offline.html",
  "/warboost-icon-192.png",
  "/warboost-icon-512.png",
  "/warboost-icon-maskable-512.png",
  "/warboost-apple-touch-icon.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(WB_CACHE)
      .then(cache=>cache.addAll(WB_SHELL.map(url=>new Request(url,{cache:"reload"}))))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith("warboost-")&&k!==WB_CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;

  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  if(url.pathname.startsWith("/api/")){
    event.respondWith(fetch(req));
    return;
  }

  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req)
        .then(response=>{
          if(response && response.ok){
            const copy=response.clone();
            caches.open(WB_CACHE).then(cache=>cache.put("/index.html",copy));
          }
          return response;
        })
        .catch(async()=>await caches.match("/index.html") || await caches.match("/offline.html"))
    );
    return;
  }

  if(WB_SHELL.includes(url.pathname) || url.pathname.startsWith("/warboost-icon-") || url.pathname==="/warboost-apple-touch-icon.png"){
    event.respondWith(
      caches.match(req).then(cached=>{
        const fresh=fetch(req).then(response=>{
          if(response && response.ok){
            caches.open(WB_CACHE).then(cache=>cache.put(req,response.clone()));
          }
          return response;
        }).catch(()=>cached);
        return cached || fresh;
      })
    );
  }
});
