import type { AIStreamChunk } from "@/types";

// ---------------------------------------------------------------------------
// Generic SSE-style streaming over fetch
// ---------------------------------------------------------------------------

export interface StreamHandlers<T = unknown> {
  /** Called for each parsed event/chunk. */
  onMessage: (data: T) => void;
  /** Called when the stream ends normally. */
  onDone?: () => void;
  /** Called on network or parse errors. */
  onError?: (err: Error) => void;
}

/**
 * Subscribe to a server endpoint that streams SSE-style `data: {...}\n` lines
 * over a regular fetch response body (not EventSource). This matches the
 * pattern used by the Go backend for AI chat.
 *
 * Returns an {@link AbortController} so the caller can cancel the stream.
 */
export function subscribe<T = unknown>(
  url: string,
  init: RequestInit,
  handlers: StreamHandlers<T>,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const resp = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
          const body = await resp.json();
          if (body.error) msg = body.error;
        } catch {
          // use default
        }
        handlers.onError?.(new Error(msg));
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // SSE format: lines prefixed with "data: "
          const payload = trimmed.startsWith("data: ")
            ? trimmed.slice(6)
            : trimmed;

          try {
            handlers.onMessage(JSON.parse(payload) as T);
          } catch {
            // skip unparseable lines
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        const payload = buffer.trim().startsWith("data: ")
          ? buffer.trim().slice(6)
          : buffer.trim();
        try {
          handlers.onMessage(JSON.parse(payload) as T);
        } catch {
          // skip
        }
      }

      handlers.onDone?.();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        handlers.onDone?.();
        return;
      }
      handlers.onError?.(err as Error);
    }
  })();

  return controller;
}

// ---------------------------------------------------------------------------
// AI chat streaming convenience wrapper
// ---------------------------------------------------------------------------

export interface AIChatStreamHandlers {
  onText?: (text: string) => void;
  onToolCall?: (toolCall: NonNullable<AIStreamChunk["tool_call"]>) => void;
  onDone?: (messages?: AIStreamChunk["messages"]) => void;
  onError?: (error: string) => void;
}

/**
 * Stream an AI chat response, dispatching typed events to handlers.
 * Returns an AbortController to cancel the stream.
 */
export function streamAIChat(
  body: { messages: unknown[]; active_instance_id?: string },
  handlers: AIChatStreamHandlers,
): AbortController {
  return subscribe<AIStreamChunk>(
    "/ai-agent/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    {
      onMessage(chunk) {
        switch (chunk.type) {
          case "text":
            if (chunk.text) handlers.onText?.(chunk.text);
            break;
          case "tool_call":
            if (chunk.tool_call) handlers.onToolCall?.(chunk.tool_call);
            break;
          case "done":
            handlers.onDone?.(chunk.messages);
            break;
          case "error":
            handlers.onError?.(chunk.error ?? "Unknown error");
            break;
        }
      },
      onDone() {
        // Stream ended without a "done" chunk — treat as normal close.
      },
      onError(err) {
        handlers.onError?.(err.message);
      },
    },
  );
}
