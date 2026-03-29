package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port                int
	Tag1                string
	Tag2                string
	RDPMode             string // "native" or "guacamole"
	GuacWSURL           string
	GuacLiteHost        string
	GuacLitePort        int
	GuacCryptSecret     string
	SSMForwarderHost    string
	SSMForwarderPort    int
	PortRangeStart      int
	PortRangeEnd        int
	Debug               bool
	CacheTTLSeconds     int
	InstancesFile       string
	AuditLogFile        string
	PreferencesFile     string
	SessionRecordingDir string
	TerminalExportDir   string
	AutoRecord          bool
	AWSAccountsFile     string
	ConverterHost       string
	ConverterPort       int
	// AI Agent
	AIProvider           string // "bedrock", "anthropic", "openai", "gemini", "ollama"
	AIModel              string
	AIBedrockRegion      string
	AIBedrockProfile     string
	AIAnthropicKey       string
	AIOpenAIKey          string
	AIGeminiKey          string
	AIOllamaURL          string
	AIMaxTokens          int
	AITemperature        float64
	SuggestEnabled       bool
	SuggestDataDir       string
	SuggestEncryptionKey string
}

func Load() *Config {
	return &Config{
		Port:                 envInt("PORT", 5000),
		Tag1:                 envStr("TAG1", "Customer"),
		Tag2:                 envStr("TAG2", "Environment"),
		RDPMode:              envStr("RDP_MODE", "native"),
		GuacWSURL:            envStr("GUAC_WS_URL", "ws://localhost:8080"),
		GuacLiteHost:         envStr("GUAC_LITE_HOST", "guac-lite"),
		GuacLitePort:         envInt("GUAC_LITE_PORT", 8080),
		GuacCryptSecret:      envStr("GUAC_CRYPT_SECRET", "cloudterm-guac-secret-key-32byte"),
		SSMForwarderHost:     envStr("SSM_FORWARDER_HOST", "ssm-forwarder"),
		SSMForwarderPort:     envInt("SSM_FORWARDER_PORT", 5001),
		PortRangeStart:       envInt("PORT_RANGE_START", 33890),
		PortRangeEnd:         envInt("PORT_RANGE_END", 33999),
		Debug:                envStr("DEBUG", "false") == "true",
		CacheTTLSeconds:      1800, // 30 minutes
		InstancesFile:        envStr("INSTANCES_FILE", "instances_list.yaml"),
		AuditLogFile:         envStr("AUDIT_LOG_FILE", "audit.log"),
		PreferencesFile:      envStr("PREFERENCES_FILE", "preferences.json"),
		SessionRecordingDir:  envStr("SESSION_RECORDING_DIR", "/app/recordings"),
		TerminalExportDir:    envStr("TERMINAL_EXPORT_DIR", "/app/exports"),
		AutoRecord:           envStr("AUTO_RECORD", "false") == "true",
		AWSAccountsFile:      envStr("AWS_ACCOUNTS_FILE", "aws_accounts.json"),
		ConverterHost:        envStr("CONVERTER_HOST", "converter"),
		ConverterPort:        envInt("CONVERTER_PORT", 5002),
		AIProvider:           envStr("AI_PROVIDER", "bedrock"),
		AIModel:              envStr("AI_MODEL", ""),
		AIBedrockRegion:      envStr("AI_BEDROCK_REGION", "us-east-1"),
		AIBedrockProfile:     envStr("AI_BEDROCK_PROFILE", "dev"),
		AIAnthropicKey:       envStr("AI_ANTHROPIC_KEY", ""),
		AIOpenAIKey:          envStr("AI_OPENAI_KEY", ""),
		AIGeminiKey:          envStr("AI_GEMINI_KEY", ""),
		AIOllamaURL:          envStr("AI_OLLAMA_URL", "http://localhost:11434"),
		AIMaxTokens:          envInt("AI_MAX_TOKENS", 4096),
		AITemperature:        envFloat("AI_TEMPERATURE", 0.3),
		SuggestEnabled:       envStr("SUGGEST_ENABLED", "true") == "true",
		SuggestDataDir:       envStr("SUGGEST_DATA_DIR", "/app/suggestdata"),
		SuggestEncryptionKey: envStr("SUGGEST_ENCRYPTION_KEY", ""),
	}
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envFloat(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}
