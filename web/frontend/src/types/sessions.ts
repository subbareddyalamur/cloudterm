/** Generic WebSocket message envelope. */
export interface WSMessage<T = unknown> {
  type: string;
  payload?: T;
}

// --- Client → Server messages ---

export interface StartSessionPayload {
  instance_id: string;
  session_id: string;
}

export interface TerminalInputPayload {
  session_id: string;
  input: string;
}

export interface TerminalResizePayload {
  session_id: string;
  rows: number;
  cols: number;
}

// --- Server → Client messages ---

export interface TerminalOutputPayload {
  instance_id: string;
  session_id: string;
  output: string;
}

export interface SessionEventPayload {
  instance_id: string;
  session_id: string;
  error?: string;
  recording?: boolean;
}

// --- WebSocket message type discriminators ---

export type WSMessageType =
  | "start_session"
  | "terminal_input"
  | "resize"
  | "terminal_output"
  | "session_started"
  | "session_error"
  | "session_closed"
  | "scan_status"
  | "suggest_request"
  | "suggest_response"
  | "suggest_toggle"
  | "log_insight";

// --- Broadcast command types ---

export interface BroadcastTarget {
  instance_id: string;
  name: string;
  profile: string;
  region: string;
  platform: string;
}

export interface BroadcastResult {
  instance_id: string;
  name: string;
  output: string;
  error?: string;
  success: boolean;
}
