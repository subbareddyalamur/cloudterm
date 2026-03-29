import React, { useState, useEffect, useMemo } from 'react'
import { useApi } from './useApi.js'

export default function ResourceTree({ clusterId, onSelect }) {
  const [categories, setCategories] = useState([])
  const [namespaces, setNamespaces] = useState([])
  const [selectedNs, setSelectedNs] = useState('')
  const [allNamespaces, setAllNamespaces] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [resourceItems, setResourceItems] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState({})
  const api = useApi()

  useEffect(() => {
    if (!clusterId) { setCategories([]); setNamespaces([]); return }
    api.get('/api/k8s/categories', { cluster: clusterId })
      .then(r => r.json()).then(setCategories).catch(() => {})
    api.get('/api/k8s/namespaces', { cluster: clusterId })
      .then(r => r.json()).then(setNamespaces).catch(() => {})
  }, [clusterId])

  const toggleCategory = (name) => {
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const toggleResourceType = async (cat, res) => {
    const key = `${cat}/${res.name}`
    if (expanded[key]) {
      setExpanded(prev => ({ ...prev, [key]: false }))
      return
    }
    setExpanded(prev => ({ ...prev, [key]: true }))
    setLoading(prev => ({ ...prev, [key]: true }))

    try {
      const ns = allNamespaces ? '' : selectedNs
      const items = await api.get('/api/k8s/resources/' + res.name, {
        cluster: clusterId, group: res.group, version: res.version, namespace: ns
      }).then(r => r.json())
      setResourceItems(prev => ({ ...prev, [key]: items || [] }))
    } catch {
      setResourceItems(prev => ({ ...prev, [key]: [] }))
    }
    setLoading(prev => ({ ...prev, [key]: false }))
  }

  const handleSelect = (item, resType) => {
    const ns = item.metadata?.namespace || ''
    const name = item.metadata?.name || ''
    const containers = item.spec?.containers?.map(c => c.name) || []
    onSelect({
      kind: resType.kind,
      name,
      namespace: ns,
      group: resType.group,
      version: resType.version,
      resource: resType.name,
      containers
    })
  }

  const filteredCategories = useMemo(() => {
    if (!search) return categories
    const q = search.toLowerCase()
    return categories.map(cat => ({
      ...cat,
      resources: cat.resources.filter(r =>
        r.kind.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
      )
    })).filter(cat => cat.resources.length > 0)
  }, [categories, search])

  if (!clusterId) {
    return (
      <div className="sidebar">
        <div className="sidebar-empty">
          <svg viewBox="0 0 32 32" width="40" height="40" opacity="0.3">
            <path fill="currentColor" d="M16 2l12.66 7.34v14.64L16 31.32 3.34 23.98V9.34z"/>
          </svg>
          <p>Connect to a cluster to browse resources</p>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <input
          className="sidebar-search"
          placeholder="Filter resources..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="ns-selector">
          <label className="ns-all">
            <input
              type="checkbox"
              checked={allNamespaces}
              onChange={e => setAllNamespaces(e.target.checked)}
            />
            All NS
          </label>
          {!allNamespaces && (
            <select
              className="ns-select"
              value={selectedNs}
              onChange={e => setSelectedNs(e.target.value)}
            >
              <option value="">Select namespace</option>
              {namespaces.map(ns => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="sidebar-tree">
        {filteredCategories.map(cat => (
          <div key={cat.name} className="tree-category">
            <div
              className="tree-category-header"
              onClick={() => toggleCategory(cat.name)}
            >
              <span className={`tree-arrow ${expanded[cat.name] ? 'open' : ''}`}>▸</span>
              <span className="tree-category-name">{cat.name}</span>
              <span className="tree-count">{cat.resources.length}</span>
            </div>
            {expanded[cat.name] && cat.resources.map(res => {
              const key = `${cat.name}/${res.name}`
              const items = resourceItems[key] || []
              return (
                <div key={res.name} className="tree-resource">
                  <div
                    className="tree-resource-header"
                    onClick={() => toggleResourceType(cat.name, res)}
                  >
                    <span className={`tree-arrow ${expanded[key] ? 'open' : ''}`}>▸</span>
                    <span className="tree-resource-kind">{res.kind}</span>
                    {loading[key] && <span className="tree-spinner" />}
                    {expanded[key] && <span className="tree-count">{items.length}</span>}
                  </div>
                  {expanded[key] && (
                    <div className="tree-items">
                      {items.map((item, i) => (
                        <div
                          key={item.metadata?.name || i}
                          className="tree-item"
                          onClick={() => handleSelect(item, res)}
                        >
                          <ResourceIcon kind={res.kind} status={getPodStatus(item)} />
                          <span className="tree-item-name">{item.metadata?.name}</span>
                          {item.metadata?.namespace && (
                            <span className="tree-item-ns">{item.metadata.namespace}</span>
                          )}
                        </div>
                      ))}
                      {items.length === 0 && (
                        <div className="tree-item tree-empty">No resources found</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function ResourceIcon({ kind, status }) {
  const colors = {
    Pod: status === 'Running' ? '#3fb950' : status === 'Failed' ? '#f85149' : '#d29922',
    Deployment: '#58a6ff',
    Service: '#bc8cff',
    ConfigMap: '#79c0ff',
    Secret: '#ffa657',
    default: '#8b949e'
  }
  const color = colors[kind] || colors.default
  return (
    <span className="tree-icon" style={{ color }}>●</span>
  )
}

function getPodStatus(item) {
  return item.status?.phase || ''
}
