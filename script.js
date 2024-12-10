class FastingTracker {
    constructor() {
        this.startTime = null;
        this.updateInterval = null;
        this.notificationTimeout = null;
        this.history = JSON.parse(localStorage.getItem('fastingHistory')) || [];
        this.notificationsEnabled = false;
        
        // DOM elements
        this.timerDisplay = document.getElementById('timer');
        this.statusDisplay = document.getElementById('status');
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.historyList = document.getElementById('historyList');
        this.notificationBtn = document.getElementById('notificationBtn');
        this.durationSelect = document.getElementById('fastingDuration');

        // Event listeners
        this.startButton.addEventListener('click', () => this.startFasting());
        this.stopButton.addEventListener('click', () => this.stopFasting());
        this.notificationBtn.addEventListener('click', () => this.requestNotificationPermission());

        // Handle visibility change
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

        // Initialize
        this.loadLastSession();
        this.updateHistoryDisplay();
        this.checkNotificationPermission();
    }

    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            alert('This browser does not support notifications');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                this.notificationsEnabled = true;
                this.notificationBtn.textContent = 'Notifications Enabled';
                this.notificationBtn.classList.add('enabled');
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
        }
    }

    checkNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'granted') {
            this.notificationsEnabled = true;
            this.notificationBtn.textContent = 'Notifications Enabled';
            this.notificationBtn.classList.add('enabled');
        }
    }

    scheduleNotification(duration) {
        if (this.notificationsEnabled && 'Notification' in window) {
            // Clear any existing notification timeout
            if (this.notificationTimeout) {
                clearTimeout(this.notificationTimeout);
            }

            // Schedule new notification
            this.notificationTimeout = setTimeout(() => {
                new Notification('Fasting Complete!', {
                    body: 'Your fasting period has ended.',
                    icon: '/icon.png'
                });
            }, duration * 60 * 60 * 1000); // Convert hours to milliseconds
        }
    }

    loadLastSession() {
        const lastSession = localStorage.getItem('currentFasting');
        if (lastSession) {
            const session = JSON.parse(lastSession);
            if (session.startTime) {
                this.startTime = new Date(session.startTime);
                this.startFasting(false);
            }
        }
    }

    handleVisibilityChange() {
        if (document.visibilityState === 'visible' && this.startTime) {
            this.updateTimer();
        }
    }

    startFasting(isNewSession = true) {
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
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new FastingTracker();
});
