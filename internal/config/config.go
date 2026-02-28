package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port             int
	Tag1             string
	Tag2             string
	RDPMode          string // "native" or "guacamole"
	GuacWSURL        string
	GuacCryptSecret  string
	SSMForwarderHost string
	SSMForwarderPort int
	PortRangeStart   int
	PortRangeEnd     int
	Debug            bool
	CacheTTLSeconds  int
	InstancesFile    string
}

func Load() *Config {
	return &Config{
		Port:             envInt("PORT", 5000),
		Tag1:             envStr("TAG1", "Customer"),
		Tag2:             envStr("TAG2", "Environment"),
		RDPMode:          envStr("RDP_MODE", "native"),
		GuacWSURL:        envStr("GUAC_WS_URL", "ws://localhost:8080"),
		GuacCryptSecret:  envStr("GUAC_CRYPT_SECRET", "cloudterm-guac-secret-key-32byte"),
		SSMForwarderHost: envStr("SSM_FORWARDER_HOST", "ssm-forwarder"),
		SSMForwarderPort: envInt("SSM_FORWARDER_PORT", 5001),
		PortRangeStart:   envInt("PORT_RANGE_START", 33890),
		PortRangeEnd:     envInt("PORT_RANGE_END", 33999),
		Debug:            envStr("DEBUG", "false") == "true",
		CacheTTLSeconds:  1800, // 30 minutes
		InstancesFile:    envStr("INSTANCES_FILE", "instances_list.yaml"),
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
