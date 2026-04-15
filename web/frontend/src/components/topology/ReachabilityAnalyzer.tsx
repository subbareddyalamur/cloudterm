import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Globe,
  Shield,
  ShieldAlert,
  X,
} from "lucide-react";
import type { Edge } from "@xyflow/react";
import { useTopologyStore } from "@/stores/useTopologyStore";
import type { VPCTopology, TopologyInstance } from "@/types";
import {
  analyzeLocal,
  type LocalAnalysisResult,
  type Protocol,
} from "./reachability-analysis";
import { LocalTab, DeepTab, ExposureTab, ConflictsTab } from "./reachability-tabs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "local" | "deep" | "exposure" | "conflicts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReachabilityAnalyzerProps {
  topology: VPCTopology;
  /** Called to overlay animated edges on the topology graph. */
  onPathOverlay: (edges: Edge[]) => void;
  /** Called to clear overlay edges. */
  onClearOverlay: () => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReachabilityAnalyzer({
  topology,
  onPathOverlay,
  onClearOverlay,
}: ReachabilityAnalyzerProps) {
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [destIp, setDestIp] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("tcp");
  const [port, setPort] = useState(443);
  const [activeTab, setActiveTab] = useState<TabId>("local");
  const [localResult, setLocalResult] = useState<LocalAnalysisResult | null>(null);

  const store = useTopologyStore();
  const representativeInstanceId = useMemo(() => {
    if (!topology) return null;
    return topology.instances[0]?.id ?? null;
  }, [topology]);

  const instances = topology.instances;

  // Build path overlay edges when local result is available
  useEffect(() => {
    if (!localResult || !topology) {
      onClearOverlay();
      return;
    }

    const overlayEdges: Edge[] = [];
    const srcInst = instances.find((i) => i.id === sourceId);
    const dstInst = instances.find((i) => i.id === destId);
    if (!srcInst) return;

    const srcNodeId = `inst-${srcInst.id}`;
    const srcSubnetNodeId = `subnet-${srcInst.subnetId}`;
    const color = localResult.reachable ? "#22c55e" : "#ef4444";

    overlayEdges.push({
      id: "overlay-src-subnet",
      source: srcNodeId,
      target: srcSubnetNodeId,
      type: "smoothstep",
      animated: true,
      style: { stroke: color, strokeWidth: 2.5 },
    });

    if (dstInst) {
      const dstNodeId = `inst-${dstInst.id}`;
      const dstSubnetNodeId = `subnet-${dstInst.subnetId}`;

      if (srcInst.subnetId !== dstInst.subnetId) {
        overlayEdges.push({
          id: "overlay-subnet-subnet",
          source: srcSubnetNodeId,
          target: dstSubnetNodeId,
          type: "smoothstep",
          animated: true,
          style: { stroke: color, strokeWidth: 2.5 },
        });
      }

      overlayEdges.push({
        id: "overlay-subnet-dst",
        source: dstSubnetNodeId,
        target: dstNodeId,
        type: "smoothstep",
        animated: true,
        style: { stroke: color, strokeWidth: 2.5 },
      });
    }

    onPathOverlay(overlayEdges);
  }, [localResult, topology, instances, sourceId, destId, onPathOverlay, onClearOverlay]);

  const handleAnalyze = useCallback(() => {
    const srcInst = instances.find((i: TopologyInstance) => i.id === sourceId);
    if (!srcInst) return;

    const dstInst = instances.find((i: TopologyInstance) => i.id === destId);
    const targetIp = dstInst?.privateIp ?? destIp;
    if (!targetIp) return;

    const result = analyzeLocal(topology, srcInst, targetIp, dstInst, protocol, port);
    setLocalResult(result);
    store.setReachability({
      source: {
        instanceId: srcInst.id,
        ip: srcInst.privateIp,
        subnetId: srcInst.subnetId,
        vpcId: topology.vpc.id,
      },
      destination: {
        instanceId: dstInst?.id,
        ip: targetIp,
        subnetId: dstInst?.subnetId,
        vpcId: topology.vpc.id,
      },
      protocol,
      port,
      reachable: result.reachable,
      hops: result.forwardPath,
      returnPath: result.returnPath,
      issues: result.forwardPath
        .filter((h) => h.status === "deny")
        .map((h) => `${h.component}: ${h.detail}`),
    });
    setActiveTab("local");
  }, [instances, sourceId, destId, destIp, protocol, port, topology, store]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setLocalResult(null);
    onClearOverlay();
  }, [onClearOverlay]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "local", label: "Local", icon: <Shield className="w-3 h-3" /> },
    { id: "deep", label: "Deep", icon: <Activity className="w-3 h-3" /> },
    { id: "exposure", label: "Exposure", icon: <Globe className="w-3 h-3" /> },
    { id: "conflicts", label: "Conflicts", icon: <ShieldAlert className="w-3 h-3" /> },
  ];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-4 left-4 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border shadow-md text-xs font-medium hover:bg-muted transition-colors"
      >
        <Activity className="w-3.5 h-3.5" />
        Reachability
      </button>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 z-40 w-96 max-h-[70vh] bg-card border border-border rounded-tr-lg shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">Reachability Analyzer</span>
        </div>
        <button
          onClick={handleClose}
          className="p-0.5 rounded hover:bg-muted transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Source / Destination form */}
      <div className="px-3 py-2 border-b border-border space-y-2 shrink-0">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Source Instance
          </label>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="w-full text-xs bg-muted border border-border rounded px-2 py-1 mt-0.5"
          >
            <option value="">Select instance…</option>
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name || inst.id} ({inst.privateIp})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Destination
          </label>
          <div className="flex gap-1 mt-0.5">
            <select
              value={destId}
              onChange={(e) => {
                setDestId(e.target.value);
                if (e.target.value) setDestIp("");
              }}
              className="flex-1 text-xs bg-muted border border-border rounded px-2 py-1"
            >
              <option value="">Instance or enter IP →</option>
              {instances
                .filter((i) => i.id !== sourceId)
                .map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name || inst.id} ({inst.privateIp})
                  </option>
                ))}
            </select>
            <input
              type="text"
              placeholder="or IP"
              value={destIp}
              onChange={(e) => {
                setDestIp(e.target.value);
                if (e.target.value) setDestId("");
              }}
              className="w-28 text-xs bg-muted border border-border rounded px-2 py-1"
            />
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Protocol
            </label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as Protocol)}
              className="w-20 text-xs bg-muted border border-border rounded px-2 py-1 mt-0.5 block"
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
              <option value="icmp">ICMP</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Port
            </label>
            <input
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value, 10) || 0)}
              className="w-20 text-xs bg-muted border border-border rounded px-2 py-1 mt-0.5 block"
              disabled={protocol === "icmp"}
            />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={!sourceId || (!destId && !destIp)}
            className="flex items-center gap-1 px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Analyze
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "local" && <LocalTab result={localResult} />}
        {activeTab === "deep" && (
          <DeepTab
            sourceId={sourceId}
            destId={destId}
            destIp={destIp}
            protocol={protocol}
            port={port}
          />
        )}
        {activeTab === "exposure" && (
          <ExposureTab instanceId={representativeInstanceId} />
        )}
        {activeTab === "conflicts" && (
          <ConflictsTab instanceId={representativeInstanceId} />
        )}
      </div>
    </div>
  );
}
