// CloudTerm — Main Frontend Application
// Manages WebSocket connections, terminal sessions (xterm.js), RDP sessions,
// sidebar tree rendering, tab management, and theme switching.

'use strict';

// ---------------------------------------------------------------------------
// OS Icon SVGs
// ---------------------------------------------------------------------------

const OS_ICONS = {
    rhel: '<svg viewBox="0 0 24 24" fill="#ee0000"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.1 0 2 .67 2 1.5S13.1 8 12 8s-2-.67-2-1.5S10.9 5 12 5zm4.5 12H7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h9c.28 0 .5.22.5.5s-.22.5-.5.5zm.5-3H7c-.55 0-1-.45-1-1v-1c0-.55.45-1 1-1h10c.55 0 1 .45 1 1v1c0 .55-.45 1-1 1z"/></svg>',
    windows: '<svg viewBox="0 0 24 24" fill="#0078d4"><path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 5.3l9.5-1.3v8h-9.5V5.3zM11.5 12.5H21v8l-9.5-1.3V12.5z"/></svg>',
    linux: '<svg viewBox="0 0 24 24" fill="#f0c040"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>'
};

// ---------------------------------------------------------------------------
// Theme Definitions
// ---------------------------------------------------------------------------

const PAGE_THEMES = {
    dark: {
        '--bg': '#060911', '--s1': '#0b0f17', '--s2': '#111827', '--s3': '#1a2235',
        '--b1': '#1e2a3d', '--b2': '#2d3f5c', '--text': '#dce8ff',
        '--muted': '#6b82a8', '--dim': '#3a4d6b',
        '--ssh': '#3ddc84', '--rdp': '#60a5fa', '--orange': '#fb923c',
        '--red': '#f87171', '--yellow': '#fbbf24', '--purple': '#a78bfa'
    },
    nord: {
        '--bg': '#2e3440', '--s1': '#3b4252', '--s2': '#434c5e', '--s3': '#4c566a',
        '--b1': '#4c566a', '--b2': '#5e6779', '--text': '#eceff4',
        '--muted': '#81a1c1', '--dim': '#616e88',
        '--ssh': '#a3be8c', '--rdp': '#88c0d0', '--orange': '#d08770',
        '--red': '#bf616a', '--yellow': '#ebcb8b', '--purple': '#b48ead'
    },
    dracula: {
        '--bg': '#282a36', '--s1': '#21222c', '--s2': '#343746', '--s3': '#3e4154',
        '--b1': '#44475a', '--b2': '#6272a4', '--text': '#f8f8f2',
        '--muted': '#6272a4', '--dim': '#565967',
        '--ssh': '#50fa7b', '--rdp': '#8be9fd', '--orange': '#ffb86c',
        '--red': '#ff5555', '--yellow': '#f1fa8c', '--purple': '#bd93f9'
    },
    cyber: {
        '--bg': '#0a0a12', '--s1': '#0e0e1a', '--s2': '#141422', '--s3': '#1c1c30',
        '--b1': '#2a1e42', '--b2': '#3d2d5c', '--text': '#e4dfff',
        '--muted': '#8b7eb0', '--dim': '#554d70',
        '--ssh': '#00ff88', '--rdp': '#00d4ff', '--orange': '#ff6b9d',
        '--red': '#ff4466', '--yellow': '#ffe156', '--purple': '#c084fc'
    },
    'warp-hero': {
        '--bg': '#0c110e', '--s1': '#121a15', '--s2': '#18211d', '--s3': '#1f2b24',
        '--b1': '#263330', '--b2': '#345045', '--text': '#e0f0e8',
        '--muted': '#6b9880', '--dim': '#3d5c4c',
        '--ssh': '#40a02b', '--rdp': '#1e66f5', '--orange': '#df8e1d',
        '--red': '#d20f39', '--yellow': '#df8e1d', '--purple': '#ea76cb'
    },
    light: {
        '--bg': '#f0f2f5', '--s1': '#ffffff', '--s2': '#e4e7ec', '--s3': '#d1d5db',
        '--b1': '#c0c5ce', '--b2': '#9ca3af', '--text': '#111827',
        '--muted': '#4b5563', '--dim': '#9ca3af',
        '--ssh': '#16a34a', '--rdp': '#2563eb', '--orange': '#ea580c',
        '--red': '#dc2626', '--yellow': '#ca8a04', '--purple': '#7c3aed'
    },
    railway: {
        '--bg': '#13111c', '--s1': '#1c1a27', '--s2': '#24222f', '--s3': '#2d2b3a',
        '--b1': '#393552', '--b2': '#44415a', '--text': '#e0def4',
        '--muted': '#908caa', '--dim': '#6e6a86',
        '--ssh': '#64d8a0', '--rdp': '#82b1ff', '--orange': '#f6c177',
        '--red': '#eb6f92', '--yellow': '#f6c177', '--purple': '#c4a7e7'
    },
    replit: {
        '--bg': '#0e1525', '--s1': '#141c2e', '--s2': '#1c2439', '--s3': '#242e47',
        '--b1': '#2b3553', '--b2': '#3c4a6e', '--text': '#f5f9fc',
        '--muted': '#94a3b8', '--dim': '#576d8a',
        '--ssh': '#0cd68a', '--rdp': '#3b82f6', '--orange': '#f97316',
        '--red': '#ef4444', '--yellow': '#eab308', '--purple': '#8b5cf6'
    },
    raycast: {
        '--bg': '#0a0a0b', '--s1': '#121214', '--s2': '#1a1a1d', '--s3': '#222225',
        '--b1': '#2a2a2e', '--b2': '#38383d', '--text': '#ededef',
        '--muted': '#8e8e93', '--dim': '#56565b',
        '--ssh': '#30d158', '--rdp': '#5e5ce6', '--orange': '#ff9f0a',
        '--red': '#ff453a', '--yellow': '#ffd60a', '--purple': '#bf5af2'
    },
    unify: {
        '--bg': '#171615', '--s1': '#1e1d1b', '--s2': '#262422', '--s3': '#302e2b',
        '--b1': '#3a3835', '--b2': '#4a4744', '--text': '#e8e4df',
        '--muted': '#9c9690', '--dim': '#635e58',
        '--ssh': '#7ecfb3', '--rdp': '#7baed4', '--orange': '#d4915e',
        '--red': '#cf6f6f', '--yellow': '#c9b87a', '--purple': '#a09ccc'
    }
};

const TERMINAL_THEMES = {
    'github-dark': {
        background: '#0d1117', foreground: '#c9d1d9', cursor: '#c9d1d9',
        selectionBackground: '#264f78',
        black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
        blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
        brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
        brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd', brightWhite: '#f0f6fc'
    },
    'atom-one-dark': {
        background: '#282c34', foreground: '#abb2bf', cursor: '#528bff',
        selectionBackground: '#3e4451',
        black: '#5c6370', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
        blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
        brightBlack: '#4b5263', brightRed: '#be5046', brightGreen: '#98c379',
        brightYellow: '#d19a66', brightBlue: '#61afef', brightMagenta: '#c678dd',
        brightCyan: '#56b6c2', brightWhite: '#ffffff'
    },
    nord: {
        background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9',
        selectionBackground: '#434c5e',
        black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
        blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
        brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
        brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
        brightCyan: '#8fbcbb', brightWhite: '#eceff4'
    },
    dracula: {
        background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
        selectionBackground: '#44475a',
        black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
        blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
        brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
        brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
        brightCyan: '#a4ffff', brightWhite: '#ffffff'
    },
    'solarized-dark': {
        background: '#002b36', foreground: '#839496', cursor: '#839496',
        selectionBackground: '#073642',
        black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
        blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
        brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75',
        brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1', brightWhite: '#fdf6e3'
    },
    monokai: {
        background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f2',
        selectionBackground: '#49483e',
        black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
        blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
        brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e',
        brightYellow: '#f4bf75', brightBlue: '#66d9ef', brightMagenta: '#ae81ff',
        brightCyan: '#a1efe4', brightWhite: '#f9f8f5'
    },
    'warp-hero-dark': {
        background: '#18211d', foreground: '#ffffff', cursor: '#33895c',
        selectionBackground: '#2a4a3a',
        black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
        blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be',
        brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b',
        brightYellow: '#df8e1d', brightBlue: '#1e66f5', brightMagenta: '#ea76cb',
        brightCyan: '#179299', brightWhite: '#bcc0cc'
    },
    'warp-dark': {
        background: '#20262c', foreground: '#f1fcf9', cursor: '#00c2ff',
        selectionBackground: '#344050',
        black: '#20262c', red: '#db86ba', green: '#74dd91', yellow: '#e49186',
        blue: '#75dbe1', magenta: '#b4a1db', cyan: '#9ee9ea', white: '#f1fcf9',
        brightBlack: '#465463', brightRed: '#d04e9d', brightGreen: '#4bc66d',
        brightYellow: '#db695b', brightBlue: '#3dbac2', brightMagenta: '#825ece',
        brightCyan: '#62cdcd', brightWhite: '#e0e5e5'
    },
    'catppuccin-mocha': {
        background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc',
        selectionBackground: '#45475a',
        black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
        blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
        brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5', brightWhite: '#a6adc8'
    },
    railway: {
        background: '#13111c', foreground: '#e0def4', cursor: '#c4a7e7',
        selectionBackground: '#393552',
        black: '#1c1a27', red: '#eb6f92', green: '#64d8a0', yellow: '#f6c177',
        blue: '#82b1ff', magenta: '#c4a7e7', cyan: '#9ccfd8', white: '#e0def4',
        brightBlack: '#6e6a86', brightRed: '#eb6f92', brightGreen: '#64d8a0',
        brightYellow: '#f6c177', brightBlue: '#82b1ff', brightMagenta: '#c4a7e7',
        brightCyan: '#9ccfd8', brightWhite: '#ffffff'
    },
    replit: {
        background: '#0e1525', foreground: '#f5f9fc', cursor: '#0cd68a',
        selectionBackground: '#2b3553',
        black: '#1c2439', red: '#ef4444', green: '#0cd68a', yellow: '#eab308',
        blue: '#3b82f6', magenta: '#8b5cf6', cyan: '#06b6d4', white: '#f5f9fc',
        brightBlack: '#576d8a', brightRed: '#f87171', brightGreen: '#34d399',
        brightYellow: '#fbbf24', brightBlue: '#60a5fa', brightMagenta: '#a78bfa',
        brightCyan: '#22d3ee', brightWhite: '#ffffff'
    },
    raycast: {
        background: '#0a0a0b', foreground: '#ededef', cursor: '#ff453a',
        selectionBackground: '#2a2a2e',
        black: '#1a1a1d', red: '#ff453a', green: '#30d158', yellow: '#ffd60a',
        blue: '#5e5ce6', magenta: '#bf5af2', cyan: '#64d2ff', white: '#ededef',
        brightBlack: '#56565b', brightRed: '#ff6961', brightGreen: '#4ae08c',
        brightYellow: '#ffe040', brightBlue: '#7d7aff', brightMagenta: '#da8fff',
        brightCyan: '#86e3ff', brightWhite: '#ffffff'
    },
    unify: {
        background: '#171615', foreground: '#e8e4df', cursor: '#7ecfb3',
        selectionBackground: '#3a3835',
        black: '#262422', red: '#cf6f6f', green: '#7ecfb3', yellow: '#c9b87a',
        blue: '#7baed4', magenta: '#a09ccc', cyan: '#7ecfb3', white: '#e8e4df',
        brightBlack: '#635e58', brightRed: '#d99090', brightGreen: '#a3dece',
        brightYellow: '#d9cc9a', brightBlue: '#9cc4e0', brightMagenta: '#b8b5dd',
        brightCyan: '#a3dece', brightWhite: '#f5f2ed'
    }
};

// ---------------------------------------------------------------------------
// WebSocket Manager
// ---------------------------------------------------------------------------

class WSManager {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.handlers = {};
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this._reconnectTimer = null;
        this._intentionalClose = false;
    }

    connect() {
        this._intentionalClose = false;
        try {
            this.ws = new WebSocket(this.url);
        } catch (e) {
            console.error('WebSocket creation failed:', e);
            this._scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectDelay = 1000;
            this._dispatch('_ws_open', {});
            this._startKeepalive();
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type && msg.payload !== undefined) {
                    this._dispatch(msg.type, msg.payload);
                }
            } catch (e) {
                console.error('WebSocket message parse error:', e);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket closed');
            this._stopKeepalive();
            this._dispatch('_ws_close', {});
            if (!this._intentionalClose) {
                this._scheduleReconnect();
            }
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket error:', err);
        };
    }

    send(type, payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }

    on(type, handler) {
        if (!this.handlers[type]) {
            this.handlers[type] = [];
        }
        this.handlers[type].push(handler);
    }

    off(type, handler) {
        if (this.handlers[type]) {
            this.handlers[type] = this.handlers[type].filter(h => h !== handler);
        }
    }

    disconnect() {
        this._intentionalClose = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    _dispatch(type, payload) {
        const fns = this.handlers[type];
        if (fns) {
            for (const fn of fns) {
                try { fn(payload); } catch (e) { console.error('Handler error:', e); }
            }
        }
    }

    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        console.log('Reconnecting in ' + this.reconnectDelay + 'ms...');
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
            this.connect();
        }, this.reconnectDelay);
    }

    _startKeepalive() {
        this._stopKeepalive();
        // Use a Web Worker so keepalives survive browser tab throttling.
        // Browsers throttle setInterval to ≥1 min in background tabs, which
        // would cause the server's 90 s read-deadline to expire.
        try {
            const blob = new Blob([
                'var iv;',
                'onmessage=function(e){',
                '  if(e.data==="start"){clearInterval(iv);iv=setInterval(function(){postMessage("ping")},25000);}',
                '  if(e.data==="stop"){clearInterval(iv);}',
                '};'
            ], { type: 'application/javascript' });
            this._keepaliveWorker = new Worker(URL.createObjectURL(blob));
            this._keepaliveWorker.onmessage = () => {
                this.send('keepalive', {});
            };
            this._keepaliveWorker.postMessage('start');
        } catch (_) {
            // Fallback for environments without Worker support.
            this._keepaliveTimer = setInterval(() => {
                this.send('keepalive', {});
            }, 25000);
        }
    }

    _stopKeepalive() {
        if (this._keepaliveWorker) {
            this._keepaliveWorker.postMessage('stop');
            this._keepaliveWorker.terminate();
            this._keepaliveWorker = null;
        }
        if (this._keepaliveTimer) {
            clearInterval(this._keepaliveTimer);
            this._keepaliveTimer = null;
        }
    }
}

// ---------------------------------------------------------------------------
// Terminal Manager
// ---------------------------------------------------------------------------

class GhostText {
    constructor(term, containerEl) {
        this._term = term;
        this._el = document.createElement('span');
        this._el.className = 'ghost-text-overlay';
        this._el.style.display = 'none';
        const screen = containerEl.querySelector('.xterm-screen');
        if (screen) {
            screen.style.position = 'relative';
            screen.appendChild(this._el);
        }
        this._suggestion = '';
        this._wordIndex = 0;
        this._visible = false;
        this.currentLine = '';
        term.onCursorMove(() => this._reposition());
    }

    _getCellDims() {
        try {
            const core = this._term._core;
            return core._renderService.dimensions.css.cell;
        } catch (e) { return { width: 8, height: 17 }; }
    }

    _reposition() {
        if (!this._visible) return;
        var dims = this._getCellDims();
        var buf = this._term.buffer.active;
        this._el.style.left = (buf.cursorX * dims.width) + 'px';
        this._el.style.top = (buf.cursorY * dims.height) + 'px';
        this._el.style.lineHeight = dims.height + 'px';
        var opts = this._term.options;
        this._el.style.fontSize = (opts.fontSize || 14) + 'px';
        this._el.style.fontFamily = opts.fontFamily || "'JetBrains Mono', monospace";
    }

    show(fullSuggestion, currentLine) {
        if (!fullSuggestion || !currentLine) { this.hide(); return; }
        var lower = fullSuggestion.toLowerCase();
        var lowerLine = currentLine.toLowerCase();
        if (!lower.startsWith(lowerLine)) { this.hide(); return; }
        this._suggestion = fullSuggestion.substring(currentLine.length);
        if (!this._suggestion) { this.hide(); return; }
        this._wordIndex = 0;
        this._el.textContent = this._suggestion;
        this._el.style.display = '';
        this._visible = true;
        this._reposition();
    }

    hide() {
        this._el.textContent = '';
        this._el.style.display = 'none';
        this._suggestion = '';
        this._visible = false;
        this._wordIndex = 0;
    }

    isVisible() { return this._visible; }

    acceptFull() {
        var text = this._suggestion;
        this.hide();
        return text;
    }

    acceptWord() {
        if (!this._suggestion) return '';
        var parts = this._suggestion.match(/^\S+\s?/);
        if (!parts) return this.acceptFull();
        var word = parts[0];
        this._suggestion = this._suggestion.substring(word.length);
        if (!this._suggestion) {
            this.hide();
        } else {
            this._el.textContent = this._suggestion;
        }
        return word;
    }
}

class TerminalManager {
    constructor(wsManager) {
        this.terminals = new Map(); // sessionID -> {term, fitAddon, searchAddon, instanceID, instanceName}
        this.wsManager = wsManager;
        this.inputSyncEnabled = false;
    }

    createTerminal(sessionID, instanceID, instanceName, containerEl, termThemeName) {
        if (this.terminals.has(sessionID)) return;

        const themeObj = TERMINAL_THEMES[termThemeName] || TERMINAL_THEMES['github-dark'];

        const term = new Terminal({
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: this._currentFontSize(),
            theme: themeObj,
            cursorBlink: true,
            cursorStyle: 'block',
            allowProposedApi: true,
            scrollback: 10000,
            convertEol: true
        });

        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        if (typeof WebLinksAddon !== 'undefined') {
            term.loadAddon(new WebLinksAddon.WebLinksAddon());
        }

        let searchAddon = null;
        if (typeof SearchAddon !== 'undefined') {
            searchAddon = new SearchAddon.SearchAddon();
            term.loadAddon(searchAddon);
        }

        term.onResize(({ cols, rows }) => {
            this.wsManager.send('terminal_resize', {
                session_id: sessionID,
                rows: rows,
                cols: cols
            });
        });

        term.open(containerEl);

        var ghostText = new GhostText(term, containerEl);
        var suggestEnabled = true;
        var currentLineBuffer = '';
        var suggestDebounce = null;

        var origOnData = term.onData;
        term.onData((data) => {
            if (data === '\r' || data === '\n') {
                currentLineBuffer = '';
                ghostText.currentLine = '';
                ghostText.hide();
            } else if (data === '\x7f' || data === '\x08') {
                currentLineBuffer = currentLineBuffer.slice(0, -1);
                ghostText.currentLine = currentLineBuffer;
            } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
                currentLineBuffer += data;
                ghostText.currentLine = currentLineBuffer;
            } else if (data.length > 200) {
                currentLineBuffer = '';
                ghostText.currentLine = '';
                ghostText.hide();
            }

            ghostText.hide();

            if (suggestEnabled && currentLineBuffer.length >= 2 && data.length <= 200) {
                clearTimeout(suggestDebounce);
                suggestDebounce = setTimeout(() => {
                    this.wsManager.send('suggest_request', {
                        session_id: sessionID,
                        line: currentLineBuffer,
                        env: ''
                    });
                }, 150);
            }

            if (this.inputSyncEnabled) {
                for (const [sid] of this.terminals) {
                    this.wsManager.send('terminal_input', { session_id: sid, input: data });
                }
            } else {
                this.wsManager.send('terminal_input', { session_id: sessionID, input: data });
            }
        });

        term.attachCustomKeyEventHandler((e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') return false;
            if (e.type !== 'keydown') return true;

            if (e.key === 'Tab' && ghostText.isVisible()) {
                e.preventDefault();
                var accepted = ghostText.acceptFull();
                if (accepted) {
                    currentLineBuffer += accepted;
                    this.wsManager.send('terminal_input', { session_id: sessionID, input: accepted });
                }
                return false;
            }

            if (e.key === 'ArrowRight' && ghostText.isVisible()) {
                var buf = term.buffer.active;
                var line = buf.getLine(buf.cursorY);
                var atEnd = !line || !line.getCell(buf.cursorX) || line.getCell(buf.cursorX).getChars() === '';
                if (atEnd) {
                    e.preventDefault();
                    var word = ghostText.acceptWord();
                    if (word) {
                        currentLineBuffer += word;
                        this.wsManager.send('terminal_input', { session_id: sessionID, input: word });
                    }
                    return false;
                }
            }

            if (e.key === 'Escape' && ghostText.isVisible()) {
                ghostText.hide();
                return true;
            }

            return true;
        });
        requestAnimationFrame(() => {
            try { fitAddon.fit(); } catch (e) { /* container not yet visible */ }
        });

        this.terminals.set(sessionID, { term, fitAddon, searchAddon, instanceID, instanceName, recording: false, ghostText, suggestEnabled: true, setSuggestEnabled: function(v) { suggestEnabled = v; if (!v) ghostText.hide(); } });

        // Tell the backend to start the SSM session. The instance lookup provides
        // aws_profile and aws_region, but we may not have those on the client at
        // this point. The backend will pull them from the cached instance data
        // when only instance_id is supplied.
        this.wsManager.send('start_session', {
            instance_id: instanceID,
            session_id: sessionID,
            instance_name: instanceName
        });
    }

    handleOutput(sessionID, data) {
        const entry = this.terminals.get(sessionID);
        if (entry) {
            entry.term.write(data);
        }
    }

    closeTerminal(sessionID) {
        const entry = this.terminals.get(sessionID);
        if (!entry) return;
        this.wsManager.send('close_session', { session_id: sessionID });
        entry.term.dispose();
        this.terminals.delete(sessionID);
    }

    fitTerminal(sessionID) {
        const entry = this.terminals.get(sessionID);
        if (entry) {
            try { entry.fitAddon.fit(); } catch (e) { /* ignore */ }
        }
    }

    resizeAll() {
        for (const [, entry] of this.terminals) {
            try { entry.fitAddon.fit(); } catch (e) { /* ignore */ }
        }
    }

    focusTerminal(sessionID) {
        const entry = this.terminals.get(sessionID);
        if (entry) {
            entry.term.focus();
        }
    }

    applyTheme(themeName) {
        const themeObj = TERMINAL_THEMES[themeName];
        if (!themeObj) return;
        for (const [, entry] of this.terminals) {
            entry.term.options.theme = themeObj;
        }
    }

    applyFontSize(px) {
        for (const [, entry] of this.terminals) {
            entry.term.options.fontSize = px;
            try { entry.fitAddon.fit(); } catch (e) { /* ignore */ }
        }
    }

    getTerminalSize(sessionID) {
        const entry = this.terminals.get(sessionID);
        if (entry) {
            return { cols: entry.term.cols, rows: entry.term.rows };
        }
        return null;
    }

    _currentFontSize() {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--term-font-size');
        return parseFloat(raw) || 12.5;
    }
}

// ---------------------------------------------------------------------------
// Tab Manager
// ---------------------------------------------------------------------------

class TabManager {
    constructor() {
        this.tabs = new Map(); // tabID -> { type, name, instanceID, sessionID, element, panel }
        this.activeTab = null;
        this.tabBar = document.getElementById('tabBar');
        this.panels = document.getElementById('panels');
    }

    openTab(id, name, type) {
        // If tab already exists, just switch to it (no duplicates).
        if (this.tabs.has(id)) {
            this.switchTab(id);
            return;
        }

        // Create tab element.
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.id = id;
        tab.dataset.name = name;
        tab.dataset.type = type;
        // Note: name is already escaped via _escapeHTML; other parts are static string constants.
        tab.innerHTML =
            '<span class="tab-type ' + type + '">' + type.toUpperCase() + '</span> ' +
            '<span class="tab-name">' + this._escapeHTML(name) + '</span>' +
            ' <span class="tab-close">\u2715</span>';

        tab.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-close')) return;
            this.switchTab(id);
        });
        tab.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(id);
        });

        // Insert before the "+" button.
        const addBtn = this.tabBar.querySelector('.tab-add');
        if (addBtn) {
            this.tabBar.insertBefore(tab, addBtn);
        } else {
            this.tabBar.appendChild(tab);
        }

        // Create panel.
        const panel = document.createElement('div');
        panel.id = 'panel-' + id;
        panel.className = 'panel ' + (type === 'rdp' ? 'rdp-panel' : 'ssh-panel');

        const escName = this._escapeHTML(name);

        if (type === 'ssh') {
            panel.innerHTML =
                '<div class="term-panel-wrapper">' +
                  '<div class="term-title-bar">' +
                    '<div class="term-title-left">' +
                      '<span class="term-title-dot ssh"></span>' +
                      '<span class="term-title-name">' + escName + '</span>' +
                      '<span class="term-title-badge">SSM Session</span>' +
                    '</div>' +
                    '<div class="term-title-right">' +
                      '<button class="term-action-btn suggest-toggle-btn active" title="Toggle AI suggestions"><span class="btn-icon">\uD83D\uDCA1</span> Suggest</button>' +
                      '<button class="term-action-btn details-btn" title="Instance details"><span class="btn-icon">\u2139</span> Details</button>' +
                      '<button class="term-action-btn export-btn" title="Export session log"><span class="btn-icon">\u2913</span> Export</button>' +
                      '<button class="term-action-btn record-btn" title="Toggle recording"><span class="btn-icon">\u25CF</span> Record</button>' +
                      '<button class="term-action-btn split-btn" title="Split terminal"><span class="btn-icon">\u229E</span> Split</button>' +
                      '<button class="term-action-btn fullscreen-btn" title="Fullscreen"><span class="btn-icon">\u26F6</span> Fullscreen</button>' +
                      '<button class="term-action-btn end-btn" title="End session"><span class="btn-icon">\u2715</span> End</button>' +
                    '</div>' +
                  '</div>' +
                  '<div class="terminal-container" style="flex:1;overflow:hidden;"></div>' +
                '</div>';
        } else {
            panel.innerHTML =
                '<div class="term-panel-wrapper">' +
                  '<div class="term-title-bar">' +
                    '<div class="term-title-left">' +
                      '<span class="term-title-dot rdp"></span>' +
                      '<span class="term-title-name">' + escName + '</span>' +
                      '<span class="term-title-badge">RDP Session</span>' +
                      '<span class="term-title-badge rdp-status" style="color:var(--dim);">Connecting...</span>' +
                    '</div>' +
                    '<div class="term-title-right">' +
                      '<button class="term-action-btn details-btn" title="Instance details"><span class="btn-icon">\u2139</span> Details</button>' +
                      '<select class="rdp-res-select" title="Resolution" style="padding:2px 6px;background:var(--s3);border:1px solid var(--b1);border-radius:5px;color:var(--muted);font-size:10px;cursor:pointer;font-family:\'Lato\',sans-serif;">' +
                        '<option value="auto">Auto</option><option value="1920x1080">1920×1080</option><option value="1280x720">1280×720</option><option value="1024x768">1024×768</option>' +
                      '</select>' +
                      '<button class="term-action-btn ctrlaltdel-btn" title="Send Ctrl+Alt+Del"><span class="btn-icon">\u2328</span> CtrlAltDel</button>' +
                      '<button class="term-action-btn fullscreen-btn" title="Fullscreen"><span class="btn-icon">\u26F6</span> Fullscreen</button>' +
                      '<button class="term-action-btn end-btn" title="End session"><span class="btn-icon">\u2715</span> End</button>' +
                    '</div>' +
                  '</div>' +
                  '<div class="rdp-viewport" style="flex:1;display:flex;align-items:center;justify-content:center;">' +
                    '<span style="color:var(--muted);font-size:13px;">Preparing RDP session...</span>' +
                  '</div>' +
                '</div>';
        }

        // Wire title bar action buttons.
        const suggestToggle = panel.querySelector('.suggest-toggle-btn');
        if (suggestToggle) {
            suggestToggle.addEventListener('click', () => { if (this.onSuggestToggle) this.onSuggestToggle(id, suggestToggle); });
        }
        const detailsBtn = panel.querySelector('.details-btn');
        if (detailsBtn) {
            detailsBtn.addEventListener('click', () => { if (this.onDetails) this.onDetails(id); });
        }
        const exportBtn = panel.querySelector('.export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => { if (this.onExport) this.onExport(id); });
        }
        const recBtn = panel.querySelector('.record-btn');
        if (recBtn) {
            recBtn.addEventListener('click', () => { if (this.onToggleRecording) this.onToggleRecording(id); });
        }
        const splitBtn = panel.querySelector('.split-btn');
        if (splitBtn) {
            splitBtn.addEventListener('click', () => { if (this.onSplit) this.onSplit(id); });
        }
        const fsBtn = panel.querySelector('.fullscreen-btn');
        if (fsBtn) {
            fsBtn.addEventListener('click', () => { if (this.onFullscreen) this.onFullscreen(id); });
        }
        const endBtn = panel.querySelector('.end-btn');
        if (endBtn) {
            endBtn.addEventListener('click', () => { this.closeTab(id); });
        }
        const cadBtn = panel.querySelector('.ctrlaltdel-btn');
        if (cadBtn) {
            cadBtn.addEventListener('click', () => { if (this.onCtrlAltDel) this.onCtrlAltDel(id); });
        }
        const resSelect = panel.querySelector('.rdp-res-select');
        if (resSelect) {
            resSelect.addEventListener('change', () => { if (this.onResChange) this.onResChange(id, resSelect.value); });
        }

        this.panels.appendChild(panel);

        this.tabs.set(id, {
            type,
            name,
            instanceID: id,
            sessionID: id,
            element: tab,
            panel
        });

        this.switchTab(id);
    }

    switchTab(id) {
        const info = this.tabs.get(id);
        if (!info) return;

        // Deactivate current.
        if (this.activeTab && this.tabs.has(this.activeTab)) {
            const prev = this.tabs.get(this.activeTab);
            prev.element.classList.remove('active-ssh', 'active-rdp', 'active-topo');
            prev.panel.classList.remove('visible');
        }

        // Hide welcome panel when tabs exist.
        const welcome = document.getElementById('welcomePanel');
        if (welcome) welcome.classList.add('hidden');

        // Activate new.
        const activeClass = info.type === 'rdp' ? 'active-rdp' : info.type === 'topo' ? 'active-topo' : 'active-ssh';
        info.element.classList.add(activeClass);
        info.panel.classList.add('visible');
        this.activeTab = id;

        // Update the statusbar.
        this._updateStatusbar(info);
    }

    closeTab(id) {
        const info = this.tabs.get(id);
        if (!info) return;

        info.element.remove();
        info.panel.remove();
        this.tabs.delete(id);

        // If we closed the active tab, switch to the last remaining tab.
        if (this.activeTab === id) {
            this.activeTab = null;
            const remaining = Array.from(this.tabs.keys());
            if (remaining.length > 0) {
                this.switchTab(remaining[remaining.length - 1]);
            } else {
                this._showEmptyState();
            }
        }

        return info;
    }

    _updateStatusbar(info) {
        const activeLabel = document.getElementById('activeLabel');
        if (activeLabel) {
            activeLabel.textContent = '\u25CF ' + info.name;
            activeLabel.style.color = info.type === 'rdp' ? 'var(--rdp)' : 'var(--ssh)';
        }

        // Update session counts.
        let sshCount = 0;
        let rdpCount = 0;
        for (const [, t] of this.tabs) {
            if (t.type === 'ssh') sshCount++;
            else if (t.type === 'rdp') rdpCount++;
        }
        const sshEl = document.getElementById('sshCount');
        const rdpEl = document.getElementById('rdpCount');
        if (sshEl) sshEl.textContent = sshCount;
        if (rdpEl) rdpEl.textContent = rdpCount;
    }

    _showEmptyState() {
        const activeLabel = document.getElementById('activeLabel');
        if (activeLabel) {
            activeLabel.textContent = 'No active session';
            activeLabel.style.color = 'var(--dim)';
        }
        // Show welcome panel when no tabs remain.
        const welcome = document.getElementById('welcomePanel');
        if (welcome) welcome.classList.remove('hidden');
    }

    _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// ---------------------------------------------------------------------------
// Sidebar Tree Renderer
// ---------------------------------------------------------------------------

class SidebarTree {
    constructor(container, onInstanceClick) {
        this.container = container;
        this.onInstanceClick = onInstanceClick;
        this._instanceData = {}; // instanceID -> EC2Instance
        this._allInstances = [];
    }

    render(data) {
        if (!data || !data.accounts) {
            this.container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--dim);font-size:11px;">No instances found.<br>Click "Scan Instances" to discover.</div>';
            return;
        }

        this._instanceData = {};
        this._allInstances = [];
        let html = '';

