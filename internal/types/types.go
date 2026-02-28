package types

import "time"

// EC2Instance represents a discovered AWS EC2 instance.
type EC2Instance struct {
	InstanceID   string `json:"instance_id" yaml:"instance_id"`
	Name         string `json:"name" yaml:"name"`
	PrivateIP    string `json:"private_ip" yaml:"private_ip"`
	PublicIP     string `json:"public_ip,omitempty" yaml:"public_ip,omitempty"`
	State        string `json:"state" yaml:"state"`
	Platform     string `json:"platform" yaml:"platform"` // "linux" or "windows"
	OS           string `json:"os" yaml:"os"`             // "rhel", "amazon-linux", "ubuntu", "windows", etc.
	InstanceType string `json:"instance_type" yaml:"instance_type"`
	AWSProfile   string `json:"aws_profile" yaml:"aws_profile"`
	AWSRegion    string `json:"aws_region" yaml:"aws_region"`
	AccountID    string `json:"account_id" yaml:"account_id"`
	AccountAlias string `json:"account_alias,omitempty" yaml:"account_alias,omitempty"`
	Tag1Value       string            `json:"tag1_value" yaml:"tag1_value"`
	Tag2Value       string            `json:"tag2_value" yaml:"tag2_value"`
	LaunchTime      string            `json:"launch_time,omitempty" yaml:"launch_time,omitempty"`
	AMIID           string            `json:"ami_id,omitempty" yaml:"ami_id,omitempty"`
	InstanceProfile string            `json:"instance_profile,omitempty" yaml:"instance_profile,omitempty"`
	Tags            map[string]string `json:"tags,omitempty" yaml:"tags,omitempty"`
}

// InstanceTree is the 4-level hierarchy: Account → Region → Tag1 → Tag2 → Instances
type InstanceTree struct {
	Accounts []AccountNode `json:"accounts"`
}

type AccountNode struct {
	AccountID    string       `json:"account_id"`
	AccountAlias string       `json:"account_alias,omitempty"`
	Profile      string       `json:"profile"`
	Regions      []RegionNode `json:"regions"`
}

type RegionNode struct {
	Region string     `json:"region"`
	Groups []TagGroup `json:"groups"`
}

type TagGroup struct {
	Tag1      string        `json:"tag1"`
	Tag2      string        `json:"tag2"`
	Instances []EC2Instance `json:"instances"`
}

// ScanResult holds the outcome of an EC2 scanning operation.
type ScanResult struct {
	Data         *InstanceTree `json:"data"`
	Instances    []EC2Instance `json:"instances"`
	Timestamp    time.Time     `json:"timestamp"`
	ScanDuration time.Duration `json:"-"`
}

// ScanStatus is emitted during scanning to show progress.
type ScanStatus struct {
	Status              string `json:"status"` // "scanning", "completed", "error"
	ScannedCombinations int    `json:"scanned_combinations"`
	SuccessfulRegions   int    `json:"successful_regions"`
	TotalInstances      int    `json:"total_instances"`
	Message             string `json:"message,omitempty"`
}

// FleetStats provides aggregate counts for the sidebar.
type FleetStats struct {
	Total    int `json:"total"`
	Running  int `json:"running"`
	Stopped  int `json:"stopped"`
	Windows  int `json:"windows"`
	RHEL     int `json:"rhel"`
	Accounts int `json:"accounts"`
}

// FleetSummary provides full fleet details including per-account breakdown.
type FleetSummary struct {
	Total        int            `json:"total"`
	Running      int            `json:"running"`
	Stopped      int            `json:"stopped"`
	Platforms    map[string]int `json:"platforms"`
	Accounts     []AccountStats `json:"accounts"`
	ScanDuration string         `json:"scan_duration"`
}

// AccountStats provides per-account instance counts.
type AccountStats struct {
	AccountID    string         `json:"account_id"`
	AccountAlias string         `json:"account_alias,omitempty"`
	Profile      string         `json:"profile"`
	Total        int            `json:"total"`
	Running      int            `json:"running"`
	Stopped      int            `json:"stopped"`
	Platforms    map[string]int `json:"platforms"`
}

// WSMessage is the generic WebSocket message envelope.
type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
}

// Terminal session messages
type StartSessionMsg struct {
	InstanceID string `json:"instance_id"`
	SessionID  string `json:"session_id"`
}

type TerminalInputMsg struct {
	SessionID string `json:"session_id"`
	Input     string `json:"input"`
}

type TerminalResizeMsg struct {
	SessionID string `json:"session_id"`
	Rows      uint16 `json:"rows"`
	Cols      uint16 `json:"cols"`
}

type TerminalOutputMsg struct {
	InstanceID string `json:"instance_id"`
	SessionID  string `json:"session_id"`
	Output     string `json:"output"`
}

type SessionEventMsg struct {
	InstanceID string `json:"instance_id"`
	SessionID  string `json:"session_id"`
	Error      string `json:"error,omitempty"`
}

// RDP session types
type RDPSessionInfo struct {
	InstanceID   string `json:"instance_id"`
	InstanceName string `json:"instance_name"`
	LocalPort    int    `json:"local_port"`
	AWSProfile   string `json:"aws_profile"`
	AWSRegion    string `json:"aws_region"`
	StartedAt    string `json:"started_at"`
}

type GuacamoleTokenRequest struct {
	InstanceID   string `json:"instance_id"`
	InstanceName string `json:"instance_name"`
	AWSProfile   string `json:"aws_profile"`
	AWSRegion    string `json:"aws_region"`
	Username     string `json:"username"`
	Password     string `json:"password"`
}

type GuacamoleTokenResponse struct {
	Token        string `json:"token"`
	URL          string `json:"url"`
	InstanceID   string `json:"instance_id"`
	InstanceName string `json:"instance_name"`
	WSURL        string `json:"ws_url"`
}

// SSM Forwarder types
type ForwarderStartRequest struct {
	InstanceID   string `json:"instance_id"`
	InstanceName string `json:"instance_name"`
	AWSProfile   string `json:"aws_profile"`
	AWSRegion    string `json:"aws_region"`
}

type ForwarderStartResponse struct {
	Status       string `json:"status"`
	InstanceID   string `json:"instance_id"`
	Port         int    `json:"port"`
	InstanceName string `json:"instance_name"`
}

type ForwarderSession struct {
	InstanceID   string `json:"instance_id"`
	InstanceName string `json:"instance_name"`
	LocalPort    int    `json:"local_port"`
	AWSProfile   string `json:"aws_profile"`
	AWSRegion    string `json:"aws_region"`
	StartedAt    string `json:"started_at"`
}

// YAML file structure (matches instances_list.yaml)
type YAMLInstanceFile struct {
	Accounts map[string]YAMLAccount `yaml:",inline"`
}

type YAMLAccount struct {
	Regions map[string]YAMLRegion `yaml:",inline"`
}

type YAMLRegion struct {
	Groups map[string]map[string][]YAMLInstance `yaml:",inline"`
}

type YAMLInstance struct {
	InstanceID   string `yaml:"instance_id"`
	Name         string `yaml:"name"`
	PrivateIP    string `yaml:"private_ip"`
	PublicIP     string `yaml:"public_ip,omitempty"`
	State        string `yaml:"state"`
	Platform     string `yaml:"platform"`
	InstanceType string `yaml:"instance_type"`
	AWSProfile   string `yaml:"aws_profile"`
	AWSRegion    string `yaml:"aws_region"`
}
