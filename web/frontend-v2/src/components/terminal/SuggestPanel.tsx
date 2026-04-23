import { useState } from 'react';
import { Terminal, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/primitives/Button';

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-[rRf]{1,3}\s*[/~]/i,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bdd\s+if=/i,
  /:\(\)\{.*&\s*\}/,
  /\bmkfs\b/i,
  /\bformat\b.*\/dev\//i,
  /\b>.*\/dev\/(sda|hda|nvme)/i,
];

export function isDestructiveCommand(cmd: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((p) => p.test(cmd));
}

export interface SuggestPanelProps {
  sessionId: string;
  command: string;
  explanation?: string;
  onDismiss: () => void;
}

export function SuggestPanel({ sessionId, command, explanation, onDismiss }: SuggestPanelProps) {
  const [approved, setApproved] = useState(false);
  const destructive = isDestructiveCommand(command);

  const handleType = () => {
    setApproved(true);
    window.dispatchEvent(
      new CustomEvent<{ sessionId: string; data: string }>('ct:terminal-type', {
        detail: { sessionId, data: command },
      }),
    );
  };

  if (approved) {
    return (
      <div className="absolute bottom-4 right-4 bg-surface border border-success/40 rounded p-3 shadow-lg max-w-[320px]">
        <p className="text-[11px] text-text-mut">
          ✓ Typed into terminal. Press <kbd className="kbd">Enter</kbd> to run.
        </p>
        <button type="button" className="absolute top-2 right-2 text-text-dim hover:text-text-pri" onClick={onDismiss} aria-label="Dismiss">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className={`absolute bottom-4 right-4 rounded-lg border shadow-2xl max-w-[340px] p-3 space-y-2 z-10 ${
      destructive ? 'border-danger bg-danger/10' : 'border-border bg-surface'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-text-mut">AI suggests</span>
        <button type="button" className="text-text-dim hover:text-text-pri shrink-0" onClick={onDismiss} aria-label="Dismiss">
          <X size={12} />
        </button>
      </div>
      {destructive && (
        <div className="flex items-center gap-1.5 text-[11px] text-danger font-medium">
          <AlertTriangle size={12} />
          Destructive command — review carefully
        </div>
      )}
      {explanation && (
        <p className="text-[11px] text-text-mut">{explanation}</p>
      )}
      <pre className="bg-bg rounded p-2 text-[12px] font-mono text-text-pri overflow-x-auto">
        <code>{command}</code>
      </pre>
      <div className="flex gap-2">
        <Button
          variant={destructive ? 'danger' : 'primary'}
          size="xs"
          icon={<Terminal size={11} />}
          onClick={handleType}
        >
          Type into terminal
        </Button>
        <Button variant="ghost" size="xs" icon={<X size={11} />} onClick={onDismiss}>
          Reject
        </Button>
      </div>
      <p className="text-[10px] text-text-dim">
        Typed into prompt only. Press <kbd className="kbd">Enter</kbd> yourself to run.
      </p>
    </div>
  );
}

SuggestPanel.displayName = 'SuggestPanel';
