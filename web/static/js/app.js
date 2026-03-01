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
}

// ---------------------------------------------------------------------------
// Terminal Manager
// ---------------------------------------------------------------------------

class TerminalManager {
    constructor(wsManager) {
        this.terminals = new Map(); // sessionID -> {term, fitAddon, instanceID, instanceName}
        this.wsManager = wsManager;
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

        term.onData((data) => {
            this.wsManager.send('terminal_input', {
                session_id: sessionID,
                input: data
            });
        });

        term.onResize(({ cols, rows }) => {
            this.wsManager.send('terminal_resize', {
                session_id: sessionID,
                rows: rows,
                cols: cols
            });
        });

        term.open(containerEl);

        // Slight delay so the container has layout dimensions before fitting.
        requestAnimationFrame(() => {
            try { fitAddon.fit(); } catch (e) { /* container not yet visible */ }
        });

        this.terminals.set(sessionID, { term, fitAddon, instanceID, instanceName });

        // Tell the backend to start the SSM session. The instance lookup provides
        // aws_profile and aws_region, but we may not have those on the client at
        // this point. The backend will pull them from the cached instance data
        // when only instance_id is supplied.
        this.wsManager.send('start_session', {
            instance_id: instanceID,
            session_id: sessionID
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
        tab.innerHTML =
            '<span class="tab-type ' + type + '">' + type.toUpperCase() + '</span> ' +
            this._escapeHTML(name) +
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

        if (type === 'ssh') {
            panel.innerHTML =
                '<div class="terminal-container" style="flex:1;overflow:hidden;"></div>';
        } else {
            panel.innerHTML =
                '<div class="rdp-viewport" style="flex:1;display:flex;align-items:center;justify-content:center;">' +
                '<span style="color:var(--muted);font-size:13px;">Preparing RDP session...</span>' +
                '</div>';
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
            prev.element.classList.remove('active-ssh', 'active-rdp');
            prev.panel.classList.remove('visible');
        }

        // Hide welcome panel when tabs exist.
        const welcome = document.getElementById('welcomePanel');
        if (welcome) welcome.classList.add('hidden');

        // Activate new.
        info.element.classList.add(info.type === 'rdp' ? 'active-rdp' : 'active-ssh');
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
        this.container.querySelectorAll('.t-inst').forEach(el => {
            const name = (el.querySelector('.inst-name')?.textContent || '').toLowerCase();
            const id = (el.querySelector('.inst-id')?.textContent || '').toLowerCase();
            el.style.display = (name.includes(q) || id.includes(q)) ? '' : 'none';
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

        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.classList.add('show');
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
// RDP Credential Modal
// ---------------------------------------------------------------------------

function showRDPCredentialModal(instanceID, instanceName) {
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
                'style="width:100%;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:\'JetBrains Mono\',monospace;font-size:11px;outline:none;">' +
                '</div>' +
                '<div style="margin-bottom:14px;">' +
                '<input id="rdpPass" type="password" placeholder="Password" ' +
                'style="width:100%;padding:8px 10px;background:var(--s3);border:1px solid var(--b1);border-radius:7px;color:var(--text);font-family:\'JetBrains Mono\',monospace;font-size:11px;outline:none;">' +
                '</div>' +
                '<div style="display:flex;gap:8px;">' +
                '<button id="rdpCredConnect" style="flex:1;padding:8px;background:linear-gradient(135deg,rgba(96,165,250,.2),rgba(108,92,231,.15));border:1px solid rgba(96,165,250,.4);border-radius:7px;color:var(--rdp);font-family:\'JetBrains Mono\',monospace;font-size:11px;cursor:pointer;">Connect</button>' +
                '<button id="rdpCredCancel" class="modal-cancel" style="flex:1;">Cancel</button>' +
                '</div>' +
                '</div>';
            document.body.appendChild(el);
        }

        const modal = document.getElementById('rdpCredModalBg');
        document.getElementById('rdpCredTarget').textContent = instanceName + ' (' + instanceID + ')';
        document.getElementById('rdpUser').value = 'Administrator';
        document.getElementById('rdpPass').value = '';
        modal.classList.add('show');

        const cleanup = () => { modal.classList.remove('show'); };

        document.getElementById('rdpCredConnect').onclick = () => {
            const user = document.getElementById('rdpUser').value.trim();
            const pass = document.getElementById('rdpPass').value;
            cleanup();
            resolve({ username: user, password: pass });
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
        this.sidebar = new SidebarTree(
            document.getElementById('treeContainer') || document.getElementById('tree'),
            (id, name, type) => this.openSession(id, name, type)
        );
        this.favorites = new FavoritesManager((id, name, type) => this.openSession(id, name, type));
        this.snippets = new SnippetsManager();
        this.sidebar._favorites = this.favorites;
        this.sidebar._onFavoritesChanged = () => this._renderFavorites();
        this.sidebar.onRefresh = () => {
            this._loadInstances();
            this._loadFleetStats();
        };

        this.currentPageTheme = localStorage.getItem('cloudterm_page_theme') || 'dark';
        this.currentTermTheme = localStorage.getItem('cloudterm_term_theme') || 'github-dark';
        this.zoomLevel = 100;
        this.rdpMode = config.rdpMode || 'native';
        this.guacWSURL = config.guacWSURL || '';
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
        this._setupFilterInput();
        this._setupScanButton();
        this._setupContextMenu();
        this._setupDetailsModal();
        this._setupSummaryButton();
        this._setupSnippetsButton();
        this._setupHistoryButton();
        this._setupBroadcastButton();

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

        this.ws.on('session_started', (payload) => {
            showToast('Session started: ' + (payload.instance_id || ''));
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
        const tabID = instanceID + '-' + type;

        // Reuse existing tab of same type.
        if (this.tabManager.tabs.has(tabID)) {
            this.tabManager.switchTab(tabID);
            if (type === 'ssh') {
                this.termManager.focusTerminal(tabID);
            }
            return;
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

    async _startRDPSession(tabID, instanceID, instanceName) {
        if (this.rdpMode === 'guacamole') {
            try {
                const creds = await showRDPCredentialModal(instanceID, instanceName);
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
                        password: creds.password
                    })
                });

                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.error || 'HTTP ' + resp.status);
                }

                const data = await resp.json();

                // Place an iframe in the RDP panel.
                const panel = document.getElementById('panel-' + tabID);
                if (panel) {
                    const viewport = panel.querySelector('.rdp-viewport');
                    if (viewport) {
                        viewport.innerHTML = '<iframe src="' + data.url + '" ' +
                            'style="width:100%;height:100%;border:none;" ' +
                            'allow="clipboard-read; clipboard-write"></iframe>';
                        const rdpIframe = viewport.querySelector('iframe');
                        if (rdpIframe) {
                            rdpIframe.addEventListener('load', () => {
                                rdpIframe.contentWindow.focus();
                            });
                        }
                    }
                }
            } catch (e) {
                if (e.message !== 'cancelled') {
                    showToast('RDP error: ' + e.message, 5000);
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
        if (!connected) {
            showToast('WebSocket disconnected — reconnecting...');
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

            // Re-render favorites section if data changed
            this._renderFavorites();
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
                term_theme: this.currentTermTheme
            };
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
                    navigator.clipboard.writeText(id).then(() => showToast('Copied: ' + id));
                } else if (text.includes('copy private ip')) {
                    const inst = this.sidebar.getInstance(id);
                    const ip = inst ? inst.private_ip : '';
                    if (ip) {
                        navigator.clipboard.writeText(ip).then(() => showToast('Copied: ' + ip));
                    } else {
                        showToast('No private IP available');
                    }
                } else if (text.includes('instance details')) {
                    this._showInstanceDetails(id);
                } else if (text.includes('upload file')) {
                    this._showUploadModal(id, name);
                } else if (text.includes('download file')) {
                    this._showDownloadModal(id, name);
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
                } else if (text.includes('close all')) {
                    this._closeSession(id);
                }

                menu.classList.remove('show');
            });
        });
    }

    // -- Instance Details Modal -----------------------------------------------

    _showInstanceDetails(instanceID) {
        const inst = this.sidebar.getInstance(instanceID);
        if (!inst) { showToast('Instance data not available'); return; }

        const modal = document.getElementById('detailsModal');
        if (!modal) return;

        const body = modal.querySelector('.details-body');
        if (!body) return;

        const esc = (s) => { const d = document.createElement('div'); d.textContent = s || '—'; return d.innerHTML; };
        const row = (label, val) => '<div class="det-row"><span class="det-label">' + label + '</span><span class="det-val">' + esc(val) + '</span></div>';

        let html =
            row('Name', inst.name) +
            row('Instance ID', inst.instance_id) +
            row('State', inst.state) +
            row('Platform', inst.platform) +
            row('OS', inst.os) +
            row('Instance Type', inst.instance_type) +
            row('AMI ID', inst.ami_id) +
            row('Instance Profile', inst.instance_profile) +
            row('Private IP', inst.private_ip) +
            row('Public IP', inst.public_ip) +
            row('AWS Profile', inst.aws_profile) +
            row('Region', inst.aws_region) +
            row('Account ID', inst.account_id) +
            row('Account Alias', inst.account_alias) +
            row('Launch Time', inst.launch_time);

        if (inst.tags && typeof inst.tags === 'object') {
            const tagKeys = Object.keys(inst.tags).sort();
            if (tagKeys.length > 0) {
                html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--b1);">' +
                    '<div style="font-size:10px;color:var(--dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Tags</div>';
                for (const k of tagKeys) {
                    html += row(k, inst.tags[k]);
                }
                html += '</div>';
            }
        }

        // Metrics section
        html += '<div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--b1);">' +
            '<button id="metricsLoadBtn" style="padding:6px 16px;background:var(--s3);border:1px solid var(--b1);border-radius:5px;color:var(--muted);font-size:10px;cursor:pointer;">Load Metrics</button>' +
            '<div id="metricsContainer" style="margin-top:10px;display:none;"></div>' +
            '</div>';

        body.innerHTML = html;
        modal.classList.add('show');
        document.getElementById('metricsLoadBtn')?.addEventListener('click', () => this._loadInstanceMetrics(instanceID));
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
        const progressEl = document.getElementById('uploadProgress');
        const progressBar = document.getElementById('uploadProgressBar');
        const uploadBtn = document.getElementById('uploadBtn');
        const dropZone = document.getElementById('uploadDropZone');

        if (fileInput) fileInput.value = '';
        if (fileNameEl) { fileNameEl.style.display = 'none'; fileNameEl.textContent = ''; }
        if (remotePathEl) remotePathEl.value = '';
        if (progressEl) progressEl.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
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
        if (remotePathEl && !remotePathEl.value) {
            remotePathEl.value = this._uploadPlatform === 'windows'
                ? 'C:\\Windows\\Temp\\' + file.name
                : '/tmp/' + file.name;
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
        const progressEl = document.getElementById('uploadProgress');
        const progressBar = document.getElementById('uploadProgressBar');
        const uploadBtn = document.getElementById('uploadBtn');

        if (progressEl) progressEl.style.display = '';
        if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = 'Uploading...'; }

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
            const pctEl = document.getElementById('uploadProgressPct');
            const msgEl = document.getElementById('uploadProgressMsg');
            await this._readNDJSON(resp, (msg) => {
                if (progressBar) progressBar.style.width = msg.progress + '%';
                if (pctEl) pctEl.textContent = msg.progress + '%';
                if (msgEl) msgEl.textContent = msg.message || '';
                if (msg.status === 'error') {
                    showToast('Upload failed: ' + msg.message, 5000);
                } else if (msg.status === 'complete') {
                    showToast('Upload complete: ' + remotePath);
                    setTimeout(() => document.getElementById('uploadModal')?.classList.remove('show'), 1000);
                }
            });
        } catch (e) {
            showToast('Upload failed: ' + e.message, 5000);
        } finally {
            if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = 'Upload'; }
        }
    }

    _showDownloadModal(instanceID, instanceName) {
        const modal = document.getElementById('downloadModal');
        if (!modal) return;

        const target = document.getElementById('downloadTarget');
        if (target) target.textContent = instanceName + ' (' + instanceID + ')';

        const remotePathEl = document.getElementById('downloadRemotePath');
        const progressEl = document.getElementById('downloadProgress');
        const progressBar = document.getElementById('downloadProgressBar');
        const downloadBtn = document.getElementById('downloadBtn');

        if (remotePathEl) remotePathEl.value = '';
        if (progressEl) progressEl.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
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
        const progressEl = document.getElementById('downloadProgress');
        const progressBar = document.getElementById('downloadProgressBar');
        const downloadBtn = document.getElementById('downloadBtn');

        if (progressEl) progressEl.style.display = '';
        if (downloadBtn) { downloadBtn.disabled = true; downloadBtn.textContent = 'Downloading...'; }

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

            const pctEl = document.getElementById('downloadProgressPct');
            const msgEl = document.getElementById('downloadProgressMsg');
            await this._readNDJSON(resp, (msg) => {
                if (progressBar) progressBar.style.width = msg.progress + '%';
                if (pctEl) pctEl.textContent = msg.progress + '%';
                if (msgEl) msgEl.textContent = msg.message || '';
                if (msg.status === 'error') {
                    showToast('Download failed: ' + msg.message, 5000);
                } else if (msg.status === 'complete' && msg.data) {
                    // Decode base64 and trigger browser download.
                    const raw = atob(msg.data);
                    const bytes = new Uint8Array(raw.length);
                    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                    const blob = new Blob([bytes]);
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = msg.filename || 'download';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(a.href);
                    showToast('Downloaded: ' + (msg.filename || remotePath));
                    setTimeout(() => document.getElementById('downloadModal')?.classList.remove('show'), 1000);
                }
            });
        } catch (e) {
            showToast('Download failed: ' + e.message, 5000);
        } finally {
            if (downloadBtn) { downloadBtn.disabled = false; downloadBtn.textContent = 'Download'; }
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
                    if (snip) navigator.clipboard.writeText(snip.command).then(() => showToast('Copied to clipboard'));
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

    // -- Instance Metrics --------------------------------------------------------

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
                const dlBtn = entry.is_dir ? '' : '<button class="fb-dl-btn" data-dl-path="' + esc(fullPath) + '" title="Download">\u2B07</button>';
                html += '<tr class="fb-row ' + (entry.is_dir ? 'fb-dir' : 'fb-file') + '" data-path="' + esc(fullPath) + '" data-is-dir="' + entry.is_dir + '">' +
                    '<td class="fb-icon">' + icon + '</td>' +
                    '<td class="fb-name">' + esc(entry.name) + '</td>' +
                    '<td class="fb-size">' + sizeStr + '</td>' +
                    '<td class="fb-modified">' + esc(entry.modified) + '</td>' +
                    '<td class="fb-perms">' + esc(entry.permissions) + '</td>' +
                    '<td>' + dlBtn + '</td></tr>';
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
            body.querySelectorAll('.fb-dl-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dlModal = document.getElementById('downloadModal');
                    if (dlModal) dlModal.style.zIndex = '510';
                    this._showDownloadModal(this._fbInstanceID, this._fbInstanceName);
                    const remotePathEl = document.getElementById('downloadRemotePath');
                    if (remotePathEl) remotePathEl.value = btn.dataset.dlPath;
                });
            });
        } catch (e) {
            body.innerHTML = '<div style="color:var(--red);padding:20px">Browse failed: ' + e.message + '</div>';
        }
    }

    // -- Broadcast ---------------------------------------------------------------

    _setupBroadcastButton() {
        const btn = document.getElementById('broadcastBtn');
        if (btn) btn.addEventListener('click', () => this._toggleBroadcastBar());
        this._setupBroadcastBar();
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
                this.termManager.closeTerminal(id);
            } else if (info && info.type === 'rdp') {
                this._stopRDPSession(info.instanceID || id);
            }
            origClose(id);
            this._syncSidebarActiveStates();
        };

        // When switching tabs, fit the terminal.
        const origSwitch = this.tabManager.switchTab.bind(this.tabManager);
        this.tabManager.switchTab = (id) => {
            origSwitch(id);
            const info = this.tabManager.tabs.get(id);
            if (info && info.type === 'ssh') {
                requestAnimationFrame(() => {
                    this.termManager.fitTerminal(id);
                    this.termManager.focusTerminal(id);
                });
            } else if (info && info.type === 'rdp') {
                requestAnimationFrame(() => {
                    const panel = document.getElementById('panel-' + id);
                    if (panel) {
                        const iframe = panel.querySelector('iframe');
                        if (iframe && iframe.contentWindow) iframe.contentWindow.focus();
                    }
                });
            }
        };

        // Keyboard shortcut: Ctrl+Shift+T for new tab (prevent default).
        document.addEventListener('keydown', (e) => {
            // Ctrl+W: close active tab.
            if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
                if (this.tabManager.activeTab) {
                    e.preventDefault();
                    this.tabManager.closeTab(this.tabManager.activeTab);
                }
            }
        });
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
});
