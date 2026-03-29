import React, { useState, useEffect } from 'react'
import { useApi } from './useApi.js'

const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-south-1'
]

export default function TopBar({ clusterId, clusterInfo, onConnect, onDisconnect }) {
  const [mode, setMode] = useState('aws') // 'aws' or 'kubeconfig'
  
  // AWS mode state
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [clusters, setClusters] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Kubeconfig mode state
  const [kubeconfigClusters, setKubeconfigClusters] = useState([])
  const [selectedKubecluster, setSelectedKubecluster] = useState(null)
  const [kubeconfigData, setKubeconfigData] = useState(null)
  
  const api = useApi()

  // Load AWS accounts
  useEffect(() => {
    api.get('/aws-accounts').then(r => r.json()).then(setAccounts).catch(() => {})
  }, [])

  // Load AWS clusters when account/region changes
  useEffect(() => {
    if (mode !== 'aws' || !selectedAccount || !selectedRegion) { setClusters([]); return }
    setLoading(true)
    api.get('/api/k8s/clusters', { accountId: selectedAccount, region: selectedRegion })
      .then(r => r.json())
      .then(data => setClusters(data || []))
      .catch(() => setClusters([]))
      .finally(() => setLoading(false))
  }, [mode, selectedAccount, selectedRegion])

  const handleKubeconfigUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('kubeconfig', file)

    fetch('/api/k8s/kubeconfig/upload', {
      method: 'POST',
      body: formData
    })
      .then(r => r.json())
      .then(data => {
        setKubeconfigData(data)
        setKubeconfigClusters(data.clusters || [])
        if (data.clusters?.length > 0) {
          setSelectedKubecluster(data.clusters[0])
        }
      })
      .catch(err => alert('Failed to parse kubeconfig: ' + err.message))
  }

  const handleAWSClusterConnect = (cluster) => {
    onConnect(selectedAccount, selectedRegion, cluster)
  }

  const handleKubeconfigConnect = () => {
    if (!selectedKubecluster) {
      alert('Please select a cluster')
      return
    }

    // Get exec info from the selected cluster
    const cluster = kubeconfigClusters.find(c => c.name === selectedKubecluster.name)
    if (!cluster || !cluster.exec_cmd) {
      alert('No exec command found in kubeconfig for this cluster')
      return
    }

    // Create a fake cluster object
    const clusterObj = {
      name: cluster.name,
      version: '1.0',
      endpoint: cluster.server
    }
    
    // Connect via kubeconfig API - will execute tsh automatically
    fetch('/api/k8s/kubeconfig/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server: cluster.server,
        ca_data: cluster.certificateAuthority,
        cluster_name: cluster.name,
        exec_cmd: cluster.exec_cmd,
        exec_args: cluster.exec_args || []
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          alert('Connect failed: ' + data.error)
          return
        }
        // Simulate cluster connection
        onConnect('kubeconfig', cluster.name, clusterObj)
      })
      .catch(err => alert('Connect failed: ' + err.message))
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        <svg className="topbar-logo" viewBox="0 0 32 32" width="22" height="22">
          <path fill="#326ce5" d="M16 2l12.66 7.34v14.64L16 31.32 3.34 23.98V9.34z"/>
          <path fill="#fff" d="M16 7.5l-7 4.04v8.08l7 4.04 7-4.04v-8.08z" opacity=".3"/>
          <circle cx="16" cy="16" r="3" fill="#fff"/>
        </svg>
        <span className="topbar-title">K8s Visualizer</span>
      </div>

      <div className="topbar-center">
        {!clusterId && (
          <div className="connection-mode-tabs">
            <button 
              className={`mode-tab ${mode === 'aws' ? 'active' : ''}`}
              onClick={() => setMode('aws')}
            >
              AWS Account
            </button>
            <button 
              className={`mode-tab ${mode === 'kubeconfig' ? 'active' : ''}`}
              onClick={() => setMode('kubeconfig')}
            >
              Kubeconfig
            </button>
          </div>
        )}

        {mode === 'aws' && !clusterId && (
          <>
            <select
              className="topbar-select"
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              disabled={!!clusterId}
            >
              <option value="">
                {accounts.length === 0 ? 'No AWS accounts configured' : 'Select Account'}
              </option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name || a.id}</option>
              ))}
            </select>

            <select
              className="topbar-select"
              value={selectedRegion}
              onChange={e => setSelectedRegion(e.target.value)}
              disabled={!selectedAccount || !!clusterId}
            >
              <option value="">Select Region</option>
              {REGIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            {loading && <span className="topbar-loading">Scanning...</span>}

            {clusters.length > 0 && !clusterId && (
              <div className="cluster-list">
                {clusters.map(c => (
                  <button
                    key={c.name}
                    className="cluster-btn"
                    onClick={() => handleAWSClusterConnect(c)}
                  >
                    <span className={`cluster-status ${c.status === 'ACTIVE' ? 'active' : ''}`} />
                    {c.name}
                    <span className="cluster-version">v{c.version}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {mode === 'kubeconfig' && !clusterId && (
          <>
            <label className="kubeconfig-upload">
              <input type="file" onChange={handleKubeconfigUpload} accept=".yaml,.yml" />
              📄 Choose Kubeconfig
            </label>

            {kubeconfigClusters.length > 0 && (
              <>
                <select
                  className="topbar-select"
                  value={selectedKubecluster?.name || ''}
                  onChange={e => {
                    const cluster = kubeconfigClusters.find(c => c.name === e.target.value)
                    setSelectedKubecluster(cluster)
                  }}
                >
                  <option value="">Select Cluster</option>
                  {kubeconfigClusters.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>

                <button
                  className="cluster-btn"
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
          <div className="connected-info">
            <span className="cluster-status active" />
            <span className="connected-name">{clusterInfo.name}</span>
            <span className="cluster-version">v{clusterInfo.version}</span>
            <button className="disconnect-btn" onClick={onDisconnect}>Disconnect</button>
          </div>
        )}
      </div>

      <div className="topbar-right">
        <span className="topbar-badge">CloudTerm</span>
      </div>
    </div>
  )
}
