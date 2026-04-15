import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type ReactFlowInstance,
  type Node,
  type Edge,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Loader2, Network } from "lucide-react";
import { topology as fetchTopologyApi } from "@/lib/api";
import { useTopologyStore } from "@/stores/useTopologyStore";
import { useInstanceStore } from "@/stores/useInstanceStore";
import type { VPCTopology } from "@/types";
import { transformTopology } from "./transform";
import { nodeTypes } from "./nodes";
import { DetailPanel } from "./DetailPanel";
import { SearchBar } from "./SearchBar";
import { ReachabilityAnalyzer } from "./ReachabilityAnalyzer";

// ---------------------------------------------------------------------------
// Selector dropdowns
// ---------------------------------------------------------------------------

function Selectors({
  instances,
  accountId,
  region,
  vpcId,
  onAccount,
  onRegion,
  onVpc,
}: {
  instances: { account_id: string; aws_region: string; vpc_id?: string; account_alias?: string }[];
  accountId: string | null;
  region: string | null;
  vpcId: string | null;
  onAccount: (v: string) => void;
  onRegion: (v: string) => void;
  onVpc: (v: string) => void;
}) {
  // Derive unique values
  const accounts = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of instances) {
      if (!m.has(i.account_id)) m.set(i.account_id, i.account_alias || i.account_id);
    }
    return [...m.entries()].sort(([, a], [, b]) => a.localeCompare(b));
  }, [instances]);

  const regions = useMemo(() => {
    if (!accountId) return [];
    const set = new Set<string>();
    for (const i of instances) {
      if (i.account_id === accountId) set.add(i.aws_region);
    }
    return [...set].sort();
  }, [instances, accountId]);

  const vpcs = useMemo(() => {
    if (!accountId || !region) return [];
    const set = new Set<string>();
    for (const i of instances) {
      if (i.account_id === accountId && i.aws_region === region && i.vpc_id) {
        set.add(i.vpc_id);
      }
    }
    return [...set].sort();
  }, [instances, accountId, region]);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
      <Network className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm font-medium mr-2">VPC Topology</span>

      <select
        value={accountId ?? ""}
        onChange={(e) => onAccount(e.target.value)}
        className="text-xs bg-muted border border-border rounded px-2 py-1"
      >
        <option value="">Select Account</option>
        {accounts.map(([id, alias]) => (
          <option key={id} value={id}>
            {alias}
          </option>
        ))}
      </select>

      <select
        value={region ?? ""}
        onChange={(e) => onRegion(e.target.value)}
        className="text-xs bg-muted border border-border rounded px-2 py-1"
        disabled={!accountId}
      >
        <option value="">Select Region</option>
        {regions.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <select
        value={vpcId ?? ""}
        onChange={(e) => onVpc(e.target.value)}
        className="text-xs bg-muted border border-border rounded px-2 py-1"
        disabled={!region}
      >
        <option value="">Select VPC</option>
        {vpcs.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function TopologyView() {
  const flatInstances = useInstanceStore((s) => s.flatInstances);
  const store = useTopologyStore();
  const {
    selectedAccountId,
    selectedRegion,
    selectedVpcId,
    topologyData,
    loading,
    setSelectedAccount,
    setSelectedRegion,
    setSelectedVpc,
    setTopologyData,
    setLoading,
  } = store;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [overlayEdges, setOverlayEdges] = useState<Edge[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Pick a representative instance for the selected VPC to pass to the API
  const representativeInstanceId = useMemo(() => {
    if (!selectedAccountId || !selectedRegion || !selectedVpcId) return null;
    const inst = flatInstances.find(
      (i) =>
        i.account_id === selectedAccountId &&
        i.aws_region === selectedRegion &&
        i.vpc_id === selectedVpcId,
    );
    return inst?.instance_id ?? null;
  }, [flatInstances, selectedAccountId, selectedRegion, selectedVpcId]);

  // Fetch topology when VPC is selected
  useEffect(() => {
    if (!representativeInstanceId) {
      setTopologyData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTopologyApi(representativeInstanceId)
      .then((data) => {
        if (!cancelled) setTopologyData(data as VPCTopology);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [representativeInstanceId, setTopologyData, setLoading]);

  // Transform topology data into React Flow elements
  useEffect(() => {
    if (!topologyData) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const result = transformTopology(topologyData);

    // Apply highlight styling
    const highlighted = result.nodes.map((n) => {
      if (highlightId && n.id === highlightId) {
        return { ...n, selected: true };
      }
      return n;
    });

    setNodes(highlighted);
    // Merge base edges with overlay edges
    setEdges([...result.edges, ...overlayEdges]);
  }, [topologyData, highlightId, overlayEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setHighlightId(null);
  }, []);

  const handlePathOverlay = useCallback((edges: Edge[]) => {
    setOverlayEdges(edges);
  }, []);

  const handleClearOverlay = useCallback(() => {
    setOverlayEdges([]);
  }, []);

  const handleAccountChange = useCallback(
    (v: string) => {
      setSelectedAccount(v || null);
      setSelectedRegion(null);
      setSelectedVpc(null);
      setTopologyData(null);
    },
    [setSelectedAccount, setSelectedRegion, setSelectedVpc, setTopologyData],
  );

  const handleRegionChange = useCallback(
    (v: string) => {
      setSelectedRegion(v || null);
      setSelectedVpc(null);
      setTopologyData(null);
    },
    [setSelectedRegion, setSelectedVpc, setTopologyData],
  );

  const handleVpcChange = useCallback(
    (v: string) => {
      setSelectedVpc(v || null);
    },
    [setSelectedVpc],
  );

  return (
    <div className="flex flex-col h-full w-full">
      <Selectors
        instances={flatInstances}
        accountId={selectedAccountId}
        region={selectedRegion}
        vpcId={selectedVpcId}
        onAccount={handleAccountChange}
        onRegion={handleRegionChange}
        onVpc={handleVpcChange}
      />

      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-30">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-2 text-sm">Loading topology…</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-30">
            <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-md text-sm max-w-md">
              {error}
            </div>
          </div>
        )}

        {!selectedVpcId && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Network className="w-12 h-12 opacity-30" />
            <p className="text-sm">Select an account, region, and VPC to view topology</p>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={setFlowInstance}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            className="!bg-card !border-border"
          />
        </ReactFlow>

        <SearchBar
          nodes={nodes}
          flowInstance={flowInstance}
          onHighlight={setHighlightId}
        />

        <DetailPanel
          node={selectedNode}
          topology={topologyData}
          onClose={() => setSelectedNode(null)}
        />

        {topologyData && (
          <ReachabilityAnalyzer
            topology={topologyData}
            onPathOverlay={handlePathOverlay}
            onClearOverlay={handleClearOverlay}
          />
        )}
      </div>
    </div>
  );
}
