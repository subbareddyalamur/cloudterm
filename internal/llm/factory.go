package llm

import (
	"fmt"

	"cloudterm-go/internal/config"
)

// NewProvider creates the appropriate LLM provider based on config.
func NewProvider(cfg *config.Config) (Provider, error) {
	switch cfg.AIProvider {
	case "bedrock":
		return NewBedrockProvider(cfg.AIBedrockRegion, cfg.AIBedrockProfile, cfg.AIModel, cfg.AITemperature)
	case "anthropic":
		if cfg.AIAnthropicKey == "" {
			return nil, fmt.Errorf("anthropic: API key required (set AI_ANTHROPIC_KEY)")
		}
		return NewAnthropicProvider(cfg.AIAnthropicKey, cfg.AIModel, cfg.AITemperature)
	case "openai":
		if cfg.AIOpenAIKey == "" {
			return nil, fmt.Errorf("openai: API key required (set AI_OPENAI_KEY)")
		}
		return NewOpenAIProvider(cfg.AIOpenAIKey, cfg.AIModel, cfg.AITemperature)
	case "gemini":
		if cfg.AIGeminiKey == "" {
			return nil, fmt.Errorf("gemini: API key required (set AI_GEMINI_KEY)")
		}
		return NewGeminiProvider(cfg.AIGeminiKey, cfg.AIModel, cfg.AITemperature)
	case "ollama":
		return NewOllamaProvider(cfg.AIOllamaURL, cfg.AIModel, cfg.AITemperature)
	default:
		return nil, fmt.Errorf("unknown AI provider: %s", cfg.AIProvider)
	}
}
