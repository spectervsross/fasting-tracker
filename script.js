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
        this.logger = new AppLogger();
        this.logDebug('FastingTracker initialized', 'info');
        
        // DOM 요소 초기화를 최우선으로
        this.initializeDOMElements();
        
        this.startTime = null;
        this.updateInterval = null;
        this.notificationTimeout = null;
        this.history = JSON.parse(localStorage.getItem('fastingHistory')) || [];
        this.isMobileSafari = /iPhone|iPod|iPad/.test(navigator.userAgent) && !window.MSStream;
        this.isPWA = window.navigator.standalone === true;
        this.initialized = false;
        
        // 나머지 초기화
        this.SESSION_CHECK_INTERVAL = 5 * 60 * 1000;
        this.timerWorker = null;
        
        // DOM 요소가 준비된 후에 나머지 초기화 진행
        this.initializeApp();
        this.initializeTimerWorker();
        
        // 주요 이벤트에 대한 로깅 설정
        this.setupEventLogging();
    }

    setupEventLogging() {
        // 백그라운드 전환 감지
        document.addEventListener('visibilitychange', () => {
            this.logger.log(
                `Visibility changed to: ${document.visibilityState}`,
                'info',
                'visibility'
            );
        });

        // 앱 시작/종료 감지
        window.addEventListener('load', () => {
            this.logger.log('App loaded', 'info', 'lifecycle');
        });

        window.addEventListener('beforeunload', () => {
            this.logger.log('App closing', 'info', 'lifecycle');
        });

        // PWA 설치 상태 변경 감지
        window.addEventListener('appinstalled', () => {
            this.logger.log('App installed as PWA', 'info', 'pwa');
        });
    }

    initializeDOMElements() {
        // DOM 요소들을 명확하게 초기화
        this.timerDisplay = document.getElementById('timer');
        this.statusDisplay = document.getElementById('status');
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.historyList = document.getElementById('historyList');
        this.durationSelect = document.getElementById('fastingDuration');
        this.remainingTimeDiv = document.getElementById('remainingTime');
        this.gmtTimeDiv = document.getElementById('gmtTime');

        // DOM 요소 존재 여부 확인
        if (!this.timerDisplay || !this.statusDisplay || !this.startButton || !this.stopButton) {
            throw new Error('Required DOM elements not found');
        }
    }

    // startFasting 메서드 수정
    async startFasting(isNewSession = true) {
        try {
            if (isNewSession) {
                this.logger.log('Starting new fasting session', 'info', 'session');
                const startTime = Date.now();
                const selectedDuration = parseInt(this.durationSelect.value);
                const endTime = startTime + (selectedDuration * 60 * 60 * 1000);

                // Worker 시작
                this.timerWorker.postMessage({
                    action: 'start',
                    startTime: startTime,
                    endTime: endTime
                });

                // IndexedDB에 저장
                await this.sessionManager.setItem('currentFasting', {
                    startTime,
                    endTime,
                    duration: selectedDuration,
                    status: 'active'
                });

                // UI 업데이트
                this.updateUI('FASTING');
            }
        } catch (error) {
            this.logger.log(`Failed to start fasting: ${error.message}`, 'error', 'session');
            console.error('Error starting fast:', error);
        }
    }

    initializeTimerWorker() {
        this.timerWorker = new Worker('timer-worker.js');
        this.timerWorker.onmessage = (e) => {
            if (!this.timerDisplay) return;
            
            if (e.data.type === 'tick') {
                this.updateTimerDisplay(e.data.timeLeft);
                this.saveProgressToStorage(e.data.currentTime);
            } else if (e.data.type === 'completed') {
                this.handleFastingComplete();
            }
        };
    }

    async initializeApp() {
        try {
            // DOM elements 초기화
            this.initializeDOMElements();
            
            // SessionStorageManager 초기화
            this.sessionManager = new SessionStorageManager();
            await this.sessionManager.init();
            
            if (this.startButton && this.stopButton) {
                // 이벤트 리스너 바인딩
                this.startButton.addEventListener('click', () => this.startFasting());
                this.stopButton.addEventListener('click', () => this.stopFasting());
                this.requestPermissionBtn?.addEventListener('click', () => this.requestNotificationPermission());
                this.checkStatusBtn?.addEventListener('click', () => this.checkNotificationStatus());
                this.durationSelect?.addEventListener('change', () => this.updateRemainingTime());

                // Handle visibility change
                document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

                // 마지막 세션 로드 및 초기화
                await this.loadLastSession();
                this.updateHistoryDisplay();
                await this.requestNotificationPermission();

                this.initialized = true;
                this.logDebug('FastingTracker initialization completed', 'info');
            } else {
                throw new Error('Required DOM elements not found');
            }
        } catch (error) {
            console.error('FastingTracker initialization failed:', error);
            this.logDebug(`Initialization error: ${error.message}`, 'error');
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
        try {
            const lastSession = await this.sessionManager.getItem('currentFasting');
            if (lastSession && lastSession.status === 'active') {
                const now = new Date();
                const endTime = new Date(lastSession.endTime);
                const startTime = new Date(lastSession.startTime);

                if (now < endTime) {
                    // 유효한 세션 복원
                    this.startTime = startTime;
                    this.startFasting(false);
                    
                    // 세션 모니터링 재시작
                    this.startSessionMonitoring();

                    const remainingTime = (endTime - now) / (1000 * 60 * 60);
                    this.scheduleNotification(remainingTime);
                    
                    this.logDebug(`Session restored: ${remainingTime.toFixed(1)} hours remaining`, 'info');
                } else {
                    // 만료된 세션 정리
                    this.logDebug('Previous session expired', 'info');
                    await this.stopFasting(true);
                }
            }
        } catch (error) {
            this.logDebug(`Error loading session: ${error.message}`, 'error');
            await this.sessionManager.removeItem('currentFasting');
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
        if (document.visibilityState === 'visible') {
            this.checkAndUpdateSession();
        }
    }

    async stopFasting(isAutoStop = false) {
        try {
            this.logger.log(
                `Stopping fasting session (Auto: ${isAutoStop})`,
                'info',
                'session'
            );
            const currentSession = await this.sessionManager.getItem('currentFasting');
            if (currentSession) {
                const endTime = isAutoStop ? new Date(currentSession.endTime) : new Date();
                const duration = (endTime - new Date(currentSession.startTime)) / (1000 * 60 * 60);

                // 히스토리에 추가
                this.addToHistory(new Date(currentSession.startTime), endTime, duration);

                // 세션 정리
                await this.sessionManager.removeItem('currentFasting');
                
                // 인터벌 정리
                if (this.sessionCheckInterval) {
                    clearInterval(this.sessionCheckInterval);
                }
                if (this.updateInterval) {
                    clearInterval(this.updateInterval);
                }

                // UI 업데이트
                this.startButton.style.display = 'block';
                this.stopButton.style.display = 'none';
                this.statusDisplay.textContent = 'NOT FASTING';
                this.timerDisplay.textContent = '00:00:00';
                this.startTime = null;

                this.updateHistoryDisplay();
            }
        } catch (error) {
            this.logger.log(`Failed to stop fasting: ${error.message}`, 'error', 'session');
            console.error('Error stopping fast:', error);
        }
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

    // 세션 모니터링 시작
    startSessionMonitoring() {
        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
        }

        this.sessionCheckInterval = setInterval(async () => {
            await this.checkAndUpdateSession();
        }, this.SESSION_CHECK_INTERVAL);
    }

    // 세션 상태 확인 및 업데이트
    async checkAndUpdateSession() {
        try {
            const currentSession = await this.sessionManager.getItem('currentFasting');
            if (currentSession && currentSession.status === 'active') {
                const now = new Date();
                const endTime = new Date(currentSession.endTime);

                if (now >= endTime) {
                    // 세션 종료 처리
                    await this.stopFasting(true);
                } else {
                    // 세션 상태 업데이트
                    currentSession.lastUpdated = now;
                    await this.sessionManager.setItem('currentFasting', currentSession);
                }
            }
        } catch (error) {
            console.error('Session check failed:', error);
        }
    }

    saveProgressToStorage(currentTime) {
        // 주기적으로 IndexedDB에 진행 상황 저장
        if (currentTime % (5 * 60 * 1000) === 0) { // 5분마다 저장
            this.sessionManager.getItem('currentFasting').then(session => {
                if (session) {
                    session.lastChecked = currentTime;
                    this.sessionManager.setItem('currentFasting', session);
                }
            });
        }
    }

    handleFastingComplete() {
        this.stopFasting(true);
        // 완료 알림 표시
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('단식 완료!', {
                body: '축하합니다! 단식이 완료되었습니다.',
                icon: '/icon-192.png'
            });
        }
    }

    updateUI(status) {
        this.statusDisplay.textContent = status;
        if (status === 'FASTING') {
            this.startButton.style.display = 'none';
            this.stopButton.style.display = 'block';
        } else {
            this.startButton.style.display = 'block';
            this.stopButton.style.display = 'none';
        }
    }

    updateTimerDisplay(timeLeft) {
        if (!this.timerDisplay) return;
        
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        
        this.timerDisplay.textContent = 
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        // 남은 시간 업데이트
        if (this.remainingTimeDiv) {
            this.remainingTimeDiv.textContent = `${hours}시간 ${minutes}분 ${seconds}초 남음`;
        }
        
        // GMT 시간 업데이트
        if (this.gmtTimeDiv) {
            const endTime = new Date(Date.now() + timeLeft);
            this.gmtTimeDiv.textContent = `${endTime.toLocaleTimeString()}에 종료`;
        }
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    const tracker = new FastingTracker();
    
    // 로그 내보내기 버튼 이벤트 리스너
    document.getElementById('exportLogsBtn').addEventListener('click', () => {
        tracker.logger.exportLogs();
    });
});

function displayLog(message) {
    const logContent = document.getElementById('logContent');
    
    const timestamp = new Date().toLocaleTimeString();
    const displayMessage = `[${timestamp}] ${message}\n`; // Append a newline for raw display
    
    logContent.textContent += displayMessage; // Directly append to textContent
    logContent.scrollTop = logContent.scrollHeight; // Auto-scroll to the latest log
}