        for (const account of data.accounts) {
            const displayId = account.account_id || account.profile || 'Unknown';
            const aliasOrProfile = account.account_alias || account.profile || '';
            const badgeStyle = this._accountBadgeStyle(aliasOrProfile);

            html += '<div class="t-account" data-account="' + this._esc(displayId) + '">' +
                '<span>\u2B21</span>' +
                '<span class="acc-id">' + this._esc(displayId) + '</span>' +
                '<span class="acc-badge"' + badgeStyle + '>' + this._esc(aliasOrProfile) + '</span>' +
                '<span class="chev">\u25B6</span>' +
                '</div>';
            html += '<div class="t-children" style="display:none">';

            if (account.regions) {
                for (const region of account.regions) {
                    html += '<div class="t-region" data-profile="' + this._esc(account.profile) + '" data-region="' + this._esc(region.region) + '"><div class="rdot"></div>' +
                        this._esc(region.region) +
                        '<span class="region-refresh" title="Rescan this region">\u21BB</span>' +
                        '<span class="chev">\u25B6</span></div>';
                    html += '<div class="t-region-children" style="display:none">';

                    if (region.groups) {
                        for (const group of region.groups) {
                            const groupLabel = [group.tag1, group.tag2].filter(Boolean).join(' / ');
                            if (groupLabel) {
                                html += '<div class="t-group">' + this._esc(groupLabel) +
                                    '<span class="chev">\u25B6</span></div>';
                            }
                            html += '<div class="t-group-children" style="display:none">';

                            if (group.instances) {
                                for (const inst of group.instances) {
                                    this._instanceData[inst.instance_id] = inst;
                                    this._allInstances.push(inst);
                                    const connType = inst.platform === 'windows' ? 'rdp' : 'ssh';
                                    const stateClass = this._stateClass(inst.state);
                                    const osIcon = this._osIcon(inst.os || inst.platform);

                                    html += '<div class="t-inst" data-id="' + this._esc(inst.instance_id) + '"' +
                                        ' data-name="' + this._esc(inst.name) + '"' +
                                        ' data-type="' + connType + '">' +
                                        '<div class="sdot ' + stateClass + '"></div>' +
                                        '<span class="inst-info">' +
                                        '<span class="inst-name">' + this._esc(inst.name) + '</span>' +
                                        '<span class="inst-id">' + this._esc(inst.instance_id) + '</span>' +
                                        '</span>' +
                                        '<span class="os-ico">' + osIcon + '</span>' +
                                        '<span class="fav-star' + (this._favorites && this._favorites.isFavorite(inst.instance_id) ? ' active' : '') + '" data-fav-id="' + this._esc(inst.instance_id) + '">\u2605</span>' +
                                        '</div>';
                                }
                            }

                            html += '</div>'; // .t-group-children
                        }
                    }

                    html += '</div>'; // .t-region-children
                }
            }

            html += '</div>';
        }

        this.container.innerHTML = html;
        this._attachHandlers();
    }

    getInstance(instanceID) {
        return this._instanceData[instanceID] || null;
    }

    filter(query) {
        const q = (query || '').toLowerCase();

        // Reset: show everything and restore collapsed states.
        if (!q) {
            this.container.querySelectorAll('.t-inst').forEach(el => { el.style.display = ''; });
            this.container.querySelectorAll('.t-group').forEach(el => {
                el.style.display = '';
                const c = el.nextElementSibling;
                if (c && c.classList.contains('t-group-children')) {
                    c.style.display = el.classList.contains('open') ? '' : 'none';
                }
            });
            this.container.querySelectorAll('.t-region').forEach(el => {
                el.style.display = '';
                const c = el.nextElementSibling;
                if (c && c.classList.contains('t-region-children')) {
                    c.style.display = el.classList.contains('open') ? '' : 'none';
                }
            });
            this.container.querySelectorAll('.t-account').forEach(el => {
                el.style.display = '';
                const c = el.nextElementSibling;
                if (c && c.classList.contains('t-children')) {
                    c.style.display = el.classList.contains('open') ? '' : 'none';
                }
            });
            return;
        }

        // Hide non-matching instances.
        const terms = q.split(/\s+/).filter(t => t.length > 0);

        this.container.querySelectorAll('.t-inst').forEach(el => {
            const name = (el.querySelector('.inst-name')?.textContent || '').toLowerCase();
            const id = (el.querySelector('.inst-id')?.textContent || '').toLowerCase();
            const text = name + ' ' + id;
            const matches = terms.every(term => text.includes(term));
            el.style.display = matches ? '' : 'none';
        });

        // Hide group containers + labels with no matching instances.
        this.container.querySelectorAll('.t-group-children').forEach(c => {
            const has = Array.from(c.querySelectorAll('.t-inst')).some(i => i.style.display !== 'none');
            c.style.display = has ? '' : 'none';
            const label = c.previousElementSibling;
            if (label && label.classList.contains('t-group')) {
                label.style.display = has ? '' : 'none';
            }
        });

        // Hide region containers + labels with no matching instances.
        this.container.querySelectorAll('.t-region-children').forEach(c => {
            const has = Array.from(c.querySelectorAll('.t-inst')).some(i => i.style.display !== 'none');
            c.style.display = has ? '' : 'none';
            const label = c.previousElementSibling;
            if (label && label.classList.contains('t-region')) {
                label.style.display = has ? '' : 'none';
            }
        });

        // Hide account sections with no matching instances; auto-expand matches.
        this.container.querySelectorAll('.t-account').forEach(el => {
            const c = el.nextElementSibling;
            if (!c || !c.classList.contains('t-children')) return;
            const has = Array.from(c.querySelectorAll('.t-inst')).some(i => i.style.display !== 'none');
            el.style.display = has ? '' : 'none';
            c.style.display = has ? '' : 'none';
        });
    }

    updateActiveStates(activeTabMap) {
        // activeTabMap: Map of instanceID -> Set of types ('ssh', 'rdp')
        const instances = this.container.querySelectorAll('.t-inst');
        instances.forEach(el => {
            const id = el.dataset.id;
            el.classList.remove('active-ssh', 'active-rdp');
            const types = activeTabMap.get(id);
            if (types) {
                if (types.has('ssh')) el.classList.add('active-ssh');
                if (types.has('rdp')) el.classList.add('active-rdp');
            }
        });
    }

    _attachHandlers() {
        // Account expand/collapse.
        this.container.querySelectorAll('.t-account').forEach(el => {
            el.addEventListener('click', () => {
                el.classList.toggle('open');
                const children = el.nextElementSibling;
                if (children && children.classList.contains('t-children')) {
                    children.style.display = el.classList.contains('open') ? '' : 'none';
                }
            });
        });

        // Region expand/collapse.
        this.container.querySelectorAll('.t-region').forEach(el => {
            el.addEventListener('click', (e) => {
                // If the refresh icon was clicked, scan that region instead.
                if (e.target.classList.contains('region-refresh')) {
                    e.stopPropagation();
                    this._scanRegion(el);
                    return;
                }
                el.classList.toggle('open');
                const children = el.nextElementSibling;
                if (children && children.classList.contains('t-region-children')) {
                    children.style.display = el.classList.contains('open') ? '' : 'none';
                }
            });
        });

        // Group expand/collapse.
        this.container.querySelectorAll('.t-group').forEach(el => {
            el.addEventListener('click', () => {
                el.classList.toggle('open');
                const children = el.nextElementSibling;
                if (children && children.classList.contains('t-group-children')) {
                    children.style.display = el.classList.contains('open') ? '' : 'none';
                }
            });
        });

        // Instance click -> always open SSH session (RDP via context menu).
        this.container.querySelectorAll('.t-inst').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id;
                const name = el.dataset.name;
                if (this.onInstanceClick) {
                    this.onInstanceClick(id, name, 'ssh');
                }
            });

            // Right-click context menu.
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showContextMenu(e, el.dataset.id, el.dataset.name, el.dataset.type);
            });
        });

        // Favorite star click
        this.container.querySelectorAll('.fav-star').forEach(star => {
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = star.dataset.favId;
                if (this._favorites) {
                    this._favorites.toggle(id);
                    star.classList.toggle('active');
                    if (this._onFavoritesChanged) this._onFavoritesChanged();
                }
            });
        });
    }

    async _scanRegion(regionEl) {
        const profile = regionEl.dataset.profile;
        const region = regionEl.dataset.region;
        if (!profile || !region) return;

        const icon = regionEl.querySelector('.region-refresh');
        if (icon) icon.classList.add('spinning');

        try {
            const resp = await fetch('/scan-region?profile=' + encodeURIComponent(profile) + '&region=' + encodeURIComponent(region));
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            showToast(region + ': ' + (data.instances || 0) + ' instances', 3000);
            // Reload full instance list and fleet stats.
            if (this.onRefresh) this.onRefresh();
        } catch (e) {
            showToast('Region scan failed: ' + e.message, 5000);
        } finally {
            if (icon) icon.classList.remove('spinning');
        }
    }

    _showContextMenu(e, instanceID, instanceName, connType) {
        const menu = document.getElementById('ctxMenu');
        if (!menu) return;

        // Store target instance on the menu element for use by menu item handlers.
        menu.dataset.instanceId = instanceID;
        menu.dataset.instanceName = instanceName;
        menu.dataset.instanceType = connType;

        // Show RDP option only for Windows instances.
        const rdpItem = menu.querySelector('[data-action="rdp"]');
        if (rdpItem) {
            rdpItem.style.display = connType === 'rdp' ? '' : 'none';
        }

        // Show Express items only when S3 bucket is configured.
        const hasS3 = !!(JSON.parse(localStorage.getItem('cloudterm_settings') || '{}').s3_bucket);
        menu.querySelectorAll('[data-action="express-upload"],[data-action="express-download"]').forEach(el => {
            el.style.display = hasS3 ? '' : 'none';
        });

        positionContextMenu(menu, e.clientX, e.clientY);
    }

    _stateClass(state) {
        if (!state) return '';
        const s = state.toLowerCase();
        if (s === 'running') return 'run';
        if (s === 'stopped') return 'stop';
        return 'pend';
    }

    _osIcon(os) {
        if (!os) return OS_ICONS.linux;
        const o = os.toLowerCase();
        if (o === 'windows' || o.includes('windows')) return OS_ICONS.windows;
        if (o === 'rhel' || o.includes('rhel') || o.includes('red hat')) return OS_ICONS.rhel;
        return OS_ICONS.linux;
    }

    _accountBadgeStyle(alias) {
        if (!alias) return '';
        const palette = [
            { c: '#60a5fa', bg: 'rgba(96,165,250,.12)', b: 'rgba(96,165,250,.3)' },
            { c: '#a78bfa', bg: 'rgba(167,139,250,.12)', b: 'rgba(167,139,250,.3)' },
            { c: '#34d399', bg: 'rgba(52,211,153,.12)', b: 'rgba(52,211,153,.3)' },
            { c: '#f472b6', bg: 'rgba(244,114,182,.12)', b: 'rgba(244,114,182,.3)' },
            { c: '#fbbf24', bg: 'rgba(251,191,36,.12)', b: 'rgba(251,191,36,.3)' },
            { c: '#22d3ee', bg: 'rgba(34,211,238,.12)', b: 'rgba(34,211,238,.3)' },
            { c: '#fb923c', bg: 'rgba(251,146,60,.12)', b: 'rgba(251,146,60,.3)' },
            { c: '#a3e635', bg: 'rgba(163,230,53,.12)', b: 'rgba(163,230,53,.3)' },
        ];
        let h = 0;
        for (let i = 0; i < alias.length; i++) h = ((h << 5) - h + alias.charCodeAt(i)) | 0;
        const p = palette[Math.abs(h) % palette.length];
        return ' style="color:' + p.c + ';background:' + p.bg + ';border-color:' + p.b + '"';
    }

    _esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

// ---------------------------------------------------------------------------
// Favorites Manager
// ---------------------------------------------------------------------------

class FavoritesManager {
    constructor(onFavoriteClick) {
        this.favorites = this._load();
        this.onFavoriteClick = onFavoriteClick;
    }

    _load() {
        try {
            const raw = localStorage.getItem('cloudterm_favorites');
            return new Set(raw ? JSON.parse(raw) : []);
        } catch { return new Set(); }
    }

    _save() {
        localStorage.setItem('cloudterm_favorites', JSON.stringify([...this.favorites]));
        if (this.onSave) this.onSave();
    }

    toggle(instanceID) {
        if (this.favorites.has(instanceID)) {
            this.favorites.delete(instanceID);
        } else {
            this.favorites.add(instanceID);
        }
        this._save();
    }

    isFavorite(instanceID) {
        return this.favorites.has(instanceID);
    }

    render(container, instanceDataFn, contextMenuFn) {
        const ids = [...this.favorites];
        if (ids.length === 0) {
            container.style.display = 'none';
            return;
        }
        container.style.display = '';
        let html = '<div class="fav-header">\u2605 Favorites</div>';
        let anyRendered = false;
        for (const id of ids) {
            const inst = instanceDataFn(id);
            if (!inst) continue;
            anyRendered = true;
            const connType = inst.platform === 'windows' ? 'rdp' : 'ssh';
            const stateClass = inst.state === 'running' ? 'run' : inst.state === 'stopped' ? 'stop' : 'pend';
            html += '<div class="fav-row" data-id="' + id + '" data-name="' + (inst.name || '').replace(/"/g, '&quot;') + '" data-type="' + connType + '">' +
                '<div class="sdot ' + stateClass + '" style="width:6px;height:6px;"></div>' +
                '<span class="fav-row-name">' + (inst.name || id) + '</span>' +
                '<span class="fav-row-unstar" data-id="' + id + '" title="Remove from favorites">\u2715</span>' +
                '</div>';
        }
        if (!anyRendered) {
            container.style.display = 'none';
            return;
        }
        container.innerHTML = html;

        // Click to open session
        container.querySelectorAll('.fav-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.classList.contains('fav-row-unstar')) return;
                this.onFavoriteClick(row.dataset.id, row.dataset.name, 'ssh');
            });
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (contextMenuFn) contextMenuFn(e, row.dataset.id, row.dataset.name, row.dataset.type);
            });
        });

        // Unstar button
        container.querySelectorAll('.fav-row-unstar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle(btn.dataset.id);
                this.render(container, instanceDataFn, contextMenuFn);
            });
        });
    }
}

// ---------------------------------------------------------------------------
// Snippets Manager
// ---------------------------------------------------------------------------

class SnippetsManager {
    constructor() {
        this.snippets = this._load();
    }

    _defaultSnippets() {
        return [
            { id: 'd1', name: 'Disk Usage', command: 'df -h', description: 'Show disk space usage' },
            { id: 'd2', name: 'Memory Usage', command: 'free -m', description: 'Show memory in MB' },
            { id: 'd3', name: 'Top Processes', command: 'top -b -n1 | head -20', description: 'Snapshot of top processes' },
            { id: 'd4', name: 'System Uptime', command: 'uptime', description: 'System uptime and load' },
            { id: 'd5', name: 'Network Connections', command: 'ss -tunlp', description: 'Listening ports and connections' },
            { id: 'd6', name: 'Service Status', command: 'systemctl status', description: 'Overview of systemd services' }
        ];
    }

    _load() {
        try {
            const raw = localStorage.getItem('cloudterm_snippets');
            if (raw) return JSON.parse(raw);
        } catch {}
        const defaults = this._defaultSnippets();
        this._saveRaw(defaults);
        return defaults;
    }

    _save() { this._saveRaw(this.snippets); if (this.onSave) this.onSave(); }
    _saveRaw(data) { localStorage.setItem('cloudterm_snippets', JSON.stringify(data)); }

    getAll() { return this.snippets; }

    add(name, command, description) {
        this.snippets.push({ id: 'u' + Date.now(), name, command, description: description || '' });
        this._save();
    }

    update(id, name, command, description) {
        const s = this.snippets.find(s => s.id === id);
        if (s) { s.name = name; s.command = command; s.description = description || ''; this._save(); }
    }

    remove(id) {
        this.snippets = this.snippets.filter(s => s.id !== id);
        this._save();
    }

    exportJSON() { return JSON.stringify(this.snippets, null, 2); }

    importJSON(jsonStr) {
        const arr = JSON.parse(jsonStr);
        if (!Array.isArray(arr)) throw new Error('Expected array');
        this.snippets = arr.map(s => ({
            id: s.id || ('i' + Date.now() + Math.random()),
            name: s.name || 'Untitled',
            command: s.command || '',
            description: s.description || ''
        }));
        this._save();
    }
}

// ---------------------------------------------------------------------------
// Toast Notification
// ---------------------------------------------------------------------------

/** Position a context menu near the cursor, flipping up/left if it would overflow the viewport. */
function positionContextMenu(menu, clientX, clientY) {
    // Temporarily show off-screen to measure
    menu.style.left = '-9999px';
    menu.style.top = '-9999px';
    menu.classList.add('show');
    const rect = menu.getBoundingClientRect();
    menu.classList.remove('show');

    let x = clientX;
    let y = clientY;
    if (x + rect.width > window.innerWidth) x = Math.max(0, window.innerWidth - rect.width - 4);
    if (y + rect.height > window.innerHeight) y = Math.max(0, clientY - rect.height);

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.add('show');
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(function() { showToast('Copied: ' + text); })
            .catch(function() { fallbackCopy(text); });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('Copied: ' + text);
    } catch (e) {
        showToast('Copy failed — use Ctrl+C manually');
    }
    document.body.removeChild(ta);
}

function showToast(msg, duration) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('show'), duration || 3000);
}
showToast._timer = null;

// ---------------------------------------------------------------------------
// Draggable Panels
// ---------------------------------------------------------------------------

function makePanelDraggable(panel, header) {
    if (!panel || !header) return;
    let startX, startY, startLeft, startTop, dragging = false, moved = false;

    header.addEventListener('mousedown', (e) => {
        // Don't drag on buttons
        if (e.target.closest('button')) return;
        dragging = true;
        moved = false;
        const rect = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        panel.classList.add('dragged');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
        if (!moved) return;
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;
        // Clamp within viewport
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - 40));
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        panel.classList.remove('dragged');
    });

    // Suppress click (collapse toggle) if the user dragged
    header.addEventListener('click', (e) => {
        if (moved) { e.stopImmediatePropagation(); moved = false; }
    }, true); // capture phase to run before collapse handler
}

// ---------------------------------------------------------------------------
// RDP Credential Modal
// ---------------------------------------------------------------------------

function showRDPCredentialModal(instanceID, instanceName, defaults) {
    return new Promise((resolve, reject) => {
        const bg = document.getElementById('rdpCredModalBg');
        // Build modal on the fly if it doesn't exist yet.
        if (!bg) {
            const el = document.createElement('div');
            el.id = 'rdpCredModalBg';
            el.className = 'modal-bg';
            el.innerHTML =
                '<div class="modal">' +
                '<div class="modal-title">RDP Credentials</div>' +
                '<div style="margin-bottom:12px;font-size:11px;color:var(--muted);" id="rdpCredTarget"></div>' +
                '<div style="margin-bottom:10px;">' +
                '<input id="rdpUser" type="text" placeholder="Username (e.g. Administrator)" ' +
                'style="width:100%;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:\'JetBrains Mono\',monospace;font-size:11px;outline:none;box-sizing:border-box;">' +
                '</div>' +
                '<div style="margin-bottom:10px;position:relative;">' +
                '<input id="rdpPass" type="password" placeholder="Password" ' +
                'style="width:100%;padding:8px 10px;padding-right:34px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:\'JetBrains Mono\',monospace;font-size:11px;outline:none;box-sizing:border-box;">' +
                '<button id="rdpPassToggle" type="button" tabindex="-1" title="Show password" ' +
                'style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);cursor:pointer;padding:2px;font-size:14px;line-height:1;">&#x1F441;</button>' +
                '</div>' +
                '<div style="margin-bottom:14px;">' +
                '<select id="rdpSecurity" style="width:100%;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:\'JetBrains Mono\',monospace;font-size:11px;outline:none;box-sizing:border-box;">' +
                '<option value="any">Security: Auto (any)</option>' +
                '<option value="nla">Security: NLA</option>' +
                '<option value="tls">Security: TLS</option>' +
                '<option value="rdp">Security: RDP</option>' +
                '</select>' +
                '</div>' +
                '<label style="display:flex;align-items:center;gap:6px;margin-bottom:14px;cursor:pointer;font-size:11px;color:var(--muted);">' +
                '<input id="rdpRecordChk" type="checkbox" style="accent-color:var(--red);cursor:pointer;">' +
                '<span>\u25CF Record this session</span>' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;cursor:pointer;font-size:11px;color:var(--muted);">' +
                '<input id="rdpSaveVault" type="checkbox" style="accent-color:var(--ssh);cursor:pointer;">' +
                '<span>\uD83D\uDD12 Save to Vault</span>' +
                '</label>' +
                '<div id="rdpVaultOpts" style="display:none;margin-bottom:14px;padding:10px 12px;background:var(--s2);border:1px solid var(--b1);border-radius:7px;">' +
                '<div style="font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Match Rule</div>' +
                '<select id="rdpVaultType" style="width:100%;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:\'JetBrains Mono\',monospace;font-size:11px;outline:none;box-sizing:border-box;margin-bottom:8px;">' +
                '<option value="instance">This instance only</option>' +
                '<option value="substring">Name contains (substring)</option>' +
                '<option value="pattern">Name pattern (glob)</option>' +
                '<option value="environment">Environment</option>' +
                '<option value="account">Account</option>' +
                '<option value="global">All instances</option>' +
                '</select>' +
                '<input id="rdpVaultValue" type="text" placeholder="Pattern or value" style="width:100%;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:\'JetBrains Mono\',monospace;font-size:11px;outline:none;box-sizing:border-box;margin-bottom:8px;">' +
                '<input id="rdpVaultLabel" type="text" placeholder="Label (e.g. Dev Windows)" style="width:100%;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:\'JetBrains Mono\',monospace;font-size:11px;outline:none;box-sizing:border-box;">' +
                '</div>' +
                '<div style="display:flex;gap:8px;">' +
                '<button id="rdpCredConnect" style="flex:1;padding:8px;background:linear-gradient(135deg,rgba(96,165,250,.2),rgba(108,92,231,.15));border:1px solid rgba(96,165,250,.4);border-radius:7px;color:var(--rdp);font-family:\'JetBrains Mono\',monospace;font-size:11px;cursor:pointer;">Connect</button>' +
                '<button id="rdpCredCancel" class="modal-cancel" style="flex:1;">Cancel</button>' +
                '</div>' +
                '</div>';
            document.body.appendChild(el);
            document.getElementById('rdpPassToggle').addEventListener('click', () => {
                const inp = document.getElementById('rdpPass');
                const isHidden = inp.type === 'password';
                inp.type = isHidden ? 'text' : 'password';
                document.getElementById('rdpPassToggle').title = isHidden ? 'Hide password' : 'Show password';
            });
            document.getElementById('rdpSaveVault').addEventListener('change', (e) => {
                document.getElementById('rdpVaultOpts').style.display = e.target.checked ? '' : 'none';
            });
            document.getElementById('rdpVaultType').addEventListener('change', (e) => {
                const valInput = document.getElementById('rdpVaultValue');
                switch (e.target.value) {
                    case 'instance': valInput.value = instanceID; valInput.disabled = true; break;
                    case 'substring': valInput.value = ''; valInput.disabled = false; valInput.placeholder = 'Substring (e.g. windows, guacamole)'; break;
                    case 'pattern': valInput.value = '*' + instanceName.replace(/[^a-zA-Z-]/g, '') + '*'; valInput.disabled = false; valInput.placeholder = 'Glob pattern (e.g. *-windows-*)'; break;
                    case 'environment': valInput.value = ''; valInput.disabled = false; valInput.placeholder = 'Environment name'; break;
                    case 'account': valInput.value = ''; valInput.disabled = false; valInput.placeholder = 'Account ID'; break;
                    case 'global': valInput.value = '*'; valInput.disabled = true; break;
                }
            });
        }

        const modal = document.getElementById('rdpCredModalBg');
        document.getElementById('rdpCredTarget').textContent = instanceName + ' (' + instanceID + ')';
        document.getElementById('rdpUser').value = (defaults && defaults.username) || 'Administrator';
        document.getElementById('rdpPass').value = (defaults && defaults.password) || '';
        document.getElementById('rdpPass').type = 'password';
        if (defaults && defaults.security) document.getElementById('rdpSecurity').value = defaults.security;
        document.getElementById('rdpSaveVault').checked = false;
        document.getElementById('rdpVaultOpts').style.display = 'none';
        document.getElementById('rdpVaultType').value = 'instance';
        document.getElementById('rdpVaultValue').value = instanceID;
        document.getElementById('rdpVaultValue').disabled = true;
        document.getElementById('rdpVaultLabel').value = '';
        modal.classList.add('show');

        const cleanup = () => { modal.classList.remove('show'); };

        document.getElementById('rdpRecordChk').checked = (defaults && defaults.record) || false;
        document.getElementById('rdpCredConnect').onclick = () => {
            const user = document.getElementById('rdpUser').value.trim();
            const pass = document.getElementById('rdpPass').value;
            const record = document.getElementById('rdpRecordChk').checked;
            const security = document.getElementById('rdpSecurity').value;
            const saveVault = document.getElementById('rdpSaveVault').checked;
            var result = { username: user, password: pass, record: record, security: security };
            if (saveVault) {
                result._saveToVault = true;
                result._vaultRule = {
                    type: document.getElementById('rdpVaultType').value,
                    value: document.getElementById('rdpVaultValue').value,
                    label: document.getElementById('rdpVaultLabel').value || (user + ' @ ' + instanceName)
                };
            }
            cleanup();
            resolve(result);
        };

        document.getElementById('rdpCredCancel').onclick = () => {
            cleanup();
            reject(new Error('cancelled'));
        };

        modal.onclick = (e) => {
            if (e.target === modal) { cleanup(); reject(new Error('cancelled')); }
        };
    });
}

// ---------------------------------------------------------------------------
// Settings Manager – persistent app settings via localStorage
// ---------------------------------------------------------------------------

class SettingsManager {
    constructor() {
        this._key = 'cloudterm_settings';
    }

    get(name) {
        const data = this._load();
        return data[name] || '';
    }

    set(name, value) {
        const data = this._load();
        data[name] = value;
        localStorage.setItem(this._key, JSON.stringify(data));
    }

    _load() {
        try {
            return JSON.parse(localStorage.getItem(this._key) || '{}');
        } catch { return {}; }
    }
}

// ---------------------------------------------------------------------------
// Transfer Manager – bottom-right progress panel (Google Drive style)
// ---------------------------------------------------------------------------

class TransferManager {
    constructor() {
        this._transfers = new Map();
        this._nextID = 1;
        this._panel = document.getElementById('transferPanel');
        this._body = document.getElementById('transferBody');
        this._countEl = document.getElementById('transferCount');
        this._collapsed = false;

        document.getElementById('transferHeader')?.addEventListener('click', (e) => {
            if (e.target.closest('#transferCloseBtn')) return;
            this._collapsed = !this._collapsed;
            this._panel?.classList.toggle('collapsed', this._collapsed);
            const btn = document.getElementById('transferCollapseBtn');
            if (btn) btn.textContent = this._collapsed ? '\u25B4' : '\u2015';
        });

        document.getElementById('transferCloseBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearAll();
        });

        makePanelDraggable(this._panel, document.getElementById('transferHeader'));
    }

    add(type, name) {
        const id = this._nextID++;

        const row = document.createElement('div');
        row.className = 'transfer-row ' + type;
        row.dataset.transferId = id;

        const top = document.createElement('div');
        top.className = 'transfer-row-top';

        const icon = document.createElement('span');
        icon.className = 'transfer-row-icon';
        icon.textContent = type === 'upload' ? '\u2B06' : type === 'clone' ? '\uD83D\uDCCB' : '\u2B07';

        const nameEl = document.createElement('span');
        nameEl.className = 'transfer-row-name';
        nameEl.textContent = name;

        const pct = document.createElement('span');
        pct.className = 'transfer-row-pct';
        pct.textContent = '0%';

        const dismiss = document.createElement('button');
        dismiss.className = 'transfer-row-dismiss';
        dismiss.title = 'Dismiss';
        dismiss.textContent = '\u00D7';
        dismiss.addEventListener('click', () => this.remove(id));

        top.append(icon, nameEl, pct, dismiss);

        const barWrap = document.createElement('div');
        barWrap.className = 'transfer-row-bar';
        const barFill = document.createElement('div');
        barFill.className = 'transfer-row-bar-fill';
        barFill.style.width = '0%';
        barWrap.appendChild(barFill);

        const msg = document.createElement('div');
        msg.className = 'transfer-row-msg';
        msg.textContent = 'Starting...';

        row.append(top, barWrap, msg);
        this._body?.appendChild(row);
        this._transfers.set(id, { type, name, progress: 0, message: '', status: 'active', el: row });
        this._updateCount();
        this._show();
        return id;
    }

    update(id, progress, message, status) {
        const t = this._transfers.get(id);
        if (!t) return;
        t.progress = progress;
        t.message = message || '';
        t.status = status || 'active';

        const fill = t.el.querySelector('.transfer-row-bar-fill');
        const pct = t.el.querySelector('.transfer-row-pct');
        const msg = t.el.querySelector('.transfer-row-msg');

        if (fill) fill.style.width = progress + '%';
        if (pct) pct.textContent = progress + '%';
        if (msg) msg.textContent = message || '';

        if (status === 'complete') {
            t.el.classList.add('done');
            if (pct) pct.textContent = '\u2713';
            this._autoRemove(id, 5000);
        } else if (status === 'error') {
            t.el.classList.add('error');
            if (pct) pct.textContent = '\u2717';
        }
    }

    remove(id) {
        const t = this._transfers.get(id);
        if (!t) return;
        t.el.remove();
        this._transfers.delete(id);
        this._updateCount();
        if (this._transfers.size === 0) this._hide();
    }

    clearAll() {
        for (const [id, t] of this._transfers) {
            if (t.status === 'complete' || t.status === 'error') {
                t.el.remove();
                this._transfers.delete(id);
            }
        }
        this._updateCount();
        if (this._transfers.size === 0) this._hide();
    }

    _autoRemove(id, delay) { setTimeout(() => this.remove(id), delay); }
    _updateCount() {
        if (this._countEl) this._countEl.textContent = this._transfers.size;
        const titleEl = this._panel?.querySelector('.transfer-header-title');
        if (titleEl) {
            const types = new Set([...this._transfers.values()].map(t => t.type));
            if (types.size === 0) titleEl.textContent = 'Transfers';
            else if (types.size === 1) {
                const t = [...types][0];
                titleEl.textContent = t === 'clone' ? 'Cloning' : t === 'upload' ? 'Uploads' : 'Downloads';
            } else titleEl.textContent = 'Transfers';
        }
    }
    _show() { this._panel?.classList.add('visible'); }
    _hide() { this._panel?.classList.remove('visible'); }
}

// ---------------------------------------------------------------------------
// Clone Manager — clone EC2 instances via AMI → launch flow
// ---------------------------------------------------------------------------

class CloneManager {
    constructor(transfers) {
        this._transfers = transfers;
        this._activeClones = new Map(); // cloneID -> { transferID, pollInterval }
    }

    startClone(instanceID, instanceName) {
        const modal = document.getElementById('cloneNameModal');
        const info = document.getElementById('cloneSourceInfo');
        const input = document.getElementById('cloneNameInput');
        const btn = document.getElementById('cloneStartBtn');

        if (info) info.textContent = 'Source: ' + instanceName + ' (' + instanceID + ')';
        if (input) input.value = instanceName + '-clone';

        // Clone button to remove old listeners
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async () => {
            const cloneName = input.value.trim();
            if (!cloneName) { input.focus(); return; }

            modal.classList.remove('show');

            try {
                const resp = await fetch('/clone/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instance_id: instanceID, clone_name: cloneName })
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    showToast('Clone failed: ' + (err.error || resp.statusText), 5000);
                    return;
                }
                const data = await resp.json();
                const cloneID = data.id;

                // Add to transfer panel
                const transferID = this._transfers.add('clone', 'Clone: ' + cloneName);
                this._transfers.update(transferID, 10, 'Creating AMI (no reboot)...', 'active');

                this._startPolling(cloneID, transferID, cloneName);
            } catch (e) {
                showToast('Clone error: ' + e.message, 5000);
            }
        });

