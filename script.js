class SessionStorageManager {
    constructor(dbName = 'FastingTrackerDB', storeName = 'sessions') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = (event) => {
                console.error('IndexedDB 오류:', event.target.errorCode);
                reject(event.target.errorCode);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
        });
    }

    async setItem(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put({ key, value });

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                console.error('IndexedDB setItem 오류:', event.target.errorCode);
                reject(event.target.errorCode);
            };
        });
    }

    async getItem(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = (event) => {
                if (event.target.result) {
                    resolve(event.target.result.value);
                } else {
                    resolve(null);
                }
            };

            request.onerror = (event) => {
                console.error('IndexedDB getItem 오류:', event.target.errorCode);
                reject(event.target.errorCode);
            };
        });
    }

    async removeItem(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                console.error('IndexedDB removeItem 오류:', event.target.errorCode);
                reject(event.target.errorCode);
            };
        });
    }
}

class FastingTracker {
    constructor() {
        this.logDebug('FastingTracker initialized', 'info');
        this.startTime = null;
        this.updateInterval = null;
        this.notificationTimeout = null;
        this.history = JSON.parse(localStorage.getItem('fastingHistory')) || [];
        this.isMobileSafari = /iPhone|iPod|iPad/.test(navigator.userAgent) && !window.MSStream;
        this.isPWA = window.navigator.standalone === true;
        this.initialized = false;
        
        // DOM elements
        this.timerDisplay = document.getElementById('timer');
        this.statusDisplay = document.getElementById('status');
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.historyList = document.getElementById('historyList');
        this.durationSelect = document.getElementById('fastingDuration');
        this.debugLog = document.getElementById('debug-log');
        this.requestPermissionBtn = document.getElementById('request-permission');
        this.checkStatusBtn = document.getElementById('check-status');
        this.remainingTimeDiv = document.getElementById('remainingTime');
        this.gmtTimeDiv = document.getElementById('gmtTime');

        // Event listeners - 초기화 후 이벤트 바인딩
        this.initializeApp();
    }

    async initializeApp() {
        try {
            // SessionStorageManager 초기화
            this.sessionManager = new SessionStorageManager();
            await this.sessionManager.init();
            
            // 이벤트 리스너 바인딩
            this.startButton.addEventListener('click', () => this.startFasting());
            this.stopButton.addEventListener('click', () => this.stopFasting());
            this.requestPermissionBtn.addEventListener('click', () => this.requestNotificationPermission());
            this.checkStatusBtn.addEventListener('click', () => this.checkNotificationStatus());
            this.durationSelect.addEventListener('change', () => this.updateRemainingTime());

            // Handle visibility change
            document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

            // 마지막 세션 로드 및 초기화
            await this.loadLastSession();
            this.updateHistoryDisplay();
            await this.requestNotificationPermission();

            this.initialized = true;
            this.logDebug('FastingTracker initialization completed', 'info');
        } catch (error) {
            console.error('FastingTracker initialization failed:', error);
            this.logDebug(`Initialization error: ${error.message}`, 'error');
        }
    }

    // startFasting 메서드 수정
    async startFasting(isNewSession = true) {
        if (!this.initialized) {
            this.logDebug('FastingTracker not yet initialized', 'error');
            return;
        }

        console.log('Start Fasting button clicked');
        if (isNewSession) {
            try {
                this.startTime = new Date();
                const selectedDuration = parseInt(this.durationSelect.value);
                const endTime = new Date(this.startTime.getTime() + selectedDuration * 60 * 60 * 1000);
                
                await this.sessionManager.setItem('currentFasting', { endTime: endTime });

                this.scheduleNotification(selectedDuration);
                this.updateRemainingTime();
                this.updateTimer();
                
                this.updateInterval = setInterval(() => {
                    if (document.visibilityState === 'visible') {
                        this.updateTimer();
                    }
                }, 1000);

                this.startButton.style.display = 'none';
                this.stopButton.style.display = 'block';
                this.statusDisplay.textContent = 'FASTING';
                this.statusDisplay.style.color = '#4CAF50';

                // 나머지 알림 관련 코드...
            } catch (error) {
                this.logDebug(`Error starting fast: ${error.message}`, 'error');
                console.error('Error starting fast:', error);
            }
        }
    }

    checkNotificationSupport() {
        if (this.isMobileSafari) {
            if (!this.isPWA) {
                console.log('Running in iOS Safari browser - notifications not supported');
                this.showInstallInstructions();
            } else {
                console.log('Running as PWA on iOS - notifications supported');
            }
        }
    }

