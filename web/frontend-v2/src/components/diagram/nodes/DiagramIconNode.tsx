import { useCallback, useRef, useState } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { DiagramNodeData } from '../lib/diagramTypes';
import { AWS_COLORS } from '../lib/icons';

type DiagramIconNodeProps = NodeProps & { data: DiagramNodeData };

function ServiceIcon({ service, category, iconType, color }: {
  service: string;
  category?: string;
  iconType?: string;
  color: string;
}) {
  // Simple geometric icons per service type
  const s = service.toLowerCase();

  if (s.includes('lambda') || s.includes('function')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" width={20} height={20}>
        <path d="M3 20l5-8-5-8" />
        <path d="M21 4l-5 8 5 8" />
        <path d="M9 12h6" />
      </svg>
    );
  }

  if (s.includes('ec2') || s.includes('vm') || s.includes('compute engine') || s.includes('virtual machine')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <rect x={3} y={5} width={18} height={14} rx={2} />
        <path d="M7 9h10M7 12h10M7 15h6" />
      </svg>
    );
  }

  if (s.includes('s3') || s.includes('storage') || s.includes('blob') || s.includes('gcs')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <ellipse cx={12} cy={7} rx={9} ry={3} />
        <path d="M3 7v10c0 1.66 4.03 3 9 3s9-1.34 9-3V7" />
        <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
      </svg>
    );
  }

  if (s.includes('rds') || s.includes('database') || s.includes('aurora') || s.includes('sql') || s.includes('dynamo') || s.includes('cosmos') || s.includes('mongodb')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <ellipse cx={12} cy={6} rx={8} ry={3} />
        <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
        <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      </svg>
    );
  }

  if (s.includes('vpc') || s.includes('vnet') || s.includes('network')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <rect x={2} y={2} width={20} height={20} rx={4} strokeDasharray="4 2" />
        <circle cx={12} cy={12} r={3} />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </svg>
    );
  }

  if (s.includes('alb') || s.includes('nlb') || s.includes('load balanc') || s.includes('elb')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <circle cx={12} cy={5} r={2} />
        <circle cx={5} cy={19} r={2} />
        <circle cx={19} cy={19} r={2} />
        <path d="M12 7v4M12 11l-5 6M12 11l5 6" />
      </svg>
    );
  }

  if (s.includes('iam') || s.includes('identity') || s.includes('cognito') || s.includes('azure ad')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <circle cx={12} cy={8} r={4} />
        <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" />
        <path d="M15 3l2 2-2 2" />
      </svg>
    );
  }

  if (s.includes('eks') || s.includes('aks') || s.includes('gke') || s.includes('container') || s.includes('ecs') || s.includes('fargate')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <path d="M12 22v-9M3.27 6.96L12 12.01l8.73-5.05" />
      </svg>
    );
  }

  if (s.includes('cloudwatch') || s.includes('monitor') || s.includes('logging')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    );
  }

  if (s.includes('cloudfront') || s.includes('cdn') || s.includes('route') || s.includes('dns')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <circle cx={12} cy={12} r={10} />
        <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    );
  }

  if (s.includes('kms') || s.includes('key vault') || s.includes('secret') || s.includes('waf') || s.includes('shield') || s.includes('security')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }

  if (s.includes('sagemaker') || s.includes('bedrock') || s.includes('vertex') || s.includes('automl') || s.includes('rekognition') || s.includes('ai')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    );
  }

  if (s.includes('kinesis') || s.includes('stream') || s.includes('queue') || s.includes('sqs') || s.includes('sns')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <path d="M5 12h14M12 5l7 7-7 7" />
        <path d="M5 5v14" strokeDasharray="3 2" />
      </svg>
    );
  }

  if (s.includes('codepipeline') || s.includes('codebuild') || s.includes('pipeline') || s.includes('ci/cd')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <circle cx={6} cy={12} r={3} />
        <circle cx={18} cy={12} r={3} />
        <path d="M9 12h6" />
      </svg>
    );
  }

  // Cloud provider logos (abstract)
  if (iconType === 'gcp') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} width={20} height={20}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" strokeLinecap="round" />
        <path d="M8 12h8M12 8v8" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconType === 'azure') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} width={20} height={20}>
        <path d="M5 19h14M5 5l7 9 7-9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // Generic fallback based on category
  if (category === 'Compute') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
        <rect x={2} y={3} width={20} height={14} rx={2} />
        <path d="M8 21h8M12 17v4" />
      </svg>
    );
  }

  // Default: circuit/service icon
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" width={20} height={20}>
      <circle cx={12} cy={12} r={8} />
      <path d="M12 8v4l3 3" />
    </svg>
  );
}

