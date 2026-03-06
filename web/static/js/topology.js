// CloudTerm VPC Topology Renderer
// Interactive d3.js visualization of AWS VPC network topology

class TopologyRenderer {
    constructor(containerId, instanceId) {
        this.container = document.getElementById(containerId);
        this.instanceId = instanceId;
        this.topology = null;
        this.svg = null;
        this.zoom = null;
        this.mainGroup = null;
        this.width = 0;
        this.height = 0;
        this.selectedNode = null;
        this.reachabilityMode = false;
        this.reachabilitySource = null;
        this.reachabilityDest = null;
        this.exposureResults = null;
        this.searchQuery = '';
        this.currentTransform = null;
        this.posMap = {}; // resource id → { cx, cy, x, y, w, h }

        this._initSVG();
        this._initToolbar();
        this._initDetailPanel();
        this._initAnalyzePathPanel();
        this._initToastContainer();
        this.load();

        // Re-render on theme change
        this._themeHandler = () => this._onThemeChange();
        document.addEventListener('cloudterm-theme-changed', this._themeHandler);
    }

    _onThemeChange() {
        if (!this.topology) return;
        // Update SVG background
        this.svg.style('background', this._getColor('--bg'));
        // Re-render with new colors
        this.render();
    }

    // ─── SVG + zoom ──────────────────────────────────────────────