    showInstallInstructions() {
        const message = document.createElement('div');
        message.className = 'install-instructions';
        message.innerHTML = `
            <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 8px; margin: 10px 0;">
                <strong>알림을 받으려면 앱을 설치하세요!</strong><br>
                1. Safari 공유 버튼을 탭하세요<br>
                2. "홈 화면에 추가"를 선택하세요<br>
                3. 설치된 앱을 실행하세요
            </div>
        `;
        document.querySelector('.container').insertBefore(message, document.querySelector('.timer-circle'));
    }

    async requestNotificationPermission() {
        this.logDebug('Requesting notification permission...', 'info');

        // iOS Safari에서 PWA로 실행 중이 아닌 경우 알림 요청하지 않음
        if (this.isMobileSafari && !this.isPWA) {
            this.logDebug('Notifications not available in iOS Safari browser', 'warn');
            return false;
        }

        try {
            if (!('Notification' in window)) {
                this.logDebug('Notifications not supported in this browser', 'error');
                return false;
            }

            const permission = await Notification.requestPermission();
            this.logDebug(`Permission result: ${permission}`, permission === 'granted' ? 'success' : 'error');

            return permission === 'granted';
        } catch (error) {
            this.logDebug(`Error requesting notification permission: ${error.message}`, 'error');
            return false;
        }
    }

