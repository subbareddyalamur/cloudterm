import type { Node, Edge } from '@xyflow/react';

export type DiagramShape =
  | 'rectangle'
  | 'rounded'
  | 'diamond'
  | 'cylinder'
  | 'parallelogram'
  | 'cloud'
  | 'container';

export type IconType = 'aws' | 'gcp' | 'azure' | 'generic';

export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'none';

export type EdgeStyleType = 'bezier' | 'straight' | 'smoothstep' | 'step';

export interface DiagramNodeData extends Record<string, unknown> {
  label: string;
  shape?: DiagramShape;
  iconType?: IconType;
  service?: string;
  category?: string;
  bgColor?: string;
  borderColor?: string;
  borderStyle?: BorderStyle;
  fontSize?: number;
  textColor?: string;
  notes?: string;
}

export interface DiagramEdgeData extends Record<string, unknown> {
  label?: string;
  strokeColor?: string;
  strokeStyle?: 'solid' | 'dashed';
}

export interface DiagramHistoryEntry {
  nodes: Node<DiagramNodeData>[];
  edges: Edge<DiagramEdgeData>[];
}

export interface DiagramFileData {
  version: number;
  type: 'ctdiagram';
  nodes: Node<DiagramNodeData>[];
  edges: Edge<DiagramEdgeData>[];
  viewport: { x: number; y: number; zoom: number };
  createdAt: string;
}

export interface PaletteItem {
  id: string;
  label: string;
  abbr?: string;
  iconType?: IconType;
  shape?: DiagramShape;
  service?: string;
  category?: string;
  color?: string;
  width?: number;
  height?: number;
}

export interface PaletteCategory {
  id: string;
  label: string;
  items: PaletteItem[];
}
