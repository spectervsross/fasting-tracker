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
        try {
            const logText = this.logs.map(log => 
                `[${log.timestamp}] [${log.type}] [${log.category}] ${log.message}\n` +
                `UserAgent: ${log.userAgent}\n` +
                `Standalone: ${log.isStandalone}\n` +
                `VisibilityState: ${log.visibilityState}\n` +
                `SessionStatus: ${log.sessionStatus}\n` +
                '-------------------'
            ).join('\n');

            // iOS Safari를 위한 대체 방법
            if (this.isIOSSafari()) {
                // 새 창에 로그 표시
                const newWindow = window.open('', '_blank');
                if (newWindow) {
                    newWindow.document.write(`
                        <html>
                            <head>
                                <title>Fasting Tracker Logs</title>
                                <meta name="viewport" content="width=device-width, initial-scale=1">
                                <style>
                                    body { 
                                        font-family: monospace; 
                                        white-space: pre-wrap; 
                                        padding: 20px;
                                        background: #f5f5f5;
                                    }
                                    .copy-btn {
                                        position: fixed;
                                        top: 20px;
                                        right: 20px;
                                        padding: 10px;
                                        background: #4CAF50;
                                        color: white;
                                        border: none;
                                        border-radius: 5px;
                                        cursor: pointer;
                                    }
                                </style>
                            </head>
                            <body>
                                <button class="copy-btn" onclick="copyLogs()">Copy Logs</button>
                                <pre>${logText}</pre>
                                <script>
                                    function copyLogs() {
                                        const logContent = document.querySelector('pre').textContent;
                                        navigator.clipboard.writeText(logContent)
                                            .then(() => alert('Logs copied to clipboard!'))
                                            .catch(err => alert('Failed to copy: ' + err));
                                    }
                                </script>
                            </body>
                        </html>
                    `);
                    newWindow.document.close();
                } else {
                    alert('Please allow pop-ups to view logs');
                }
                return;
            }

            // 다른 브라우저를 위한 기존 다운로드 방식
            const blob = new Blob([logText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fasting-tracker-logs-${new Date().toISOString()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export logs:', error);
            alert('Failed to export logs. Please try again.');
        }
    }

    isIOSSafari() {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        return isIOS && isSafari;
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