package llm

import "encoding/json"

// AgentTools are the tools available to the AI assistant.
var AgentTools = []ToolDef{
	{
		Name:        "run_command",
		Description: "Run a non-destructive shell command on a specific EC2 instance. The command will be typed into the user's active terminal session. The user must approve before execution. Only propose read-only or safe diagnostic commands.",
		Parameters: json.RawMessage(`{
			"type": "object",
			"properties": {
				"instance_id": {
					"type": "string",
					"description": "The EC2 instance ID to run the command on (e.g. i-0abc123def456)"
				},
				"command": {
					"type": "string",
					"description": "The shell command to execute. Must be non-destructive."
				}
			},
			"required": ["instance_id", "command"]
		}`),
	},
	{
		Name:        "describe_security_groups",
		Description: "List security group rules (inbound and outbound) for an EC2 instance, showing ports, protocols, and CIDR ranges.",
		Parameters: json.RawMessage(`{
			"type": "object",
			"properties": {
				"instance_id": {
					"type": "string",
					"description": "The EC2 instance ID"
				}
			},
			"required": ["instance_id"]
		}`),
	},
	{
		Name:        "describe_network_acls",
		Description: "List Network ACL rules for the subnet of an EC2 instance.",
		Parameters: json.RawMessage(`{
			"type": "object",
			"properties": {
				"instance_id": {
					"type": "string",
					"description": "The EC2 instance ID"
				}
			},
			"required": ["instance_id"]
		}`),
	},
	{
		Name:        "describe_route_tables",
		Description: "Show route table entries for an EC2 instance's subnet, including destination CIDRs and targets.",
		Parameters: json.RawMessage(`{
			"type": "object",
			"properties": {
				"instance_id": {
					"type": "string",
					"description": "The EC2 instance ID"
				}
			},
			"required": ["instance_id"]
		}`),
	},
	{
		Name:        "describe_load_balancers",
		Description: "Find load balancers associated with an EC2 instance and show their listeners, target groups, and health status.",
		Parameters: json.RawMessage(`{
			"type": "object",
			"properties": {
				"instance_id": {
					"type": "string",
					"description": "The EC2 instance ID"
				}
			},
			"required": ["instance_id"]
		}`),
	},
	{
		Name:        "describe_instance",
		Description: "Get full details of an EC2 instance including instance type, VPC, subnet, security groups, IAM instance profile/role, key pair, tags, platform, state, and IP addresses. Use this when the user asks about instance configuration, IAM roles, tags, or any instance metadata.",
		Parameters: json.RawMessage(`{
			"type": "object",
			"properties": {
				"instance_id": {
					"type": "string",
					"description": "The EC2 instance ID"
				}
			},
			"required": ["instance_id"]
		}`),
	},
}
