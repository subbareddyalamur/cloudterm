package config

import (
	"net"
	"os"
	"strconv"
	"strings"
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
	CostDashboardHost   string
	CostDashboardPort   int
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
	AuthSecret           string
	RequireAuth          bool
	LicenseKey           string
	LicenseControllerURL string
	DeploymentID         string
	ExternalID           string
	DataDir              string
	DatabaseURL          string
	LicensePublicKey     string
	RequireRecordProd    bool
	Version              string
	SeatCount            int
	// AWSAccessMode is "hub" (AssumeRole only, ~/.aws never read) or "profiles" (legacy).
	AWSAccessMode   string
	HubProfile      string
	AllowAccessKeys bool
	// Sign-in and SSO.
	OIDCIssuer          string
	OIDCClientID        string
	OIDCClientSecret    string
	OIDCRedirectURL     string
	OIDCLabel           string
	OIDCAllowedDomains  []string
	OIDCGroupsClaim     string
	OIDCAdminGroups     []string
	OIDCOperatorGroups  []string
	OIDCViewerGroups    []string
	OIDCDefaultRole     string
	OIDCRequireVerified bool
	LocalLogin          string
	SessionMaxHours     int
	SessionIdleMinutes  int
	PublicURL           string
	SSOProvidersFile    string
	// TrustedProxies lists IPs/CIDRs whose X-Forwarded-For and
	// X-Forwarded-Proto headers CloudTerm believes. Empty trusts everyone
	// (for deployments behind one TLS-terminating proxy).
	TrustedProxies []string
	// Warnings are configuration problems worth logging at boot.
	Warnings []string
}

func Load() *Config {
	cfg := &Config{
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
		CostDashboardHost:    envStr("COST_DASHBOARD_HOST", "cost-dashboard"),
		CostDashboardPort:    envInt("COST_DASHBOARD_PORT", 80),
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
		AuthSecret:           envStr("AUTH_SECRET", ""),
		RequireAuth:          envStr("REQUIRE_AUTH", "false") == "true",
		LicenseKey:           envStr("LICENSE_KEY", ""),
		LicenseControllerURL: envStr("LICENSE_CONTROLLER_URL", ""),
		DeploymentID:         envStr("DEPLOYMENT_ID", "local"),
		ExternalID:           envStr("CLOUDTERM_EXTERNAL_ID", "cloudterm-local"),
		DataDir:              envStr("DATA_DIR", "."),
		DatabaseURL:          envStr("DATABASE_URL", ""),
		LicensePublicKey:     envStr("LICENSE_PUBLIC_KEY", ""),
		RequireRecordProd:    envStr("REQUIRE_RECORD_PROD", "false") == "true",
		Version:              envStr("CLOUDTERM_VERSION", "dev"),
		SeatCount:            envInt("SEAT_COUNT", 1),
		AWSAccessMode:        envStr("AWS_ACCESS_MODE", "profiles"),
		HubProfile:           envStr("CLOUDTERM_HUB_PROFILE", ""),
		AllowAccessKeys:      envStr("ALLOW_ACCESS_KEYS", "false") == "true",
		OIDCIssuer:           envStr("OIDC_ISSUER", ""),
		OIDCClientID:         envStr("OIDC_CLIENT_ID", ""),
		OIDCClientSecret:     envStr("OIDC_CLIENT_SECRET", ""),
		OIDCRedirectURL:      envStr("OIDC_REDIRECT_URL", ""),
		OIDCLabel:            envStr("OIDC_LABEL", "Single sign-on"),
		OIDCAllowedDomains:   envList("OIDC_ALLOWED_DOMAINS"),
		OIDCGroupsClaim:      envStr("OIDC_GROUPS_CLAIM", "groups"),
		OIDCAdminGroups:      envList("OIDC_ADMIN_GROUPS"),
		OIDCOperatorGroups:   envList("OIDC_OPERATOR_GROUPS"),
		OIDCViewerGroups:     envList("OIDC_VIEWER_GROUPS"),
		OIDCDefaultRole:      envStr("OIDC_DEFAULT_ROLE", ""),
		OIDCRequireVerified:  envStr("OIDC_REQUIRE_EMAIL_VERIFIED", "true") == "true",
		LocalLogin:           envStr("LOCAL_LOGIN", ""),
		SessionMaxHours:      envInt("SESSION_MAX_HOURS", 8),
		SessionIdleMinutes:   envInt("SESSION_IDLE_MINUTES", 60),
		PublicURL:            envStr("PUBLIC_URL", ""),
		SSOProvidersFile:     envStr("SSO_PROVIDERS_FILE", ""),
	}
	cfg.Warnings, cfg.TrustedProxies = parseTrustedProxies(envList("TRUSTED_PROXIES"))
	return cfg
}

// parseTrustedProxies accepts IPs and CIDRs. A bare IP covers just that
// address; anything unparsable is reported rather than silently ignored.
func parseTrustedProxies(entries []string) (warnings, cleaned []string) {
	for _, e := range entries {
		if strings.Contains(e, "/") {
			if _, _, err := net.ParseCIDR(e); err != nil {
				warnings = append(warnings, "TRUSTED_PROXIES: cannot parse "+e)
				continue
			}
			cleaned = append(cleaned, e)
			continue
		}
		if net.ParseIP(e) == nil {
			warnings = append(warnings, "TRUSTED_PROXIES: cannot parse "+e)
			continue
		}
		if strings.Contains(e, ":") {
			cleaned = append(cleaned, e+"/128")
		} else {
			cleaned = append(cleaned, e+"/32")
		}
	}
	return warnings, cleaned
}

// IsTrustedProxy reports whether the peer that connected to CloudTerm is a
// listed proxy. With no list, every peer is trusted (single-proxy deployments
// that forward headers); a list restricts header trust to those peers.
func (c *Config) IsTrustedProxy(peer string) bool {
	if len(c.TrustedProxies) == 0 {
		return true
	}
	ip := net.ParseIP(peer)
	if ip == nil {
		return false
	}
	for _, cidr := range c.TrustedProxies {
		if _, netIP, err := net.ParseCIDR(cidr); err == nil && netIP.Contains(ip) {
			return true
		}
	}
	return false
}

// envList splits a comma-separated variable, trimming blanks.
func envList(key string) []string {
	var out []string
	for _, part := range strings.Split(os.Getenv(key), ",") {
		if v := strings.TrimSpace(part); v != "" {
			out = append(out, v)
		}
	}
	return out
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
