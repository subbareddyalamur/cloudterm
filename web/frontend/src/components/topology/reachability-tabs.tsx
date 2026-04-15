/**
 * Tab sub-components for the Reachability Analyzer panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  Play,
  Shield,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { subscribe } from "@/lib/sse";
import { topologyExposure, topologyConflicts } from "@/lib/api";
import type {
  DeepAnalysisEvent,
  DeepHop,
  ReachabilityHop,
  ExposedPort,
  RuleConflict,
} from "@/types";
import { severityColor, type LocalAnalysisResult } from "./reachability-analysis";

// ---------------------------------------------------------------------------
// Shared hop row renderers
// ---------------------------------------------------------------------------

function HopRow({ hop, index }: { hop: ReachabilityHop; index: number }) {
  const isAllow = hop.status === "allow";
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        <span className="text-[10px] text-muted-foreground w-4 text-center">
          {index + 1}
        </span>
        {isAllow ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-red-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium">{hop.component}</div>
        <div className="text-[10px] text-muted-foreground">{hop.detail}</div>
        {hop.matchedRule && (
          <div className="text-[10px] font-mono text-blue-400 mt-0.5 truncate">
            {hop.matchedRule}
          </div>
        )}
      </div>
    </div>
  );
}

function DeepHopRow({ hop }: { hop: DeepHop }) {
  const isAllow = hop.status === "allow" || hop.status === "pass";
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        <span className="text-[10px] text-muted-foreground w-4 text-center">
          {hop.index + 1}
        </span>
        {isAllow ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-red-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium">
          {hop.componentName || hop.component}
        </div>
        <div className="text-[10px] text-muted-foreground">{hop.detail}</div>
        {hop.resourceId && (
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {hop.resourceId}
          </div>
        )}
        {hop.matchedRule && (
          <div className="text-[10px] font-mono text-blue-400 mt-0.5 truncate">
            {hop.matchedRule}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Local Analysis
// ---------------------------------------------------------------------------

export function LocalTab({ result }: { result: LocalAnalysisResult | null }) {
  const [showReturn, setShowReturn] = useState(false);

  if (!result) {
    return (
      <div className="p-3 text-xs text-muted-foreground text-center">
        Configure source, destination, and click Analyze.
      </div>
    );
  }

  return (
    <div className="p-2">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium mb-2 ${
          result.reachable
            ? "bg-green-500/10 text-green-500"
            : "bg-red-500/10 text-red-500"
        }`}
      >
        {result.reachable ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <XCircle className="w-4 h-4" />
        )}
        {result.reachable ? "Reachable" : "Not Reachable"}
      </div>

      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Forward Path ({result.forwardPath.length} hops)
      </div>
      {result.forwardPath.map((hop, i) => (
        <HopRow key={i} hop={hop} index={i} />
      ))}

      {result.returnPath.length > 0 && (
        <>
          <button
            onClick={() => setShowReturn(!showReturn)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground mt-2 hover:text-foreground transition-colors"
          >
            {showReturn ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Return Path ({result.returnPath.length} hops)
          </button>
          {showReturn &&
            result.returnPath.map((hop, i) => (
              <HopRow key={`ret-${i}`} hop={hop} index={i} />
            ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Deep Analysis (SSE)
// ---------------------------------------------------------------------------

export function DeepTab({
  sourceId,
  destId,
  destIp,
  protocol,
  port,
}: {
  sourceId: string;
  destId: string;
  destIp: string;
  protocol: string;
  port: number;
}) {
  const [hops, setHops] = useState<DeepHop[]>([]);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(() => {
    setHops([]);
    setStatus("Starting analysis…");
    setDone(false);
    setReachable(null);
    setError(null);

    const body = {
      sourceInstanceId: sourceId,
      ...(destId ? { destInstanceId: destId } : {}),
      ...(destIp ? { destIp } : {}),
      protocol,
      port,
    };

    abortRef.current = subscribe<DeepAnalysisEvent>(
      "/topology/deep-analyze",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      {
        onMessage(event) {
          switch (event.type) {
            case "status":
              setStatus(event.message ?? "");
              break;
            case "hop":
              if (event.hop) {
                setHops((prev) => [...prev, event.hop!]);
              }
              break;
            case "result":
              if (event.result) {
                setReachable(event.result.reachable);
                if (event.result.hops.length > 0) {
                  setHops(event.result.hops);
                }
              }
              setDone(true);
              setStatus("");
              break;
            case "error":
              setError(event.message ?? "Unknown error");
              setDone(true);
              setStatus("");
              break;
          }
        },
        onDone() {
          setDone(true);
          setStatus("");
        },
        onError(err) {
          setError(err.message);
          setDone(true);
          setStatus("");
        },
      },
    );
  }, [sourceId, destId, destIp, protocol, port]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  if (!sourceId || (!destId && !destIp)) {
    return (
      <div className="p-3 text-xs text-muted-foreground text-center">
        Select source and destination first.
      </div>
    );
  }

  return (
    <div className="p-2">
      {!status && !done && (
        <button
          onClick={start}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity mb-2"
        >
          <Play className="w-3.5 h-3.5" />
          Run AWS Network Insights
        </button>
      )}

      {status && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {status}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-500 mb-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {reachable !== null && (
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium mb-2 ${
            reachable
              ? "bg-green-500/10 text-green-500"
              : "bg-red-500/10 text-red-500"
          }`}
        >
          {reachable ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {reachable ? "Reachable" : "Not Reachable"}
        </div>
      )}

      {hops.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Network Path ({hops.length} hops)
          </div>
          {hops.map((hop, i) => (
            <DeepHopRow key={i} hop={hop} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Exposure Scan
// ---------------------------------------------------------------------------

export function ExposureTab({ instanceId }: { instanceId: string | null }) {
  const [ports, setPorts] = useState<ExposedPort[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!instanceId) return;
    setLoading(true);
    setError(null);
    topologyExposure(instanceId)
      .then((data) => {
        const result = data as { exposedPorts?: ExposedPort[] };
        setPorts(result.exposedPorts ?? []);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [instanceId]);

  if (!instanceId) {
    return (
      <div className="p-3 text-xs text-muted-foreground text-center">
        Select a VPC to scan for exposure.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Scanning…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-xs text-red-500">
        <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
        {error}
      </div>
    );
  }

  if (ports.length === 0) {
    return (
      <div className="p-3 text-xs text-green-500 text-center">
        <Shield className="w-4 h-4 inline mr-1" />
        No internet-exposed ports detected.
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Exposed Ports ({ports.length})
      </div>
      {ports.map((ep, i) => (
        <div
          key={i}
          className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0"
        >
          <Globe className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium">
                {ep.name || ep.instanceId}
              </span>
              <span
                className={`text-[10px] font-semibold ${severityColor(ep.severity)}`}
              >
                {ep.severity}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {ep.protocol.toUpperCase()}:{ep.port} ← {ep.source}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              SG: {ep.sgId}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Rule Conflicts
// ---------------------------------------------------------------------------

export function ConflictsTab({ instanceId }: { instanceId: string | null }) {
  const [conflicts, setConflicts] = useState<RuleConflict[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!instanceId) return;
    setLoading(true);
    setError(null);
    topologyConflicts(instanceId)
      .then((data) => setConflicts(data as RuleConflict[]))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [instanceId]);

  if (!instanceId) {
    return (
      <div className="p-3 text-xs text-muted-foreground text-center">
        Select a VPC to detect conflicts.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Analyzing rules…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-xs text-red-500">
        <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
        {error}
      </div>
    );
  }

  if (conflicts.length === 0) {
    return (
      <div className="p-3 text-xs text-green-500 text-center">
        <Shield className="w-4 h-4 inline mr-1" />
        No rule conflicts detected.
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Rule Conflicts ({conflicts.length})
      </div>
      {conflicts.map((c, i) => (
        <div
          key={i}
          className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium">
                {c.resourceName || c.resourceId}
              </span>
              <span
                className={`text-[10px] font-semibold ${severityColor(c.severity)}`}
              >
                {c.severity}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {c.description}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              {c.type}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
