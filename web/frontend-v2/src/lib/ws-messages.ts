import { z } from 'zod';

export const StartSessionMsg = z.object({
  type: z.literal('start_session'),
  payload: z.object({
    instance_id: z.string(),
    instance_name: z.string(),
    session_id: z.string(),
    aws_profile: z.string().optional(),
    aws_region: z.string().optional(),
  }),
});

export const TerminalInputMsg = z.object({
  type: z.literal('terminal_input'),
  payload: z.object({
    session_id: z.string(),
    input: z.string(),
  }),
});

export const TerminalResizeMsg = z.object({
  type: z.literal('terminal_resize'),
  payload: z.object({
    session_id: z.string(),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
});

export const CloseSessionMsg = z.object({
  type: z.literal('close_session'),
  payload: z.object({
    session_id: z.string(),
  }),
});

export const TerminalInterruptMsg = z.object({
  type: z.literal('terminal_interrupt'),
  payload: z.object({ session_id: z.string() }),
});

export const KeepaliveMsg = z.object({ type: z.literal('keepalive') });

export const TerminalOutputPayload = z.object({
  instance_id: z.string(),
  session_id: z.string(),
  output: z.string(),
});

export const SessionEventPayload = z.object({
  instance_id: z.string().optional(),
  session_id: z.string(),
  error: z.string().optional(),
});

export const SuggestPayload = z.object({
  session_id: z.string(),
  command: z.string(),
  explanation: z.string().optional(),
  confidence: z.number().optional(),
});

export const SuggestResponsePayload = z.object({
  session_id: z.string(),
  suggestions: z.array(z.object({
    text: z.string(),
    score: z.number(),
    source: z.string(),
  })),
});

export const LogInsightPayload = z.object({
  session_id: z.string(),
  error_summary: z.string(),
  suggested_fix: z.string(),
  confidence: z.number().optional(),
});

export const IncomingWSMsg = z.discriminatedUnion('type', [
  z.object({ type: z.literal('terminal_output'), payload: TerminalOutputPayload }),
  z.object({ type: z.literal('session_error'), payload: SessionEventPayload }),
  z.object({ type: z.literal('session_closed'), payload: SessionEventPayload }),
  z.object({ type: z.literal('suggest'), payload: SuggestPayload }),
  z.object({ type: z.literal('suggest_response'), payload: SuggestResponsePayload }),
  z.object({ type: z.literal('log_insight'), payload: LogInsightPayload }),
]);

export type IncomingWSMessage = z.infer<typeof IncomingWSMsg>;
export type TerminalOutputMessage = z.infer<typeof TerminalOutputPayload>;
export type SuggestResponseMessage = z.infer<typeof SuggestResponsePayload>;
export type LogInsightMessage = z.infer<typeof LogInsightPayload>;
