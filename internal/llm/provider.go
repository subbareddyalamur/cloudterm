package llm

import (
	"context"
	"encoding/json"
)

// Role represents a message participant.
type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool"
)

// Message is a single turn in the conversation.
type Message struct {
	Role       Role        `json:"role"`
	Content    string      `json:"content,omitempty"`
	ToolCalls  []ToolCall  `json:"tool_calls,omitempty"`  // assistant → these tools were called
	ToolCallID string      `json:"tool_call_id,omitempty"` // tool → result for this call
}

// ToolCall describes one tool invocation requested by the model.
type ToolCall struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

// StreamChunk is one piece of a streaming response.
type StreamChunk struct {
	Type     string    `json:"type"` // "text", "tool_call", "done", "error"
	Text     string    `json:"text,omitempty"`
	ToolCall *ToolCall `json:"tool_call,omitempty"`
	Error    string    `json:"error,omitempty"`
}

// ToolDef describes a tool the model can call.
type ToolDef struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"` // JSON Schema object
}

// Provider streams LLM responses with tool-use support.
type Provider interface {
	ChatStream(ctx context.Context, system string, messages []Message, tools []ToolDef, maxTokens int) (<-chan StreamChunk, error)
}
