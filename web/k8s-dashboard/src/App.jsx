import React, { useState, useCallback } from 'react'
import TopBar from './TopBar.jsx'
import ResourceTree from './ResourceTree.jsx'
import DetailPanel from './DetailPanel.jsx'
import BottomPanel from './BottomPanel.jsx'
import { useApi } from './useApi.js'

export default function App() {
  const [clusterId, setClusterId] = useState(null)
  const [clusterInfo, setClusterInfo] = useState(null)
  const [selectedResource, setSelectedResource] = useState(null)
  const [bottomTab, setBottomTab] = useState('logs') // 'logs' | 'exec'
  const [bottomHeight, setBottomHeight] = useState(250)
  const [selectedPod, setSelectedPod] = useState(null)
  const api = useApi()

  const handleConnect = useCallback(async (accountId, region, cluster) => {
    try {
      const res = await api.post('/api/k8s/connect', {
        account_id: accountId, region, cluster: cluster.name
      })
      const data = await res.json()
      setClusterId(data.cluster_id)
      setClusterInfo(cluster)
    } catch (err) {
      alert('Connect failed: ' + err.message)
    }
  }, [api])

  const handleDisconnect = useCallback(async () => {
    if (clusterId) {
      await api.post('/api/k8s/disconnect/' + clusterId)
      setClusterId(null)
      setClusterInfo(null)
      setSelectedResource(null)
      setSelectedPod(null)
    }
  }, [clusterId, api])

  const handleSelectResource = useCallback((resource) => {
    setSelectedResource(resource)
    // Don't auto-open bottom panel - user must click Logs/Exec
  }, [])

  const handleOpenBottomPanel = useCallback((tab, pod) => {
    setSelectedPod(pod)
    setBottomTab(tab)
  }, [])

  return (
    <div className="app">
      <TopBar
        clusterId={clusterId}
        clusterInfo={clusterInfo}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      <div className="main-content">
        <ResourceTree
          clusterId={clusterId}
          onSelect={handleSelectResource}
        />
        <div className="right-panels">
          <DetailPanel
            clusterId={clusterId}
            resource={selectedResource}
            onOpenLogs={(pod) => handleOpenBottomPanel('logs', pod)}
            onOpenExec={(pod) => handleOpenBottomPanel('exec', pod)}
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
  )
}
