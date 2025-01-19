// Define terminal manager class
class TerminalManager {
    constructor() {
        console.log('Initializing TerminalManager...');
        this.terminals = new Map();
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

    createTab(instance) {
        const tab = document.createElement('button');
        tab.className = 'tab';
        tab.innerHTML = `
            <span class="instance-icon"><i class="fas fa-terminal"></i></span>
            <span>${instance.name}</span>
            <span class="tab-close">×</span>
        `;
        tab.style.display = 'none'; // Hide by default
        
        tab.onclick = (e) => {
            if (e.target.classList.contains('tab-close')) {
                this.closeTerminal(instance.id);
            } else {
                this.activateTerminal(instance.id);
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

        if (this.terminals.has(instance.id)) {
            console.log('Terminal already exists, activating...');
            this.activateTerminal(instance.id);
            return;
        }

        try {
            const { term, fitAddon } = this.createTerminal();
            if (!term) return;

            const container = this.createTerminalContainer();
            const tab = this.createTab(instance);
            
            this.terminalsContainer.appendChild(container);
            this.tabsContainer.appendChild(tab);
            
            term.open(container);
            
            // Initialize socket connection
            const socket = this.initSocket();
            
            // Start session for this instance
            socket.emit('start_session', { instance_id: instance.id });

            const handleOutput = (data) => {
                if (data.output && data.instance_id === instance.id) {
                    console.log(`Received output for ${instance.id}: ${data.output.substring(0, 50)}...`);
                    term.write(data.output);
                }
            };

            const handleError = (data) => {
                if (data.instance_id === instance.id) {
                    console.error('Session error:', data.error);
                    term.write('\r\n\x1b[31mError: ' + data.error + '\x1b[0m\r\n');
                }
            };

            const handleSessionStart = (data) => {
                if (data.instance_id === instance.id) {
                    console.log('Session started for:', instance.id);
                    container.style.display = 'block';
                    tab.style.display = 'inline-block';
                    term.focus();
                    fitAddon.fit();
                    
                    socket.emit('terminal_resize', {
                        instance_id: instance.id,
                        cols: term.cols,
                        rows: term.rows
                    });
                }
            };

            // Add event listeners
            socket.on('terminal_output', handleOutput);
            socket.on('session_error', handleError);
            socket.on('session_started', handleSessionStart);

            term.onData(data => {
                socket.emit('terminal_input', { 
                    instance_id: instance.id,
                    input: data 
                });
            });

            term.onResize(size => {
                socket.emit('terminal_resize', {
                    instance_id: instance.id,
                    cols: size.cols,
                    rows: size.rows
                });
            });

            const terminalState = {
                term,
                container,
                tab,
                fitAddon,
                cleanup: () => {
                    socket.off('terminal_output', handleOutput);
                    socket.off('session_error', handleError);
                    socket.off('session_started', handleSessionStart);
                }
            };

            this.terminals.set(instance.id, terminalState);
            this.activateTerminal(instance.id);
            
            // Handle window resize
            const resizeHandler = () => {
                if (this.activeTerminalId === instance.id) {
                    fitAddon.fit();
                }
            };
            window.addEventListener('resize', resizeHandler);
            
            console.log('Terminal setup complete for instance:', instance.id);
        } catch (error) {
            console.error('Error setting up terminal:', error);
        }
    }

    activateTerminal(instanceId) {
        if (!this.initialized) {
            console.error('Terminal manager not initialized');
            return;
        }

        console.log('Activating terminal:', instanceId);
        
        // Deactivate current terminal
        if (this.activeTerminalId) {
            const current = this.terminals.get(this.activeTerminalId);
            if (current) {
                current.container.style.display = 'none';
                current.tab.classList.remove('active');
            }
        }

        // Activate new terminal
        const terminal = this.terminals.get(instanceId);
        if (terminal) {
            terminal.container.style.display = 'block';
            terminal.tab.classList.add('active');
            terminal.term.focus();
            terminal.fitAddon.fit();
            this.activeTerminalId = instanceId;
        }
    }

    closeTerminal(instanceId) {
        if (!this.initialized) {
            console.error('Terminal manager not initialized');
            return;
        }

        console.log('Closing terminal:', instanceId);
        const terminal = this.terminals.get(instanceId);
        if (terminal) {
            terminal.cleanup(); // Remove event listeners
            terminal.term.dispose();
            terminal.container.remove();
            terminal.tab.remove();
            this.terminals.delete(instanceId);

            // Activate another terminal if available
            if (this.activeTerminalId === instanceId) {
                this.activeTerminalId = null;
                const nextTerminal = Array.from(this.terminals.keys())[0];
                if (nextTerminal) {
                    this.activateTerminal(nextTerminal);
                }
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
