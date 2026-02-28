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
        '--muted': '#6b82a8', '--dim': '#3a4d6b'
    },
    nord: {
        '--bg': '#2e3440', '--s1': '#3b4252', '--s2': '#434c5e', '--s3': '#4c566a',
        '--b1': '#4c566a', '--b2': '#5e6779', '--text': '#eceff4',
        '--muted': '#81a1c1', '--dim': '#616e88'
    },
    dracula: {
        '--bg': '#282a36', '--s1': '#21222c', '--s2': '#343746', '--s3': '#3e4154',
        '--b1': '#44475a', '--b2': '#6272a4', '--text': '#f8f8f2',
        '--muted': '#6272a4', '--dim': '#565967'
    },
    light: {
        '--bg': '#f5f5f5', '--s1': '#ffffff', '--s2': '#e8e8e8', '--s3': '#d4d4d4',
        '--b1': '#cccccc', '--b2': '#aaaaaa', '--text': '#1a1a1a',
        '--muted': '#666666', '--dim': '#999999'
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
        // activeTabMap: Map of tabID -> type
        const instances = this.container.querySelectorAll('.t-inst');
        instances.forEach(el => {
            const id = el.dataset.id;
            el.classList.remove('active-ssh', 'active-rdp');
            if (activeTabMap.has(id)) {
                el.classList.add(activeTabMap.get(id) === 'rdp' ? 'active-rdp' : 'active-ssh');
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

        // Instance click -> open session.
        this.container.querySelectorAll('.t-inst').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id;
                const name = el.dataset.name;
                const type = el.dataset.type;
                if (this.onInstanceClick) {
                    this.onInstanceClick(id, name, type);
                }
            });

            // Right-click context menu.
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showContextMenu(e, el.dataset.id, el.dataset.name, el.dataset.type);
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
        if (alias.includes('dev')) {
            return ' style="color:#a78bfa;background:rgba(167,139,250,.1);border-color:rgba(167,139,250,.3)"';
        }
        return '';
    }

    _esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
        this.sidebar.onRefresh = () => {
            this._loadInstances();
            this._loadFleetStats();
        };

        this.currentPageTheme = 'dark';
        this.currentTermTheme = 'github-dark';
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
        this._setupFilterInput();
        this._setupScanButton();
        this._setupContextMenu();
        this._setupDetailsModal();
        this._setupSummaryButton();
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
        const tabID = instanceID;

        // Reuse existing tab.
        if (this.tabManager.tabs.has(tabID)) {
            this.tabManager.switchTab(tabID);
            if (type === 'ssh') {
                this.termManager.focusTerminal(tabID);
            }
            return;
        }

        // Create tab.
        this.tabManager.openTab(tabID, instanceName, type);

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
            this._startRDPSession(instanceID, instanceName);
        }

        this._syncSidebarActiveStates();
    }

    _closeSession(tabID) {
        const info = this.tabManager.tabs.get(tabID);
        if (!info) return;

        if (info.type === 'ssh') {
            this.termManager.closeTerminal(tabID);
        } else if (info.type === 'rdp') {
            this._stopRDPSession(tabID);
        }

        this.tabManager.closeTab(tabID);
        this._syncSidebarActiveStates();
    }

    // -- RDP -----------------------------------------------------------------

    async _startRDPSession(instanceID, instanceName) {
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
                const panel = document.getElementById('panel-' + instanceID);
                if (panel) {
                    const viewport = panel.querySelector('.rdp-viewport');
                    if (viewport) {
                        viewport.innerHTML = '<iframe src="' + data.url + '" ' +
                            'style="width:100%;height:100%;border:none;" ' +
                            'allow="clipboard-read; clipboard-write"></iframe>';
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
        const activeMap = new Map();
        for (const [id, info] of this.tabManager.tabs) {
            activeMap.set(id, info.type);
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
        const el = document.getElementById('scanStatus');
        if (!el) return;
        if (status.status === 'scanning') {
            el.innerHTML = '<div class="scan-dot" style="animation:pulse .8s ease-in-out infinite"></div>Scanning... (' + (status.total_instances || 0) + ' found)';
        } else if (status.status === 'completed') {
            el.innerHTML = '<div class="scan-dot"></div>Scanned just now';
        } else if (status.status === 'error') {
            el.innerHTML = '<div class="scan-dot" style="background:var(--red);box-shadow:0 0 5px var(--red)"></div>Scan error';
        }
    }

    _updateConnectionIndicator(connected) {
        const el = document.getElementById('scanStatus');
        if (!el) return;
        if (!connected) {
            el.innerHTML = '<div class="scan-dot" style="background:var(--red);box-shadow:0 0 5px var(--red)"></div>Disconnected';
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

        // Update active checkmark in dropdown.
        document.querySelectorAll('[data-page-theme]').forEach(el => {
            el.classList.toggle('active', el.dataset.pageTheme === name);
            const check = el.querySelector('.check');
            if (check) check.style.display = el.dataset.pageTheme === name ? '' : 'none';
        });
    }

    _setTermTheme(name) {
        if (!TERMINAL_THEMES[name]) return;
        this.currentTermTheme = name;
        this.termManager.applyTheme(name);

        document.querySelectorAll('[data-term-theme]').forEach(el => {
            el.classList.toggle('active', el.dataset.termTheme === name);
            const check = el.querySelector('.check');
            if (check) check.style.display = el.dataset.termTheme === name ? '' : 'none';
        });
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

        body.innerHTML = html;
        modal.classList.add('show');
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
                this._stopRDPSession(id);
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
