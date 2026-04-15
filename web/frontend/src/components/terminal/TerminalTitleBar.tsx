import {
  Lightbulb,
  Info,
  Download,
  Circle,
  Columns2,
  Maximize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface TerminalTitleBarProps {
  instanceName: string;
  recording: boolean;
  suggestEnabled: boolean;
  envBorderColor?: string;
  onToggleSuggest?: () => void;
  onDetails?: () => void;
  onExport?: () => void;
  onRecord?: () => void;
  onSplit?: () => void;
  onFullscreen?: () => void;
  onEndSession?: () => void;
}

export function TerminalTitleBar({
  instanceName,
  recording,
  suggestEnabled,
  envBorderColor,
  onToggleSuggest,
  onDetails,
  onExport,
  onRecord,
  onSplit,
  onFullscreen,
  onEndSession,
}: TerminalTitleBarProps) {
  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface)] border-b border-[var(--border)] text-xs select-none"
      style={envBorderColor ? { borderTopColor: envBorderColor, borderTopWidth: 2 } : undefined}
    >
      {/* Left: name + badge */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
        <span className="truncate font-medium text-[var(--fg)]">
          {instanceName}
        </span>
        <span className="text-[10px] text-[var(--dim)] bg-[var(--surface-hover)] px-1.5 py-0.5 rounded">
          SSM Session
        </span>
        {recording && (
          <span className="flex items-center gap-1 text-red-500">
            <Circle className="h-2 w-2 fill-current" />
            <span>REC</span>
          </span>
        )}
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1">
        <ActionBtn
          title="Toggle AI suggestions"
          active={suggestEnabled}
          onClick={onToggleSuggest}
        >
          <Lightbulb className="h-3.5 w-3.5" />
          <span>Suggest</span>
        </ActionBtn>
        <ActionBtn title="Instance details" onClick={onDetails}>
          <Info className="h-3.5 w-3.5" />
          <span>Details</span>
        </ActionBtn>
        <ActionBtn title="Export session log" onClick={onExport}>
          <Download className="h-3.5 w-3.5" />
          <span>Export</span>
        </ActionBtn>
        <ActionBtn
          title="Toggle recording"
          active={recording}
          onClick={onRecord}
        >
          <Circle
            className={cn("h-3.5 w-3.5", recording && "fill-red-500 text-red-500")}
          />
          <span>Record</span>
        </ActionBtn>
        <ActionBtn title="Split terminal" onClick={onSplit}>
          <Columns2 className="h-3.5 w-3.5" />
          <span>Split</span>
        </ActionBtn>
        <ActionBtn title="Fullscreen" onClick={onFullscreen}>
          <Maximize2 className="h-3.5 w-3.5" />
          <span>Fullscreen</span>
        </ActionBtn>
        <ActionBtn title="End session" onClick={onEndSession} variant="danger">
          <X className="h-3.5 w-3.5" />
          <span>End</span>
        </ActionBtn>
      </div>
    </div>
  );
}

function ActionBtn({
  title,
  active,
  variant,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  variant?: "danger";
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors",
        "hover:bg-[var(--surface-hover)]",
        active && "text-[var(--accent)]",
        variant === "danger" && "hover:text-red-500",
        !active && !variant && "text-[var(--dim)]",
      )}
    >
      {children}
    </button>
  );
}
