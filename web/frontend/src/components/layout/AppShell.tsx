import { InstanceContextMenu } from "@/components/context/InstanceContextMenu"
import { Sidebar } from "./Sidebar"
import { Toolbar } from "./Toolbar"
import { TabBar } from "@/components/tabs/TabBar"
import { PortForwardPanel } from "@/components/portforward/PortForwardPanel"
import { TransferManager } from "@/components/transfer/TransferManager"
import { UploadDialog } from "@/components/transfer/UploadDialog"
import { FileBrowser } from "@/components/files/FileBrowser"
import { SnippetLibrary } from "@/components/snippets/SnippetLibrary"
import { SettingsModal } from "@/components/settings/SettingsModal"
import { AiChat } from "@/components/ai/AiChat"
import { TopologyView } from "@/components/topology"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useUIStore } from "@/stores/useUIStore"
import { cn } from "@/lib/utils"

/** Slide-up bottom panel container (transfer manager / port forwarding). */
function BottomPanel({
  open,
  title,
  children,
}: {
  open: boolean
  title: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "overflow-hidden border-t border-border bg-[var(--s1)] transition-[max-height] duration-200",
        open ? "max-h-64" : "max-h-0 border-t-0"
      )}
    >
      <div className="flex h-8 items-center border-b border-border px-3 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <div className="p-2 text-xs text-muted-foreground">
        {children ?? `${title} placeholder`}
      </div>
    </div>
  )
}

export function AppShell() {
  const aiChatOpen = useUIStore((s) => s.aiChatOpen)
  const setAIChatOpen = useUIStore((s) => s.setAIChatOpen)
  const portForwardOpen = useUIStore((s) => s.portForwardOpen)
  const contextMenu = useUIStore((s) => s.contextMenu)
  const activeModal = useUIStore((s) => s.activeModal)
  const closeModal = useUIStore((s) => s.closeModal)

  return (
    <TooltipProvider>
      <div className="flex h-full w-full overflow-hidden bg-[var(--bg)]">
        {/* ── Sidebar ── */}
        <Sidebar />

        {/* ── Main column: toolbar + content + bottom panels ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Toolbar />

          {/* Tab bar */}
          <TabBar />

          {/* Main content area */}
          <div
            data-testid="main-area"
            className="relative flex-1 overflow-auto bg-[var(--bg)]"
          >
            {/* Topology full-screen view */}
            {activeModal === "topology" ? (
              <TopologyView />
            ) : (
              /* Welcome / empty state */
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <svg
                  className="size-12 opacity-30"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                </svg>
                <p className="text-sm font-medium">No active sessions</p>
                <p className="max-w-xs text-center text-xs">
                  Select an instance from the sidebar to start an SSH terminal or
                  RDP session.
                </p>
              </div>
            )}
          </div>

          {/* ── Bottom panels (slide up) ── */}
          <BottomPanel open={portForwardOpen} title="Port Forwarding">
            <PortForwardPanel />
          </BottomPanel>
        </div>

        {/* ── AI Chat right panel (Sheet drawer) ── */}
        <Sheet open={aiChatOpen} onOpenChange={setAIChatOpen}>
          <SheetContent side="right" className="flex w-[400px] flex-col p-0 sm:max-w-[400px]">
            <SheetHeader className="border-b border-border px-4 py-3">
              <SheetTitle className="text-sm">AI Chat</SheetTitle>
            </SheetHeader>
            <AiChat />
          </SheetContent>
        </Sheet>

        {/* ── Transfer Manager (floating overlay) ── */}
        <TransferManager />

        {/* ── File Browser (modal, driven by context menu) ── */}
        <FileBrowser
          instanceId={contextMenu?.instanceId ?? ""}
          instanceName={contextMenu?.instanceName ?? ""}
          platform={contextMenu?.platform}
        />

        {/* ── Upload Dialog (modal, driven by context menu) ── */}
        <UploadDialog
          instanceId={contextMenu?.instanceId ?? ""}
          instanceName={contextMenu?.instanceName ?? ""}
          platform={contextMenu?.platform}
        />

        {/* ── Instance context menu (right-click) ── */}
        <InstanceContextMenu />

        {/* ── Snippets modal ── */}
        <SnippetLibrary
          open={activeModal === "snippets"}
          onOpenChange={(open) => { if (!open) closeModal(); }}
        />

        {/* ── Settings modal ── */}
        <SettingsModal
          open={activeModal === "settings"}
          onOpenChange={(open) => { if (!open) closeModal(); }}
        />
      </div>
    </TooltipProvider>
  )
}
