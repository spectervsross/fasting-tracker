const CACHE_NAME = 'fasting-tracker-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles.css',
    '/script.js',
    '/service-worker.js',
    '/icon-192.png'
];

self.addEventListener('install', event => {
    console.log('Service Worker installed');
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('activate', event => {
    console.log('Service Worker activated');
    event.waitUntil(clients.claim());
});

self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : { title: 'Fasting Tracker', body: 'Check your fasting progress!' };
    const options = {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: '/' }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            if (clientList.length > 0) {
                return clientList[0].focus();
            }
            return clients.openWindow(event.notification.data.url);
        })
    );
});
