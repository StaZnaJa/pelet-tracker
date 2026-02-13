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
