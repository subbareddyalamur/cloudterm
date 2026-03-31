import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useApi } from './useApi.js'

export default function BottomPanel({ clusterId, pod, tab, onTabChange, height, onHeightChange }) {
  const [logs, setLogs] = useState([])
  const [logFilter, setLogFilter] = useState('')
  const [timestamps, setTimestamps] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [selectedContainer, setSelectedContainer] = useState('')
  const logRef = useRef(null)
  const termRef = useRef(null)
  const wsRef = useRef(null)
  const execWsRef = useRef(null)
  const xtermRef = useRef(null)
  const dragRef = useRef(null)
  const api = useApi()

  // Cleanup websockets on unmount
  useEffect(() => () => {
    wsRef.current?.close()
    execWsRef.current?.close()
  }, [])

  // Set default container
  useEffect(() => {
    if (pod?.containers?.length) setSelectedContainer(pod.containers[0])
  }, [pod])

  // Logs streaming
  useEffect(() => {
    wsRef.current?.close()
    if (!clusterId || !pod || tab !== 'logs' || !selectedContainer) return

    setLogs([])
    const ws = api.ws('/ws/k8s/logs', {
      cluster: clusterId,
      namespace: pod.namespace,
      pod: pod.name,
      container: selectedContainer,
      follow: 'true'
    })
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.log) {
        setLogs(prev => {
          const next = [...prev, msg.log]
          return next.length > 5000 ? next.slice(-5000) : next
        })
      }
      if (msg.error) {
        setLogs(prev => [...prev, `[ERROR] ${msg.error}`])
      }
    }
    ws.onerror = () => setLogs(prev => [...prev, '[WS Error] Connection lost'])
    wsRef.current = ws
    return () => ws.close()
  }, [clusterId, pod, tab, selectedContainer])

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Exec terminal
  useEffect(() => {
    execWsRef.current?.close()
    if (xtermRef.current) { xtermRef.current.dispose(); xtermRef.current = null }
    if (!clusterId || !pod || tab !== 'exec' || !selectedContainer || !termRef.current) return

    let xterm, fitAddon
    const init = async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      await import('@xterm/xterm/css/xterm.css')

      xterm = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'JetBrains Mono, Menlo, monospace',
        theme: {
          background: '#0d1117',
          foreground: '#c9d1d9',
          cursor: '#c9d1d9'
        }
      })
      fitAddon = new FitAddon()
      xterm.loadAddon(fitAddon)
      xterm.open(termRef.current)
      fitAddon.fit()
      xtermRef.current = xterm

      const ws = api.ws('/ws/k8s/exec', {
        cluster: clusterId,
        namespace: pod.namespace,
        pod: pod.name,
        container: selectedContainer,
        command: '/bin/sh'
      })

      ws.onopen = () => xterm.write('\r\n\x1b[32mConnected to ' + pod.name + '/' + selectedContainer + '\x1b[0m\r\n\r\n')
      ws.onmessage = (e) => xterm.write(e.data)
      ws.onerror = () => xterm.write('\r\n\x1b[31m[Connection Error]\x1b[0m\r\n')
      ws.onclose = () => xterm.write('\r\n\x1b[33m[Session Closed]\x1b[0m\r\n')

      xterm.onData(data => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data)
      })

      execWsRef.current = ws
    }
    init()

    return () => {
      execWsRef.current?.close()
      xtermRef.current?.dispose()
    }
  }, [clusterId, pod, tab, selectedContainer])

  // Drag resize
  const handleDragStart = useCallback((e) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: height }
    const onMove = (me) => {
      const delta = dragRef.current.startY - me.clientY
      onHeightChange(Math.max(100, Math.min(window.innerHeight - 200, dragRef.current.startHeight + delta)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height, onHeightChange])

  const filteredLogs = logFilter
    ? logs.filter(l => l.toLowerCase().includes(logFilter.toLowerCase()))
    : logs

  const displayLogs = timestamps
    ? filteredLogs
    : filteredLogs.map(l => l.replace(/^\S+\s/, ''))

  if (!pod) {
    return (
      <div className="bottom-panel" style={{ height }}>
        <div className="drag-handle" onMouseDown={handleDragStart} />
        <div className="bottom-empty">Select a pod to view logs or exec</div>
      </div>
    )
  }

  return (
    <div className="bottom-panel" style={{ height }}>
      <div className="drag-handle" onMouseDown={handleDragStart} />
      <div className="bottom-header">
        <div className="bottom-tabs">
          <button className={`bottom-tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => onTabChange('logs')}>
            Logs
          </button>
          <button className={`bottom-tab ${tab === 'exec' ? 'active' : ''}`} onClick={() => onTabChange('exec')}>
            Exec
          </button>
        </div>

        {pod.containers?.length > 1 && (
          <select
            className="container-select"
            value={selectedContainer}
            onChange={e => setSelectedContainer(e.target.value)}
          >
            {pod.containers.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {tab === 'logs' && (
          <div className="log-controls">
            <input
              className="log-filter"
              placeholder="Filter logs..."
              value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
            />
            <label className="log-toggle">
              <input type="checkbox" checked={timestamps} onChange={e => setTimestamps(e.target.checked)} />
              Timestamps
            </label>
            <label className="log-toggle">
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
              Auto-scroll
            </label>
          </div>
        )}
      </div>

      {tab === 'logs' && (
        <div className="log-viewer" ref={logRef}>
          {displayLogs.map((line, i) => (
            <div key={i} className="log-line">{line}</div>
          ))}
          {displayLogs.length === 0 && <div className="log-empty">Waiting for logs...</div>}
        </div>
      )}

      {tab === 'exec' && (
        <div className="exec-terminal" ref={termRef} />
      )}
    </div>
  )
}
