import { useCallback, useEffect, useMemo, useState } from "react"
import { XIcon } from "lucide-react"
import {
  getRegisteredShortcuts,
  registerShortcut,
  formatShortcut,
  type Shortcut,
} from "@/lib/shortcuts"
import { cn } from "@/lib/utils"

/**
 * Modal overlay listing all registered keyboard shortcuts.
 * Triggered by the `?` key (self-registered).
 */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => setOpen((v) => !v), [])
  const close = useCallback(() => setOpen(false), [])

  // Self-register the `?` shortcut to open the help overlay
  useEffect(() => {
    const unregHelp = registerShortcut({
      key: "?",
      handler: toggle,
      description: "Show keyboard shortcuts",
      group: "General",
    })

    return unregHelp
  }, [toggle])

  // Close on Escape while open
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [open, close])

  const shortcuts = useMemo(() => {
    if (!open) return []
    return getRegisteredShortcuts()
  }, [open])

  // Group shortcuts
  const groups = useMemo(() => {
    const map = new Map<string, Shortcut[]>()
    for (const s of shortcuts) {
      const g = s.group ?? "Other"
      const arr = map.get(g) ?? []
      arr.push(s)
      map.set(g, arr)
    }
    return map
  }, [shortcuts])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onClick={close}
    >
      <div
        className="relative w-full max-w-lg rounded-lg border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <button
            onClick={close}
            className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* Shortcut grid */}
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {Array.from(groups.entries()).map(([group, items]) => (
            <div key={group}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group}
              </h3>
              <div className="space-y-1">
                {items.map((s) => (
                  <ShortcutRow key={formatShortcut(s)} shortcut={s} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  const label = formatShortcut(shortcut)
  const keys = label.includes("+") ? label.split("+") : [label]

  return (
    <div className="flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50">
      <span className="text-foreground">{shortcut.description}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className={cn(
              "inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5",
              "font-mono text-[11px] font-medium text-muted-foreground"
            )}
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  )
}
