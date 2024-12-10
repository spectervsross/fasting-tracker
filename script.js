class FastingTracker {
    constructor() {
        this.startTime = null;
        this.updateInterval = null;
        this.notificationTimeout = null;
        this.history = JSON.parse(localStorage.getItem('fastingHistory')) || [];
        this.isMobileSafari = /iPhone|iPod|iPad/.test(navigator.userAgent);
        
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

        // Event listeners
        this.startButton.addEventListener('click', () => this.startFasting());
        this.stopButton.addEventListener('click', () => this.stopFasting());
        this.requestPermissionBtn.addEventListener('click', () => this.requestNotificationPermission());
        this.checkStatusBtn.addEventListener('click', () => this.checkNotificationStatus());

        // Handle visibility change
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

        // Initialize
        this.loadLastSession();
        this.updateHistoryDisplay();
        
        // Request notification permission on initialization
        this.requestNotificationPermission();

        // Initialize push notifications
        this.initializePushNotifications();
    }

    async requestNotificationPermission() {
        this.logDebug('Requesting notification permission...', 'info');
        
        try {
            const isPushSupported = OneSignal.isPushNotificationsSupported();
            if (!isPushSupported) {
                this.logDebug('Push notifications are not supported', 'error');
                return false;
            }

            const permission = await OneSignal.getNotificationPermission();
            this.logDebug(`Permission result: ${permission}`, permission === 'granted' ? 'success' : 'error');
            
            if (permission === 'granted') {
                return true;
            }

            const result = await OneSignal.showNativePrompt();
            this.logDebug(`Permission result: ${result}`, result === 'granted' ? 'success' : 'error');
            return result;
        } catch (error) {
            this.logDebug(`Error requesting notification permission: ${error.message}`, 'error');
            return false;
        }
    }

    async scheduleNotification(duration) {
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        const endTime = this.startTime + (duration * 60 * 60 * 1000);
        const currentTime = Date.now();
        const timeLeft = endTime - currentTime;

        if (timeLeft > 0) {
            this.notificationTimeout = setTimeout(async () => {
                try {
                    await OneSignal.sendSelfNotification(
                        "Fasting Tracker", // Title
                        "Your fasting period is complete! ", // Message
                        window.location.href, // URL
                        "/icon-192.png", // Icon
                        {
                            actionButtons: [
                                {
                                    text: "View Stats",
                                    url: window.location.href
                                }
                            ]
                        }
                    );
                } catch (error) {
                    this.logDebug(`Error sending notification: ${error.message}`, 'error');
                }
            }, timeLeft);
        }
    }

    async startFasting(isNewSession = true) {
        if (isNewSession) {
            this.startTime = new Date();
            const selectedDuration = parseInt(this.durationSelect.value);
            localStorage.setItem('currentFasting', JSON.stringify({ 
                startTime: this.startTime,
                targetDuration: selectedDuration
            }));

            // Schedule notification
            this.scheduleNotification(selectedDuration);
        }
        
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
    }

    loadLastSession() {
        const lastSession = localStorage.getItem('currentFasting');
        if (lastSession) {
            const session = JSON.parse(lastSession);
            if (session.startTime) {
                this.startTime = new Date(session.startTime);
                
                // Check if we need to show a missed notification
                const endTimeStr = localStorage.getItem('fastingEndTime');
                if (endTimeStr) {
                    const endTime = new Date(endTimeStr);
                    if (endTime < new Date()) {
                        // Fasting period ended while away
                        if (this.isMobileSafari) {
                            setTimeout(() => alert('Your fasting period ended while you were away!'), 1000);
                        } else if (Notification.permission === 'granted') {
                            new Notification('Fasting Complete!', {
                                body: 'Your fasting period ended while you were away.',
                                icon: '/icon.png'
                            });
                        }
                    } else {
                        // Reschedule notification for remaining time
                        const remainingTime = (endTime - new Date()) / (1000 * 60 * 60);
                        this.scheduleNotification(remainingTime);
                    }
                }
                
                this.startFasting(false);
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
        this.logDebug('Initializing push notifications...', 'info');
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        this.logDebug(`Environment: ${isIOS ? 'iOS' : 'Not iOS'} / ${isSafari ? 'Safari' : 'Not Safari'}`, 'info');

        if (isIOS && isSafari) {
            this.logDebug('iOS Safari detected - checking permissions...', 'info');
            
            if ('permissions' in navigator) {
                try {
                    const result = await navigator.permissions.query({ name: 'notifications' });
                    this.logDebug(`Permission status: ${result.state}`, 'info');
                    
                    if (result.state === 'prompt' || result.state === 'default') {
                        const permission = await Notification.requestPermission();
                        this.logDebug(`iOS Safari permission result: ${permission}`, 'info');
                    }
                } catch (error) {
                    this.logDebug(`Permission query error: ${error.message}`, 'error');
                }
            } else {
                const permission = await Notification.requestPermission();
                this.logDebug(`iOS Safari fallback permission: ${permission}`, 'info');
            }
            return;
        }

        if (!('Notification' in window)) {
            this.logDebug('Notifications not supported in this browser', 'error');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            this.logDebug(`Permission result: ${permission}`, permission === 'granted' ? 'success' : 'error');
            
            if (permission === 'granted') {
                await this.subscribeToPushNotifications();
            }
        } catch (error) {
            this.logDebug(`Error in push initialization: ${error.message}`, 'error');
        }
    }

    async subscribeToPushNotifications() {
        this.logDebug('Attempting to subscribe to push notifications...', 'info');

        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            this.logDebug('Push notifications not supported', 'error');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            this.logDebug('Service Worker is ready', 'success');

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array('BF7-M2aCUeHmkI94ALQzCKkkAysgLhwdcnOv24wxJn6kUbSrDkyeLsegQfNndj4yuF6hH9Ju4W6N89OYLgQ_dsM')
            });

            this.logDebug('Successfully subscribed to push notifications', 'success');
            
            // Send subscription to server
            await this.sendSubscriptionToServer(subscription);
        } catch (error) {
            this.logDebug(`Failed to subscribe: ${error.message}`, 'error');
        }
    }

    async sendSubscriptionToServer(subscription) {
        try {
            const response = await fetch('/api/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(subscription)
            });

            if (response.ok) {
                this.logDebug('Subscription sent to server successfully', 'success');
            } else {
                this.logDebug(`Failed to send subscription to server: ${response.status}`, 'error');
            }
        } catch (error) {
            this.logDebug(`Error sending subscription to server: ${error.message}`, 'error');
        }
    }

    logDebug(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        if (this.debugLog) {
            this.debugLog.insertBefore(logEntry, this.debugLog.firstChild);
        }
        console.log(`${type.toUpperCase()}: ${message}`);
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
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new FastingTracker();
});
