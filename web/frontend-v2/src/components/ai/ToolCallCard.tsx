import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { ToolCall } from '@/stores/ai';

export interface ToolCallCardProps {
  toolCall: ToolCall;
}

function summarizeArgs(args: Record<string, unknown>): string {
  const vals = Object.values(args).filter((v) => typeof v === 'string' || typeof v === 'number');
  if (vals.length === 0) return '';
  const summary = vals.join(', ');
  return summary.length > 40 ? summary.slice(0, 40) + '…' : summary;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = toolCall.result !== undefined;
  const hasError = toolCall.error !== undefined;
  const argsSummary = summarizeArgs(toolCall.arguments);

  const statusDot = hasError
    ? 'bg-danger'
    : hasResult
      ? 'bg-success'
      : 'bg-accent animate-pulse';

  return (
    <div className="rounded-xl bg-[var(--elev)] border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg)] transition-colors text-left"
        aria-expanded={expanded}
      >
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
        {expanded ? (
          <ChevronDown size={12} className="text-text-dim shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-text-dim shrink-0" />
        )}
        <span className="text-[12px] text-text-mut">Called</span>
        <span className="text-[12px] font-mono font-semibold text-accent">{toolCall.name}</span>
        {argsSummary && (
          <>
            <span className="text-[12px] text-text-dim">→</span>
            <span className="text-[12px] font-mono text-accent/70 truncate">{argsSummary}</span>
          </>
        )}
        {hasResult && !hasError && !argsSummary && (
          <span className="text-[11px] text-success ml-auto">done</span>
        )}
        {hasError && (
          <span className="text-[11px] text-danger ml-auto">error</span>
        )}
        {!hasResult && !hasError && (
          <span className="text-[11px] text-text-dim ml-auto animate-pulse">running…</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-accent/15 px-3 py-2.5 space-y-2">
          <div>
            <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
              Arguments
            </p>
            <pre className="bg-[var(--bg)] rounded-lg p-2.5 text-[11px] font-mono text-text-pri overflow-x-auto scrollbar-none">
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>

          {hasResult && (
            <div>
              <p className="text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                Result
              </p>
              <pre className="bg-[var(--bg)] rounded-lg p-2.5 text-[11px] font-mono text-text-pri overflow-x-auto scrollbar-none max-h-40">
                {typeof toolCall.result === 'string'
                  ? toolCall.result
                  : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}

          {hasError && (
            <p className="text-[12px] text-danger bg-danger/8 rounded-lg px-2.5 py-2">
              {toolCall.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

ToolCallCard.displayName = 'ToolCallCard';
