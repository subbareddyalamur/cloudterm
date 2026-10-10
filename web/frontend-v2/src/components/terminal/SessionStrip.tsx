import { useState } from 'react';
import { Menu, type MenuItem } from '@/components/primitives/Menu';
import { TERMINAL_PALETTES } from '@/lib/xterm-themes';
import { useSettingsStore } from '@/stores/settings';
import type { SessionStatus } from '@/stores/sessions';

export interface SessionStripProps {
  kind: 'ssh' | 'rdp';
  name: string;
  instanceId: string;
  env: string;
  status?: SessionStatus | 'connecting' | 'error';
  recording: boolean;
  onToggleRecording?: () => void;
  onFind?: () => void;
  findOpen?: boolean;
  detailsOpen: boolean;
  onDetails: () => void;
  focus: boolean;
  onFocus: () => void;
  more: MenuItem[];
  onEnd: () => void;
}

export function isProdEnv(env: string): boolean {
  const e = env.toLowerCase();
  return e.includes('prod') || e === 'prd';
}

function EnvMark({ env }: { env: string }) {
  const prod = isProdEnv(env);
  const label = (env || 'no env').toUpperCase();
  return (
    <span
      className={`font-mono text-[10px] tracking-[0.06em] px-1.5 py-[1px] rounded border shrink-0 ${
        prod ? 'text-warn bg-warn-ink border-warn' : 'text-text-mut border-border'
      }`}
    >
      {label}
    </span>
  );
}

const btn = 'h-6 px-2 rounded-md text-[11px] transition-colors';
const quiet = `${btn} text-text-mut hover:text-text-pri hover:bg-elev`;
const pressed = `${btn} bg-elev text-text-pri`;

/**
 * The strip above a session. It answers which machine, which environment,
 * and whether the session is recorded. The shell login name is not shown:
 * after `sudo su` the browser cannot know it.
 */
export function SessionStrip({
  kind, name, instanceId, env, status, recording, onToggleRecording,
  onFind, findOpen, detailsOpen, onDetails, focus, onFocus, more, onEnd,
}: SessionStripProps) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [copied, setCopied] = useState(false);
  const terminalTheme = useSettingsStore((s) => s.terminalTheme);
  const setTerminalTheme = useSettingsStore((s) => s.setTerminalTheme);
  const themeName = TERMINAL_PALETTES.find((p) => p.id === terminalTheme)?.name ?? 'Theme';

  const statusText =
    status === 'connecting' ? 'Connecting…'
    : status === 'error' ? 'Connection failed'
    : status === 'disconnected' ? 'Disconnected'
    : null;

  return (
    <div className="h-9 flex items-center gap-2.5 px-3 bg-surface border-b border-border shrink-0 text-[12px] min-w-0">
      <EnvMark env={env} />
      <span className="font-semibold text-text-pri truncate min-w-0" title={name}>{name}</span>
      <button
        type="button"
        className="font-mono text-[11px] text-text-mut hover:text-text-pri shrink-0"
        title="Copy instance id"
        onClick={() => {
          void navigator.clipboard?.writeText(instanceId);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? 'Copied' : instanceId}
      </button>
      <span className="font-mono text-[10px] text-text-dim shrink-0">{kind.toUpperCase()}</span>
      {statusText && (
        <span className={`shrink-0 ${status === 'error' ? 'text-danger' : 'text-text-mut'}`}>{statusText}</span>
      )}
      <button
        type="button"
        onClick={onToggleRecording}
        disabled={!onToggleRecording}
        aria-pressed={recording}
        title={recording ? 'Stop recording' : 'Start recording'}
        className={`inline-flex items-center gap-1.5 shrink-0 ${recording ? 'text-warn' : 'text-text-dim hover:text-text-mut'} disabled:cursor-default`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${recording ? 'bg-warn' : 'border border-text-dim'}`} />
        {recording ? 'Recording' : 'Not recording'}
      </button>

      <div className="ml-auto flex items-center gap-0.5 shrink-0">
        {confirmEnd ? (
          <span className="inline-flex items-center gap-2 text-text-pri">
            End {name}?
            <button type="button" onClick={() => { setConfirmEnd(false); onEnd(); }} className="h-6 px-2 rounded-md text-[11px] border border-danger text-danger" autoFocus>
              End session
            </button>
            <button type="button" onClick={() => setConfirmEnd(false)} className="h-6 px-2 rounded-md text-[11px] border border-border text-text-pri">
              Stay
            </button>
          </span>
        ) : (
          <>
            {kind === 'ssh' && (
              <Menu
                label="Terminal theme"
                trigger={<span>{themeName}</span>}
                triggerClassName={quiet}
                sections={(['Dark', 'Light', 'High contrast'] as const).map((group) => ({
                  heading: group,
                  items: TERMINAL_PALETTES.filter((p) => p.group === group).map((p) => ({
                    label: p.name,
                    hint: p.id === terminalTheme ? 'on' : undefined,
                    onSelect: () => setTerminalTheme(p.id),
                  })),
                }))}
              />
            )}
            {onFind && (
              <button type="button" onClick={onFind} aria-pressed={findOpen} className={findOpen ? pressed : quiet} title="Find in scrollback (⌘F)">
                Find
              </button>
            )}
            <button type="button" onClick={onDetails} aria-pressed={detailsOpen} className={detailsOpen ? pressed : quiet}>
              Details
            </button>
            <button type="button" onClick={onFocus} aria-pressed={focus} className={focus ? pressed : quiet} title={focus ? 'Show the fleet column' : 'Hide the fleet column'}>
              {focus ? 'Show fleet' : 'Focus'}
            </button>
            {more.length > 0 && (
              <Menu label="More session actions" trigger={<span>More</span>} triggerClassName={quiet} sections={[{ items: more }]} />
            )}
            <span className="w-px h-3.5 bg-border mx-1.5" aria-hidden="true" />
            <button type="button" onClick={() => setConfirmEnd(true)} className={`${btn} text-danger hover:bg-elev`}>
              End
            </button>
          </>
        )}
      </div>
    </div>
  );
}
