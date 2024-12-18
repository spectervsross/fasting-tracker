let timer = null;
let startTime = null;
let endTime = null;
let lastTick = null;

self.onmessage = function(e) {
    try {
        if (!e.data || !e.data.action) {
            console.warn('Invalid message received:', e.data);
            return;
        }

        if (e.data.action === 'start') {
            if (!e.data.startTime || !e.data.endTime) {
                console.error('Missing required timing data');
                return;
            }
            startTime = e.data.startTime;
            endTime = e.data.endTime;
            lastTick = Date.now();
            startTimer();
        } else if (e.data.action === 'stop') {
            stopTimer();
        }
    } catch (error) {
        console.error('Error in worker:', error);
    }
};

function startTimer() {
    if (timer) clearInterval(timer);
    
    timer = setInterval(() => {
        const now = Date.now();
        const timeLeft = endTime - now;
        
        const timeSinceLastTick = now - lastTick;
        if (timeSinceLastTick > 2000) {
            console.log(`Timer drift detected: ${timeSinceLastTick}ms`);
        }
        lastTick = now;
        
        if (timeLeft <= 0) {
            stopTimer();
            self.postMessage({ type: 'completed' });
        } else {
            self.postMessage({ 
                type: 'tick',
                timeLeft: timeLeft,
                currentTime: now,
                drift: timeSinceLastTick > 2000 ? timeSinceLastTick : 0
            });
        }
    }, 1000);
}

function stopTimer() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
} 