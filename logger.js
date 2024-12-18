class AppLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000; // 최대 로그 수 제한
        this.loadLogsFromStorage();
    }

    log(message, type = 'info', category = 'general') {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            category,
            message,
            userAgent: navigator.userAgent,
            isStandalone: window.navigator.standalone,
            visibilityState: document.visibilityState,
            sessionStatus: this.getSessionStatus()
        };

        this.logs.push(logEntry);
        this.trimLogs();
        this.saveLogsToStorage();
        this.displayLog(logEntry);
    }

    getSessionStatus() {
        try {
            const currentSession = localStorage.getItem('currentFasting');
            return currentSession ? 'active' : 'inactive';
        } catch (error) {
            return 'error-checking';
        }
    }

    trimLogs() {
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
    }

    saveLogsToStorage() {
        try {
            localStorage.setItem('appLogs', JSON.stringify(this.logs));
        } catch (error) {
            console.error('Failed to save logs:', error);
        }
    }

    loadLogsFromStorage() {
        try {
            const savedLogs = localStorage.getItem('appLogs');
            this.logs = savedLogs ? JSON.parse(savedLogs) : [];
        } catch (error) {
            console.error('Failed to load logs:', error);
            this.logs = [];
        }
    }

    displayLog(logEntry) {
        const logContent = document.getElementById('logContent');
        if (!logContent) return;

        const logElement = document.createElement('div');
        logElement.className = `log-entry log-${logEntry.type}`;
        logElement.textContent = `[${new Date(logEntry.timestamp).toLocaleTimeString()}] [${logEntry.category}] ${logEntry.message}`;
        
        logContent.insertBefore(logElement, logContent.firstChild);
    }

    exportLogs() {
        const logText = this.logs.map(log => 
            `[${log.timestamp}] [${log.type}] [${log.category}] ${log.message}\n` +
            `UserAgent: ${log.userAgent}\n` +
            `Standalone: ${log.isStandalone}\n` +
            `VisibilityState: ${log.visibilityState}\n` +
            `SessionStatus: ${log.sessionStatus}\n` +
            '-------------------'
        ).join('\n');

        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fasting-tracker-logs-${new Date().toISOString()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    clearLogs() {
        this.logs = [];
        this.saveLogsToStorage();
        const logContent = document.getElementById('logContent');
        if (logContent) {
            logContent.innerHTML = '';
        }
    }
} 