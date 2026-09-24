var CACHE = 'fondo-graduacion-v4';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      // Solo borrar cachés viejas del Fondo: ApiCampo y Encantos viven en el mismo
      // sitio (juceas.github.io) y sus cachés no se deben tocar.
      return Promise.all(keys.filter(function(k){ return k.indexOf('fondo-graduacion') === 0 && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);
  // Solo cacheamos el "cascarón" de la app (nuestro propio origen).
  // Firebase, Firestore, Google Fonts y las CDN de PDF viajan directo a la red.
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(function(cached){
      var network = fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        return res;
      }).catch(function(){ return cached; });
      return cached || network;
    })
  );
});