        modal.classList.add('show');
        if (input) { input.select(); input.focus(); }
    }

    _startPolling(cloneID, transferID, cloneName) {
        const interval = setInterval(async () => {
            try {
                const resp = await fetch('/clone/status/' + cloneID);
                if (!resp.ok) {
                    this._transfers.update(transferID, 0, 'Status check failed', 'error');
                    clearInterval(interval);
                    this._activeClones.delete(cloneID);
                    return;
                }
                const status = await resp.json();

                if (status.phase === 'error') {
                    this._transfers.update(transferID, 100, status.message, 'error');
                    clearInterval(interval);
                    this._activeClones.delete(cloneID);
                } else if (status.phase === 'ami_ready') {
                    this._transfers.update(transferID, 90, 'AMI ready — configuring launch...', 'active');
                    clearInterval(interval);
                    this._activeClones.delete(cloneID);
                    this._showSettingsModal(cloneID, cloneName, transferID);
                } else if (status.phase === 'complete') {
                    this._transfers.update(transferID, 100, status.message, 'complete');
                    clearInterval(interval);
                    this._activeClones.delete(cloneID);
                } else {
                    this._transfers.update(transferID, status.progress, status.message, 'active');
                }
            } catch (e) {
                // Network error — keep polling
            }
        }, 15000);

        this._activeClones.set(cloneID, { transferID, pollInterval: interval });
    }

    async _showSettingsModal(cloneID, cloneName, transferID) {
        try {
            const resp = await fetch('/clone/settings/' + cloneID);
            if (!resp.ok) {
                showToast('Failed to load clone settings', 5000);
                return;
            }
            const s = await resp.json();

            const modal = document.getElementById('cloneSettingsModal');
            const info = document.getElementById('cloneSettingsInfo');
            const form = document.getElementById('cloneSettingsForm');

            if (info) info.textContent = 'Configure launch settings for: ' + cloneName;

            const esc = t => (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            const inputStyle = 'width:100%;box-sizing:border-box;padding:6px 8px;background:var(--s3);border:1px solid var(--b1);border-radius:6px;color:var(--text);font-family:"JetBrains Mono",monospace;font-size:11px;outline:none;';
            const labelStyle = 'font-size:11px;color:var(--dim);white-space:nowrap;';

            let html = '';
            // Instance Type
            html += '<div style="display:grid;grid-template-columns:110px 1fr;align-items:center;gap:8px;">';
            html += '<label style="' + labelStyle + '">Instance Type</label>';
            html += '<input id="cloneInstanceType" type="text" value="' + esc(s.instance_type) + '" style="' + inputStyle + '">';
            html += '</div>';

            // Subnet
            html += '<div style="display:grid;grid-template-columns:110px 1fr;align-items:center;gap:8px;">';
            html += '<label style="' + labelStyle + '">Subnet</label>';
            html += '<select id="cloneSubnet" style="' + inputStyle + '">';
            for (const sub of (s.available_subnets || [])) {
                const sel = sub.subnet_id === s.subnet_id ? ' selected' : '';
                const label = (sub.name || sub.subnet_id) + ' (' + sub.az + ', ' + sub.cidr + ')';
                html += '<option value="' + esc(sub.subnet_id) + '"' + sel + '>' + esc(label) + '</option>';
            }
            html += '</select></div>';

            // Security Groups
            html += '<div style="display:grid;grid-template-columns:110px 1fr;align-items:start;gap:8px;">';
            html += '<label style="' + labelStyle + ';padding-top:4px;">Security Groups</label>';
            html += '<div id="cloneSGs" style="max-height:100px;overflow-y:auto;border:1px solid var(--b1);border-radius:6px;padding:4px 6px;background:var(--s3);">';
            for (const sg of (s.available_sgs || [])) {
                const chk = (s.security_group_ids || []).includes(sg.group_id) ? ' checked' : '';
                html += '<label style="display:block;font-size:11px;color:var(--text);cursor:pointer;"><input type="checkbox" value="' + esc(sg.group_id) + '"' + chk + ' style="margin-right:4px;"> ' + esc(sg.group_name) + ' (' + esc(sg.group_id) + ')</label>';
            }
            html += '</div></div>';

            // Key Pair
            html += '<div style="display:grid;grid-template-columns:110px 1fr;align-items:center;gap:8px;">';
            html += '<label style="' + labelStyle + '">Key Pair</label>';
            html += '<input id="cloneKeyPair" type="text" value="' + esc(s.key_name) + '" style="' + inputStyle + '">';
            html += '</div>';

            // IAM Profile
            html += '<div style="display:grid;grid-template-columns:110px 1fr;align-items:center;gap:8px;">';
            html += '<label style="' + labelStyle + '">IAM Profile</label>';
            html += '<input id="cloneIAMProfile" type="text" value="' + esc(s.iam_profile) + '" style="' + inputStyle + '">';
            html += '</div>';

            // Name Tag
            html += '<div style="display:grid;grid-template-columns:110px 1fr;align-items:center;gap:8px;">';
            html += '<label style="' + labelStyle + '">Name Tag</label>';
            html += '<input id="cloneNameTag" type="text" value="' + esc(s.tags && s.tags['Name'] || '') + '" style="' + inputStyle + '">';
            html += '</div>';

            form.innerHTML = html;

            // Wire launch button
            const btn = document.getElementById('cloneLaunchBtn');
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', () => this._launchClone(cloneID, s, transferID));

            modal.classList.add('show');
        } catch (e) {
            showToast('Clone settings error: ' + e.message, 5000);
        }
    }

    async _launchClone(cloneID, originalSettings, transferID) {
        const modal = document.getElementById('cloneSettingsModal');

        // Gather form values
        const instanceType = document.getElementById('cloneInstanceType')?.value || originalSettings.instance_type;
        const subnetID = document.getElementById('cloneSubnet')?.value || originalSettings.subnet_id;
        const keyName = document.getElementById('cloneKeyPair')?.value || '';
        const iamProfile = document.getElementById('cloneIAMProfile')?.value || '';
        const nameTag = document.getElementById('cloneNameTag')?.value || '';

        // Gather checked SGs
        const sgCheckboxes = document.querySelectorAll('#cloneSGs input[type="checkbox"]:checked');
        const securityGroupIDs = Array.from(sgCheckboxes).map(cb => cb.value);

        // Build tags — copy original, override Name
        const tags = Object.assign({}, originalSettings.tags || {});
        if (nameTag) tags['Name'] = nameTag;

        const settings = {
            ami_id: originalSettings.ami_id,
            instance_type: instanceType,
            subnet_id: subnetID,
            security_group_ids: securityGroupIDs,
            key_name: keyName,
            iam_profile: iamProfile,
            tags: tags
        };

        modal.classList.remove('show');
        this._transfers.update(transferID, 95, 'Launching instance...', 'active');

        try {
            const resp = await fetch('/clone/launch/' + cloneID, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (!resp.ok) {
                const err = await resp.json();
                this._transfers.update(transferID, 100, 'Launch failed: ' + (err.error || resp.statusText), 'error');
                showToast('Clone launch failed: ' + (err.error || resp.statusText), 5000);
                return;
            }
            const data = await resp.json();
            this._transfers.update(transferID, 100, 'Launched: ' + data.instance_id, 'complete');
            showToast('Instance cloned: ' + data.instance_id, 5000);
        } catch (e) {
            this._transfers.update(transferID, 100, 'Error: ' + e.message, 'error');
            showToast('Clone launch error: ' + e.message, 5000);
        }
    }
}

// ---------------------------------------------------------------------------
// Split Manager — panes live INSIDE a tab's panel (tmux-style, no new tabs)
// ---------------------------------------------------------------------------

class SplitManager {
    constructor() {
        // tabID -> { container, panes: [{sessionID, pane, termContainer}] }
        this._splits = new Map();
    }

    /**
     * Split a tab's panel into two panes.
     * Returns the DOM element for the new pane's content (picker or terminal).
     */
    split(tabID, direction, newSessionID, panel, hostInstanceName) {
        if (this._splits.has(tabID)) return null; // already split — only 2 panes for now
        const wrapper = panel.querySelector('.term-panel-wrapper');
        const existingTC = panel.querySelector('.terminal-container');
        if (!existingTC) return null;

        const container = document.createElement('div');
        container.className = 'split-container ' + (direction === 'horizontal' ? 'split-horizontal' : 'split-vertical');

        const pane1 = document.createElement('div');
        pane1.className = 'split-pane';
        pane1.style.flex = '1';

        const handle = document.createElement('div');
        handle.className = 'split-handle';

        const pane2 = document.createElement('div');
        pane2.className = 'split-pane';
        pane2.style.flex = '1';

        pane1.appendChild(this._createPaneHeader(hostInstanceName || 'Terminal'));
        pane1.appendChild(existingTC);

        container.append(pane1, handle, pane2);

        if (wrapper) {
            const titleBar = wrapper.querySelector('.term-title-bar');
            wrapper.innerHTML = '';
            if (titleBar) wrapper.appendChild(titleBar);
            wrapper.appendChild(container);
        } else {
            panel.innerHTML = '';
            panel.appendChild(container);
        }

        this._splits.set(tabID, {
            container, panel,
            panes: [
                { sessionID: tabID, pane: pane1, termContainer: existingTC },
                { sessionID: newSessionID, pane: pane2, termContainer: null }
            ]
        });

        this._attachDragHandler(handle, pane1, pane2, direction);
        return pane2;
    }

    _createPaneHeader(title, onClose) {
        const header = document.createElement('div');
        header.className = 'split-pane-header';
        header.innerHTML = '<span class="split-pane-title">' + title + '</span>';
        if (onClose) {
            const btn = document.createElement('button');
            btn.className = 'split-pane-close';
            btn.innerHTML = '&#x2715;';
            btn.addEventListener('click', onClose);
            header.appendChild(btn);
        }
        return header;
    }

    /** Set the terminal container for a pane (called after picker selects instance). */
    setPaneTermContainer(tabID, sessionID, termContainer) {
        const info = this._splits.get(tabID);
        if (!info) return;
        const pane = info.panes.find(p => p.sessionID === sessionID);
        if (pane) pane.termContainer = termContainer;
    }

    /** Get extra (non-primary) session IDs for a tab. */
    getExtraSessionIDs(tabID) {
        const info = this._splits.get(tabID);
        if (!info) return [];
        return info.panes.filter(p => p.sessionID !== tabID && p.termContainer).map(p => p.sessionID);
    }

    /** Get ALL session IDs for a tab (primary + split panes). */
    getAllSessionIDs(tabID) {
        const info = this._splits.get(tabID);
        if (!info) return [tabID];
        return info.panes.filter(p => p.termContainer).map(p => p.sessionID);
    }

    /** Check if this tab has a split. */
    hasSplit(tabID) {
        return this._splits.has(tabID);
    }

    /** Remove all split state for a tab (called on tab close). */
    removeSplit(tabID) {
        this._splits.delete(tabID);
    }

    /** Collapse split: close the secondary pane, restore primary to fill panel. */
    closeSplitPane(tabID, sessionID) {
        const info = this._splits.get(tabID);
        if (!info || !info.panel) return null;
        const primary = info.panes.find(p => p.sessionID === tabID);
        if (primary && primary.termContainer) {
            const wrapper = info.panel.querySelector('.term-panel-wrapper');
            if (wrapper) {
                const titleBar = wrapper.querySelector('.term-title-bar');
                wrapper.innerHTML = '';
                if (titleBar) wrapper.appendChild(titleBar);
                primary.termContainer.style.flex = '1';
                primary.termContainer.style.overflow = 'hidden';
                wrapper.appendChild(primary.termContainer);
            } else {
                info.panel.innerHTML = '';
                primary.termContainer.style.flex = '1';
                primary.termContainer.style.overflow = 'hidden';
                info.panel.appendChild(primary.termContainer);
            }
        }
        this._splits.delete(tabID);
        return sessionID;
    }

    _attachDragHandler(handle, pane1, pane2, direction) {
        let startPos = 0;
        let startFlex1 = 0;
        let startFlex2 = 0;

        const onMouseDown = (e) => {
            e.preventDefault();
            handle.classList.add('dragging');
            startPos = direction === 'horizontal' ? e.clientX : e.clientY;
            startFlex1 = parseFloat(pane1.style.flex) || 1;
            startFlex2 = parseFloat(pane2.style.flex) || 1;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            const totalSize = direction === 'horizontal' ? handle.parentElement.offsetWidth : handle.parentElement.offsetHeight;
            if (totalSize === 0) return;
            const delta = ((direction === 'horizontal' ? e.clientX : e.clientY) - startPos) / totalSize;
            const total = startFlex1 + startFlex2;
            let f1 = startFlex1 + delta;
            let f2 = startFlex2 - delta;
            const min = total * 0.1;
            if (f1 < min) { f1 = min; f2 = total - min; }
            if (f2 < min) { f2 = min; f1 = total - min; }
            pane1.style.flex = f1.toFixed(4);
            pane2.style.flex = f2.toFixed(4);
            window.dispatchEvent(new Event('resize'));
        };

        const onMouseUp = () => {
            handle.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', onMouseDown);
    }
}

// ---------------------------------------------------------------------------
// CloudTerm Application
// ---------------------------------------------------------------------------

class CloudTermApp {
    constructor(config) {
        config = config || {};
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsEndpoint = config.wsEndpoint || (proto + '//' + location.host + '/ws');

        this.config = config;
        this.ws = new WSManager(wsEndpoint);
        this.termManager = new TerminalManager(this.ws);
        this.tabManager = new TabManager();
        this.tabManager.onExport = (sessionID) => this._exportSession(sessionID);
        this.tabManager.onToggleRecording = (sessionID) => this._toggleRecording(sessionID);
        this.tabManager.onSplit = (tabID) => this._splitTab(tabID, 'horizontal');
        this.tabManager.onFullscreen = (tabID) => this._toggleTerminalFullscreen(tabID);
        this.tabManager.onDetails = (tabID) => this._showInstanceDetails(tabID);
        this.tabManager.onSuggestToggle = (tabID, btn) => {
            const entry = this.termManager.terminals.get(tabID);
            if (!entry) return;
            const isActive = btn.classList.toggle('active');
            entry.setSuggestEnabled(isActive);
            this.ws.send('suggest_toggle', { session_id: tabID, enabled: isActive });
            const tabInfo = this.tabManager.tabs.get(tabID);
            if (tabInfo && tabInfo.instanceID) {
                try { localStorage.setItem('suggest_' + tabInfo.instanceID, isActive ? '1' : '0'); } catch(e) {}
            }
            showToast(isActive ? 'Suggestions enabled' : 'Suggestions disabled');
        };
        this.sidebar = new SidebarTree(
            document.getElementById('treeContainer') || document.getElementById('tree'),
            (id, name, type) => this.openSession(id, name, type)
        );
        this.favorites = new FavoritesManager((id, name, type) => this.openSession(id, name, type));
        this.snippets = new SnippetsManager();
        this.transfers = new TransferManager();
        this.cloneManager = new CloneManager(this.transfers);
        this.settings = new SettingsManager();
        this.splitManager = new SplitManager();
        this._sessionCounter = 0;
        this.sidebar._favorites = this.favorites;
        this.sidebar._onFavoritesChanged = () => this._renderFavorites();
        this.sidebar.onRefresh = () => {
            this._loadInstances();
            this._loadFleetStats();
        };

        this.currentPageTheme = localStorage.getItem('cloudterm_page_theme') || 'dark';
        this.currentTermTheme = localStorage.getItem('cloudterm_term_theme') || 'github-dark';
        this.zoomLevel = 100;
        this.appZoom = parseInt(this.settings.get('app_zoom'), 10) || 100;
        this.envColorsEnabled = this.settings.get('env_colors_enabled') === 'true';
        try { this.envColorMap = JSON.parse(this.settings.get('env_color_map') || '{}'); } catch (_) { this.envColorMap = {}; }
        this.rdpMode = config.rdpMode || 'native';
        this.guacWSURL = config.guacWSURL || '';
        this.aiChat = new AIChatManager(this);
    }

    init() {
        this.ws.connect();
        this._setupWSHandlers();
        this._loadRDPMode();
        this._loadInstances();
        this._loadFleetStats();
        this._setupEventListeners();
        this._setupZoomControls();
        this._setupThemeSelector();
        // Apply saved themes from localStorage.
        if (this.currentPageTheme !== 'dark') this._setPageTheme(this.currentPageTheme);
        if (this.currentTermTheme !== 'github-dark') this._setTermTheme(this.currentTermTheme);
        if (this.appZoom !== 100) document.body.style.zoom = (this.appZoom / 100).toString();
        this._setupFilterInput();
        this._setupScanButton();
        this._setupContextMenu();
        this._setupDetailsModal();
        this._setupSummaryButton();
        this._setupSnippetsButton();
        this._setupHistoryButton();
        this._setupBroadcastButton();
        this._setupInputSyncButton();
        this._setupTunnelPanel();
        this._setupRecordingsButton();
        this._setupTabContextMenu();
        this._setupAIToggle();

        // Wire up server preference sync callbacks
        this.favorites.onSave = () => this._pushPreferencesToServer();
        this.snippets.onSave = () => this._pushPreferencesToServer();

        // Load preferences from server (overrides localStorage if server has data)
        this._loadServerPreferences();
    }

    // -- WebSocket message handlers ------------------------------------------

    _setupWSHandlers() {
        this.ws.on('terminal_output', (payload) => {
            this.termManager.handleOutput(payload.session_id, payload.output);
        });

        this.ws.on('suggest_response', (payload) => {
            const entry = this.termManager.terminals.get(payload.session_id);
            if (entry && entry.ghostText && payload.suggestions && payload.suggestions.length > 0) {
                entry.ghostText.show(payload.suggestions[0].text, entry.ghostText.currentLine);
            }
        });

        this.ws.on('log_insight', (payload) => {
            this._showLogInsight(payload);
        });

        this.ws.on('session_started', (payload) => {
            showToast('Session started: ' + (payload.instance_id || ''));
            if (payload.recording && payload.session_id) {
                const s = this.termManager.terminals.get(payload.session_id);
                if (s) {
                    s.recording = true;
                    const tab = document.querySelector('.tab[data-id="' + payload.session_id + '"]');
                    if (tab && !tab.querySelector('.tab-rec')) {
                        const span = document.createElement('span');
                        span.className = 'tab-rec';
                        span.textContent = '\u25CF';
                        span.title = 'Recording';
                        tab.querySelector('.tab-name')?.after(span);
                    }
                    const panel = document.getElementById('panel-' + payload.session_id);
                    if (panel) {
                        const titleRecBtn = panel.querySelector('.record-btn');
                        if (titleRecBtn) {
                            titleRecBtn.classList.add('recording');
                            titleRecBtn.innerHTML = '<span class="btn-icon">\u25CF</span> Recording';
                        }
                    }
                }
            }
        });

        this.ws.on('session_error', (payload) => {
            showToast('Session error: ' + (payload.error || 'unknown'), 5000);
        });

        this.ws.on('session_closed', (payload) => {
            showToast('Session closed: ' + (payload.session_id || ''));
        });

        this.ws.on('scan_status', (payload) => {
            this._updateScanStatus(payload);
        });

        this.ws.on('_ws_open', () => {
            this._updateConnectionIndicator(true);
        });

        this.ws.on('_ws_close', () => {
            this._updateConnectionIndicator(false);
        });
    }

    // -- Data loading --------------------------------------------------------

    async _loadInstances() {
        try {
            const resp = await fetch('/instances');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            this.sidebar.render(data);
            this._syncSidebarActiveStates();
            this._renderFavorites();
        } catch (e) {
            console.error('Failed to load instances:', e);
        }
    }

    async _loadFleetStats() {
        try {
            const resp = await fetch('/fleet-stats');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const stats = await resp.json();
            this._renderFleetStats(stats);
        } catch (e) {
            console.error('Failed to load fleet stats:', e);
        }
    }

    async _loadRDPMode() {
        try {
            const resp = await fetch('/rdp-mode');
            if (!resp.ok) return;
            const data = await resp.json();
            this.rdpMode = data.mode || 'native';
            this.guacWSURL = data.guac_ws_url || '';
        } catch (e) {
            // Use defaults.
        }
    }

    _renderFleetStats(stats) {
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        set('statTotal', stats.total || 0);
        set('statAccounts', stats.accounts || 0);
    }

    _setupSummaryButton() {
        const btn = document.getElementById('summaryBtn');
        if (btn) btn.addEventListener('click', () => this._showSummaryModal());
    }

    async _showSummaryModal() {
        const modal = document.getElementById('summaryModal');
        const body = document.getElementById('summaryBody');
        if (!modal || !body) return;

        body.innerHTML = '<div style="text-align:center;color:var(--dim);padding:20px">Loading...</div>';
        modal.classList.add('show');

        try {
            const resp = await fetch('/fleet-summary');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const s = await resp.json();
            const esc = (v) => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;');

            // Platform pills.
            let platformHTML = '<div class="summary-section">Platforms</div><div class="platform-pills">';
            const platforms = s.platforms || {};
            const sortedPlatforms = Object.entries(platforms).sort((a,b) => b[1] - a[1]);
            for (const [name, count] of sortedPlatforms) {
                platformHTML += '<div class="platform-pill"><span class="pill-count">' + count + '</span><span class="pill-label">' + esc(name) + '</span></div>';
            }
            platformHTML += '</div>';

            // Totals row.
            let totalsHTML = '<div class="summary-section">Overview</div>' +
                '<div style="display:flex;gap:10px;margin-bottom:10px">' +
                '<div class="platform-pill"><span class="pill-count">' + s.total + '</span><span class="pill-label">Total</span></div>' +
                '<div class="platform-pill"><span class="pill-count" style="color:var(--ssh)">' + s.running + '</span><span class="pill-label">Running</span></div>' +
                '<div class="platform-pill"><span class="pill-count" style="color:var(--red)">' + s.stopped + '</span><span class="pill-label">Stopped</span></div>' +
                (s.scan_duration ? '<div class="platform-pill"><span class="pill-count" style="color:var(--orange)">' + esc(s.scan_duration) + '</span><span class="pill-label">Scan Time</span></div>' : '') +
                '</div>';

            // Per-account table.
            let tableHTML = '<div class="summary-section">Per Account</div>' +
                '<table class="summary-table"><thead><tr>' +
                '<th>Account</th><th class="num">Total</th><th class="num">Running</th><th class="num">Stopped</th><th>Platforms</th>' +
                '</tr></thead><tbody>';

            const accounts = s.accounts || [];
            for (const acct of accounts) {
                const label = acct.account_alias || acct.profile || acct.account_id;
                const acctPlatforms = Object.entries(acct.platforms || {}).sort((a,b) => b[1] - a[1]);
                const platStr = acctPlatforms.map(([n,c]) => c + ' ' + n).join(', ');
                tableHTML += '<tr>' +
                    '<td title="' + esc(acct.account_id) + '">' + esc(label) + '</td>' +
                    '<td class="num">' + acct.total + '</td>' +
                    '<td class="num" style="color:var(--ssh)">' + acct.running + '</td>' +
                    '<td class="num" style="color:var(--red)">' + acct.stopped + '</td>' +
                    '<td style="font-size:10px;color:var(--muted)">' + esc(platStr) + '</td>' +
                    '</tr>';
            }
            tableHTML += '</tbody></table>';

            body.innerHTML = totalsHTML + platformHTML + tableHTML;
        } catch (e) {
            body.innerHTML = '<div style="color:var(--red);padding:20px">Failed to load summary: ' + e.message + '</div>';
        }
    }

    // -- Session management --------------------------------------------------

    openSession(instanceID, instanceName, type) {
        // For RDP, reuse existing tab (only one RDP session per instance).
        // For SSH, always open a new tab (allow multiple terminals per instance).
        let tabID;
        if (type === 'rdp') {
            tabID = instanceID + '-rdp';
            if (this.tabManager.tabs.has(tabID)) {
                this.tabManager.switchTab(tabID);
                return;
            }
        } else {
            this._sessionCounter = (this._sessionCounter || 0) + 1;
            tabID = instanceID + '-ssh-' + this._sessionCounter;
        }

        // Create tab.
        this.tabManager.openTab(tabID, instanceName, type);
        // Store the raw instanceID on tab info for backend API calls.
        const tabInfo = this.tabManager.tabs.get(tabID);
        if (tabInfo) tabInfo.instanceID = instanceID;

        if (type === 'ssh') {
            const panel = document.getElementById('panel-' + tabID);
            const containerEl = panel ? panel.querySelector('.terminal-container') : null;
            if (containerEl) {
                this.termManager.createTerminal(tabID, instanceID, instanceName, containerEl, this.currentTermTheme);
                // Apply environment color border.
                const envColor = this._getEnvColor(instanceID);
                if (envColor && panel) panel.style.borderLeft = '3px solid ' + envColor;
                // Fit after the panel is visible.
                requestAnimationFrame(() => {
                    this.termManager.fitTerminal(tabID);
                    this.termManager.focusTerminal(tabID);
                });
            }
        } else if (type === 'rdp') {
            this._startRDPSession(tabID, instanceID, instanceName);
        }

        this._syncSidebarActiveStates();
    }

    // -- RDP -----------------------------------------------------------------

    async _startRDPSession(tabID, instanceID, instanceName, defaults) {
        if (this.rdpMode === 'guacamole') {
            const inst = this.sidebar.getInstance(instanceID);
            const env = inst?.tags?.[this.tag2Key] || '';
            const account = inst?.account_id || '';

            try {
                const matchResp = await fetch('/vault/match?' + new URLSearchParams({
                    instance_id: instanceID, name: instanceName, env: env, account: account
                }));
                if (matchResp.ok) {
                    const match = await matchResp.json();
                    if (match.rule && match.rule.id) {
                        showToast('Connecting with saved credentials (' + (match.rule.label || match.rule.type) + ')...');
                        const vaultEntry = await fetch('/vault/credentials?resolve=' + encodeURIComponent(match.rule.id));
                        const vaultData = await vaultEntry.json();
                        if (vaultData && vaultData.credential) {
                            await this._connectGuacRDP(tabID, instanceID, instanceName, {
                                username: vaultData.credential.username,
                                password: vaultData.credential.password,
                                domain: vaultData.credential.domain || '',
                                security: vaultData.credential.security || 'any'
                            });
                            return;
                        }
                    }
                }
            } catch (e) { /* vault check failed, fall through to manual */ }

            try {
                const creds = await showRDPCredentialModal(instanceID, instanceName, defaults);
                if (creds._saveToVault && creds._vaultRule) {
                    try {
                        await fetch('/vault/credentials', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                rule: creds._vaultRule,
                                credential: { username: creds.username, password: creds.password, domain: creds.domain || '', security: creds.security }
                            })
                        });
                        showToast('Credentials saved to vault');
                    } catch (e) { showToast('Failed to save to vault'); }
                }
                await this._connectGuacRDP(tabID, instanceID, instanceName, creds);
            } catch (e) {
                if (e.message !== 'cancelled') {
                    showToast('RDP error: ' + e.message, 5000);
                    const panel = document.getElementById('panel-' + tabID);
                    if (panel) {
                        const statusEl = panel.querySelector('.rdp-status');
                        if (statusEl) { statusEl.textContent = 'Error'; statusEl.style.color = 'var(--red)'; }
                        const vp = panel.querySelector('.rdp-viewport');
                        if (vp) { vp.innerHTML = '<span style="color:var(--red);font-size:13px;">' + e.message + '</span>'; }
                    }
                }
            }
        } else {
            // Native mode: start port forward, then launch local client.
            try {
                const inst = this.sidebar.getInstance(instanceID);
                showToast('Starting RDP port forward...');

                const resp = await fetch('/start-rdp-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instance_id: instanceID,
                        instance_name: instanceName,
                        aws_profile: inst ? inst.aws_profile : '',
                        aws_region: inst ? inst.aws_region : ''
                    })
                });
                const data = await resp.json();

                if (data.port) {
                    await fetch('/launch-rdp-client', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            instance_id: instanceID,
                            port: data.port
                        })
                    });
                }

                showToast('Launching RDP client for ' + instanceName + '...');
            } catch (e) {
                showToast('RDP error: ' + e.message, 5000);
            }
        }
    }

    async _connectGuacRDP(tabID, instanceID, instanceName, creds) {
        const inst = this.sidebar.getInstance(instanceID);

        showToast('Starting Guacamole RDP session...');
        const resp = await fetch('/start-guacamole-rdp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instance_id: instanceID,
                instance_name: instanceName,
                aws_profile: inst ? inst.aws_profile : '',
                aws_region: inst ? inst.aws_region : '',
                username: creds.username,
                password: creds.password,
                record: creds.record,
                security: creds.security
            })
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || 'HTTP ' + resp.status);
        }

        const data = await resp.json();

        if (data.recording) {
            const tab = document.querySelector('.tab[data-id="' + tabID + '"]');
            if (tab && !tab.querySelector('.tab-rec')) {
                const span = document.createElement('span');
                span.className = 'tab-rec';
                span.textContent = '\u25CF';
                span.title = 'Recording';
                tab.querySelector('.tab-name').after(span);
            }
        }

        const panel = document.getElementById('panel-' + tabID);
        if (!panel) return;
        const viewport = panel.querySelector('.rdp-viewport');
        if (!viewport) return;

        viewport.innerHTML = '';
        viewport.style.position = 'relative';
        viewport.style.overflow = 'hidden';
        viewport.style.display = 'block';
        viewport.style.cursor = 'none';

        var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        var wsFullUrl = proto + '//' + location.host + '/guac-ws/?width=' + viewport.clientWidth + '&height=' + viewport.clientHeight + '&token=' + encodeURIComponent(data.token);

        var tunnel = new Guacamole.WebSocketTunnel(wsFullUrl);
        var guac = new Guacamole.Client(tunnel);

        var displayEl = guac.getDisplay().getElement();
        displayEl.style.position = 'absolute';
        displayEl.style.left = '0';
        displayEl.style.top = '0';
        viewport.appendChild(displayEl);

        var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
        var metaHeld = false;
        var guacActive = true;

        var statusEl = panel.querySelector('.rdp-status');
        function updateStatus(text, color) {
            if (statusEl) { statusEl.textContent = text; statusEl.style.color = color || 'var(--dim)'; }
        }

        guac.onerror = function(error) {
            console.error('Guacamole error:', error);
            updateStatus('Error', 'var(--red)');
        };

        // Timeout: if stuck in Waiting (state 2) for more than 30s, show timeout and disconnect
        var waitingTimer = null;
        guac.onstatechange = function(state) {
            if (waitingTimer) { clearTimeout(waitingTimer); waitingTimer = null; }
            switch (state) {
                case 1: updateStatus('Connecting...', 'var(--dim)'); break;
                case 2:
                    updateStatus('Waiting...', 'var(--dim)');
                    waitingTimer = setTimeout(function() {
                        updateStatus('Timed out', 'var(--red)');
                        guacActive = false;
                        try { guac.disconnect(); } catch(e) {}
                        showToast('RDP connection timed out — the remote host may be unreachable', 5000);
                    }, 30000);
                    break;
                case 3:
                    updateStatus('\u25CF Connected', 'var(--ssh)');
                    updateDisplay();
                    break;
                case 5: updateStatus('Disconnected', 'var(--red)'); guacActive = false; break;
            }
        };

        var lastRemoteClipboard = '';
        guac.onclipboard = function(stream, mimetype) {
            if (mimetype === 'text/plain') {
                var chunks = [];
                stream.onblob = function(blob) { chunks.push(blob); };
                stream.onend = function() {
                    try {
                        var binary = atob(chunks.join(''));
                        var bytes = new Uint8Array(binary.length);
                        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                        var clipData = new TextDecoder('utf-8').decode(bytes);
                        lastRemoteClipboard = clipData;
                        if (navigator.clipboard && navigator.clipboard.writeText && document.hasFocus()) {
                            navigator.clipboard.writeText(clipData).catch(function(){});
                        }
                    } catch(e) {}
                };
            }
        };

        function pushClipToRemote(text) {
            if (!text || !guac || !guacActive) return;
            try {
                var encoder = new TextEncoder();
                var bytes = encoder.encode(text);
                var binary = '';
                for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                var b64 = btoa(binary);
                var s = guac.createClipboardStream('text/plain');
                s.sendBlob(b64);
                s.sendEnd();
            } catch(e) {}
        }

        function updateDisplay() {
            var display = guac.getDisplay();
            var cw = viewport.clientWidth, ch = viewport.clientHeight;
            var dw = display.getWidth(), dh = display.getHeight();
            if (dw && dh) {
                var scale = Math.min(cw / dw, ch / dh);
                display.scale(scale);
            }
        }

        guac.getDisplay().onresize = function() { updateDisplay(); };

        var resizeObserver = new ResizeObserver(function() { updateDisplay(); });
        resizeObserver.observe(viewport);

        var mouseState = new Guacamole.Mouse.State(0, 0, false, false, false, false, false);
        function getMousePos(e) {
            var display = guac.getDisplay();
            var rect = displayEl.getBoundingClientRect();
            var scale = display.getScale();
            return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
        }
        function sendMouseState() { if (guac && guacActive) guac.sendMouseState(mouseState); }

        viewport.addEventListener('mousemove', function(e) {
            var pos = getMousePos(e); mouseState.x = pos.x; mouseState.y = pos.y; sendMouseState();
        });
        viewport.addEventListener('mousedown', function(e) {
            var pos = getMousePos(e); mouseState.x = pos.x; mouseState.y = pos.y;
            if (e.button === 0) mouseState.left = true;
            if (e.button === 1) mouseState.middle = true;
            if (e.button === 2) mouseState.right = true;
            sendMouseState(); e.preventDefault();
        });
        viewport.addEventListener('mouseup', function(e) {
            var pos = getMousePos(e); mouseState.x = pos.x; mouseState.y = pos.y;
            if (e.button === 0) mouseState.left = false;
            if (e.button === 1) mouseState.middle = false;
            if (e.button === 2) mouseState.right = false;
            sendMouseState(); e.preventDefault();
        });
        viewport.addEventListener('wheel', function(e) {
            var pos = getMousePos(e); mouseState.x = pos.x; mouseState.y = pos.y;
            if (e.deltaY < 0) { mouseState.scrollUp = true; sendMouseState(); mouseState.scrollUp = false; }
            else if (e.deltaY > 0) { mouseState.scrollDown = true; sendMouseState(); mouseState.scrollDown = false; }
            sendMouseState(); e.preventDefault();
        });
        viewport.addEventListener('contextmenu', function(e) { e.preventDefault(); });

        var keyboard = new Guacamole.Keyboard(viewport);
        viewport.setAttribute('tabindex', '0');
        viewport.addEventListener('click', function() { viewport.focus(); });

        keyboard.onkeydown = function(keysym) {
            if (!guac || !guacActive) return false;
            if (isMac) {
                if (keysym === 0xFFE7 || keysym === 0xFFE8) {
                    metaHeld = true;
                    guac.sendKeyEvent(1, 0xFFE3);
                    return true;
                }
                if (metaHeld) {
                    var kl = keysym | 0x20;
                    if (kl === 0x6c || kl === 0x64) return true;
                    if (kl === 0x76) return true;
                    if (kl === 0x63) {
                        guac.sendKeyEvent(1, 0x63);
                        setTimeout(function() { guac.sendKeyEvent(0, 0x63); }, 50);
                        setTimeout(function() {
                            if (lastRemoteClipboard && navigator.clipboard && navigator.clipboard.writeText && document.hasFocus()) {
                                navigator.clipboard.writeText(lastRemoteClipboard).catch(function(){});
                            }
                        }, 500);
                        return true;
                    }
                }
            } else {
                if (keysym === 0xFFE3 || keysym === 0xFFE4) {
                    metaHeld = true;
                }
                if (metaHeld) {
                    var kl = keysym | 0x20;
                    if (kl === 0x76) return true;
                    if (kl === 0x63) {
                        guac.sendKeyEvent(1, 0x63);
                        setTimeout(function() { guac.sendKeyEvent(0, 0x63); }, 50);
                        setTimeout(function() {
                            if (lastRemoteClipboard && navigator.clipboard && navigator.clipboard.writeText && document.hasFocus()) {
                                navigator.clipboard.writeText(lastRemoteClipboard).catch(function(){});
                            }
                        }, 500);
                        return true;
                    }
                }
            }
            guac.sendKeyEvent(1, keysym);
            return true;
        };

        keyboard.onkeyup = function(keysym) {
            if (!guac || !guacActive) return;
            if (isMac && (keysym === 0xFFE7 || keysym === 0xFFE8)) {
                metaHeld = false;
                guac.sendKeyEvent(0, 0xFFE3);
                return;
            }
            if (!isMac && (keysym === 0xFFE3 || keysym === 0xFFE4)) {
                metaHeld = false;
            }
            guac.sendKeyEvent(0, keysym);
        };

        viewport.addEventListener('focus', function() {
            setTimeout(function() {
                if (document.hasFocus() && navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText().then(pushClipToRemote).catch(function(){});
                }
            }, 100);
        });

        viewport.addEventListener('click', function() {
            viewport.focus();
            setTimeout(function() {
                if (document.hasFocus() && navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText().then(pushClipToRemote).catch(function(){});
                }
            }, 100);
        });

        viewport.addEventListener('paste', function(e) {
            e.preventDefault();
            var text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
            if (text) {
                pushClipToRemote(text);
                setTimeout(function() {
                    guac.sendKeyEvent(1, 0xFFE3);
                    guac.sendKeyEvent(1, 0x76);
                    setTimeout(function() {
                        guac.sendKeyEvent(0, 0x76);
                        guac.sendKeyEvent(0, 0xFFE3);
                    }, 50);
                }, 150);
            } else if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(function(clipText) {
                    if (!clipText) return;
                    pushClipToRemote(clipText);
                    setTimeout(function() {
                        guac.sendKeyEvent(1, 0xFFE3);
                        guac.sendKeyEvent(1, 0x76);
                        setTimeout(function() {
                            guac.sendKeyEvent(0, 0x76);
                            guac.sendKeyEvent(0, 0xFFE3);
                        }, 50);
                    }, 150);
                }).catch(function(){});
            }
        }, true);

        document.addEventListener('paste', function(e) {
            if (document.activeElement !== viewport && !viewport.contains(document.activeElement)) return;
            e.preventDefault();
            var text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
            if (text && guac && guacActive) {
                pushClipToRemote(text);
                setTimeout(function() {
                    guac.sendKeyEvent(1, 0xFFE3);
                    guac.sendKeyEvent(1, 0x76);
                    setTimeout(function() {
                        guac.sendKeyEvent(0, 0x76);
                        guac.sendKeyEvent(0, 0xFFE3);
                    }, 50);
                }, 150);
            }
        });

        // Keepalive: send periodic nop to prevent guacamole-lite from
        // considering the connection inactive when the tab loses focus and
        // mouse/keyboard events stop.  Uses a Web Worker so it isn't
        // throttled by the browser in background tabs.
        var keepaliveWorker = null;
        try {
            var workerBlob = new Blob([
                'var iv=null;' +
                'onmessage=function(e){' +
                '  if(e.data==="start"){clearInterval(iv);iv=setInterval(function(){postMessage("ping")},5000);}' +
                '  else if(e.data==="stop"){clearInterval(iv);}' +
                '};'
            ], { type: 'application/javascript' });
            keepaliveWorker = new Worker(URL.createObjectURL(workerBlob));
            keepaliveWorker.onmessage = function() {
                if (tunnel && guacActive) {
                    try { tunnel.sendMessage('nop'); } catch(e) {}
                }
            };
            keepaliveWorker.postMessage('start');
        } catch(e) {
            // Fallback: plain setInterval (throttled in background tabs, but better than nothing)
            var _keepaliveTimer = setInterval(function() {
                if (tunnel && guacActive) {
                    try { tunnel.sendMessage('nop'); } catch(e) {}
                }
            }, 5000);
        }

        guac.connect('');

        this.tabManager.onCtrlAltDel = function(tid) {
            if (tid !== tabID || !guac || !guacActive) return;
            guac.sendKeyEvent(1, 0xFFE3);
            guac.sendKeyEvent(1, 0xFFE9);
            guac.sendKeyEvent(1, 0xFFFF);
            guac.sendKeyEvent(0, 0xFFFF);
            guac.sendKeyEvent(0, 0xFFE9);
            guac.sendKeyEvent(0, 0xFFE3);
        };

        this.tabManager.onResChange = function(tid, val) {
            if (tid !== tabID || !guac || !guacActive) return;
            if (val === 'auto') {
                guac.sendSize(viewport.clientWidth, viewport.clientHeight);
            } else {
                var parts = val.split('x');
                guac.sendSize(parseInt(parts[0]), parseInt(parts[1]));
            }
        };

        this._lastRDPCreds = this._lastRDPCreds || {};
        this._lastRDPCreds[instanceID] = { tabID, creds, guac, pushClipToRemote, getLastRemoteClip: function() { return lastRemoteClipboard; } };

        this._guacClients = this._guacClients || {};
        this._guacClients[tabID] = { guac, tunnel, keyboard, resizeObserver, keepaliveWorker };
    }

    async _stopRDPSession(instanceID) {
        try {
            const endpoint = this.rdpMode === 'guacamole' ? '/stop-guacamole-rdp' : '/stop-rdp-session';
            await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instance_id: instanceID })
            });
        } catch (e) {
            console.error('Failed to stop RDP session:', e);
        }
    }

    // -- Sidebar active state sync -------------------------------------------

    _syncSidebarActiveStates() {
        // Build map of instanceID -> Set of active types (ssh, rdp, or both).
        const activeMap = new Map();
        for (const [, info] of this.tabManager.tabs) {
            const instID = info.instanceID || info.sessionID;
            if (!activeMap.has(instID)) activeMap.set(instID, new Set());
            activeMap.get(instID).add(info.type);
        }
        this.sidebar.updateActiveStates(activeMap);
    }

    // -- Scan ----------------------------------------------------------------

    _setupScanButton() {
        const btn = document.getElementById('scanBtn');
        if (!btn) return;
        btn.addEventListener('click', () => this._triggerScan());
    }

    async _triggerScan() {
        const btn = document.getElementById('scanBtn');
        if (btn) {
            btn.classList.add('scanning');
            btn.style.pointerEvents = 'none';
        }
        showToast('Scanning all profiles and regions...');

        try {
            await fetch('/scan-instances?force=true');
            // The scan runs async on the server. Poll for completion.
            this._pollScanStatus();
        } catch (e) {
            showToast('Scan failed: ' + e.message, 5000);
            if (btn) { btn.classList.remove('scanning'); btn.style.pointerEvents = ''; }
        }
    }

    async _pollScanStatus() {
        const poll = async () => {
            try {
                const resp = await fetch('/scan-status');
                if (!resp.ok) return;
                const status = await resp.json();
                this._updateScanStatus(status);
                if (status.status === 'scanning') {
                    setTimeout(poll, 2000);
                } else {
                    // Refresh data.
                    this._loadInstances();
                    this._loadFleetStats();
                    const btn = document.getElementById('scanBtn');
                    if (btn) { btn.classList.remove('scanning'); btn.style.pointerEvents = ''; }
                }
            } catch (e) {
                // Retry.
                setTimeout(poll, 3000);
            }
        };
        poll();
    }

    _updateScanStatus(status) {
        const btn = document.getElementById('scanBtn');
        if (!btn) return;
        if (status.status === 'scanning') {
            btn.innerHTML = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Scanning... (' + (status.total_instances || 0) + ')';
        } else if (status.status === 'completed') {
            btn.innerHTML = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Scan Instances';
            btn.classList.remove('scanning');
        } else if (status.status === 'error') {
            btn.innerHTML = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Scan Instances';
            btn.classList.remove('scanning');
            showToast('Scan failed');
        }
    }

    _updateConnectionIndicator(connected) {
        if (this._wsDisconnectTimer) {
            clearTimeout(this._wsDisconnectTimer);
            this._wsDisconnectTimer = null;
        }
        if (!connected) {
            // Only show toast if disconnect persists > 3 seconds (skip brief hiccups)
            this._wsDisconnectTimer = setTimeout(() => {
                showToast('WebSocket disconnected — reconnecting...');
            }, 3000);
        }
    }

    // -- Zoom controls -------------------------------------------------------

    _setupZoomControls() {
        const zoomIn = document.getElementById('zoomInBtn');
        const zoomOut = document.getElementById('zoomOutBtn');
        if (zoomIn) zoomIn.addEventListener('click', () => this._zoom(10));
        if (zoomOut) zoomOut.addEventListener('click', () => this._zoom(-10));
    }

    _zoom(delta) {
        const next = this.zoomLevel + delta;
        if (next < 60 || next > 200) return;
        this.zoomLevel = next;
        const size = 12.5 * (this.zoomLevel / 100);
        document.documentElement.style.setProperty('--term-font-size', size + 'px');
        const label = document.getElementById('zoomLevel');
        if (label) label.textContent = this.zoomLevel + '%';
        this.termManager.applyFontSize(size);
    }

    _appZoom(delta) {
        const next = this.appZoom + delta;
        if (next < 70 || next > 150) return;
        this.appZoom = next;
        document.body.style.zoom = (this.appZoom / 100).toString();
        this.settings.set('app_zoom', String(this.appZoom));
    }

    // -- Theme selector ------------------------------------------------------

    _setupThemeSelector() {
        const dropdown = document.getElementById('themeDropdown');
        const toggleBtn = dropdown ? dropdown.querySelector('.topbar-btn') : null;
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('open');
            });
        }

        // Page theme options.
        document.querySelectorAll('[data-page-theme]').forEach(el => {
            el.addEventListener('click', () => this._setPageTheme(el.dataset.pageTheme));
        });

        // Terminal theme options.
        document.querySelectorAll('[data-term-theme]').forEach(el => {
            el.addEventListener('click', () => this._setTermTheme(el.dataset.termTheme));
        });

        // Close dropdown when clicking outside.
        document.addEventListener('click', (e) => {
            if (dropdown && !e.target.closest('.theme-dropdown')) {
                dropdown.classList.remove('open');
            }
        });
    }

    _setPageTheme(name) {
        const vars = PAGE_THEMES[name];
        if (!vars) return;
        const root = document.documentElement;
        for (const [prop, val] of Object.entries(vars)) {
            root.style.setProperty(prop, val);
        }
        this.currentPageTheme = name;
        try { localStorage.setItem('cloudterm_page_theme', name); } catch (e) {}
        this._pushPreferencesToServer();
        document.dispatchEvent(new CustomEvent('cloudterm-theme-changed'));

        document.querySelectorAll('[data-page-theme]').forEach(el => {
            const isActive = el.dataset.pageTheme === name;
            el.classList.toggle('active', isActive);
            let check = el.querySelector('.check');
            if (isActive && !check) {
                check = document.createElement('span');
                check.className = 'check';
                check.textContent = '\u2713';
                el.appendChild(check);
            } else if (!isActive && check) {
                check.remove();
            }
        });
    }

    _setTermTheme(name) {
        if (!TERMINAL_THEMES[name]) return;
        this.currentTermTheme = name;
        this.termManager.applyTheme(name);
        try { localStorage.setItem('cloudterm_term_theme', name); } catch (e) {}
        this._pushPreferencesToServer();

        document.querySelectorAll('[data-term-theme]').forEach(el => {
            const isActive = el.dataset.termTheme === name;
            el.classList.toggle('active', isActive);
            let check = el.querySelector('.check');
            if (isActive && !check) {
                check = document.createElement('span');
                check.className = 'check';
                check.textContent = '\u2713';
                el.appendChild(check);
            } else if (!isActive && check) {
                check.remove();
            }
        });
    }

    // -- Server preferences sync ---------------------------------------------

    async _loadServerPreferences() {
        try {
            const resp = await fetch('/preferences');
            if (!resp.ok) return;
            const prefs = await resp.json();
            if (!prefs || Object.keys(prefs).length === 0) return;

            // Update in-memory state from server data
            if (prefs.favorites) {
                this.favorites.favorites = new Set(prefs.favorites);
                localStorage.setItem('cloudterm_favorites', JSON.stringify(prefs.favorites));
            }
            if (prefs.snippets && prefs.snippets.length > 0) {
                this.snippets.snippets = prefs.snippets;
                localStorage.setItem('cloudterm_snippets', JSON.stringify(prefs.snippets));
            }
            if (prefs.page_theme && prefs.page_theme !== this.currentPageTheme) {
                this._setPageTheme(prefs.page_theme);
            }
            if (prefs.term_theme && prefs.term_theme !== this.currentTermTheme) {
                this._setTermTheme(prefs.term_theme);
            }
            if (prefs.env_colors_enabled !== undefined) {
                this.envColorsEnabled = prefs.env_colors_enabled === true || prefs.env_colors_enabled === 'true';
                this.settings.set('env_colors_enabled', this.envColorsEnabled ? 'true' : 'false');
            }
            if (prefs.env_color_map && typeof prefs.env_color_map === 'object') {
                this.envColorMap = prefs.env_color_map;
                this.settings.set('env_color_map', JSON.stringify(prefs.env_color_map));
            }

            // Re-render favorites section if data changed
            this._renderFavorites();

            // Load AI settings into settings UI
            if (prefs.aiProvider) this._aiPrefs = {
                provider: prefs.aiProvider || 'bedrock',
                model: prefs.aiModel || '',
                bedrockRegion: prefs.aiBedrockRegion || 'us-east-1',
                bedrockProfile: prefs.aiBedrockProfile || 'dev',
                anthropicKey: prefs.aiAnthropicKey || '',
                openaiKey: prefs.aiOpenAIKey || '',
                geminiKey: prefs.aiGeminiKey || '',
                ollamaUrl: prefs.aiOllamaUrl || 'http://localhost:11434',
                maxTokens: prefs.aiMaxTokens || 4096
            };
        } catch (e) {
            // Server unavailable — localStorage is the fallback
        }
    }

    _pushPreferencesToServer() {
        clearTimeout(this._prefsSaveTimer);
        this._prefsSaveTimer = setTimeout(() => {
            const prefs = {
                favorites: [...this.favorites.favorites],
                snippets: this.snippets.getAll(),
                page_theme: this.currentPageTheme,
                term_theme: this.currentTermTheme,
                env_colors_enabled: this.envColorsEnabled,
                env_color_map: this.envColorMap
            };
            // Include AI settings if present
            const ai = this._aiPrefs;
            if (ai) {
                prefs.aiProvider = ai.provider;
                prefs.aiModel = ai.model;
                prefs.aiBedrockRegion = ai.bedrockRegion;
                prefs.aiBedrockProfile = ai.bedrockProfile;
                prefs.aiAnthropicKey = ai.anthropicKey;
                prefs.aiOpenAIKey = ai.openaiKey;
                prefs.aiGeminiKey = ai.geminiKey;
                prefs.aiOllamaUrl = ai.ollamaUrl;
                prefs.aiMaxTokens = ai.maxTokens;
            }
            fetch('/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(prefs)
            }).catch(() => {});
        }, 500);
    }

    // -- Filter input --------------------------------------------------------

    _setupFilterInput() {
        const input = document.getElementById('filterInput');
        if (!input) return;
        input.addEventListener('input', () => {
            this.sidebar.filter(input.value);
        });
    }

    // -- Context menu --------------------------------------------------------

    _setupContextMenu() {
        // Close context menu on any click.
        document.addEventListener('click', () => {
            const menu = document.getElementById('ctxMenu');
            if (menu) menu.classList.remove('show');
        });

        // Attach handlers to context menu items.
        const menu = document.getElementById('ctxMenu');
        if (!menu) return;

        const items = menu.querySelectorAll('.ctx-item');
        items.forEach(item => {
            item.addEventListener('click', () => {
                const id = menu.dataset.instanceId;
                const name = menu.dataset.instanceName;
                const type = menu.dataset.instanceType;
                const text = item.textContent.trim().toLowerCase();

                if (text.includes('open ssh')) {
                    this.openSession(id, name, 'ssh');
                } else if (text.includes('open rdp')) {
                    this.openSession(id, name, 'rdp');
                } else if (text.includes('copy instance id')) {
                    copyToClipboard(id);
                } else if (text.includes('copy private ip')) {
                    const inst = this.sidebar.getInstance(id);
                    const ip = inst ? inst.private_ip : '';
                    if (ip) {
                        copyToClipboard(ip);
                    } else {
                        showToast('No private IP available');
                    }
                } else if (text.includes('instance details')) {
                    this._showInstanceDetails(id);
                } else if (text.includes('upload file')) {
                    this._showUploadModal(id, name);
                } else if (text.includes('download file')) {
                    this._showDownloadModal(id, name);
                } else if (text.includes('express upload')) {
                    if (!this.settings.get('s3_bucket')) {
                        showToast('Configure S3 bucket in Settings first', 3000);
                        return;
                    }
                    this._showExpressUploadModal(id, name);
                } else if (text.includes('express download')) {
                    if (!this.settings.get('s3_bucket')) {
                        showToast('Configure S3 bucket in Settings first', 3000);
                        return;
                    }
                    this._showExpressDownloadModal(id, name);
                } else if (text.includes('toggle favorite')) {
                    this.favorites.toggle(id);
                    this._renderFavorites();
                    // Update star in sidebar tree
                    const star = this.sidebar.container.querySelector('.fav-star[data-fav-id="' + id + '"]');
                    if (star) star.classList.toggle('active');
                } else if (text.includes('browse files')) {
                    this._showFileBrowserModal(id, name);
                } else if (text.includes('broadcast command')) {
                    this._showBroadcastModal(id);
                } else if (text.includes('port forward')) {
                    this._showPortForwardModal(id, name);
                } else if (text.includes('network topology')) {
                    this._openTopologyTab(id, name);
                } else if (text.includes('clone instance')) {
                    this.cloneManager.startClone(id, name);
                } else if (text.includes('close all')) {
                    this._closeSession(id);
                }

                menu.classList.remove('show');
            });
        });
    }

    // -- Topology Tab ---------------------------------------------------------

    _openTopologyTab(instanceID, instanceName) {
        const tabID = 'topo-' + instanceID;
        // If tab already exists, switch to it
        if (this.tabManager.tabs.has(tabID)) {
            this.tabManager.switchTab(tabID);
            return;
        }

        // Create the tab
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.id = tabID;
        tab.dataset.name = instanceName;
        tab.dataset.type = 'topo';
        tab.innerHTML =
            '<span class="tab-type topo">TOPO</span> ' +
            '<span class="tab-name">' + this.tabManager._escapeHTML(instanceName) + '</span>' +
            ' <span class="tab-close">\u2715</span>';

        tab.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-close')) return;
            this.tabManager.switchTab(tabID);
        });
        tab.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.tabManager.closeTab(tabID);
        });

        const addBtn = this.tabManager.tabBar.querySelector('.tab-add');
        if (addBtn) {
            this.tabManager.tabBar.insertBefore(tab, addBtn);
        } else {
            this.tabManager.tabBar.appendChild(tab);
        }

        // Create the panel
        const panel = document.createElement('div');
        panel.id = 'panel-' + tabID;
        panel.className = 'panel topo-panel';
        this.tabManager.panels.appendChild(panel);

        this.tabManager.tabs.set(tabID, {
            type: 'topo',
            name: instanceName,
            instanceID: instanceID,
            sessionID: tabID,
            element: tab,
            panel: panel
        });

        this.tabManager.switchTab(tabID);

        // Initialize the topology renderer
        new TopologyRenderer(panel.id, instanceID);
    }

    // -- Instance Details Modal -----------------------------------------------

    _showInstanceDetails(tabID) {
        const modal = document.getElementById('detailsModal');
        if (!modal) return;
        const body = modal.querySelector('.details-body');
        if (!body) return;

        const tabInfo = this.tabManager.tabs.get(tabID);
        const instanceID = (tabInfo && tabInfo.instanceID) || tabID;

        body.innerHTML = '<div style="text-align:center;color:var(--dim);padding:40px;">Loading instance details...</div>';
        modal.classList.add('show');

        const inst = this.sidebar.getInstance(instanceID);

        fetch('/instance-details?id=' + encodeURIComponent(instanceID))
            .then(r => r.json())
            .then(d => {
                if (d.error) throw new Error(d.error);
                this._renderInstanceDetails(body, d, inst);
            })
            .catch(err => {
                if (inst) {
                    this._renderBasicInstanceDetails(body, inst);
                } else {
                    body.innerHTML = '<div style="color:var(--red);padding:20px;">Failed: ' + err.message + '</div>';
                }
            });
    }

    _renderBasicInstanceDetails(body, inst) {
        const esc = (s) => { const d = document.createElement('div'); d.textContent = s || '\u2014'; return d.innerHTML; };
        const row = (label, val) => '<div class="det-row"><span class="det-label">' + label + '</span><span class="det-val">' + esc(val) + '</span></div>';
        body.innerHTML =
            '<div class="det-section">Instance</div>' +
            row('Name', inst.name) + row('Instance ID', inst.instance_id) + row('State', inst.state) +
            row('Platform', inst.platform) + row('Instance Type', inst.instance_type) +
            row('Private IP', inst.private_ip) + row('Public IP', inst.public_ip) +
            row('Region', inst.aws_region) + row('Account', inst.account_id);
    }

    _renderInstanceDetails(body, d, fallback) {
        const esc = (s) => { const el = document.createElement('div'); el.textContent = s || '\u2014'; return el.innerHTML; };
        const row = (label, val) => '<div class="det-row"><span class="det-label">' + label + '</span><span class="det-val">' + esc(val) + '</span></div>';
        const section = (title) => '<div class="det-section">' + title + '</div>';
        const formatPort = (proto, from, to) => {
            if (proto === '-1') return 'All traffic';
            const p = proto === '6' ? 'TCP' : proto === '17' ? 'UDP' : proto === '1' ? 'ICMP' : proto.toUpperCase();
            if (from === to) return p + ':' + from;
            if (from === 0 && to === 65535) return p + ':All';
            return p + ':' + from + '-' + to;
        };

        let html = section('Instance');
        html += '<div class="det-columns">';
        html += row('Name', d.name) + row('Instance ID', d.instance_id);
        html += row('State', d.state) + row('Instance Type', d.instance_type);
        html += row('Platform', d.platform + ' / ' + d.os) + row('Architecture', d.architecture);
        html += row('AMI ID', d.ami_id) + row('Key Pair', d.key_name);
        html += row('IAM Profile', d.instance_profile) + row('Launch Time', d.launch_time);
        html += row('Virtualization', d.virtualization_type) + row('Hypervisor', d.hypervisor);
        html += row('EBS Optimized', d.ebs_optimized ? 'Yes' : 'No') + row('ENA Support', d.ena_support ? 'Yes' : 'No');
        html += row('Monitoring', d.monitoring) + row('Source/Dest Check', d.source_dest_check ? 'Yes' : 'No');
        html += '</div>';

        html += section('Network');
        html += '<div class="det-columns">';
        html += row('VPC ID', d.vpc_id) + row('Subnet ID', d.subnet_id);
        html += row('Availability Zone', d.availability_zone) + row('Tenancy', d.tenancy);
        html += row('Private IP', d.private_ip) + row('Public IP', d.public_ip);
        html += row('Private DNS', d.private_dns) + row('Public DNS', d.public_dns);
        html += row('Account ID', d.account_id) + row('Region', d.aws_region);
        html += '</div>';

        if (d.network_interfaces && d.network_interfaces.length > 0) {
            html += section('Network Interfaces');
            for (const ni of d.network_interfaces) {
                html += '<div class="det-columns">';
                html += row('ENI ID', ni.interface_id) + row('Subnet', ni.subnet_id);
                html += row('Private IP', ni.private_ip) + row('Public IP', ni.public_ip);
                html += row('MAC', ni.mac_address) + row('Status', ni.status);
                html += '</div>';
            }
        }

        if (d.block_devices && d.block_devices.length > 0) {
            html += section('Storage (EBS Volumes)');
            for (const vol of d.block_devices) {
                html += '<div class="vol-card">';
                html += '<div><span class="vol-label">Device</span><br><span>' + esc(vol.device_name) + '</span></div>';
                html += '<div><span class="vol-label">Size / Type</span><br><span>' + (vol.volume_size || '?') + ' GB ' + esc(vol.volume_type) + '</span></div>';
                html += '<div><span class="vol-label">IOPS</span><br><span>' + (vol.iops || '\u2014') + '</span></div>';
                html += '<div><span class="vol-label">Encrypted / KMS</span><br><span>' +
                    (vol.encrypted ? 'Yes' : 'No') +
                    (vol.kms_key_id ? '<br><span style="font-size:9px;color:var(--dim);word-break:break-all;">' + esc(vol.kms_key_id) + '</span>' : '') +
                    '</span></div>';
                html += '</div>';
            }
        }

        if (d.security_group_details && d.security_group_details.length > 0) {
            html += section('Security Groups');
            for (const sg of d.security_group_details) {
                html += '<div class="sg-card">';
                html += '<div class="sg-card-title">' + esc(sg.group_name) + '</div>';
                html += '<div class="sg-card-id">' + esc(sg.group_id) + '</div>';
                if (sg.description) html += '<div class="sg-card-desc">' + esc(sg.description) + '</div>';

                html += '<div class="sg-rules-columns">';

                html += '<div>';
                html += '<div class="sg-rules-label">Inbound Rules</div>';
                if (sg.inbound_rules && sg.inbound_rules.length > 0) {
                    for (const rule of sg.inbound_rules) {
                        html += '<div class="sg-rule-row">';
                        html += '<span class="sg-rule-proto">' + formatPort(rule.protocol, rule.from_port, rule.to_port) + '</span>';
                        html += '<span class="sg-rule-source">' + esc(rule.source) + '</span>';
                        html += '<span class="sg-rule-desc">' + esc(rule.description) + '</span>';
                        html += '</div>';
                    }
                } else {
                    html += '<div style="font-size:11px;color:var(--dim);padding:4px 0;">None</div>';
                }
                html += '</div>';

                html += '<div>';
                html += '<div class="sg-rules-label">Outbound Rules</div>';
                if (sg.outbound_rules && sg.outbound_rules.length > 0) {
                    for (const rule of sg.outbound_rules) {
                        html += '<div class="sg-rule-row">';
                        html += '<span class="sg-rule-proto">' + formatPort(rule.protocol, rule.from_port, rule.to_port) + '</span>';
                        html += '<span class="sg-rule-source">' + esc(rule.source) + '</span>';
                        html += '<span class="sg-rule-desc">' + esc(rule.description) + '</span>';
                        html += '</div>';
                    }
                } else {
                    html += '<div style="font-size:11px;color:var(--dim);padding:4px 0;">None</div>';
                }
                html += '</div>';

                html += '</div>';
                html += '</div>';
            }
        }

        if (d.tags && typeof d.tags === 'object') {
            const tagKeys = Object.keys(d.tags).sort();
            if (tagKeys.length > 0) {
                html += section('Tags (' + tagKeys.length + ')');
                html += '<div class="det-columns">';
                for (const k of tagKeys) {
                    html += row(k, d.tags[k]);
                }
                html += '</div>';
            }
        }

        html += section('Quick Metrics');
        html += '<button id="metricsLoadBtn" style="padding:6px 16px;background:var(--s3);border:1px solid var(--b1);border-radius:5px;color:var(--muted);font-size:10px;cursor:pointer;">Load Metrics</button>';
        html += '<div id="metricsContainer" style="margin-top:10px;display:none;"></div>';

        body.innerHTML = html;
        document.getElementById('metricsLoadBtn')?.addEventListener('click', () => this._loadInstanceMetrics(d.instance_id));
    }

    _setupDetailsModal() {
        const modal = document.getElementById('detailsModal');
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('show');
        });
    }

    // -- File Transfer Modals ------------------------------------------------

    _showUploadModal(instanceID, instanceName) {
        const modal = document.getElementById('uploadModal');
        if (!modal) return;

        const target = document.getElementById('uploadTarget');
        if (target) target.textContent = instanceName + ' (' + instanceID + ')';

        // Reset state.
        const fileInput = document.getElementById('uploadFileInput');
        const fileNameEl = document.getElementById('uploadFileName');
        const remotePathEl = document.getElementById('uploadRemotePath');
        const uploadBtn = document.getElementById('uploadBtn');
        const dropZone = document.getElementById('uploadDropZone');

        if (fileInput) fileInput.value = '';
        if (fileNameEl) { fileNameEl.style.display = 'none'; fileNameEl.textContent = ''; }
        if (remotePathEl) remotePathEl.value = '';
        if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = 'Upload'; }

        this._uploadFile = null;
        this._uploadInstanceID = instanceID;
        const inst = this.sidebar.getInstance(instanceID);
        this._uploadPlatform = inst ? (inst.platform || 'linux') : 'linux';

        // Adjust placeholder based on platform.
        if (remotePathEl) {
            remotePathEl.placeholder = this._uploadPlatform === 'windows'
                ? 'Remote path (e.g. C:\\Windows\\Temp\\myfile.txt)'
                : 'Remote path (e.g. /tmp/myfile.txt)';
        }

        // Wire up drop zone + file input (clone to remove old listeners).
        if (dropZone) {
            const newDrop = dropZone.cloneNode(true);
            dropZone.parentNode.replaceChild(newDrop, dropZone);
            const newFileInput = newDrop.querySelector('#uploadFileInput');

            newDrop.addEventListener('click', () => newFileInput && newFileInput.click());
            newDrop.addEventListener('dragover', (e) => { e.preventDefault(); newDrop.style.borderColor = 'var(--ssh)'; });
            newDrop.addEventListener('dragleave', () => { newDrop.style.borderColor = 'var(--b2)'; });
            newDrop.addEventListener('drop', (e) => {
                e.preventDefault();
                newDrop.style.borderColor = 'var(--b2)';
                if (e.dataTransfer.files.length > 0) this._setUploadFile(e.dataTransfer.files[0]);
            });
            if (newFileInput) {
                newFileInput.addEventListener('change', () => {
                    if (newFileInput.files.length > 0) this._setUploadFile(newFileInput.files[0]);
                });
            }
        }

        // Wire up upload button (clone to remove old listeners).
        if (uploadBtn) {
            const newBtn = uploadBtn.cloneNode(true);
            uploadBtn.parentNode.replaceChild(newBtn, uploadBtn);
            newBtn.addEventListener('click', () => this._doUpload());
        }

        modal.classList.add('show');
    }

    _setUploadFile(file) {
        this._uploadFile = file;
        const fileNameEl = document.getElementById('uploadFileName');
        const remotePathEl = document.getElementById('uploadRemotePath');
        const uploadBtn = document.getElementById('uploadBtn');

        if (fileNameEl) {
            fileNameEl.textContent = file.name + ' (' + this._formatSize(file.size) + ')';
            fileNameEl.style.display = '';
        }
        if (remotePathEl) {
            const cur = remotePathEl.value;
            if (!cur) {
                remotePathEl.value = this._uploadPlatform === 'windows'
                    ? 'C:\\Windows\\Temp\\' + file.name
                    : '/tmp/' + file.name;
            } else if (cur.endsWith('/') || cur.endsWith('\\')) {
                remotePathEl.value = cur + file.name;
            }
        }
        if (uploadBtn) uploadBtn.disabled = false;
    }

    async _doUpload() {
        const file = this._uploadFile;
        const instanceID = this._uploadInstanceID;
        if (!file || !instanceID) return;

        const remotePath = (document.getElementById('uploadRemotePath') || {}).value;
        if (!remotePath) { showToast('Remote path is required'); return; }

        const inst = this.sidebar.getInstance(instanceID);

        // Close modals immediately and add to transfer panel.
        document.getElementById('uploadModal')?.classList.remove('show');
        document.getElementById('fileBrowserModal')?.classList.remove('show');
        const tid = this.transfers.add('upload', file.name);

        const form = new FormData();
        form.append('file', file);
        form.append('instance_id', instanceID);
        form.append('remote_path', remotePath);
        form.append('platform', inst ? (inst.platform || 'linux') : 'linux');
        if (inst) {
            form.append('aws_profile', inst.aws_profile || '');
            form.append('aws_region', inst.aws_region || '');
        }

        try {
            const resp = await fetch('/upload-file', { method: 'POST', body: form });
            await this._readNDJSON(resp, (msg) => {
                if (msg.status === 'error') {
                    this.transfers.update(tid, msg.progress || 100, msg.message, 'error');
                    showToast('Upload failed: ' + msg.message, 5000);
                } else if (msg.status === 'complete') {
                    this.transfers.update(tid, 100, 'Complete', 'complete');
                    showToast('Upload complete: ' + remotePath);
                } else {
                    this.transfers.update(tid, msg.progress || 0, msg.message || '', 'active');
                }
            });
        } catch (e) {
            this.transfers.update(tid, 0, e.message, 'error');
            showToast('Upload failed: ' + e.message, 5000);
        }
    }

    _showDownloadModal(instanceID, instanceName) {
        const modal = document.getElementById('downloadModal');
        if (!modal) return;

        const target = document.getElementById('downloadTarget');
        if (target) target.textContent = instanceName + ' (' + instanceID + ')';

        const remotePathEl = document.getElementById('downloadRemotePath');
        const downloadBtn = document.getElementById('downloadBtn');

        if (remotePathEl) remotePathEl.value = '';
        if (downloadBtn) downloadBtn.textContent = 'Download';

        this._downloadInstanceID = instanceID;
        const inst = this.sidebar.getInstance(instanceID);
        this._downloadPlatform = inst ? (inst.platform || 'linux') : 'linux';

        // Adjust placeholder based on platform.
        if (remotePathEl) {
            remotePathEl.placeholder = this._downloadPlatform === 'windows'
                ? 'Remote file path (e.g. C:\\Users\\Administrator\\file.txt)'
                : 'Remote file path (e.g. /var/log/syslog)';
        }

        // Wire up download button (clone to remove old listeners).
        if (downloadBtn) {
            const newBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);
            newBtn.addEventListener('click', () => this._doDownload());
        }

        modal.classList.add('show');
    }

    async _doDownload() {
        const instanceID = this._downloadInstanceID;
        if (!instanceID) return;

        const remotePath = (document.getElementById('downloadRemotePath') || {}).value;
        if (!remotePath) { showToast('Remote path is required'); return; }

        const inst = this.sidebar.getInstance(instanceID);

        // Close modals immediately and add to transfer panel.
        document.getElementById('downloadModal')?.classList.remove('show');
        document.getElementById('fileBrowserModal')?.classList.remove('show');
        const filename = remotePath.split('/').pop().split('\\').pop() || 'download';
        const tid = this.transfers.add('download', filename);

        try {
            const resp = await fetch('/download-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instance_id: instanceID,
                    remote_path: remotePath,
                    aws_profile: inst ? (inst.aws_profile || '') : '',
                    aws_region: inst ? (inst.aws_region || '') : '',
                    platform: inst ? (inst.platform || 'linux') : 'linux'
                })
            });

            await this._readNDJSON(resp, (msg) => {
                if (msg.status === 'error') {
                    this.transfers.update(tid, msg.progress || 100, msg.message, 'error');
                    showToast('Download failed: ' + msg.message, 5000);
                } else if (msg.status === 'complete' && msg.data) {
                    const raw = atob(msg.data);
                    const bytes = new Uint8Array(raw.length);
                    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                    const blob = new Blob([bytes]);
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = msg.filename || filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(a.href);
                    this.transfers.update(tid, 100, 'Complete', 'complete');
                    showToast('Downloaded: ' + (msg.filename || remotePath));
                } else {
                    this.transfers.update(tid, msg.progress || 0, msg.message || '', 'active');
                }
            });
        } catch (e) {
            this.transfers.update(tid, 0, e.message, 'error');
            showToast('Download failed: ' + e.message, 5000);
        }
    }

    // -- Express File Transfer (S3) -------------------------------------------

    _showExpressUploadModal(instanceID, instanceName) {
        const modal = document.getElementById('expressUploadModal');
        if (!modal) return;

        const target = document.getElementById('expressUploadTarget');
        if (target) target.textContent = instanceName + ' (' + instanceID + ')';

        const fileInput = document.getElementById('expressUploadFileInput');
        const fileNameEl = document.getElementById('expressUploadFileName');
        const remotePathEl = document.getElementById('expressUploadRemotePath');
        const uploadBtn = document.getElementById('expressUploadBtn');
        const dropZone = document.getElementById('expressUploadDropZone');

        if (fileInput) fileInput.value = '';
        if (fileNameEl) { fileNameEl.style.display = 'none'; fileNameEl.textContent = ''; }
        if (remotePathEl) remotePathEl.value = '';
        if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = '\u26A1 Express Upload'; }

        this._expressUploadFile = null;
        this._expressUploadInstanceID = instanceID;
        const inst = this.sidebar.getInstance(instanceID);
        this._expressUploadPlatform = inst ? (inst.platform || 'linux') : 'linux';

        if (remotePathEl) {
            remotePathEl.placeholder = this._expressUploadPlatform === 'windows'
                ? 'Remote path (e.g. C:\\Windows\\Temp\\myfile.txt)'
                : 'Remote path (e.g. /tmp/myfile.txt)';
        }

        if (dropZone) {
            const newDrop = dropZone.cloneNode(true);
            dropZone.parentNode.replaceChild(newDrop, dropZone);
            const newFileInput = newDrop.querySelector('#expressUploadFileInput');

            newDrop.addEventListener('click', () => newFileInput && newFileInput.click());
            newDrop.addEventListener('dragover', (e) => { e.preventDefault(); newDrop.style.borderColor = 'var(--orange)'; });
            newDrop.addEventListener('dragleave', () => { newDrop.style.borderColor = 'var(--b2)'; });
            newDrop.addEventListener('drop', (e) => {
                e.preventDefault();
                newDrop.style.borderColor = 'var(--b2)';
                if (e.dataTransfer.files.length > 0) this._setExpressUploadFile(e.dataTransfer.files[0]);
            });
            if (newFileInput) {
                newFileInput.addEventListener('change', () => {
                    if (newFileInput.files.length > 0) this._setExpressUploadFile(newFileInput.files[0]);
                });
            }
        }

        if (uploadBtn) {
            const newBtn = uploadBtn.cloneNode(true);
            uploadBtn.parentNode.replaceChild(newBtn, uploadBtn);
            newBtn.addEventListener('click', () => this._doExpressUpload());
        }

        modal.classList.add('show');
    }

    _setExpressUploadFile(file) {
        this._expressUploadFile = file;
        const fileNameEl = document.getElementById('expressUploadFileName');
        const remotePathEl = document.getElementById('expressUploadRemotePath');
        const uploadBtn = document.getElementById('expressUploadBtn');

        if (fileNameEl) {
            fileNameEl.textContent = file.name + ' (' + this._formatSize(file.size) + ')';
            fileNameEl.style.display = '';
        }
        if (remotePathEl) {
            const cur = remotePathEl.value;
            if (!cur) {
                remotePathEl.value = this._expressUploadPlatform === 'windows'
                    ? 'C:\\Windows\\Temp\\' + file.name
                    : '/tmp/' + file.name;
            } else if (cur.endsWith('/') || cur.endsWith('\\')) {
                remotePathEl.value = cur + file.name;
            }
        }
        if (uploadBtn) uploadBtn.disabled = false;
    }

    async _doExpressUpload() {
        const file = this._expressUploadFile;
        const instanceID = this._expressUploadInstanceID;
        if (!file || !instanceID) return;

        const remotePath = (document.getElementById('expressUploadRemotePath') || {}).value;
        if (!remotePath) { showToast('Remote path is required'); return; }

        const bucket = this.settings.get('s3_bucket');
        if (!bucket) { showToast('Configure S3 bucket in Settings first'); return; }

        const inst = this.sidebar.getInstance(instanceID);

        document.getElementById('expressUploadModal')?.classList.remove('show');
        document.getElementById('fileBrowserModal')?.classList.remove('show');
        const tid = this.transfers.add('upload', '\u26A1 ' + file.name);

        const form = new FormData();
        form.append('file', file);
        form.append('instance_id', instanceID);
        form.append('remote_path', remotePath);
        form.append('s3_bucket', bucket);
        form.append('platform', inst ? (inst.platform || 'linux') : 'linux');
        if (inst) {
            form.append('aws_profile', inst.aws_profile || '');
            form.append('aws_region', inst.aws_region || '');
        }

        try {
            const resp = await fetch('/express-upload', { method: 'POST', body: form });
            await this._readNDJSON(resp, (msg) => {
                if (msg.status === 'error') {
                    this.transfers.update(tid, msg.progress || 100, msg.message, 'error');
                    showToast('Express upload failed: ' + msg.message, 5000);
                } else if (msg.status === 'complete') {
                    this.transfers.update(tid, 100, 'Complete', 'complete');
                    showToast('Express upload complete: ' + remotePath);
                } else {
                    this.transfers.update(tid, msg.progress || 0, msg.message || '', 'active');
                }
            });
        } catch (e) {
            this.transfers.update(tid, 0, e.message, 'error');
            showToast('Express upload failed: ' + e.message, 5000);
        }
    }

    _showExpressDownloadModal(instanceID, instanceName) {
        const modal = document.getElementById('expressDownloadModal');
        if (!modal) return;

        const target = document.getElementById('expressDownloadTarget');
        if (target) target.textContent = instanceName + ' (' + instanceID + ')';

        const remotePathEl = document.getElementById('expressDownloadRemotePath');
        const downloadBtn = document.getElementById('expressDownloadBtn');

        if (remotePathEl) remotePathEl.value = '';
        if (downloadBtn) downloadBtn.textContent = '\u26A1 Express Download';

        this._expressDownloadInstanceID = instanceID;
        const inst = this.sidebar.getInstance(instanceID);
        this._expressDownloadPlatform = inst ? (inst.platform || 'linux') : 'linux';

        if (remotePathEl) {
            remotePathEl.placeholder = this._expressDownloadPlatform === 'windows'
                ? 'Remote file path (e.g. C:\\Users\\Administrator\\file.txt)'
                : 'Remote file path (e.g. /var/log/syslog)';
        }

        if (downloadBtn) {
            const newBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);
            newBtn.addEventListener('click', () => this._doExpressDownload());
        }

        modal.classList.add('show');
    }

    async _doExpressDownload() {
        const instanceID = this._expressDownloadInstanceID;
        if (!instanceID) return;

        const remotePath = (document.getElementById('expressDownloadRemotePath') || {}).value;
        if (!remotePath) { showToast('Remote path is required'); return; }

        const bucket = this.settings.get('s3_bucket');
        if (!bucket) { showToast('Configure S3 bucket in Settings first'); return; }

        const inst = this.sidebar.getInstance(instanceID);

        document.getElementById('expressDownloadModal')?.classList.remove('show');
        document.getElementById('fileBrowserModal')?.classList.remove('show');
        const filename = remotePath.split('/').pop().split('\\').pop() || 'download';
        const tid = this.transfers.add('download', '\u26A1 ' + filename);

        try {
            const resp = await fetch('/express-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instance_id: instanceID,
                    remote_path: remotePath,
                    s3_bucket: bucket,
                    aws_profile: inst ? (inst.aws_profile || '') : '',
                    aws_region: inst ? (inst.aws_region || '') : '',
                    platform: inst ? (inst.platform || 'linux') : 'linux'
                })
            });

            await this._readNDJSON(resp, (msg) => {
                if (msg.status === 'error') {
                    this.transfers.update(tid, msg.progress || 100, msg.message, 'error');
                    showToast('Express download failed: ' + msg.message, 5000);
                } else if (msg.status === 'complete' && msg.data) {
                    const raw = atob(msg.data);
                    const bytes = new Uint8Array(raw.length);
                    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                    const blob = new Blob([bytes]);
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = msg.filename || filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(a.href);
                    this.transfers.update(tid, 100, 'Complete', 'complete');
                    showToast('Express downloaded: ' + (msg.filename || remotePath));
                } else {
                    this.transfers.update(tid, msg.progress || 0, msg.message || '', 'active');
                }
            });
        } catch (e) {
            this.transfers.update(tid, 0, e.message, 'error');
            showToast('Express download failed: ' + e.message, 5000);
        }
    }

    // Read NDJSON stream from a fetch Response, calling onMessage for each parsed line.
    async _readNDJSON(resp, onMessage) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete last line in buffer
            for (const line of lines) {
                if (line.trim()) {
                    try { onMessage(JSON.parse(line)); } catch (e) { /* skip malformed */ }
                }
            }
        }
        // Process any remaining buffer.
        if (buffer.trim()) {
            try { onMessage(JSON.parse(buffer)); } catch (e) { /* skip */ }
        }
    }

    _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // -- Favorites ---------------------------------------------------------------

    _renderFavorites() {
        const container = document.getElementById('favoritesSection');
        if (!container) return;
        this.favorites.render(container,
            (id) => this.sidebar.getInstance(id),
            (e, id, name, type) => this.sidebar._showContextMenu(e, id, name, type)
        );
    }

    // -- Snippets ----------------------------------------------------------------

    _setupSnippetsButton() {
        const btn = document.getElementById('snippetsBtn');
        if (btn) btn.addEventListener('click', () => this._showSnippetsModal());

        // Settings modal
        document.getElementById('settingsBtn')?.addEventListener('click', () => {
            const modal = document.getElementById('settingsModal');
            const input = document.getElementById('settingsS3Bucket');
            if (input) input.value = this.settings.get('s3_bucket');
            const fontLabel = document.getElementById('settingsFontValue');
            if (fontLabel) fontLabel.textContent = this.appZoom + '%';
            const autoRec = document.getElementById('settingsAutoRecord');
            if (autoRec) autoRec.checked = this.settings.get('auto_record') === 'true';
            this._loadAWSAccounts();
            const envCheck = document.getElementById('settingsEnvColors');
            if (envCheck) envCheck.checked = this.envColorsEnabled;
            this._renderEnvColorList();
            this._populateAISettings();
            modal?.classList.add('show');
        });

        // Tab switching
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const pane = document.getElementById('settingsPane-' + tab.dataset.tab);
                if (pane) pane.classList.add('active');
                if (tab.dataset.tab === 'vault') this._loadVaultEntries();
                if (tab.dataset.tab === 'database') this._loadDBViewer('suggest');
            });
        });

        document.getElementById('settingsFontDec')?.addEventListener('click', () => {
            this._appZoom(-10);
            const fontLabel = document.getElementById('settingsFontValue');
            if (fontLabel) fontLabel.textContent = this.appZoom + '%';
        });
        document.getElementById('settingsFontInc')?.addEventListener('click', () => {
            this._appZoom(10);
            const fontLabel = document.getElementById('settingsFontValue');
            if (fontLabel) fontLabel.textContent = this.appZoom + '%';
        });
        // Env color add
        document.getElementById('envColorAddBtn')?.addEventListener('click', () => {
            const nameInput = document.getElementById('envColorName');
            const colorInput = document.getElementById('envColorPicker');
            const name = (nameInput?.value || '').trim().toLowerCase();
            if (!name) { showToast('Enter an environment name'); return; }
            this.envColorMap[name] = colorInput?.value || '#ef4444';
            nameInput.value = '';
            this._renderEnvColorList();
        });

        document.getElementById('settingsSaveBtn')?.addEventListener('click', () => {
            const input = document.getElementById('settingsS3Bucket');
            if (input) this.settings.set('s3_bucket', input.value.trim());
            const autoRec = document.getElementById('settingsAutoRecord');
            if (autoRec) this.settings.set('auto_record', autoRec.checked ? 'true' : 'false');
            const envCheck = document.getElementById('settingsEnvColors');
            this.envColorsEnabled = envCheck ? envCheck.checked : false;
            this.settings.set('env_colors_enabled', this.envColorsEnabled ? 'true' : 'false');
            this.settings.set('env_color_map', JSON.stringify(this.envColorMap));
            this._applyEnvColorsToAll();

            // Save AI settings
            this._aiPrefs = {
                provider: document.getElementById('aiProviderSelect')?.value || 'bedrock',
                model: document.getElementById('aiModel')?.value || '',
                bedrockRegion: document.getElementById('aiBedrockRegion')?.value || 'us-east-1',
                bedrockProfile: document.getElementById('aiBedrockProfile')?.value || 'dev',
                anthropicKey: document.getElementById('aiAnthropicKey')?.value || '',
                openaiKey: document.getElementById('aiOpenAIKey')?.value || '',
                geminiKey: document.getElementById('aiGeminiKey')?.value || '',
                ollamaUrl: document.getElementById('aiOllamaUrl')?.value || 'http://localhost:11434',
                maxTokens: parseInt(document.getElementById('aiMaxTokens')?.value, 10) || 4096
            };
            this._pushPreferencesToServer();

            document.getElementById('settingsModal')?.classList.remove('show');
            showToast('Settings saved');
        });

        // AI provider dropdown — show/hide relevant fields
        document.getElementById('aiProviderSelect')?.addEventListener('change', (e) => {
            this._updateAIProviderFields(e.target.value);
        });

        // AWS account add button
        document.getElementById('awsAcctAddBtn')?.addEventListener('click', () => this._addAWSAccount());

        document.getElementById('vaultRefreshBtn')?.addEventListener('click', () => this._loadVaultEntries());

        document.querySelectorAll('.db-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.db-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'none';
                    b.style.color = 'var(--muted)';
                });
                btn.classList.add('active');
                btn.style.background = 'var(--s2)';
                btn.style.color = 'var(--text)';
                this._loadDBViewer(btn.dataset.dbname);
            });
        });
    }

    _loadVaultEntries() {
        const list = document.getElementById('vaultEntryList');
        if (!list) return;
        list.innerHTML = '<div style="color:var(--dim);font-size:11px;padding:12px;text-align:center;">Loading...</div>';
        fetch('/vault/credentials').then(r => r.json()).then(entries => {
            if (!entries || entries.length === 0) {
                list.innerHTML = '<div style="color:var(--dim);font-size:11px;padding:16px;text-align:center;">' +
                    '\uD83D\uDD12 No saved credentials.<br><span style="font-size:10px;color:var(--dim);">Save credentials via the RDP connection modal using the "Save to Vault" checkbox.</span></div>';
                return;
            }
            var typeBadgeColors = { instance: 'var(--rdp)', pattern: 'var(--orange)', environment: 'var(--ssh)', account: 'var(--purple)', global: 'var(--muted)' };
            var html = '';
            for (var e of entries) {
                var badgeColor = typeBadgeColors[e.rule.type] || 'var(--dim)';
                html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;margin-bottom:6px;">';
                html += '<div style="flex-shrink:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--s2);border-radius:7px;font-size:16px;">\uD83D\uDD12</div>';
                html += '<div style="flex:1;min-width:0;">';
                html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">';
                html += '<span style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (e.rule.label || e.rule.type) + '</span>';
                html += '<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:' + badgeColor + ';color:var(--bg);font-weight:600;text-transform:uppercase;white-space:nowrap;">' + e.rule.type + '</span>';
                html += '</div>';
                html += '<div style="font-size:10px;color:var(--dim);font-family:\'JetBrains Mono\',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + e.rule.value + '</div>';
                html += '<div style="font-size:10px;color:var(--muted);margin-top:1px;">' + e.credential.username + ' \u2022 Security: ' + e.credential.security + '</div>';
                html += '</div>';
                html += '<button onclick="window._editVaultEntry(\'' + e.rule.id + '\')" title="Edit password" style="flex-shrink:0;width:32px;height:32px;background:linear-gradient(135deg,rgba(96,165,250,.15),rgba(108,92,231,.1));border:1px solid rgba(96,165,250,.3);border-radius:7px;color:#60a5fa;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;" onmouseover="this.style.background=\'linear-gradient(135deg,rgba(96,165,250,.25),rgba(108,92,231,.2))\'" onmouseout="this.style.background=\'linear-gradient(135deg,rgba(96,165,250,.15),rgba(108,92,231,.1))\'"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>';
                html += '<button onclick="window._deleteVaultEntry(\'' + e.rule.id + '\')" title="Delete" style="flex-shrink:0;width:32px;height:32px;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);border-radius:7px;color:var(--red);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;" onmouseover="this.style.background=\'rgba(248,113,113,.2)\'" onmouseout="this.style.background=\'rgba(248,113,113,.1)\'"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
                html += '</div>';
            }
            list.innerHTML = html;
        }).catch(() => {
            list.innerHTML = '<div style="color:var(--red);font-size:11px;padding:12px;text-align:center;">Failed to load vault entries.</div>';
        });
    }

    _loadDBViewer(dbName) {
        var container = document.getElementById('dbViewerContent');
        if (!container) return;
        container.innerHTML = '<div style="color:var(--dim);font-size:11px;padding:12px;text-align:center;">Loading ' + dbName + '.db...</div>';
        fetch('/db-viewer?db=' + encodeURIComponent(dbName))
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.buckets || data.buckets.length === 0) {
                    container.innerHTML = '<div style="color:var(--dim);font-size:11px;padding:16px;text-align:center;">Database is empty or does not exist yet.</div>';
                    return;
                }
                var html = '<div style="font-size:10px;color:var(--dim);margin-bottom:12px;">File: <code style="color:var(--muted);">' + data.file + '</code></div>';
                for (var b of data.buckets) {
                    html += '<div style="margin-bottom:16px;">';
                    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
                    html += '<span style="font-size:13px;font-weight:600;color:var(--text);">' + b.name + '</span>';
                    html += '<span style="font-size:10px;padding:2px 8px;background:var(--s3);border-radius:10px;color:var(--muted);">' + b.count + ' entries</span>';
                    html += '</div>';
                    if (b.entries && b.entries.length > 0) {
                        for (var e of b.entries) {
                            html += '<div style="margin-bottom:4px;background:var(--s2);border:1px solid var(--b1);border-radius:8px;overflow:hidden;">';
                            html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:var(--s3);border-bottom:1px solid var(--b1);">';
                            html += '<span style="font-size:11px;font-weight:600;color:var(--text);font-family:\'JetBrains Mono\',monospace;">' + e.key + '</span>';
                            html += '<span style="font-size:9px;color:' + (e.encrypted ? 'var(--red)' : 'var(--ssh)') + ';">' + (e.encrypted ? 'encrypted' : 'decrypted') + '</span>';
                            html += '</div>';
                            var val = e.value;
                            try { val = JSON.stringify(JSON.parse(e.value), null, 2); } catch(ex) {}
                            html += '<pre style="margin:0;padding:8px 12px;font-size:10px;color:var(--muted);font-family:\'JetBrains Mono\',monospace;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;">' + val.replace(/</g, '&lt;') + '</pre>';
                            html += '</div>';
                        }
                    } else {
                        html += '<div style="font-size:11px;color:var(--dim);padding:4px 0;">Select bucket to view entries — <a href="#" onclick="event.preventDefault();window.cloudterm._loadDBViewerBucket(\'' + dbName + '\',\'' + b.name + '\')" style="color:var(--ssh);">Load entries</a></div>';
                    }
                    html += '</div>';
                }
                container.innerHTML = html;
            })
            .catch(function(err) {
                container.innerHTML = '<div style="color:var(--red);font-size:11px;padding:12px;">Failed to load: ' + err.message + '</div>';
            });
    }

    _loadDBViewerBucket(dbName, bucket) {
        var container = document.getElementById('dbViewerContent');
        if (!container) return;
        container.innerHTML = '<div style="color:var(--dim);font-size:11px;padding:12px;text-align:center;">Loading ' + bucket + '...</div>';
        fetch('/db-viewer?db=' + encodeURIComponent(dbName) + '&bucket=' + encodeURIComponent(bucket))
            .then(function(r) { return r.json(); })
            .then(function(data) { window.cloudterm._loadDBViewer(dbName); })
            .catch(function() { window.cloudterm._loadDBViewer(dbName); });
    }

    _updateAIProviderFields(provider) {
        const fields = ['aiBedrockFields', 'aiAnthropicFields', 'aiOpenAIFields', 'aiGeminiFields', 'aiOllamaFields'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const hints = {
            bedrock: 'e.g. us.anthropic.claude-opus-4-6-v1',
            anthropic: 'e.g. claude-sonnet-4-20250514',
            openai: 'e.g. gpt-4o',
            gemini: 'e.g. gemini-2.0-flash',
            ollama: 'e.g. llama3.1'
        };
        const map = { bedrock: 'aiBedrockFields', anthropic: 'aiAnthropicFields', openai: 'aiOpenAIFields', gemini: 'aiGeminiFields', ollama: 'aiOllamaFields' };
        if (map[provider]) {
            const el = document.getElementById(map[provider]);
            if (el) el.style.display = '';
        }
        const hint = document.getElementById('aiModelHint');
        if (hint) hint.textContent = hints[provider] || '';
    }

    _populateAISettings() {
        const ai = this._aiPrefs || {};
        const sel = document.getElementById('aiProviderSelect');
        if (sel) sel.value = ai.provider || 'bedrock';
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        set('aiModel', ai.model);
        set('aiBedrockRegion', ai.bedrockRegion || 'us-east-1');
        set('aiBedrockProfile', ai.bedrockProfile || 'dev');
        set('aiAnthropicKey', ai.anthropicKey);
        set('aiOpenAIKey', ai.openaiKey);
        set('aiGeminiKey', ai.geminiKey);
        set('aiOllamaUrl', ai.ollamaUrl || 'http://localhost:11434');
        set('aiMaxTokens', ai.maxTokens || 4096);
        this._updateAIProviderFields(ai.provider || 'bedrock');
    }

    _renderEnvColorList() {
        const list = document.getElementById('envColorList');
        if (!list) return;
        let html = '';
        for (const [name, color] of Object.entries(this.envColorMap)) {
            html += '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="width:14px;height:14px;border-radius:3px;background:' + color + ';flex-shrink:0;"></span>' +
                '<span style="flex:1;font-size:12px;color:var(--text);">' + name + '</span>' +
                '<button class="env-color-del" data-env="' + name + '" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;">&times;</button>' +
                '</div>';
        }
        list.innerHTML = html;
        list.querySelectorAll('.env-color-del').forEach(btn => {
            btn.addEventListener('click', () => {
                delete this.envColorMap[btn.dataset.env];
                this._renderEnvColorList();
            });
        });
    }

    _getEnvColor(instanceID) {
        if (!this.envColorsEnabled || !instanceID) return null;
        const inst = this.sidebar?._instanceData?.[instanceID];
        if (!inst) return null;
        const env = (inst.tag2_value || '').toLowerCase();
        return this.envColorMap[env] || null;
    }

    _applyEnvColorsToAll() {
        for (const [sessionID, entry] of this.termManager.terminals) {
            const color = this._getEnvColor(entry.instanceID);
            const panel = document.querySelector('.panel[data-id="' + sessionID + '"]');
            if (panel) {
                panel.style.borderLeft = color ? '3px solid ' + color : '';
            }
        }
    }

    // -- AWS Accounts Management -----------------------------------------------

    _esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async _loadAWSAccounts() {
        const list = document.getElementById('awsAccountsList');
        if (!list) return;
        try {
            const res = await fetch('/aws-accounts');
            const accounts = await res.json();
            if (!accounts || accounts.length === 0) {
                list.innerHTML = '<div style="text-align:center;color:var(--dim);padding:12px;font-size:11px;">No accounts added yet</div>';
                return;
            }
            list.innerHTML = accounts.map(a => `
                <div class="aws-acct-row" data-id="${a.id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;margin-bottom:6px;">
                    <div style="flex-shrink:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--s2);border-radius:7px;font-size:14px;">&#x2601;</div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                            <span style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._esc(a.name || 'Unnamed')}</span>
                        </div>
                        <div style="font-size:10px;color:var(--dim);font-family:'JetBrains Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._esc(a.access_key_id)} &middot; ${this._esc(a.secret_access_key)}</div>
                    </div>
                    <button class="aws-acct-btn scan" onclick="cloudterm._scanAWSAccount('${a.id}', this)" title="Scan instances">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    </button>
                    <button class="aws-acct-btn del" onclick="cloudterm._deleteAWSAccount('${a.id}')" title="Remove account">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            `).join('');
        } catch (e) {
            list.innerHTML = '<div style="color:var(--red);padding:8px;font-size:11px;">Failed to load accounts</div>';
        }
    }

    async _addAWSAccount() {
        const name = document.getElementById('awsAcctName')?.value.trim() || '';
        const accessKey = document.getElementById('awsAcctAccessKey')?.value.trim();
        const secretKey = document.getElementById('awsAcctSecretKey')?.value.trim();
        const sessionToken = document.getElementById('awsAcctSessionToken')?.value.trim() || '';

        if (!accessKey || !secretKey) {
            showToast('Access Key ID and Secret Access Key are required');
            return;
        }

        try {
            const res = await fetch('/aws-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, access_key_id: accessKey, secret_access_key: secretKey, session_token: sessionToken })
            });
            if (!res.ok) {
                const err = await res.json();
                showToast(err.error || 'Failed to add account');
                return;
            }
            showToast('Account added');
            document.getElementById('awsAcctName').value = '';
            document.getElementById('awsAcctAccessKey').value = '';
            document.getElementById('awsAcctSecretKey').value = '';
            document.getElementById('awsAcctSessionToken').value = '';
            this._loadAWSAccounts();
        } catch (e) {
            showToast('Failed to add account');
        }
    }

    async _deleteAWSAccount(id) {
        try {
            const res = await fetch('/aws-accounts/' + id, { method: 'DELETE' });
            if (!res.ok) {
                showToast('Failed to remove account');
                return;
            }
            showToast('Account removed');
            this._loadAWSAccounts();
            this._loadInstances();
        } catch (e) {
            showToast('Failed to remove account');
        }
    }

    async _scanAWSAccount(id, btn) {
        var scanSvg = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="animation:spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
        }
        try {
            const res = await fetch('/aws-accounts/scan/' + id, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                showToast(data.error || 'Scan failed');
                return;
            }
            showToast(`Found ${data.instances_found} instances for ${data.account_name}`);
            this._loadInstances();
        } catch (e) {
            showToast('Scan failed');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = scanSvg;
            }
        }
    }

    _showSnippetsModal() {
        const modal = document.getElementById('snippetsModal');
        const body = document.getElementById('snippetsBody');
        if (!modal || !body) return;
        this._renderSnippetsList(body);
        modal.classList.add('show');

        document.getElementById('snippetExportBtn')?.addEventListener('click', () => {
            const json = this.snippets.exportJSON();
            const blob = new Blob([json], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'cloudterm-snippets.json';
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('Snippets exported');
        });

        document.getElementById('snippetImportBtn')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = () => {
                const file = input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        this.snippets.importJSON(reader.result);
                        this._renderSnippetsList(body);
                        showToast('Snippets imported');
                    } catch (e) {
                        showToast('Import failed: ' + e.message, 5000);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });
    }

    _renderSnippetsList(body) {
        const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
        const snippets = this.snippets.getAll();

        let html = '<div class="snippet-add-form">' +
            '<input class="snippet-input" id="snippetNewName" placeholder="Name">' +
            '<textarea class="snippet-input" id="snippetNewCmd" rows="3" placeholder="Command or script (multi-line supported)" style="font-family:\'JetBrains Mono\',monospace;resize:vertical;"></textarea>' +
            '<input class="snippet-input" id="snippetNewDesc" placeholder="Description (optional)">' +
            '<button id="snippetAddBtn" style="padding:6px;background:var(--ssh-dim);border:1px solid var(--ssh-b);border-radius:5px;color:var(--ssh);font-size:10px;cursor:pointer;">Add Snippet</button>' +
            '</div>';

        for (const s of snippets) {
            const cmdId = 'snip_' + s.id;
            html += '<div class="snippet-row">' +
                '<div style="flex:1;min-width:0;">' +
                '<div class="snippet-name">' + esc(s.name) + '</div>' +
                '<pre class="snippet-cmd" style="white-space:pre-wrap;margin:0;">' + esc(s.command) + '</pre>' +
                (s.description ? '<div class="snippet-desc">' + esc(s.description) + '</div>' : '') +
                '</div>' +
                '<div class="snippet-actions">' +
                '<button class="snippet-btn" data-action="insert" data-snip-id="' + s.id + '" title="Insert into terminal">\u25B6</button>' +
                '<button class="snippet-btn" data-action="copy" data-snip-id="' + s.id + '" title="Copy to clipboard">\u2398</button>' +
                '<button class="snippet-btn" data-action="delete" data-id="' + s.id + '" title="Delete">\u2715</button>' +
                '</div></div>';
        }

        body.innerHTML = html;

        // Add snippet
        document.getElementById('snippetAddBtn')?.addEventListener('click', () => {
            const name = document.getElementById('snippetNewName')?.value?.trim();
            const cmd = document.getElementById('snippetNewCmd')?.value?.trim();
            const desc = document.getElementById('snippetNewDesc')?.value?.trim();
            if (!name || !cmd) { showToast('Name and command are required'); return; }
            this.snippets.add(name, cmd, desc);
            this._renderSnippetsList(body);
        });

        // Action buttons
        body.querySelectorAll('.snippet-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'insert') {
                    const snip = this.snippets.getAll().find(s => s.id === btn.dataset.snipId);
                    if (snip) this._insertSnippetToTerminal(snip.command);
                } else if (action === 'copy') {
                    const snip = this.snippets.getAll().find(s => s.id === btn.dataset.snipId);
                    if (snip) copyToClipboard(snip.command);
                } else if (action === 'delete') {
                    this.snippets.remove(btn.dataset.id);
                    this._renderSnippetsList(body);
                }
            });
        });
    }

    _insertSnippetToTerminal(command) {
        const tabID = this.tabManager.activeTab;
        if (!tabID) { showToast('No active terminal'); return; }
        const info = this.tabManager.tabs.get(tabID);
        if (!info || info.type !== 'ssh') { showToast('Active tab is not an SSH session'); return; }
        const entry = this.termManager.terminals.get(tabID);
        if (entry) entry.term.paste(command);
    }

    // -- History / Audit Log ---------------------------------------------------

    _setupHistoryButton() {
        const btn = document.getElementById('historyBtn');
        if (btn) btn.addEventListener('click', () => this._showHistoryModal());
    }

    async _showHistoryModal() {
        const modal = document.getElementById('historyModal');
        const body = document.getElementById('historyBody');
        if (!modal || !body) return;
        body.innerHTML = '<div style="text-align:center;color:var(--dim);padding:20px">Loading...</div>';
        modal.classList.add('show');
        await this._loadAuditEvents(body);

        document.getElementById('historyRefreshBtn')?.addEventListener('click', () => this._loadAuditEvents(body));
    }

    async _loadAuditEvents(body) {
        const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
        try {
            const resp = await fetch('/audit-log?limit=100&offset=0');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const events = await resp.json();

            const actionIcons = {
                session_start: '\u25B6', session_end: '\u25A0',
                file_upload: '\u2B06', file_download: '\u2B07',
                broadcast_command: '\u{1F4E1}'
            };
            const actionColors = {
                session_start: 'var(--ssh)', session_end: 'var(--dim)',
                file_upload: 'var(--orange)', file_download: 'var(--rdp)',
                broadcast_command: 'var(--purple)'
            };

            let html = '';
            for (const ev of events) {
                const icon = actionIcons[ev.action] || '\u25CF';
                const color = actionColors[ev.action] || 'var(--muted)';
                const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '';
                html += '<div class="audit-row">' +
                    '<span class="audit-icon" style="color:' + color + '">' + icon + '</span>' +
                    '<span class="audit-action">' + esc(ev.action ? ev.action.replace(/_/g, ' ') : '') + '</span>' +
                    '<span class="audit-instance">' + esc(ev.instance_name || ev.instance_id) + '</span>' +
                    '<span class="audit-detail">' + esc(ev.details) + '</span>' +
                    '<span class="audit-time">' + esc(ts) + '</span>' +
                    '</div>';
            }
            body.innerHTML = html || '<div style="padding:20px;text-align:center;color:var(--dim)">No events recorded yet</div>';
        } catch (e) {
            body.innerHTML = '<div style="color:var(--red);padding:20px">Failed to load history: ' + e.message + '</div>';
        }
    }

    // -- Split Terminal Panes ----------------------------------------------------

    _setupTabContextMenu() {
        const menu = document.getElementById('tabCtxMenu');
        if (!menu) return;

        let targetTabID = null;

        // Right-click on tab bar tabs
        const tabBar = document.getElementById('tabBar');
        if (tabBar) {
            tabBar.addEventListener('contextmenu', (e) => {
                const tab = e.target.closest('.tab');
                if (!tab) return;
                e.preventDefault();
                targetTabID = tab.dataset.id;
                const info = this.tabManager.tabs.get(targetTabID);
                // Only show split options for SSH tabs
                const splitItems = menu.querySelectorAll('[data-action="split-right"],[data-action="split-down"]');
                splitItems.forEach(item => {
                    item.style.display = (info && info.type === 'ssh') ? '' : 'none';
                });
                positionContextMenu(menu, e.clientX, e.clientY);
            });
        }

        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.ctx-item');
            if (!item || !targetTabID) return;
            const action = item.dataset.action;
            menu.classList.remove('show');

            if (action === 'split-right') {
                this._splitTab(targetTabID, 'horizontal');
            } else if (action === 'split-down') {
                this._splitTab(targetTabID, 'vertical');
            } else if (action === 'close-tab') {
                this.tabManager.closeTab(targetTabID);
            }
            targetTabID = null;
        });

        // Close menu on outside click
        document.addEventListener('click', () => menu.classList.remove('show'));
    }

    _splitTab(tabID, direction) {
        const tabInfo = this.tabManager.tabs.get(tabID);
        if (!tabInfo || tabInfo.type !== 'ssh') {
            showToast('Split is only available for SSH terminals');
            return;
        }

        const panel = tabInfo.panel;
        if (!panel) return;

        // Generate unique session ID for the new pane
        this._sessionCounter++;
        const newSessionID = tabID + '-p' + this._sessionCounter;

        const instanceName = tabInfo.name;

        // Split the panel DOM — returns the new pane element
        const pane2 = this.splitManager.split(tabID, direction, newSessionID, panel, instanceName);
        if (!pane2) return;

        // Fit the original terminal after layout change
        requestAnimationFrame(() => this.termManager.fitTerminal(tabID));

        // Show instance picker in the new pane
        this._showSplitPicker(tabID, newSessionID, pane2);
    }

    _toggleTerminalFullscreen(tabID) {
        const info = this.tabManager.tabs.get(tabID);
        if (!info) return;
        const wrapper = info.panel.querySelector('.term-panel-wrapper');
        if (!wrapper) return;

        wrapper.classList.toggle('fullscreen');
        const isFS = wrapper.classList.contains('fullscreen');

        const btn = wrapper.querySelector('.fullscreen-btn');
        if (btn) {
            btn.innerHTML = '<span class="btn-icon">' + (isFS ? '\u2716' : '\u26F6') + '</span> ' + (isFS ? 'Exit FS' : 'Fullscreen');
        }

        requestAnimationFrame(() => {
            const allIDs = this.splitManager.getAllSessionIDs(tabID);
            for (const sid of allIDs) this.termManager.fitTerminal(sid);
        });
    }

    /** Show a picker in the split pane listing active SSH instances. */
    _showSplitPicker(tabID, newSessionID, paneEl) {
        // Gather unique instances from open SSH tabs
        const instances = new Map();
        for (const [, info] of this.tabManager.tabs) {
            if (info.type === 'ssh' && info.instanceID) {
                if (!instances.has(info.instanceID)) {
                    instances.set(info.instanceID, info.name || info.instanceID);
                }
            }
        }

        const picker = document.createElement('div');
        picker.className = 'split-picker';
        picker.innerHTML =
            '<div class="split-picker-title">Connect to instance</div>' +
            '<div class="split-picker-list"></div>';

        const list = picker.querySelector('.split-picker-list');
        for (const [instID, instName] of instances) {
            const item = document.createElement('div');
            item.className = 'split-picker-item';
            item.dataset.instanceId = instID;
            item.innerHTML =
                '<span class="split-picker-name">' + instName + '</span>' +
                '<span class="split-picker-id">' + instID + '</span>';
            item.addEventListener('click', () => {
                this._connectSplitPane(tabID, newSessionID, instID, instName, paneEl);
            });
            list.appendChild(item);
        }

        paneEl.appendChild(picker);
    }

    /** Replace picker with a terminal connected to the chosen instance. */
    _connectSplitPane(tabID, sessionID, instanceID, instanceName, paneEl) {
        paneEl.innerHTML = '';

        // Add header with instance name and close button
        const header = this.splitManager._createPaneHeader(instanceName, () => {
            this._closeSplitPane(tabID, sessionID);
        });
        paneEl.appendChild(header);

        const tc = document.createElement('div');
        tc.className = 'terminal-container';
        tc.style.cssText = 'flex:1;overflow:hidden;';
        paneEl.appendChild(tc);

        this.splitManager.setPaneTermContainer(tabID, sessionID, tc);
        this.termManager.createTerminal(sessionID, instanceID, instanceName, tc, this.currentTermTheme);

        requestAnimationFrame(() => {
            const allIDs = this.splitManager.getAllSessionIDs(tabID);
            for (const sid of allIDs) this.termManager.fitTerminal(sid);
            this.termManager.focusTerminal(sessionID);
        });
    }

    /** Close a secondary split pane — collapse back to single terminal. */
    _closeSplitPane(tabID, sessionID) {
        this.termManager.closeTerminal(sessionID);
        this.splitManager.closeSplitPane(tabID, sessionID);
        requestAnimationFrame(() => this.termManager.fitTerminal(tabID));
    }

    // -- Instance Metrics --------------------------------------------------------

    _showLogInsight(payload) {
        var existing = document.querySelectorAll('.log-insight-toast');
        if (existing.length >= 3) existing[0].remove();

        var toast = document.createElement('div');
        toast.className = 'log-insight-toast';
        toast.innerHTML =
            '<button class="insight-dismiss" onclick="this.parentElement.remove()">\u2715</button>' +
            '<div class="insight-title">\u26A0 ' + (payload.error_summary || 'Error detected') + '</div>' +
            '<div style="color:var(--muted);margin-bottom:4px;">' + (payload.suggested_fix || '') + '</div>' +
            (payload.confidence ? '<div style="font-size:9px;color:var(--dim);">Confidence: ' + Math.round(payload.confidence * 100) + '%</div>' : '');
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 10000);
    }

    _loadInstanceMetrics(instanceID) {
        const container = document.getElementById('metricsContainer');
        const btn = document.getElementById('metricsLoadBtn');
        if (!container) return;
        container.style.display = '';
        container.innerHTML = '<div style="text-align:center;color:var(--dim);padding:10px">Loading metrics...</div>';
        if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }

        fetch('/instance-metrics?instance_id=' + encodeURIComponent(instanceID))
            .then(resp => { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.json(); })
            .then(m => {
                const gauge = (label, pct, used, total, unit) => {
                    const color = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--orange)' : 'var(--ssh)';
                    return '<div class="metric-gauge">' +
                        '<div class="metric-label">' + label + '</div>' +
                        '<div class="metric-bar-bg"><div class="metric-bar-fill" style="width:' + Math.min(pct, 100) + '%;background:' + color + '"></div></div>' +
                        '<div class="metric-value">' + used + ' / ' + total + ' ' + unit + ' (' + pct.toFixed(1) + '%)</div>' +
                        '</div>';
                };
                const cpuPct = m.cpu_count > 0 ? (m.cpu_load / m.cpu_count) * 100 : 0;
                container.innerHTML =
                    gauge('CPU Load', cpuPct, m.cpu_load.toFixed(2), m.cpu_count + ' cores', '') +
                    gauge('Memory', m.mem_used_pct, m.mem_used_mb, m.mem_total_mb, 'MB') +
                    gauge('Disk (/)', m.disk_used_pct, m.disk_used_gb.toFixed(1), m.disk_total_gb.toFixed(1), 'GB') +
                    '<div class="metric-uptime">Uptime: ' + (m.uptime || 'N/A') + '</div>';
            })
            .catch(e => {
                container.innerHTML = '<div style="color:var(--red);font-size:11px">Failed to load metrics: ' + e.message + '</div>';
            })
            .finally(() => {
                if (btn) { btn.disabled = false; btn.textContent = 'Refresh Metrics'; }
            });
    }

    // -- File Browser -----------------------------------------------------------

    async _showFileBrowserModal(instanceID, instanceName) {
        const modal = document.getElementById('fileBrowserModal');
        if (!modal) return;
        document.getElementById('fbTarget').textContent = instanceName + ' (' + instanceID + ')';
        this._fbInstanceID = instanceID;
        this._fbInstanceName = instanceName;
        const inst = this.sidebar.getInstance(instanceID);
        const startPath = (inst && inst.platform === 'windows') ? 'C:\\' : '/';
        modal.classList.add('show');

        document.getElementById('fbUploadBtn')?.addEventListener('click', () => {
            document.getElementById('fileBrowserModal')?.classList.remove('show');
            this._showUploadModal(this._fbInstanceID, this._fbInstanceName);
            const remotePathEl = document.getElementById('uploadRemotePath');
            if (remotePathEl && this._fbCurrentPath) {
                const sep = (inst && inst.platform === 'windows') ? '\\' : '/';
                remotePathEl.value = this._fbCurrentPath.replace(/[\/\\]$/, '') + sep;
            }
        });

        this._browsePath(startPath);
    }

    async _browsePath(path) {
        const body = document.getElementById('fbBody');
        const breadcrumb = document.getElementById('fbBreadcrumb');
        if (!body) return;
        this._fbCurrentPath = path;
        body.innerHTML = '<div style="text-align:center;color:var(--dim);padding:30px">Loading...</div>';

        const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

        // Render breadcrumb
        if (breadcrumb) {
            const parts = path.split(/[\/\\]/).filter(Boolean);
            let html = '<span class="fb-crumb" data-path="/">/</span>';
            let accumulated = '';
            for (const p of parts) {
                accumulated += '/' + p;
                html += ' <span class="fb-sep">\u25B8</span> <span class="fb-crumb" data-path="' + esc(accumulated) + '">' + esc(p) + '</span>';
            }
            breadcrumb.innerHTML = html;
            breadcrumb.querySelectorAll('.fb-crumb').forEach(el => {
                el.addEventListener('click', () => this._browsePath(el.dataset.path));
            });
        }

        try {
            const resp = await fetch('/browse-directory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instance_id: this._fbInstanceID, path: path })
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const entries = await resp.json();

            if (!entries || entries.length === 0) {
                body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--dim)">Empty directory</div>';
                return;
            }

            let html = '<table class="fb-table"><thead><tr><th></th><th>Name</th><th>Size</th><th>Modified</th><th>Perms</th><th></th></tr></thead><tbody>';
            // Parent directory
            if (path !== '/' && path !== 'C:\\') {
                const parent = path.replace(/[\/\\][^\/\\]+[\/\\]?$/, '') || '/';
                html += '<tr class="fb-row fb-dir" data-path="' + esc(parent) + '" data-is-dir="true"><td class="fb-icon">\u{1F4C1}</td><td>..</td><td></td><td></td><td></td><td></td></tr>';
            }
            for (const entry of entries) {
                const fullPath = path.replace(/[\/\\]$/, '') + '/' + entry.name;
                const sizeStr = entry.is_dir ? '' : this._formatSize(entry.size);
                const icon = entry.is_dir ? '\u{1F4C1}' : '\u{1F4C4}';
                const hasS3 = !!(JSON.parse(localStorage.getItem('cloudterm_settings') || '{}').s3_bucket);
                const exBtn = (!entry.is_dir && hasS3) ? '<button class="fb-dl-btn fb-edl-btn" data-dl-path="' + esc(fullPath) + '" title="Express Download" style="color:var(--orange);">\u26A1</button>' : '';
                const dlBtn = entry.is_dir ? '' : '<button class="fb-dl-btn" data-dl-path="' + esc(fullPath) + '" title="Download">\u2B07</button>' + exBtn;
                html += '<tr class="fb-row ' + (entry.is_dir ? 'fb-dir' : 'fb-file') + '" data-path="' + esc(fullPath) + '" data-is-dir="' + entry.is_dir + '">' +
                    '<td class="fb-icon">' + icon + '</td>' +
                    '<td class="fb-name">' + esc(entry.name) + '</td>' +
                    '<td class="fb-size">' + sizeStr + '</td>' +
                    '<td class="fb-modified">' + esc(entry.modified) + '</td>' +
                    '<td class="fb-perms">' + esc(entry.permissions) + '</td>' +
                    '<td style="display:flex;gap:4px;">' + dlBtn + '</td></tr>';
            }
            html += '</tbody></table>';
            body.innerHTML = html;

            // Navigate into directories on row click
            body.querySelectorAll('.fb-row').forEach(row => {
                row.addEventListener('click', (e) => {
                    if (e.target.closest('.fb-dl-btn')) return;
                    if (row.dataset.isDir === 'true') {
                        this._browsePath(row.dataset.path);
                    }
                });
            });

            // Download button per file — bump z-index so download modal renders above file browser
            body.querySelectorAll('.fb-dl-btn:not(.fb-edl-btn)').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dlModal = document.getElementById('downloadModal');
                    if (dlModal) dlModal.style.zIndex = '510';
                    this._showDownloadModal(this._fbInstanceID, this._fbInstanceName);
                    const remotePathEl = document.getElementById('downloadRemotePath');
                    if (remotePathEl) remotePathEl.value = btn.dataset.dlPath;
                });
            });

            // Express download button per file
            body.querySelectorAll('.fb-edl-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const edlModal = document.getElementById('expressDownloadModal');
                    if (edlModal) edlModal.style.zIndex = '510';
                    this._showExpressDownloadModal(this._fbInstanceID, this._fbInstanceName);
                    const remotePathEl = document.getElementById('expressDownloadRemotePath');
                    if (remotePathEl) remotePathEl.value = btn.dataset.dlPath;
                });
            });
        } catch (e) {
            body.innerHTML = '<div style="color:var(--red);padding:20px">Browse failed: ' + e.message + '</div>';
        }
    }

    // -- Input Sync --------------------------------------------------------------

    _setupInputSyncButton() {
        const btn = document.getElementById('inputSyncBtn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            this.termManager.inputSyncEnabled = !this.termManager.inputSyncEnabled;
            btn.classList.toggle('sync-active', this.termManager.inputSyncEnabled);
            btn.title = this.termManager.inputSyncEnabled
                ? 'Input Sync ON (click to disable)'
                : 'Sync Input (type once, send to all tabs)';
        });
    }

    // -- Port Forwarding ---------------------------------------------------------

    _showPortForwardModal(instanceID, instanceName) {
        const modal = document.getElementById('portForwardModal');
        if (!modal) return;
        const subtitle = document.getElementById('pfModalSubtitle');
        if (subtitle) subtitle.textContent = instanceName || instanceID;
        const portInput = document.getElementById('pfRemotePort');
        if (portInput) portInput.value = '';
        modal.classList.add('show');
        setTimeout(() => portInput && portInput.focus(), 100);

        const startBtn = document.getElementById('pfStartBtn');
        const handler = () => {
            startBtn.removeEventListener('click', handler);
            const port = parseInt(portInput.value, 10);
            if (!port || port < 1 || port > 65535) {
                showToast('Enter a valid port (1-65535)');
                return;
            }
            modal.classList.remove('show');
            this._startPortForward(instanceID, instanceName, port);
        };
        // Remove old listeners by cloning
        const newBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newBtn, startBtn);
        newBtn.addEventListener('click', handler);
    }

    async _startPortForward(instanceID, instanceName, remotePort) {
        showToast('Starting tunnel to ' + instanceName + ':' + remotePort + '...');
        try {
            const resp = await fetch('/start-port-forward', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instance_id: instanceID,
                    instance_name: instanceName,
                    port_number: remotePort
                })
            });
            const data = await resp.json();
            if (data.error) {
                showToast('Tunnel error: ' + data.error, 4000);
                return;
            }
            const localPort = data.port;
            showToast('Tunnel active: localhost:' + localPort + ' -> ' + remotePort, 5000);
            this._loadActiveTunnels();
        } catch (e) {
            showToast('Failed to start tunnel: ' + e.message, 4000);
        }
    }

    _setupTunnelPanel() {
        const header = document.getElementById('tunnelHeader');
        const collapseBtn = document.getElementById('tunnelCollapseBtn');
        const closeBtn = document.getElementById('tunnelCloseBtn');
        const panel = document.getElementById('tunnelPanel');
        if (!panel) return;

        if (header) {
            header.addEventListener('click', (e) => {
                if (e.target === collapseBtn || e.target === closeBtn) return;
                panel.classList.toggle('collapsed');
            });
        }
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => panel.classList.toggle('collapsed'));
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', () => panel.classList.remove('visible'));
        }

        makePanelDraggable(panel, header);

        // Poll for active tunnels every 10s
        this._loadActiveTunnels();
        setInterval(() => this._loadActiveTunnels(), 10000);
    }

    async _loadActiveTunnels() {
        const panel = document.getElementById('tunnelPanel');
        const body = document.getElementById('tunnelBody');
        const count = document.getElementById('tunnelCount');
        if (!panel || !body) return;

        try {
            const resp = await fetch('/active-tunnels');
            if (!resp.ok) return;
            const allTunnels = await resp.json();
            // Only show manually created port forwards, not internal RDP tunnels (port 3389).
            const tunnels = Array.isArray(allTunnels) ? allTunnels.filter(t => t.remote_port !== 3389) : [];
            if (tunnels.length === 0) {
                panel.classList.remove('visible');
                if (count) count.textContent = '0';
                return;
            }

            if (count) count.textContent = tunnels.length;
            panel.classList.add('visible');

            const webPorts = new Set([80,443,3000,4200,5000,5173,5174,8000,8080,8443,8888,9000,9090]);
            let html = '';
            for (const t of tunnels) {
                const name = t.instance_name || t.instance_id;
                const rp = t.remote_port || 3389;
                const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const showOpen = webPorts.has(rp);
                html += '<div class="tunnel-row">' +
                    '<span class="tunnel-name" title="' + esc(t.instance_id) + '">' + esc(name) + '</span>' +
                    '<span class="tunnel-ports">:' + t.local_port + ' &#x2192; :' + rp + '</span>' +
                    (showOpen ? '<button class="tunnel-open" data-lport="' + t.local_port + '" title="Open in browser"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>' : '') +
                    '<button class="tunnel-stop" data-instance="' + esc(t.instance_id) + '" data-port="' + rp + '" title="Stop tunnel">&times;</button>' +
                    '</div>';
            }
            body.innerHTML = html;

            body.querySelectorAll('.tunnel-open').forEach(btn => {
                btn.addEventListener('click', () => {
                    window.open('http://localhost:' + btn.dataset.lport, '_blank');
                });
            });
            body.querySelectorAll('.tunnel-stop').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._stopTunnel(btn.dataset.instance, parseInt(btn.dataset.port, 10));
                });
            });
        } catch (e) {
            // Silently ignore — forwarder may be unavailable
        }
    }

    async _stopTunnel(instanceID, portNumber) {
        try {
            await fetch('/stop-port-forward', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instance_id: instanceID, port_number: portNumber })
            });
            showToast('Tunnel stopped');
            this._loadActiveTunnels();
        } catch (e) {
            showToast('Failed to stop tunnel: ' + e.message, 3000);
        }
    }

    // -- Recordings --------------------------------------------------------------

    _setupRecordingsButton() {
        const btn = document.getElementById('recordingsBtn');
        if (btn) btn.addEventListener('click', () => this._showRecordingsModal());
    }

    async _showRecordingsModal() {
        const modal = document.getElementById('recordingsModal');
        const list = document.getElementById('recList');
        if (!modal || !list) return;

        list.innerHTML = '<div style="text-align:center;color:var(--dim);padding:20px">Loading...</div>';
        modal.classList.add('show');

        try {
            const resp = await fetch('/recordings');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const recs = await resp.json();

            if (!recs || recs.length === 0) {
                list.innerHTML = '<div style="text-align:center;color:var(--dim);padding:20px">No recordings yet</div>';
                return;
            }

            const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const fmtSize = (b) => {
                if (b < 1024) return b + ' B';
                if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
                return (b / 1048576).toFixed(1) + ' MB';
            };

            let html = '';
            for (const r of recs) {
                html += '<div class="rec-row">' +
                    '<span class="rec-type ' + r.type + '">' + r.type + '</span>' +
                    '<span class="rec-name" title="' + esc(r.name) + '">' + esc(r.name) + '</span>' +
                    '<span class="rec-meta">' + fmtSize(r.size) + '</span>' +
                    '<span class="rec-meta">' + (r.mod_time ? new Date(r.mod_time).toLocaleDateString() : '') + '</span>' +
                    '<span class="rec-actions">' +
                    '<button class="play" data-name="' + esc(r.name) + '" data-type="' + r.type + '" title="Play">&#x25B6;</button>' +
                    '<button class="convert-mp4" data-name="' + esc(r.name) + '"' + (r.has_mp4 ? ' disabled title="MP4 already exists"' : ' title="Convert to MP4"') + '>' + (r.has_mp4 ? 'Converted' : 'Convert MP4') + '</button>' +
                    '<button class="download-mp4" data-name="' + esc(r.name) + '"' + (r.has_mp4 ? ' title="Download MP4"' : ' disabled title="Convert first"') + '><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 1v7M3 6l3 3 3-3M1 11h10"/></svg></button>' +
                    '<button class="delete" data-name="' + esc(r.name) + '" title="Delete">&times;</button>' +
                    '</span>' +
                    '</div>';
            }
            list.innerHTML = html;

            list.querySelectorAll('.play').forEach(btn => {
                btn.addEventListener('click', () => {
                    modal.classList.remove('show');
                    const replayModalId = btn.dataset.type === 'ssh' ? 'sshReplayModal' : 'rdpReplayModal';
                    const replayModal = document.getElementById(replayModalId);
                    if (replayModal) replayModal.dataset.parent = 'recordingsModal';
                    if (btn.dataset.type === 'ssh') {
                        this._playSSHRecording(btn.dataset.name);
                    } else {
                        this._playRDPRecording(btn.dataset.name);
                    }
                });
            });

            list.querySelectorAll('.convert-mp4').forEach(btn => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('.audit-row');
                    const dlBtn = row ? row.querySelector('.download-mp4') : null;
                    this._convertToMP4(btn.dataset.name, btn, dlBtn);
                });
            });

            list.querySelectorAll('.download-mp4').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (btn.disabled) return;
                    const name = btn.dataset.name;
                    const ext = name.lastIndexOf('.');
                    const mp4Name = (ext > 0 ? name.substring(0, ext) : name) + '.mp4';
                    this._triggerDownload(mp4Name);
                });
            });

            list.querySelectorAll('.delete').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('Delete recording ' + btn.dataset.name + '?')) return;
                    try {
                        await fetch('/recordings/' + encodeURIComponent(btn.dataset.name), { method: 'DELETE' });
                        this._showRecordingsModal(); // refresh
                    } catch (e) {
                        showToast('Delete failed: ' + e.message);
                    }
                });
            });
        } catch (e) {
            list.innerHTML = '<div style="text-align:center;color:var(--red);padding:20px">Failed to load recordings</div>';
        }
    }

    async _playSSHRecording(filename) {
        const modal = document.getElementById('sshReplayModal');
        const container = document.getElementById('sshReplayTerminal');
        const title = document.getElementById('sshReplayTitle');
        const playBtn = document.getElementById('replayPlayBtn');
        const playIcon = document.getElementById('castPlayIcon');
        const pauseIcon = document.getElementById('castPauseIcon');
        const speedSel = document.getElementById('replaySpeed');
        const progressBar = document.getElementById('replayProgressBar');
        const scrubThumb = document.getElementById('replayScrubThumb');
        const timeElapsed = document.getElementById('replayTimeElapsed');
        const timeTotal = document.getElementById('replayTimeTotal');
        const scrubber = document.getElementById('replayProgress');
        if (!modal || !container) return;

        if (title) title.textContent = filename;
        container.innerHTML = '';
        if (progressBar) progressBar.style.width = '0%';
        if (scrubThumb) scrubThumb.style.left = '0%';
        if (timeElapsed) timeElapsed.textContent = '0:00';
        if (timeTotal) timeTotal.textContent = '0:00';
        modal.classList.add('show');

        // Fetch recording
        let events;
        try {
            const resp = await fetch('/recordings/' + encodeURIComponent(filename));
            if (!resp.ok) throw new Error('Recording not found (HTTP ' + resp.status + ')');
            const text = await resp.text();
            const lines = text.trim().split('\n');
            const header = JSON.parse(lines[0]);

            events = [];
            const IDLE_CAP = 2.0; // Cap pauses at 2 seconds (asciinema-style)
            let adjustedTime = 0;
            let lastRawTime = 0;
            for (let i = 1; i < lines.length; i++) {
                try {
                    const ev = JSON.parse(lines[i]);
                    if (Array.isArray(ev) && ev[1] === 'o') {
                        const rawTime = ev[0];
                        const delta = rawTime - lastRawTime;
                        adjustedTime += Math.min(delta, IDLE_CAP);
                        lastRawTime = rawTime;
                        events.push({ time: adjustedTime, data: ev[2] });
                    }
                } catch (_) { /* skip malformed lines */ }
            }

            // Create replay terminal
            const term = new Terminal({
                cols: header.width || 80,
                rows: header.height || 24,
                disableStdin: true,
                theme: TERMINAL_THEMES['github-dark'] || {},
                fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                fontSize: 13
            });
            const fitAddon = new FitAddon.FitAddon();
            term.loadAddon(fitAddon);
            term.open(container);
            fitAddon.fit();

            // Playback state
            let playing = false;
            let eventIdx = 0;
            let timer = null;
            const totalDuration = events.length > 0 ? events[events.length - 1].time : 0;

            const fmtTime = (s) => {
                const m = Math.floor(s / 60);
                const sec = Math.floor(s % 60);
                return m + ':' + (sec < 10 ? '0' : '') + sec;
            };

            if (timeTotal) timeTotal.textContent = fmtTime(totalDuration);

            const setIcons = (isPlaying) => {
                if (playIcon) playIcon.style.display = isPlaying ? 'none' : '';
                if (pauseIcon) pauseIcon.style.display = isPlaying ? '' : 'none';
            };

            const updateProgress = (t) => {
                const pct = totalDuration > 0 ? (t / totalDuration) * 100 : 0;
                if (progressBar) progressBar.style.width = pct + '%';
                if (scrubThumb) scrubThumb.style.left = pct + '%';
                if (timeElapsed) timeElapsed.textContent = fmtTime(t);
            };

            const playNext = () => {
                if (eventIdx >= events.length) {
                    playing = false;
                    setIcons(false);
                    return;
                }
                const ev = events[eventIdx];
                term.write(ev.data);
                updateProgress(ev.time);
                eventIdx++;

                if (eventIdx < events.length) {
                    const delay = (events[eventIdx].time - ev.time) * 1000 / parseFloat(speedSel.value);
                    timer = setTimeout(playNext, Math.max(delay, 1));
                } else {
                    playing = false;
                    setIcons(false);
                }
            };

            const seekTo = (targetTime) => {
                clearTimeout(timer);
                term.reset();
                eventIdx = 0;
                for (let i = 0; i < events.length; i++) {
                    if (events[i].time <= targetTime) {
                        term.write(events[i].data);
                        eventIdx = i + 1;
                    } else break;
                }
                updateProgress(targetTime);
                if (playing) playNext();
            };

            const togglePlay = () => {
                if (playing) {
                    playing = false;
                    clearTimeout(timer);
                    setIcons(false);
                } else {
                    if (eventIdx >= events.length) {
                        eventIdx = 0;
                        term.reset();
                    }
                    playing = true;
                    setIcons(true);
                    playNext();
                }
            };

            // Clone button to remove old listeners
            const newPlayBtn = playBtn.cloneNode(true);
            playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
            newPlayBtn.addEventListener('click', togglePlay);

            // Scrubber: click to seek + hover tooltip
            if (scrubber) {
                const newScrubber = scrubber.cloneNode(true);
                scrubber.parentNode.replaceChild(newScrubber, scrubber);
                // Re-query children after clone
                const bar = newScrubber.querySelector('.cast-scrubber-fill');
                const thumb = newScrubber.querySelector('.cast-scrubber-thumb');
                const tooltip = newScrubber.querySelector('.cast-scrubber-tooltip');
                // Reassign IDs so updateProgress still works
                if (bar) bar.id = 'replayProgressBar';
                if (thumb) thumb.id = 'replayScrubThumb';
                if (tooltip) tooltip.id = 'replayScrubTooltip';

                newScrubber.addEventListener('click', (e) => {
                    const rect = newScrubber.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    seekTo(pct * totalDuration);
                });

                newScrubber.addEventListener('mousemove', (e) => {
                    const rect = newScrubber.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    if (tooltip) {
                        tooltip.textContent = fmtTime(pct * totalDuration);
                        tooltip.style.left = (pct * 100) + '%';
                    }
                    if (thumb) thumb.style.left = (pct * 100) + '%';
                });

                newScrubber.addEventListener('mouseleave', () => {
                    // Restore thumb to current position
                    const curPct = totalDuration > 0 && eventIdx > 0
                        ? (events[Math.min(eventIdx - 1, events.length - 1)].time / totalDuration) * 100 : 0;
                    if (thumb) thumb.style.left = curPct + '%';
                });
            }

            // Keyboard controls
            const keyHandler = (e) => {
                if (!modal.classList.contains('show')) return;
                if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
                else if (e.code === 'ArrowRight') {
                    e.preventDefault();
                    const cur = eventIdx > 0 ? events[Math.min(eventIdx - 1, events.length - 1)].time : 0;
                    seekTo(Math.min(cur + 5, totalDuration));
                }
                else if (e.code === 'ArrowLeft') {
                    e.preventDefault();
                    const cur = eventIdx > 0 ? events[Math.min(eventIdx - 1, events.length - 1)].time : 0;
                    seekTo(Math.max(cur - 5, 0));
                }
            };
            document.addEventListener('keydown', keyHandler);

            // Auto-play
            playing = true;
            setIcons(true);
            playNext();

            // Cleanup on close
            const closeHandler = () => {
                clearTimeout(timer);
                playing = false;
                document.removeEventListener('keydown', keyHandler);
                term.dispose();
            };
            modal.querySelector('.modal-cancel').addEventListener('click', closeHandler);

        } catch (e) {
            container.innerHTML = '<div style="color:var(--red);padding:20px">Failed to load recording: ' + e.message + '</div>';
        }
    }

    async _playRDPRecording(filename) {
        const modal = document.getElementById('rdpReplayModal');
        const displayEl = document.getElementById('rdpReplayDisplay');
        const title = document.getElementById('rdpReplayTitle');
        const playBtn = document.getElementById('rdpReplayPlayBtn');
        const seekBar = document.getElementById('rdpReplaySeek');
        const timeEl = document.getElementById('rdpReplayTime');
        const closeBtn = document.getElementById('rdpReplayClose');
        if (!modal || !displayEl) return;

        // Default close handler (overridden by cleanup when recording loads).
        closeBtn.onclick = () => { if (typeof closeModal === 'function') closeModal(modal); else modal.classList.remove('show'); };
        modal.onclick = (e) => { if (e.target === modal) { if (typeof closeModal === 'function') closeModal(modal); else modal.classList.remove('show'); } };

        // Clean up previous replay.
        displayEl.innerHTML = '';
        if (this._rdpRecording) {
            try { this._rdpRecording.pause(); } catch (_) {}
            this._rdpRecording = null;
        }
        if (this._rdpReplayTimer) {
            clearInterval(this._rdpReplayTimer);
            this._rdpReplayTimer = null;
        }

        if (title) title.textContent = 'RDP Replay: ' + filename;
        playBtn.innerHTML = '&#x25B6;';
        seekBar.value = 0;
        timeEl.textContent = '0:00 / 0:00';
        modal.classList.add('show');

        // .guac files: use Guacamole.SessionRecording player.
        if (filename.endsWith('.guac') && typeof Guacamole !== 'undefined') {
            try {
                displayEl.innerHTML = '<div style="color:var(--dim);font-size:12px;padding:20px;">Loading recording...</div>';
                const resp = await fetch('/recordings/' + encodeURIComponent(filename));
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const blob = await resp.blob();
                console.log('[RDP Replay] blob size:', blob.size, 'type:', blob.type);
                if (!blob.size) throw new Error('Recording file is empty');

                displayEl.innerHTML = '';
                const recording = new Guacamole.SessionRecording(blob);
                this._rdpRecording = recording;

                recording.onerror = (msg) => {
                    console.error('[RDP Replay] recording error:', msg);
                    displayEl.innerHTML = '<div style="color:var(--red);padding:20px;">Playback error: ' + msg + '</div>';
                };

                const display = recording.getDisplay();
                const displayCanvas = display.getElement();
                displayCanvas.style.margin = '0 auto';
                displayCanvas.style.transformOrigin = 'top left';
                displayEl.appendChild(displayCanvas);

                // Auto-scale display to fit container.
                const fitDisplay = () => {
                    const dw = display.getWidth();
                    const dh = display.getHeight();
                    if (!dw || !dh) return;
                    const cw = displayEl.clientWidth;
                    const ch = displayEl.clientHeight;
                    const scale = Math.min(cw / dw, ch / dh, 1);
                    display.scale(scale);
                    displayCanvas.style.margin = '0 auto';
                };
                display.onresize = fitDisplay;
                // Also fit after first frame renders.
                setTimeout(fitDisplay, 200);

                const fmtTime = (ms) => {
                    const s = Math.floor(ms / 1000);
                    const m = Math.floor(s / 60);
                    return m + ':' + String(s % 60).padStart(2, '0');
                };

                let seeking = false;
                let loaded = false;

                recording.onload = () => {
                    loaded = true;
                    console.log('[RDP Replay] loaded, duration:', recording.getDuration());
                    playBtn.disabled = false;
                    playBtn.innerHTML = '&#x25B6;';
                };

                recording.onprogress = (duration) => {
                    if (!seeking) {
                        timeEl.textContent = fmtTime(recording.getPosition()) + ' / ' + fmtTime(duration);
                    }
                };

                recording.onplay = () => {
                    playBtn.innerHTML = '&#x23F8;';
                    this._rdpReplayTimer = setInterval(() => {
                        const dur = recording.getDuration();
                        const pos = recording.getPosition();
                        if (dur > 0 && !seeking) {
                            seekBar.value = Math.round((pos / dur) * 1000);
                            timeEl.textContent = fmtTime(pos) + ' / ' + fmtTime(dur);
                        }
                    }, 250);
                };

                recording.onpause = () => {
                    playBtn.innerHTML = '&#x25B6;';
                    if (this._rdpReplayTimer) {
                        clearInterval(this._rdpReplayTimer);
                        this._rdpReplayTimer = null;
                    }
                };

                // Disable play until loaded.
                playBtn.disabled = true;
                playBtn.innerHTML = '&#x23F3;';
                playBtn.onclick = () => {
                    if (!loaded) return;
                    if (recording.isPlaying()) recording.pause();
                    else recording.play();
                };

                seekBar.oninput = () => { seeking = true; };
                seekBar.onchange = () => {
                    if (!loaded) return;
                    const dur = recording.getDuration();
                    const target = (parseInt(seekBar.value, 10) / 1000) * dur;
                    recording.seek(target, () => { seeking = false; });
                };

                const cleanup = () => {
                    recording.pause();
                    if (this._rdpReplayTimer) {
                        clearInterval(this._rdpReplayTimer);
                        this._rdpReplayTimer = null;
                    }
                    this._rdpRecording = null;
                    displayEl.innerHTML = '';
                    if (typeof closeModal === 'function') closeModal(modal); else modal.classList.remove('show');
                };

                closeBtn.onclick = cleanup;
                modal.onclick = (e) => { if (e.target === modal) cleanup(); };

            } catch (e) {
                displayEl.innerHTML = '<div style="color:var(--red);padding:20px;">Failed to load recording: ' + e.message + '</div>';
            }
            return;
        }

        // Fallback: .mp4/.m4v — use a video element.
        displayEl.innerHTML = '<video controls style="width:100%;max-height:60vh;" src="/recordings/' +
            encodeURIComponent(filename) + '"></video>';
        closeBtn.onclick = () => { if (typeof closeModal === 'function') closeModal(modal); else modal.classList.remove('show'); };
        modal.onclick = (e) => { if (e.target === modal) { if (typeof closeModal === 'function') closeModal(modal); else modal.classList.remove('show'); } };
    }

    // -- Canvas → MP4 download helper -----------------------------------------

    /**
     * Server-side recording → MP4 conversion.
     * Sends a conversion request to the backend, polls for status,
     * and triggers download when ready.
     */
    async _convertToMP4(filename, convertBtn, downloadBtn) {
        if (!filename.endsWith('.guac') && !filename.endsWith('.cast')) {
            showToast('MP4 conversion is supported for .guac and .cast recordings');
            return;
        }

        convertBtn.disabled = true;
        convertBtn.textContent = 'Converting\u2026';

        try {
            const resp = await fetch('/convert-recording', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename }),
            });
            const data = await resp.json();
            if (!resp.ok || data.error) throw new Error(data.error || 'Failed to start conversion');

            // If already done (cached).
            if (data.status === 'done') {
                convertBtn.textContent = 'Converted';
                if (downloadBtn) { downloadBtn.disabled = false; downloadBtn.title = 'Download MP4'; }
                showToast('MP4 ready');
                return;
            }

            // Poll for completion.
            const jobId = data.job_id;
            const poll = async () => {
                try {
                    const sr = await fetch('/convert-status/' + jobId);
                    const sd = await sr.json();

                    if (sd.status === 'done') {
                        convertBtn.textContent = 'Converted';
                        if (downloadBtn) { downloadBtn.disabled = false; downloadBtn.title = 'Download MP4'; }
                        showToast('MP4 ready');
                        return;
                    }

                    if (sd.status === 'error') {
                        convertBtn.disabled = false;
                        convertBtn.textContent = 'Convert MP4';
                        showToast('Conversion failed: ' + (sd.error || 'unknown error'));
                        return;
                    }

                    setTimeout(poll, 3000);
                } catch (_) {
                    setTimeout(poll, 5000);
                }
            };
            setTimeout(poll, 2000);

        } catch (e) {
            convertBtn.disabled = false;
            convertBtn.textContent = 'Convert MP4';
            showToast('Conversion error: ' + e.message);
        }
    }

    _triggerDownload(filename) {
        const a = document.createElement('a');
        a.href = '/recordings/' + encodeURIComponent(filename);
        a.download = filename;
        a.click();
    }

    async _toggleRecording(sessionID) {
        const s = this.termManager.terminals.get(sessionID);
        if (!s) return;

        const action = s.recording ? 'stop' : 'start';
        try {
            const resp = await fetch('/toggle-recording', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionID, action: action })
            });
            const data = await resp.json();
            s.recording = data.recording;

            const tab = document.querySelector('.tab[data-id="' + sessionID + '"]');
            if (tab) {
                const dot = tab.querySelector('.tab-rec');
                if (data.recording) {
                    if (!dot) {
                        const span = document.createElement('span');
                        span.className = 'tab-rec';
                        span.textContent = '\u25CF';
                        span.title = 'Recording';
                        tab.querySelector('.tab-name').after(span);
                    }
                } else {
                    if (dot) dot.remove();
                }
            }

            const panel = document.getElementById('panel-' + sessionID);
            if (panel) {
                const titleRecBtn = panel.querySelector('.record-btn');
                if (titleRecBtn) {
                    if (data.recording) {
                        titleRecBtn.classList.add('recording');
                        titleRecBtn.innerHTML = '<span class="btn-icon">\u25CF</span> Recording';
                    } else {
                        titleRecBtn.classList.remove('recording');
                        titleRecBtn.innerHTML = '<span class="btn-icon">\u25CF</span> Record';
                    }
                }
            }

            showToast(data.recording ? 'Recording started' : 'Recording stopped');
        } catch (e) {
            showToast('Toggle recording failed: ' + e.message);
        }
    }

    // -- Broadcast ---------------------------------------------------------------

    _setupBroadcastButton() {
        const btn = document.getElementById('broadcastBtn');
        if (btn) btn.addEventListener('click', () => this._toggleBroadcastBar());
        this._setupBroadcastBar();
    }

    _setupAIToggle() {
        const btn = document.getElementById('aiToggleBtn');
        if (btn) btn.addEventListener('click', () => this.aiChat.toggle());
    }

    _toggleBroadcastBar() {
        const bar = document.getElementById('broadcastBar');
        if (!bar) return;
        const visible = bar.style.display !== 'none';
        bar.style.display = visible ? 'none' : 'flex';
        if (!visible) {
            this._updateBroadcastBarCount();
            document.getElementById('bbInput')?.focus();
        }
    }

    _setupBroadcastBar() {
        const bar = document.getElementById('broadcastBar');
        if (!bar) return;

        const input = document.getElementById('bbInput');
        const closeBtn = document.getElementById('bbCloseBtn');
        const sendBtn = document.getElementById('bbSendBtn');

        if (closeBtn) closeBtn.addEventListener('click', () => { bar.style.display = 'none'; });
        const scriptBtn = document.getElementById('bbScriptMode');
        if (scriptBtn) scriptBtn.addEventListener('click', () => this._showBroadcastModal());

        const doSend = () => {
            const cmd = input.value;
            if (!cmd.trim()) return;
            this._broadcastToSessions(cmd);
            input.value = '';
            input.style.height = 'auto';
            input.style.height = input.scrollHeight + 'px';
        };

        if (sendBtn) sendBtn.addEventListener('click', doSend);

        if (input) {
            // Auto-resize textarea as content grows
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 140) + 'px';
            });
            input.addEventListener('keydown', (e) => {
                // Ctrl+Enter (or Cmd+Enter on Mac) sends the command
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    doSend();
                    return;
                }
                if (e.key === 'Escape') {
                    bar.style.display = 'none';
                }
            });
        }
    }

    _updateBroadcastBarCount() {
        const el = document.getElementById('bbSessionCount');
        if (!el) return;
        let count = 0;
        for (const [tabID,] of this.termManager.terminals) {
            const info = this.tabManager.tabs.get(tabID);
            if (info && info.type === 'ssh') count++;
        }
        el.textContent = count + ' session' + (count !== 1 ? 's' : '');
    }

    _broadcastToSessions(command) {
        // Replace newlines with \r so each line acts as Enter in the terminal PTY
        const payload = command.replace(/\r?\n/g, '\r') + '\r';
        let count = 0;
        for (const [tabID, entry] of this.termManager.terminals) {
            const info = this.tabManager.tabs.get(tabID);
            if (info && info.type === 'ssh') {
                this.ws.send('terminal_input', {
                    session_id: tabID,
                    input: payload
                });
                count++;
            }
        }
        if (count === 0) {
            showToast('No active SSH sessions to broadcast to');
        } else {
            const lines = command.split(/\r?\n/).filter(l => l.trim()).length;
            showToast('Sent ' + lines + ' line' + (lines !== 1 ? 's' : '') + ' to ' + count + ' session' + (count !== 1 ? 's' : ''));
        }
        this._updateBroadcastBarCount();
    }

    _showBroadcastModal(preselectedID) {
        const modal = document.getElementById('broadcastModal');
        if (!modal) return;

        const list = document.getElementById('bcInstanceList');
        const instances = this.sidebar._allInstances.filter(i => i.state === 'running');
        const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

        let html = '';
        for (const inst of instances) {
            const checked = preselectedID === inst.instance_id ? 'checked' : '';
            html += '<label class="bc-inst-row" data-name="' + esc(inst.name).toLowerCase() + '" data-id="' + inst.instance_id.toLowerCase() + '">' +
                '<input type="checkbox" class="bc-check" value="' + inst.instance_id + '" ' + checked + '>' +
                '<span class="bc-inst-name">' + esc(inst.name) + '</span>' +
                '<span class="bc-inst-id">' + inst.instance_id + '</span>' +
                '</label>';
        }
        list.innerHTML = html;

        const updateCount = () => {
            const count = list.querySelectorAll('.bc-check:checked').length;
            const el = document.getElementById('bcSelectedCount');
            if (el) el.textContent = count + ' selected';
        };

        // Search filter
        const searchInput = document.getElementById('bcSearchFilter');
        if (searchInput) {
            searchInput.value = '';
            const newSearch = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearch, searchInput);
            newSearch.addEventListener('input', () => {
                const q = newSearch.value.toLowerCase();
                list.querySelectorAll('.bc-inst-row').forEach(row => {
                    const match = !q || row.dataset.name.includes(q) || row.dataset.id.includes(q);
                    row.classList.toggle('bc-hidden', !match);
                });
            });
        }

        document.getElementById('bcSelectAll')?.replaceWith(document.getElementById('bcSelectAll')?.cloneNode(true));
        document.getElementById('bcDeselectAll')?.replaceWith(document.getElementById('bcDeselectAll')?.cloneNode(true));

        document.getElementById('bcSelectAll')?.addEventListener('click', () => {
            list.querySelectorAll('.bc-inst-row:not(.bc-hidden) .bc-check').forEach(cb => { cb.checked = true; });
            updateCount();
        });
        document.getElementById('bcDeselectAll')?.addEventListener('click', () => {
            list.querySelectorAll('.bc-check').forEach(cb => { cb.checked = false; });
            updateCount();
        });
        list.addEventListener('change', updateCount);

        const runBtn = document.getElementById('bcRunBtn');
        if (runBtn) {
            const newBtn = runBtn.cloneNode(true);
            runBtn.parentNode.replaceChild(newBtn, runBtn);
            newBtn.addEventListener('click', () => this._doBroadcast());
        }

        document.getElementById('bcResults').style.display = 'none';
        document.getElementById('bcCommand').value = '';
        modal.classList.add('show');
        updateCount();
    }

    async _doBroadcast() {
        const list = document.getElementById('bcInstanceList');
        const checked = list.querySelectorAll('.bc-check:checked');
        const ids = Array.from(checked).map(cb => cb.value);
        const command = document.getElementById('bcCommand')?.value;
        const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

        if (ids.length === 0) { showToast('Select at least one instance'); return; }
        if (!command) { showToast('Enter a command'); return; }

        const runBtn = document.getElementById('bcRunBtn');
        const results = document.getElementById('bcResults');
        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Running...'; }
        if (results) {
            results.style.display = '';
            results.innerHTML = '<div style="text-align:center;color:var(--dim);padding:20px">Executing on ' + ids.length + ' instance(s)...</div>';
        }

        try {
            const resp = await fetch('/broadcast-command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instance_ids: ids, command: command })
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();

            let html = '<div class="bc-results-grid">';
            for (const r of data) {
                const badge = r.success
                    ? '<span class="bc-badge success">OK</span>'
                    : '<span class="bc-badge error">FAIL</span>';
                const output = r.success ? r.output : r.error;
                html += '<div class="bc-result">' +
                    '<div class="bc-result-header">' + badge +
                    '<span class="bc-result-name">' + esc(r.name || r.instance_id) + '</span>' +
                    '<span class="bc-result-id">' + r.instance_id + '</span></div>' +
                    '<pre class="bc-result-output">' + esc(output || '(no output)') + '</pre></div>';
            }
            html += '</div>';
            results.innerHTML = html;
        } catch (e) {
            results.innerHTML = '<div style="color:var(--red);padding:10px">Broadcast failed: ' + e.message + '</div>';
        } finally {
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run Command'; }
        }
    }

    // -- Global event listeners ----------------------------------------------

    _setupEventListeners() {
        // Fit terminals on window resize.
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                this.termManager.resizeAll();
            }, 150);
        });

        // Override tab close to also clean up terminal/RDP.
        const origClose = this.tabManager.closeTab.bind(this.tabManager);
        this.tabManager.closeTab = (id) => {
            const info = this.tabManager.tabs.get(id);

            if (info && info.type === 'ssh') {
                // Close all split pane terminals first
                const extraIDs = this.splitManager.getExtraSessionIDs(id);
                for (const sid of extraIDs) this.termManager.closeTerminal(sid);
                this.splitManager.removeSplit(id);
                this.termManager.closeTerminal(id);
            } else if (info && info.type === 'rdp') {
                this._stopRDPSession(info.instanceID || id);
                if (this._guacClients && this._guacClients[id]) {
                    var gc = this._guacClients[id];
                    try { gc.guac.disconnect(); } catch(e) {}
                    try { gc.keyboard.reset(); } catch(e) {}
                    try { gc.resizeObserver.disconnect(); } catch(e) {}
                    if (gc.keepaliveWorker) {
                        try { gc.keepaliveWorker.postMessage('stop'); gc.keepaliveWorker.terminate(); } catch(e) {}
                    }
                    delete this._guacClients[id];
                }
            }

            origClose(id);
            this._syncSidebarActiveStates();
        };

        // When switching tabs, fit the terminal (including split panes).
        const origSwitch = this.tabManager.switchTab.bind(this.tabManager);
        this.tabManager.switchTab = (id) => {
            origSwitch(id);
            const info = this.tabManager.tabs.get(id);
            if (info && info.type === 'ssh') {
                requestAnimationFrame(() => {
                    const allIDs = this.splitManager.getAllSessionIDs(id);
                    for (const sid of allIDs) this.termManager.fitTerminal(sid);
                    this.termManager.focusTerminal(id);
                });
            } else if (info && info.type === 'rdp') {
                requestAnimationFrame(() => {
                    const panel = document.getElementById('panel-' + id);
                    if (panel) {
                        const vp = panel.querySelector('.rdp-viewport');
                        if (vp) vp.focus();
                    }
                });
            }
        };

        // Keyboard shortcut: Ctrl+Shift+T for new tab (prevent default).
        document.addEventListener('keydown', (e) => {
            const activeInfo = this.tabManager.activeTab && this.tabManager.tabs.get(this.tabManager.activeTab);
            if (activeInfo && activeInfo.type === 'rdp') return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
                if (this.tabManager.activeTab) {
                    e.preventDefault();
                    this.tabManager.closeTab(this.tabManager.activeTab);
                }
            }
            // Ctrl+F / Cmd+F: terminal search.
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                if (this.tabManager.activeTab) {
                    const entry = this.termManager.terminals.get(this.tabManager.activeTab);
                    if (entry && entry.searchAddon) {
                        e.preventDefault();
                        this._showTermSearch(this.tabManager.activeTab);
                    }
                }
            }
            // Escape: exit terminal fullscreen.
            if (e.key === 'Escape') {
                const active = this.tabManager.activeTab;
                if (active) {
                    const info = this.tabManager.tabs.get(active);
                    if (info) {
                        const wrapper = info.panel.querySelector('.term-panel-wrapper.fullscreen');
                        if (wrapper) {
                            e.preventDefault();
                            this._toggleTerminalFullscreen(active);
                        }
                    }
                }
            }
        });

        // Terminal search bar wiring.
        this._initTermSearch();
    }

    // ── Session Export ──────────────────────────────────────────────────

    async _exportSession(sessionID) {
        try {
            const resp = await fetch('/export-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionID })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Export failed');

            // Trigger browser download.
            const a = document.createElement('a');
            a.href = data.url;
            a.download = data.filename;
            a.click();
        } catch (err) {
            showToast('Export failed: ' + err.message);
        }
    }

    // ── Terminal Search (Ctrl+F) ──────────────────────────────────────────

    _initTermSearch() {
        const bar = document.getElementById('termSearchBar');
        const input = document.getElementById('termSearchInput');
        const prevBtn = document.getElementById('termSearchPrev');
        const nextBtn = document.getElementById('termSearchNext');
        const closeBtn = document.getElementById('termSearchClose');
        if (!bar || !input) return;

        this._searchSessionID = null;

        input.addEventListener('input', () => {
            const entry = this._searchSessionID && this.termManager.terminals.get(this._searchSessionID);
            if (entry && entry.searchAddon) {
                entry.searchAddon.findNext(input.value, { regex: false, caseSensitive: false, wholeWord: false });
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const entry = this._searchSessionID && this.termManager.terminals.get(this._searchSessionID);
                if (entry && entry.searchAddon) {
                    if (e.shiftKey) {
                        entry.searchAddon.findPrevious(input.value);
                    } else {
                        entry.searchAddon.findNext(input.value);
                    }
                }
            }
            if (e.key === 'Escape') {
                this._hideTermSearch();
            }
        });

        nextBtn?.addEventListener('click', () => {
            const entry = this._searchSessionID && this.termManager.terminals.get(this._searchSessionID);
            if (entry && entry.searchAddon) entry.searchAddon.findNext(input.value);
        });

        prevBtn?.addEventListener('click', () => {
            const entry = this._searchSessionID && this.termManager.terminals.get(this._searchSessionID);
            if (entry && entry.searchAddon) entry.searchAddon.findPrevious(input.value);
        });

        closeBtn?.addEventListener('click', () => this._hideTermSearch());
    }

    _showTermSearch(sessionID) {
        const bar = document.getElementById('termSearchBar');
        const input = document.getElementById('termSearchInput');
        if (!bar || !input) return;
        this._searchSessionID = sessionID;
        bar.style.display = 'flex';
        input.value = '';
        input.focus();
    }

    _hideTermSearch() {
        const bar = document.getElementById('termSearchBar');
        if (bar) bar.style.display = 'none';
        // Clear search highlights.
        if (this._searchSessionID) {
            const entry = this.termManager.terminals.get(this._searchSessionID);
            if (entry && entry.searchAddon) entry.searchAddon.clearDecorations();
        }
        this._searchSessionID = null;
        // Refocus the terminal.
        if (this.tabManager.activeTab) {
            this.termManager.focusTerminal(this.tabManager.activeTab);
        }
    }
}

