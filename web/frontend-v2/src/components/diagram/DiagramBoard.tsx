import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionLineType,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type OnSelectionChangeParams,
  type Connection,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  BezierEdge,
  StraightEdge,
  SmoothStepEdge,
  StepEdge,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useToastStore } from '@/stores/toast';
import { DiagramShapeNode } from './nodes/DiagramShapeNode';
import { DiagramIconNode } from './nodes/DiagramIconNode';
import { DiagramToolbar } from './DiagramToolbar';
import { DiagramPalette } from './DiagramPalette';
import { DiagramProperties } from './DiagramProperties';
import type { DiagramNodeData, DiagramEdgeData, EdgeStyleType, DiagramFileData } from './lib/diagramTypes';

const LS_KEY = 'ct-diagram-board';
const SAVE_DEBOUNCE = 400;

const nodeTypes: NodeTypes = {
  diagramShape: DiagramShapeNode,
  diagramIcon: DiagramIconNode,
};

// Custom edges that respect edge data styling
function StyledEdge(props: React.ComponentProps<typeof BezierEdge> & { data?: DiagramEdgeData }) {
  const { data, ...rest } = props;
  const strokeColor = data?.strokeColor ?? 'var(--text-dim)';
  const strokeDash = data?.strokeStyle === 'dashed' ? '8 4' : undefined;
  return <BezierEdge {...rest} style={{ ...rest.style, stroke: strokeColor, strokeDasharray: strokeDash }} />;
}

function StyledStraightEdge(props: React.ComponentProps<typeof StraightEdge> & { data?: DiagramEdgeData }) {
  const { data, ...rest } = props;
  const strokeColor = data?.strokeColor ?? 'var(--text-dim)';
  const strokeDash = data?.strokeStyle === 'dashed' ? '8 4' : undefined;
  return <StraightEdge {...rest} style={{ ...rest.style, stroke: strokeColor, strokeDasharray: strokeDash }} />;
}

function StyledSmoothStepEdge(props: React.ComponentProps<typeof SmoothStepEdge> & { data?: DiagramEdgeData }) {
  const { data, ...rest } = props;
  const strokeColor = data?.strokeColor ?? 'var(--text-dim)';
  const strokeDash = data?.strokeStyle === 'dashed' ? '8 4' : undefined;
  return <SmoothStepEdge {...rest} style={{ ...rest.style, stroke: strokeColor, strokeDasharray: strokeDash }} />;
}

function StyledStepEdge(props: React.ComponentProps<typeof StepEdge> & { data?: DiagramEdgeData }) {
  const { data, ...rest } = props;
  const strokeColor = data?.strokeColor ?? 'var(--text-dim)';
  const strokeDash = data?.strokeStyle === 'dashed' ? '8 4' : undefined;
  return <StepEdge {...rest} style={{ ...rest.style, stroke: strokeColor, strokeDasharray: strokeDash }} />;
}

const edgeTypes: EdgeTypes = {
  bezier: StyledEdge as EdgeTypes[string],
  straight: StyledStraightEdge as EdgeTypes[string],
  smoothstep: StyledSmoothStepEdge as EdgeTypes[string],
  step: StyledStepEdge as EdgeTypes[string],
};

function loadFromStorage(): { nodes: Node<DiagramNodeData>[]; edges: Edge<DiagramEdgeData>[]; viewport?: { x: number; y: number; zoom: number } } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { nodes: Node<DiagramNodeData>[]; edges: Edge<DiagramEdgeData>[]; viewport?: { x: number; y: number; zoom: number } };
  } catch {
    return null;
  }
}

