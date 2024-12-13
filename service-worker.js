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
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    console.log('Service Worker activated');
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            // Clear old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(response => {
                    // Check if we received a valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                });
            })
    );
});

self.addEventListener('push', event => {
    console.log('Push event received:', event);
    
    let notification = {
        title: 'Fasting Tracker',
        body: 'Check your fasting progress!',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: '/' }
    };

    try {
        if (event.data) {
            const data = event.data.json();
            notification = {
                ...notification,
                ...data
            };
        }
    } catch (e) {
        console.error('Error parsing push data:', e);
    }

    event.waitUntil(
        self.registration.showNotification(notification.title, {
            body: notification.body,
            icon: notification.icon,
            badge: notification.badge,
            data: notification.data,
            vibrate: [200, 100, 200],
            actions: [
                {
                    action: 'open',
                    title: '앱 열기'
                },
                {
                    action: 'close',
                    title: '닫기'
                }
            ]
        })
    );
});

self.addEventListener('notificationclick', event => {
    console.log('Notification click event:', event);
    
    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // 이미 열린 창이 있다면 포커스
                for (const client of clientList) {
                    if (client.url === event.notification.data.url && 'focus' in client) {
                        return client.focus();
                    }
                }
                // 열린 창이 없다면 새 창 열기
                if (clients.openWindow) {
                    return clients.openWindow(event.notification.data.url);
                }
            })
    );
});
