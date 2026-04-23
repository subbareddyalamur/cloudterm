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

// AnthropicProvider streams via the Anthropic Messages API.
type AnthropicProvider struct {
	apiKey      string
	model       string
	temperature float64
}

func NewAnthropicProvider(apiKey, model string, temperature float64) (*AnthropicProvider, error) {
	if model == "" {
		return nil, fmt.Errorf("anthropic: model is required — configure it in Settings > AI Agent")
	}
	return &AnthropicProvider{apiKey: apiKey, model: model, temperature: temperature}, nil
}

func (a *AnthropicProvider) ChatStream(ctx context.Context, system string, messages []Message, tools []ToolDef, maxTokens int) (<-chan StreamChunk, error) {
	// Ensure max_tokens is at least 1
	if maxTokens <= 0 {
		maxTokens = 4096
	}

	// Build request body
	body := map[string]interface{}{
		"model":      a.model,
		"max_tokens": maxTokens,
		"stream":     true,
		"system":     system,
		"messages":   convertMessagesAnthropic(messages),
	}
	if a.temperature > 0 {
		body["temperature"] = a.temperature
	}
	if len(tools) > 0 {
		body["tools"] = convertToolsAnthropic(tools)
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("anthropic: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", a.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("anthropic: request failed: %w", err)
	}
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("anthropic: HTTP %d: %s", resp.StatusCode, string(b))
	}

	ch := make(chan StreamChunk, 32)
	go a.readStream(resp.Body, ch)
	return ch, nil
}

func (a *AnthropicProvider) readStream(body io.ReadCloser, ch chan<- StreamChunk) {
	defer close(ch)
	defer body.Close()

	scanner := bufio.NewScanner(body)
	var currentToolID, currentToolName, toolInputBuf string

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var event struct {
			Type  string `json:"type"`
			Index int    `json:"index"`
			Delta struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				PartialJSON string `json:"partial_json"`
			} `json:"delta"`
			ContentBlock struct {
				Type string `json:"type"`
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"content_block"`
		}
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event.Type {
		case "content_block_start":
			if event.ContentBlock.Type == "tool_use" {
				currentToolID = event.ContentBlock.ID
				currentToolName = event.ContentBlock.Name
				toolInputBuf = ""
			}
		case "content_block_delta":
			if event.Delta.Type == "text_delta" {
				ch <- StreamChunk{Type: "text", Text: event.Delta.Text}
			} else if event.Delta.Type == "input_json_delta" {
				toolInputBuf += event.Delta.PartialJSON
			}
		case "content_block_stop":
			if currentToolID != "" {
				ch <- StreamChunk{
					Type: "tool_call",
					ToolCall: &ToolCall{
						ID:        currentToolID,
						Name:      currentToolName,
						Arguments: json.RawMessage(toolInputBuf),
					},
				}
				currentToolID = ""
				currentToolName = ""
			}
		case "message_stop":
			ch <- StreamChunk{Type: "done"}
		}
	}
}

func convertMessagesAnthropic(msgs []Message) []map[string]interface{} {
	var out []map[string]interface{}
	for _, m := range msgs {
		msg := map[string]interface{}{"role": string(m.Role)}
		if m.Role == RoleTool {
			msg["role"] = "user"
			msg["content"] = []map[string]interface{}{
				{
					"type":        "tool_result",
					"tool_use_id": m.ToolCallID,
					"content":     m.Content,
				},
			}
		} else if m.Role == RoleAssistant && len(m.ToolCalls) > 0 {
			content := []map[string]interface{}{}
			if m.Content != "" {
				content = append(content, map[string]interface{}{"type": "text", "text": m.Content})
			}
			for _, tc := range m.ToolCalls {
				var input interface{}
				json.Unmarshal(tc.Arguments, &input)
				content = append(content, map[string]interface{}{
					"type":  "tool_use",
					"id":    tc.ID,
					"name":  tc.Name,
					"input": input,
				})
			}
			msg["content"] = content
		} else {
			msg["content"] = m.Content
		}
		out = append(out, msg)
	}
	return out
}

func convertToolsAnthropic(tools []ToolDef) []map[string]interface{} {
	var out []map[string]interface{}
	for _, t := range tools {
		var schema interface{}
		json.Unmarshal(t.Parameters, &schema)
		out = append(out, map[string]interface{}{
			"name":         t.Name,
			"description":  t.Description,
			"input_schema": schema,
		})
	}
	return out
}