// ---------------------------------------------------------------------------
// AI Chat Manager
// ---------------------------------------------------------------------------

class AIChatManager {
    constructor(app) {
        this.app = app;
        this.panel = document.getElementById('aiPanel');
        this.messagesEl = document.getElementById('aiMessages');
        this.input = document.getElementById('aiInput');
        this.sendBtn = document.getElementById('aiSendBtn');
        this.approvalBox = document.getElementById('aiApprovalBox');
        this.clearBtn = document.getElementById('aiClearBtn');
        this.closeBtn = document.getElementById('aiCloseBtn');
        this.conversationMessages = []; // full conversation history from server
        this.pendingToolCall = null;
        this.isStreaming = false;
        this._panelWidth = 400;
        this._setupEvents();
        this._setupResize();
    }

    toggle() {
        const isOpen = !this.panel.classList.contains('ai-hidden');
        if (isOpen) {
            this.panel.classList.add('ai-hidden');
            document.body.classList.remove('ai-open');
        } else {
            this.panel.classList.remove('ai-hidden');
            document.body.classList.add('ai-open');
            this.input.focus();
        }
        // Refit terminals after layout change
        setTimeout(() => this.app.termManager.resizeAll(), 250);
    }

    _setupEvents() {
        this.sendBtn.addEventListener('click', () => this._onSend());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._onSend();
            }
        });
        // Auto-grow textarea
        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = Math.min(this.input.scrollHeight, 100) + 'px';
        });
        this.clearBtn.addEventListener('click', () => this._clearConversation());
        this.closeBtn.addEventListener('click', () => this.toggle());
    }

    _setupResize() {
        const handle = this.panel.querySelector('.ai-resize-handle');
        let startX, startW;
        const onMove = (e) => {
            const delta = startX - e.clientX;
            const newW = Math.max(280, Math.min(window.innerWidth * 0.6, startW + delta));
            this._panelWidth = newW;
            this.panel.style.width = newW + 'px';
            document.body.style.setProperty('--ai-panel-w', newW + 'px');
            this.app.termManager.resizeAll();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        handle.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startW = this.panel.offsetWidth;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    _onSend() {
        const text = this.input.value.trim();
        if (!text || this.isStreaming) return;
        this.input.value = '';
        this.input.style.height = 'auto';

        // Cancel pending approval if user sends a new message instead
        if (this.pendingToolCall) {
            this.pendingToolCall = null;
            this._hideApproval();
        }

        this._addMessage('user', text);
        this.conversationMessages.push({ role: 'user', content: text });
        this._streamChat();
    }

    _streamChat() {
        this.isStreaming = true;
        this.sendBtn.disabled = true;

        // Show typing indicator
        this._showTyping();

        // Get active instance ID from the currently selected tab
        const activeInstanceId = this._getActiveInstanceId();

        const body = JSON.stringify({
            messages: this.conversationMessages,
            active_instance_id: activeInstanceId || ''
        });

        let msgEl = null;
        let assistantText = '';

        fetch('/ai-agent/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        }).then(response => {
            if (!response.ok) {
                return response.json().then(e => { throw new Error(e.error || 'Request failed'); });
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            const processChunk = ({ done, value }) => {
                if (done) {
                    this._hideTyping();
                    this.isStreaming = false;
                    this.sendBtn.disabled = false;
                    return;
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep incomplete line

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        switch (data.type) {
                            case 'text':
                                // Remove typing indicator on first text chunk
                                if (!msgEl) {
                                    this._hideTyping();
                                    msgEl = this._addMessage('assistant', '');
                                }
                                assistantText += data.text;
                                msgEl.innerHTML = this._renderMarkdown(assistantText);
                                this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
                                break;
                            case 'tool_call':
                                if (!msgEl) {
                                    this._hideTyping();
                                    msgEl = this._addMessage('assistant', '');
                                }
                                this._showApproval(data.tool_call);
                                break;
                            case 'error':
                                this._hideTyping();
                                if (msgEl && !assistantText) msgEl.remove();
                                this._addMessage('assistant', 'Error: ' + data.error);
                                this.isStreaming = false;
                                this.sendBtn.disabled = false;
                                return;
                            case 'done':
                                this._hideTyping();
                                if (data.messages) {
                                    this.conversationMessages = data.messages;
                                }
                                this.isStreaming = false;
                                this.sendBtn.disabled = false;
                                return;
                        }
                    } catch (e) { /* skip unparseable lines */ }
                }
                return reader.read().then(processChunk);
            };
            return reader.read().then(processChunk);
        }).catch(err => {
            this._hideTyping();
            this._addMessage('assistant', 'Error: ' + err.message);
            this.isStreaming = false;
            this.sendBtn.disabled = false;
        });
    }

    _showApproval(toolCall) {
        const args = typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments;
        const cmd = args.command || '';
        const instanceId = args.instance_id || '';
        const destructive = this._isDestructive(cmd);

        this.approvalBox.classList.remove('ai-hidden', 'destructive');
        if (destructive) this.approvalBox.classList.add('destructive');

        this.approvalBox.innerHTML = `
            <div class="ai-approval-label">Command Approval</div>
            <div class="ai-approval-cmd">${this._escapeHtml(cmd)}</div>
            <div class="ai-approval-target">Target: ${this._escapeHtml(instanceId)}</div>
            ${destructive ? '<div class="ai-approval-warn">BLOCKED: This command matches a destructive pattern and cannot be executed.</div>' : ''}
            <div class="ai-approval-actions">
                <button class="ai-approve-btn" id="aiApproveBtn" ${destructive ? 'disabled' : ''}>Approve</button>
                <button class="ai-reject-btn" id="aiRejectBtn">Reject</button>
            </div>
        `;

        this.pendingToolCall = toolCall;

        document.getElementById('aiApproveBtn').addEventListener('click', () => this._approveCommand());
        document.getElementById('aiRejectBtn').addEventListener('click', () => this._rejectCommand());
    }

    _approveCommand() {
        if (!this.pendingToolCall) return;
        const args = typeof this.pendingToolCall.arguments === 'string' ? JSON.parse(this.pendingToolCall.arguments) : this.pendingToolCall.arguments;
        const cmd = args.command || '';
        const instanceId = args.instance_id || '';

        // Find active session for this instance
        const sessionId = this._findSessionForInstance(instanceId);
        if (!sessionId) {
            this._addMessage('assistant', `No active SSH session for ${instanceId}. Open an SSH session first.`);
            this._hideApproval();
            this._addToolResult(this.pendingToolCall.id, 'Error: No active SSH session for this instance. The user needs to open an SSH session first.');
            this._streamChat();
            return;
        }

        this._hideApproval();
        this._addMessage('assistant', `Executing: \`${cmd}\``);

        // Type command into the terminal via WebSocket
        this.app.ws.send('terminal_input', {
            session_id: sessionId,
            input: cmd + '\r'
        });

        // Capture output
        this._captureOutput(sessionId).then(output => {
            if (output) {
                this._addMessage('assistant', '```\n' + output + '\n```');
            }
            this._addToolResult(this.pendingToolCall.id, output || '(no output captured)');
            this.pendingToolCall = null;
            this._streamChat();
        });
    }

    _rejectCommand() {
        this._hideApproval();
        this._addMessage('assistant', 'Command rejected by user.');
        this._addToolResult(this.pendingToolCall.id, 'Command rejected by user. Do not retry this command.');
        this.pendingToolCall = null;
        this._streamChat();
    }

    _addToolResult(toolCallId, result) {
        this.conversationMessages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCallId
        });
    }

    _captureOutput(sessionId) {
        return new Promise(resolve => {
            let buffer = '';
            let timer = null;
            let maxTimer = null;
            const promptPattern = /[$#>]\s*$|PS [A-Z]:\\.*>/;

            const handler = (payload) => {
                if (payload.session_id !== sessionId) return;
                buffer += payload.output;

                // Reset inactivity timer
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    cleanup();
                    resolve(buffer.trim());
                }, 3000); // 3s of inactivity

                // Check for prompt pattern
                if (promptPattern.test(buffer)) {
                    if (timer) clearTimeout(timer);
                    // Small delay to catch any trailing output
                    timer = setTimeout(() => {
                        cleanup();
                        resolve(buffer.trim());
                    }, 500);
                }
            };

            const cleanup = () => {
                this.app.ws.off('terminal_output', handler);
                if (maxTimer) clearTimeout(maxTimer);
                if (timer) clearTimeout(timer);
            };

            this.app.ws.on('terminal_output', handler);

            // Max timeout: 30s safety cutoff
            maxTimer = setTimeout(() => {
                cleanup();
                resolve(buffer.trim());
            }, 30000);
        });
    }

    _findSessionForInstance(instanceId) {
        // Check open tabs — tab IDs are like "i-0abc123-ssh-1"
        const tabs = this.app.tabManager.tabs;
        for (const [tabId] of tabs) {
            if (tabId.includes(instanceId) && tabId.includes('ssh')) {
                return tabId;
            }
        }
        // Fallback: check if any active tab matches
        const active = this.app.tabManager.activeTab;
        if (active && active.includes(instanceId)) return active;
        return null;
    }

    _getActiveInstanceId() {
        const activeTab = this.app.tabManager.activeTab;
        if (!activeTab) return '';
        // Tab IDs are typically like "i-0abc123def-ssh" or similar
        const match = activeTab.match(/i-[a-f0-9]+/);
        return match ? match[0] : '';
    }

    _hideApproval() {
        this.approvalBox.classList.add('ai-hidden');
        this.approvalBox.innerHTML = '';
    }

    _addMessage(role, content) {
        const div = document.createElement('div');
        div.className = `ai-msg ${role}`;
        div.innerHTML = role === 'user' ? this._escapeHtml(content) : this._renderMarkdown(content);
        this.messagesEl.appendChild(div);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        return div;
    }

    _showTyping() {
        this._hideTyping();
        const div = document.createElement('div');
        div.className = 'ai-typing-indicator';
        div.innerHTML = '<span></span><span></span><span></span>';
        this.messagesEl.appendChild(div);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    _hideTyping() {
        const el = this.messagesEl.querySelector('.ai-typing-indicator');
        if (el) el.remove();
    }

    _clearConversation() {
        this.conversationMessages = [];
        this.messagesEl.innerHTML = '';
        this._hideApproval();
    }

    _isDestructive(cmd) {
        // Check each pipeline segment's leading command, not grep/awk arguments
        const segments = cmd.split(/\s*\|\s*/);
        const patterns = [
            /\brm\s+(-[a-z]*f|-[a-z]*r|--force|--recursive)\b/i,
            /\brm\s+-rf\b/i,
            /\bmkfs\b/i,
            /\bdd\s+.*of=\/dev\//i,
            /:()\{\s*:\|:&\s*\};:/,
            /^\s*shutdown\b/i,
            /^\s*reboot\b/i,
            /^\s*init\s+[06]\b/i,
            /\bsystemctl\s+(stop|disable|mask)\b/i,
            /\biptables\s+-F\b/i,
            /\bchmod\s+-R\s+777\b/i,
            /\bkill\s+-9\s+-1\b/i,
            />\s*\/dev\/sda/i,
            /^\s*format\b.*\b[cC]:\b/i,
            /^\s*del\s+\/[sS]\b/i,
            /\bStop-Computer\b/i,
            /\bRestart-Computer\b/i,
            /\bdrop\s+database\b/i,
            /\btruncate\s+table\b/i,
        ];
        return segments.some(seg => patterns.some(p => p.test(seg)));
    }

    _renderMarkdown(text) {
        if (!text) return '';
        // Basic markdown rendering
        let html = this._escapeHtml(text);
        // Code blocks
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Headers (must be before bold)
        html = html.replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:13px;">$1</h4>');
        html = html.replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 4px;font-size:14px;">$1</h3>');
        html = html.replace(/^# (.+)$/gm, '<h2 style="margin:12px 0 6px;font-size:15px;">$1</h2>');
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        // Bullet lists
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        // Numbered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        // Newlines to <br> (outside of pre blocks)
        html = html.replace(/\n/g, '<br>');
        // Clean up double <br> inside pre
        html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (m, code) => {
            return '<pre><code>' + code.replace(/<br>/g, '\n') + '</code></pre>';
        });
        return html;
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const config = window.CLOUDTERM_CONFIG || {};
    const app = new CloudTermApp(config);
    app.init();
    window.cloudterm = app;
    window._deleteVaultEntry = function(id) {
        if (!confirm('Delete this saved credential?')) return;
        fetch('/vault/credentials?id=' + encodeURIComponent(id), { method: 'DELETE' })
            .then(() => { showToast('Credential deleted'); app._loadVaultEntries(); })
            .catch(() => showToast('Delete failed'));
    };
    window._editVaultEntry = function(ruleId) {
        fetch('/vault/credentials').then(function(r) { return r.json(); }).then(function(entries) {
            var entry = entries.find(function(e) { return e.rule.id === ruleId; });
            if (!entry) { showToast('Entry not found'); return; }
            var row = document.querySelector('[onclick*="' + ruleId + '"][title="Edit password"]');
            var container = row ? row.closest('div[style*="margin-bottom"]') || row.parentElement : null;
            if (!container) return;
            var editDiv = container.querySelector('.vault-edit-form');
            if (editDiv) { editDiv.remove(); return; }
            editDiv = document.createElement('div');
            editDiv.className = 'vault-edit-form';
            editDiv.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 12px 4px 54px;';
            editDiv.innerHTML =
                '<input type="password" id="vaultEditPw_' + ruleId + '" placeholder="New password" style="flex:1;padding:6px 10px;background:var(--s2);border:1px solid var(--b1);border-radius:6px;color:var(--text);font-size:12px;font-family:\'JetBrains Mono\',monospace;outline:none;">' +
                '<button onclick="window._saveVaultPassword(\'' + ruleId + '\')" style="padding:6px 14px;background:linear-gradient(135deg,rgba(61,220,132,.2),rgba(108,92,231,.15));border:1px solid rgba(61,220,132,.4);border-radius:6px;color:var(--ssh);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:\'Lato\',sans-serif;">Save</button>' +
                '<button onclick="this.closest(\'.vault-edit-form\').remove()" style="padding:6px 10px;background:var(--s2);border:1px solid var(--b1);border-radius:6px;color:var(--muted);font-size:12px;cursor:pointer;font-family:\'Lato\',sans-serif;">Cancel</button>';
            container.appendChild(editDiv);
            document.getElementById('vaultEditPw_' + ruleId).focus();
        });
    };
    window._saveVaultPassword = function(ruleId) {
        var pwInput = document.getElementById('vaultEditPw_' + ruleId);
        if (!pwInput || !pwInput.value.trim()) { showToast('Enter a password'); return; }
        fetch('/vault/credentials').then(function(r) { return r.json(); }).then(function(entries) {
            var entry = entries.find(function(e) { return e.rule.id === ruleId; });
            if (!entry) { showToast('Entry not found'); return; }
            entry.credential.password = pwInput.value.trim();
            return fetch('/vault/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            });
        }).then(function(r) {
            if (r && r.ok) {
                showToast('Password updated');
                app._loadVaultEntries();
            } else {
                showToast('Update failed');
            }
        }).catch(function() { showToast('Update failed'); });
    };
});

// ---------------------------------------------------------------------------
// Spotlight Search (/ key)
// ---------------------------------------------------------------------------

(function() {
    'use strict';

    var bg = null;
    var input = null;
    var results = null;
    var activeIdx = -1;
    var items = [];

    function getInstances() {
        var app = window.cloudterm;
        if (!app || !app.sidebar || !app.sidebar._allInstances) return [];
        return app.sidebar._allInstances;
    }

    function open() {
        if (!bg) return;
        bg.classList.add('show');
        input.value = '';
        activeIdx = -1;
        render(getInstances());
        requestAnimationFrame(function() { input.focus(); });
    }

    function close() {
        if (!bg) return;
        bg.classList.remove('show');
        input.value = '';
        results.innerHTML = '';
    }

    function fuzzyMatch(query, text) {
        var t = text.toLowerCase();
        var terms = query.toLowerCase().split(/\s+/).filter(function(s) { return s.length > 0; });
        for (var i = 0; i < terms.length; i++) {
            if (t.indexOf(terms[i]) === -1) return false;
        }
        return true;
    }

    function render(filtered) {
        items = filtered;
        if (filtered.length === 0) {
            results.innerHTML = '<div class="spotlight-empty">No instances found</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < Math.min(filtered.length, 50); i++) {
            var inst = filtered[i];
            var connType = inst.platform === 'windows' ? 'rdp' : 'ssh';
            var stateClass = inst.state === 'running' ? 'running' : (inst.state === 'stopped' ? 'stopped' : 'other');
            html += '<div class="spotlight-item' + (i === activeIdx ? ' active' : '') + '" data-idx="' + i + '">';
            html += '<div class="sp-dot ' + stateClass + '"></div>';
            html += '<div class="sp-info">';
            html += '<div class="sp-name">' + esc(inst.name || inst.instance_id) + '</div>';
            html += '<div class="sp-meta">' + esc(inst.instance_id) + (inst.private_ip ? ' \u2022 ' + esc(inst.private_ip) : '') + '</div>';
            html += '</div>';
            html += '<span class="sp-badge ' + connType + '">' + connType + '</span>';
            html += '</div>';
        }
        results.innerHTML = html;

        results.querySelectorAll('.spotlight-item').forEach(function(el) {
            el.addEventListener('click', function() {
                connectItem(parseInt(el.dataset.idx));
            });
            el.addEventListener('mouseenter', function() {
                setActive(parseInt(el.dataset.idx), false);
            });
            el.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                var idx = parseInt(el.dataset.idx);
                if (idx < 0 || idx >= items.length) return;
                var inst = items[idx];
                var app = window.cloudterm;
                if (!app || !app.sidebar) return;
                var connType = inst.platform === 'windows' ? 'rdp' : 'ssh';
                app.sidebar._showContextMenu(e, inst.instance_id, inst.name || inst.instance_id, connType);
            });
        });
    }

    function setActive(idx, scroll) {
        activeIdx = idx;
        results.querySelectorAll('.spotlight-item').forEach(function(el, i) {
            el.classList.toggle('active', i === idx);
        });
        if (scroll !== false) {
            var active = results.querySelector('.spotlight-item.active');
            if (active) active.scrollIntoView({ block: 'nearest' });
        }
    }

    function connectItem(idx) {
        if (idx < 0 || idx >= items.length) return;
        var inst = items[idx];
        var app = window.cloudterm;
        if (!app) return;
        var connType = inst.platform === 'windows' ? 'rdp' : 'ssh';
        app.openSession(inst.instance_id, inst.name || inst.instance_id, connType);
    }

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    function init() {
        bg = document.getElementById('spotlightBg');
        input = document.getElementById('spotlightInput');
        results = document.getElementById('spotlightResults');
        if (!bg || !input || !results) return;

        bg.addEventListener('click', function(e) {
            if (e.target === bg) close();
        });

        input.addEventListener('input', function() {
            var q = input.value.trim();
            var all = getInstances();
            if (!q) { activeIdx = -1; render(all); return; }
            var filtered = all.filter(function(inst) {
                var searchable = (inst.name || '') + ' ' + inst.instance_id + ' ' + (inst.private_ip || '') + ' ' + (inst.public_ip || '') + ' ' + (inst.platform || '');
                return fuzzyMatch(q, searchable);
            });
            activeIdx = filtered.length > 0 ? 0 : -1;
            render(filtered);
        });

        input.addEventListener('keydown', function(e) {
            var count = Math.min(items.length, 50);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive(activeIdx < count - 1 ? activeIdx + 1 : 0);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(activeIdx > 0 ? activeIdx - 1 : count - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                connectItem(activeIdx);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                var tag = (e.target.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
                e.preventDefault();
                open();
            }
            if (e.key === 'Escape' && bg && bg.classList.contains('show')) {
                close();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ---------------------------------------------------------------------------
// Cost Explorer
// ---------------------------------------------------------------------------

(function() {
    'use strict';

    var CE_COLORS = [
        '#6C5CE7', '#00B894', '#FDCB6E', '#E17055', '#0984E3',
        '#D63031', '#E84393', '#00CEC9', '#FAB1A0', '#74B9FF',
        '#55EFC4', '#A29BFE', '#FF7675', '#FD79A8', '#636E72'
    ];

    var CE_COST_FIELDS = { last_month: true, this_month: true, last_7_days: true, yesterday: true };

    var ceCharts = {};

    var ceState = {
        data: null,
        svcSortCol: 'this_month',
        svcSortDir: 'desc',
        svcShowAll: false,
        filterAccount: '',
        filterService: '',
        filterTag: ''
    };

    function ceFormatCost(amount) {
        if (amount == null || isNaN(amount)) return '$0.00';
        if (Math.abs(amount) >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
        return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function ceDestroyCharts() {
        for (var k in ceCharts) { if (ceCharts[k]) ceCharts[k].destroy(); }
        ceCharts = {};
    }

    function ceSetLoading(on) {
        var el = document.getElementById('ceLoading');
        if (el) el.classList.toggle('active', on);
    }

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    function ceSection(title, bodyHtml, sectionId) {
        var chevron = '<svg class="ce-section-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
        return '<div class="ce-section-card"' + (sectionId ? ' id="' + sectionId + '"' : '') + '>' +
               '<div class="ce-section-header" data-ce-toggle>' +
               '<span class="ce-section-title">' + title + '</span>' +
               chevron +
               '</div>' +
               '<div class="ce-section-body">' + bodyHtml + '</div>' +
               '</div>';
    }

    function ceTagTable(tagKey, items) {
        var html = '<div class="ce-table-wrap" style="border:none;border-radius:0;"><table class="ce-table"><thead><tr>';
        html += '<th>' + esc(tagKey) + '</th><th>Account</th>';
        ['Last Month', 'This Month', 'Last 7 Days', 'Yesterday'].forEach(function(h) {
            html += '<th style="text-align:right;">' + h + '</th>';
        });
        html += '</tr></thead><tbody>';
        (items || []).forEach(function(row) {
            html += '<tr>' +
                '<td>' + esc(row.value || '') + '</td>' +
                '<td>' + esc(row.account || '') + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(row.last_month) + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(row.this_month) + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(row.last_7_days) + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(row.yesterday) + '</td>' +
                '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    function ceRenderDashboard(data) {
        var area = document.getElementById('ceDashArea');
        if (!area) return;
        ceDestroyCharts();
        var html = '';

        var tmChange = data.total_last_month ? ((data.total_this_month - data.total_last_month) / data.total_last_month * 100) : 0;
        var ydChange = data.total_day_before ? ((data.total_yesterday - data.total_day_before) / data.total_day_before * 100) : 0;
        var dailyAvg = (data.total_last_7_days || 0) / 7;

        html += '<div class="ce-kpi-row">';
        var tmArrow = tmChange < 0 ? '&#8595;' : '&#8593;';
        var tmColor = tmChange < 0 ? 'var(--ssh)' : 'var(--red)';
        html += '<div class="ce-kpi-card" style="--kpi-a:#6C5CE7;--kpi-b:#a29bfe;">' +
                '<div class="ce-kpi-label">This Month</div>' +
                '<div class="ce-kpi-value">' + ceFormatCost(data.total_this_month) + '</div>' +
                '<div class="ce-kpi-trend" style="color:' + tmColor + ';">' + tmArrow + ' ' + Math.abs(tmChange).toFixed(1) + '% vs last month</div>' +
                '</div>';
        html += '<div class="ce-kpi-card" style="--kpi-a:#0984E3;--kpi-b:#74b9ff;">' +
                '<div class="ce-kpi-label">Last Month</div>' +
                '<div class="ce-kpi-value">' + ceFormatCost(data.total_last_month) + '</div>' +
                '<div class="ce-kpi-trend" style="color:var(--dim);">Full month total</div>' +
                '</div>';
        html += '<div class="ce-kpi-card" style="--kpi-a:#00B894;--kpi-b:#55efc4;">' +
                '<div class="ce-kpi-label">Last 7 Days</div>' +
                '<div class="ce-kpi-value">' + ceFormatCost(data.total_last_7_days) + '</div>' +
                '<div class="ce-kpi-trend" style="color:var(--dim);">' + ceFormatCost(dailyAvg) + '/day avg</div>' +
                '</div>';
        var ydArrow = ydChange < 0 ? '&#8595;' : '&#8593;';
        var ydColor = ydChange < 0 ? 'var(--ssh)' : 'var(--red)';
        html += '<div class="ce-kpi-card" style="--kpi-a:#FDCB6E;--kpi-b:#e17055;">' +
                '<div class="ce-kpi-label">Yesterday</div>' +
                '<div class="ce-kpi-value">' + ceFormatCost(data.total_yesterday) + '</div>' +
                '<div class="ce-kpi-trend" style="color:' + ydColor + ';">' + ydArrow + ' ' + Math.abs(ydChange).toFixed(1) + '% vs prev day</div>' +
                '</div>';
        html += '</div>';

        html += '<div class="ce-charts-row">';
        html += '<div class="ce-chart-card">' +
                '<div class="ce-chart-title">Daily Cost Trend</div>' +
                '<div style="font-size:11px;color:var(--dim);margin-top:-2px;margin-bottom:6px;">Last 60 days spend</div>' +
                '<div class="ce-chart-canvas-wrap" style="min-height:220px;"><canvas id="ceTrendCanvas"></canvas></div>' +
                '</div>';
        html += '<div class="ce-chart-card">' +
                '<div class="ce-chart-title">Cost by Account</div>' +
                '<div style="font-size:11px;color:var(--dim);margin-top:-2px;margin-bottom:6px;">This month distribution</div>' +
                '<div class="ce-chart-canvas-wrap" style="min-height:220px;"><canvas id="ceAccountDonut"></canvas></div>' +
                '</div>';
        html += '</div>';

        var drivers = (data.top_cost_drivers || []).slice(0, 10);
        if (drivers.length) {
            var driversHtml = '<div class="ce-drivers-list">';
            drivers.forEach(function(d, i) {
                var pct = d.percentage || 0;
                var color = CE_COLORS[i % CE_COLORS.length];
                var changeStr = '';
                if (d.change != null) {
                    var chgArrow = d.change < 0 ? '&#8595;' : '&#8593;';
                    var chgColor = d.change < 0 ? 'var(--ssh)' : 'var(--red)';
                    changeStr = '<span class="ce-driver-change" style="color:' + chgColor + ';">' + chgArrow + ' ' + Math.abs(d.change).toFixed(1) + '% vs LM</span>';
                }
                driversHtml += '<div class="ce-driver-item">' +
                    '<div class="ce-driver-meta">' +
                    '<span class="ce-driver-name">' + esc(d.service || '') + '</span>' +
                    '<div class="ce-driver-right">' +
                    '<span class="ce-driver-cost">' + ceFormatCost(d.this_month) + '</span>' +
                    '<span class="ce-driver-pct">' + pct.toFixed(1) + '%</span>' +
                    changeStr +
                    '</div>' +
                    '</div>' +
                    '<div class="ce-driver-bar-track">' +
                    '<div class="ce-driver-bar-fill" style="width:' + Math.min(pct, 100) + '%;background:' + color + ';"></div>' +
                    '</div>' +
                    '</div>';
            });
            driversHtml += '</div>';
            html += '<div class="ce-section-card">' +
                '<div class="ce-section-header" data-ce-toggle>' +
                '<div><div class="ce-section-title">Core Cost Drivers</div>' +
                '<div style="font-size:11px;color:var(--dim);margin-top:2px;">Leading service expenditures by monthly volume</div></div>' +
                '<svg class="ce-section-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
                '</div>' +
                '<div class="ce-section-body">' + driversHtml + '</div>' +
                '</div>';
        }

        var accBody = '<div class="ce-table-wrap" style="border:none;border-radius:0;">' +
            '<table class="ce-table"><thead><tr>' +
            '<th>Account</th>' +
            '<th style="text-align:right;">This Month</th>' +
            '<th style="text-align:right;">Last Month</th>' +
            '<th style="text-align:right;">Last 7 Days</th>' +
            '<th style="text-align:right;">Yesterday</th>' +
            '<th style="text-align:right;">Trend</th>' +
            '</tr></thead><tbody>';
        (data.accounts || []).forEach(function(a) {
            var tm = a.this_month || 0;
            var lm = a.last_month || 0;
            var sparkColor = (lm > 0 && tm < lm) ? '#00B894' : '#E17055';
            var sparkHgt = lm > 0 ? Math.min(100, Math.round(tm / lm * 80)) : 20;
            var sparkBar = '<div class="ce-sparkline">' +
                '<div class="ce-spark-bar" style="height:80%;background:#6C5CE7;opacity:0.6;"></div>' +
                '<div class="ce-spark-bar" style="height:' + sparkHgt + '%;background:' + sparkColor + ';"></div>' +
                '</div>';
            accBody += '<tr>' +
                '<td>' + esc(a.alias || a.account_id) + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(tm) + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(lm) + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(a.last_7_days) + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(a.yesterday) + '</td>' +
                '<td style="text-align:right;">' + sparkBar + '</td>' +
                '</tr>';
        });
        accBody += '<tr class="ce-totals-row">' +
            '<td>Total</td>' +
            '<td class="ce-cost-cell">' + ceFormatCost(data.total_this_month) + '</td>' +
            '<td class="ce-cost-cell">' + ceFormatCost(data.total_last_month) + '</td>' +
            '<td class="ce-cost-cell">' + ceFormatCost(data.total_last_7_days) + '</td>' +
            '<td class="ce-cost-cell">' + ceFormatCost(data.total_yesterday) + '</td>' +
            '<td></td>' +
            '</tr>';
        accBody += '</tbody></table></div>';
        html += ceSection('Account Portfolio', accBody);

        var accountNames = (data.accounts || []).map(function(a) { return a.alias || a.account_id; });
        html += '<div class="ce-filter-bar">';
        html += '<span class="ce-filter-label">Filters</span>';
        html += '<select id="ceFilterAccount" class="ce-tag-select" style="width:auto;min-width:160px;max-width:220px;">';
        html += '<option value="">All Accounts</option>';
        accountNames.forEach(function(n) {
            html += '<option value="' + esc(n) + '"' + (ceState.filterAccount === n ? ' selected' : '') + '>' + esc(n) + '</option>';
        });
        html += '</select>';
        html += '<input type="text" id="ceFilterService" class="ce-tag-input" placeholder="Filter services..." value="' + esc(ceState.filterService) + '" style="width:auto;min-width:180px;max-width:260px;">';
        html += '<input type="text" id="ceFilterTag" class="ce-tag-input" placeholder="Filter tags..." value="' + esc(ceState.filterTag) + '" style="width:auto;min-width:160px;max-width:220px;">';
        if (ceState.filterAccount || ceState.filterService || ceState.filterTag) {
            html += '<button id="ceClearFilters" class="ce-preset-btn" style="color:var(--red);border-color:rgba(214,48,49,.3);">Clear Filters</button>';
        }
        html += '</div>';

        var fAccount = ceState.filterAccount.toLowerCase();
        var fService = ceState.filterService.toLowerCase();
        var fTag = ceState.filterTag.toLowerCase();

        var svcData = (data.service_breakdown || []).slice().filter(function(r) {
            if (fAccount && (r.account || '').toLowerCase().indexOf(fAccount) === -1) return false;
            if (fService && (r.service || '').toLowerCase().indexOf(fService) === -1) return false;
            return true;
        });
        var sc = ceState.svcSortCol, sd = ceState.svcSortDir;
        svcData.sort(function(a, b) {
            var av = CE_COST_FIELDS[sc] ? (a[sc] || 0) : (a[sc] || '').toLowerCase();
            var bv = CE_COST_FIELDS[sc] ? (b[sc] || 0) : (b[sc] || '').toLowerCase();
            if (av < bv) return sd === 'asc' ? -1 : 1;
            if (av > bv) return sd === 'asc' ? 1 : -1;
            return 0;
        });
        var svcVisible = ceState.svcShowAll ? svcData : svcData.slice(0, 50);
        var svcBody = '<div class="ce-table-wrap" style="border:none;border-radius:0;">' +
            '<table class="ce-table" id="ceSvcTable"><thead><tr>';
        [
            { key: 'service', label: 'Service', right: false },
            { key: 'account', label: 'Account', right: false },
            { key: 'last_month', label: 'Last Month', right: true },
            { key: 'this_month', label: 'This Month', right: true },
            { key: 'last_7_days', label: 'Last 7 Days', right: true },
            { key: 'yesterday', label: 'Yesterday', right: true }
        ].forEach(function(col) {
            var sorted = sc === col.key;
            var arrow = sorted ? (sd === 'asc' ? ' \u2191' : ' \u2193') : '';
            svcBody += '<th data-svc-col="' + col.key + '"' +
                (col.right ? ' style="text-align:right;"' : '') +
                (sorted ? ' class="sort-' + sd + '"' : '') + '>' +
                col.label + '<span class="sort-arrow">' + arrow + '</span></th>';
        });
        svcBody += '</tr></thead><tbody>';
        svcVisible.forEach(function(row) {
            svcBody += '<tr>' +
                '<td>' + esc(row.service || '') + '</td>' +
                '<td>' + esc(row.account || '') + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(row.last_month) + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(row.this_month) + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(row.last_7_days) + '</td>' +
                '<td class="ce-cost-cell">' + ceFormatCost(row.yesterday) + '</td>' +
                '</tr>';
        });
        svcBody += '</tbody></table></div>';
        if (!ceState.svcShowAll && svcData.length > 50) {
            svcBody += '<div style="padding:10px 14px;">' +
                '<button class="ce-preset-btn" id="ceSvcShowAll">Show All (' + svcData.length + ' rows)</button>' +
                '</div>';
        }
        html += ceSection('Service Breakdown', svcBody, 'ceSvcSection');

        var regionData = (data.region_breakdown || []).filter(function(r) {
            if (fAccount && (r.account || '').toLowerCase().indexOf(fAccount) === -1) return false;
            return true;
        });
        if (regionData.length) {
            var regionBody = '<div class="ce-table-wrap" style="border:none;border-radius:0;">' +
                '<table class="ce-table"><thead><tr>' +
                '<th>Region</th><th>Account</th>' +
                '<th style="text-align:right;">This Month</th>' +
                '<th style="text-align:right;">Last Month</th>' +
                '</tr></thead><tbody>';
            regionData.forEach(function(row) {
                regionBody += '<tr>' +
                    '<td>' + esc(row.region || '') + '</td>' +
                    '<td>' + esc(row.account || '') + '</td>' +
                    '<td class="ce-cost-cell">' + ceFormatCost(row.this_month) + '</td>' +
                    '<td class="ce-cost-cell">' + ceFormatCost(row.last_month) + '</td>' +
                    '</tr>';
            });
            regionBody += '</tbody></table></div>';
            html += ceSection('Cost by Region', regionBody);
        }

        var tags = data.tag_breakdown || {};
        if (tags.Customer && tags.Customer.length) {
            var filteredCustomer = tags.Customer.filter(function(r) {
                if (fAccount && (r.account || '').toLowerCase().indexOf(fAccount) === -1) return false;
                if (fTag && (r.value || '').toLowerCase().indexOf(fTag) === -1) return false;
                return true;
            });
            if (filteredCustomer.length) html += ceSection('Cost by Customer', ceTagTable('Customer', filteredCustomer));
        }
        if (tags.ProjectCode && tags.ProjectCode.length) {
            var filteredProject = tags.ProjectCode.filter(function(r) {
                if (fAccount && (r.account || '').toLowerCase().indexOf(fAccount) === -1) return false;
                if (fTag && (r.value || '').toLowerCase().indexOf(fTag) === -1) return false;
                return true;
            });
            if (filteredProject.length) html += ceSection('Cost by ProjectCode', ceTagTable('ProjectCode', filteredProject));
        }

        area.innerHTML = html;

        area.querySelectorAll('.ce-section-header[data-ce-toggle]').forEach(function(header) {
            header.addEventListener('click', function() {
                header.closest('.ce-section-card').classList.toggle('collapsed');
            });
        });

        area.querySelectorAll('#ceSvcTable th[data-svc-col]').forEach(function(th) {
            th.addEventListener('click', function(e) {
                e.stopPropagation();
                var col = th.dataset.svcCol;
                if (ceState.svcSortCol === col) {
                    ceState.svcSortDir = ceState.svcSortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    ceState.svcSortCol = col;
                    ceState.svcSortDir = CE_COST_FIELDS[col] ? 'desc' : 'asc';
                }
                ceRenderDashboard(ceState.data);
            });
        });

        var showAllBtn = document.getElementById('ceSvcShowAll');
        if (showAllBtn) {
            showAllBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                ceState.svcShowAll = true;
                ceRenderDashboard(ceState.data);
            });
        }

        var filterAccount = document.getElementById('ceFilterAccount');
        if (filterAccount) {
            filterAccount.addEventListener('change', function() {
                ceState.filterAccount = this.value;
                ceRenderDashboard(ceState.data);
            });
        }
        var filterService = document.getElementById('ceFilterService');
        if (filterService) {
            var debounce = null;
            filterService.addEventListener('input', function() {
                var val = this.value;
                clearTimeout(debounce);
                debounce = setTimeout(function() {
                    ceState.filterService = val;
                    ceRenderDashboard(ceState.data);
                }, 300);
            });
        }
        var filterTag = document.getElementById('ceFilterTag');
        if (filterTag) {
            var debounceTag = null;
            filterTag.addEventListener('input', function() {
                var val = this.value;
                clearTimeout(debounceTag);
                debounceTag = setTimeout(function() {
                    ceState.filterTag = val;
                    ceRenderDashboard(ceState.data);
                }, 300);
            });
        }
        var clearBtn = document.getElementById('ceClearFilters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                ceState.filterAccount = '';
                ceState.filterService = '';
                ceState.filterTag = '';
                ceRenderDashboard(ceState.data);
            });
        }

        setTimeout(function() { ceInitCharts(data); }, 0);
    }

    function ceInitCharts(data) {
        var trendCanvas = document.getElementById('ceTrendCanvas');
        if (trendCanvas && data.daily_trend && data.daily_trend.length && window.Chart) {
            var trendLabels = data.daily_trend.map(function(d) {
                var parts = d.date.split('-');
                return parts[1] + '/' + parts[2];
            });
            var trendCosts = data.daily_trend.map(function(d) { return d.cost || 0; });
            ceCharts.trend = new Chart(trendCanvas, {
                type: 'line',
                data: {
                    labels: trendLabels,
                    datasets: [{
                        data: trendCosts,
                        borderColor: '#6C5CE7',
                        backgroundColor: 'rgba(108,92,231,0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            ticks: { color: '#6b82a8', maxTicksLimit: 8, font: { size: 10 } },
                            grid: { color: 'rgba(255,255,255,0.04)' }
                        },
                        y: {
                            ticks: {
                                color: '#6b82a8',
                                font: { size: 10 },
                                callback: function(v) { return '$' + (v / 1000).toFixed(0) + 'K'; }
                            },
                            grid: { color: 'rgba(255,255,255,0.04)' }
                        }
                    }
                }
            });
        }

        var donutCanvas = document.getElementById('ceAccountDonut');
        if (donutCanvas && data.accounts && data.accounts.length && window.Chart) {
            var accNames = data.accounts.map(function(a) { return a.alias || a.account_id; });
            var accCosts = data.accounts.map(function(a) { return a.this_month || 0; });
            ceCharts.donut = new Chart(donutCanvas, {
                type: 'doughnut',
                data: {
                    labels: accNames,
                    datasets: [{
                        data: accCosts,
                        backgroundColor: CE_COLORS.slice(0, accNames.length),
                        borderColor: 'transparent',
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                color: '#6b82a8',
                                font: { size: 11 },
                                padding: 8,
                                boxWidth: 12
                            }
                        }
                    }
                }
            });
        }
    }

    async function ceLoadAll() {
        ceSetLoading(true);
        var area = document.getElementById('ceDashArea');
        if (area) area.innerHTML = '';
        try {
            var resp = await fetch('/cost-explorer/comprehensive');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            ceState.data = await resp.json();
            ceRenderDashboard(ceState.data);
        } catch (e) {
            if (area) {
                area.innerHTML = '<div style="padding:40px;text-align:center;color:var(--dim);">Failed to load cost data. ' + esc(String(e.message || '')) + '</div>';
            }
        } finally {
            ceSetLoading(false);
        }
    }

    function ceExportCSV() {
        if (!ceState.data || !ceState.data.service_breakdown || !ceState.data.service_breakdown.length) {
            showToast('No data to export');
            return;
        }
        var rows = ceState.data.service_breakdown;
        var header = 'Service,Account,Last Month,This Month,Last 7 Days,Yesterday\n';
        var body = rows.map(function(r) {
            return [r.service || '', r.account || '', r.last_month || 0, r.this_month || 0, r.last_7_days || 0, r.yesterday || 0]
                .map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
        }).join('\n');
        var blob = new Blob([header + body], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'cost-explorer.csv';
        a.click();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    function ceInit() {
        var btn = document.getElementById('costExplorerBtn');
        if (!btn) return;
        btn.addEventListener('click', function() {
            var dashHost = location.hostname;
            window.open('http://' + dashHost + ':5173', '_blank');
        });

        var k8sBtn = document.getElementById('k8sBtn');
        if (k8sBtn) {
            k8sBtn.addEventListener('click', function() {
                window.open('/k8s/', '_blank');
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ceInit);
    } else {
        ceInit();
    }
})();
