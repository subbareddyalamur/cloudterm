import { useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import type { Node, Edge } from '@xyflow/react';
import type { DiagramNodeData, DiagramEdgeData, BorderStyle } from './lib/diagramTypes';

interface DiagramPropertiesProps {
  selectedNode: Node<DiagramNodeData> | null;
  selectedEdge: Edge<DiagramEdgeData> | null;
  onUpdateNode: (id: string, data: Partial<DiagramNodeData>) => void;
  onUpdateEdge: (id: string, data: Partial<DiagramEdgeData>) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
}

interface ColorSwatchProps {
  value: string;
  onChange: (val: string) => void;
  label: string;
}

function ColorSwatch({ value, onChange, label }: ColorSwatchProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1 }}>{label}</label>
      <div style={{ position: 'relative', width: 28, height: 22 }}>
        <div
          style={{
            width: 28,
            height: 22,
            borderRadius: 4,
            background: value || 'var(--border)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
        />
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}

interface PropRowProps {
  label: string;
  children: React.ReactNode;
}

function PropRow({ label, children }: PropRowProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '4px 8px',
    fontSize: 11,
    color: 'var(--text-pri)',
    outline: 'none',
    width: '100%',
  };
}

function selectStyle(): React.CSSProperties {
  return {
    ...inputStyle(),
    cursor: 'pointer',
  };
}

function NodeProperties({ node, onUpdate, onDelete }: {
  node: Node<DiagramNodeData>;
  onUpdate: (data: Partial<DiagramNodeData>) => void;
  onDelete: () => void;
}) {
  const d = node.data;

  const handleLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ label: e.target.value });
  }, [onUpdate]);

  const handleFontSizeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ fontSize: Number(e.target.value) });
  }, [onUpdate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PropRow label="Label">
        <input
          style={inputStyle()}
          value={d.label}
          onChange={handleLabelChange}
          placeholder="Node label"
        />
      </PropRow>

      <PropRow label="Colors">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ColorSwatch
            label="Background"
            value={d.bgColor ?? ''}
            onChange={(v) => onUpdate({ bgColor: v })}
          />
          <ColorSwatch
            label="Border"
            value={d.borderColor ?? ''}
            onChange={(v) => onUpdate({ borderColor: v })}
          />
          <ColorSwatch
            label="Text"
            value={d.textColor ?? ''}
            onChange={(v) => onUpdate({ textColor: v })}
          />
        </div>
      </PropRow>

      <PropRow label="Border Style">
        <select
          style={selectStyle()}
          value={d.borderStyle ?? 'solid'}
          onChange={(e) => onUpdate({ borderStyle: e.target.value as BorderStyle })}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
          <option value="none">None</option>
        </select>
      </PropRow>

      <PropRow label={`Font Size: ${d.fontSize ?? 12}px`}>
        <input
          type="range"
          min={10}
          max={24}
          step={1}
          value={d.fontSize ?? 12}
          onChange={handleFontSizeChange}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
      </PropRow>

      <PropRow label="Notes">
        <textarea
          style={{ ...inputStyle(), resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
          value={d.notes ?? ''}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          placeholder="Optional notes…"
        />
      </PropRow>

      <Button
        variant="danger"
        size="sm"
        icon={<Trash2 size={12} />}
        onClick={onDelete}
        fullWidth
      >
        Delete Node
      </Button>
    </div>
  );
}

function EdgeProperties({ edge, onUpdate, onDelete }: {
  edge: Edge<DiagramEdgeData>;
  onUpdate: (data: Partial<DiagramEdgeData>) => void;
  onDelete: () => void;
}) {
  const d = edge.data ?? {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PropRow label="Label">
        <input
          style={inputStyle()}
          value={d.label ?? ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Edge label"
        />
      </PropRow>

      <PropRow label="Colors">
        <ColorSwatch
          label="Stroke"
          value={d.strokeColor ?? ''}
          onChange={(v) => onUpdate({ strokeColor: v })}
        />
      </PropRow>

      <PropRow label="Stroke Style">
        <select
          style={selectStyle()}
          value={d.strokeStyle ?? 'solid'}
          onChange={(e) => onUpdate({ strokeStyle: e.target.value as 'solid' | 'dashed' })}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
        </select>
      </PropRow>

      <Button
        variant="danger"
        size="sm"
        icon={<Trash2 size={12} />}
        onClick={onDelete}
        fullWidth
      >
        Delete Edge
      </Button>
    </div>
  );
}

export function DiagramProperties({
  selectedNode,
  selectedEdge,
  onUpdateNode,
  onUpdateEdge,
  onDeleteNode,
  onDeleteEdge,
}: DiagramPropertiesProps) {
  if (!selectedNode && !selectedEdge) {
    return (
      <div
        style={{
          width: 240,
          flexShrink: 0,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
          Select a node or edge to edit its properties
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-dim)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {selectedNode ? 'Node Properties' : 'Edge Properties'}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {selectedNode && (
          <NodeProperties
            node={selectedNode}
            onUpdate={(data) => onUpdateNode(selectedNode.id, data)}
            onDelete={() => onDeleteNode(selectedNode.id)}
          />
        )}
        {selectedEdge && !selectedNode && (
          <EdgeProperties
            edge={selectedEdge}
            onUpdate={(data) => onUpdateEdge(selectedEdge.id, data)}
            onDelete={() => onDeleteEdge(selectedEdge.id)}
          />
        )}
      </div>
    </div>
  );
}
