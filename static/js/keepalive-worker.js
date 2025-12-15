// Web Worker for keepalive - not throttled when tab is hidden
// Browsers throttle timers to ~1/minute for hidden tabs, but Web Workers are exempt
let pingIntervalId = null;
let syncIntervalId = null;

self.onmessage = function(e) {
    if (e.data === 'start') {
        // Send keepalive ping every 2 seconds (more aggressive than before)
        // This keeps the WebSocket connection alive
        pingIntervalId = setInterval(function() {
            self.postMessage({ type: 'ping', timestamp: Date.now() });
        }, 2000);

        // Send sync request every 10 seconds to force display update
        // This helps recover frozen displays
        syncIntervalId = setInterval(function() {
            self.postMessage({ type: 'sync' });
        }, 10000);
    } else if (e.data === 'stop') {
        if (pingIntervalId) {
            clearInterval(pingIntervalId);
            pingIntervalId = null;
        }
        if (syncIntervalId) {
            clearInterval(syncIntervalId);
            syncIntervalId = null;
        }
    }
};
