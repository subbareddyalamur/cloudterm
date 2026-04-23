import { useInternalNode, getSmoothStepPath, Position, type EdgeProps } from '@xyflow/react';

type InternalNode = ReturnType<typeof useInternalNode>;

function getAbsCenter(node: InternalNode): { x: number; y: number; w: number; h: number } {
  if (!node) return { x: 0, y: 0, w: 0, h: 0 };
  const pos = (node as unknown as { internals?: { positionAbsolute?: { x: number; y: number } } })
    .internals?.positionAbsolute ?? { x: 0, y: 0 };
  const w = node.measured?.width ?? 0;
  const h = node.measured?.height ?? 0;
  return { x: pos.x + w / 2, y: pos.y + h / 2, w, h };
}

function getNearestEdgePoint(
  sc: { x: number; y: number; w: number; h: number },
  tc: { x: number; y: number; w: number; h: number },
): { sx: number; sy: number; sourcePos: Position; tx: number; ty: number; targetPos: Position } {
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;

  let sx: number, sy: number, sourcePos: Position;
  if (Math.abs(dx) > Math.abs(dy)) {
    sourcePos = dx > 0 ? Position.Right : Position.Left;
    sx = sc.x + (dx > 0 ? sc.w / 2 : -sc.w / 2);
    sy = sc.y;
  } else {
    sourcePos = dy > 0 ? Position.Bottom : Position.Top;
    sx = sc.x;
    sy = sc.y + (dy > 0 ? sc.h / 2 : -sc.h / 2);
  }

  let tx: number, ty: number, targetPos: Position;
  if (Math.abs(dx) > Math.abs(dy)) {
    targetPos = dx > 0 ? Position.Left : Position.Right;
    tx = tc.x + (dx > 0 ? -tc.w / 2 : tc.w / 2);
    ty = tc.y;
  } else {
    targetPos = dy > 0 ? Position.Top : Position.Bottom;
    tx = tc.x;
    ty = tc.y + (dy > 0 ? -tc.h / 2 : tc.h / 2);
  }

  return { sx, sy, sourcePos, tx, ty, targetPos };
}

export function FloatingEdge({ id, source, target, markerEnd, style, label, labelStyle, labelBgStyle }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const sc = getAbsCenter(sourceNode);
  const tc = getAbsCenter(targetNode);

  if (sc.w === 0 && sc.h === 0 && tc.w === 0 && tc.h === 0) return null;

  const { sx, sy, sourcePos, tx, ty, targetPos } = getNearestEdgePoint(sc, tc);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
    targetX: tx, targetY: ty, targetPosition: targetPos,
    borderRadius: 0,
  });

  return (
    <g>
      <path id={id} className="react-flow__edge-path" d={edgePath} style={style} markerEnd={markerEnd as string} />
      {label && (
        <g transform={`translate(${labelX},${labelY})`}>
          {labelBgStyle && (
            <rect
              x={-24} y={-8} width={48} height={16}
              rx={(labelBgStyle as { rx?: number }).rx ?? 3}
              style={labelBgStyle as React.CSSProperties}
            />
          )}
          <text textAnchor="middle" dominantBaseline="middle" style={labelStyle as React.CSSProperties}>
            {String(label)}
          </text>
        </g>
      )}
    </g>
  );
}

FloatingEdge.displayName = 'FloatingEdge';
