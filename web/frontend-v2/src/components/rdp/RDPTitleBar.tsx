import { Info, Circle, Maximize2, XCircle, Keyboard } from 'lucide-react';
import { Button } from '@/components/primitives/Button';
import { Badge } from '@/components/primitives/Badge';

export interface RDPTitleBarProps {
  instanceName: string;
  env?: string;
  recording?: boolean;
  connectStatus?: 'connecting' | 'error';
  onDetails?: () => void;
  onFullscreen?: () => void;
  onEnd?: () => void;
  onCtrlAltDel?: () => void;
}

export function RDPTitleBar({
  instanceName,
  env,
  recording = false,
  connectStatus,
  onDetails,
  onFullscreen,
  onEnd,
  onCtrlAltDel,
}: RDPTitleBarProps) {
  const envVariant =
    env?.toLowerCase() === 'prod' ? 'danger' as const
    : env?.toLowerCase() === 'staging' ? 'warn' as const
    : env?.toLowerCase() === 'dev' ? 'success' as const
    : env?.toLowerCase() === 'test' ? 'info' as const
    : 'default' as const;

  return (
    <div className="flex items-center justify-between px-3 h-9 bg-surface border-b border-border shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Badge variant="info" size="sm">RDP</Badge>
        <span className="text-[12px] font-medium text-text-pri truncate">{instanceName}</span>
        {env && <Badge variant={envVariant} size="sm">{env}</Badge>}
        {connectStatus === 'connecting' && (
          <span className="text-[11px] text-text-dim animate-pulse">Connecting…</span>
        )}
        {connectStatus === 'error' && (
          <span className="text-[11px] text-danger">Connection failed</span>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {!connectStatus && (
          <>
            <Button
              variant="ghost"
              size="xs"
              icon={<Keyboard size={12} />}
              onClick={onCtrlAltDel}
              aria-label="Send Ctrl+Alt+Del"
              title="Send Ctrl+Alt+Del"
            >
              Ctrl+Alt+Del
            </Button>
            <div className="w-px h-4 bg-border mx-1" />
          </>
        )}
        <Button variant="ghost" size="xs" icon={<Info size={12} />} aria-label="Details" onClick={onDetails}>Details</Button>
        {recording && (
          <span className="inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium text-danger">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
              <Circle size={10} className="text-danger fill-danger relative" />
            </span>
            Recording
          </span>
        )}
        {!connectStatus && (
          <Button variant="ghost" size="xs" icon={<Maximize2 size={12} />} aria-label="Fullscreen" onClick={onFullscreen}>Fullscreen</Button>
        )}
        <div className="w-px h-4 bg-border mx-1" />
        <button
          type="button"
          className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium text-danger hover:bg-danger/10 transition-colors"
          onClick={onEnd}
          aria-label="End session"
        >
          <XCircle size={12} />
          End
        </button>
      </div>
    </div>
  );
}

RDPTitleBar.displayName = 'RDPTitleBar';
