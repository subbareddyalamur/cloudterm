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
    if (!cluster) {
      alert('No cluster info available')
      return
    }

    // If this cluster uses tsh, backend will try to execute it automatically
    const isTeleportCluster = cluster.exec_cmd?.includes('tsh') || cluster.exec_cmd?.includes('teleport')

    // Create a fake cluster object
    const clusterObj = {
      name: cluster.name,
      version: '1.0',
      endpoint: cluster.server
    }
    
    // Connect via kubeconfig API - backend will execute tsh if needed
    fetch('/api/k8s/kubeconfig/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server: cluster.server,
        ca_data: cluster.certificateAuthority,
        cluster_name: cluster.name,
        exec_cmd: cluster.exec_cmd || '',
        exec_args: cluster.exec_args || [],
        is_teleport: cluster.is_teleport || false
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data.auth_required === 'teleport') {
          return fetch(`/api/teleport/request-credentials?proxy=${encodeURIComponent(data.proxy)}&auth_type=${encodeURIComponent(data.auth_type)}`)
            .then(res => res.json())
            .then(creds => {
              if (creds.error) {
                alert('Teleport Login Failed: ' + creds.error)
                setConnecting(false)
                return
              }
              const authWindow = window.open(creds.auth_url, 'TeleportSSO', 'width=800,height=600')
              if (!authWindow) {
                alert('Popup blocked. Please allow popups for the Teleport login window.')
                setConnecting(false)
                return
              }
              const pollId = setInterval(() => {
                fetch(`/api/teleport/status?callback_id=${creds.callback_id}`)
                  .then(r => r.json())
                  .then(st => {
                    if (st.status === 'connected') {
                      clearInterval(pollId)
                      if (!authWindow.closed) authWindow.close()
                      // Second pass with credentials
                      fetch('/api/k8s/kubeconfig/connect', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          server: cluster.server,
                          ca_data: cluster.certificateAuthority,
                          cluster_name: cluster.name,
                          exec_cmd: cluster.exec_cmd || '',
                          exec_args: cluster.exec_args || [],
                          is_teleport: true,
                          teleport_session_id: creds.callback_id
                        })
                      })
                      .then(r2 => r2.json())
                      .then(final => {
                        if (final.error) {
                          alert(final.error)
                          setConnecting(false)
                          return
                        }
                        onConnect('kubeconfig', cluster.name, clusterObj)
                      })
                    } else if (st.status === 'failed') {
                      clearInterval(pollId)
                      alert('Teleport SSO failed: ' + st.error)
                      setConnecting(false)
                    } else if (authWindow.closed && st.status === 'pending') {
                      clearInterval(pollId)
                      alert('Teleport login cancelled (window closed).')
                      setConnecting(false)
                    }
                  })
              }, 2000)
            })
        }

        if (data.error) {
          let message = data.error
          if (cluster.is_teleport) {
            message += '\n\nTo connect to Teleport clusters, you need to run:\n' +
              'tsh login --proxy=<your-teleport-proxy>\n\n' +
              'This saves your Teleport session in ~/.tsh which is mounted to the container.'
          }
          alert(message)
          return
        }
        // Simulate cluster connection
        onConnect('kubeconfig', cluster.name, clusterObj)
      })
      .catch(err => alert('Connect failed: ' + err.message))
  }

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-icon">
          <svg className="cloud-ico" viewBox="0 0 640 512"><path d="M537.6 226.6c4.1-10.7 6.4-22.4 6.4-34.6 0-53-43-96-96-96-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32c-88.4 0-160 71.6-160 160 0 2.7.1 5.4.2 8.1C40.2 219.8 0 273.2 0 336c0 79.5 64.5 144 144 144h368c70.7 0 128-57.3 128-128 0-61.9-44-113.6-102.4-125.4z"/></svg>
          <svg className="term-ico" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
        </div>
        <div className="brand-text">
          <span className="brand-name">CloudTerm</span>
          <span className="brand-sub">Manage Kubernetes Clusters</span>
        </div>
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
