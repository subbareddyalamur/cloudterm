import { useState, useCallback, useMemo } from "react"
import {
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Star,
  Monitor,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useInstanceStore } from "@/stores/useInstanceStore"
import { useUIStore } from "@/stores/useUIStore"
import { cn } from "@/lib/utils"
import type {
  AccountNode,
  RegionNode,
  TagGroup,
  EC2Instance,
} from "@/types"

/* ── helpers ─────────────────────────────────────────────────────────── */

function matchesFilter(inst: EC2Instance, terms: string[]): boolean {
  if (terms.length === 0) return true
  const haystack = [
    inst.name,
    inst.instance_id,
    inst.private_ip,
    inst.public_ip ?? "",
    inst.tag1_value,
    inst.tag2_value,
    ...(inst.tags ? Object.values(inst.tags) : []),
  ]
    .join(" ")
    .toLowerCase()
  return terms.every((t) => haystack.includes(t))
}

function platformIcon(inst: EC2Instance) {
  const isWindows =
    inst.platform === "windows" ||
    inst.os?.toLowerCase().includes("windows")
  return isWindows ? "🪟" : "🐧"
}

/** Highlight matched terms in text by wrapping them in <mark>. */
function HighlightText({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length || !text) return <>{text}</>
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const pattern = escaped.join("|")
  const splitRe = new RegExp(`(${pattern})`, "gi")
  const testRe = new RegExp(`^(?:${pattern})$`, "i")
  const parts = text.split(splitRe)
  return (
    <>
      {parts.map((part, i) =>
        testRe.test(part) ? (
          <mark key={i} className="bg-yellow-300/40 text-inherit rounded-sm">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

/* ── types ───────────────────────────────────────────────────────────── */

interface InstanceTreeProps {
  onConnect: (instance: EC2Instance) => void
}

/* ── sub-components ──────────────────────────────────────────────────── */

function InstanceRow({
  inst,
  onConnect,
  filterTerms = [],
}: {
  inst: EC2Instance
  onConnect: (inst: EC2Instance) => void
  filterTerms?: string[]
}) {
  const favorites = useInstanceStore((s) => s.favorites)
  const toggleFavorite = useInstanceStore((s) => s.toggleFavorite)
  const showContextMenu = useUIStore((s) => s.showContextMenu)
  const isFav = favorites.has(inst.instance_id)

  const handleContext = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      showContextMenu({
        x: e.clientX,
        y: e.clientY,
        instanceId: inst.instance_id,
        instanceName: inst.name || inst.instance_id,
        platform: inst.platform === "windows" ? "rdp" : "ssh",
      })
    },
    [inst, showContextMenu],
  )

  return (
    <div
      className="group flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-accent"
      onDoubleClick={() => onConnect(inst)}
      onContextMenu={handleContext}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          inst.state === "running" ? "bg-green-500" : "bg-red-500",
        )}
      />
      <span className="min-w-0 truncate" title={inst.instance_id}>
        <HighlightText text={inst.name || inst.instance_id} terms={filterTerms} />
      </span>
      <span className="ml-auto shrink-0 text-[10px]" title={inst.os || inst.platform}>
        {platformIcon(inst)}
      </span>
      <button
        className={cn(
          "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
          isFav && "opacity-100 text-yellow-500",
        )}
        onClick={(e) => {
          e.stopPropagation()
          toggleFavorite(inst.instance_id)
        }}
        aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className={cn("size-3", isFav && "fill-current")} />
      </button>
    </div>
  )
}

function TagGroupNode({
  group,
  filterTerms,
  onConnect,
  forceOpen,
}: {
  group: TagGroup
  filterTerms: string[]
  onConnect: (inst: EC2Instance) => void
  forceOpen: boolean
}) {
  const label = [group.tag1, group.tag2].filter(Boolean).join(" / ")
  const filtered = group.instances.filter((i) => matchesFilter(i, filterTerms))
  const [open, setOpen] = useState(false)

  const isOpen = forceOpen || open

  if (filtered.length === 0) return null
  if (!label) {
    // No group label → render instances directly
    return (
      <>
        {filtered.map((inst) => (
          <div key={inst.instance_id} className="pl-6">
            <InstanceRow inst={inst} onConnect={onConnect} filterTerms={filterTerms} />
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="pl-4">
      <button
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent"
        onClick={() => setOpen((o) => !o)}
      >
        {isOpen ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <span className="truncate">{label}</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
          {filtered.length}
        </span>
      </button>
      {isOpen && (
        <div className="pl-2">
          {filtered.map((inst) => (
            <InstanceRow
              key={inst.instance_id}
              inst={inst}
              onConnect={onConnect}
              filterTerms={filterTerms}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RegionNodeView({
  region,
  filterTerms,
  onConnect,
  forceOpen,
}: {
  region: RegionNode
  filterTerms: string[]
  onConnect: (inst: EC2Instance) => void
  forceOpen: boolean
}) {
  const [open, setOpen] = useState(false)
  const isOpen = forceOpen || open

  const visibleCount = useMemo(
    () =>
      region.groups.reduce(
        (sum, g) =>
          sum + g.instances.filter((i) => matchesFilter(i, filterTerms)).length,
        0,
      ),
    [region.groups, filterTerms],
  )

  if (visibleCount === 0) return null

  return (
    <div className="pl-2">
      <button
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-xs font-medium hover:bg-accent"
        onClick={() => setOpen((o) => !o)}
      >
        {isOpen ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <span className="size-2 shrink-0 rounded-full bg-blue-500/60" />
        <span className="truncate">{region.region}</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
          {visibleCount}
        </span>
      </button>
      {isOpen &&
        region.groups.map((group, idx) => (
          <TagGroupNode
            key={`${group.tag1}-${group.tag2}-${idx}`}
            group={group}
            filterTerms={filterTerms}
            onConnect={onConnect}
            forceOpen={forceOpen}
          />
        ))}
    </div>
  )
}

function AccountNodeView({
  account,
  filterTerms,
  onConnect,
  forceOpen,
}: {
  account: AccountNode
  filterTerms: string[]
  onConnect: (inst: EC2Instance) => void
  forceOpen: boolean
}) {
  const [open, setOpen] = useState(false)
  const isOpen = forceOpen || open

  const visibleCount = useMemo(
    () =>
      account.regions.reduce(
        (sum, r) =>
          sum +
          r.groups.reduce(
            (gs, g) =>
              gs +
              g.instances.filter((i) => matchesFilter(i, filterTerms)).length,
            0,
          ),
        0,
      ),
    [account.regions, filterTerms],
  )

  if (visibleCount === 0) return null

  const displayLabel = account.account_alias || account.profile || account.account_id

  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-xs font-semibold hover:bg-accent"
        onClick={() => setOpen((o) => !o)}
      >
        {isOpen ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <Monitor className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{displayLabel}</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
          {visibleCount}
        </span>
      </button>
      {isOpen &&
        account.regions.map((region) => (
          <RegionNodeView
            key={region.region}
            region={region}
            filterTerms={filterTerms}
            onConnect={onConnect}
            forceOpen={forceOpen}
          />
        ))}
    </div>
  )
}

/* ── loading skeleton ────────────────────────────────────────────────── */

function TreeSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2 py-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
          <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
        </div>
      ))}
      <p className="text-center text-[10px] text-muted-foreground">
        Scanning instances…
      </p>
    </div>
  )
}

/* ── main component ──────────────────────────────────────────────────── */

export function InstanceTree({ onConnect }: InstanceTreeProps) {
  const instanceTree = useInstanceStore((s) => s.instanceTree)
  const scanStatus = useInstanceStore((s) => s.scanStatus)
  const filterText = useInstanceStore((s) => s.filterText)
  const [allExpanded, setAllExpanded] = useState(false)

  const filterTerms = useMemo(
    () =>
      filterText
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0),
    [filterText],
  )

  // When filtering, force all nodes open so matches are visible
  const forceOpen = filterTerms.length > 0 || allExpanded

  if (scanStatus?.status === "scanning" && !instanceTree) {
    return <TreeSkeleton />
  }

  if (!instanceTree || instanceTree.accounts.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
        No instances found.
        <br />
        Click <strong>Scan</strong> to discover.
      </div>
    )
  }

  return (
    <div data-testid="instance-tree" className="px-1">
      {/* Expand / Collapse toggle */}
      <div className="mb-1 flex justify-end px-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setAllExpanded((e) => !e)}
          aria-label={allExpanded ? "Collapse all" : "Expand all"}
          title={allExpanded ? "Collapse all" : "Expand all"}
        >
          <ChevronsUpDown className="size-3.5" />
        </Button>
      </div>

      {instanceTree.accounts.map((account) => (
        <AccountNodeView
          key={account.account_id}
          account={account}
          filterTerms={filterTerms}
          onConnect={onConnect}
          forceOpen={forceOpen}
        />
      ))}
    </div>
  )
}
