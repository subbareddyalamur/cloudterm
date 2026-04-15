import { useState, useEffect } from "react";
import type {
  EKSCluster,
  K8sClusterInfo,
  K8sKubeconfigCluster,
  K8sKubeconfigConnectResponse,
} from "@/types";
import {
  k8sAWSAccounts,
  k8sListClusters,
  k8sKubeconfigUpload,
  k8sKubeconfigConnect,
  teleportRequestCredentials,
  teleportStatus,
} from "@/lib/api";

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-south-1",
] as const;

interface TopBarProps {
  clusterId: string | null;
  clusterInfo: K8sClusterInfo | null;
  onConnect: (accountId: string, region: string, cluster: K8sClusterInfo) => void;
  onDisconnect: () => void;
}

export function TopBar({ clusterId, clusterInfo, onConnect, onDisconnect }: TopBarProps) {
  const [mode, setMode] = useState<"aws" | "kubeconfig">("aws");

  // AWS mode state
  const [accounts, setAccounts] = useState<Array<{ id: string; name?: string }>>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [clusters, setClusters] = useState<EKSCluster[]>([]);
  const [loading, setLoading] = useState(false);

  // Kubeconfig mode state
  const [kubeconfigClusters, setKubeconfigClusters] = useState<K8sKubeconfigCluster[]>([]);
  const [selectedKubecluster, setSelectedKubecluster] = useState<K8sKubeconfigCluster | null>(null);

  // Load AWS accounts
  useEffect(() => {
    k8sAWSAccounts().then(setAccounts).catch(() => {});
  }, []);

  // Load AWS clusters when account/region changes
  useEffect(() => {
    if (mode !== "aws" || !selectedAccount || !selectedRegion) {
      setClusters([]);
      return;
    }
    setLoading(true);
    k8sListClusters({ accountId: selectedAccount, region: selectedRegion })
      .then((data) => setClusters(data || []))
      .catch(() => setClusters([]))
      .finally(() => setLoading(false));
  }, [mode, selectedAccount, selectedRegion]);

  const handleKubeconfigUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("kubeconfig", file);

    k8sKubeconfigUpload(formData)
      .then((data) => {
        const clusters = data.clusters || [];
        setKubeconfigClusters(clusters);
        if (clusters.length > 0) setSelectedKubecluster(clusters[0]);
      })
      .catch((err) => alert("Failed to parse kubeconfig: " + (err as Error).message));
  };

  const handleAWSClusterConnect = (cluster: EKSCluster) => {
    onConnect(selectedAccount, selectedRegion, {
      name: cluster.name,
      version: cluster.version,
      endpoint: cluster.endpoint,
    });
  };

  const handleKubeconfigConnect = () => {
    if (!selectedKubecluster) {
      alert("Please select a cluster");
      return;
    }

    const cluster = kubeconfigClusters.find((c) => c.name === selectedKubecluster.name);
    if (!cluster) {
      alert("No cluster info available");
      return;
    }

    const clusterObj: K8sClusterInfo = {
      name: cluster.name,
      version: "1.0",
      endpoint: cluster.server,
    };

    k8sKubeconfigConnect({
      server: cluster.server,
      ca_data: cluster.certificateAuthority,
      cluster_name: cluster.name,
      exec_cmd: cluster.exec_cmd || "",
      exec_args: cluster.exec_args || [],
      is_teleport: cluster.is_teleport || false,
    })
      .then((data: K8sKubeconfigConnectResponse) => {
        if (data.auth_required === "teleport") {
          handleTeleportAuth(data, cluster, clusterObj);
          return;
        }
        if (data.error) {
          let message = data.error;
          if (cluster.is_teleport) {
            message +=
              "\n\nTo connect to Teleport clusters, you need to run:\n" +
              "tsh login --proxy=<your-teleport-proxy>\n\n" +
              "This saves your Teleport session in ~/.tsh which is mounted to the container.";
          }
          alert(message);
          return;
        }
        onConnect("kubeconfig", cluster.name, clusterObj);
      })
      .catch((err) => alert("Connect failed: " + (err as Error).message));
  };

  const handleTeleportAuth = (
    data: K8sKubeconfigConnectResponse,
    cluster: K8sKubeconfigCluster,
    clusterObj: K8sClusterInfo,
  ) => {
    teleportRequestCredentials({
      proxy: data.proxy!,
      auth_type: data.auth_type!,
    })
      .then((creds) => {
        if (creds.error) {
          alert("Teleport Login Failed: " + creds.error);
          return;
        }
        const authWindow = window.open(creds.auth_url, "TeleportSSO", "width=800,height=600");
        if (!authWindow) {
          alert("Popup blocked. Please allow popups for the Teleport login window.");
          return;
        }
        const pollId = setInterval(() => {
          teleportStatus({ callback_id: creds.callback_id })
            .then((st) => {
              if (st.status === "connected") {
                clearInterval(pollId);
                if (!authWindow.closed) authWindow.close();
                k8sKubeconfigConnect({
                  server: cluster.server,
                  ca_data: cluster.certificateAuthority,
                  cluster_name: cluster.name,
                  exec_cmd: cluster.exec_cmd || "",
                  exec_args: cluster.exec_args || [],
                  is_teleport: true,
                  teleport_session_id: creds.callback_id,
                })
                  .then((final) => {
                    if (final.error) {
                      alert(final.error);
                      return;
                    }
                    onConnect("kubeconfig", cluster.name, clusterObj);
                  })
                  .catch((err) => alert("Connect failed: " + (err as Error).message));
              } else if (st.status === "failed") {
                clearInterval(pollId);
                alert("Teleport SSO failed: " + st.error);
              } else if (authWindow.closed && st.status === "pending") {
                clearInterval(pollId);
                alert("Teleport login cancelled (window closed).");
              }
            })
            .catch(() => {});
        }, 2000);
      })
      .catch((err) => alert("Teleport error: " + (err as Error).message));
  };

  return (
    <div className="k8s-topbar">
      <div className="k8s-brand">
        <div className="k8s-brand-icon">
          <svg className="cloud-ico" viewBox="0 0 640 512">
            <path d="M537.6 226.6c4.1-10.7 6.4-22.4 6.4-34.6 0-53-43-96-96-96-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32c-88.4 0-160 71.6-160 160 0 2.7.1 5.4.2 8.1C40.2 219.8 0 273.2 0 336c0 79.5 64.5 144 144 144h368c70.7 0 128-57.3 128-128 0-61.9-44-113.6-102.4-125.4z" />
          </svg>
          <svg className="term-ico" viewBox="0 0 24 24">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <div className="k8s-brand-text">
          <span className="k8s-brand-name">CloudTerm</span>
          <span className="k8s-brand-sub">Manage Kubernetes Clusters</span>
        </div>
      </div>

      <div className="k8s-topbar-center">
        {!clusterId && (
          <div className="k8s-connection-mode-tabs">
            <button
              className={`k8s-mode-tab ${mode === "aws" ? "active" : ""}`}
              onClick={() => setMode("aws")}
            >
              AWS Account
            </button>
            <button
              className={`k8s-mode-tab ${mode === "kubeconfig" ? "active" : ""}`}
              onClick={() => setMode("kubeconfig")}
            >
              Kubeconfig
            </button>
          </div>
        )}

        {mode === "aws" && !clusterId && (
          <>
            <select
              className="k8s-topbar-select"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              disabled={!!clusterId}
            >
              <option value="">
                {accounts.length === 0 ? "No AWS accounts configured" : "Select Account"}
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.id}
                </option>
              ))}
            </select>

            <select
              className="k8s-topbar-select"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              disabled={!selectedAccount || !!clusterId}
            >
              <option value="">Select Region</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {loading && <span className="k8s-topbar-loading">Scanning...</span>}

            {clusters.length > 0 && !clusterId && (
              <div className="k8s-cluster-list">
                {clusters.map((c) => (
                  <button
                    key={c.name}
                    className="k8s-cluster-btn"
                    onClick={() => handleAWSClusterConnect(c)}
                  >
                    <span
                      className={`k8s-cluster-status ${c.status === "ACTIVE" ? "active" : ""}`}
                    />
                    {c.name}
                    <span className="k8s-cluster-version">v{c.version}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {mode === "kubeconfig" && !clusterId && (
          <>
            <label className="k8s-kubeconfig-upload">
              <input type="file" onChange={handleKubeconfigUpload} accept=".yaml,.yml" />
              📄 Choose Kubeconfig
            </label>

            {kubeconfigClusters.length > 0 && (
              <>
                <select
                  className="k8s-topbar-select"
                  value={selectedKubecluster?.name || ""}
                  onChange={(e) => {
                    const c = kubeconfigClusters.find((cl) => cl.name === e.target.value);
                    setSelectedKubecluster(c ?? null);
                  }}
                >
                  <option value="">Select Cluster</option>
                  {kubeconfigClusters.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <button
                  className="k8s-cluster-btn"
                  onClick={handleKubeconfigConnect}
                  disabled={!selectedKubecluster}
                >
                  🔗 Connect
                </button>
              </>
            )}
          </>
        )}

        {clusterId && clusterInfo && (
          <div className="k8s-connected-info">
            <span className="k8s-cluster-status active" />
            <span className="k8s-connected-name">{clusterInfo.name}</span>
            <span className="k8s-cluster-version">v{clusterInfo.version}</span>
            <button className="k8s-disconnect-btn" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      <div className="k8s-topbar-right">
        <span className="k8s-topbar-badge">CloudTerm</span>
      </div>
    </div>
  );
}
