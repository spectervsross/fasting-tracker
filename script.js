class FastingTracker {
    constructor() {
        this.logDebug('FastingTracker initialized', 'info');
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
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
                try {
                    console.log('Attempting to register service worker...');
                    const registration = await navigator.serviceWorker.register('/service-worker.js');
                    console.log('ServiceWorker registration successful:', registration);

                    // Check if push is supported
                    const pushSupported = 'PushManager' in window;
                    console.log('Push supported:', pushSupported);

                    if (pushSupported) {
                        console.log('Attempting to subscribe to push notifications...');
                        const subscription = await registration.pushManager.getSubscription();
                        if (subscription) {
                            console.log('Existing push subscription:', subscription);
                        } else {
                            console.log('No existing subscription, creating a new one...');
                            const applicationServerKey = this.urlBase64ToUint8Array('BEOah2sU6PcXuOKlT-GdtAi3krLrU_gOjUO1WCDVG1c7EYviDJq-K5vL0RrQpeHvRzS68lx6LJ9j74SWGt6TjUo');
                            const newSubscription = await registration.pushManager.subscribe({
                                userVisibleOnly: true,
                                applicationServerKey: applicationServerKey.buffer
                            });
                            console.log('New push subscription created:', newSubscription);
                        }
                    } else {
                        console.log('Push notifications are not supported in this browser.');
                    }
                } catch (err) {
                    console.error('ServiceWorker registration failed:', err);
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
    }

    async requestNotificationPermission() {
        this.logDebug('Requesting notification permission...', 'info');

        try {
            if (!('Notification' in window)) {
                this.logDebug('Notifications not supported in this browser', 'error');
                return false;
            }

            const permission = await Notification.requestPermission();
            
            // Log the permission status after the request
            this.logDebug(`Permission result: ${permission}`, permission === 'granted' ? 'success' : 'error');

            // Check the permission status directly
            const currentPermission = Notification.permission;
            this.logDebug(`Current Notification permission status: ${currentPermission}`, currentPermission === 'granted' ? 'success' : 'error');

            if (currentPermission === 'granted') {
                this.logDebug('Notification permission granted', 'success');
            } else if (currentPermission === 'denied') {
                this.logDebug('Notification permission denied', 'warn');
            } else {
                this.logDebug('Notification permission dismissed', 'info');
            }

            return currentPermission === 'granted';
        } catch (error) {
            this.logDebug(`Error requesting notification permission: ${error.message}`, 'error');
            return false;
        }
    }

    async scheduleNotification(duration) {
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        const endTime = this.startTime.getTime() + (duration * 60 * 60 * 1000);
        const currentTime = Date.now();
        const timeLeft = endTime - currentTime;

        if (timeLeft > 0) {
            this.notificationTimeout = setTimeout(() => {
                this.sendNotification("Fasting Tracker", "Your fasting period is complete!");
            }, timeLeft);
        }
    }

    sendNotification(title, message) {
        if (Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/icon-192.png'
            });
        }
    }

    async startFasting(isNewSession = true) {
        console.log('Start Fasting button clicked'); // Debug log
        if (isNewSession) {
            this.startTime = new Date(); // Set startTime as a Date object
            const selectedDuration = parseInt(this.durationSelect.value);
            localStorage.setItem('currentFasting', JSON.stringify({ 
                startTime: this.startTime,
                duration: selectedDuration
            }));

            // Schedule notification for 1 minute later
            this.scheduleNotification(1/60); // 1 minute in hours
            
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
                // Check for push notification support
                if ('Notification' in window && 'serviceWorker' in navigator) {
                    console.log('Requesting notification permission...');
                    const permission = await Notification.requestPermission();
                    console.log('Notification permission status:', permission);
                    
                    if (permission === 'granted') {
                        const registration = await navigator.serviceWorker.ready;
                        let subscription = await registration.pushManager.getSubscription();
                        
                        if (!subscription) {
                            try {
                                console.log('Creating new push subscription...');
                                subscription = await registration.pushManager.subscribe({
                                    userVisibleOnly: true,
                                    applicationServerKey: this.urlBase64ToUint8Array('BEOah2sU6PcXuOKlT-GdtAi3krLrU_gOjUO1WCDVG1c7EYviDJq-K5vL0RrQpeHvRzS68lx6LJ9j74SWGt6TjUo')
                                });
                                console.log('New push subscription created:', subscription.toJSON());
                                
                                // Show success message
                                new Notification('Push Notifications Enabled', {
                                    body: 'You will receive notifications about your fasting progress',
                                    icon: '/icon-192.png'
                                });
                            } catch (subscribeError) {
                                console.log('Push subscription failed:', {
                                    name: subscribeError.name,
                                    message: subscribeError.message,
                                    browserSupport: {
                                        pushManager: 'PushManager' in window,
                                        notification: 'Notification' in window,
                                        serviceWorker: 'serviceWorker' in navigator
                                    }
                                });
                            }
                        } else {
                            console.log('Using existing push subscription');
                        }
                    }
                }
                
                // Show fasting started notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Fasting Started', {
                        body: 'Your fasting timer has started. Stay strong!',
                        icon: '/icon-192.png'
                    });
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
        try {
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
        } catch (error) {
            console.error('Invalid base64 encoding:', error);
            throw new Error('Invalid applicationServerKey encoding.');
        }
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
