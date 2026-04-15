import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  activeTunnels,
  startPortForward,
  stopPortForward,
} from "@/lib/api"
import type { ForwarderSession } from "@/types/rdp"

const WEB_PORTS = new Set([
  80, 443, 3000, 4200, 5000, 5173, 5174, 8000, 8080, 8443, 8888, 9000, 9090,
])

const POLL_INTERVAL = 10_000

export function PortForwardPanel() {
  const [tunnels, setTunnels] = useState<ForwarderSession[]>([])
  const [remoteHost, setRemoteHost] = useState("")
  const [remotePort, setRemotePort] = useState("")
  const [localPort, setLocalPort] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch active tunnels ──────────────────────────────────────────────
  const loadTunnels = useCallback(async () => {
    try {
      const all = await activeTunnels()
      // Hide internal RDP tunnels (port 3389)
      setTunnels(all.filter((t) => t.remote_port !== 3389))
    } catch {
      // silently ignore — forwarder may be unavailable
    }
  }, [])

  useEffect(() => {
    loadTunnels()
    timerRef.current = setInterval(loadTunnels, POLL_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [loadTunnels])

  // ── Start tunnel ──────────────────────────────────────────────────────
  const handleStart = async () => {
    const port = parseInt(remotePort, 10)
    if (!port || port < 1 || port > 65535) {
      setError("Enter a valid remote port (1–65535)")
      return
    }

    setBusy(true)
    setError(null)
    try {
      await startPortForward({
        instance_id: remoteHost || "manual",
        instance_name: remoteHost || "manual",
        aws_profile: "",
        aws_region: "",
        port_number: port,
      })
      setRemoteHost("")
      setRemotePort("")
      setLocalPort("")
      await loadTunnels()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start tunnel")
    } finally {
      setBusy(false)
    }
  }

  // ── Stop tunnel ───────────────────────────────────────────────────────
  const handleStop = async (instanceId: string, lport: number) => {
    try {
      await stopPortForward({ instance_id: instanceId, local_port: lport })
      await loadTunnels()
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* ── Create tunnel form ── */}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          handleStart()
        }}
      >
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground">Remote Host</label>
          <Input
            className="h-7 w-36 text-xs"
            placeholder="instance-id"
            value={remoteHost}
            onChange={(e) => setRemoteHost(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground">Remote Port</label>
          <Input
            className="h-7 w-20 text-xs"
            type="number"
            min={1}
            max={65535}
            placeholder="8080"
            value={remotePort}
            onChange={(e) => setRemotePort(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground">Local Port</label>
          <Input
            className="h-7 w-20 text-xs"
            type="number"
            min={1}
            max={65535}
            placeholder="auto"
            value={localPort}
            onChange={(e) => setLocalPort(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={busy}>
          {busy ? "Starting…" : "Start Tunnel"}
        </Button>
      </form>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* ── Active tunnels list ── */}
      {tunnels.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-muted-foreground">
            Active Tunnels ({tunnels.length})
          </span>
          {tunnels.map((t) => {
            const name = t.instance_name || t.instance_id
            const rp = t.remote_port || 3389
            const isWeb = WEB_PORTS.has(rp)

            return (
              <div
                key={`${t.instance_id}-${t.local_port}`}
                className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs"
              >
                <span className="truncate font-medium" title={t.instance_id}>
                  {name}
                </span>
                <span className="text-muted-foreground">
                  :{t.local_port} → :{rp}
                </span>
                {isWeb && (
                  <button
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    title="Open in browser"
                    onClick={() =>
                      window.open(`http://localhost:${t.local_port}`, "_blank")
                    }
                  >
                    <ExternalLink className="size-3.5" />
                  </button>
                )}
                <button
                  className={`${isWeb ? "" : "ml-auto"} text-muted-foreground hover:text-destructive`}
                  title="Stop tunnel"
                  onClick={() => handleStop(t.instance_id, t.local_port)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
