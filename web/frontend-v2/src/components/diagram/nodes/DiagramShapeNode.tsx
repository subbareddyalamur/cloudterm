import { useCallback, useRef, useState } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { DiagramNodeData } from '../lib/diagramTypes';

type DiagramShapeNodeProps = NodeProps & { data: DiagramNodeData };

function ShapePath({ shape, w, h, color, borderColor, borderStyle }: {
  shape: string;
  w: number;
  h: number;
  color: string;
  borderColor: string;
  borderStyle: string;
}) {
  const stroke = borderStyle === 'none' ? 'none' : borderColor;
  const strokeDash =
    borderStyle === 'dashed' ? '8,4' :
    borderStyle === 'dotted' ? '2,4' : undefined;
  const strokeProps = { stroke, strokeWidth: 1.5, strokeDasharray: strokeDash };

  if (shape === 'diamond') {
    const cx = w / 2;
    const cy = h / 2;
    return (
      <polygon
        points={`${cx},2 ${w - 2},${cy} ${cx},${h - 2} 2,${cy}`}
        fill={color}
        {...strokeProps}
      />
    );
  }

  if (shape === 'cylinder') {
    const rx = w / 2;
    const ry = 12;
    return (
      <g>
        <ellipse cx={rx} cy={ry} rx={rx - 2} ry={ry - 2} fill={color} {...strokeProps} />
        <rect x={2} y={ry} width={w - 4} height={h - ry * 2} fill={color} stroke="none" />
        <line x1={2} y1={ry} x2={2} y2={h - ry} {...strokeProps} />
        <line x1={w - 2} y1={ry} x2={w - 2} y2={h - ry} {...strokeProps} />
        <ellipse cx={rx} cy={h - ry} rx={rx - 2} ry={ry - 2} fill={color} {...strokeProps} />
      </g>
    );
  }

  if (shape === 'parallelogram') {
    const skew = 16;
    return (
      <polygon
        points={`${skew},2 ${w - 2},2 ${w - skew - 2},${h - 2} 2,${h - 2}`}
        fill={color}
        {...strokeProps}
      />
    );
  }

  if (shape === 'cloud') {
    const cx = w / 2;
    const cy = h / 2;
    // Simplified cloud using circles
    return (
      <g>
        <ellipse cx={cx} cy={cy + 4} rx={cx - 8} ry={cy - 8} fill={color} {...strokeProps} />
        <ellipse cx={cx - 20} cy={cy + 2} rx={14} ry={10} fill={color} stroke="none" />
        <ellipse cx={cx + 20} cy={cy + 2} rx={14} ry={10} fill={color} stroke="none" />
        <ellipse cx={cx} cy={cy - 8} rx={18} ry={12} fill={color} stroke="none" />
        {/* Redraw stroke on top */}
        <ellipse cx={cx} cy={cy + 4} rx={cx - 8} ry={cy - 8} fill="none" {...strokeProps} />
      </g>
    );
  }

  if (shape === 'container') {
    const labelH = 24;
    return (
      <g>
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={6} fill={color} fillOpacity={0.15} {...strokeProps} strokeDasharray="6,3" />
        <rect x={1} y={1} width={w - 2} height={labelH} rx={6} fill={color} fillOpacity={0.3} stroke="none" />
        <rect x={1} y={labelH - 4} width={w - 2} height={4} fill={color} fillOpacity={0.3} stroke="none" />
      </g>
    );
  }

  // rounded
  if (shape === 'rounded') {
    return (
      <rect x={2} y={2} width={w - 4} height={h - 4} rx={8} fill={color} {...strokeProps} />
    );
  }

  // rectangle (default)
  return (
    <rect x={2} y={2} width={w - 4} height={h - 4} fill={color} {...strokeProps} />
  );
}

export function DiagramShapeNode({ data, selected }: DiagramShapeNodeProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const labelRef = useRef<HTMLDivElement>(null);

  const shape = data.shape ?? 'rectangle';
  const bgColor = data.bgColor ?? (shape === 'container' ? 'rgba(124,92,255,0.3)' : '#2a2f45');
  const borderColor = data.borderColor ?? (selected ? 'var(--accent)' : 'var(--border)');
  const borderStyle = data.borderStyle ?? 'solid';
  const fontSize = data.fontSize ?? 12;
  const textColor = data.textColor ?? 'var(--text-pri)';

  const isContainer = shape === 'container';
  const handleCount = isContainer ? 0 : 1;
  void handleCount;

  const startEditing = useCallback(() => {
    setEditing(true);
    setTimeout(() => {
      labelRef.current?.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      if (labelRef.current && sel) {
        range.selectNodeContents(labelRef.current);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 10);
  }, []);

  const stopEditing = useCallback(() => {
    setEditing(false);
    const text = labelRef.current?.innerText ?? label;
    setLabel(text);
    data.label = text;
  }, [label, data]);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', userSelect: editing ? 'text' : 'none' }}
      onDoubleClick={startEditing}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={60}
        minHeight={40}
        handleStyle={{ width: 8, height: 8, background: 'var(--accent)', border: '1px solid var(--bg)', borderRadius: 2 }}
        lineStyle={{ borderColor: 'var(--accent)', borderWidth: 1 }}
      />

      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
        viewBox={`0 0 100 100`}
        preserveAspectRatio="none"
      >
        <ShapePath
          shape={shape}
          w={100}
          h={100}
          color={bgColor}
          borderColor={borderColor}
          borderStyle={borderStyle}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          inset: isContainer ? '24px 8px 8px 8px' : '0 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: editing ? 'auto' : 'none',
        }}
      >
        <div
          ref={labelRef}
          contentEditable={editing}
          suppressContentEditableWarning
          onBlur={stopEditing}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); stopEditing(); } if (e.key === 'Escape') { setEditing(false); } }}
          style={{
            fontSize,
            color: textColor,
            textAlign: 'center',
            fontWeight: 500,
            outline: 'none',
            wordBreak: 'break-word',
            minWidth: 20,
            cursor: editing ? 'text' : 'default',
          }}
        >
          {label}
        </div>
      </div>

      {/* Handles */}
      <Handle type="source" position={Position.Top} id="top" style={{ top: isContainer ? -6 : '0%', background: 'var(--accent)', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ bottom: isContainer ? -6 : '0%', background: 'var(--accent)', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Left} id="left" style={{ left: isContainer ? -6 : '0%', background: 'var(--accent)', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ right: isContainer ? -6 : '0%', background: 'var(--accent)', width: 8, height: 8 }} />
      <Handle type="target" position={Position.Top} id="top-t" style={{ top: isContainer ? -6 : '0%', background: 'var(--accent)', width: 8, height: 8, opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} id="bottom-t" style={{ bottom: isContainer ? -6 : '0%', background: 'var(--accent)', width: 8, height: 8, opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="left-t" style={{ left: isContainer ? -6 : '0%', background: 'var(--accent)', width: 8, height: 8, opacity: 0 }} />
      <Handle type="target" position={Position.Right} id="right-t" style={{ right: isContainer ? -6 : '0%', background: 'var(--accent)', width: 8, height: 8, opacity: 0 }} />
    </div>
  );
}
