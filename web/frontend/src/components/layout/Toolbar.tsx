import {
  RefreshCw,
  Radio,
  Network,
  Settings,
  MessageSquare,
  ArrowUpDown,
  Code2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FleetSummary } from "@/components/fleet/FleetSummary"
import { useUIStore } from "@/stores/useUIStore"

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick?: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" onClick={onClick} aria-label={label}>
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export function Toolbar() {
  const toggleAIChat = useUIStore((s) => s.toggleAIChat)
  const openModal = useUIStore((s) => s.openModal)
  const setTransferManagerVisible = useUIStore((s) => s.setTransferManagerVisible)
  const transferManagerVisible = useUIStore((s) => s.transferManagerVisible)
  const setPortForwardOpen = useUIStore((s) => s.setPortForwardOpen)
  const portForwardOpen = useUIStore((s) => s.portForwardOpen)

  return (
    <header
      data-testid="toolbar"
      className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-[var(--s1)] px-2"
    >
      {/* Fleet summary */}
      <FleetSummary />

      <div className="flex-1" />

      {/* Action buttons */}
      <ToolbarButton label="Scan instances" icon={RefreshCw} />
      <ToolbarButton label="Broadcast" icon={Radio} />
      <ToolbarButton label="Snippets" icon={Code2} onClick={() => openModal("snippets")} />
      <ToolbarButton label="Network topology" icon={Network} onClick={() => openModal("topology")} />
      <ToolbarButton
        label="Transfers"
        icon={ArrowUpDown}
        onClick={() => setTransferManagerVisible(!transferManagerVisible)}
      />
      <ToolbarButton
        label="Port forwarding"
        icon={Network}
        onClick={() => setPortForwardOpen(!portForwardOpen)}
      />
      <ToolbarButton label="AI Chat" icon={MessageSquare} onClick={toggleAIChat} />
      <ToolbarButton label="Settings" icon={Settings} onClick={() => openModal("settings")} />
    </header>
  )
}
