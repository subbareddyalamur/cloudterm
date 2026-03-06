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

// GeminiProvider streams via the Gemini generateContent API.
type GeminiProvider struct {
	apiKey      string
	model       string
	temperature float64
}

func NewGeminiProvider(apiKey, model string, temperature float64) (*GeminiProvider, error) {
	if model == "" {
		return nil, fmt.Errorf("gemini: model is required — configure it in Settings > AI Agent")
	}
	return &GeminiProvider{apiKey: apiKey, model: model, temperature: temperature}, nil
}

func (g *GeminiProvider) ChatStream(ctx context.Context, system string, messages []Message, tools []ToolDef, maxTokens int) (<-chan StreamChunk, error) {
	contents := convertContentsGemini(messages)

	body := map[string]interface{}{
		"contents": contents,
		"systemInstruction": map[string]interface{}{
			"parts": []map[string]string{{"text": system}},
		},
		"generationConfig": map[string]interface{}{
			"maxOutputTokens": maxTokens,
			"temperature":     g.temperature,
		},
	}
	if len(tools) > 0 {
		body["tools"] = []map[string]interface{}{
			{"functionDeclarations": convertToolsGemini(tools)},
		}
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("gemini: marshal: %w", err)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:streamGenerateContent?alt=sse&key=%s", g.model, g.apiKey)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gemini: request failed: %w", err)
	}
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("gemini: HTTP %d: %s", resp.StatusCode, string(b))
	}

	ch := make(chan StreamChunk, 32)
	go g.readStream(resp.Body, ch)
	return ch, nil
}

func (g *GeminiProvider) readStream(body io.ReadCloser, ch chan<- StreamChunk) {
	defer close(ch)
	defer body.Close()

	scanner := bufio.NewScanner(body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")

		var resp struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						Text         string `json:"text"`
						FunctionCall *struct {
							Name string          `json:"name"`
							Args json.RawMessage `json:"args"`
						} `json:"functionCall"`
					} `json:"parts"`
				} `json:"content"`
				FinishReason string `json:"finishReason"`
			} `json:"candidates"`
		}
		if err := json.Unmarshal([]byte(data), &resp); err != nil {
			continue
		}
		if len(resp.Candidates) == 0 {
			continue
		}

		for _, part := range resp.Candidates[0].Content.Parts {
			if part.Text != "" {
				ch <- StreamChunk{Type: "text", Text: part.Text}
			}
			if part.FunctionCall != nil {
				ch <- StreamChunk{
					Type: "tool_call",
					ToolCall: &ToolCall{
						ID:        fmt.Sprintf("gemini-%s", part.FunctionCall.Name),
						Name:      part.FunctionCall.Name,
						Arguments: part.FunctionCall.Args,
					},
				}
			}
		}

		if resp.Candidates[0].FinishReason == "STOP" || resp.Candidates[0].FinishReason == "MAX_TOKENS" {
			ch <- StreamChunk{Type: "done"}
		}
	}
}

func convertContentsGemini(msgs []Message) []map[string]interface{} {
	var out []map[string]interface{}
	for _, m := range msgs {
		role := "user"
		if m.Role == RoleAssistant {
			role = "model"
		}

		var parts []map[string]interface{}
		if m.Role == RoleTool {
			parts = append(parts, map[string]interface{}{
				"functionResponse": map[string]interface{}{
					"name": m.ToolCallID,
					"response": map[string]interface{}{
						"result": m.Content,
					},
				},
			})
		} else if m.Role == RoleAssistant && len(m.ToolCalls) > 0 {
			if m.Content != "" {
				parts = append(parts, map[string]interface{}{"text": m.Content})
			}
			for _, tc := range m.ToolCalls {
				var args interface{}
				json.Unmarshal(tc.Arguments, &args)
				parts = append(parts, map[string]interface{}{
					"functionCall": map[string]interface{}{
						"name": tc.Name,
						"args": args,
					},
				})
			}
		} else {
			parts = append(parts, map[string]interface{}{"text": m.Content})
		}

		out = append(out, map[string]interface{}{
			"role":  role,
			"parts": parts,
		})
	}
	return out
}

func convertToolsGemini(tools []ToolDef) []map[string]interface{} {
	var out []map[string]interface{}
	for _, t := range tools {
		var params interface{}
		json.Unmarshal(t.Parameters, &params)
		out = append(out, map[string]interface{}{
			"name":        t.Name,
			"description": t.Description,
			"parameters":  params,
		})
	}
	return out
}
