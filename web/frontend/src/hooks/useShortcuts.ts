import { useEffect } from "react"
import { registerShortcut, type Shortcut } from "@/lib/shortcuts"

/**
 * Register one or more keyboard shortcuts for the lifetime of the component.
 *
 * @example
 * useShortcuts([
 *   { key: "k", ctrl: true, handler: () => openSearch(), description: "Search" },
 * ])
 */
export function useShortcuts(shortcuts: Shortcut[]): void {
  useEffect(() => {
    const cleanups = shortcuts.map((s) => registerShortcut(s))
    return () => {
      cleanups.forEach((fn) => fn())
    }
    // Re-register when the caller passes a new array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts])
}
