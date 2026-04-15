import { useEffect, useRef, useCallback } from "react"
import {
  Terminal,
  Monitor,
  Info,
  Activity,
  FolderOpen,
  Radio,
  Star,
  Copy,
  Network,
  Globe,
} from "lucide-react"
import { useUIStore } from "@/stores/useUIStore"
import { useInstanceStore } from "@/stores/useInstanceStore"
import type { EC2Instance } from "@/types"
import { cn } from "@/lib/utils"

/* ── helpers ─────────────────────────────────────────────────────────── */

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    /* silent – no toast system wired yet */
  })
}

/* ── types ───────────────────────────────────────────────────────────── */

interface MenuItemDef {
  label: string
  icon: React.ReactNode
  action: string
  hidden?: boolean
  disabled?: boolean
}

/* ── component ───────────────────────────────────────────────────────── */

export function InstanceContextMenu() {
  const contextMenu = useUIStore((s) => s.contextMenu)
  const hideContextMenu = useUIStore((s) => s.hideContextMenu)
  const favorites = useInstanceStore((s) => s.favorites)
  const toggleFavorite = useInstanceStore((s) => s.toggleFavorite)
  const flatInstances = useInstanceStore((s) => s.flatInstances)
  const menuRef = useRef<HTMLDivElement>(null)

  /* close on outside click or Escape */
  useEffect(() => {
    if (!contextMenu) return

    function handleClick() {
      hideContextMenu()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") hideContextMenu()
    }

    document.addEventListener("click", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("click", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [contextMenu, hideContextMenu])

  /* reposition if menu overflows viewport */
  useEffect(() => {
    if (!contextMenu || !menuRef.current) return
    const el = menuRef.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let x = contextMenu.x
    let y = contextMenu.y
    if (x + rect.width > vw) x = vw - rect.width - 4
    if (y + rect.height > vh) y = vh - rect.height - 4
    if (x < 0) x = 4
    if (y < 0) y = 4

    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [contextMenu])

  const handleAction = useCallback(
    (action: string) => {
      if (!contextMenu) return
      const { instanceId, instanceName } = contextMenu

      switch (action) {
        case "ssh":
          // Delegate to session opener (other components handle actual connection)
          window.dispatchEvent(
            new CustomEvent("instance:connect", {
              detail: { instanceId, instanceName, protocol: "ssh" },
            }),
          )
          break

        case "rdp":
          window.dispatchEvent(
            new CustomEvent("instance:connect", {
              detail: { instanceId, instanceName, protocol: "rdp" },
            }),
          )
          break

        case "details":
          window.dispatchEvent(
            new CustomEvent("instance:details", {
              detail: { instanceId, instanceName },
            }),
          )
          break

        case "metrics":
          window.dispatchEvent(
            new CustomEvent("instance:metrics", {
              detail: { instanceId, instanceName },
            }),
          )
          break

        case "files":
          window.dispatchEvent(
            new CustomEvent("instance:files", {
              detail: { instanceId, instanceName },
            }),
          )
          break

        case "broadcast":
          window.dispatchEvent(
            new CustomEvent("instance:broadcast", {
              detail: { instanceId, instanceName },
            }),
          )
          break

        case "favorite": {
          toggleFavorite(instanceId)
          break
        }

        case "copy-id":
          copyToClipboard(instanceId)
          break

        case "copy-private-ip": {
          const inst = flatInstances.find((i: EC2Instance) => i.instance_id === instanceId)
          if (inst?.private_ip) copyToClipboard(inst.private_ip)
          break
        }

        case "copy-public-ip": {
          const inst = flatInstances.find((i: EC2Instance) => i.instance_id === instanceId)
          if (inst?.public_ip) copyToClipboard(inst.public_ip)
          break
        }
      }

      hideContextMenu()
    },
    [contextMenu, hideContextMenu, toggleFavorite, flatInstances],
  )

  if (!contextMenu) return null

  const { instanceId, instanceName, platform } = contextMenu
  const isWindows = platform === "rdp"
  const isFav = favorites.has(instanceId)
  const inst = flatInstances.find((i: EC2Instance) => i.instance_id === instanceId)

  const groups: MenuItemDef[][] = [
    /* ── connection ── */
    [
      { label: "Connect SSH", icon: <Terminal className="size-4" />, action: "ssh" },
      {
        label: "Connect RDP",
        icon: <Monitor className="size-4" />,
        action: "rdp",
        hidden: !isWindows,
      },
    ],
    /* ── inspect ── */
    [
      { label: "Instance Details", icon: <Info className="size-4" />, action: "details" },
      { label: "Quick Metrics", icon: <Activity className="size-4" />, action: "metrics" },
      { label: "File Browser", icon: <FolderOpen className="size-4" />, action: "files" },
    ],
    /* ── actions ── */
    [
      { label: "Broadcast to…", icon: <Radio className="size-4" />, action: "broadcast" },
      {
        label: isFav ? "Remove Favorite" : "Add Favorite",
        icon: <Star className={cn("size-4", isFav && "fill-current text-yellow-500")} />,
        action: "favorite",
      },
    ],
    /* ── clipboard ── */
    [
      { label: "Copy Instance ID", icon: <Copy className="size-4" />, action: "copy-id" },
      {
        label: "Copy Private IP",
        icon: <Network className="size-4" />,
        action: "copy-private-ip",
        disabled: !inst?.private_ip,
      },
      {
        label: "Copy Public IP",
        icon: <Globe className="size-4" />,
        action: "copy-public-ip",
        disabled: !inst?.public_ip,
        hidden: !inst?.public_ip,
      },
    ],
  ]

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* header */}
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground truncate max-w-[220px]">
        {instanceName}
      </div>
      <div className="-mx-1 my-1 h-px bg-border" />

      {groups.map((group, gi) => {
        const visible = group.filter((item) => !item.hidden)
        if (visible.length === 0) return null
        return (
          <div key={gi}>
            {gi > 0 && <div className="-mx-1 my-1 h-px bg-border" />}
            {visible.map((item) => (
              <button
                key={item.action}
                role="menuitem"
                disabled={item.disabled}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none",
                  "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                  "disabled:pointer-events-none disabled:opacity-50",
                  "[&_svg]:text-muted-foreground",
                )}
                onClick={() => handleAction(item.action)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
