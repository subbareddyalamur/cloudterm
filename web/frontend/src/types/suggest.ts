/** Client → server: request command suggestions. */
export interface SuggestRequestPayload {
  session_id: string;
  line: string;
  env: string;
}

/** Server → client: command suggestions. */
export interface SuggestResponsePayload {
  session_id: string;
  suggestions: SuggestItem[];
}

export interface SuggestItem {
  text: string;
  score: number;
  source: string;
}

/** Server → client: AI-detected log insight. */
export interface LogInsightPayload {
  session_id: string;
  error_summary: string;
  suggested_fix: string;
  confidence: number;
}

/** Client → server: toggle suggestion engine. */
export interface SuggestTogglePayload {
  session_id: string;
  enabled: boolean;
}
