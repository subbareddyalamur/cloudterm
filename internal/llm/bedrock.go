package llm

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	brdoc "github.com/aws/aws-sdk-go-v2/service/bedrockruntime/document"
	brtypes "github.com/aws/aws-sdk-go-v2/service/bedrockruntime/types"
)

// BedrockProvider streams via the Converse API.
type BedrockProvider struct {
	client      *bedrockruntime.Client
	model       string
	temperature float32
}

func NewBedrockProvider(region, profile, model string, temperature float64) (*BedrockProvider, error) {
	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(region),
	}
	if profile != "" {
		opts = append(opts, awsconfig.WithSharedConfigProfile(profile))
	}
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(), opts...)
	if err != nil {
		return nil, fmt.Errorf("bedrock: load aws config: %w", err)
	}
	return &BedrockProvider{
		client:      bedrockruntime.NewFromConfig(cfg),
		model:       model,
		temperature: float32(temperature),
	}, nil
}

func (b *BedrockProvider) ChatStream(ctx context.Context, system string, messages []Message, tools []ToolDef, maxTokens int) (<-chan StreamChunk, error) {
	// Ensure MaxTokens is at least 1
	if maxTokens <= 0 {
		maxTokens = 4096
	}

	// Build system prompt
	sysBlocks := []brtypes.SystemContentBlock{
		&brtypes.SystemContentBlockMemberText{Value: system},
	}

	// Convert messages
	brMsgs, err := convertMessages(messages)
	if err != nil {
		return nil, err
	}

	// Build input
	input := &bedrockruntime.ConverseStreamInput{
		ModelId: aws.String(b.model),
		System:  sysBlocks,
		Messages: brMsgs,
		InferenceConfig: &brtypes.InferenceConfiguration{
			MaxTokens:   aws.Int32(int32(maxTokens)),
			Temperature: aws.Float32(b.temperature),
		},
	}

	// Add tools if any
	if len(tools) > 0 {
		brTools, err := convertTools(tools)
		if err != nil {
			return nil, err
		}
		input.ToolConfig = &brtypes.ToolConfiguration{
			Tools: brTools,
		}
	}

	output, err := b.client.ConverseStream(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("bedrock: converse stream: %w", err)
	}

	ch := make(chan StreamChunk, 32)
	go b.readStream(output, ch)
	return ch, nil
}

func (b *BedrockProvider) readStream(output *bedrockruntime.ConverseStreamOutput, ch chan<- StreamChunk) {
	defer close(ch)

	var currentToolID string
	var currentToolName string
	var toolInputBuf string

	for event := range output.GetStream().Events() {
		switch ev := event.(type) {
		case *brtypes.ConverseStreamOutputMemberContentBlockStart:
			if start, ok := ev.Value.Start.(*brtypes.ContentBlockStartMemberToolUse); ok {
				currentToolID = aws.ToString(start.Value.ToolUseId)
				currentToolName = aws.ToString(start.Value.Name)
				toolInputBuf = ""
			}

		case *brtypes.ConverseStreamOutputMemberContentBlockDelta:
			switch delta := ev.Value.Delta.(type) {
			case *brtypes.ContentBlockDeltaMemberText:
				ch <- StreamChunk{Type: "text", Text: delta.Value}
			case *brtypes.ContentBlockDeltaMemberToolUse:
				if delta.Value.Input != nil {
					toolInputBuf += aws.ToString(delta.Value.Input)
				}
			}

		case *brtypes.ConverseStreamOutputMemberContentBlockStop:
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
				toolInputBuf = ""
			}

		case *brtypes.ConverseStreamOutputMemberMessageStop:
			ch <- StreamChunk{Type: "done"}
		}
	}
}

// convertMessages maps our Message type to Bedrock's Message type.
// Consecutive tool result messages are merged into a single user message
// as required by the Bedrock Converse API.
func convertMessages(msgs []Message) ([]brtypes.Message, error) {
	var out []brtypes.Message
	i := 0
	for i < len(msgs) {
		m := msgs[i]

		if m.Role == RoleTool && m.ToolCallID != "" {
			// Collect all consecutive tool results into one user message
			var content []brtypes.ContentBlock
			for i < len(msgs) && msgs[i].Role == RoleTool && msgs[i].ToolCallID != "" {
				content = append(content, &brtypes.ContentBlockMemberToolResult{
					Value: brtypes.ToolResultBlock{
						ToolUseId: aws.String(msgs[i].ToolCallID),
						Content: []brtypes.ToolResultContentBlock{
							&brtypes.ToolResultContentBlockMemberText{Value: msgs[i].Content},
						},
					},
				})
				i++
			}
			out = append(out, brtypes.Message{
				Role:    brtypes.ConversationRoleUser,
				Content: content,
			})
			continue
		}

		if m.Role == RoleAssistant && len(m.ToolCalls) > 0 {
			var content []brtypes.ContentBlock
			if m.Content != "" {
				content = append(content, &brtypes.ContentBlockMemberText{Value: m.Content})
			}
			for _, tc := range m.ToolCalls {
				var inputMap interface{}
				if err := json.Unmarshal(tc.Arguments, &inputMap); err != nil {
					return nil, fmt.Errorf("bedrock: unmarshal tool args: %w", err)
				}
				content = append(content, &brtypes.ContentBlockMemberToolUse{
					Value: brtypes.ToolUseBlock{
						ToolUseId: aws.String(tc.ID),
						Name:      aws.String(tc.Name),
						Input:     brdoc.NewLazyDocument(inputMap),
					},
				})
			}
			out = append(out, brtypes.Message{
				Role:    brtypes.ConversationRoleAssistant,
				Content: content,
			})
			i++
			continue
		}

		// Plain user or assistant text message
		var role brtypes.ConversationRole
		if m.Role == RoleAssistant {
			role = brtypes.ConversationRoleAssistant
		} else {
			role = brtypes.ConversationRoleUser
		}
		text := m.Content
		if text == "" {
			text = " "
		}
		out = append(out, brtypes.Message{
			Role:    role,
			Content: []brtypes.ContentBlock{&brtypes.ContentBlockMemberText{Value: text}},
		})
		i++
	}
	return out, nil
}

// convertTools maps our ToolDef to Bedrock's Tool type.
func convertTools(tools []ToolDef) ([]brtypes.Tool, error) {
	var out []brtypes.Tool
	for _, t := range tools {
		var schema interface{}
		if err := json.Unmarshal(t.Parameters, &schema); err != nil {
			return nil, fmt.Errorf("bedrock: unmarshal tool schema for %s: %w", t.Name, err)
		}
		out = append(out, &brtypes.ToolMemberToolSpec{
			Value: brtypes.ToolSpecification{
				Name:        aws.String(t.Name),
				Description: aws.String(t.Description),
				InputSchema: &brtypes.ToolInputSchemaMemberJson{
					Value: brdoc.NewLazyDocument(schema),
				},
			},
		})
	}
	return out, nil
}