function getIconColor(data: DiagramNodeData): string {
  if (data.bgColor) return data.bgColor;
  if (data.color) return data.color as string;

  if (data.iconType === 'aws') {
    return AWS_COLORS[data.category ?? ''] ?? '#ED7100';
  }

  if (data.iconType === 'gcp') {
    const gcpMap: Record<string, string> = { Compute: '#1A73E8', Network: '#1A73E8', Storage: '#34A853', Database: '#FBBC04', ML: '#EA4335', Management: '#1A73E8' };
    return gcpMap[data.category ?? ''] ?? '#1A73E8';
  }

  if (data.iconType === 'azure') return '#0078D4';

  return '#6B7280';
}

export function DiagramIconNode({ data, selected }: DiagramIconNodeProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(data.label);
  const labelRef = useRef<HTMLDivElement>(null);
  const color = getIconColor(data);
  const abbr = data.service ?? data.label;
  const shortAbbr = abbr.length > 6 ? abbr.substring(0, 4) : abbr;

  const borderColor = data.borderColor ?? (selected ? 'var(--accent)' : 'transparent');
  const borderStyle = data.borderStyle ?? 'solid';

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
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'default', userSelect: 'none' }}
      onDoubleClick={startEditing}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={60}
        minHeight={80}
        handleStyle={{ width: 6, height: 6, background: 'var(--accent)', border: '1px solid var(--bg)', borderRadius: 2 }}
        lineStyle={{ borderColor: 'var(--accent)', borderWidth: 1 }}
      />

      {/* Icon box */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 10,
          background: color,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          border: `2px ${borderStyle === 'none' ? 'none' : borderStyle} ${selected ? 'var(--accent)' : borderColor}`,
          boxShadow: selected ? `0 0 0 2px var(--accent-dim)` : '0 2px 8px rgba(0,0,0,0.3)',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <ServiceIcon
          service={data.service ?? ''}
          category={data.category}
          iconType={data.iconType}
          color={color}
        />
        <span style={{ fontSize: 9, color: 'white', fontWeight: 700, letterSpacing: 0.5, textAlign: 'center', lineHeight: 1 }}>
          {shortAbbr}
        </span>

        {/* Handles on icon box */}
        <Handle type="source" position={Position.Top} id="top" style={{ top: -5, background: 'var(--accent)', width: 8, height: 8, opacity: selected ? 1 : 0, transition: 'opacity 0.15s' }} />
        <Handle type="source" position={Position.Bottom} id="bottom" style={{ bottom: -5, background: 'var(--accent)', width: 8, height: 8, opacity: selected ? 1 : 0, transition: 'opacity 0.15s' }} />
        <Handle type="source" position={Position.Left} id="left" style={{ left: -5, background: 'var(--accent)', width: 8, height: 8, opacity: selected ? 1 : 0, transition: 'opacity 0.15s' }} />
        <Handle type="source" position={Position.Right} id="right" style={{ right: -5, background: 'var(--accent)', width: 8, height: 8, opacity: selected ? 1 : 0, transition: 'opacity 0.15s' }} />
        <Handle type="target" position={Position.Top} id="top-t" style={{ top: -5, background: 'var(--accent)', width: 8, height: 8, opacity: 0 }} />
        <Handle type="target" position={Position.Bottom} id="bottom-t" style={{ bottom: -5, background: 'var(--accent)', width: 8, height: 8, opacity: 0 }} />
        <Handle type="target" position={Position.Left} id="left-t" style={{ left: -5, background: 'var(--accent)', width: 8, height: 8, opacity: 0 }} />
        <Handle type="target" position={Position.Right} id="right-t" style={{ right: -5, background: 'var(--accent)', width: 8, height: 8, opacity: 0 }} />
      </div>

      {/* Label below */}
      <div
        ref={labelRef}
        contentEditable={editing}
        suppressContentEditableWarning
        onBlur={stopEditing}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); stopEditing(); } if (e.key === 'Escape') { setEditing(false); } }}
        style={{
          fontSize: data.fontSize ?? 11,
          color: data.textColor ?? 'var(--text-pri)',
          textAlign: 'center',
          fontWeight: 500,
          outline: 'none',
          cursor: editing ? 'text' : 'default',
          maxWidth: 80,
          wordBreak: 'break-word',
          padding: '0 2px',
          pointerEvents: editing ? 'auto' : 'none',
        }}
      >
        {label}
      </div>
    </div>
  );
}
