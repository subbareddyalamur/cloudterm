/** Role in an AI chat conversation. */
export type AIRole = "user" | "assistant" | "tool";

/** A single turn in the AI conversation. */
export interface AIMessage {
  role: AIRole;
  content?: string;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
}

/** Tool invocation requested by the model. */
export interface AIToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

/** SSE chunk streamed from POST /ai-agent/chat. */
export interface AIStreamChunk {
  type: "text" | "tool_call" | "done" | "error";
  text?: string;
  tool_call?: AIToolCall;
  error?: string;
  messages?: AIMessage[];
}

/** Instance summary provided to the AI agent context. */
export interface AIInstanceSummary {
  instance_id: string;
  name: string;
  platform: string;
  state: string;
  private_ip: string;
  public_ip: string;
  region: string;
}
