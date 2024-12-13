class FastingTracker {
    constructor() {
        this.logDebug('FastingTracker initialized', 'info');
        this.startTime = null;
        this.updateInterval = null;
        this.notificationTimeout = null;
        this.history = JSON.parse(localStorage.getItem('fastingHistory')) || [];
        this.isMobileSafari = /iPhone|iPod|iPad/.test(navigator.userAgent) && !window.MSStream;
        this.isPWA = window.navigator.standalone === true;
        
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

        // Event listeners
        this.startButton.addEventListener('click', () => this.startFasting());
        this.stopButton.addEventListener('click', () => this.stopFasting());
        this.requestPermissionBtn.addEventListener('click', () => this.requestNotificationPermission());
        this.checkStatusBtn.addEventListener('click', () => this.checkNotificationStatus());
        this.durationSelect.addEventListener('change', () => this.updateRemainingTime());

        // Handle visibility change
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

        // Initialize
        this.loadLastSession();
        this.updateHistoryDisplay();
        
        // Request notification permission on initialization
        this.requestNotificationPermission();

        // Initialize push notifications
        // this.initializePushNotifications();
        
        // Updated Service Worker Registration and Push Notification Subscription
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            window.addEventListener('load', async () => {
                try {
                    console.log('Registering service worker...');
                    const registration = await navigator.serviceWorker.register('/service-worker.js');
                    console.log('Service worker registered:', registration);

                    // Ensure service worker is ready
                    await navigator.serviceWorker.ready;

                    console.log('Checking existing push subscription...');
                    let subscription = await registration.pushManager.getSubscription();

                    if (!subscription) {
                        console.log('No existing subscription. Creating new subscription...');
                        const applicationServerKey = this.urlBase64ToUint8Array('BEOah2sU6PcXuOKlT-GdtAi3krLrU_gOjUO1WCDVG1c7EYviDJq-K5vL0RrQpeHvRzS68lx6LJ9j74SWGt6TjUo'); // Use your VAPID key
                        subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey
                        });
                        console.log('New subscription:', subscription);
                    } else {
                        console.log('Using existing subscription:', subscription);
                    }
                } catch (error) {
                    console.error('Service worker registration or push subscription failed:', error);
                }
            });
        }

        // Add event listener for the Install App button
        document.getElementById('installBtn').addEventListener('click', () => {
            alert('To install this app, tap the "Share" button in Safari, then select "Add to Home Screen."');
        });

        // Check if running as standalone PWA
        if (window.navigator.standalone === true) {
            console.log('Running as a standalone PWA');
        } else {
            console.log('Not running as standalone. Prompt user to install.');
        }

        // Initialize notification support check
        this.checkNotificationSupport();
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

    async startFasting(isNewSession = true) {
        console.log('Start Fasting button clicked');
        if (isNewSession) {
            this.startTime = new Date();
            const selectedDuration = parseInt(this.durationSelect.value);
            localStorage.setItem('currentFasting', JSON.stringify({ 
                startTime: this.startTime,
                duration: selectedDuration
            }));

            // 선택된 시간에 맞춰 알림 스케줄링
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

            try {
                // 알림 권한 확인 및 요청
                if ('Notification' in window && 'serviceWorker' in navigator) {
                    const permission = await Notification.requestPermission();
                    console.log('Notification permission status:', permission);
                    
                    if (permission === 'granted') {
                        const registration = await navigator.serviceWorker.ready;
                        let subscription = await registration.pushManager.getSubscription();
                        
                        if (!subscription) {
                            try {
                                subscription = await registration.pushManager.subscribe({
                                    userVisibleOnly: true,
                                    applicationServerKey: this.urlBase64ToUint8Array('BEOah2sU6PcXuOKlT-GdtAi3krLrU_gOjUO1WCDVG1c7EYviDJq-K5vL0RrQpeHvRzS68lx6LJ9j74SWGt6TjUo')
                                });
                                
                                // 시작 알림
                                registration.showNotification('단식 시작!', {
                                    body: `${selectedDuration}시간 단식이 시작되었습니다.`,
                                    icon: '/icon-192.png',
                                    badge: '/icon-192.png',
                                    vibrate: [200, 100, 200]
                                });
                            } catch (error) {
                                console.error('Push subscription failed:', error);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error in notification setup:', error);
            }
        }
    }

    loadLastSession() {
        const lastSession = localStorage.getItem('currentFasting');
        if (lastSession) {
            const session = JSON.parse(lastSession);
            if (session.startTime && session.duration) {
                this.startTime = new Date(session.startTime);
                this.startFasting(false); // Resume fasting session
                this.scheduleNotification(session.duration); // Schedule notification with duration
            }
        }
    }

    handleVisibilityChange() {
        if (document.visibilityState === 'visible' && this.startTime) {
            this.updateTimer();
        }
    }

    stopFasting() {
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
        localStorage.removeItem('currentFasting');
        
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
        this.gmtTimeDiv.textContent = `${endTime.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })}에 단식이 끝나요!`;
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
