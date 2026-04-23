package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// OllamaProvider streams via the Ollama chat API.
type OllamaProvider struct {
	baseURL     string
	model       string
	temperature float64
}

func NewOllamaProvider(baseURL, model string, temperature float64) (*OllamaProvider, error) {
	if model == "" {
		return nil, fmt.Errorf("ollama: model is required — configure it in Settings > AI Agent")
	}
	return &OllamaProvider{baseURL: baseURL, model: model, temperature: temperature}, nil
}

func (o *OllamaProvider) ChatStream(ctx context.Context, system string, messages []Message, tools []ToolDef, maxTokens int) (<-chan StreamChunk, error) {
	// Ensure num_predict is at least 1
	if maxTokens <= 0 {
		maxTokens = 4096
	}

	ollamaMsgs := []map[string]interface{}{
		{"role": "system", "content": system},
	}
	for _, m := range messages {
		ollamaMsgs = append(ollamaMsgs, map[string]interface{}{
			"role":    string(m.Role),
			"content": m.Content,
		})
	}

	body := map[string]interface{}{
		"model":    o.model,
		"messages": ollamaMsgs,
		"stream":   true,
		"options": map[string]interface{}{
			"num_predict": maxTokens,
			"temperature": o.temperature,
		},
	}
	if len(tools) > 0 {
		body["tools"] = convertToolsOllama(tools)
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("ollama: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", o.baseURL+"/api/chat", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama: request failed: %w", err)
	}
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("ollama: HTTP %d: %s", resp.StatusCode, string(b))
	}

	ch := make(chan StreamChunk, 32)
	go o.readStream(resp.Body, ch)
	return ch, nil
}

func (o *OllamaProvider) readStream(body io.ReadCloser, ch chan<- StreamChunk) {
	defer close(ch)
	defer body.Close()

	scanner := bufio.NewScanner(body)
	for scanner.Scan() {
		var chunk struct {
			Message struct {
				Content   string `json:"content"`
				ToolCalls []struct {
					Function struct {
						Name      string          `json:"name"`
						Arguments json.RawMessage `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
			Done bool `json:"done"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &chunk); err != nil {
			continue
		}

		if chunk.Message.Content != "" {
			ch <- StreamChunk{Type: "text", Text: chunk.Message.Content}
		}

		for i, tc := range chunk.Message.ToolCalls {
			ch <- StreamChunk{
				Type: "tool_call",
				ToolCall: &ToolCall{
					ID:        fmt.Sprintf("ollama-%d", i),
					Name:      tc.Function.Name,
					Arguments: tc.Function.Arguments,
				},
			}
		}

		if chunk.Done {
			ch <- StreamChunk{Type: "done"}
		}
	}
}

func convertToolsOllama(tools []ToolDef) []map[string]interface{} {
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