function DiagramBoardInner() {
  const saved = loadFromStorage();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<DiagramNodeData>>(saved?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<DiagramEdgeData>>(saved?.edges ?? []);

  const [selectedNodes, setSelectedNodes] = useState<Node<DiagramNodeData>[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<Edge<DiagramEdgeData>[]>([]);

  const [edgeType, setEdgeType] = useState<EdgeStyleType>('smoothstep');
  const [bgVariant, setBgVariant] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [snapToGrid, setSnapToGrid] = useState(false);

  const rfInstance = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // History
  const historyRef = useRef<{ nodes: Node<DiagramNodeData>[]; edges: Edge<DiagramEdgeData>[] }[]>([]);
  const historyIndexRef = useRef(-1);
  const suppressHistoryRef = useRef(false);

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore viewport on mount
  useEffect(() => {
    if (saved?.viewport) {
      rfInstance.setViewport(saved.viewport);
    }
    // Push initial empty history entry
    historyRef.current = [{ nodes: saved?.nodes ?? [], edges: saved?.edges ?? [] }];
    historyIndexRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced auto-save
  useEffect(() => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      const viewport = rfInstance.getViewport();
      localStorage.setItem(LS_KEY, JSON.stringify({ nodes, edges, viewport }));
    }, SAVE_DEBOUNCE);
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [nodes, edges, rfInstance]);

  const pushHistory = useCallback(() => {
    if (suppressHistoryRef.current) return;
    const snapshot = { nodes: rfInstance.getNodes(), edges: rfInstance.getEdges() };
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > 100) {
      historyRef.current.shift();
    }
    historyIndexRef.current = historyRef.current.length - 1;
  }, [rfInstance]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (snapshot) {
      suppressHistoryRef.current = true;
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      suppressHistoryRef.current = false;
    }
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (snapshot) {
      suppressHistoryRef.current = true;
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      suppressHistoryRef.current = false;
    }
  }, [setNodes, setEdges]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (meta && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
      if (meta && e.key === 'y') { e.preventDefault(); redo(); return; }

      if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement === document.body) {
        const selNodes = rfInstance.getNodes().filter((n) => n.selected);
        const selEdges = rfInstance.getEdges().filter((ed) => ed.selected);
        if (selNodes.length > 0 || selEdges.length > 0) {
          pushHistory();
          setNodes((ns) => ns.filter((n) => !n.selected));
          setEdges((es) => es.filter((ed) => !ed.selected));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, setNodes, setEdges, rfInstance, pushHistory]);

  // Connection handler
  const onConnect = useCallback(
    (params: Connection) => {
      pushHistory();
      setEdges((es) =>
        addEdge({ ...params, type: edgeType, data: {}, animated: false }, es),
      );
    },
    [setEdges, edgeType, pushHistory],
  );

  // Selection change
  const onSelectionChange = useCallback(({ nodes: sn, edges: se }: OnSelectionChangeParams) => {
    setSelectedNodes(sn as Node<DiagramNodeData>[]);
    setSelectedEdges(se as Edge<DiagramEdgeData>[]);
  }, []);

  // Drag and drop from palette
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/ctdiagram-node');
      if (!raw) return;

      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const item = JSON.parse(raw) as {
        iconType?: string;
        service?: string;
        label?: string;
        shape?: string;
        category?: string;
        color?: string;
        width?: number;
        height?: number;
        abbr?: string;
      };

      const position = rfInstance.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });

      const isIcon = Boolean(item.iconType);
      const nodeType = isIcon ? 'diagramIcon' : 'diagramShape';

      const newNode: Node<DiagramNodeData> = {
        id: `node-${Date.now()}`,
        type: nodeType,
        position,
        data: {
          label: item.service ?? item.label ?? 'Node',
          iconType: item.iconType as DiagramNodeData['iconType'],
          service: item.service,
          category: item.category,
          shape: item.shape as DiagramNodeData['shape'],
        },
        width: item.width ?? (isIcon ? 80 : 120),
        height: item.height ?? (isIcon ? 100 : 60),
      };

      pushHistory();
      setNodes((ns) => [...ns, newNode]);
    },
    [rfInstance, setNodes, pushHistory],
  );

  // Node / edge update handlers
  const handleUpdateNode = useCallback((id: string, data: Partial<DiagramNodeData>) => {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
    );
  }, [setNodes]);

  const handleUpdateEdge = useCallback((id: string, data: Partial<DiagramEdgeData>) => {
    setEdges((es) =>
      es.map((e) => (e.id === id ? { ...e, data: { ...(e.data ?? {}), ...data } } : e)),
    );
  }, [setEdges]);

  const handleDeleteNode = useCallback((id: string) => {
    pushHistory();
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedNodes([]);
  }, [setNodes, setEdges, pushHistory]);

  const handleDeleteEdge = useCallback((id: string) => {
    pushHistory();
    setEdges((es) => es.filter((e) => e.id !== id));
    setSelectedEdges([]);
  }, [setEdges, pushHistory]);

  // Push history on significant node changes (drag end)
  const onNodeDragStop = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  // Export PNG via print
  const handleExportPng = useCallback(() => {
    window.print();
  }, []);

  // Export .ctdiagram
  const handleExportDiagram = useCallback(() => {
    const data: DiagramFileData = {
      version: 1,
      type: 'ctdiagram',
      nodes: rfInstance.getNodes() as Node<DiagramNodeData>[],
      edges: rfInstance.getEdges() as Edge<DiagramEdgeData>[],
      viewport: rfInstance.getViewport(),
      createdAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagram-${Date.now()}.ctdiagram`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rfInstance]);

  // Import .ctdiagram
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as DiagramFileData;
        if (raw.type !== 'ctdiagram') {
          useToastStore.getState().push({ variant: 'danger', title: 'Invalid file', description: 'Not a .ctdiagram file' });
          return;
        }
        pushHistory();
        setNodes(raw.nodes ?? []);
        setEdges(raw.edges ?? []);
        if (raw.viewport) rfInstance.setViewport(raw.viewport);
        useToastStore.getState().push({ variant: 'success', title: 'Diagram imported', description: file.name });
      } catch {
        useToastStore.getState().push({ variant: 'danger', title: 'Import failed', description: 'Could not parse file' });
      }
    };
    reader.readAsText(file);
    // Reset the input so the same file can be imported again
    e.target.value = '';
  }, [rfInstance, setNodes, setEdges, pushHistory]);

  // Manual save
  const handleSave = useCallback(() => {
    const viewport = rfInstance.getViewport();
    localStorage.setItem(LS_KEY, JSON.stringify({ nodes, edges, viewport }));
    useToastStore.getState().push({ variant: 'success', title: 'Diagram saved', description: 'Saved to browser storage' });
  }, [rfInstance, nodes, edges]);

  // Clear canvas
  const handleClear = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0) return;
    pushHistory();
    setNodes([]);
    setEdges([]);
  }, [nodes.length, edges.length, setNodes, setEdges, pushHistory]);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const selectedNode = selectedNodes[0] ?? null;
  const selectedEdge = selectedEdges[0] ?? null;

  const connectionLineType = edgeType === 'bezier' ? ConnectionLineType.Bezier
    : edgeType === 'straight' ? ConnectionLineType.Straight
    : edgeType === 'step' ? ConnectionLineType.Step
    : ConnectionLineType.SmoothStep;

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Print styles for PNG export */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #diagram-canvas-print { display: block !important; position: fixed; inset: 0; z-index: 9999; background: var(--bg); }
        }
      `}</style>

      {/* Toolbar */}
      <DiagramToolbar
        onUndo={undo}
        onRedo={redo}
        onClear={handleClear}
        canUndo={canUndo}
        canRedo={canRedo}
        snapToGrid={snapToGrid}
        onToggleSnap={() => setSnapToGrid((v) => !v)}
        bgVariant={bgVariant}
        onBgVariant={setBgVariant}
        edgeType={edgeType}
        onEdgeType={setEdgeType}
        onExportPng={handleExportPng}
        onExportDiagram={handleExportDiagram}
        onImport={handleImport}
        onSave={handleSave}
      />

      {/* Main area: palette + canvas + properties */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <DiagramPalette />

        {/* Canvas wrapper */}
        <div
          ref={wrapperRef}
          id="diagram-canvas-print"
          style={{ flex: 1, position: 'relative' }}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) => {
              onNodesChange(changes);
            }}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: edgeType, animated: false }}
            connectionLineType={connectionLineType}
            snapToGrid={snapToGrid}
            snapGrid={[16, 16]}
            nodesDraggable
            nodesConnectable
            edgesReconnectable
            selectionOnDrag
            panOnDrag={[1, 2]}
            multiSelectionKeyCode="Shift"
            deleteKeyCode={null}
            fitView={nodes.length > 0}
            minZoom={0.1}
            maxZoom={4}
            style={{ background: 'var(--bg)' }}
          >
            <Background
              variant={bgVariant}
              gap={16}
              size={1}
              color="var(--border)"
              style={{ opacity: 0.5 }}
            />
            <Controls
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            />
            <MiniMap
              nodeColor={() => 'var(--accent)'}
              maskColor="rgba(0,0,0,0.5)"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            />
          </ReactFlow>
        </div>

        <DiagramProperties
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          onUpdateNode={handleUpdateNode}
          onUpdateEdge={handleUpdateEdge}
          onDeleteNode={handleDeleteNode}
          onDeleteEdge={handleDeleteEdge}
        />
      </div>
    </div>
  );
}

export function DiagramBoard() {
  return (
    <ReactFlowProvider>
      <DiagramBoardInner />
    </ReactFlowProvider>
  );
}
