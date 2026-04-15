import { useCallback, useMemo, useRef, useState } from "react"
import { Terminal, Monitor, X, ChevronLeft, ChevronRight } from "lucide-react"
import { useSessionStore, type Session } from "@/stores/useSessionStore"
import { useShortcuts } from "@/hooks/useShortcuts"
import { cn } from "@/lib/utils"

/** Status → colored dot class. */
function statusColor(session: Session): string {
  switch (session.status) {
    case "connected":
      return "bg-emerald-500"
    case "connecting":
      return "bg-amber-400 animate-pulse"
    case "disconnected":
      return "bg-zinc-500"
    case "recording":
      return "bg-emerald-500"
    default:
      return "bg-red-500"
  }
}

function TabItem({
  session,
  active,
  onSwitch,
  onClose,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  session: Session
  active: boolean
  onSwitch: () => void
  onClose: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const isRDP = session.instanceId.startsWith("rdp-") || session.status === "connected"
  const Icon = isRDP ? Monitor : Terminal

  return (
    <button
      role="tab"
      aria-selected={active}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSwitch}
      onAuxClick={(e) => {
        // Middle-click to close
        if (e.button === 1) {
          e.preventDefault()
          onClose()
        }
      }}
      className={cn(
        "group relative flex h-full shrink-0 items-center gap-1.5 border-r border-border px-3 text-xs transition-colors select-none",
        active
          ? "bg-[var(--bg)] text-foreground"
          : "bg-[var(--s1)] text-muted-foreground hover:bg-[var(--s2)] hover:text-foreground"
      )}
    >
      <Icon className="size-3 shrink-0 opacity-60" />

      {/* Connection state dot */}
      <span
        className={cn("size-1.5 shrink-0 rounded-full", statusColor(session))}
        title={session.status}
      />

      {/* Recording indicator */}
      {session.recording && (
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-red-500" title="Recording" />
      )}

      <span className="max-w-[120px] truncate">{session.instanceName}</span>

      {/* Close button */}
      <span
        role="button"
        tabIndex={-1}
        aria-label={`Close ${session.instanceName}`}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
      >
        <X className="size-3" />
      </span>

      {/* Active indicator bar */}
      {active && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
      )}
    </button>
  )
}

export function TabBar() {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const switchSession = useSessionStore((s) => s.switchSession)
  const removeSession = useSessionStore((s) => s.removeSession)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  // Convert Map to ordered array
  const sessionList = useMemo(() => Array.from(sessions.values()), [sessions])

  // Scroll overflow detection
  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowLeftArrow(el.scrollLeft > 0)
    setShowRightArrow(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  const scroll = useCallback((dir: "left" | "right") => {
    scrollRef.current?.scrollBy({
      left: dir === "left" ? -150 : 150,
      behavior: "smooth",
    })
  }, [])

  // Drag & drop reorder
  const handleDragStart = useCallback(
    (sessionId: string) => (e: React.DragEvent) => {
      setDragId(sessionId)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", sessionId)
    },
    []
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])

  const handleDrop = useCallback(
    (targetId: string) => (_e: React.DragEvent) => {
      if (!dragId || dragId === targetId) return
      // Reorder: we swap positions in the store's Map
      // Since Map preserves insertion order, we rebuild
      const entries = Array.from(sessions.entries())
      const fromIdx = entries.findIndex(([id]) => id === dragId)
      const toIdx = entries.findIndex(([id]) => id === targetId)
      if (fromIdx === -1 || toIdx === -1) return

      const [moved] = entries.splice(fromIdx, 1)
      entries.splice(toIdx, 0, moved)

      // Rebuild the sessions Map in the store
      const next = new Map(entries)
      useSessionStore.setState({ sessions: next })
      setDragId(null)
    },
    [dragId, sessions]
  )

  // Keyboard shortcuts for tab switching
  const shortcuts = useMemo(
    () => [
      {
        key: "t",
        ctrl: true,
        handler: () => {
          // Ctrl+T: new tab prompt — focuses sidebar search for instance selection
          // The actual instance picker is owned by the sidebar; we emit a UI event.
          document.querySelector<HTMLInputElement>("[data-testid='instance-search']")?.focus()
        },
        description: "New tab (search instances)",
        group: "Tabs",
      },
      {
        key: "w",
        ctrl: true,
        handler: () => {
          if (activeSessionId) removeSession(activeSessionId)
        },
        description: "Close current tab",
        group: "Tabs",
      },
      // Ctrl+1-9 to switch to tab N
      ...Array.from({ length: 9 }, (_, i) => ({
        key: String(i + 1),
        ctrl: true,
        handler: () => {
          const list = Array.from(sessions.values())
          if (i < list.length) switchSession(list[i].sessionId)
        },
        description: `Switch to tab ${i + 1}`,
        group: "Tabs",
      })),
    ],
    [activeSessionId, removeSession, sessions, switchSession]
  )

  useShortcuts(shortcuts)

  if (sessionList.length === 0) return null

  return (
    <div
      role="tablist"
      className="relative flex h-8 shrink-0 items-stretch border-b border-border bg-[var(--s1)]"
    >
      {/* Left scroll arrow */}
      {showLeftArrow && (
        <button
          aria-label="Scroll tabs left"
          onClick={() => scroll("left")}
          className="flex w-5 shrink-0 items-center justify-center border-r border-border text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3" />
        </button>
      )}

      {/* Scrollable tab container */}
      <div
        ref={scrollRef}
        onScroll={updateArrows}
        className="flex flex-1 items-stretch overflow-x-auto scrollbar-none"
      >
        {sessionList.map((session) => (
          <TabItem
            key={session.sessionId}
            session={session}
            active={session.sessionId === activeSessionId}
            onSwitch={() => switchSession(session.sessionId)}
            onClose={() => removeSession(session.sessionId)}
            onDragStart={handleDragStart(session.sessionId)}
            onDragOver={handleDragOver}
            onDrop={handleDrop(session.sessionId)}
          />
        ))}
      </div>

      {/* Right scroll arrow */}
      {showRightArrow && (
        <button
          aria-label="Scroll tabs right"
          onClick={() => scroll("right")}
          className="flex w-5 shrink-0 items-center justify-center border-l border-border text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="size-3" />
        </button>
      )}
    </div>
  )
}
