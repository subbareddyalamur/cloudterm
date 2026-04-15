import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { streamAIChat } from "@/lib/sse";
import { cn } from "@/lib/utils";
import {
  useAiChatStore,
  type DisplayMessage,
  type PendingApproval,
} from "@/stores/useAiChatStore";

// ---------------------------------------------------------------------------
// Tool call collapsible
// ---------------------------------------------------------------------------

function ToolCallBlock({ msg }: { msg: DisplayMessage }) {
  const [open, setOpen] = useState(false);
  if (!msg.toolCall) return null;

  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(msg.toolCall.arguments || "{}");
  } catch {
    // ignore
  }

  return (
    <div className="rounded border border-border bg-muted/30 text-xs">
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/50"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <span className="font-medium">{msg.toolCall.name}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Command approval box
// ---------------------------------------------------------------------------

function ApprovalBox({
  approval,
  onApprove,
  onReject,
}: {
  approval: PendingApproval;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div
      className={cn(
        "mx-2 rounded-md border p-3 text-xs",
        approval.destructive
          ? "border-destructive/50 bg-destructive/10"
          : "border-border bg-muted/30",
      )}
    >
      <div className="mb-1 font-medium">Command Approval</div>
      <pre className="mb-1 overflow-x-auto rounded bg-background px-2 py-1 font-mono text-[11px]">
        {approval.command}
      </pre>
      {approval.instanceId && (
        <div className="mb-1 text-muted-foreground">
          Target: {approval.instanceId}
        </div>
      )}
      {approval.destructive && (
        <div className="mb-2 flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="size-3.5" />
          <span className="font-medium">
            BLOCKED: This command matches a destructive pattern and cannot be
            executed.
          </span>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="xs"
          onClick={onApprove}
          disabled={approval.destructive}
          className="gap-1"
        >
          <Check className="size-3" />
          Approve
        </Button>
        <Button size="xs" variant="outline" onClick={onReject} className="gap-1">
          <X className="size-3" />
          Reject
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ msg }: { msg: DisplayMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.role === "tool") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <pre className="overflow-x-auto whitespace-pre-wrap text-[11px]">
            {msg.content}
          </pre>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {msg.toolCall ? (
          <ToolCallBlock msg={msg} />
        ) : (
          <div className="prose prose-invert prose-sm max-w-none rounded-lg bg-muted/30 px-3 py-2 text-xs [&_code]:rounded [&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-background [&_pre]:p-2 [&_pre]:text-[11px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content || (msg.isStreaming ? "…" : "")}
            </ReactMarkdown>
            {msg.isStreaming && (
              <span className="inline-block size-2 animate-pulse rounded-full bg-foreground/50" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground">
      <Loader2 className="size-3 animate-spin" />
      <span>Thinking…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider badge
// ---------------------------------------------------------------------------

function ProviderBadge() {
  // Provider is determined server-side; we just show a generic indicator
  return (
    <Badge variant="outline" className="text-[10px]">
      AI
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main AiChat component
// ---------------------------------------------------------------------------

export function AiChat() {
  const messages = useAiChatStore((s) => s.messages);
  const conversationMessages = useAiChatStore((s) => s.conversationMessages);
  const isStreaming = useAiChatStore((s) => s.isStreaming);
  const pendingApproval = useAiChatStore((s) => s.pendingApproval);

  const addUserMessage = useAiChatStore((s) => s.addUserMessage);
  const startAssistantMessage = useAiChatStore((s) => s.startAssistantMessage);
  const appendToAssistant = useAiChatStore((s) => s.appendToAssistant);
  const finalizeAssistant = useAiChatStore((s) => s.finalizeAssistant);
  const addToolCallMessage = useAiChatStore((s) => s.addToolCallMessage);
  const addToolResultMessage = useAiChatStore((s) => s.addToolResultMessage);
  const addErrorMessage = useAiChatStore((s) => s.addErrorMessage);
  const syncConversation = useAiChatStore((s) => s.syncConversation);
  const setPendingApproval = useAiChatStore((s) => s.setPendingApproval);
  const setStreaming = useAiChatStore((s) => s.setStreaming);
  const clearConversation = useAiChatStore((s) => s.clearConversation);

  const [input, setInput] = useState("");
  const [showTyping, setShowTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showTyping, pendingApproval]);

  // Stream chat from the backend
  const doStream = useCallback(
    (msgs: unknown[]) => {
      setStreaming(true);
      setShowTyping(true);
      let msgId: string | null = null;

      abortRef.current = streamAIChat(
        { messages: msgs, active_instance_id: "" },
        {
          onText(text) {
            if (!msgId) {
              setShowTyping(false);
              msgId = startAssistantMessage();
            }
            appendToAssistant(msgId!, text);
          },
          onToolCall(toolCall) {
            setShowTyping(false);
            if (msgId) {
              finalizeAssistant(msgId);
              msgId = null;
            }
            addToolCallMessage(toolCall);
          },
          onDone(serverMessages) {
            setShowTyping(false);
            if (msgId) finalizeAssistant(msgId);
            if (serverMessages) syncConversation(serverMessages);
            setStreaming(false);
          },
          onError(error) {
            setShowTyping(false);
            if (msgId) finalizeAssistant(msgId);
            addErrorMessage(error);
            setStreaming(false);
          },
        },
      );
    },
    [
      setStreaming,
      startAssistantMessage,
      appendToAssistant,
      finalizeAssistant,
      addToolCallMessage,
      addErrorMessage,
      syncConversation,
    ],
  );

  // Send a user message
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Cancel pending approval if user sends new message
    if (pendingApproval) setPendingApproval(null);

    addUserMessage(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    // conversationMessages already updated by addUserMessage; need +1
    doStream([...conversationMessages, { role: "user", content: text }]);
  }, [
    input,
    isStreaming,
    pendingApproval,
    conversationMessages,
    addUserMessage,
    setPendingApproval,
    doStream,
  ]);

  // Approve command
  const handleApprove = useCallback(() => {
    if (!pendingApproval) return;
    const { toolCall } = pendingApproval;
    setPendingApproval(null);
    addToolResultMessage(toolCall.id, "(Approved — executing on terminal)");
    // Continue the conversation so the AI knows the tool was executed
    doStream([
      ...conversationMessages,
      { role: "tool", content: "(Approved — executing on terminal)", tool_call_id: toolCall.id },
    ]);
  }, [pendingApproval, conversationMessages, setPendingApproval, addToolResultMessage, doStream]);

  // Reject command
  const handleReject = useCallback(() => {
    if (!pendingApproval) return;
    const { toolCall } = pendingApproval;
    setPendingApproval(null);
    addToolResultMessage(toolCall.id, "Command rejected by user. Do not retry this command.");
    doStream([
      ...conversationMessages,
      {
        role: "tool",
        content: "Command rejected by user. Do not retry this command.",
        tool_call_id: toolCall.id,
      },
    ]);
  }, [pendingApproval, conversationMessages, setPendingApproval, addToolResultMessage, doStream]);

  // Auto-grow textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
  };

  // Enter to send, Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header actions */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <ProviderBadge />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={clearConversation}
          aria-label="Clear conversation"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-4">
          {messages.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Ask the AI assistant anything about your infrastructure.
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {showTyping && <TypingIndicator />}
          {pendingApproval && (
            <ApprovalBox
              approval={pendingApproval}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Type a message… (Shift+Enter for newline)"
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
          <Button
            size="icon-xs"
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            aria-label="Send message"
          >
            <Send className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
