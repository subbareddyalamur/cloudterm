import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { X, Send, Square, ShieldAlert, Bot, Plus, ChevronDown } from 'lucide-react';
import { useAIStore, type Message } from '@/stores/ai';
import { useSessionsStore } from '@/stores/sessions';
import { ProviderSelector } from './ProviderSelector';
import { CommandProposalCard } from './CommandProposalCard';
import { ToolCallCard } from './ToolCallCard';

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={match.index} className="font-bold text-text-pri">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={match.index}
          className="bg-[var(--bg)] text-accent px-1.5 py-0.5 rounded text-[12px] font-mono"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(token);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function MessageContent({ content }: { content: string }) {
  const blocks = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-[13px] leading-[1.65] space-y-2.5">
      {blocks.map((block, i) => {
        if (block.startsWith('```')) {
          const newline = block.indexOf('\n');
          const code = newline > 0 ? block.slice(newline + 1, -3) : block.slice(3, -3);
          return (
            <pre
              key={i}
              className="bg-[var(--bg)] rounded-lg p-3 text-[12px] font-mono overflow-x-auto scrollbar-none leading-[1.55] text-text-pri"
            >
              <code>{code}</code>
            </pre>
          );
        }

        const lines = block.split('\n');
        const elements: ReactNode[] = [];
        let listItems: string[] = [];

        const flushList = () => {
          if (listItems.length > 0) {
            elements.push(
              <ul key={`list-${elements.length}`} className="space-y-1 ml-1">
                {listItems.map((item, li) => (
                  <li key={li} className="flex items-start gap-2.5 text-[13px]">
                    <span className="text-accent mt-[8px] text-[5px] shrink-0">●</span>
                    <span className="text-text-pri/90">{parseInline(item)}</span>
                  </li>
                ))}
              </ul>,
            );
            listItems = [];
          }
        };

        for (const [li, rawLine] of lines.entries()) {
          const line = rawLine ?? '';
          const listMatch = line.match(/^\s*[-•*]\s+(.*)/);
          const numberedMatch = line.match(/^\s*\d+\.\s+(.*)/);

          if (listMatch?.[1]) {
            listItems.push(listMatch[1]);
          } else if (numberedMatch?.[1]) {
            listItems.push(numberedMatch[1]);
          } else {
            flushList();
            if (line.trim() === '') {
              if (li > 0 && li < lines.length - 1) {
                elements.push(<div key={`br-${li}`} className="h-1.5" />);
              }
            } else if (line.trim().startsWith('⚠')) {
              elements.push(
                <ErrorBlock key={`w-${li}`} text={line.trim().replace(/^⚠️?\s*/, '')} />,
              );
            } else {
              elements.push(
                <p key={`p-${li}`} className="text-text-pri/90">
                  {parseInline(line)}
                </p>,
              );
            }
          }
        }
        flushList();

        return <div key={i}>{elements}</div>;
      })}
    </div>
  );
}