    async sendNotification(title, message) {
        // iOS Safari에서 PWA로 실행 중이 아닌 경우 알림 보내지 않음
        if (this.isMobileSafari && !this.isPWA) {
            console.log('Notifications not available in iOS Safari browser');
            return;
        }

        if (Notification.permission === 'granted') {
            // PWA에서 실행 중일 때는 서비스 워커를 통해 알림 전송
            if (this.isPWA && 'serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                registration.showNotification(title, {
                    body: message,
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    vibrate: [200, 100, 200]
                });
            } else {
                // 일반적인 웹 알림
                new Notification(title, {
                    body: message,
                    icon: '/icon-192.png'
                });
            }
        }
    }

    async scheduleNotification(duration) {
        if (this.isMobileSafari && !this.isPWA) {
            this.logDebug('Notifications not supported in iOS Safari browser', 'warn');
            return;
        }

        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        // duration은 시간 단위로 입력됨 (예: 16, 18, 20, 24)
        const endTime = new Date(this.startTime.getTime() + (duration * 60 * 60 * 1000));
        const currentTime = new Date();
        const timeLeft = endTime.getTime() - currentTime.getTime();

        if (timeLeft > 0) {
            console.log(`Scheduling notification for ${duration} hours from now`);
            
            // 알림 예약
            this.notificationTimeout = setTimeout(async () => {
                if (this.isPWA && 'serviceWorker' in navigator) {
                    const registration = await navigator.serviceWorker.ready;
                    const endTimeStr = endTime.toLocaleTimeString('ko-KR');
                    
                    registration.showNotification('단식 완료!', {
                        body: `${duration}시간 단식이 완료되었습니다! (${endTimeStr})`,
                        icon: '/icon-192.png',
                        badge: '/icon-192.png',
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
                    });

                    // 서버에 알림 요청 보내기
                    try {
                        await fetch('/api/notify', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                message: `${duration}시간 단식이 완료되었습니다! (${endTimeStr})`
                            })
                        });
                    } catch (error) {
                        console.error('Failed to send notification to server:', error);
                    }
                } else {
                    // 일반 웹 알림 사용
                    this.sendNotification(
                        '단식 완료!',
                        `${duration}시간 단식이 완료되었습니다!`
                    );
                }
            }, timeLeft);

            // 중간 알림 (90% 지점)
            const warningTime = timeLeft * 0.9;
            setTimeout(async () => {
                if (this.isPWA && 'serviceWorker' in navigator) {
                    const registration = await navigator.serviceWorker.ready;
                    const remainingMinutes = Math.round(timeLeft * 0.1 / (60 * 1000));
                    
                    registration.showNotification('단식 종료 임박!', {
                        body: `단식 종료까지 약 ${remainingMinutes}분 남았습니다!`,
                        icon: '/icon-192.png',
                        badge: '/icon-192.png',
                        vibrate: [200, 100, 200]
                    });
                }
            }, warningTime);

            console.log(`Notification scheduled for: ${endTime}`);
            this.logDebug(`단식 종료 알림이 ${endTime.toLocaleString()}에 설정되었습니다.`, 'info');
        }
    }

    async loadLastSession() {
        const lastSession = await this.sessionManager.getItem('currentFasting');
        if (lastSession) {
            try {
                const session = lastSession;
                this.logDebug(`Loaded session: ${JSON.stringify(session)}`, 'info');
                if (session.endTime) {
                    const endTime = new Date(session.endTime);
                    const currentTime = new Date();
                    const remainingTime = endTime - currentTime;
                    
                    this.logDebug(`End Time: ${endTime}`, 'info');
                    this.logDebug(`Current Time: ${currentTime}`, 'info');
                    this.logDebug(`Remaining Time (ms): ${remainingTime}`, 'info');
                    
                    if (remainingTime > 0) {
                        this.startTime = new Date(endTime.getTime() - this.getDurationFromRemainingTime(remainingTime));
                        this.startFasting(false);
                        
                        const remainingDuration = remainingTime / (1000 * 60 * 60);
                        this.scheduleNotification(remainingDuration);
                        
                        this.logDebug(`Session restored: ${remainingDuration.toFixed(1)} hours remaining`, 'info');
                    } else {
                        // 세션이 이미 종료된 경우
                        this.logDebug('Previous session already completed', 'info');
                        await this.sessionManager.removeItem('currentFasting');
                        this.addToHistory(new Date(endTime.getTime() - this.getDurationFromRemainingTime(remainingTime)), endTime, this.getDurationFromRemainingTime(remainingTime));
                    }
                }
            } catch (error) {
                this.logDebug(`Error loading session: ${error.message}`, 'error');
                await this.sessionManager.removeItem('currentFasting');
            }
        }
    }

    // 새로운 헬퍼 함수 추가
    getDurationFromRemainingTime(remainingTime) {
        // remainingTime은 밀리초 단위
        return remainingTime / (60 * 60 * 1000); // 시간을 시간 단위로 변환
    }

    // 히스토리에 추가하는 헬퍼 함수
    addToHistory(startTime, endTime, duration) {
        const historyEntry = {
            startTime: startTime,
            endTime: endTime,
            duration: duration * 60 * 60 * 1000 // 시간을 밀리초로 변환
        };
        this.history.unshift(historyEntry);
        localStorage.setItem('fastingHistory', JSON.stringify(this.history));
        this.updateHistoryDisplay();
    }

    handleVisibilityChange() {
        if (document.visibilityState === 'visible' && this.startTime) {
            this.updateTimer();
        }
    }

    async stopFasting() {
        clearInterval(this.updateInterval);
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        const endTime = new Date();
        const duration = endTime.getTime() - this.startTime.getTime();
        
        this.history.unshift({
            startTime: this.startTime,
            endTime: endTime,
            duration: duration
        });
        
        localStorage.setItem('fastingHistory', JSON.stringify(this.history));
        // localStorage.removeItem('currentFasting'); 대신 SessionStorageManager 사용
        await this.sessionManager.removeItem('currentFasting');
        
        this.startButton.style.display = 'block';
        this.stopButton.style.display = 'none';
        this.statusDisplay.textContent = 'NOT FASTING';
        this.timerDisplay.textContent = '00:00:00';
        this.startTime = null;
        
        this.updateHistoryDisplay();
    }

    updateTimer() {
        if (!this.startTime) return;
        
        const now = new Date();
        const duration = now.getTime() - this.startTime.getTime();
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((duration % (1000 * 60)) / 1000);
        
        this.timerDisplay.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    updateHistoryDisplay() {
        if (this.history.length === 0) {
            this.historyList.innerHTML = '<p class="no-records">No fasting records yet</p>';
            return;
        }

        this.historyList.innerHTML = this.history
            .slice(0, 5)
            .map(fast => {
                const duration = this.formatDuration(fast.duration);
                const date = new Date(fast.startTime).toLocaleDateString();
                return `<div style="padding: 10px; border-bottom: 1px solid #eee;">
                    <div style="font-weight: bold;">${duration}</div>
                    <div style="color: #666; font-size: 14px;">${date}</div>
                </div>`;
            })
            .join('');
    }

    formatDuration(duration) {
        const hours = Math.floor(duration / (1000 * 60 * 60));
        const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    async initializePushNotifications() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                const subscription = await registration.pushManager.getSubscription();
                if (!subscription) {
                    const applicationServerKey = this.urlBase64ToUint8Array('<Your VAPID Key>'); // Replace with your VAPID key
                    await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey
                    });
                }
            } catch (error) {
                console.error('Push Notification Initialization Failed:', error);
            }
        }
    }

    logDebug(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;

        const debugLog = document.getElementById('debug-log');
        if (debugLog) {
            debugLog.appendChild(logEntry); // Append to the end to keep all entries
            debugLog.scrollTop = debugLog.scrollHeight; // Auto-scroll to the latest log
        }
    }

    async checkNotificationStatus() {
        this.logDebug('Checking notification status...', 'info');

        // Device and browser checks
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const isStandalone = window.navigator.standalone === true;

        this.logDebug(`Device: ${isIOS ? 'iOS' : 'Not iOS'}`, 'info');
        this.logDebug(`Browser: ${isSafari ? 'Safari' : 'Not Safari'}`, 'info');
        this.logDebug(`Standalone Mode: ${isStandalone ? 'Yes' : 'No'}`, 'info');
        this.logDebug(`Notification API: ${'Notification' in window ? 'Available' : 'Not Available'}`, 'info');
        this.logDebug(`Service Worker API: ${'serviceWorker' in navigator ? 'Available' : 'Not Available'}`, 'info');
        this.logDebug(`Push API: ${'PushManager' in window ? 'Available' : 'Not Available'}`, 'info');

        // Permission status
        if ('Notification' in window) {
            this.logDebug(`Notification Permission: ${Notification.permission}`, 'info');
        }

        // Service Worker status
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            this.logDebug(`Service Worker: ${registration ? 'Registered' : 'Not Registered'}`, 'info');

            if (registration && registration.pushManager) {
                const subscription = await registration.pushManager.getSubscription();
                this.logDebug(`Push Subscription: ${subscription ? 'Active' : 'Not Active'}`, 'info');
            }
        }
    }

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async subscribeToPushNotifications(registration) {
        const pushSupported = 'PushManager' in window;
        console.log('Push supported:', pushSupported);

        if (pushSupported) {
            console.log('Attempting to subscribe to push notifications...');
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                console.log('Existing push subscription:', subscription);
            } else {
                console.log('No existing subscription, creating a new one...');
                const applicationServerKey = 'BEOah2sU6PcXuOKlT-GdtAi3krLrU_gOjUO1WCDVG1c7EYviDJq-K5vL0RrQpeHvRzS68lx6LJ9j74SWGt6TjUo';
                const newSubscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(applicationServerKey)
                });
                console.log('New push subscription created:', newSubscription);
                // Send subscription to server
                await this.sendSubscriptionToServer(newSubscription);
            }
        } else {
            console.log('Push notifications are not supported in this browser.');
        }
    }

    updateRemainingTime() {
        const currentTime = new Date(); 
        console.log("Current Time:", currentTime.toISOString());
        const selectedDuration = parseInt(this.durationSelect.value); 
        console.log("Selected Duration:", selectedDuration);
        const endTime = new Date(currentTime.getTime() + selectedDuration * 60 * 60 * 1000);
        console.log("End Time:", endTime.toISOString());
        const remainingTime = Math.max(0, endTime - currentTime);
        console.log("Remaining Time (ms):", remainingTime);
        const remainingHours = Math.floor(remainingTime / (1000 * 60 * 60));
        const remainingMinutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));

        this.remainingTimeDiv.textContent = `남은 시간: ${remainingHours}시간 ${remainingMinutes}분`;
        this.gmtTimeDiv.textContent = `${endTime.toLocaleTimeString('ko-KR')}에 단식이 끝나요!`;
    }

    refreshSession() {
        this.logDebug('Refreshing session state...', 'info');
        this.loadLastSession();
        this.updateTimer();
        this.updateRemainingTime();
    }

    saveCurrentState() {
        if (this.startTime) {
            const currentState = {
                startTime: this.startTime.toISOString(),
                duration: parseInt(this.durationSelect.value),
                lastSaved: new Date().toISOString()
            };
            localStorage.setItem('currentFasting', JSON.stringify(currentState));
            this.logDebug('State saved before background', 'info');
        }
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new FastingTracker();
});

function displayLog(message) {
    const logContent = document.getElementById('logContent');
    
    const timestamp = new Date().toLocaleTimeString();
    const displayMessage = `[${timestamp}] ${message}\n`; // Append a newline for raw display
    
    logContent.textContent += displayMessage; // Directly append to textContent
    logContent.scrollTop = logContent.scrollHeight; // Auto-scroll to the latest log
}
