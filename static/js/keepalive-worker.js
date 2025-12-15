// Web Worker for keepalive - not throttled when tab is hidden
let intervalId = null;

self.onmessage = function(e) {
    if (e.data === 'start') {
        // Send keepalive ping every 4 seconds
        intervalId = setInterval(function() {
            self.postMessage('ping');
        }, 4000);
    } else if (e.data === 'stop') {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }
};
