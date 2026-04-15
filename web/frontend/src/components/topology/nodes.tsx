import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AwsIcon, type ResourceType } from "./aws-icons";

// ---------------------------------------------------------------------------
// Shared data shape carried by every custom node
// ---------------------------------------------------------------------------

export interface ResourceNodeData extends Record<string, unknown> {
  resourceType: ResourceType;
  label: string;
  sublabel?: string;
  metadata?: Record<string, string | number | boolean | string[] | undefined>;
  isPublic?: boolean;
  state?: string;
}

export type ResourceNode = Node<ResourceNodeData, "resource">;

// ---------------------------------------------------------------------------
// AZ group node (parent for subnets)
// ---------------------------------------------------------------------------

export interface AZGroupData extends Record<string, unknown> {
  label: string;
}

export type AZGroupNode = Node<AZGroupData, "azGroup">;

export const AZGroupNodeComponent = memo(function AZGroupNodeComponent({
  data,
}: NodeProps<AZGroupNode>) {
  return (
    <div className="rounded-lg border-2 border-dashed border-blue-400/40 bg-blue-50/30 dark:bg-blue-950/20 px-3 pt-1 pb-2 min-w-[200px] min-h-[100px]">
      <div className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">
        {data.label}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Subnet group node (parent for instances/resources inside a subnet)
// ---------------------------------------------------------------------------

export interface SubnetGroupData extends Record<string, unknown> {
  label: string;
  sublabel: string;
  isPublic: boolean;
}

export type SubnetGroupNode = Node<SubnetGroupData, "subnetGroup">;

export const SubnetGroupNodeComponent = memo(function SubnetGroupNodeComponent({
  data,
}: NodeProps<SubnetGroupNode>) {
  const borderColor = data.isPublic
    ? "border-green-500/50"
    : "border-amber-500/50";
  const bgColor = data.isPublic
    ? "bg-green-50/40 dark:bg-green-950/20"
    : "bg-amber-50/40 dark:bg-amber-950/20";
  const badge = data.isPublic ? "Public" : "Private";
  const badgeColor = data.isPublic
    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
    : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";

  return (
    <div
      className={`rounded-md border ${borderColor} ${bgColor} px-2 pt-1 pb-2 min-w-[160px] min-h-[60px]`}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
      <div className="flex items-center gap-1.5 mb-1">
        <AwsIcon type="subnet" size={14} />
        <span className="text-[10px] font-medium truncate max-w-[120px]">
          {data.label}
        </span>
        <span className={`text-[8px] px-1 rounded ${badgeColor}`}>{badge}</span>
      </div>
      <div className="text-[9px] text-muted-foreground">{data.sublabel}</div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2" />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Generic resource node — handles all 16 resource types
// ---------------------------------------------------------------------------

const STATE_COLORS: Record<string, string> = {
  running: "text-green-600",
  available: "text-green-600",
  active: "text-green-600",
  stopped: "text-red-500",
  terminated: "text-red-500",
  pending: "text-yellow-500",
};

export const ResourceNodeComponent = memo(function ResourceNodeComponent({
  data,
  selected,
}: NodeProps<ResourceNode>) {
  const stateClass = data.state ? STATE_COLORS[data.state] ?? "text-muted-foreground" : "";

  return (
    <div
      className={`rounded-md border bg-card px-2.5 py-1.5 shadow-sm min-w-[120px] transition-shadow
        ${selected ? "ring-2 ring-primary shadow-md" : "hover:shadow-md"}`}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
      <div className="flex items-center gap-2">
        <AwsIcon type={data.resourceType} size={20} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate max-w-[140px]">
            {data.label}
          </div>
          {data.sublabel && (
            <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
              {data.sublabel}
            </div>
          )}
          {data.state && (
            <div className={`text-[9px] font-medium ${stateClass}`}>
              {data.state}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2" />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Node type registry for React Flow
// ---------------------------------------------------------------------------

export const nodeTypes = {
  resource: ResourceNodeComponent,
  azGroup: AZGroupNodeComponent,
  subnetGroup: SubnetGroupNodeComponent,
} as const;
