/**
 * Guacamole-Lite Server
 *
 * Provides a WebSocket tunnel to guacd for RDP connections
 * without requiring Guacamole web application authentication.
 *
 * Connection parameters are passed via encrypted tokens from the CloudTerm backend.
 */

const GuacamoleLite = require('guacamole-lite');

// Configuration
const WEBSOCKET_PORT = parseInt(process.env.WEBSOCKET_PORT || '8080');
const GUACD_HOST = process.env.GUACD_HOST || 'guacd';
const GUACD_PORT = parseInt(process.env.GUACD_PORT || '4822');

// Secret key for token encryption (must be exactly 32 bytes for AES-256)
const CRYPT_SECRET = process.env.CRYPT_SECRET || 'cloudterm-guac-secret-key-32byte';
const CRYPT_CYPHER = 'aes-256-cbc';

console.log(`Starting Guacamole-Lite Server...`);
console.log(`WebSocket Port: ${WEBSOCKET_PORT}`);
console.log(`Guacd Host: ${GUACD_HOST}:${GUACD_PORT}`);
console.log(`Crypt Secret length: ${CRYPT_SECRET.length} bytes`);

// WebSocket server options with keepalive
const websocketOptions = {
    port: WEBSOCKET_PORT,

    // WebSocket keepalive settings to prevent connection timeout
    // These are critical for long-running RDP sessions
    wsOptions: {
        // Ping clients every 10 seconds to check if connection is alive
        // This helps detect dead connections and keeps firewalls/proxies from closing idle connections
        perMessageDeflate: false,  // Disable compression for lower latency
    }
};

// Guacd connection options
const guacdOptions = {
    host: GUACD_HOST,
    port: GUACD_PORT
};

// Client options - allow connections with encrypted tokens
const clientOptions = {
    crypt: {
        cypher: CRYPT_CYPHER,
        key: CRYPT_SECRET
    },

    // Log connections - set to DEBUG for more verbose output
    log: {
        level: 'DEBUG',
        stdLog: (...args) => console.log('[GuacLite]', new Date().toISOString(), ...args),
        errorLog: (...args) => console.error('[GuacLite Error]', new Date().toISOString(), ...args)
    },

    // Connection defaults for RDP
    connectionDefaultSettings: {
        rdp: {
            'security': 'any',
            'ignore-cert': 'true',
            'resize-method': 'display-update',
            'enable-drive': 'false',
            'create-drive-path': 'false',
            'enable-wallpaper': 'false',
            'enable-theming': 'true',
            'enable-font-smoothing': 'true',
            'enable-full-window-drag': 'false',
            'enable-desktop-composition': 'false',
            'enable-menu-animations': 'false',
            'disable-bitmap-caching': 'false',
            'disable-offscreen-caching': 'false'
        }
    }
};

// Callback options for connection events
const callbacks = {
    processConnectionSettings: (settings, callback) => {
        // Process connection settings before connecting
        console.log('[GuacLite] Processing connection settings:', JSON.stringify({
            type: settings.connection?.type,
            hostname: settings.connection?.settings?.hostname,
            port: settings.connection?.settings?.port,
            username: settings.connection?.settings?.username ? '***' : 'not set',
            security: settings.connection?.settings?.security
        }, null, 2));

        callback(null, settings);
    }
};

// Custom token decryption error handler
console.log('[GuacLite] Token encryption configured with cipher:', CRYPT_CYPHER);

// Create the Guacamole-Lite server
const guacServer = new GuacamoleLite(
    websocketOptions,
    guacdOptions,
    clientOptions,
    callbacks
);

// Add connection logging - try multiple event names for compatibility
guacServer.on('open', (clientConnection) => {
    console.log('[GuacLite] EVENT: Connection opened');
});

guacServer.on('close', (clientConnection) => {
    console.log('[GuacLite] EVENT: Connection closed');
});

guacServer.on('error', (clientConnection, error) => {
    console.log('[GuacLite] EVENT: Connection error:', error);
});

// Additional event handlers
guacServer.on('connection', (clientConnection) => {
    console.log('[GuacLite] EVENT: New connection received');
});

// Access the underlying WebSocket server for low-level debugging and keepalive
const wsServer = guacServer.webSocketServer;
if (wsServer) {
    console.log('[GuacLite] WebSocket server instance available');

    // Set up WebSocket ping/pong keepalive
    // This is CRITICAL for keeping long-running RDP sessions alive
    const PING_INTERVAL = 15000;  // 15 seconds
    const PONG_TIMEOUT = 30000;   // 30 seconds to receive pong before considering dead

    wsServer.on('connection', (ws, req) => {
        console.log('[GuacLite] WS: Raw WebSocket connection from:', req.socket.remoteAddress);
        console.log('[GuacLite] WS: URL:', req.url);

        // Track if client is alive
        ws.isAlive = true;
        ws.lastPong = Date.now();

        // Handle pong responses
        ws.on('pong', () => {
            ws.isAlive = true;
            ws.lastPong = Date.now();
        });

        // Handle any message as a sign the connection is alive
        ws.on('message', () => {
            ws.isAlive = true;
            ws.lastPong = Date.now();
        });

        // Set up ping interval for this connection
        const pingInterval = setInterval(() => {
            if (ws.readyState !== 1) {  // 1 = OPEN
                clearInterval(pingInterval);
                return;
            }

            // Check if we haven't received a pong in too long
            if (Date.now() - ws.lastPong > PONG_TIMEOUT) {
                console.log('[GuacLite] WS: Connection timed out - no pong received');
                clearInterval(pingInterval);
                ws.terminate();
                return;
            }

            // Send ping
            if (ws.isAlive === false) {
                console.log('[GuacLite] WS: Connection appears dead, terminating');
                clearInterval(pingInterval);
                ws.terminate();
                return;
            }

            ws.isAlive = false;
            try {
                ws.ping();
            } catch (err) {
                console.log('[GuacLite] WS: Failed to send ping:', err.message);
                clearInterval(pingInterval);
            }
        }, PING_INTERVAL);

        // Clean up on close
        ws.on('close', () => {
            clearInterval(pingInterval);
        });

        ws.on('error', () => {
            clearInterval(pingInterval);
        });
    });

    wsServer.on('error', (error) => {
        console.log('[GuacLite] WS: Server error:', error);
    });
    wsServer.on('headers', (headers, req) => {
        console.log('[GuacLite] WS: Headers event for URL:', req.url);
    });
} else {
    console.log('[GuacLite] ERROR: webSocketServer not available');
}

console.log(`Guacamole-Lite server started on ws://0.0.0.0:${WEBSOCKET_PORT}`);
console.log('Waiting for connections...');
console.log('[GuacLite] Server object type:', typeof guacServer);
console.log('[GuacLite] Available events:', guacServer.eventNames ? guacServer.eventNames() : 'N/A');

// Handle process termination
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    process.exit(0);
});
