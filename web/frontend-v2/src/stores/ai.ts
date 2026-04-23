import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { nanoid } from 'nanoid';

export type Provider = 'bedrock' | 'anthropic' | 'openai' | 'gemini' | 'ollama';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  timestamp: number;
  proposals?: string[];
  toolCallIds?: string[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface CommandProposal {
  id: string;
  command: string;
  explanation?: string;
  destructive?: boolean;
  approved?: boolean;
  rejected?: boolean;
  typedAt?: number;
}

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-[rRf]{1,3}\b/i,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{.*:\|.*&.*\}/,
  /\bchmod\s+(-R\s+)?0+\b/i,
  /\bmkfs\b/i,
  /\bformat\b.*\/dev\//i,
  /\b>.*\/dev\/(sda|hda|nvme)/i,
];

export function isDestructive(cmd: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((p) => p.test(cmd));
}

interface AIState {
  messages: Message[];
  toolCalls: Record<string, ToolCall>;
  proposals: Record<string, CommandProposal>;
  streaming: boolean;
  open: boolean;

  setOpen: (open: boolean) => void;
  sendMessage: (content: string, sessionId?: string) => Promise<void>;
  stopStreaming: () => void;
  appendToken: (messageId: string, token: string) => void;
  finalizeMessage: (messageId: string) => void;
  addToolCall: (tc: ToolCall) => void;
  resolveToolCall: (id: string, result: unknown) => void;
  addProposal: (messageId: string, proposal: Omit<CommandProposal, 'id'>) => string;
  approveProposal: (id: string) => void;
  rejectProposal: (id: string) => void;
  clear: () => void;
}

let pendingAbort: AbortController | null = null;

export const useAIStore = create<AIState>()(
  devtools(
    (set, get) => ({
      messages: [],
      toolCalls: {},
      proposals: {},
      streaming: false,
      open: false,

      setOpen: (open) => set({ open }),

      stopStreaming: () => {
        if (pendingAbort) {
          pendingAbort.abort();
          pendingAbort = null;
        }
      },

      sendMessage: async (content, sessionId) => {
        pendingAbort?.abort();
        pendingAbort = new AbortController();
        const ctrl = pendingAbort;

        const userMsgId = nanoid();
        const assistantMsgId = nanoid();
        const userMsg: Message = {
          id: userMsgId,
          role: 'user',
          content,
          timestamp: Date.now(),
        };
        const assistantMsg: Message = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          streaming: true,
          timestamp: Date.now(),
          proposals: [],
          toolCallIds: [],
        };

        set((s) => ({
          messages: [...s.messages, userMsg, assistantMsg],
          streaming: true,
        }));

        const conversationMessages = get()
          .messages.filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.streaming))
          .map((m) => ({ role: m.role, content: m.content }));

        try {
          const res = await fetch('/ai-agent/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: conversationMessages,
              active_instance_id: sessionId ?? '',
            }),
            signal: ctrl.signal,
          });

          if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            let errMsg = `HTTP ${res.status}`;
            try { errMsg = (JSON.parse(errBody) as { error?: string }).error ?? errMsg; } catch { /* noop */ }
            throw new Error(errMsg);
          }

          if (!res.body) throw new Error('No response body');

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              const raw = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
              if (!raw || raw === '[DONE]') continue;

              let evt: Record<string, unknown>;
              try {
                evt = JSON.parse(raw) as Record<string, unknown>;
              } catch {
                continue;
              }

              const type = evt['type'] as string | undefined;

              if (type === 'assistant_text' || type === 'text') {
                const token = (evt['content'] ?? evt['text'] ?? '') as string;
                get().appendToken(assistantMsgId, token);
              } else if (type === 'tool_call') {
                const raw_tc = (evt['tool_call'] as Record<string, unknown> | undefined) ?? evt;
                const tcName = (raw_tc['name'] as string | undefined) ?? 'unknown';
                const tcArgs = (raw_tc['arguments'] as Record<string, unknown> | undefined) ?? {};

                if (tcName === 'run_command') {
                  // Route run_command to proposal card — never execute silently
                  const cmd = (tcArgs['command'] as string | undefined) ?? '';
                  const pid = get().addProposal(assistantMsgId, {
                    command: cmd,
                    destructive: isDestructive(cmd),
                  });
                  set((s) => ({
                    messages: s.messages.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, proposals: [...(m.proposals ?? []), pid] }
                        : m,
                    ),
                  }));
                } else {
                  const tc: ToolCall = {
                    id: (raw_tc['id'] as string | undefined) ?? nanoid(),
                    name: tcName,
                    arguments: tcArgs,
                  };
                  get().addToolCall(tc);
                  set((s) => ({
                    messages: s.messages.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, toolCallIds: [...(m.toolCallIds ?? []), tc.id] }
                        : m,
                    ),
                  }));
                }
              } else if (type === 'tool_result') {
                const tcId = (evt['tool_call_id'] as string | undefined) ?? '';
                get().resolveToolCall(tcId, evt['result']);
              } else if (type === 'command_proposal') {
                const cmd = (evt['command'] as string | undefined) ?? '';
                const explanation = (evt['explanation'] as string | undefined) || undefined;
                const pid = get().addProposal(assistantMsgId, {
                  command: cmd,
                  ...(explanation ? { explanation } : {}),
                  destructive: isDestructive(cmd),
                });
                set((s) => ({
                  messages: s.messages.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, proposals: [...(m.proposals ?? []), pid] }
                      : m,
                  ),
                }));
              } else if (type === 'done' || type === 'end') {
                break;
              } else if (type === 'error') {
                const errMsg = (evt['error'] as string | undefined) ?? (evt['message'] as string | undefined) ?? 'AI error';
                get().appendToken(assistantMsgId, `\n\n⚠️ ${errMsg}`);
              }
            }
          }
        } catch (e) {
          if ((e as Error).name !== 'AbortError') {
            get().appendToken(
              assistantMsgId,
              `\n\n⚠️ Connection error: ${(e as Error).message}`,
            );
          }
        } finally {
          get().finalizeMessage(assistantMsgId);
          set({ streaming: false });
          pendingAbort = null;
        }
      },

      appendToken: (messageId, token) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === messageId ? { ...m, content: m.content + token } : m,
          ),
        })),

      finalizeMessage: (messageId) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === messageId ? { ...m, streaming: false } : m,
          ),
        })),

      addToolCall: (tc) =>
        set((s) => ({ toolCalls: { ...s.toolCalls, [tc.id]: tc } })),

      resolveToolCall: (id, result) =>
        set((s) => {
          const tc = s.toolCalls[id];
          if (!tc) return s;
          return { toolCalls: { ...s.toolCalls, [id]: { ...tc, result } } };
        }),

      addProposal: (messageId, proposal) => {
        const id = nanoid();
        const full: CommandProposal = { ...proposal, id };
        set((s) => ({ proposals: { ...s.proposals, [id]: full } }));
        void messageId;
        return id;
      },

      approveProposal: (id) =>
        set((s) => {
          const p = s.proposals[id];
          if (!p) return s;
          return {
            proposals: {
              ...s.proposals,
              [id]: { ...p, approved: true, typedAt: Date.now() },
            },
          };
        }),

      rejectProposal: (id) =>
        set((s) => {
          const p = s.proposals[id];
          if (!p) return s;
          return {
            proposals: { ...s.proposals, [id]: { ...p, rejected: true } },
          };
        }),

      clear: () =>
        set({ messages: [], toolCalls: {}, proposals: {}, streaming: false }),
    }),
    { name: 'ai' },
  ),
);
