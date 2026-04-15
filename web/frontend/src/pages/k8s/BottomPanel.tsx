import { useState, useEffect, useRef, useCallback } from "react";
import type { K8sPodRef, K8sLogMessage } from "@/types";
import { k8sWebSocketUrl } from "@/lib/api";
import "@xterm/xterm/css/xterm.css";

type BottomTab = "logs" | "exec";

interface BottomPanelProps {
  clusterId: string | null;
  pod: K8sPodRef;
  tab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
  height: number;
  onHeightChange: (h: number) => void;
}

export function BottomPanel({
  clusterId,
  pod,
  tab,
  onTabChange,
  height,
  onHeightChange,
}: BottomPanelProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [logFilter, setLogFilter] = useState("");
  const [timestamps, setTimestamps] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedContainer, setSelectedContainer] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const execWsRef = useRef<WebSocket | null>(null);
  const xtermRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Cleanup websockets on unmount
  useEffect(
    () => () => {
      wsRef.current?.close();
      execWsRef.current?.close();
    },
    [],
  );

  // Set default container
  useEffect(() => {
    if (pod?.containers?.length) setSelectedContainer(pod.containers[0]);
  }, [pod]);

  // Logs streaming
  useEffect(() => {
    wsRef.current?.close();
    if (!clusterId || !pod || tab !== "logs" || !selectedContainer) return;

    setLogs([]);
    const url = k8sWebSocketUrl("/ws/k8s/logs", {
      cluster: clusterId,
      namespace: pod.namespace,
      pod: pod.name,
      container: selectedContainer,
      follow: "true",
    });
    const ws = new WebSocket(url);
    ws.onmessage = (e) => {
      const msg: K8sLogMessage = JSON.parse(e.data as string);
      if (msg.log) {
        setLogs((prev) => {
          const next = [...prev, msg.log!];
          return next.length > 5000 ? next.slice(-5000) : next;
        });
      }
      if (msg.error) {
        setLogs((prev) => [...prev, `[ERROR] ${msg.error}`]);
      }
    };
    ws.onerror = () => setLogs((prev) => [...prev, "[WS Error] Connection lost"]);
    wsRef.current = ws;
    return () => ws.close();
  }, [clusterId, pod, tab, selectedContainer]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Exec terminal
  useEffect(() => {
    execWsRef.current?.close();
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
    }
    if (!clusterId || !pod || tab !== "exec" || !selectedContainer || !termRef.current)
      return;

    let disposed = false;

    const init = async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");

      if (disposed) return;

      const xterm = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "JetBrains Mono, Menlo, monospace",
        theme: {
          background: "#0d1117",
          foreground: "#c9d1d9",
          cursor: "#c9d1d9",
        },
      });
      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);
      xterm.open(termRef.current!);
      fitAddon.fit();
      xtermRef.current = xterm;

      const url = k8sWebSocketUrl("/ws/k8s/exec", {
        cluster: clusterId,
        namespace: pod.namespace,
        pod: pod.name,
        container: selectedContainer,
        command: "/bin/sh",
      });
      const ws = new WebSocket(url);

      ws.onopen = () =>
        xterm.write(
          `\r\n\x1b[32mConnected to ${pod.name}/${selectedContainer}\x1b[0m\r\n\r\n`,
        );
      ws.onmessage = (e) => xterm.write(e.data as string);
      ws.onerror = () => xterm.write("\r\n\x1b[31m[Connection Error]\x1b[0m\r\n");
      ws.onclose = () => xterm.write("\r\n\x1b[33m[Session Closed]\x1b[0m\r\n");

      xterm.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });

      execWsRef.current = ws;
    };
    init();

    return () => {
      disposed = true;
      execWsRef.current?.close();
      xtermRef.current?.dispose();
    };
  }, [clusterId, pod, tab, selectedContainer]);

  // Drag resize
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: height };
      const onMove = (me: MouseEvent) => {
        const delta = dragRef.current!.startY - me.clientY;
        onHeightChange(
          Math.max(100, Math.min(window.innerHeight - 200, dragRef.current!.startHeight + delta)),
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [height, onHeightChange],
  );

  const filteredLogs = logFilter
    ? logs.filter((l) => l.toLowerCase().includes(logFilter.toLowerCase()))
    : logs;

  const displayLogs = timestamps
    ? filteredLogs
    : filteredLogs.map((l) => l.replace(/^\S+\s/, ""));

  if (!pod) {
    return (
      <div className="k8s-bottom-panel" style={{ height }}>
        <div className="k8s-drag-handle" onMouseDown={handleDragStart} />
        <div className="k8s-bottom-empty">Select a pod to view logs or exec</div>
      </div>
    );
  }

  return (
    <div className="k8s-bottom-panel" style={{ height }}>
      <div className="k8s-drag-handle" onMouseDown={handleDragStart} />
      <div className="k8s-bottom-header">
        <div className="k8s-bottom-tabs">
          <button
            className={`k8s-bottom-tab ${tab === "logs" ? "active" : ""}`}
            onClick={() => onTabChange("logs")}
          >
            Logs
          </button>
          <button
            className={`k8s-bottom-tab ${tab === "exec" ? "active" : ""}`}
            onClick={() => onTabChange("exec")}
          >
            Exec
          </button>
        </div>

        {pod.containers?.length > 1 && (
          <select
            className="k8s-container-select"
            value={selectedContainer}
            onChange={(e) => setSelectedContainer(e.target.value)}
          >
            {pod.containers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        {tab === "logs" && (
          <div className="k8s-log-controls">
            <input
              className="k8s-log-filter"
              placeholder="Filter logs..."
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
            />
            <label className="k8s-log-toggle">
              <input
                type="checkbox"
                checked={timestamps}
                onChange={(e) => setTimestamps(e.target.checked)}
              />
              Timestamps
            </label>
            <label className="k8s-log-toggle">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
          </div>
        )}
      </div>

      {tab === "logs" && (
        <div className="k8s-log-viewer" ref={logRef}>
          {displayLogs.map((line, i) => (
            <div key={i} className="k8s-log-line">
              {line}
            </div>
          ))}
          {displayLogs.length === 0 && (
            <div className="k8s-log-empty">Waiting for logs...</div>
          )}
        </div>
      )}

      {tab === "exec" && <div className="k8s-exec-terminal" ref={termRef} />}
    </div>
  );
}
