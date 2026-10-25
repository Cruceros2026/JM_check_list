/* JM Passengers — service worker: keeps the app (page + libraries) on the tablet so it opens with no signal (in flight).
   It does NOT touch the Firebase database traffic: data is synced by the app itself.
   v6 — the page is always asked to the server WITHOUT the browser's HTTP cache (GitHub Pages keeps it ~10 min),
   so a new version uploaded to GitHub reaches the tablets on the next open with signal. */
const CACHE = 'jm-pasajeros-v6';
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'www.gstatic.com'];

self.addEventListener('install', ()=>{ self.skipWaiting(); });
self.addEventListener('activate', (e)=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

function isCacheable(url){
  if(url.hostname.indexOf('firebaseio.com')>=0 || url.hostname.indexOf('googleapis.com')>=0) return false;
  return url.origin === self.location.origin || CDN_HOSTS.indexOf(url.hostname) >= 0;
}

// the page sends the list of files it needs (its own address + the libraries) right after loading
self.addEventListener('message', (e)=>{
  if(!e.data || e.data.type !== 'precache') return;
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all((e.data.urls||[]).map(u=>{
    let url; try{ url = new URL(u); }catch(_){ return null; }
    if(!isCacheable(url)) return null;
    const same = url.origin === self.location.origin;
    return fetch(u, same ? {cache:'reload'} : {mode:'no-cors'}).then(r=>{ if(r && (r.ok || r.type==='opaque')) return c.put(u, r); }).catch(()=>{});
  }))));
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method !== 'GET') return;
  let url; try{ url = new URL(req.url); }catch(_){ return; }
  if(!isCacheable(url)) return;
  const isPage = req.mode === 'navigate' || (url.origin === self.location.origin && /\.html?$/i.test(url.pathname));
  if(isPage){
    // network first, skipping the HTTP cache (to always get the latest version); the saved copy if there is no signal
    const key = url.origin + url.pathname;
    e.respondWith(Promise.race([
      fetch(key, {cache:'no-store', credentials:'same-origin'}).then(r=>{ if(r && r.ok){ const cp = r.clone(); caches.open(CACHE).then(c=>c.put(key, cp)); } return r; }),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')), 6000))
    ]).catch(()=> caches.match(key).then(m=> m || caches.match(req, {ignoreSearch:true}))));
    return;
  }
  // libraries: saved copy first, network otherwise
  e.respondWith(caches.match(req).then(m=> m || fetch(req).then(r=>{
    if(r && (r.ok || r.type==='opaque')){ const cp = r.clone(); caches.open(CACHE).then(c=>c.put(req, cp)); }
    return r;
  })));
});
