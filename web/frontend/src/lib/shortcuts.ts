/** Global keyboard shortcut registry with platform-aware key handling. */

export interface Shortcut {
  /** The key to match (e.g. 't', '1', 'Escape', '?'). Case-insensitive for letters. */
  key: string
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
  /** Handler called when the shortcut fires. Return false to skip preventDefault. */
  handler: (e: KeyboardEvent) => void | false
  /** Human-readable description shown in the help overlay. */
  description: string
  /** Optional group for help display (e.g. "Tabs", "Navigation"). */
  group?: string
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform)

/** Normalize "ctrl" to mean Cmd on Mac, Ctrl elsewhere. */
function matchesModifier(e: KeyboardEvent, shortcut: Shortcut): boolean {
  const wantMod = shortcut.ctrl ?? false
  const hasMod = isMac ? e.metaKey : e.ctrlKey
  if (wantMod !== hasMod) return false

  const wantShift = shortcut.shift ?? false
  if (wantShift !== e.shiftKey) return false

  const wantMeta = shortcut.meta ?? false
  // meta flag is for explicit Meta requirement beyond the ctrl→Cmd mapping
  if (wantMeta && !e.metaKey) return false

  // Prevent accidental matches: if the user holds Alt, skip
  if (e.altKey) return false

  return true
}

function matchesKey(e: KeyboardEvent, shortcut: Shortcut): boolean {
  return e.key.toLowerCase() === shortcut.key.toLowerCase()
}

/** Returns true if the event target is inside an xterm screen or contenteditable. */
function isTerminalFocused(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null
  if (!target) return false
  if (target.closest(".xterm-screen")) return true
  if (target.isContentEditable) return true
  // Also skip when inside regular text inputs / textareas
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return false
}

// ── Registry ────────────────────────────────────────────────────────────

const registry = new Map<string, Shortcut>()

/** Unique key for deduplication. */
function shortcutId(s: Pick<Shortcut, "key" | "ctrl" | "shift" | "meta">): string {
  const parts: string[] = []
  if (s.ctrl) parts.push("Ctrl")
  if (s.shift) parts.push("Shift")
  if (s.meta) parts.push("Meta")
  parts.push(s.key.toLowerCase())
  return parts.join("+")
}

export function registerShortcut(shortcut: Shortcut): () => void {
  const id = shortcutId(shortcut)
  registry.set(id, shortcut)
  return () => {
    registry.delete(id)
  }
}

export function unregisterShortcut(shortcut: Pick<Shortcut, "key" | "ctrl" | "shift" | "meta">): void {
  registry.delete(shortcutId(shortcut))
}

export function getRegisteredShortcuts(): Shortcut[] {
  return Array.from(registry.values())
}

/** Human-readable label for a shortcut (e.g. "⌘T" or "Ctrl+T"). */
export function formatShortcut(s: Pick<Shortcut, "key" | "ctrl" | "shift" | "meta">): string {
  const parts: string[] = []
  if (s.ctrl) parts.push(isMac ? "⌘" : "Ctrl")
  if (s.shift) parts.push(isMac ? "⇧" : "Shift")
  if (s.meta) parts.push(isMac ? "⌘" : "Meta")

  let keyLabel = s.key
  if (keyLabel === "Escape") keyLabel = "Esc"
  else if (keyLabel === ",") keyLabel = ","
  else if (keyLabel.length === 1) keyLabel = keyLabel.toUpperCase()

  parts.push(keyLabel)
  return parts.join(isMac ? "" : "+")
}

// ── Global listener ─────────────────────────────────────────────────────

let listenerAttached = false

function handleKeyDown(e: KeyboardEvent): void {
  // Never intercept when terminal / input has focus, UNLESS it's a modifier shortcut
  // that the user explicitly registered as global.
  const termFocused = isTerminalFocused(e)

  for (const shortcut of registry.values()) {
    if (!matchesKey(e, shortcut)) continue
    if (!matchesModifier(e, shortcut)) continue

    // Plain keys (no modifier) must not fire while terminal/input is focused
    const hasModifier = shortcut.ctrl || shortcut.shift || shortcut.meta
    if (termFocused && !hasModifier) continue

    // Even modifier shortcuts should not fire in terminal unless they wouldn't
    // conflict (we skip all when xterm is focused to be safe)
    if (termFocused) continue

    e.preventDefault()
    const result = shortcut.handler(e)
    if (result === false) {
      // Handler opted out — don't prevent default (already called, but this
      // is a signal for future use)
    }
    return
  }
}

export function attachGlobalListener(): () => void {
  if (listenerAttached) return () => {}
  document.addEventListener("keydown", handleKeyDown, true)
  listenerAttached = true
  return () => {
    document.removeEventListener("keydown", handleKeyDown, true)
    listenerAttached = false
  }
}

// Auto-attach in browser
if (typeof document !== "undefined") {
  attachGlobalListener()
}