function ErrorBlock({ text }: { text: string }) {
  const LIMIT = 200;
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > LIMIT && !expanded;
  return (
    <div className="flex flex-col gap-1.5 text-[12px] text-warn bg-warn/10 rounded-lg px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="shrink-0 mt-px">⚠</span>
        <span className="leading-snug break-words">
          {truncated ? text.slice(0, LIMIT) + '…' : text}
        </span>
      </div>
      {text.length > LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-warn/70 hover:text-warn transition-colors self-start ml-5"
        >
          <ChevronDown size={10} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Show less' : 'Show full error'}
        </button>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const toolCalls = useAIStore((s) => s.toolCalls);
  const activeSessionId = useSessionsStore((s) => s.activeId);

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="bg-[var(--elev)] border border-[var(--border)] rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[85%]">
          <p className="text-[13px] text-text-pri">{msg.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5">
      {msg.toolCallIds && msg.toolCallIds.length > 0 && (
        <div className="space-y-2 mb-3">
          {msg.toolCallIds.map((tcId) => {
            const tc = toolCalls[tcId];
            return tc ? <ToolCallCard key={tcId} toolCall={tc} /> : null;
          })}
        </div>
      )}

      <div className="bg-[var(--elev)] border border-[var(--border)] rounded-2xl rounded-tl-md px-4 py-3 max-w-[92%]">
        {msg.streaming && msg.content === '' ? (
          <div className="flex items-center gap-1.5 py-1" aria-label="AI is thinking">
            <span className="w-1.5 h-1.5 rounded-full bg-text-dim animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-text-dim animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-text-dim animate-bounce [animation-delay:300ms]" />
          </div>
        ) : (
          <MessageContent content={msg.content} />
        )}

        {msg.streaming && msg.content !== '' && (
          <span className="inline-block w-0.5 h-4 bg-accent rounded-full animate-pulse ml-0.5 align-middle" aria-hidden="true" />
        )}
      </div>

      {msg.proposals && msg.proposals.length > 0 && (
        <div className="space-y-2 mt-3">
          {msg.proposals.map((pid) => (
            <CommandProposalCard
              key={pid}
              proposalId={pid}
              sessionId={activeSessionId || undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AIChatPanel() {
  const open = useAIStore((s) => s.open);
  const setOpen = useAIStore((s) => s.setOpen);
  const messages = useAIStore((s) => s.messages);
  const streaming = useAIStore((s) => s.streaming);
  const sendMessage = useAIStore((s) => s.sendMessage);
  const stopStreaming = useAIStore((s) => s.stopStreaming);
  const clear = useAIStore((s) => s.clear);
  const activeSessionId = useSessionsStore((s) => s.activeId);
  const activeInstanceId = useSessionsStore((s) => {
    if (!s.activeId) return undefined;
    const session = s.sessions.find((x) => x.id === s.activeId);
    return session?.instanceId;
  });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [open]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || streaming) return;
    setInput('');
    void sendMessage(content, activeInstanceId);
  }, [input, streaming, sendMessage, activeInstanceId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const isEmpty = messages.length === 0;

  return (
    <div
      className="flex flex-col bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl shrink-0 transition-all duration-150 overflow-hidden"
      style={{
        width: open ? 420 : 0,
        minWidth: open ? 420 : 0,
      }}
      aria-label="AI chat panel"
      aria-hidden={!open}
      role="complementary"
    >
      {/* Header */}
      <div className="border-b border-[var(--border)] shrink-0">
        <div className="flex items-center justify-between px-3 h-10">
          <div className="flex items-center gap-2">
            <Bot size={14} className="text-accent shrink-0" aria-hidden="true" />
            <span className="text-[13px] font-semibold text-text-pri">AI Assistant</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="w-7 h-7 rounded-md flex items-center justify-center text-text-dim hover:text-text-pri hover:bg-[var(--elev)] transition-colors"
                aria-label="New conversation"
                title="New conversation"
              >
                <Plus size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-text-dim hover:text-text-pri hover:bg-[var(--elev)] transition-colors"
              aria-label="Close AI chat"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="px-3 pb-2">
          <ProviderSelector />
        </div>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
        aria-live="polite"
      >
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 p-6">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
              <Bot size={22} className="text-accent" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <p className="text-[14px] font-semibold text-text-pri">CloudTerm AI</p>
              <p className="text-[12px] text-text-mut leading-relaxed max-w-[280px]">
                Ask about your fleet, get command suggestions, debug errors, and analyze infrastructure.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center mt-1">
              {['Show running instances', 'Check disk usage', 'Tail system logs'].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setInput(q);
                    setTimeout(() => textareaRef.current?.focus(), 50);
                  }}
                  className="text-[11px] text-text-mut hover:text-accent px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:border-accent/30 hover:bg-accent/5 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Footer: warning + input */}
      <div className="shrink-0 border-t border-[var(--border)]">
        {/* Input area */}
        <div className="px-3 py-2.5">
          <div className="flex items-end gap-2 bg-[var(--elev)] rounded-xl border border-[var(--border)] overflow-hidden focus-within:border-accent/40 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeSessionId
                  ? 'Ask about your instance…'
                  : 'Ask me anything about your fleet…'
              }
              rows={1}
              className="flex-1 bg-transparent resize-none text-[13px] text-text-pri placeholder:text-text-dim px-3.5 py-2.5 focus:outline-none leading-snug"
              style={{ maxHeight: 120, overflowY: 'auto' }}
              aria-label="Chat message input"
              disabled={!open}
            />
            <div className="flex items-center gap-1 p-1.5 shrink-0">
              {streaming ? (
                <button
                  type="button"
                  onClick={stopStreaming}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-danger hover:bg-danger/10 transition-colors"
                  aria-label="Stop generation"
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent text-white disabled:opacity-30 disabled:pointer-events-none hover:opacity-90 transition-all"
                  aria-label="Send message"
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-text-dim mt-1.5 text-center">
            Shift+Enter for newline · Enter to send
          </p>
        </div>

        {/* Safety notice at the very bottom */}
        <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 border-t border-[var(--border)] bg-[var(--bg)]">
          <ShieldAlert size={11} className="text-text-dim shrink-0" aria-hidden="true" />
          <p className="text-[10px] text-text-dim">
            AI never executes commands. You approve every action.
          </p>
        </div>
      </div>
    </div>
  );
}

AIChatPanel.displayName = 'AIChatPanel';
