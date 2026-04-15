import { useEffect, useCallback } from "react"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/stores/useUIStore"
import { useInstanceStore } from "@/stores/useInstanceStore"
import { useSessionStore } from "@/stores/useSessionStore"
import { getInstances } from "@/lib/api"
import { SidebarSearch } from "@/components/sidebar/SidebarSearch"
import { Favorites } from "@/components/sidebar/Favorites"
import { InstanceTree } from "@/components/sidebar/InstanceTree"
import type { EC2Instance } from "@/types"

export function Sidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const setInstances = useInstanceStore((s) => s.setInstances)

  // Fetch instances on mount
  useEffect(() => {
    getInstances()
      .then((tree) => {
        const flat = tree.accounts.flatMap((a) =>
          a.regions.flatMap((r) => r.groups.flatMap((g) => g.instances)),
        )
        setInstances(tree, flat)
      })
      .catch(() => {
        // API may 404 if no scan has been run yet — that's fine
      })
  }, [setInstances])

  const handleConnect = useCallback((inst: EC2Instance) => {
    const connType = inst.platform === "windows" ? "rdp" : "ssh"
    const sessionId = `${connType}-${inst.instance_id}-${Date.now()}`
    useSessionStore.getState().addSession({
      sessionId,
      instanceId: inst.instance_id,
      instanceName: inst.name || inst.instance_id,
      status: "connecting",
      recording: false,
      suggestEnabled: false,
    })
  }, [])

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        "flex h-full flex-col border-r border-border bg-[var(--s1)] transition-[width] duration-200",
        sidebarOpen ? "w-[252px] min-w-[240px] max-w-[400px]" : "w-12 min-w-12",
      )}
    >
      {/* Toggle button */}
      <div className="flex items-center justify-end px-1 py-1">
        <Button
          data-testid="sidebar-toggle"
          variant="ghost"
          size="icon-xs"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelLeftOpen className="size-4" />
          )}
        </Button>
      </div>

      {sidebarOpen && (
        <>
          {/* Search filter */}
          <SidebarSearch />

          {/* Scrollable tree area */}
          <ScrollArea className="flex-1">
            {/* Pinned favorites */}
            <Favorites onConnect={handleConnect} />

            {/* Instance tree */}
            <InstanceTree onConnect={handleConnect} />
          </ScrollArea>
        </>
      )}
    </aside>
  )
}
