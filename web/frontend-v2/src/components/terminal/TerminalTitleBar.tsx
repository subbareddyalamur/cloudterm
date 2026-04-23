import {
  Lightbulb, Info, Download, Circle, LayoutTemplate,
  Maximize2, XCircle,
} from 'lucide-react';

export interface TerminalTitleBarProps {
  instanceName?: string;
  instanceId?: string;
  recording?: boolean;
  onSuggest?: () => void;
  onDetails?: () => void;
  onExport?: () => void;
  onRecord?: () => void;
  onSplit?: () => void;
  onFullscreen?: () => void;
  onEnd?: () => void;
}

export function TerminalTitleBar({
  instanceName,
  instanceId,
  recording = false,
  onSuggest,
  onDetails,
  onExport,
  onRecord,
  onSplit,
  onFullscreen,
  onEnd,
}: TerminalTitleBarProps) {
  return (
    <div className="flex items-center px-3 h-9 bg-surface border-b border-border shrink-0 gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="w-2 h-2 rounded-full bg-success shrink-0" />
        <span className="text-[12px] font-medium text-text-pri truncate">{instanceName}</span>
        {instanceId && (
          <span className="text-[11px] text-text-dim font-mono shrink-0 truncate">{instanceId}</span>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium transition-colors bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
          onClick={onSuggest}
        >
          <Lightbulb size={12} />
          Suggest
        </button>

        <Btn icon={<Info size={12} />} label="Details" onClick={onDetails} />
        <Btn icon={<Download size={12} />} label="Export" onClick={onExport} />

        <button
          type="button"
          className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium transition-colors text-text-pri hover:bg-elev"
          onClick={onRecord}
        >
          {recording ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
              <Circle size={10} className="text-danger fill-danger relative" />
            </span>
          ) : (
            <Circle size={12} />
          )}
          Record
        </button>

        <Btn icon={<LayoutTemplate size={12} />} label="Split" onClick={onSplit} />
        <Btn icon={<Maximize2 size={12} />} label="Fullscreen" onClick={onFullscreen} />

        <div className="w-px h-4 bg-border mx-1" />

        <button
          type="button"
          className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium transition-colors text-danger hover:bg-danger/10"
          onClick={onEnd}
        >
          <XCircle size={12} />
          End
        </button>
      </div>
    </div>
  );
}

function Btn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium transition-colors text-text-pri hover:bg-elev"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

TerminalTitleBar.displayName = 'TerminalTitleBar';
