const CACHE_NAME = 'pelet-tracker-v3';
const STATIC_CACHE = 'pelet-static-v3';
const DYNAMIC_CACHE = 'pelet-dynamic-v3';
const API_CACHE = 'pelet-api-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/utils.js',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Segoe+UI:wght@400;600;700&display=swap'
];

self.addEventListener('install', event => {
  console.log('Service Worker instaliran - verzija 3.0');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Keširanje statičkih resursa');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return caches.open(STATIC_CACHE).then(cache => {
          const offlineHtml = `<!DOCTYPE html>
<html lang="sr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pelet Tracker - Offline</title>
    <meta name="theme-color" content="#764ba2">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            padding: 20px;
        }
        .offline-container {
            max-width: 500px;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
        }
        .icon {
            font-size: 80px;
            margin-bottom: 20px;
        }
        h1 { font-size: 2rem; margin-bottom: 20px; }
        p { font-size: 1.1rem; line-height: 1.6; margin-bottom: 30px; opacity: 0.9; }
        .btn {
            background: white;
            color: #764ba2;
            padding: 15px 30px;
            border: none;
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            text-decoration: none;
        }
        .status {
            margin-top: 30px;
            font-size: 0.9rem;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="offline-container">
        <div class="icon">
            <i class="fas fa-cloud-moon"></i>
        </div>
        <h1>Offline mod</h1>
        <p>
            <i class="fas fa-check-circle" style="color: #27ae60;"></i> 
            Pelet Traktor nastavlja sa radom bez interneta.<br>
            Svi podaci su sačuvani lokalno.
        </p>
        <a href="/" class="btn" onclick="window.location.reload()">
            <i class="fas fa-sync-alt"></i> Pokušaj ponovo
        </a>
        <div class="status">
const CACHE_NAME = 'pelet-tracker-v3';
const STATIC_CACHE = 'pelet-static-v3';
const DYNAMIC_CACHE = 'pelet-dynamic-v3';
const API_CACHE = 'pelet-api-v3';

// Base path za GitHub Pages - DODATO!
const BASE_PATH = '/pelet-tracker';

const STATIC_ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/style.css`,
  `${BASE_PATH}/app.js`,
  `${BASE_PATH}/utils.js`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/offline.html`,
  `${BASE_PATH}/icons/icon-72x72.png`,
  `${BASE_PATH}/icons/icon-96x96.png`,
  `${BASE_PATH}/icons/icon-128x128.png`,
  `${BASE_PATH}/icons/icon-144x144.png`,
  `${BASE_PATH}/icons/icon-152x152.png`,
  `${BASE_PATH}/icons/icon-192x192.png`,
  `${BASE_PATH}/icons/icon-384x384.png`,
  `${BASE_PATH}/icons/icon-512x512.png`,
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Segoe+UI:wght@400;600;700&display=swap'
];

self.addEventListener('install', event => {
  console.log('Service Worker instaliran - verzija 3.0');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Keširanje statičkih resursa');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return caches.open(STATIC_CACHE).then(cache => {
          const offlineHtml = `<!DOCTYPE html>
<html lang="sr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pelet Tracker - Offline</title>
    <meta name="theme-color" content="#764ba2">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            padding: 20px;
        }
        .offline-container {
            max-width: 500px;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
        }
        .icon {
            font-size: 80px;
            margin-bottom: 20px;
        }
        h1 { font-size: 2rem; margin-bottom: 20px; }
        p { font-size: 1.1rem; line-height: 1.6; margin-bottom: 30px; opacity: 0.9; }
        .btn {
            background: white;
            color: #764ba2;
            padding: 15px 30px;
            border: none;
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            text-decoration: none;
        }
        .status {
            margin-top: 30px;
            font-size: 0.9rem;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="offline-container">
        <div class="icon">
            <i class="fas fa-cloud-moon"></i>
        </div>
        <h1>Offline mod</h1>
        <p>
            <i class="fas fa-check-circle" style="color: #27ae60;"></i> 
            Pelet Traktor nastavlja sa radom bez interneta.<br>
            Svi podaci su sačuvani lokalno.
        </p>
        <a href="${BASE_PATH}/" class="btn" onclick="window.location.href='${BASE_PATH}/'">
            <i class="fas fa-sync-alt"></i> Pokušaj ponovo
        </a>
        <div class="status">
            <i class="fas fa-wifi-slash"></i> Nema internet konekcije
        </div>
    </div>
    <script>
        function checkConnection() {
            if (navigator.onLine) window.location.href = '${BASE_PATH}/';
            else setTimeout(checkConnection, 3000);
        }
        setTimeout(checkConnection, 3000);
        window.addEventListener('online', () => window.location.href = '${BASE_PATH}/');
    </script>
</body>
</html>`;
          
          const response = new Response(offlineHtml, {
            headers: {'Content-Type': 'text/html; charset=utf-8'}
          });
          
          return cache.put(`${BASE_PATH}/offline.html`, response);
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker aktiviran');
  
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys.filter(key => {
            return key !== STATIC_CACHE && 
                   key !== DYNAMIC_CACHE && 
                   key !== API_CACHE;
          }).map(key => {
            console.log('Brisanje starog keša:', key);
            return caches.delete(key);
          })
        );
      })
      .then(() => {
        console.log('Service Worker preuzima kontrolu');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Ispravi putanju za poređenje - ukloni BASE_PATH ako postoji
  let pathname = url.pathname;
  if (pathname.startsWith(BASE_PATH)) {
    pathname = pathname.substring(BASE_PATH.length) || '/';
  }
  
  // Proveri da li je statički resurs
  const isStaticAsset = STATIC_ASSETS.some(asset => {
    if (asset.startsWith('http')) {
      return event.request.url.startsWith(asset);
    }
    // Ukloni BASE_PATH iz asset-a za poređenje
    const assetPath = asset.replace(BASE_PATH, '') || '/';
    return pathname === assetPath;
  });
  
  if (isStaticAsset || 
      pathname.startsWith('/icons/') ||
      event.request.url.includes('font-awesome') ||
      event.request.url.includes('chart.js')) {
    
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          
          return fetch(event.request)
            .then(res => {
              return caches.open(STATIC_CACHE)
                .then(cache => {
                  cache.put(event.request, res.clone());
                  return res;
                });
            })
            .catch(() => {
              if (event.request.headers.get('accept').includes('text/html')) {
                return caches.match(`${BASE_PATH}/offline.html`);
              }
              return new Response('Offline mod', { status: 503 });
            });
        })
    );
    return;
  }
  
  if (url.hostname.includes('open-meteo.com')) {
    event.respondWith(
      caches.open(API_CACHE)
        .then(cache => {
          return cache.match(event.request)
            .then(cachedResponse => {
              const fetchPromise = fetch(event.request)
                .then(networkResponse => {
                  cache.put(event.request, networkResponse.clone());
                  return networkResponse;
                })
                .catch(error => {
                  console.log('API nije dostupan offline:', error);
                });
              
              return cachedResponse || fetchPromise;
            });
        })
    );
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE)
            .then(cache => {
              cache.put(event.request, responseClone);
            });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match(`${BASE_PATH}/offline.html`);
            }
            
            return new Response('Offline', { status: 404 });
          });
      })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-temperatures') {
    event.waitUntil(syncTemperatures());
  }
});

async function syncTemperatures() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_TEMPERATURES',
      timestamp: Date.now()
    });
  });
}

self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Podaci su ažurirani',
    icon: `${BASE_PATH}/icons/icon-192x192.png`,
    badge: `${BASE_PATH}/icons/icon-96x96.png`,
    vibrate: [100, 50, 100],
    data: { dateOfArrival: Date.now() },
    actions: [
      { action: 'open', title: 'Otvori aplikaciju' },
      { action: 'close', title: 'Zatvori' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Pelet Tracker Pro', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(`${BASE_PATH}/`)
    );
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    Promise.all([
      caches.delete(DYNAMIC_CACHE),
      caches.delete(API_CACHE)
    ]).then(() => {
      event.ports[0].postMessage({ status: 'ok' });
    });
  }
});

console.log('Service Worker loaded - Pelet Tracker Pro v3.0');
  
  event.waitUntil(
    self.registration.showNotification('Pelet Tracker Pro', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    Promise.all([
      caches.delete(DYNAMIC_CACHE),
      caches.delete(API_CACHE)
    ]).then(() => {
      event.ports[0].postMessage({ status: 'ok' });
    });
  }
});

console.log('Service Worker loaded - Pelet Tracker Pro v3.0');
