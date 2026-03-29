import React, { useState, useEffect } from 'react'
import { useApi } from './useApi.js'

const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-south-1'
]

export default function TopBar({ clusterId, clusterInfo, onConnect, onDisconnect }) {
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [clusters, setClusters] = useState([])
  const [loading, setLoading] = useState(false)
  const api = useApi()

  useEffect(() => {
    api.get('/aws-accounts').then(r => r.json()).then(setAccounts).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedAccount || !selectedRegion) { setClusters([]); return }
    setLoading(true)
    api.get('/api/k8s/clusters', { accountId: selectedAccount, region: selectedRegion })
      .then(r => r.json())
      .then(data => setClusters(data || []))
      .catch(() => setClusters([]))
      .finally(() => setLoading(false))
  }, [selectedAccount, selectedRegion])

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
        <select
          className="topbar-select"
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
          disabled={!!clusterId}
        >
          <option value="">Select Account</option>
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
                onClick={() => onConnect(selectedAccount, selectedRegion, c)}
              >
                <span className={`cluster-status ${c.status === 'ACTIVE' ? 'active' : ''}`} />
                {c.name}
                <span className="cluster-version">v{c.version}</span>
              </button>
            ))}
          </div>
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
