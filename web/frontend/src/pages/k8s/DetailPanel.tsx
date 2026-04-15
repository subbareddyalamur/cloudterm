import { useState, useEffect, useMemo, useCallback } from "react";
import type { K8sSelectedResource, K8sPodRef, K8sResourceItem } from "@/types";
import { k8sGetResource } from "@/lib/api";

interface DetailPanelProps {
  clusterId: string | null;
  resource: K8sSelectedResource | null;
  onOpenLogs: (pod: K8sPodRef) => void;
  onOpenExec: (pod: K8sPodRef) => void;
}

export function DetailPanel({
  clusterId,
  resource,
  onOpenLogs,
  onOpenExec,
}: DetailPanelProps) {
  const [data, setData] = useState<K8sResourceItem | null>(null);
  const [format, setFormat] = useState<"yaml" | "json">("yaml");
  const [tab, setTab] = useState<"definition" | "events">("definition");
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!clusterId || !resource) {
      setData(null);
      return;
    }
    setRevealedSecrets({});
    k8sGetResource(resource.resource, resource.name, {
      cluster: clusterId,
      group: resource.group,
      version: resource.version,
      namespace: resource.namespace,
    })
      .then(setData)
      .catch((err) => setData({ error: (err as Error).message } as unknown as K8sResourceItem));
  }, [clusterId, resource]);

  const formatted = useMemo(() => {
    if (!data) return "";
    if ((data as unknown as { error?: string }).error)
      return `Error: ${(data as unknown as { error: string }).error}`;

    let obj: Record<string, unknown> = { ...data };

    // Handle secret reveal
    if (resource?.kind === "Secret" && data.data) {
      const revealed = { ...data.data };
      for (const key of Object.keys(revealed)) {
        if (revealedSecrets[key]) {
          try {
            revealed[key] = atob(revealed[key]);
          } catch {
            /* keep original */
          }
        }
      }
      obj = { ...obj, data: revealed };
    }

    if (format === "json") return JSON.stringify(obj, null, 2);
    return toYaml(obj, 0);
  }, [data, format, revealedSecrets, resource]);

  const toggleSecret = (key: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShowLogs = useCallback(() => {
    if (resource?.kind === "Pod" && onOpenLogs) {
      onOpenLogs({
        namespace: resource.namespace,
        name: resource.name,
        containers: resource.containers || [],
      });
    }
  }, [resource, onOpenLogs]);

  const handleShowExec = useCallback(() => {
    if (resource?.kind === "Pod" && onOpenExec) {
      onOpenExec({
        namespace: resource.namespace,
        name: resource.name,
        containers: resource.containers || [],
      });
    }
  }, [resource, onOpenExec]);

  if (!resource) {
    return (
      <div className="k8s-detail-panel">
        <div className="k8s-detail-empty">Select a resource to view its definition</div>
      </div>
    );
  }

  return (
    <div className="k8s-detail-panel">
      <div className="k8s-detail-header">
        <div className="k8s-detail-title">
          <span className="k8s-detail-kind">{resource.kind}</span>
          <span className="k8s-detail-name">{resource.name}</span>
          {resource.namespace && (
            <span className="k8s-detail-ns">{resource.namespace}</span>
          )}
        </div>
        <div className="k8s-detail-actions">
          <div className="k8s-detail-tabs">
            <button
              className={`k8s-detail-tab ${tab === "definition" ? "active" : ""}`}
              onClick={() => setTab("definition")}
            >
              Definition
            </button>
            <button
              className={`k8s-detail-tab ${tab === "events" ? "active" : ""}`}
              onClick={() => setTab("events")}
            >
              Events
            </button>
          </div>
          {resource.kind === "Pod" && (
            <div className="k8s-pod-action-buttons">
              <button
                className="k8s-pod-action-btn logs"
                onClick={handleShowLogs}
                title="View logs"
              >
                📋 Logs
              </button>
              <button
                className="k8s-pod-action-btn exec"
                onClick={handleShowExec}
                title="Exec into container"
              >
                💻 Exec
              </button>
            </div>
          )}
          <div className="k8s-detail-format-toggle">
            <button
              className={`k8s-fmt-btn ${format === "yaml" ? "active" : ""}`}
              onClick={() => setFormat("yaml")}
            >
              YAML
            </button>
            <button
              className={`k8s-fmt-btn ${format === "json" ? "active" : ""}`}
              onClick={() => setFormat("json")}
            >
              JSON
            </button>
          </div>
          <button className="k8s-copy-btn" onClick={copyToClipboard}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      </div>

      {resource.kind === "Secret" && data?.data && (
        <div className="k8s-secret-bar">
          {Object.keys(data.data).map((key) => (
            <div key={key} className="k8s-secret-entry">
              <span className="k8s-secret-key">{key}</span>
              <button
                className="k8s-secret-eye"
                onClick={() => toggleSecret(key)}
                title={revealedSecrets[key] ? "Hide value" : "Show decoded value"}
              >
                {revealedSecrets[key] ? "🙈" : "👁"}
              </button>
              {revealedSecrets[key] && data.data && (
                <span className="k8s-secret-value">{atob(data.data[key])}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {resource.kind === "Pod" && data && (
        <div className="k8s-pod-status-bar">
          <span
            className={`k8s-pod-phase ${(data.status?.phase || "").toLowerCase()}`}
          >
            {data.status?.phase}
          </span>
          {data.spec?.containers?.map((c) => (
            <span key={c.name} className="k8s-pod-container-badge">
              {c.name}
            </span>
          ))}
        </div>
      )}

      <pre className="k8s-detail-code">
        <code>{formatted}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// YAML serializer
// ---------------------------------------------------------------------------

function toYaml(obj: unknown, indent: number): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") {
    if (obj.includes("\n") || obj.includes(":") || obj.includes("#")) {
      return `"${obj.replace(/"/g, '\\"')}"`;
    }
    return obj;
  }
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);

  const pad = "  ".repeat(indent);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj
      .map((item) => {
        const val = toYaml(item, indent + 1);
        if (typeof item === "object" && item !== null) {
          return `${pad}- ${val.trimStart()}`;
        }
        return `${pad}- ${val}`;
      })
      .join("\n");
  }

  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  return entries
    .map(([key, val]) => {
      if (val === null || val === undefined) return `${pad}${key}: null`;
      if (typeof val === "object") {
        const sub = toYaml(val, indent + 1);
        return `${pad}${key}:\n${sub}`;
      }
      return `${pad}${key}: ${toYaml(val, indent)}`;
    })
    .join("\n");
}
