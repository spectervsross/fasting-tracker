const CACHE_NAME = 'fasting-tracker-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/script.js',
    '/styles.css',
    '/manifest.json'
];

// 설치 단계 - 리소스 캐시
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                // 각 리소스를 개별적으로 캐시하여 실패한 항목 확인
                return Promise.all(
                    ASSETS_TO_CACHE.map(url => {
                        return cache.add(url).catch(err => {
                            console.error('Cache add failed for:', url, err);
                            return Promise.resolve(); // 개별 실패를 허용하고 계속 진행
                        });
                    })
                );
            })
            .catch(error => {
                console.error('Service Worker 설치 중 오류 발생:', error);
            })
    );
});

// 활성화 단계 - 이전 캐시 정리
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// 요청 가로채기 - 캐시 우선 전략
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 캐시에서 찾았다면 반환
                if (response) {
                    return response;
                }

                // 캐시에 없다면 네트워크 요청
                return fetch(event.request).then(
                    response => {
                        // 유효한 응답이 아니라면 그대로 반환
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // 응답을 복제하여 캐시에 저장
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    }
                );
            })
            .catch(error => {
                console.error('Fetch handler failed:', error);
                // 오프라인 폴백 페이지�� 기본 에러 페이지 제공 가능
            })
    );
});

// 푸시 알림 처리
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

// 알림 클릭 처리
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
