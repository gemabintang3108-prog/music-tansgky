// TANGSKYMUSIFY SERVICE WORKER
// Cache app-shell (static UI assets) so the PWA is installable & has a basic offline shell.
// Music/API requests always go to the network (never cached) since content is dynamic & streamed.
const CACHE_NAME = 'tangskymusify-shell-v1';
const APP_SHELL = [
    '/downloads.js',
    '/',
    '/index.html',
    '/app.js',
    '/player.js',
    '/home.js',
    '/search.js',
    '/miniplayer.js',
    '/fullplayer.js',
    '/artist.js',
    '/manifest.json',
    '/favicon.ico',
    '/icon-192.png',
    '/icon-512.png'
];

self.addEventListener('install', function(event){
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache){
            return Promise.all(APP_SHELL.map(function(url){
                return cache.add(url).catch(function(){ /* ignore individual failures */ });
            }));
        }).then(function(){ return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function(event){
    event.waitUntil(
        caches.keys().then(function(keys){
            return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
        }).then(function(){ return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function(event){
    var req = event.request;
    if(req.method !== 'GET') return;
    var url = new URL(req.url);

    // Never intercept API calls or cross-origin audio/streaming requests
    if(url.pathname.startsWith('/api/') || url.origin !== location.origin){
        return;
    }

    // App-shell: cache-first, falling back to network
    event.respondWith(
        caches.match(req).then(function(cached){
            if(cached) return cached;
            return fetch(req).then(function(res){
                if(res && res.status === 200){
                    var copy = res.clone();
                    caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
                }
                return res;
            }).catch(function(){ return cached; });
        })
    );
});
