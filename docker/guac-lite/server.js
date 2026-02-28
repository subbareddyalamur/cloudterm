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
    wsOptions: {
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

    log: {
        level: 'DEBUG',
        stdLog: (...args) => console.log('[GuacLite]', new Date().toISOString(), ...args),
        errorLog: (...args) => console.error('[GuacLite Error]', new Date().toISOString(), ...args)
    },

    // Connection defaults for RDP
    connectionDefaultSettings: {
        rdp: {
            'security': 'nla',
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

console.log('[GuacLite] Token encryption configured with cipher:', CRYPT_CYPHER);

// Create the Guacamole-Lite server
const guacServer = new GuacamoleLite(
    websocketOptions,
    guacdOptions,
    clientOptions,
    callbacks
);

// Connection event logging
guacServer.on('open', (clientConnection) => {
    console.log('[GuacLite] EVENT: Connection opened');
});

guacServer.on('close', (clientConnection) => {
    console.log('[GuacLite] EVENT: Connection closed');
});

guacServer.on('error', (clientConnection, error) => {
    console.log('[GuacLite] EVENT: Connection error:', error);
});

guacServer.on('connection', (clientConnection) => {
    console.log('[GuacLite] EVENT: New connection received');
});

// WebSocket ping/pong keepalive for long-running RDP sessions
const wsServer = guacServer.webSocketServer;
if (wsServer) {
    console.log('[GuacLite] WebSocket server instance available');

    const PING_INTERVAL = 15000;  // 15 seconds
    const PONG_TIMEOUT = 30000;   // 30 seconds before considering dead

    wsServer.on('connection', (ws, req) => {
        console.log('[GuacLite] WS: Connection from:', req.socket.remoteAddress, 'URL:', req.url);

        ws.isAlive = true;
        ws.lastPong = Date.now();

        ws.on('pong', () => {
            ws.isAlive = true;
            ws.lastPong = Date.now();
        });

        ws.on('message', () => {
            ws.isAlive = true;
            ws.lastPong = Date.now();
        });

        const pingInterval = setInterval(() => {
            if (ws.readyState !== 1) {
                clearInterval(pingInterval);
                return;
            }

            if (Date.now() - ws.lastPong > PONG_TIMEOUT) {
                console.log('[GuacLite] WS: Connection timed out - no pong received');
                clearInterval(pingInterval);
                ws.terminate();
                return;
            }

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
} else {
    console.log('[GuacLite] ERROR: webSocketServer not available');
}

console.log(`Guacamole-Lite server started on ws://0.0.0.0:${WEBSOCKET_PORT}`);
console.log('Waiting for connections...');

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    process.exit(0);
});
