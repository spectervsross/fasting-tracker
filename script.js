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

        // Event listeners
        this.startButton.addEventListener('click', () => this.startFasting());
        this.stopButton.addEventListener('click', () => this.stopFasting());

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
        try {
            const isPushSupported = OneSignal.isPushNotificationsSupported();
            if (!isPushSupported) {
                console.log('Push notifications are not supported');
                return false;
            }

            const permission = await OneSignal.getNotificationPermission();
            if (permission === 'granted') {
                return true;
            }

            const result = await OneSignal.showNativePrompt();
            return result;
        } catch (error) {
            console.error('Error requesting notification permission:', error);
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
                    console.error('Error sending notification:', error);
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
        // Check if running on iOS Safari
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        console.log('Device checks:', {
            isIOS,
            isSafari,
            hasNotification: 'Notification' in window,
            hasServiceWorker: 'serviceWorker' in navigator,
            hasPushManager: 'PushManager' in window
        });

        // iOS Safari specific handling
        if (isIOS && isSafari) {
            // Request permission specifically for iOS Safari
            if ('permissions' in navigator) {
                try {
                    const result = await navigator.permissions.query({ name: 'notifications' });
                    console.log('Permission status:', result.state);
                    
                    if (result.state === 'prompt' || result.state === 'default') {
                        const permission = await Notification.requestPermission();
                        console.log('iOS Safari permission result:', permission);
                    }
                } catch (error) {
                    console.error('Permission query error:', error);
                }
            } else {
                // Fallback for older iOS versions
                const permission = await Notification.requestPermission();
                console.log('iOS Safari fallback permission result:', permission);
            }
            return;
        }

        // Continue with regular push notification flow for other browsers
        if (!('Notification' in window)) {
            console.log('This browser does not support notifications');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            console.log('Permission result:', permission);
            if (permission === 'granted') {
                this.subscribeToPushNotifications();
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
        }
    }

    async subscribeToPushNotifications() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.log('Push notifications not supported');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                // Replace with your VAPID public key
                applicationServerKey: this.urlBase64ToUint8Array('BF7-M2aCUeHmkI94ALQzCKkkAysgLhwdcnOv24wxJn6kUbSrDkyeLsegQfNndj4yuF6hH9Ju4W6N89OYLgQ_dsM')
            });

            // Send subscription to your server
            await this.sendSubscriptionToServer(subscription);
        } catch (error) {
            console.error('Failed to subscribe to push notifications:', error);
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

    async sendSubscriptionToServer(subscription) {
        try {
            // Replace with your server endpoint
            await fetch('/api/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(subscription)
            });
        } catch (error) {
            console.error('Error sending subscription to server:', error);
        }
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new FastingTracker();
});
