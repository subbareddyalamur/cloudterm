// Define terminal manager class
class TerminalManager {
    constructor() {
        console.log('Initializing TerminalManager...');
        this.terminals = new Map();  // Key: sessionId, Value: terminalState
        this.sessionCounter = new Map();  // Key: instanceId, Value: number of sessions
        this.activeTerminalId = null;
        this.initialized = false;
        this.socket = null;
    }

    init() {
        console.log('Running terminal manager initialization...');
        this.terminalsContainer = document.getElementById('terminals-container');
        this.tabsContainer = document.getElementById('tabs-container');
        
        if (!this.terminalsContainer || !this.tabsContainer) {
            console.error('Container elements not found');
            return false;
        }
        
        this.initialized = true;
        console.log('Terminal manager initialized successfully');
        return true;
    }

    initSocket() {
        if (!this.socket) {
            this.socket = io({
                autoConnect: false // Prevent auto-connection
            });
            
            this.socket.on('connect', () => {
                console.log('Socket connected');
            });
            
            this.socket.on('disconnect', () => {
                console.log('Socket disconnected');
                this.socket = null;  // Reset socket on disconnect
            });
        }
        
        if (!this.socket.connected) {
            this.socket.connect();
        }
        
        return this.socket;
    }

    createTerminal() {
        if (!this.initialized) {
            console.error('Terminal manager not initialized');
            return null;
        }

        console.log('Creating new terminal...');
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, monospace',
            theme: {
                background: '#0d1117',
                foreground: '#c9d1d9',
                cursor: '#58a6ff'
            }
        });

        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        
        console.log('Terminal created successfully');
        return { term, fitAddon };
    }

    createTerminalContainer() {
        const container = document.createElement('div');
        container.className = 'terminal-instance';
        container.style.display = 'none'; // Hide by default
        return container;
    }

    createTab(instance, sessionCount) {
        const tab = document.createElement('button');
        tab.className = 'tab';
        const sessionLabel = sessionCount > 1 ? ` (${sessionCount})` : '';
        tab.innerHTML = `
            <span class="instance-icon"><i class="fas fa-terminal"></i></span>
            <span>${instance.name}${sessionLabel}</span>
            <span class="tab-close">×</span>
        `;
        tab.style.display = 'none'; // Hide by default
        
        const sessionId = `${instance.id}-${sessionCount}`;
        tab.onclick = (e) => {
            if (e.target.classList.contains('tab-close')) {
                this.closeTerminal(sessionId);
            } else {
                this.activateTerminal(sessionId);
            }
        };
        
        return tab;
    }

    async openTerminal(instance) {
        if (!this.initialized) {
            console.error('Terminal manager not initialized');
            return;
        }

        console.log('Opening terminal for instance:', instance);
        
        if (!instance || !instance.id) {
            console.error('Invalid instance:', instance);
            return;
        }

        // Generate a unique session ID
        const sessionCount = (this.sessionCounter.get(instance.id) || 0) + 1;
        this.sessionCounter.set(instance.id, sessionCount);
        const sessionId = `${instance.id}-${sessionCount}`;

        try {
            const { term, fitAddon } = this.createTerminal();
            if (!term) return;

            const container = this.createTerminalContainer();
            const tab = this.createTab(instance, sessionCount);
            
            this.terminalsContainer.appendChild(container);
            this.tabsContainer.appendChild(tab);
            
            term.open(container);
            fitAddon.fit();  // Fit terminal to container immediately
            
            // Initialize socket connection
            const socket = this.initSocket();
            
            // Add event listeners before starting session
            const handleOutput = (data) => {
                if (data.session_id === sessionId) {
                    console.log(`Received output for ${sessionId}: ${data.output.substring(0, 50)}...`);
                    term.write(data.output);
                }
            };

            const handleError = (data) => {
                if (data.session_id === sessionId) {
                    console.error('Session error:', data.error);
                    term.write('\r\n\x1b[31mError: ' + data.error + '\x1b[0m\r\n');
                }
            };

            const handleSessionStart = (data) => {
                if (data.session_id === sessionId) {
                    console.log('Session started:', sessionId);
                    container.style.display = 'block';
                    tab.style.display = 'inline-block';
                    term.focus();
                    fitAddon.fit();
                    
                    // Write a welcome message
                    term.write('\r\n\x1b[32mSession established. Welcome to CloudTerm!\x1b[0m\r\n');
                    
                    socket.emit('terminal_resize', {
                        instance_id: instance.id,
                        session_id: sessionId,
                        cols: term.cols,
                        rows: term.rows
                    });
                }
            };

            // Add event listeners
            socket.on('terminal_output', handleOutput);
            socket.on('session_error', handleError);
            socket.on('session_started', handleSessionStart);
            
            // Start session for this instance after listeners are set up
            socket.emit('start_session', { 
                instance_id: instance.id,
                session_id: sessionId 
            });

            term.onData(data => {
                // Handle Ctrl+C
                if (data.charCodeAt(0) === 3) {
                    socket.emit('terminal_interrupt', { 
                        instance_id: instance.id,
                        session_id: sessionId 
                    });
                }
                socket.emit('terminal_input', { 
                    instance_id: instance.id,
                    session_id: sessionId,
                    input: data 
                });
            });

            term.onResize(size => {
                socket.emit('terminal_resize', {
                    instance_id: instance.id,
                    session_id: sessionId,
                    cols: size.cols,
                    rows: size.rows
                });
            });

            const terminalState = {
                term,
                container,
                tab,
                fitAddon,
                sessionId,
                cleanup: () => {
                    socket.off('terminal_output', handleOutput);
                    socket.off('session_error', handleError);
                    socket.off('session_started', handleSessionStart);
                }
            };

            this.terminals.set(sessionId, terminalState);
            this.activateTerminal(sessionId);
            
            // Handle window resize
            const resizeHandler = () => {
                if (this.activeTerminalId === sessionId) {
                    fitAddon.fit();
                }
            };
            window.addEventListener('resize', resizeHandler);
            
            console.log('Terminal setup complete for instance:', instance.id);
        } catch (error) {
            console.error('Error setting up terminal:', error);
        }
    }

    activateTerminal(sessionId) {
        // Hide all terminals and deactivate all tabs
        for (const state of this.terminals.values()) {
            state.container.style.display = 'none';
            state.tab.classList.remove('active');
        }

        // Show and activate the selected terminal
        const terminalState = this.terminals.get(sessionId);
        if (terminalState) {
            terminalState.container.style.display = 'block';
            terminalState.tab.classList.add('active');
            terminalState.term.focus();
            this.activeTerminalId = sessionId;
        }
    }

    closeTerminal(sessionId) {
        const terminalState = this.terminals.get(sessionId);
        if (terminalState) {
            // Cleanup terminal
            terminalState.cleanup();
            terminalState.term.dispose();
            terminalState.container.remove();
            terminalState.tab.remove();
            this.terminals.delete(sessionId);
            
            // Update active terminal if needed
            if (this.activeTerminalId === sessionId) {
                this.activeTerminalId = null;
                const remainingTerminals = Array.from(this.terminals.keys());
                if (remainingTerminals.length > 0) {
                    this.activateTerminal(remainingTerminals[0]);
                }
            }

            // Notify backend to close the session
            if (this.socket) {
                this.socket.emit('close_session', { session_id: sessionId });
            }
        }
    }
}

// Create global terminal manager instance
window.terminalManager = new TerminalManager();

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing terminal manager...');
    window.terminalManager.init();
});
