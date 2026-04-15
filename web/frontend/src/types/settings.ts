/** Suggest engine status from GET /suggest-status. */
export interface SuggestStatus {
  enabled: boolean;
  model?: string;
  cache_size?: number;
}
