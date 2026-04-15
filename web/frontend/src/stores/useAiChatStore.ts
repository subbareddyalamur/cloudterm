import { create } from "zustand";
import type { AIMessage, AIToolCall } from "@/types";

// ---------------------------------------------------------------------------
// Destructive command detection (mirrors internal/llm/safety.go)
// ---------------------------------------------------------------------------

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-z]*f|-[a-z]*r|--force|--recursive)\b/i,
  /\brm\s+-rf\b/i,
  /\bmkfs\b/i,
  /\bdd\s+.*of=\/dev\//i,
  /:\(\)\{\s*:\|:&\s*\};:/,
  /^\s*shutdown\b/i,
  /^\s*reboot\b/i,
  /^\s*init\s+[06]\b/i,
  /\bsystemctl\s+(stop|disable|mask)\b/i,
  /\biptables\s+-F\b/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bkill\s+-9\s+-1\b/i,
  />\s*\/dev\/sd[a-z]/i,
  /^\s*format\b.*\b[cC]:/i,
  /^\s*del\s+\/[sS]\b/i,
  /\bStop-Computer\b/i,
  /\bRestart-Computer\b/i,
  /\bdrop\s+database\b/i,
  /\btruncate\s+table\b/i,
];

export function isDestructive(cmd: string): boolean {
  const segments = cmd.split(/\s*\|\s*/);
  return segments.some((seg) =>
    DESTRUCTIVE_PATTERNS.some((p) => p.test(seg.trim())),
  );
}

// ---------------------------------------------------------------------------
// Display message type — wraps AIMessage with UI-only metadata
// ---------------------------------------------------------------------------

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCall?: AIToolCall;
  toolResult?: string;
  isStreaming?: boolean;
}

// ---------------------------------------------------------------------------
// Pending approval state
// ---------------------------------------------------------------------------

export interface PendingApproval {
  toolCall: AIToolCall;
  command: string;
  instanceId: string;
  destructive: boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AiChatState {
  messages: DisplayMessage[];
  conversationMessages: AIMessage[];
  isStreaming: boolean;
  pendingApproval: PendingApproval | null;
}

interface AiChatActions {
  addUserMessage: (text: string) => void;
  startAssistantMessage: () => string;
  appendToAssistant: (id: string, text: string) => void;
  finalizeAssistant: (id: string) => void;
  addToolCallMessage: (toolCall: AIToolCall) => void;
  addToolResultMessage: (toolCallId: string, result: string) => void;
  addErrorMessage: (error: string) => void;
  syncConversation: (msgs: AIMessage[]) => void;
  setPendingApproval: (approval: PendingApproval | null) => void;
  setStreaming: (v: boolean) => void;
  clearConversation: () => void;
}

let nextId = 0;
function genId(): string {
  return `msg-${++nextId}-${Date.now()}`;
}

export const useAiChatStore = create<AiChatState & AiChatActions>()((set) => ({
  messages: [],
  conversationMessages: [],
  isStreaming: false,
  pendingApproval: null,

  addUserMessage: (text) =>
    set((s) => ({
      messages: [...s.messages, { id: genId(), role: "user", content: text }],
      conversationMessages: [
        ...s.conversationMessages,
        { role: "user", content: text },
      ],
    })),

  startAssistantMessage: () => {
    const id = genId();
    set((s) => ({
      messages: [
        ...s.messages,
        { id, role: "assistant", content: "", isStreaming: true },
      ],
    }));
    return id;
  },

  appendToAssistant: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + text } : m,
      ),
    })),

  finalizeAssistant: (id) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, isStreaming: false } : m,
      ),
    })),

  addToolCallMessage: (toolCall) => {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(toolCall.arguments || "{}"); } catch { /* fallback */ }
    const cmd = String(args.command ?? "");
    const instId = String(args.instance_id ?? "");
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: genId(),
          role: "assistant",
          content: `Tool: ${toolCall.name}`,
          toolCall,
        },
      ],
      pendingApproval:
        toolCall.name === "run_command"
          ? {
              toolCall,
              command: cmd,
              instanceId: instId,
              destructive: isDestructive(cmd),
            }
          : null,
    }));
  },

  addToolResultMessage: (toolCallId, result) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: genId(), role: "tool", content: result, toolResult: result },
      ],
      conversationMessages: [
        ...s.conversationMessages,
        { role: "tool", content: result, tool_call_id: toolCallId },
      ],
    })),

  addErrorMessage: (error) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: genId(), role: "assistant", content: `Error: ${error}` },
      ],
    })),

  syncConversation: (msgs) => set({ conversationMessages: msgs }),

  setPendingApproval: (approval) => set({ pendingApproval: approval }),

  setStreaming: (v) => set({ isStreaming: v }),

  clearConversation: () =>
    set({
      messages: [],
      conversationMessages: [],
      pendingApproval: null,
      isStreaming: false,
    }),
}));
