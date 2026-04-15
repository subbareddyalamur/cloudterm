import { useCallback, useEffect, useState } from "react"
import { BarChart3, ChevronDown, ChevronRight, Clock, Loader2, Server } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fleetSummary } from "@/lib/api"
import type { FleetSummary as FleetSummaryData, AccountStats } from "@/types"

// ---------------------------------------------------------------------------
// Stat pill — small labeled count used in the overview row
// ---------------------------------------------------------------------------

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center rounded-md bg-muted/50 px-3 py-1.5">
      <span className="text-base font-semibold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Platform bar — horizontal bar for a single platform entry
// ---------------------------------------------------------------------------

function PlatformBar({ name, count, max }: { name: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 truncate text-muted-foreground" title={name}>{name}</span>
      <div className="relative h-3 flex-1 rounded-full bg-muted/60">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums font-medium">{count}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expandable account row
// ---------------------------------------------------------------------------

function AccountRow({ acct }: { acct: AccountStats }) {
  const [open, setOpen] = useState(false)
  const label = acct.account_alias || acct.profile || acct.account_id
  const platforms = Object.entries(acct.platforms || {}).sort((a, b) => b[1] - a[1])

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/40"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <span className="flex-1 truncate font-medium" title={acct.account_id}>{label}</span>
        <span className="tabular-nums">{acct.total}</span>
        <span className="tabular-nums text-green-500">{acct.running}</span>
        <span className="tabular-nums text-red-400">{acct.stopped}</span>
      </button>

      {open && platforms.length > 0 && (
        <div className="space-y-1 px-7 pb-2">
          {platforms.map(([name, count]) => (
            <div key={name} className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{name}</span>
              <span className="tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main FleetSummary component — toolbar trigger + dialog
// ---------------------------------------------------------------------------

export function FleetSummary() {
  const [data, setData] = useState<FleetSummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fleetSummary())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load fleet summary")
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on dialog open
  useEffect(() => {
    if (open) load()
  }, [open, load])

  const platforms = data ? Object.entries(data.platforms || {}).sort((a, b) => b[1] - a[1]) : []
  const maxPlatform = platforms.length > 0 ? platforms[0][1] : 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
              <BarChart3 className="size-3.5" />
              {data ? (
                <>
                  <span className="tabular-nums font-medium text-foreground">{data.total}</span>
                  <span>instances</span>
                  <span className="text-[var(--dim)]">&middot;</span>
                  <span className="tabular-nums font-medium text-foreground">{data.accounts?.length ?? 0}</span>
                  <span>accounts</span>
                </>
              ) : (
                <>
                  <span>&mdash; instances</span>
                  <span className="text-[var(--dim)]">&middot;</span>
                  <span>&mdash; accounts</span>
                </>
              )}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Fleet summary</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="size-4" />
            Fleet Summary
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {/* Overview counts */}
            <div className="flex flex-wrap gap-2">
              <StatPill label="Total" value={data.total} />
              <StatPill label="Running" value={data.running} color="var(--color-green-500)" />
              <StatPill label="Stopped" value={data.stopped} color="var(--color-red-400)" />
              {data.scan_duration && (
                <StatPill label="Scan Time" value={data.scan_duration} color="var(--color-orange-400)" />
              )}
            </div>

            {/* Platform breakdown */}
            {platforms.length > 0 && (
              <section>
                <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Platforms
                </h4>
                <div className="space-y-1.5">
                  {platforms.map(([name, count]) => (
                    <PlatformBar key={name} name={name} count={count} max={maxPlatform} />
                  ))}
                </div>
              </section>
            )}

            {/* Per-account breakdown */}
            {data.accounts && data.accounts.length > 0 && (
              <section>
                <h4 className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Per Account
                </h4>
                {/* Column headers */}
                <div className="flex items-center gap-2 px-2 pb-1 text-[10px] text-muted-foreground">
                  <span className="w-3 shrink-0" />
                  <span className="flex-1">Account</span>
                  <span className="w-8 text-right">Total</span>
                  <span className="w-8 text-right">Run</span>
                  <span className="w-8 text-right">Stop</span>
                </div>
                <div className="rounded-md border">
                  {data.accounts.map((acct) => (
                    <AccountRow key={acct.account_id + acct.profile} acct={acct} />
                  ))}
                </div>
              </section>
            )}

            {/* Scan duration badge */}
            {data.scan_duration && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3" />
                <span>Last scan took {data.scan_duration}</span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
