import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useApi } from './useApi.js'

export default function DetailPanel({ clusterId, resource, onOpenLogs, onOpenExec }) {
  const [data, setData] = useState(null)
  const [format, setFormat] = useState('yaml') // 'yaml' | 'json'
  const [tab, setTab] = useState('definition') // 'definition' | 'events'
  const [revealedSecrets, setRevealedSecrets] = useState({})
  const [copied, setCopied] = useState(false)
  const api = useApi()

  useEffect(() => {
    if (!clusterId || !resource) { setData(null); return }
    setRevealedSecrets({})
    api.get(`/api/k8s/resource/${resource.resource}/${resource.name}`, {
      cluster: clusterId,
      group: resource.group,
      version: resource.version,
      namespace: resource.namespace
    })
      .then(r => r.json())
      .then(setData)
      .catch(err => setData({ error: err.message }))
  }, [clusterId, resource])

  const formatted = useMemo(() => {
    if (!data) return ''
    if (data.error) return `Error: ${data.error}`

    let obj = data
    // Handle secret reveal
    if (resource?.kind === 'Secret' && obj.data) {
      obj = { ...obj, data: { ...obj.data } }
      Object.keys(obj.data).forEach(key => {
        if (revealedSecrets[key]) {
          try {
            obj.data[key] = atob(obj.data[key])
          } catch { /* keep original */ }
        }
      })
    }

    if (format === 'json') return JSON.stringify(obj, null, 2)
    return toYaml(obj, 0)
  }, [data, format, revealedSecrets, resource])

  const toggleSecret = (key) => {
    setRevealedSecrets(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(formatted)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleShowLogs = useCallback(() => {
    if (resource.kind === 'Pod' && onOpenLogs) {
      onOpenLogs({
        namespace: resource.namespace,
        name: resource.name,
        containers: resource.containers || []
      })
    }
  }, [resource, onOpenLogs])

  const handleShowExec = useCallback(() => {
    if (resource.kind === 'Pod' && onOpenExec) {
      onOpenExec({
        namespace: resource.namespace,
        name: resource.name,
        containers: resource.containers || []
      })
    }
  }, [resource, onOpenExec])

  if (!resource) {
    return (
      <div className="detail-panel">
        <div className="detail-empty">Select a resource to view its definition</div>
      </div>
    )
  }

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-title">
          <span className="detail-kind">{resource.kind}</span>
          <span className="detail-name">{resource.name}</span>
          {resource.namespace && (
            <span className="detail-ns">{resource.namespace}</span>
          )}
        </div>
        <div className="detail-actions">
          <div className="detail-tabs">
            <button
              className={`detail-tab ${tab === 'definition' ? 'active' : ''}`}
              onClick={() => setTab('definition')}
            >Definition</button>
            <button
              className={`detail-tab ${tab === 'events' ? 'active' : ''}`}
              onClick={() => setTab('events')}
            >Events</button>
          </div>
          {resource.kind === 'Pod' && (
            <div className="pod-action-buttons">
              <button className="pod-action-btn logs" onClick={handleShowLogs} title="View logs">
                📋 Logs
              </button>
              <button className="pod-action-btn exec" onClick={handleShowExec} title="Exec into container">
                💻 Exec
              </button>
            </div>
          )}
          <div className="detail-format-toggle">
            <button
              className={`fmt-btn ${format === 'yaml' ? 'active' : ''}`}
              onClick={() => setFormat('yaml')}
            >YAML</button>
            <button
              className={`fmt-btn ${format === 'json' ? 'active' : ''}`}
              onClick={() => setFormat('json')}
            >JSON</button>
          </div>
          <button className="copy-btn" onClick={copyToClipboard}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {resource.kind === 'Secret' && data?.data && (
        <div className="secret-bar">
          {Object.keys(data.data).map(key => (
            <div key={key} className="secret-entry">
              <span className="secret-key">{key}</span>
              <button
                className="secret-eye"
                onClick={() => toggleSecret(key)}
                title={revealedSecrets[key] ? 'Hide value' : 'Show decoded value'}
              >
                {revealedSecrets[key] ? '🙈' : '👁'}
              </button>
              {revealedSecrets[key] && (
                <span className="secret-value">{atob(data.data[key])}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {resource.kind === 'Pod' && data && (
        <div className="pod-status-bar">
          <span className={`pod-phase ${(data.status?.phase || '').toLowerCase()}`}>
            {data.status?.phase}
          </span>
          {data.spec?.containers?.map(c => (
            <span key={c.name} className="pod-container-badge">{c.name}</span>
          ))}
        </div>
      )}

      <pre className="detail-code">
        <code>{formatted}</code>
      </pre>
    </div>
  )
}

function toYaml(obj, indent) {
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj === 'string') {
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#')) {
      return `"${obj.replace(/"/g, '\\"')}"`
    }
    return obj
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj)

  const pad = '  '.repeat(indent)
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    return obj.map(item => {
      const val = toYaml(item, indent + 1)
      if (typeof item === 'object' && item !== null) {
        return `${pad}- ${val.trimStart()}`
      }
      return `${pad}- ${val}`
    }).join('\n')
  }

  const entries = Object.entries(obj)
  if (entries.length === 0) return '{}'
  return entries.map(([key, val]) => {
    if (val === null || val === undefined) return `${pad}${key}: null`
    if (typeof val === 'object') {
      const sub = toYaml(val, indent + 1)
      return `${pad}${key}:\n${sub}`
    }
    return `${pad}${key}: ${toYaml(val, indent)}`
  }).join('\n')
}
