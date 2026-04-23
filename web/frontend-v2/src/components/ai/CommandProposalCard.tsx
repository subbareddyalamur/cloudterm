import { useState } from 'react';
import { Terminal, X, AlertTriangle, Check } from 'lucide-react';
import { useAIStore, isDestructive } from '@/stores/ai';
import { useSessionsStore } from '@/stores/sessions';

export interface CommandProposalCardProps {
  proposalId: string;
  sessionId?: string | undefined;
}

export function CommandProposalCard({ proposalId, sessionId }: CommandProposalCardProps) {
  const proposal = useAIStore((s) => s.proposals[proposalId]);
  const approve = useAIStore((s) => s.approveProposal);
  const reject = useAIStore((s) => s.rejectProposal);
  const [copied, setCopied] = useState(false);

  if (!proposal) return null;

  const destructive = proposal.destructive ?? isDestructive(proposal.command);

  const handleType = () => {
    approve(proposalId);
    const targetSession = sessionId ?? useSessionsStore.getState().activeId;
    if (targetSession) {
      window.dispatchEvent(
        new CustomEvent<{ sessionId: string; data: string }>('ct:terminal-type', {
          detail: { sessionId: targetSession, data: proposal.command },
        }),
      );
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(proposal.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (proposal.approved) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-success/30 bg-success/8 text-[12px] text-text-pri">
        <Check size={13} className="text-success shrink-0" />
        Typed into terminal. Press{' '}
        <kbd className="kbd text-[10px]">Enter</kbd> to run.
      </div>
    );
  }

  if (proposal.rejected) {
    return (
      <div className="px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[12px] text-text-dim opacity-60">
        <s className="font-mono">{proposal.command}</s>
        <span className="ml-2">— rejected</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {destructive && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-danger/15 text-[12px] text-danger font-medium">
          <AlertTriangle size={13} aria-hidden="true" />
          Destructive command — review carefully before running.
        </div>
      )}

      {proposal.explanation && (
        <p className="text-[12px] text-text-mut leading-relaxed">{proposal.explanation}</p>
      )}

      <div className="relative group">
        <pre className="bg-[var(--bg)] rounded-xl p-3 text-[12px] font-mono text-text-pri overflow-x-auto scrollbar-none leading-relaxed border border-[var(--border)]">
          <code>{proposal.command}</code>
        </pre>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="absolute top-2 right-2 text-[10px] text-text-dim hover:text-text-pri px-1.5 py-0.5 rounded bg-[var(--elev)] border border-[var(--border)] opacity-0 group-hover:opacity-100 transition-all"
          aria-label="Copy command"
        >
          {copied ? '✓' : 'copy'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleType}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
            destructive
              ? 'bg-danger text-white hover:bg-danger/90'
              : 'bg-accent text-white hover:bg-accent/90'
          }`}
        >
          <Terminal size={12} />
          Type into terminal
        </button>
        <button
          type="button"
          onClick={() => reject(proposalId)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-text-dim hover:text-text-pri hover:bg-[var(--elev)] transition-colors"
        >
          <X size={12} />
          Reject
        </button>
      </div>
    </div>
  );
}

CommandProposalCard.displayName = 'CommandProposalCard';
