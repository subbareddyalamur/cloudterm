import { useState, useCallback } from "react";
import type { K8sSelectedResource, K8sPodRef, K8sClusterInfo } from "@/types";
import { k8sConnect, k8sDisconnect } from "@/lib/api";
import { TopBar } from "./TopBar";
import { ResourceTree } from "./ResourceTree";
import { DetailPanel } from "./DetailPanel";
import { BottomPanel } from "./BottomPanel";
import "./k8s.css";

type BottomTab = "logs" | "exec";

export default function K8sDashboard() {
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [clusterInfo, setClusterInfo] = useState<K8sClusterInfo | null>(null);
  const [selectedResource, setSelectedResource] =
    useState<K8sSelectedResource | null>(null);
  const [bottomTab, setBottomTab] = useState<BottomTab>("logs");
  const [bottomHeight, setBottomHeight] = useState(250);
  const [selectedPod, setSelectedPod] = useState<K8sPodRef | null>(null);

  const handleConnect = useCallback(
    async (accountId: string, region: string, cluster: K8sClusterInfo) => {
      try {
        const data = await k8sConnect({
          account_id: accountId,
          region,
          cluster: cluster.name,
        });
        setClusterId(data.cluster_id);
        setClusterInfo(cluster);
      } catch (err) {
        alert("Connect failed: " + (err as Error).message);
      }
    },
    [],
  );

  const handleDisconnect = useCallback(async () => {
    if (clusterId) {
      await k8sDisconnect(clusterId);
      setClusterId(null);
      setClusterInfo(null);
      setSelectedResource(null);
      setSelectedPod(null);
    }
  }, [clusterId]);

  const handleSelectResource = useCallback((resource: K8sSelectedResource) => {
    setSelectedResource(resource);
  }, []);

  const handleOpenBottomPanel = useCallback((tab: BottomTab, pod: K8sPodRef) => {
    setSelectedPod(pod);
    setBottomTab(tab);
  }, []);

  return (
    <div className="k8s-app">
      <TopBar
        clusterId={clusterId}
        clusterInfo={clusterInfo}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      <div className="k8s-main-content">
        <ResourceTree clusterId={clusterId} onSelect={handleSelectResource} />
        <div className="k8s-right-panels">
          <DetailPanel
            clusterId={clusterId}
            resource={selectedResource}
            onOpenLogs={(pod) => handleOpenBottomPanel("logs", pod)}
            onOpenExec={(pod) => handleOpenBottomPanel("exec", pod)}
          />
          {selectedPod && (
            <BottomPanel
              clusterId={clusterId}
              pod={selectedPod}
              tab={bottomTab}
              onTabChange={setBottomTab}
              height={bottomHeight}
              onHeightChange={setBottomHeight}
            />
          )}
        </div>
      </div>
    </div>
  );
}
