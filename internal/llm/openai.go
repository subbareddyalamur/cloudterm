package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// OpenAIProvider streams via the OpenAI Chat Completions API.
type OpenAIProvider struct {
	apiKey      string
	model       string
	temperature float64
}

func NewOpenAIProvider(apiKey, model string, temperature float64) (*OpenAIProvider, error) {
	if model == "" {
		return nil, fmt.Errorf("openai: model is required — configure it in Settings > AI Agent")
	}
	return &OpenAIProvider{apiKey: apiKey, model: model, temperature: temperature}, nil
}

func (o *OpenAIProvider) ChatStream(ctx context.Context, system string, messages []Message, tools []ToolDef, maxTokens int) (<-chan StreamChunk, error) {
	oaiMsgs := []map[string]interface{}{
		{"role": "system", "content": system},
	}
	for _, m := range messages {
		oaiMsgs = append(oaiMsgs, convertMessageOpenAI(m))
	}

	body := map[string]interface{}{
		"model":      o.model,
		"max_tokens": maxTokens,
		"stream":     true,
		"messages":   oaiMsgs,
	}
	if o.temperature > 0 {
		body["temperature"] = o.temperature
	}
	if len(tools) > 0 {
		body["tools"] = convertToolsOpenAI(tools)
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("openai: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+o.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openai: request failed: %w", err)
	}
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("openai: HTTP %d: %s", resp.StatusCode, string(b))
	}

	ch := make(chan StreamChunk, 32)
	go o.readStream(resp.Body, ch)
	return ch, nil
}

func (o *OpenAIProvider) readStream(body io.ReadCloser, ch chan<- StreamChunk) {
	defer close(ch)
	defer body.Close()

	scanner := bufio.NewScanner(body)
	// Track tool calls across deltas (OpenAI sends tool call data incrementally)
	toolCalls := map[int]*ToolCall{}

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			ch <- StreamChunk{Type: "done"}
			return
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string `json:"content"`
					ToolCalls []struct {
						Index    int    `json:"index"`
						ID       string `json:"id"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason *string `json:"finish_reason"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}

		delta := chunk.Choices[0].Delta

		if delta.Content != "" {
			ch <- StreamChunk{Type: "text", Text: delta.Content}
		}

		for _, tc := range delta.ToolCalls {
			if _, ok := toolCalls[tc.Index]; !ok {
				toolCalls[tc.Index] = &ToolCall{ID: tc.ID, Name: tc.Function.Name}
			}
			existing := toolCalls[tc.Index]
			if tc.ID != "" {
				existing.ID = tc.ID
			}
			if tc.Function.Name != "" {
				existing.Name = tc.Function.Name
			}
			existing.Arguments = append(existing.Arguments, []byte(tc.Function.Arguments)...)
		}

		if fr := chunk.Choices[0].FinishReason; fr != nil && *fr == "tool_calls" {
			for _, tc := range toolCalls {
				ch <- StreamChunk{Type: "tool_call", ToolCall: tc}
			}
			toolCalls = map[int]*ToolCall{}
		}
	}
}

func convertMessageOpenAI(m Message) map[string]interface{} {
	msg := map[string]interface{}{"role": string(m.Role)}
	if m.Role == RoleTool {
		msg["role"] = "tool"
		msg["content"] = m.Content
		msg["tool_call_id"] = m.ToolCallID
	} else if m.Role == RoleAssistant && len(m.ToolCalls) > 0 {
		if m.Content != "" {
			msg["content"] = m.Content
		}
		var tcs []map[string]interface{}
		for _, tc := range m.ToolCalls {
			tcs = append(tcs, map[string]interface{}{
				"id":   tc.ID,
				"type": "function",
				"function": map[string]interface{}{
					"name":      tc.Name,
					"arguments": string(tc.Arguments),
				},
			})
		}
		msg["tool_calls"] = tcs
	} else {
		msg["content"] = m.Content
	}
	return msg
}

func convertToolsOpenAI(tools []ToolDef) []map[string]interface{} {
	var out []map[string]interface{}
	for _, t := range tools {
		var params interface{}
		json.Unmarshal(t.Parameters, &params)
		out = append(out, map[string]interface{}{
			"type": "function",
			"function": map[string]interface{}{
				"name":        t.Name,
				"description": t.Description,
				"parameters":  params,
			},
		})
	}
	return out
}