    _initSVG() {
        const container = this.container;
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        this.svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .style('display', 'block')
            .style('background', this._getColor('--bg'));

        const defs = this.svg.append('defs');

        // Arrow markers
        const addArrow = (id, color) => {
            defs.append('marker')
                .attr('id', id)
                .attr('markerWidth', 10).attr('markerHeight', 10)
                .attr('refX', 9).attr('refY', 3)
                .attr('orient', 'auto').attr('markerUnits', 'strokeWidth')
                .append('path').attr('d', 'M0,0 L0,6 L9,3 z').attr('fill', color);
        };
        addArrow('arrow', this._getColor('--muted'));
        addArrow('arrow-green', '#4ade80');
        addArrow('arrow-red', '#f87171');
        addArrow('arrow-yellow', '#fbbf24');
        addArrow('arrow-blue', '#4d9fff');
        addArrow('arrow-purple', '#a78bfa');

        defs.append('filter').attr('id', 'glow')
            .append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'coloredBlur');
        const feMerge = defs.select('#glow').append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.mainGroup.attr('transform', event.transform);
                this.currentTransform = event.transform;
            });
        this.svg.call(this.zoom);
        this.mainGroup = this.svg.append('g').attr('class', 'topo-main');

        new ResizeObserver(entries => {
            for (let e of entries) {
                this.width = e.contentRect.width;
                this.height = e.contentRect.height;
            }
        }).observe(container);
    }

    // ─── Toolbar ─────────────────────────────────────────────────

    _initToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'topo-toolbar';

        const mkBtn = (cls, title, text) => {
            const b = document.createElement('button');
            b.className = 'topo-btn ' + cls;
            b.title = title;
            b.textContent = text;
            return b;
        };

        const g1 = document.createElement('div');
        g1.className = 'topo-toolbar-group';
        const zoomIn = mkBtn('topo-zoom-in', 'Zoom In', '+');
        const zoomOut = mkBtn('topo-zoom-out', 'Zoom Out', '\u2212');
        const fit = mkBtn('topo-fit', 'Fit View', '\u229E');
        g1.append(zoomIn, zoomOut, fit);
        toolbar.appendChild(g1);

        toolbar.appendChild(this._sep());

        const g2 = document.createElement('div');
        g2.className = 'topo-toolbar-group';
        const reachBtn = mkBtn('topo-btn-reachability', 'Analyze Reachability', '\uD83D\uDD0D Analyze Path');
        const exposeBtn = mkBtn('topo-btn-exposure', 'Scan Exposure', '\u26A0 Exposure');
        g2.append(reachBtn, exposeBtn);
        toolbar.appendChild(g2);

        toolbar.appendChild(this._sep());

        const g3 = document.createElement('div');
        g3.className = 'topo-toolbar-group';
        const search = document.createElement('input');
        search.className = 'topo-search';
        search.placeholder = 'Search resources...';
        g3.appendChild(search);
        toolbar.appendChild(g3);

        const g4 = document.createElement('div');
        g4.className = 'topo-toolbar-group';
        g4.style.marginLeft = 'auto';
        const refreshBtn = mkBtn('topo-refresh', 'Refresh', '\u21BB Refresh');
        g4.appendChild(refreshBtn);
        toolbar.appendChild(g4);

        this.container.appendChild(toolbar);

        zoomIn.addEventListener('click', () => this._zoomIn());
        zoomOut.addEventListener('click', () => this._zoomOut());
        fit.addEventListener('click', () => this._fitToView());
        reachBtn.addEventListener('click', () => this._toggleReachabilityMode());
        exposeBtn.addEventListener('click', () => this._scanExposure());
        refreshBtn.addEventListener('click', () => this.load());
        search.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this._highlightSearch();
        });
    }

    _sep() {
        const s = document.createElement('div');
        s.className = 'topo-toolbar-sep';
        return s;
    }

    // ─── Detail Panel (right slide) ─────────────────────────────

    _initDetailPanel() {
        const panel = document.createElement('div');
        panel.className = 'topo-detail-panel';

        const header = document.createElement('div');
        header.className = 'topo-detail-header';
        const title = document.createElement('span');
        title.className = 'topo-detail-title';
        title.textContent = 'Resource Details';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'topo-detail-close';
        closeBtn.textContent = '\u2715';
        header.appendChild(closeBtn);
        panel.appendChild(header);

        const body = document.createElement('div');
        body.className = 'topo-detail-body';
        panel.appendChild(body);

        this.container.appendChild(panel);
        this.detailPanel = panel;
        closeBtn.addEventListener('click', () => this._hideDetail());
    }

    // ─── Analyze Path Panel (draggable floating) ────────────────

    _initAnalyzePathPanel() {
        const panel = document.createElement('div');
        panel.className = 'topo-analyze-panel hidden';
        panel.style.cssText = 'position:absolute;top:60px;left:50%;transform:translateX(-50%);z-index:60;';

        // Header (drag handle)
        const header = document.createElement('div');
        header.className = 'topo-analyze-header';
        header.innerHTML = '<span>\uD83D\uDD0D Analyze Path</span>';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'topo-detail-close';
        closeBtn.textContent = '\u2715';
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'topo-analyze-body';

        // Status/message area
        const msgArea = document.createElement('div');
        msgArea.className = 'topo-analyze-msg';
        msgArea.textContent = 'Click source instance, then destination.';
        body.appendChild(msgArea);

        // Source display
        const srcRow = this._makeInfoRow('Source:', '—');
        body.appendChild(srcRow.el);

        // Dest display
        const dstRow = this._makeInfoRow('Dest:', '—');
        body.appendChild(dstRow.el);

        // Manual dest input
        const manualRow = document.createElement('div');
        manualRow.className = 'topo-analyze-row';
        const manualLabel = document.createElement('label');
        manualLabel.textContent = 'Or enter dest IP:';
        manualLabel.style.cssText = 'font-size:11px;color:var(--muted);margin-right:6px;';
        const manualInput = document.createElement('input');
        manualInput.type = 'text';
        manualInput.placeholder = '10.0.1.50';
        manualInput.className = 'topo-analyze-ip-input';
        const manualBtn = document.createElement('button');
        manualBtn.className = 'topo-btn';
        manualBtn.textContent = 'Use';
        manualBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
        manualRow.append(manualLabel, manualInput, manualBtn);
        body.appendChild(manualRow);

        // Protocol / Port row
        const protoRow = document.createElement('div');
        protoRow.className = 'topo-analyze-row';
        const protoSelect = document.createElement('select');
        protoSelect.className = 'topo-protocol-select';
        ['TCP', 'UDP', 'ICMP'].forEach(p => {
            const o = document.createElement('option');
            o.value = p.toLowerCase();
            o.textContent = p;
            protoSelect.appendChild(o);
        });
        const portInput = document.createElement('input');
        portInput.type = 'number';
        portInput.className = 'topo-port-input';
        portInput.value = '22';
        portInput.min = '1';
        portInput.max = '65535';
        portInput.style.width = '70px';
        const analyzeBtn = document.createElement('button');
        analyzeBtn.className = 'topo-btn topo-analyze-run-btn';
        analyzeBtn.textContent = '\uD83D\uDD2C Analyze';
        analyzeBtn.title = 'AWS Network Insights — real packet path analysis (~30s-2min)';
        analyzeBtn.disabled = true;
        const clearBtn = document.createElement('button');
        clearBtn.className = 'topo-btn topo-clear-path-btn';
        clearBtn.textContent = 'Clear';
        clearBtn.style.display = 'none';
        protoRow.append(protoSelect, portInput, analyzeBtn, clearBtn);
        body.appendChild(protoRow);

        // Results area
        const results = document.createElement('div');
        results.className = 'topo-analyze-results';
        body.appendChild(results);

        panel.appendChild(body);
        this.container.appendChild(panel);

        // Store references
        this.analyzePanel = panel;
        this.analyzeMsgEl = msgArea;
        this.analyzeSrcEl = srcRow.val;
        this.analyzeDstEl = dstRow.val;
        this.analyzeManualInput = manualInput;
        this.analyzeProtoSelect = protoSelect;
        this.analyzePortInput = portInput;
        this.analyzeRunBtn = analyzeBtn;
        this.analyzeClearBtn = clearBtn;
        this.analyzeResultsEl = results;

        // Events
        closeBtn.addEventListener('click', () => this._cancelReachabilityMode());
        manualBtn.addEventListener('click', () => this._setManualDest());
        analyzeBtn.addEventListener('click', () => this._runAnalysis());
        clearBtn.addEventListener('click', () => this._clearPathVisualization());
        this._makeDraggable(panel, header);
    }

    _makeInfoRow(label, value) {
        const row = document.createElement('div');
        row.className = 'topo-analyze-row';
        const lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:11px;color:var(--muted);min-width:50px;';
        lbl.textContent = label;
        const val = document.createElement('span');
        val.style.cssText = 'font-size:12px;color:var(--text);font-family:JetBrains Mono,monospace;';
        val.textContent = value;
        row.append(lbl, val);
        return { el: row, val: val };
    }

    _makeDraggable(panel, handle) {
        let isDragging = false, startX, startY, origX, origY;
        handle.style.cursor = 'grab';

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            handle.style.cursor = 'grabbing';
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            const containerRect = this.container.getBoundingClientRect();
            origX = rect.left - containerRect.left;
            origY = rect.top - containerRect.top;
            panel.style.transform = 'none'; // remove centering transform
            panel.style.left = origX + 'px';
            panel.style.top = origY + 'px';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            panel.style.left = (origX + dx) + 'px';
            panel.style.top = (origY + dy) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                handle.style.cursor = 'grab';
            }
        });
    }

    // ─── Toast Container (inline messages) ──────────────────────

    _initToastContainer() {
        const container = document.createElement('div');
        container.className = 'topo-toast-container';
        this.container.appendChild(container);
        this.toastContainer = container;
    }

    _showToast(msg, type = 'info', duration = 5000) {
        const toast = document.createElement('div');
        toast.className = 'topo-toast topo-toast-' + type;
        toast.textContent = msg;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ─── Data Loading ────────────────────────────────────────────

    async load() {
        this._showLoading();
        try {
            const resp = await fetch('/topology/' + this.instanceId);
            if (!resp.ok) throw new Error('Failed to fetch topology');
            this.topology = await resp.json();
            this._hideLoading();
            this.render();
        } catch (e) {
            this._hideLoading();
            this._showError(e.message);
        }
    }

    _hideLoading() {
        const el = this.container.querySelector('.topo-loading');
        if (el) el.remove();
    }

    // ═══════════════════════════════════════════════════════════════
    // RENDER — horizontal grid layout
    // ═══════════════════════════════════════════════════════════════

    render() {
        const g = this.mainGroup;
        g.selectAll('*').remove();
        this.posMap = {};

        if (!this.topology) return;
        const t = this.topology;

        // Layout constants
        const PAD = 60;                // VPC internal padding
        const SUBNET_GAP = 30;         // gap between subnets
        const AZ_GAP = 50;             // gap between AZ columns
        const ITEM_W = 280;            // item card width
        const ITEM_H = 50;             // item card height
        const ITEM_GAP = 8;            // vertical gap between items
        const COL_GAP = 10;            // horizontal gap between 2-col items
        const CAT_HEADER = 24;         // category header height
        const CAT_GAP = 12;            // gap between categories
        const SUBNET_PAD = 14;         // subnet internal padding
        const SUBNET_HEADER = 42;      // subnet header area height
        const COLS = 2;                // items per row

        // Group subnets by AZ
        const azGroups = {};
        t.subnets.forEach(s => {
            if (!azGroups[s.az]) azGroups[s.az] = [];
            azGroups[s.az].push(s);
        });
        const azList = Object.keys(azGroups).sort();

        // Compute subnet content: categorize items
        const NET_PILL_H = 28;
        const NET_PILL_GAP = 4;
        const NET_SECTION_HEADER = 20;

        const subnetData = {};
        t.subnets.forEach(subnet => {
            const instances = t.instances.filter(i => i.subnetId === subnet.id);
            const lbs = (t.loadBalancers || []).filter(lb => (lb.subnetIds || []).includes(subnet.id));
            const nats = (t.natGateways || []).filter(n => n.subnetId === subnet.id);

            const categories = [];
            if (instances.length > 0) categories.push({ label: 'Instances', items: instances, type: 'instance' });
            if (lbs.length > 0) categories.push({ label: 'Load Balancers', items: lbs, type: 'loadbalancer' });
            if (nats.length > 0) categories.push({ label: 'NAT Gateways', items: nats, type: 'natgateway' });

            // Collect networking resources for this subnet
            const netResources = [];
            // Route Table
            let routeTable = (t.routeTables || []).find(rt => (rt.subnetIds || []).includes(subnet.id));
            if (!routeTable) routeTable = (t.routeTables || []).find(rt => rt.isMain);
            if (routeTable) {
                netResources.push({ type: 'route-table', id: routeTable.id, name: routeTable.name || routeTable.id, label: 'RT', isMain: routeTable.isMain });
            }
            // NACL
            if (subnet.networkAclId) {
                const nacl = (t.networkAcls || []).find(n => n.id === subnet.networkAclId);
                netResources.push({ type: 'nacl', id: subnet.networkAclId, name: nacl && nacl.isDefault ? 'Default NACL' : subnet.networkAclId, label: 'NACL' });
            }
            // Security Groups (deduped across instances in this subnet)
            const sgSet = new Set();
            instances.forEach(inst => (inst.securityGroups || []).forEach(sg => sgSet.add(sg)));
            sgSet.forEach(sgId => {
                const sgObj = (t.securityGroups || []).find(s => s.id === sgId);
                netResources.push({ type: 'sg', id: sgId, name: sgObj ? sgObj.name : sgId, label: 'SG' });
            });

            // Compute height
            let contentH = 0;
            categories.forEach((cat, ci) => {
                contentH += CAT_HEADER;
                const rows = Math.ceil(cat.items.length / COLS);
                contentH += rows * (ITEM_H + ITEM_GAP) - ITEM_GAP;
                if (ci < categories.length - 1) contentH += CAT_GAP;
            });

            // Add networking section height
            let netH = 0;
            if (netResources.length > 0) {
                netH += CAT_GAP + NET_SECTION_HEADER;
                const netRows = Math.ceil(netResources.length / COLS);
                netH += netRows * (NET_PILL_H + NET_PILL_GAP) - NET_PILL_GAP;
            }

            const subW = COLS * ITEM_W + (COLS - 1) * COL_GAP + 2 * SUBNET_PAD;
            const subH = Math.max(100, SUBNET_HEADER + contentH + netH + SUBNET_PAD);

            subnetData[subnet.id] = {
                subnet, instances, lbs, nats, categories, netResources,
                w: subW, h: subH
            };
        });

        // Position subnets: AZs as columns, subnets stacked vertically within each AZ
        const subnetPositions = {};
        let currentX = PAD;
        let maxY = 0;

        azList.forEach(az => {
            let currentY = PAD + 40; // space for AZ label
            azGroups[az].forEach(subnet => {
                const sd = subnetData[subnet.id];
                subnetPositions[subnet.id] = {
                    x: currentX, y: currentY,
                    w: sd.w, h: sd.h,
                    ...sd, az
                };
                currentY += sd.h + SUBNET_GAP;
            });
            maxY = Math.max(maxY, currentY);
            currentX += (subnetData[azGroups[az][0].id].w) + AZ_GAP;
        });

        const vpcW = currentX + PAD - AZ_GAP;
        const vpcH = maxY + PAD;

        // Draw VPC boundary
        this._drawVPC(g, t.vpc, vpcW, vpcH);

        // Draw AZ labels
        azList.forEach(az => {
            const firstSub = subnetPositions[azGroups[az][0].id];
            g.append('text')
                .attr('x', firstSub.x + firstSub.w / 2)
                .attr('y', PAD + 20)
                .attr('fill', this._getColor('--text'))
                .attr('font-size', '13px').attr('font-weight', 'bold')
                .attr('text-anchor', 'middle')
                .attr('font-family', 'JetBrains Mono, monospace')
                .text(az);
        });

        // Draw subnets with categorized items + networking resources
        Object.values(subnetPositions).forEach(sp => {
            this._drawSubnet(g, sp, ITEM_W, ITEM_H, ITEM_GAP, COL_GAP, COLS, CAT_HEADER, CAT_GAP, SUBNET_PAD, SUBNET_HEADER, NET_PILL_H, NET_PILL_GAP, NET_SECTION_HEADER);
        });

        // External resources
        this._drawExternalResources(g, t, vpcW, vpcH, subnetPositions);

        // Store layout data for on-demand connection drawing
        this._layoutData = { subnetPositions, vpcW, vpcH, topo: t };

        // Connections are NOT drawn by default — they show on instance selection
        // (see _drawInstanceConnections)

        setTimeout(() => this._fitToView(), 100);
    }

    // ─── Draw VPC boundary ───────────────────────────────────────

    _drawVPC(g, vpc, w, h) {
        const vg = g.append('g').attr('class', 'vpc-container');
        vg.append('rect')
            .attr('x', 0).attr('y', 0).attr('width', w).attr('height', h).attr('rx', 8)
            .attr('fill', 'none')
            .attr('stroke', this._getColor('--purple'))
            .attr('stroke-width', 2).attr('stroke-dasharray', '8,4').attr('opacity', 0.6);

        vg.append('text')
            .attr('x', 16).attr('y', 24)
            .attr('fill', this._getColor('--purple'))
            .attr('font-size', '15px').attr('font-weight', 'bold')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(vpc.name || vpc.id);

        vg.append('text')
            .attr('x', 16).attr('y', 42)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '11px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(vpc.cidr);
    }

    // ─── Draw Subnet with categorized items ─────────────────────

    _drawSubnet(g, sp, ITEM_W, ITEM_H, ITEM_GAP, COL_GAP, COLS, CAT_HEADER, CAT_GAP, SUBNET_PAD, SUBNET_HEADER, NET_PILL_H, NET_PILL_GAP, NET_SECTION_HEADER) {
        const isPublic = sp.subnet.isPublic;
        const subnetColor = isPublic ? this._getColor('--ssh') : this._getColor('--s2');
        const borderColor = isPublic ? this._getColor('--ssh') : this._getColor('--b2');

        const sg = g.append('g').attr('class', 'subnet-group').attr('data-subnet-id', sp.subnet.id);

        // Subnet background
        sg.append('rect')
            .attr('x', sp.x).attr('y', sp.y).attr('width', sp.w).attr('height', sp.h)
            .attr('rx', 6)
            .attr('fill', subnetColor).attr('fill-opacity', 0.08)
            .attr('stroke', borderColor).attr('stroke-width', 1.5)
            .style('cursor', 'pointer')
            .on('click', () => this._showDetail(sp.subnet, 'subnet'));

        // Subnet header
        sg.append('text')
            .attr('x', sp.x + 10).attr('y', sp.y + 18)
            .attr('fill', this._getColor('--text'))
            .attr('font-size', '12px').attr('font-weight', 'bold')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(sp.subnet.name || sp.subnet.id.substring(0, 20));

        sg.append('text')
            .attr('x', sp.x + 10).attr('y', sp.y + 32)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '10px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(`${sp.subnet.cidr}  ${isPublic ? 'Public' : 'Private'}`);

        // Draw categorized items
        let catY = sp.y + SUBNET_HEADER;

        sp.categories.forEach((cat, ci) => {
            // Category container
            const catItems = cat.items;
            const rows = Math.ceil(catItems.length / COLS);
            const catContentH = rows * (ITEM_H + ITEM_GAP) - ITEM_GAP;
            const catTotalH = CAT_HEADER + catContentH;

            // Category background
            sg.append('rect')
                .attr('x', sp.x + 6).attr('y', catY)
                .attr('width', sp.w - 12).attr('height', catTotalH + 4)
                .attr('rx', 4)
                .attr('fill', 'none')
                .attr('stroke', this._getColor('--b1')).attr('stroke-width', 0.5)
                .attr('stroke-dasharray', '4,2').attr('opacity', 0.6);

            // Category label
            sg.append('text')
                .attr('x', sp.x + SUBNET_PAD).attr('y', catY + 16)
                .attr('fill', this._getColor('--muted'))
                .attr('font-size', '10px').attr('font-weight', '600')
                .attr('font-family', 'JetBrains Mono, monospace')
                .attr('text-transform', 'uppercase')
                .text(cat.label + ' (' + catItems.length + ')');

            let itemY = catY + CAT_HEADER;
            catItems.forEach((item, idx) => {
                const col = idx % COLS;
                const row = Math.floor(idx / COLS);
                const ix = sp.x + SUBNET_PAD + col * (ITEM_W + COL_GAP);
                const iy = catY + CAT_HEADER + row * (ITEM_H + ITEM_GAP);

                if (cat.type === 'instance') {
                    this._drawInstance(sg, item, ix, iy, ITEM_W, ITEM_H);
                } else if (cat.type === 'loadbalancer') {
                    this._drawLoadBalancer(sg, item, ix, iy, ITEM_W, ITEM_H);
                } else if (cat.type === 'natgateway') {
                    this._drawNATGateway(sg, item, ix, iy, ITEM_W, ITEM_H);
                }
            });

            catY += catTotalH + CAT_GAP;
        });

        // Draw networking resources (RT, NACL, SGs) as small pills
        if (sp.netResources && sp.netResources.length > 0) {
            catY += CAT_GAP;

            // Networking section background
            const netRows = Math.ceil(sp.netResources.length / COLS);
            const netContentH = netRows * (NET_PILL_H + NET_PILL_GAP) - NET_PILL_GAP;
            const netTotalH = NET_SECTION_HEADER + netContentH;

            sg.append('rect')
                .attr('x', sp.x + 6).attr('y', catY)
                .attr('width', sp.w - 12).attr('height', netTotalH + 4)
                .attr('rx', 4)
                .attr('fill', 'none')
                .attr('stroke', this._getColor('--b1')).attr('stroke-width', 0.5)
                .attr('stroke-dasharray', '4,2').attr('opacity', 0.6);

            // Section label
            sg.append('text')
                .attr('x', sp.x + SUBNET_PAD).attr('y', catY + 14)
                .attr('fill', this._getColor('--muted'))
                .attr('font-size', '9px').attr('font-weight', '600')
                .attr('font-family', 'JetBrains Mono, monospace')
                .text('NETWORKING');

            const pillW = Math.floor((sp.w - 2 * SUBNET_PAD - COL_GAP) / COLS);
            sp.netResources.forEach((res, idx) => {
                const col = idx % COLS;
                const row = Math.floor(idx / COLS);
                const px = sp.x + SUBNET_PAD + col * (pillW + COL_GAP);
                const py = catY + NET_SECTION_HEADER + row * (NET_PILL_H + NET_PILL_GAP);
                this._drawNetworkingPill(sg, res, px, py, pillW, NET_PILL_H);
            });
        }

        // Register subnet position in posMap
        this.posMap['subnet-' + sp.subnet.id] = { cx: sp.x + sp.w / 2, cy: sp.y + sp.h / 2, x: sp.x, y: sp.y, w: sp.w, h: sp.h };
    }

    // ─── Draw individual resource items ─────────────────────────

    _drawInstance(g, inst, x, y, w, h) {
        const isHighlighted = inst.id === this.instanceId;
        const icon = AWS_TOPO_ICONS.ec2;

        const ig = g.append('g')
            .attr('class', 'instance-node')
            .attr('data-instance-id', inst.id)
            .attr('data-resource-type', 'instance')
            .style('cursor', 'pointer');

        const rect = ig.append('rect')
            .attr('x', x).attr('y', y).attr('width', w).attr('height', h).attr('rx', 4)
            .attr('fill', this._getColor('--s2'))
            .attr('stroke', isHighlighted ? this._getColor('--ssh') : this._getColor('--b1'))
            .attr('stroke-width', isHighlighted ? 2 : 1);

        if (isHighlighted) {
            rect.attr('filter', 'url(#glow)');
        }

        ig.append('path')
            .attr('d', icon.path)
            .attr('transform', `translate(${x + 6}, ${y + 8}) scale(0.55)`)
            .attr('fill', icon.color);

        ig.append('text')
            .attr('x', x + 32).attr('y', y + 17)
            .attr('fill', this._getColor('--text'))
            .attr('font-size', '11px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text((inst.name || inst.id).substring(0, 34));

        ig.append('text')
            .attr('x', x + 32).attr('y', y + 30)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(inst.privateIp || 'no-ip');

        ig.append('text')
            .attr('x', x + 32).attr('y', y + 42)
            .attr('fill', this._getColor('--dim'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(inst.instanceType || 't2.micro');

        ig.on('click', (event) => {
            event.stopPropagation();
            if (this.reachabilityMode) {
                this._handleReachabilityClick(inst, 'instance');
            } else {
                this._showDetail(inst, 'instance');
            }
        }).on('dblclick', (event) => {
            event.stopPropagation();
            if (window.cloudterm && window.cloudterm.openSession) {
                window.cloudterm.openSession(inst.id, inst.name, 'ssh');
            }
        });

        // Register in posMap
        this.posMap[inst.id] = { cx: x + w / 2, cy: y + h / 2, x, y, w, h };
    }

    _drawLoadBalancer(g, lb, x, y, w, h) {
        const icon = AWS_TOPO_ICONS.elb;
        const lg = g.append('g')
            .attr('class', 'lb-node')
            .attr('data-lb-id', lb.arn)
            .attr('data-resource-type', 'loadbalancer')
            .style('cursor', 'pointer');

        lg.append('rect')
            .attr('x', x).attr('y', y).attr('width', w).attr('height', h).attr('rx', 4)
            .attr('fill', this._getColor('--s2'))
            .attr('stroke', this._getColor('--rdp')).attr('stroke-width', 1);

        lg.append('path')
            .attr('d', icon.path)
            .attr('transform', `translate(${x + 6}, ${y + 8}) scale(0.55)`)
            .attr('fill', icon.color);

        lg.append('text')
            .attr('x', x + 32).attr('y', y + 17)
            .attr('fill', this._getColor('--text'))
            .attr('font-size', '11px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text((lb.name || 'Load Balancer').substring(0, 22));

        lg.append('text')
            .attr('x', x + 32).attr('y', y + 30)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(`${lb.type || 'network'} / ${lb.scheme || 'internal'}`);

        // Listener info
        const listeners = (lb.listeners || []).map(l => `${l.protocol}:${l.port}`).join(', ');
        if (listeners) {
            lg.append('text')
                .attr('x', x + 32).attr('y', y + 42)
                .attr('fill', this._getColor('--dim'))
                .attr('font-size', '9px')
                .attr('font-family', 'JetBrains Mono, monospace')
                .text(listeners.substring(0, 28));
        }

        lg.on('click', (event) => {
            event.stopPropagation();
            this._showDetail(lb, 'loadbalancer');
        });

        this.posMap[lb.arn] = { cx: x + w / 2, cy: y + h / 2, x, y, w, h };
    }

    _drawNATGateway(g, nat, x, y, w, h) {
        const icon = AWS_TOPO_ICONS.nat;
        const ng = g.append('g')
            .attr('class', 'nat-node')
            .attr('data-nat-id', nat.id)
            .attr('data-resource-type', 'natgateway')
            .style('cursor', 'pointer');

        ng.append('rect')
            .attr('x', x).attr('y', y).attr('width', w).attr('height', h).attr('rx', 4)
            .attr('fill', this._getColor('--s2'))
            .attr('stroke', this._getColor('--ssh')).attr('stroke-width', 1);

        ng.append('path')
            .attr('d', icon.path)
            .attr('transform', `translate(${x + 6}, ${y + 8}) scale(0.55)`)
            .attr('fill', icon.color);

        ng.append('text')
            .attr('x', x + 32).attr('y', y + 17)
            .attr('fill', this._getColor('--text'))
            .attr('font-size', '11px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(nat.name || 'NAT Gateway');

        ng.append('text')
            .attr('x', x + 32).attr('y', y + 30)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(nat.publicIp || nat.id.substring(0, 20));

        ng.on('click', (event) => {
            event.stopPropagation();
            this._showDetail(nat, 'natgateway');
        });

        this.posMap[nat.id] = { cx: x + w / 2, cy: y + h / 2, x, y, w, h };
    }

    _drawNetworkingPill(g, res, x, y, w, h) {
        const colors = {
            'route-table': { bg: 'rgba(77,159,255,.12)', border: '#4d9fff', icon: '🔀', iconColor: '#4d9fff' },
            'nacl':        { bg: 'rgba(251,191,36,.12)', border: '#fbbf24', icon: '📋', iconColor: '#fbbf24' },
            'sg':          { bg: 'rgba(167,139,250,.12)', border: '#a78bfa', icon: '🛡', iconColor: '#a78bfa' },
        };
        const c = colors[res.type] || colors['sg'];

        const pg = g.append('g')
            .attr('class', 'net-pill-node')
            .attr('data-resource-id', res.id)
            .attr('data-resource-type', res.type)
            .style('cursor', 'pointer');

        pg.append('rect')
            .attr('x', x).attr('y', y).attr('width', w).attr('height', h).attr('rx', 14)
            .attr('fill', c.bg)
            .attr('stroke', c.border).attr('stroke-width', 1);

        // Label badge (RT / NACL / SG)
        pg.append('text')
            .attr('x', x + 8).attr('y', y + h / 2 + 1)
            .attr('fill', c.border)
            .attr('font-size', '9px').attr('font-weight', '700')
            .attr('font-family', 'JetBrains Mono, monospace')
            .attr('dominant-baseline', 'middle')
            .text(res.label);

        // Resource name (truncated)
        const nameOffset = res.label.length * 7 + 14;
        const maxChars = Math.floor((w - nameOffset - 6) / 5.5);
        const displayName = (res.name || res.id).substring(0, maxChars);
        pg.append('text')
            .attr('x', x + nameOffset).attr('y', y + h / 2 + 1)
            .attr('fill', this._getColor('--text'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .attr('dominant-baseline', 'middle')
            .text(displayName);

        // Extra badge for main route table
        if (res.isMain) {
            pg.append('text')
                .attr('x', x + w - 8).attr('y', y + h / 2 + 1)
                .attr('fill', this._getColor('--muted'))
                .attr('font-size', '8px').attr('text-anchor', 'end')
                .attr('dominant-baseline', 'middle')
                .text('main');
        }

        pg.on('click', (event) => {
            event.stopPropagation();
            this._showNetworkingDetail(res);
        });

        // Register in posMap for packet animation
        this.posMap[res.type + '-' + res.id] = { cx: x + w / 2, cy: y + h / 2, x, y, w, h };
        // Also register by bare ID for reachability lookup (SG, NACL, RT IDs from hops)
        if (!this.posMap[res.id]) {
            this.posMap[res.id] = { cx: x + w / 2, cy: y + h / 2, x, y, w, h };
        }
    }

    _showNetworkingDetail(res) {
        if (this.reachabilityMode) return;
        const topo = this.topology;
        this.detailPanel.classList.add('visible');
        const titleEl = this.detailPanel.querySelector('.topo-detail-title');
        const bodyEl = this.detailPanel.querySelector('.topo-detail-body');
        bodyEl.innerHTML = '';

        if (res.type === 'sg') {
            const sg = (topo.securityGroups || []).find(s => s.id === res.id);
            titleEl.textContent = sg ? sg.name : res.id;
            bodyEl.appendChild(this._createDetailSection('Security Group ID', res.id));
            if (sg) {
                bodyEl.appendChild(this._createDetailSection('Description', sg.description || 'N/A'));
                if (sg.inboundRules && sg.inboundRules.length > 0) {
                    bodyEl.appendChild(this._createDetailSection('Inbound Rules', ''));
                    const table = this._createRulesTable(sg.inboundRules, 'sg');
                    bodyEl.appendChild(table);
                }
                if (sg.outboundRules && sg.outboundRules.length > 0) {
                    bodyEl.appendChild(this._createDetailSection('Outbound Rules', ''));
                    const table = this._createRulesTable(sg.outboundRules, 'sg');
                    bodyEl.appendChild(table);
                }
            }
        } else if (res.type === 'nacl') {
            const nacl = (topo.networkAcls || []).find(n => n.id === res.id);
            titleEl.textContent = 'Network ACL';
            bodyEl.appendChild(this._createDetailSection('NACL ID', res.id));
            bodyEl.appendChild(this._createDetailSection('Default', nacl && nacl.isDefault ? 'Yes' : 'No'));
            if (nacl && nacl.rules) {
                const inbound = nacl.rules.filter(r => r.direction === 'inbound');
                const outbound = nacl.rules.filter(r => r.direction === 'outbound');
                if (inbound.length > 0) {
                    bodyEl.appendChild(this._createDetailSection('Inbound Rules', ''));
                    bodyEl.appendChild(this._createRulesTable(inbound, 'nacl'));
                }
                if (outbound.length > 0) {
                    bodyEl.appendChild(this._createDetailSection('Outbound Rules', ''));
                    bodyEl.appendChild(this._createRulesTable(outbound, 'nacl'));
                }
            }
        } else if (res.type === 'route-table') {
            const rt = (topo.routeTables || []).find(r => r.id === res.id);
            titleEl.textContent = 'Route Table';
            bodyEl.appendChild(this._createDetailSection('Route Table ID', res.id));
            bodyEl.appendChild(this._createDetailSection('Main', rt && rt.isMain ? 'Yes' : 'No'));
            if (rt && rt.routes) {
                bodyEl.appendChild(this._createDetailSection('Routes', ''));
                bodyEl.appendChild(this._createRulesTable(rt.routes, 'route'));
            }
        }
    }

    _createRulesTable(rules, type) {
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');

        if (type === 'sg') {
            ['Proto', 'Ports', 'Source/Dest', 'Desc'].forEach(h => {
                const th = document.createElement('th'); th.textContent = h; tr.appendChild(th);
            });
        } else if (type === 'nacl') {
            ['#', 'Action', 'Proto', 'Ports', 'CIDR'].forEach(h => {
                const th = document.createElement('th'); th.textContent = h; tr.appendChild(th);
            });
        } else if (type === 'route') {
            ['Destination', 'Target', 'Type', 'State'].forEach(h => {
                const th = document.createElement('th'); th.textContent = h; tr.appendChild(th);
            });
        }
        thead.appendChild(tr);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        rules.forEach(rule => {
            const row = document.createElement('tr');
            if (type === 'sg') {
                [rule.protocol || 'all', `${rule.fromPort}-${rule.toPort}`, rule.source || '', (rule.description || '').substring(0, 20)].forEach(v => {
                    const td = document.createElement('td'); td.textContent = v; row.appendChild(td);
                });
            } else if (type === 'nacl') {
                const actionColor = rule.action === 'allow' ? '#4ade80' : '#f87171';
                [rule.ruleNumber, rule.action, rule.protocol || 'all', `${rule.fromPort}-${rule.toPort}`, rule.cidrBlock || ''].forEach((v, i) => {
                    const td = document.createElement('td');
                    td.textContent = v;
                    if (i === 1) td.style.color = actionColor;
                    row.appendChild(td);
                });
            } else if (type === 'route') {
                [rule.destination || '', rule.target || '', rule.targetType || '', rule.state || ''].forEach(v => {
                    const td = document.createElement('td'); td.textContent = v; row.appendChild(td);
                });
            }
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        return table;
    }

    // ─── External Resources (IGW, TGW, Peering, Endpoints) ─────

    _drawExternalResources(g, topo, vpcW, vpcH, subnetPositions) {
        const centerX = vpcW / 2;

        // IGW: centered above VPC
        if (topo.internetGateways && topo.internetGateways.length > 0) {
            this._drawIGW(g, topo.internetGateways[0], centerX, -70);
        } else if (topo.internetGateway) {
            this._drawIGW(g, topo.internetGateway, centerX, -70);
        }

        // TGW: right side of VPC
        let rightY = 80;
        (topo.tgwAttachments || topo.transitGateways || []).forEach(tgw => {
            this._drawTGW(g, tgw, vpcW + 100, rightY, topo.vpc);
            // Extra space for peer attachments
            const peerCount = Math.min((tgw.peerAttachments || []).length, 4);
            rightY += 140 + peerCount * 42;
        });

        // VPC Peering: right side below TGW
        (topo.vpcPeerings || []).forEach(peering => {
            this._drawPeering(g, peering, vpcW + 100, rightY, topo.vpc);
            rightY += 140;
        });

        // VPC Endpoints: below VPC
        let epX = 80;
        (topo.vpcEndpoints || []).forEach(endpoint => {
            this._drawEndpoint(g, endpoint, epX, vpcH + 70);
            epX += 200;
        });

        // VPC-level info badges: DHCP, Flow Logs, EIPs, Prefix Lists (left side)
        let leftY = 80;
        this._drawVPCInfoBadges(g, topo, -220, leftY);
    }

    _drawIGW(g, igw, x, y) {
        const icon = AWS_TOPO_ICONS.igw;
        const topo = this.topology;
        const ig = g.append('g').attr('class', 'igw-node').style('cursor', 'pointer');

        // Find route tables that reference this IGW
        const igwRoutes = [];
        (topo.routeTables || []).forEach(rt => {
            (rt.routes || []).forEach(r => {
                if (r.targetType === 'igw' && r.target === igw.id) {
                    igwRoutes.push({ dest: r.destination, rtId: rt.id });
                }
            });
        });

        const boxW = 160;
        const routeLines = Math.min(igwRoutes.length, 2);
        const boxH = 70 + routeLines * 12;

        ig.append('rect')
            .attr('x', x - boxW / 2).attr('y', y - boxH / 2)
            .attr('width', boxW).attr('height', boxH).attr('rx', 8)
            .attr('fill', this._getColor('--s3'))
            .attr('stroke', this._getColor('--purple')).attr('stroke-width', 2);

        ig.append('path')
            .attr('d', icon.path)
            .attr('transform', `translate(${x - 18}, ${y - boxH / 2 + 6})`)
            .attr('fill', icon.color);

        ig.append('text')
            .attr('x', x + 18).attr('y', y - boxH / 2 + 22)
            .attr('fill', this._getColor('--text'))
            .attr('font-size', '10px').attr('font-weight', 'bold')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text('Internet GW');

        ig.append('text')
            .attr('x', x - boxW / 2 + 8).attr('y', y - boxH / 2 + 38)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(igw.id);

        // Show routes
        if (igwRoutes.length > 0) {
            let ry = y - boxH / 2 + 52;
            igwRoutes.slice(0, 2).forEach(r => {
                ig.append('text')
                    .attr('x', x - boxW / 2 + 8).attr('y', ry)
                    .attr('fill', this._getColor('--dim'))
                    .attr('font-size', '8px')
                    .attr('font-family', 'JetBrains Mono, monospace')
                    .text(`→ ${r.dest}`);
                ry += 12;
            });
        }

        ig.on('click', () => this._showDetail(igw, 'igw'));
        this.posMap['igw-' + igw.id] = { cx: x, cy: y, x: x - boxW / 2, y: y - boxH / 2, w: boxW, h: boxH };
        // Also register by bare ID
        this.posMap[igw.id] = { cx: x, cy: y, x: x - boxW / 2, y: y - boxH / 2, w: boxW, h: boxH };
    }

    _drawTGW(g, tgw, x, y, vpc) {
        const icon = AWS_TOPO_ICONS.tgw;
        const topo = this.topology;
        const tg = g.append('g').attr('class', 'tgw-node').style('cursor', 'pointer');

        // Find routes that point to this TGW
        const tgwRoutes = [];
        (topo.routeTables || []).forEach(rt => {
            (rt.routes || []).forEach(r => {
                if (r.targetType === 'tgw' && r.target === (tgw.tgwId || tgw.id)) {
                    tgwRoutes.push({ dest: r.destination, rtId: rt.id, rtName: rt.name || rt.id });
                }
            });
        });

        // Wider box to fit route details
        const routeLines = Math.min(tgwRoutes.length, 3);
        const boxW = 220;
        const boxH = 80 + routeLines * 14;
        tg.append('rect')
            .attr('x', x - 10).attr('y', y - boxH / 2)
            .attr('width', boxW).attr('height', boxH).attr('rx', 6)
            .attr('fill', this._getColor('--s3'))
            .attr('stroke', '#a78bfa').attr('stroke-width', 2);

        tg.append('path')
            .attr('d', icon.path)
            .attr('transform', `translate(${x}, ${y - boxH / 2 + 10}) scale(0.8)`)
            .attr('fill', icon.color);

        // TGW name
        tg.append('text')
            .attr('x', x + 34).attr('y', y - boxH / 2 + 22)
            .attr('fill', this._getColor('--text'))
            .attr('font-size', '11px').attr('font-weight', 'bold')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text((tgw.tgwName || 'Transit GW').substring(0, 18));

        // TGW ID
        tg.append('text')
            .attr('x', x + 34).attr('y', y - boxH / 2 + 36)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(tgw.tgwId || tgw.id || '');

        // State + type + subnets
        let detailY = y - boxH / 2 + 52;
        tg.append('text')
            .attr('x', x).attr('y', detailY)
            .attr('fill', this._getColor('--dim'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(`${tgw.resourceType || 'vpc'} / ${tgw.state || 'available'}`);
        detailY += 14;

        // Show propagated routes through this TGW
        if (tgwRoutes.length > 0) {
            tg.append('text')
                .attr('x', x).attr('y', detailY)
                .attr('fill', this._getColor('--muted'))
                .attr('font-size', '8px').attr('font-weight', '600')
                .attr('font-family', 'JetBrains Mono, monospace')
                .text('ROUTES VIA TGW:');
            detailY += 12;

            tgwRoutes.slice(0, 3).forEach(r => {
                tg.append('text')
                    .attr('x', x + 4).attr('y', detailY)
                    .attr('fill', this._getColor('--dim'))
                    .attr('font-size', '8px')
                    .attr('font-family', 'JetBrains Mono, monospace')
                    .text(`${r.dest} (${r.rtName.substring(0, 14)})`);
                detailY += 12;
            });
            if (tgwRoutes.length > 3) {
                tg.append('text')
                    .attr('x', x + 4).attr('y', detailY)
                    .attr('fill', this._getColor('--dim'))
                    .attr('font-size', '8px')
                    .attr('font-family', 'JetBrains Mono, monospace')
                    .text(`+${tgwRoutes.length - 3} more`);
            }
        }

        tg.on('click', () => this._showDetail(tgw, 'tgw'));
        this.posMap['tgw-' + (tgw.attachmentId || tgw.id)] = { cx: x + boxW / 2 - 10, cy: y, x: x - 10, y: y - boxH / 2, w: boxW, h: boxH };

        // Draw peer attachments (other VPCs/VPNs connected to this TGW)
        if (tgw.peerAttachments && tgw.peerAttachments.length > 0) {
            let peerY = y + boxH / 2 + 10;
            const peers = tgw.peerAttachments.slice(0, 4); // Show up to 4
            peers.forEach(peer => {
                const peerG = g.append('g').attr('class', 'tgw-peer-node').style('cursor', 'pointer');
                const pW = 180, pH = 36;
                const pX = x + 20;
                peerG.append('rect')
                    .attr('x', pX).attr('y', peerY)
                    .attr('width', pW).attr('height', pH).attr('rx', 4)
                    .attr('fill', this._getColor('--s2'))
                    .attr('stroke', '#a78bfa').attr('stroke-width', 1)
                    .attr('stroke-dasharray', '4,2').attr('opacity', 0.8);
                // Icon + label
                const icon = peer.resourceType === 'vpn' ? '🔒' : peer.resourceType === 'direct-connect' ? '⚡' : '☁';
                peerG.append('text')
                    .attr('x', pX + 6).attr('y', peerY + 14)
                    .attr('fill', this._getColor('--text'))
                    .attr('font-size', '10px').attr('font-weight', '600')
                    .attr('font-family', 'JetBrains Mono, monospace')
                    .text(`${icon} ${(peer.resourceName || peer.resourceId || '').substring(0, 18)}`);
                peerG.append('text')
                    .attr('x', pX + 6).attr('y', peerY + 28)
                    .attr('fill', this._getColor('--dim'))
                    .attr('font-size', '8px')
                    .attr('font-family', 'JetBrains Mono, monospace')
                    .text(peer.resourceCidr || peer.resourceId || '');
                // Connecting line from TGW box to peer
                peerG.append('line')
                    .attr('x1', x + boxW / 2).attr('y1', y + boxH / 2)
                    .attr('x2', pX + pW / 2).attr('y2', peerY)
                    .attr('stroke', '#a78bfa').attr('stroke-width', 1)
                    .attr('stroke-dasharray', '3,2').attr('opacity', 0.5);

                peerG.on('click', () => this._showDetail(peer, 'tgw-peer'));
                peerY += pH + 6;
            });
            if (tgw.peerAttachments.length > 4) {
                g.append('text')
                    .attr('x', x + 30).attr('y', peerY + 10)
                    .attr('fill', this._getColor('--dim'))
                    .attr('font-size', '9px')
                    .attr('font-family', 'JetBrains Mono, monospace')
                    .text(`+${tgw.peerAttachments.length - 4} more`);
            }
        }
    }

    _drawPeering(g, peering, x, y, vpc) {
        const icon = AWS_TOPO_ICONS.peering;
        const topo = this.topology;
        const pg = g.append('g').attr('class', 'peering-node').style('cursor', 'pointer');

        // Determine peer VPC info
        const isRequester = peering.requesterVpc === (vpc && vpc.id);
        const peerVpc = isRequester ? peering.accepterVpc : peering.requesterVpc;
        const peerCidr = isRequester ? peering.accepterCidr : peering.requesterCidr;

        // Find routes that go through this peering connection
        const peeringRoutes = [];
        (topo.routeTables || []).forEach(rt => {
            (rt.routes || []).forEach(r => {
                if (r.targetType === 'pcx' && r.target === peering.id) {
                    peeringRoutes.push({ dest: r.destination, rtId: rt.id, rtName: rt.name || rt.id });
                }
            });
        });

        const routeLines = Math.min(peeringRoutes.length, 2);
        const hasName = !!peering.peerVpcName;
        const boxW = 230;
        const boxH = 110 + (hasName ? 14 : 0) + routeLines * 12;
        pg.append('rect')
            .attr('x', x - 10).attr('y', y - boxH / 2)
            .attr('width', boxW).attr('height', boxH).attr('rx', 6)
            .attr('fill', this._getColor('--s3'))
            .attr('stroke', '#a78bfa').attr('stroke-width', 2);

        pg.append('path')
            .attr('d', icon.path)
            .attr('transform', `translate(${x}, ${y - boxH / 2 + 8}) scale(0.7)`)
            .attr('fill', icon.color);

        // Title
        let textY = y - boxH / 2 + 22;
        pg.append('text')
            .attr('x', x + 30).attr('y', textY)
            .attr('fill', this._getColor('--text'))
            .attr('font-size', '11px').attr('font-weight', 'bold')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text('VPC Peering');

        textY += 14;
        pg.append('text')
            .attr('x', x).attr('y', textY)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(peering.id);

        textY += 14;
        // Show peer VPC name if available
        if (peering.peerVpcName) {
            pg.append('text')
                .attr('x', x).attr('y', textY)
                .attr('fill', '#60a5fa')
                .attr('font-size', '10px').attr('font-weight', '600')
                .attr('font-family', 'JetBrains Mono, monospace')
                .text(peering.peerVpcName.substring(0, 24));
            textY += 12;
        }
        pg.append('text')
            .attr('x', x).attr('y', textY)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text('Peer VPC: ' + (peerVpc || 'N/A'));

        textY += 12;
        pg.append('text')
            .attr('x', x).attr('y', textY)
            .attr('fill', this._getColor('--dim'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(`Acct: ${peering.peerAccountId || 'same'}  Region: ${peering.peerRegion || 'same'}`);

        textY += 12;
        pg.append('text')
            .attr('x', x).attr('y', textY)
            .attr('fill', this._getColor('--dim'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text('CIDR: ' + (peerCidr || 'N/A'));

        // Status
        textY += 14;
        const statusColor = peering.status === 'active' ? '#4ade80' : '#fbbf24';
        pg.append('text')
            .attr('x', x).attr('y', textY)
            .attr('fill', statusColor)
            .attr('font-size', '9px').attr('font-weight', '600')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(peering.status || 'unknown');

        // Show routes that traverse this peering
        if (peeringRoutes.length > 0) {
            textY += 14;
            pg.append('text')
                .attr('x', x).attr('y', textY)
                .attr('fill', this._getColor('--muted'))
                .attr('font-size', '8px').attr('font-weight', '600')
                .attr('font-family', 'JetBrains Mono, monospace')
                .text('ROUTES VIA PEERING:');
            peeringRoutes.slice(0, 2).forEach(r => {
                textY += 12;
                pg.append('text')
                    .attr('x', x + 4).attr('y', textY)
                    .attr('fill', this._getColor('--dim'))
                    .attr('font-size', '8px')
                    .attr('font-family', 'JetBrains Mono, monospace')
                    .text(`${r.dest} (${r.rtName.substring(0, 12)})`);
            });
        }

        pg.on('click', () => this._showDetail(peering, 'peering'));
        this.posMap['peering-' + peering.id] = { cx: x + boxW / 2 - 10, cy: y, x: x - 10, y: y - boxH / 2, w: boxW, h: boxH };
    }

    _drawEndpoint(g, endpoint, x, y) {
        const icon = AWS_TOPO_ICONS.endpoint;
        const eg = g.append('g').attr('class', 'endpoint-node').style('cursor', 'pointer');

        const boxW = 170;
        const boxH = 70;
        eg.append('rect')
            .attr('x', x - boxW / 2).attr('y', y - boxH / 2)
            .attr('width', boxW).attr('height', boxH).attr('rx', 6)
            .attr('fill', this._getColor('--s3'))
            .attr('stroke', '#4d9fff').attr('stroke-width', 1.5);

        eg.append('path')
            .attr('d', icon.path)
            .attr('transform', `translate(${x - 16}, ${y - 20}) scale(0.7)`)
            .attr('fill', icon.color);

        // Service name (short)
        const svcShort = endpoint.serviceName ? endpoint.serviceName.split('.').pop() : 'Endpoint';
        eg.append('text')
            .attr('x', x + 10).attr('y', y - 6)
            .attr('fill', this._getColor('--text'))
            .attr('font-size', '10px').attr('font-weight', 'bold')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(svcShort);

        // Type
        eg.append('text')
            .attr('x', x - boxW / 2 + 8).attr('y', y + 10)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(`${endpoint.type || 'Interface'} / ${endpoint.state || 'available'}`);

        // ID
        eg.append('text')
            .attr('x', x - boxW / 2 + 8).attr('y', y + 22)
            .attr('fill', this._getColor('--dim'))
            .attr('font-size', '8px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(endpoint.id);

        eg.on('click', () => this._showDetail(endpoint, 'endpoint'));
        this.posMap['endpoint-' + endpoint.id] = { cx: x, cy: y, x: x - boxW / 2, y: y - boxH / 2, w: boxW, h: boxH };
    }

    _drawVPCInfoBadges(g, topo, x, startY) {
        const boxW = 200;
        const font = 'JetBrains Mono, monospace';
        let y = startY;

        const drawBadge = (icon, title, lines, color) => {
            const lineH = 13;
            const boxH = 30 + lines.length * lineH;
            const bg = g.append('g').attr('class', 'vpc-info-badge').style('cursor', 'pointer');
            bg.append('rect')
                .attr('x', x).attr('y', y)
                .attr('width', boxW).attr('height', boxH).attr('rx', 6)
                .attr('fill', this._getColor('--s3'))
                .attr('stroke', color).attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '4,3')
                .attr('opacity', 0.85);
            bg.append('text')
                .attr('x', x + 8).attr('y', y + 16)
                .attr('fill', color)
                .attr('font-size', '10px').attr('font-weight', 'bold')
                .attr('font-family', font)
                .text(`${icon} ${title}`);
            lines.forEach((line, i) => {
                bg.append('text')
                    .attr('x', x + 12).attr('y', y + 28 + i * lineH)
                    .attr('fill', this._getColor('--muted'))
                    .attr('font-size', '9px')
                    .attr('font-family', font)
                    .text(line.substring(0, 28));
            });
            y += boxH + 10;
            return bg;
        };

        // DHCP Options
        if (topo.dhcpOptions) {
            const dh = topo.dhcpOptions;
            const lines = [];
            if (dh.domainName) lines.push(`Domain: ${dh.domainName}`);
            if (dh.domainServers && dh.domainServers.length > 0) {
                lines.push(`DNS: ${dh.domainServers.slice(0, 2).join(', ')}`);
            }
            if (dh.ntpServers && dh.ntpServers.length > 0) {
                lines.push(`NTP: ${dh.ntpServers[0]}`);
            }
            if (lines.length === 0) lines.push(dh.id);
            const badge = drawBadge('⚙', 'DHCP Options', lines, '#60a5fa');
            badge.on('click', () => this._showDetail(dh, 'dhcp'));
        }

        // Flow Logs
        if (topo.flowLogs && topo.flowLogs.length > 0) {
            const lines = topo.flowLogs.slice(0, 3).map(fl =>
                `${fl.trafficType || 'ALL'} → ${(fl.destinationType || 'cw-logs').substring(0, 10)}`
            );
            if (topo.flowLogs.length > 3) lines.push(`+${topo.flowLogs.length - 3} more`);
            const badge = drawBadge('📊', `Flow Logs (${topo.flowLogs.length})`, lines, '#a78bfa');
            badge.on('click', () => this._showDetail({ flowLogs: topo.flowLogs }, 'flowlogs'));
        }

        // Elastic IPs
        if (topo.elasticIps && topo.elasticIps.length > 0) {
            const lines = topo.elasticIps.slice(0, 3).map(eip => {
                const assoc = eip.instanceId ? `→ ${eip.instanceId.substring(0, 14)}` : '(unassociated)';
                return `${eip.publicIp} ${assoc}`;
            });
            if (topo.elasticIps.length > 3) lines.push(`+${topo.elasticIps.length - 3} more`);
            const badge = drawBadge('🔗', `Elastic IPs (${topo.elasticIps.length})`, lines, '#fbbf24');
            badge.on('click', () => this._showDetail({ elasticIps: topo.elasticIps }, 'eips'));
        }

        // Prefix Lists
        if (topo.prefixLists && topo.prefixLists.length > 0) {
            const lines = topo.prefixLists.slice(0, 3).map(pl =>
                `${pl.name || pl.id} (${(pl.cidrs || []).length} entries)`
            );
            const badge = drawBadge('📋', `Prefix Lists (${topo.prefixLists.length})`, lines, '#94a3b8');
            badge.on('click', () => this._showDetail({ prefixLists: topo.prefixLists }, 'prefixlists'));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // CONNECTIONS — straight lines
    // ═══════════════════════════════════════════════════════════════

    // ─── Connection Drawing Helpers ─────────────────────────────

    _drawCurvedPath(parent, x1, y1, x2, y2, color, opts = {}) {
        const midY = (y1 + y2) / 2;
        const d = `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
        const path = parent.append('path')
            .attr('d', d).attr('fill', 'none')
            .attr('stroke', color).attr('stroke-width', opts.width || 1.5)
            .attr('opacity', 0);
        if (opts.dash) path.attr('stroke-dasharray', opts.dash);
        if (opts.marker) path.attr('marker-end', opts.marker);
        path.transition().duration(400).attr('opacity', opts.opacity || 0.6);
        return path;
    }

    _drawHCurve(parent, x1, y1, x2, y2, color, opts = {}) {
        const midX = (x1 + x2) / 2;
        const d = `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
        const path = parent.append('path')
            .attr('d', d).attr('fill', 'none')
            .attr('stroke', color).attr('stroke-width', opts.width || 1.5)
            .attr('opacity', 0);
        if (opts.dash) path.attr('stroke-dasharray', opts.dash);
        if (opts.marker) path.attr('marker-end', opts.marker);
        path.transition().duration(400).attr('opacity', opts.opacity || 0.6);
        return path;
    }

    _edgePoint(pos, targetX, targetY) {
        const cx = pos.cx, cy = pos.cy, hw = pos.w / 2, hh = pos.h / 2;
        const dx = targetX - cx, dy = targetY - cy;
        if (dx === 0 && dy === 0) return { x: cx, y: cy };
        const absDx = Math.abs(dx), absDy = Math.abs(dy);
        if (absDx / hw > absDy / hh) {
            return { x: cx + (dx > 0 ? hw : -hw), y: cy + dy * (hw / absDx) };
        }
        return { x: cx + dx * (hh / absDy), y: cy + (dy > 0 ? hh : -hh) };
    }

    // ─── On-demand connection drawing for selected instance ─────

    _drawInstanceConnections(inst) {
        this._clearInstanceConnections();
        if (!this._layoutData) return;

        const { subnetPositions, vpcW, vpcH, topo } = this._layoutData;
        const conns = this.mainGroup.append('g').attr('class', 'instance-connections').style('pointer-events', 'none');
        const instPos = this.posMap[inst.id];
        if (!instPos) return;

        // Highlight the selected instance
        this.mainGroup.select(`[data-instance-id="${inst.id}"] rect`)
            .attr('stroke', '#60a5fa').attr('stroke-width', 2.5);

        // 1. LB → this instance (if it's a target of any LB)
        (topo.loadBalancers || []).forEach(lb => {
            const lbPos = this.posMap[lb.arn];
            if (!lbPos) return;
            (lb.targets || []).forEach(target => {
                if (target.targetId !== inst.id) return;
                const color = target.healthState === 'healthy' ? '#4ade80' :
                              target.healthState === 'unhealthy' ? '#f87171' : '#fbbf24';
                const markerName = target.healthState === 'healthy' ? 'arrow-green' :
                                   target.healthState === 'unhealthy' ? 'arrow-red' : 'arrow-yellow';
                const from = this._edgePoint(lbPos, instPos.cx, instPos.cy);
                const to = this._edgePoint(instPos, lbPos.cx, lbPos.cy);
                this._drawCurvedPath(conns, from.x, from.y, to.x, to.y, color, {
                    width: 2, opacity: 0.8, marker: `url(#${markerName})`
                });
            });
        });

        // 2. Subnet-level connections: find instance's subnet
        const subnet = topo.subnets.find(s => s.id === inst.subnetId);
        if (!subnet) return;
        const sp = subnetPositions[subnet.id];
        if (!sp) return;
        const subCx = sp.x + sp.w / 2;

        // 3. If public subnet → IGW connection
        if (subnet.isPublic) {
            const igwKey = Object.keys(this.posMap).find(k => k.startsWith('igw-'));
            if (igwKey) {
                const igwPos = this.posMap[igwKey];
                this._drawCurvedPath(conns, igwPos.cx, igwPos.cy + 28, subCx, sp.y, '#4d9fff', {
                    width: 2, opacity: 0.5, dash: '6,4', marker: 'url(#arrow-blue)'
                });
            }
        }

        // 4. Route table → gateway connections (NAT, TGW, Peering)
        const rt = (topo.routeTables || []).find(r => (r.subnetIds || []).includes(subnet.id))
                || (topo.routeTables || []).find(r => r.isMain);
        if (rt) {
            const seenTargets = new Set();
            (rt.routes || []).forEach(route => {
                if (route.targetType === 'local' || !route.target || seenTargets.has(route.target)) return;
                seenTargets.add(route.target);

                if (route.targetType === 'nat') {
                    const natPos = this.posMap[route.target];
                    if (natPos) {
                        const from = this._edgePoint(instPos, natPos.cx, natPos.cy);
                        const to = this._edgePoint(natPos, instPos.cx, instPos.cy);
                        this._drawCurvedPath(conns, from.x, from.y, to.x, to.y, '#4ade80', {
                            width: 1.5, opacity: 0.6, dash: '6,3', marker: 'url(#arrow-green)'
                        });
                    }
                } else if (route.targetType === 'tgw') {
                    // Find TGW attachment for this TGW ID
                    const tgwKey = Object.keys(this.posMap).find(k =>
                        k.startsWith('tgw-') && (k === 'tgw-' + route.target || this.posMap[k])
                    );
                    const tgwPos = this.posMap[route.target] || (tgwKey && this.posMap[tgwKey]);
                    if (tgwPos) {
                        this._drawHCurve(conns, tgwPos.x, tgwPos.cy, vpcW + 4, tgwPos.cy, '#a78bfa', {
                            width: 2, opacity: 0.6, dash: '6,3', marker: 'url(#arrow-purple)'
                        });
                        // Also draw instance → VPC edge
                        this._drawHCurve(conns, instPos.cx + instPos.w / 2, instPos.cy, vpcW + 4, instPos.cy, '#a78bfa', {
                            width: 1, opacity: 0.3, dash: '4,2'
                        });
                    }
                } else if (route.targetType === 'pcx') {
                    const pcxPos = this.posMap['peering-' + route.target] || this.posMap[route.target];
                    if (pcxPos) {
                        this._drawHCurve(conns, pcxPos.x, pcxPos.cy, vpcW + 4, pcxPos.cy, '#a78bfa', {
                            width: 1.5, opacity: 0.5, dash: '6,3', marker: 'url(#arrow-purple)'
                        });
                    }
                }
            });
        }

        // 5. VPC Endpoints in this subnet
        (topo.vpcEndpoints || []).forEach(ep => {
            if (ep.subnetIds && ep.subnetIds.includes(subnet.id)) {
                const epPos = this.posMap['endpoint-' + ep.id];
                if (epPos) {
                    this._drawCurvedPath(conns, epPos.cx, epPos.y, epPos.cx, vpcH, '#4d9fff', {
                        width: 1, opacity: 0.4, dash: '4,2', marker: 'url(#arrow-blue)'
                    });
                }
            }
        });
    }

    _clearInstanceConnections() {
        this.mainGroup.selectAll('.instance-connections').remove();
        // Reset instance stroke to default
        this.mainGroup.selectAll('.instance-node rect').each((d, i, nodes) => {
            const node = d3.select(nodes[i].parentNode);
            const instId = node.attr('data-instance-id');
            d3.select(nodes[i])
                .attr('stroke', instId === this.instanceId ? this._getColor('--ssh') : this._getColor('--b1'))
                .attr('stroke-width', instId === this.instanceId ? 2 : 1);
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // DETAIL PANEL
    // ═══════════════════════════════════════════════════════════════

    _createDetailSection(label, value) {
        const s = document.createElement('div');
        s.className = 'detail-section';
        const l = document.createElement('div');
        l.className = 'detail-label';
        l.textContent = label;
        s.appendChild(l);
        const v = document.createElement('div');
        v.className = 'detail-value';
        v.textContent = value;
        s.appendChild(v);
        return s;
    }

    _showDetail(resource, type) {
        if (this.reachabilityMode) return;

        this.detailPanel.classList.add('visible');
        const titleEl = this.detailPanel.querySelector('.topo-detail-title');
        const bodyEl = this.detailPanel.querySelector('.topo-detail-body');
        bodyEl.innerHTML = '';

        switch (type) {
            case 'instance':
                titleEl.textContent = resource.name || resource.id;
                bodyEl.appendChild(this._createDetailSection('Instance ID', resource.id));
                bodyEl.appendChild(this._createDetailSection('Type', resource.instanceType || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('State', resource.state || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('Private IP', resource.privateIp || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('Public IP', resource.publicIp || 'None'));
                const sgNames = (resource.securityGroups || []).map(sg => {
                    const sgId = typeof sg === 'string' ? sg : sg.id;
                    const sgObj = (this.topology.securityGroups || []).find(s => s.id === sgId);
                    return sgObj ? sgObj.name : sgId;
                });
                bodyEl.appendChild(this._createDetailSection('Security Groups', sgNames.join(', ') || 'None'));

                // SSH/RDP connect buttons
                if (resource.state === 'running') {
                    const connDiv = document.createElement('div');
                    connDiv.className = 'topo-connect-buttons';
                    const isWindows = (resource.platform || '').toLowerCase().includes('windows');

                    const sshBtn = document.createElement('button');
                    sshBtn.className = 'topo-connect-btn topo-connect-ssh';
                    sshBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 15l3-3-3-3M12 15h5"/></svg> SSH';
                    sshBtn.onclick = () => {
                        if (window.cloudterm && window.cloudterm.openSession) {
                            window.cloudterm.openSession(resource.id, resource.name, 'ssh');
                        }
                    };
                    connDiv.appendChild(sshBtn);

                    if (isWindows) {
                        const rdpBtn = document.createElement('button');
                        rdpBtn.className = 'topo-connect-btn topo-connect-rdp';
                        rdpBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> RDP';
                        rdpBtn.onclick = () => {
                            if (window.cloudterm && window.cloudterm.openSession) {
                                window.cloudterm.openSession(resource.id, resource.name, 'rdp');
                            }
                        };
                        connDiv.appendChild(rdpBtn);
                    }

                    bodyEl.appendChild(connDiv);
                }

                // Draw connections for this instance
                this._drawInstanceConnections(resource);
                break;

            case 'subnet':
                titleEl.textContent = resource.name || resource.id;
                bodyEl.appendChild(this._createDetailSection('Subnet ID', resource.id));
                bodyEl.appendChild(this._createDetailSection('CIDR', resource.cidr));
                bodyEl.appendChild(this._createDetailSection('AZ', resource.az));
                bodyEl.appendChild(this._createDetailSection('Type', resource.isPublic ? 'Public' : 'Private'));
                bodyEl.appendChild(this._createDetailSection('Available IPs', resource.availableIps || 'N/A'));
                break;

            case 'loadbalancer':
                titleEl.textContent = resource.name || 'Load Balancer';
                bodyEl.appendChild(this._createDetailSection('ARN', resource.arn));
                bodyEl.appendChild(this._createDetailSection('Type', resource.type || 'application'));
                bodyEl.appendChild(this._createDetailSection('Scheme', resource.scheme || 'internet-facing'));
                bodyEl.appendChild(this._createDetailSection('DNS', resource.dnsName || 'N/A'));
                (resource.listeners || []).forEach((l, i) => {
                    bodyEl.appendChild(this._createDetailSection(`Listener ${i + 1}`, `${l.protocol}:${l.port}`));
                });
                (resource.targets || []).forEach((t, i) => {
                    bodyEl.appendChild(this._createDetailSection(
                        `Target ${i + 1}`,
                        `${t.targetId} :${t.port} (${t.healthState})`
                    ));
                });
                break;

            case 'natgateway':
                titleEl.textContent = resource.name || 'NAT Gateway';
                bodyEl.appendChild(this._createDetailSection('ID', resource.id));
                bodyEl.appendChild(this._createDetailSection('Public IP', resource.publicIp || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('State', resource.state || 'available'));
                break;

            case 'igw':
                titleEl.textContent = 'Internet Gateway';
                bodyEl.appendChild(this._createDetailSection('ID', resource.id));
                bodyEl.appendChild(this._createDetailSection('Name', resource.name || 'N/A'));
                break;

            case 'tgw':
                titleEl.textContent = 'Transit Gateway';
                bodyEl.appendChild(this._createDetailSection('Attachment ID', resource.attachmentId || resource.id));
                bodyEl.appendChild(this._createDetailSection('TGW ID', resource.tgwId || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('TGW Name', resource.tgwName || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('Resource Type', resource.resourceType || 'vpc'));
                bodyEl.appendChild(this._createDetailSection('State', resource.state || 'available'));
                if (resource.subnetIds) {
                    bodyEl.appendChild(this._createDetailSection('Subnets', resource.subnetIds.join(', ')));
                }
                break;

            case 'peering':
                titleEl.textContent = 'VPC Peering';
                bodyEl.appendChild(this._createDetailSection('Connection ID', resource.id));
                bodyEl.appendChild(this._createDetailSection('Status', resource.status || 'N/A'));
                if (resource.peerVpcName) bodyEl.appendChild(this._createDetailSection('Peer VPC Name', resource.peerVpcName));
                bodyEl.appendChild(this._createDetailSection('Requester VPC', resource.requesterVpc || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('Requester CIDR', resource.requesterCidr || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('Accepter VPC', resource.accepterVpc || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('Accepter CIDR', resource.accepterCidr || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('Peer Account', resource.peerAccountId || 'same'));
                bodyEl.appendChild(this._createDetailSection('Peer Region', resource.peerRegion || 'same'));
                break;

            case 'tgw-peer':
                titleEl.textContent = 'TGW Peer Attachment';
                bodyEl.appendChild(this._createDetailSection('Attachment ID', resource.attachmentId || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('Resource Type', resource.resourceType || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('Resource ID', resource.resourceId || 'N/A'));
                if (resource.resourceName) bodyEl.appendChild(this._createDetailSection('Name', resource.resourceName));
                if (resource.resourceCidr) bodyEl.appendChild(this._createDetailSection('CIDR', resource.resourceCidr));
                bodyEl.appendChild(this._createDetailSection('State', resource.state || 'N/A'));
                if (resource.accountId) bodyEl.appendChild(this._createDetailSection('Account', resource.accountId));
                break;

            case 'endpoint':
                titleEl.textContent = 'VPC Endpoint';
                bodyEl.appendChild(this._createDetailSection('ID', resource.id));
                bodyEl.appendChild(this._createDetailSection('Service', resource.serviceName || 'N/A'));
                bodyEl.appendChild(this._createDetailSection('Type', resource.type || 'Interface'));
                bodyEl.appendChild(this._createDetailSection('State', resource.state || 'available'));
                if (resource.routeTableIds) {
                    bodyEl.appendChild(this._createDetailSection('Route Tables', resource.routeTableIds.join(', ')));
                }
                break;

            case 'dhcp':
                titleEl.textContent = 'DHCP Options';
                bodyEl.appendChild(this._createDetailSection('Options ID', resource.id));
                if (resource.domainName) bodyEl.appendChild(this._createDetailSection('Domain', resource.domainName));
                if (resource.domainServers) bodyEl.appendChild(this._createDetailSection('DNS Servers', resource.domainServers.join(', ')));
                if (resource.ntpServers) bodyEl.appendChild(this._createDetailSection('NTP Servers', resource.ntpServers.join(', ')));
                break;

            case 'flowlogs':
                titleEl.textContent = `Flow Logs (${(resource.flowLogs || []).length})`;
                (resource.flowLogs || []).forEach(fl => {
                    bodyEl.appendChild(this._createDetailSection('Flow Log', fl.id));
                    bodyEl.appendChild(this._createDetailSection('Status', fl.status));
                    bodyEl.appendChild(this._createDetailSection('Traffic', fl.trafficType));
                    bodyEl.appendChild(this._createDetailSection('Destination', fl.logDestination || 'N/A'));
                    bodyEl.appendChild(this._createDetailSection('Type', fl.destinationType || 'N/A'));
                    bodyEl.appendChild(document.createElement('hr'));
                });
                break;

            case 'eips':
                titleEl.textContent = `Elastic IPs (${(resource.elasticIps || []).length})`;
                (resource.elasticIps || []).forEach(eip => {
                    bodyEl.appendChild(this._createDetailSection('Public IP', eip.publicIp));
                    bodyEl.appendChild(this._createDetailSection('Allocation', eip.allocationId));
                    if (eip.instanceId) bodyEl.appendChild(this._createDetailSection('Instance', eip.instanceId));
                    if (eip.privateIp) bodyEl.appendChild(this._createDetailSection('Private IP', eip.privateIp));
                    if (eip.name) bodyEl.appendChild(this._createDetailSection('Name', eip.name));
                    bodyEl.appendChild(document.createElement('hr'));
                });
                break;

            case 'prefixlists':
                titleEl.textContent = `Prefix Lists (${(resource.prefixLists || []).length})`;
                (resource.prefixLists || []).forEach(pl => {
                    bodyEl.appendChild(this._createDetailSection('Prefix List', pl.id));
                    bodyEl.appendChild(this._createDetailSection('Name', pl.name || 'N/A'));
                    bodyEl.appendChild(this._createDetailSection('Max Entries', pl.maxEntries || 'N/A'));
                    if (pl.cidrs && pl.cidrs.length > 0) {
                        bodyEl.appendChild(this._createDetailSection('CIDRs', pl.cidrs.slice(0, 10).join(', ') + (pl.cidrs.length > 10 ? ` (+${pl.cidrs.length - 10} more)` : '')));
                    }
                    bodyEl.appendChild(document.createElement('hr'));
                });
                break;
        }

        this.selectedNode = { resource, type };
    }

    _hideDetail() {
        this.detailPanel.classList.remove('visible');
        this.selectedNode = null;
        this._clearInstanceConnections();
    }

    // ═══════════════════════════════════════════════════════════════
    // REACHABILITY / ANALYZE PATH
    // ═══════════════════════════════════════════════════════════════

    _toggleReachabilityMode() {
        if (this.reachabilityMode) {
            this._cancelReachabilityMode();
        } else {
            this._startReachabilityMode();
        }
    }

    _startReachabilityMode() {
        this.reachabilityMode = true;
        this.reachabilitySource = null;
        this.reachabilityDest = null;
        this.analyzePanel.classList.remove('hidden');
        this.analyzeMsgEl.textContent = 'Click source instance, then destination.';
        this.analyzeMsgEl.className = 'topo-analyze-msg';
        this.analyzeSrcEl.textContent = '\u2014';
        this.analyzeDstEl.textContent = '\u2014';
        this.analyzeManualInput.value = '';
        this.analyzeRunBtn.disabled = true;
        this.analyzeResultsEl.innerHTML = '';
        this.container.querySelector('.topo-btn-reachability').classList.add('active');
        this.svg.style('cursor', 'crosshair');
    }

    _cancelReachabilityMode() {
        this.reachabilityMode = false;
        this.reachabilitySource = null;
        this.reachabilityDest = null;
        this.analyzePanel.classList.add('hidden');
        this.container.querySelector('.topo-btn-reachability').classList.remove('active');
        this.svg.style('cursor', 'default');

        // Reset instance highlights
        this.mainGroup.selectAll('.instance-node rect').each((d, i, nodes) => {
            const node = d3.select(nodes[i].parentNode);
            const instId = node.attr('data-instance-id');
            d3.select(nodes[i])
                .attr('stroke', instId === this.instanceId ? this._getColor('--ssh') : this._getColor('--b1'))
                .attr('stroke-width', instId === this.instanceId ? 2 : 1);
        });

        // Remove any path animation
        this.mainGroup.selectAll('.reachability-path').remove();
    }

    _handleReachabilityClick(resource, type) {
        if (type !== 'instance') return;

        if (!this.reachabilitySource) {
            this.reachabilitySource = resource;
            this.mainGroup.select(`[data-instance-id="${resource.id}"] rect`)
                .attr('stroke', this._getColor('--ssh')).attr('stroke-width', 3);
            this.analyzeSrcEl.textContent = `${resource.name || resource.id} (${resource.privateIp || '?'})`;
            this.analyzeMsgEl.textContent = 'Now click destination instance, or enter IP below.';
            this._updateAnalyzeBtn();
        } else if (!this.reachabilityDest && resource.id !== this.reachabilitySource.id) {
            this.reachabilityDest = resource;
            this.mainGroup.select(`[data-instance-id="${resource.id}"] rect`)
                .attr('stroke', this._getColor('--red')).attr('stroke-width', 3);
            this.analyzeDstEl.textContent = `${resource.name || resource.id} (${resource.privateIp || '?'})`;
            this.analyzeMsgEl.textContent = 'Both selected. Click Analyze.';
            this._updateAnalyzeBtn();
        }
    }

    _setManualDest() {
        const ip = this.analyzeManualInput.value.trim();
        if (!ip) {
            this._setAnalyzeMsg('Enter a valid IP address.', 'warn');
            return;
        }
        // Validate IP format
        if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
            this._setAnalyzeMsg('Invalid IP format. Use e.g. 10.0.1.50', 'warn');
            return;
        }
        this.reachabilityDest = { id: 'manual-ip', privateIp: ip, name: ip };
        this.analyzeDstEl.textContent = ip + ' (manual)';
        this.analyzeMsgEl.textContent = 'Destination set. Click Analyze.';
        this.analyzeMsgEl.className = 'topo-analyze-msg';
        this._updateAnalyzeBtn();
    }

    _updateAnalyzeBtn() {
        const ready = !!(this.reachabilitySource && this.reachabilityDest);
        this.analyzeRunBtn.disabled = !ready;
    }

    _setAnalyzeMsg(msg, type = '') {
        this.analyzeMsgEl.textContent = msg;
        this.analyzeMsgEl.className = 'topo-analyze-msg' + (type ? ' topo-analyze-msg-' + type : '');
    }

    async _runAnalysis() {
        if (!this.reachabilitySource || !this.reachabilityDest) return;

        const protocol = this.analyzeProtoSelect.value;
        const port = parseInt(this.analyzePortInput.value) || 22;
        const sourceId = this.reachabilitySource.id;
        const destId = this.reachabilityDest.id;
        const destIp = this.reachabilityDest.privateIp;

        this._setAnalyzeMsg('Initiating analysis...', '');
        this.analyzeRunBtn.disabled = true;
        this.analyzeResultsEl.innerHTML = '';
        this._clearPathVisualization();

        // SVG group for analysis markers
        this.mainGroup.selectAll('.reachability-path').remove();
        const pathGroup = this.mainGroup.append('g').attr('class', 'reachability-path');

        const body = { sourceInstanceId: sourceId, protocol, port };
        if (destId === 'manual-ip') {
            body.destIp = destIp;
        } else {
            body.destInstanceId = destId;
        }

        // Status element at top of results
        const statusEl = document.createElement('div');
        statusEl.className = 'topo-deep-status';
        statusEl.innerHTML = '<span class="deep-spinner"></span> Connecting to AWS Network Insights...';
        this.analyzeResultsEl.appendChild(statusEl);

        // Header
        const header = document.createElement('div');
        header.className = 'topo-path-section-header';
        header.textContent = '\uD83D\uDD2C Network Insights — Real Packet Path';
        this.analyzeResultsEl.appendChild(header);

        // Hop container
        const hopContainer = document.createElement('div');
        hopContainer.className = 'topo-deep-hops';
        this.analyzeResultsEl.appendChild(hopContainer);

        let hopIndex = 0;
        let deepResult = null;

        try {
            const resp = await fetch('/topology/deep-analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(err.error || 'Analysis failed');
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const event = JSON.parse(line.slice(6));
                        switch (event.type) {
                            case 'status':
                                statusEl.innerHTML = '<span class="deep-spinner"></span> ' + this._escapeHtml(event.message);
                                this.analyzeResultsEl.scrollTop = this.analyzeResultsEl.scrollHeight;
                                break;

                            case 'hop':
                                this._renderDeepHop(event.hop, hopIndex, hopContainer, pathGroup);
                                hopIndex++;
                                this.analyzeResultsEl.scrollTop = this.analyzeResultsEl.scrollHeight;
                                break;

                            case 'result':
                                deepResult = event.result;
                                break;

                            case 'error':
                                throw new Error(event.message);
                        }
                    } catch (parseErr) {
                        if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
                    }
                }
            }

            // Render final result
            if (deepResult) {
                this._renderDeepResult(deepResult, statusEl, hopContainer, pathGroup);
            } else {
                statusEl.innerHTML = '\u26A0 No result received';
                this.analyzeRunBtn.disabled = false;
            }

        } catch (e) {
            statusEl.innerHTML = '\u274C ' + this._escapeHtml(e.message);
            statusEl.className = 'topo-deep-status deep-error';
            this.analyzeRunBtn.disabled = false;
        }
    }

    _clearPathVisualization() {
        // Remove path lines/markers from SVG but keep the panel open
        this.mainGroup.selectAll('.reachability-path').remove();
        this.analyzeResultsEl.innerHTML = '';
        this.analyzeClearBtn.style.display = 'none';
        this._setAnalyzeMsg('Path cleared. Select new source/dest or click Analyze again.', '');

        // Reset instance highlights back to normal
        this.mainGroup.selectAll('.instance-node rect').each((d, i, nodes) => {
            const node = d3.select(nodes[i].parentNode);
            const instId = node.attr('data-instance-id');
            d3.select(nodes[i])
                .attr('stroke', instId === this.instanceId ? this._getColor('--ssh') : this._getColor('--b1'))
                .attr('stroke-width', instId === this.instanceId ? 2 : 1)
                .attr('fill', this._getColor('--bg'));
        });

        // Reset networking pill highlights (SG, NACL, RT)
        this.mainGroup.selectAll('.net-pill-node').each((d, i, nodes) => {
            const pill = d3.select(nodes[i]);
            const resType = pill.attr('data-resource-type');
            const colors = this._getNetworkingColors(resType);
            pill.select('rect')
                .attr('stroke', colors.border).attr('stroke-width', 1)
                .attr('fill', colors.bg);
            // Remove hop number badges added during animation
            pill.selectAll('.hop-badge').remove();
        });

        // Re-highlight source/dest if they are still selected
        if (this.reachabilitySource) {
            this.mainGroup.select(`[data-instance-id="${this.reachabilitySource.id}"] rect`)
                .attr('stroke', this._getColor('--ssh')).attr('stroke-width', 3);
        }
        if (this.reachabilityDest && this.reachabilityDest.id !== 'manual-ip') {
            this.mainGroup.select(`[data-instance-id="${this.reachabilityDest.id}"] rect`)
                .attr('stroke', this._getColor('--red')).attr('stroke-width', 3);
        }
    }

    _renderDeepHop(hop, index, container, pathGroup) {
        // Panel hop element
        const hopEl = document.createElement('div');
        const statusClass = hop.status === 'deny' ? 'hop-deny' : hop.status === 'info' ? 'hop-info' : 'hop-allow';
        hopEl.className = 'topo-analyze-hop ' + statusClass + ' hop-entering';

        const icon = hop.status === 'deny' ? '\u2717' : hop.status === 'info' ? '\u2139' : '\u2713';
        const componentIcons = {
            'instance': '\uD83D\uDDA5', 'eni': '\uD83D\uDD0C', 'sg': '\uD83D\uDEE1', 'nacl': '\uD83D\uDCCB',
            'route-table': '\uD83D\uDD00', 'igw': '\uD83C\uDF0D', 'nat': '\uD83C\uDF10', 'tgw': '\uD83D\uDD17',
            'pcx': '\uD83D\uDD17', 'vpc-endpoint': '\uD83D\uDD12', 'subnet': '\uD83D\uDCC1', 'vpc': '\u2601'
        };
        const compIcon = componentIcons[hop.component] || '\u2699';
        const inVpcBadge = hop.inVpc ? '' : '<span class="deep-external-badge">external</span>';

        hopEl.innerHTML = `
            <span class="hop-num">${index}</span>
            <span class="hop-icon">${icon}</span>
            <div class="hop-body">
                <div class="hop-component">${compIcon} ${this._escapeHtml(hop.componentName)} ${inVpcBadge}</div>
                <div class="hop-resource-id">${this._escapeHtml(hop.resourceId || '')}</div>
                ${hop.direction ? `<div class="hop-detail">\u2794 ${hop.direction}</div>` : ''}
                ${hop.matchedRule ? `<div class="hop-matched-rule">${this._escapeHtml(hop.matchedRule)}</div>` : ''}
            </div>
        `;
        container.appendChild(hopEl);
        requestAnimationFrame(() => hopEl.classList.remove('hop-entering'));

        // SVG bulb marker — only for hops visible in the VPC topology
        if (hop.inVpc && hop.resourceId) {
            const pos = this.posMap[hop.resourceId] || this.posMap['sg-' + hop.resourceId] ||
                        this.posMap['nacl-' + hop.resourceId] || this.posMap['route-table-' + hop.resourceId];
            if (pos) {
                const fill = hop.status === 'deny' ? '#f87171' :
                             hop.component === 'instance' ? '#60a5fa' : '#4ade80';
                const r = hop.component === 'instance' ? 12 : 10;

                // Glow ring
                pathGroup.append('circle')
                    .attr('cx', pos.cx).attr('cy', pos.cy).attr('r', r + 4)
                    .attr('fill', 'none').attr('stroke', fill).attr('stroke-width', 2)
                    .attr('opacity', 0).transition().duration(300).attr('opacity', 0.4);

                // Solid numbered marker
                pathGroup.append('circle')
                    .attr('cx', pos.cx).attr('cy', pos.cy).attr('r', r)
                    .attr('fill', fill).attr('stroke', '#fff').attr('stroke-width', 2)
                    .attr('opacity', 0).transition().duration(200).attr('opacity', 1);

                // Number inside
                pathGroup.append('text')
                    .attr('x', pos.cx).attr('y', pos.cy + 4).attr('text-anchor', 'middle')
                    .attr('fill', '#fff').attr('font-size', '10px').attr('font-weight', '800')
                    .attr('font-family', 'JetBrains Mono, monospace')
                    .attr('opacity', 0).text(index)
                    .transition().duration(200).attr('opacity', 1);

                // Highlight the resource pill/node
                const pillNode = this.mainGroup.select(`[data-resource-id="${hop.resourceId}"]`);
                if (!pillNode.empty()) {
                    const pillBg = hop.status === 'deny' ? 'rgba(248,113,113,0.18)' : 'rgba(74,222,128,0.18)';
                    pillNode.select('rect')
                        .attr('stroke', fill).attr('stroke-width', 2.5).attr('fill', pillBg);
                }

                const instNode = this.mainGroup.select(`[data-instance-id="${hop.resourceId}"]`);
                if (!instNode.empty()) {
                    const instBg = hop.component === 'instance' ? 'rgba(96,165,250,0.12)' : 'rgba(74,222,128,0.12)';
                    instNode.select('rect')
                        .attr('stroke', fill).attr('stroke-width', 3).attr('fill', instBg);
                }
            }
        }
    }

    _renderDeepResult(result, statusEl, hopContainer, pathGroup) {
        const reachable = result.reachable;

        // Update status
        statusEl.className = 'topo-deep-status ' + (reachable ? 'deep-success' : 'deep-blocked');
        statusEl.innerHTML = reachable
            ? '\u2705 <strong>Path is REACHABLE</strong> — ' + result.hopCount + ' hops in ' + result.duration
            : '\u274C <strong>Path is BLOCKED</strong> — analyzed in ' + result.duration;

        // Show explanations if any
        if (result.explanations && result.explanations.length > 0) {
            const expSection = document.createElement('div');
            expSection.className = 'topo-deep-explanations';
            const expHeader = document.createElement('div');
            expHeader.className = 'topo-path-section-header';
            expHeader.textContent = '\uD83D\uDCA1 AWS Explanations';
            expSection.appendChild(expHeader);
            result.explanations.forEach(exp => {
                const expEl = document.createElement('div');
                expEl.className = 'topo-deep-explanation';
                expEl.textContent = exp;
                expSection.appendChild(expEl);
            });
            this.analyzeResultsEl.appendChild(expSection);
        }

        // AI Insights button — only shown when path is blocked and AI agent is available
        if (!reachable && window.cloudterm && window.cloudterm.aiChat) {
            const aiSection = document.createElement('div');
            aiSection.className = 'topo-deep-ai-section';
            const aiBtn = document.createElement('button');
            aiBtn.className = 'topo-btn topo-ai-insights-btn';
            aiBtn.innerHTML = '\u2728 Ask AI for Insights & Recommendations';
            aiBtn.addEventListener('click', () => {
                this._requestAIInsights(result);
                aiBtn.disabled = true;
                aiBtn.textContent = 'Sent to AI Assistant...';
            });
            aiSection.appendChild(aiBtn);
            this.analyzeResultsEl.appendChild(aiSection);
        }

        this.analyzeRunBtn.disabled = false;
        this.analyzeClearBtn.style.display = '';
    }

    _requestAIInsights(deepResult) {
        const ai = window.cloudterm.aiChat;
        if (!ai) return;

        // Open AI panel if not already open
        if (ai.panel.classList.contains('ai-hidden')) {
            ai.toggle();
        }

        // Build context message
        const srcName = this.reachabilitySource ? this.reachabilitySource.name || this.reachabilitySource.id : 'unknown';
        const dstName = this.reachabilityDest ? this.reachabilityDest.name || this.reachabilityDest.id : 'unknown';
        const protocol = this.analyzeProtoSelect.value;
        const port = this.analyzePortInput.value;

        let msg = `I ran a deep network reachability analysis (AWS Network Insights) and the path is BLOCKED.\n\n`;
        msg += `**Source:** ${srcName}\n**Destination:** ${dstName}\n**Protocol:** ${protocol} port ${port}\n\n`;

        if (deepResult.hops && deepResult.hops.length > 0) {
            msg += `**Hop trace (${deepResult.hops.length} hops):**\n`;
            deepResult.hops.forEach((hop, i) => {
                const status = hop.status === 'deny' ? '\u274C BLOCKED' : '\u2705';
                msg += `${i}. ${status} ${hop.componentName} (${hop.resourceId})`;
                if (hop.matchedRule) msg += ` — ${hop.matchedRule}`;
                msg += '\n';
            });
        }

        if (deepResult.explanations && deepResult.explanations.length > 0) {
            msg += `\n**AWS Explanations:**\n`;
            deepResult.explanations.forEach(exp => {
                msg += `- ${exp}\n`;
            });
        }

        msg += `\nPlease analyze why the path is blocked and provide specific recommendations to fix the connectivity.`;

        // Send to AI chat
        ai.input.value = msg;
        ai._onSend();
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ─── Exposure Scan ───────────────────────────────────────────

    async _scanExposure() {
        try {
            const resp = await fetch('/topology/exposure/' + this.instanceId);
            if (!resp.ok) throw new Error('Exposure scan failed');
            const result = await resp.json();
            this.exposureResults = result;
            this._highlightExposure(result);
        } catch (e) {
            this._showToast('Exposure scan failed: ' + e.message, 'error');
        }
    }

    _highlightExposure(result) {
        if (!result.exposed || result.exposed.length === 0) {
            this._showToast('No exposed instances found.', 'success');
            return;
        }

        result.exposed.forEach(exp => {
            const node = this.mainGroup.select(`[data-instance-id="${exp.instanceId}"]`);
            if (!node.empty()) {
                node.select('rect')
                    .attr('stroke', this._getColor('--red'))
                    .attr('stroke-width', 3)
                    .attr('filter', 'url(#glow)');

                const rect = node.select('rect');
                const x = parseFloat(rect.attr('x'));
                const y = parseFloat(rect.attr('y'));
                node.append('text')
                    .attr('x', x + parseFloat(rect.attr('width')) - 5)
                    .attr('y', y + 15)
                    .attr('fill', this._getColor('--red'))
                    .attr('font-size', '16px').attr('text-anchor', 'end')
                    .text('\u26A0');
            }
        });

        const summary = result.exposed.map(e =>
            `${e.instanceName || e.instanceId}: ${e.exposedPorts.join(', ')}`
        ).join('\n');
        this._showToast(`Exposed: ${result.exposed.length} instance(s) found. Check highlighted nodes.`, 'warn', 8000);
    }

    // ─── Search ──────────────────────────────────────────────────

    _highlightSearch() {
        this.mainGroup.selectAll('.instance-node, .lb-node, .nat-node, .subnet-group')
            .attr('opacity', 1);

        if (!this.searchQuery) return;

        let firstMatch = null;
        this.mainGroup.selectAll('.instance-node').each((d, i, nodes) => {
            const node = d3.select(nodes[i]);
            const text = node.text().toLowerCase();
            const instId = (node.attr('data-instance-id') || '').toLowerCase();
            if (text.includes(this.searchQuery) || instId.includes(this.searchQuery)) {
                node.attr('opacity', 1);
                node.select('rect').attr('stroke', this._getColor('--rdp')).attr('stroke-width', 2);
                if (!firstMatch) firstMatch = node;
            } else {
                node.attr('opacity', 0.3);
            }
        });

        if (firstMatch) {
            const rect = firstMatch.select('rect');
            const x = parseFloat(rect.attr('x')) + parseFloat(rect.attr('width')) / 2;
            const y = parseFloat(rect.attr('y')) + parseFloat(rect.attr('height')) / 2;
            const scale = this.currentTransform ? this.currentTransform.k : 1;
            this.svg.transition().duration(750)
                .call(this.zoom.transform, d3.zoomIdentity.translate(this.width / 2 - x * scale, this.height / 2 - y * scale).scale(scale));
        }
    }

    // ─── Zoom helpers ────────────────────────────────────────────

    _zoomIn() { this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.3); }
    _zoomOut() { this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.7); }

    _fitToView() {
        const bounds = this.mainGroup.node().getBBox();
        const svgNode = this.svg.node();
        const fw = svgNode.clientWidth || this.container.clientWidth || this.width;
        const fh = svgNode.clientHeight || this.container.clientHeight || this.height;
        if (fw < 10 || fh < 10) return;
        if (bounds.width < 1 || bounds.height < 1) return;

        const mx = bounds.x + bounds.width / 2;
        const my = bounds.y + bounds.height / 2;
        const scale = 0.85 / Math.max(bounds.width / fw, bounds.height / fh);
        const tx = fw / 2 - scale * mx;
        const ty = fh / 2 - scale * my;

        this.svg.transition().duration(750)
            .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }

    // ─── Loading / Error ─────────────────────────────────────────

    _showLoading() {
        const loading = document.createElement('div');
        loading.className = 'topo-loading';
        const spinner = document.createElement('div');
        spinner.className = 'topo-loading-spinner';
        loading.appendChild(spinner);
        const text = document.createElement('div');
        text.className = 'topo-loading-text';
        text.textContent = 'Loading topology...';
        loading.appendChild(text);
        this.container.appendChild(loading);
    }

    _showError(msg) {
        this.mainGroup.selectAll('*').remove();
        const e = this.mainGroup.append('g')
            .attr('class', 'topo-error')
            .attr('transform', `translate(${this.width / 2}, ${this.height / 2})`);
        e.append('text').attr('x', 0).attr('y', -20)
            .attr('fill', this._getColor('--red'))
            .attr('font-size', '16px').attr('text-anchor', 'middle')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text('Error Loading Topology');
        e.append('text').attr('x', 0).attr('y', 10)
            .attr('fill', this._getColor('--muted'))
            .attr('font-size', '12px').attr('text-anchor', 'middle')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(msg);
    }

    _getColor(varName) {
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    }

    _getNetworkingColors(type) {
        const map = {
            'route-table': { bg: 'rgba(77,159,255,.12)', border: '#4d9fff' },
            'nacl':        { bg: 'rgba(251,191,36,.12)', border: '#fbbf24' },
            'sg':          { bg: 'rgba(167,139,250,.12)', border: '#a78bfa' },
        };
        return map[type] || map['sg'];
    }

    destroy() {
        if (this._themeHandler) document.removeEventListener('cloudterm-theme-changed', this._themeHandler);
        if (this.svg) this.svg.remove();
        if (this.detailPanel) this.detailPanel.remove();
        if (this.analyzePanel) this.analyzePanel.remove();
        if (this.toastContainer) this.toastContainer.remove();
        const toolbar = this.container.querySelector('.topo-toolbar');
        if (toolbar) toolbar.remove();
    }
}
