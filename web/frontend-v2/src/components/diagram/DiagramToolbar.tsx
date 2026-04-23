import { useRef } from 'react';
import { Undo2, Redo2, Trash2, Grid3x3, Download, Upload, Save, GitBranch } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { BackgroundVariant } from '@xyflow/react';
import type { EdgeStyleType } from './lib/diagramTypes';

interface DiagramToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  snapToGrid: boolean;
  onToggleSnap: () => void;
  bgVariant: BackgroundVariant;
  onBgVariant: (v: BackgroundVariant) => void;
  edgeType: EdgeStyleType;
  onEdgeType: (t: EdgeStyleType) => void;
  onExportPng: () => void;
  onExportDiagram: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
}

const BG_OPTIONS: { value: BackgroundVariant; label: string }[] = [
  { value: BackgroundVariant.Dots, label: 'Dots' },
  { value: BackgroundVariant.Lines, label: 'Grid' },
  { value: BackgroundVariant.Cross, label: 'Cross' },
];

const EDGE_OPTIONS: { value: EdgeStyleType; label: string }[] = [
  { value: 'bezier', label: 'Bezier' },
  { value: 'straight', label: 'Straight' },
  { value: 'smoothstep', label: 'Smooth Step' },
  { value: 'step', label: 'Step' },
];

function Divider() {
  return <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />;
}

export function DiagramToolbar({
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  snapToGrid,
  onToggleSnap,
  bgVariant,
  onBgVariant,
  edgeType,
  onEdgeType,
  onExportPng,
  onExportDiagram,
  onImport,
  onSave,
}: DiagramToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 4,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      {/* Undo / Redo */}
      <Button
        variant="ghost"
        size="sm"
        icon={<Undo2 size={13} />}
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Cmd+Z)"
        aria-label="Undo"
      />
      <Button
        variant="ghost"
        size="sm"
        icon={<Redo2 size={13} />}
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Cmd+Shift+Z)"
        aria-label="Redo"
      />

      <Divider />

      {/* Clear */}
      <Button
        variant="ghost"
        size="sm"
        icon={<Trash2 size={13} />}
        onClick={onClear}
        title="Clear canvas"
        aria-label="Clear canvas"
        className="text-danger hover:text-danger"
      >
        Clear
      </Button>

      <Divider />

      {/* Snap to grid */}
      <button
        type="button"
        onClick={onToggleSnap}
        title="Toggle grid snap"
        aria-pressed={snapToGrid}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          height: 26,
          borderRadius: 5,
          border: `1px solid ${snapToGrid ? 'var(--accent)' : 'var(--border)'}`,
          background: snapToGrid ? 'var(--accent-dim)' : 'transparent',
          color: snapToGrid ? 'var(--accent)' : 'var(--text-dim)',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 500,
          gap: 4,
        } as React.CSSProperties}
      >
        <Grid3x3 size={12} />
        Snap
      </button>

      <Divider />

      {/* Background variant */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>BG</span>
        <select
          value={bgVariant}
          onChange={(e) => onBgVariant(e.target.value as BackgroundVariant)}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '2px 4px',
            fontSize: 11,
            color: 'var(--text-pri)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {BG_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <Divider />

      {/* Edge type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <GitBranch size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        <select
          value={edgeType}
          onChange={(e) => onEdgeType(e.target.value as EdgeStyleType)}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '2px 4px',
            fontSize: 11,
            color: 'var(--text-pri)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {EDGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <Divider />

      {/* Export / Import / Save */}
      <Button variant="ghost" size="sm" icon={<Download size={12} />} onClick={onExportDiagram} title="Export .ctdiagram">
        Export
      </Button>
      <Button variant="ghost" size="sm" icon={<Download size={12} />} onClick={onExportPng} title="Export as PNG (print)">
        PNG
      </Button>
      <Button variant="ghost" size="sm" icon={<Upload size={12} />} onClick={() => importInputRef.current?.click()} title="Import .ctdiagram">
        Import
      </Button>
      <Button variant="ghost" size="sm" icon={<Save size={12} />} onClick={onSave} title="Save to browser">
        Save
      </Button>

      <input
        ref={importInputRef}
        type="file"
        accept=".ctdiagram,.json"
        style={{ display: 'none' }}
        onChange={onImport}
      />
    </div>
  );
}
