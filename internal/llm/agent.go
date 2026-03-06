package llm

import (
	"fmt"
	"strings"
)

// InstanceSummary is minimal instance info for building context.
type InstanceSummary struct {
	InstanceID string `json:"instance_id"`
	Name       string `json:"name"`
	Platform   string `json:"platform"` // "linux" or "windows"
	State      string `json:"state"`
	PrivateIP  string `json:"private_ip"`
	PublicIP   string `json:"public_ip"`
	Region     string `json:"region"`
}

// BuildSystemPrompt creates the system prompt with instance context.
func BuildSystemPrompt(instances []InstanceSummary, activeInstance *InstanceSummary) string {
	var sb strings.Builder

	sb.WriteString(`You are CloudTerm AI Assistant, an AWS operations expert embedded in a web-based terminal manager.

CRITICAL RULES:
- NEVER suggest or use destructive commands: rm -rf, shutdown, reboot, halt, mkfs, dd, fdisk, format, del /s, Stop-Computer, Restart-Computer, drop database, truncate table, iptables -F, kill -9 -1, chmod -R 777
- ALWAYS use the run_command tool when you want to execute a command — never tell the user to copy/paste commands manually
- Every command requires user approval before execution — you propose, they decide
- When diagnosing issues, start with safe read-only commands: cat, grep, head, tail, ls, ps, top, df, free, ss, netstat, systemctl status, journalctl, dmesg, ip addr, curl, ping, traceroute, nslookup, dig
- Be concise and use markdown formatting
- If you need information about security groups, NACLs, route tables, or load balancers, use the dedicated networking tools instead of running AWS CLI commands

CAPABILITIES:
- Run commands on EC2 instances (user approval required for each)
- Describe instance details (type, VPC, subnet, SGs, IAM role/profile, key pair, tags, IPs)
- Query security groups (inbound/outbound rules)
- Query Network ACLs (subnet-level firewall rules)
- Query route tables (network routing)
- Query load balancers (listeners, targets, health)
- Diagnose connectivity, services, logs, and performance issues
`)

	if len(instances) > 0 {
		sb.WriteString("\nAVAILABLE INSTANCES:\n")
		for _, inst := range instances {
			ip := inst.PrivateIP
			if inst.PublicIP != "" {
				ip += " / " + inst.PublicIP
			}
			sb.WriteString(fmt.Sprintf("- %s (%s) [%s] %s — %s\n", inst.InstanceID, inst.Name, inst.Platform, inst.State, ip))
		}
	}

	if activeInstance != nil {
		sb.WriteString(fmt.Sprintf("\nACTIVE INSTANCE (default target): %s (%s) [%s]\nUse this instance when the user doesn't specify which instance to target.\n",
			activeInstance.InstanceID, activeInstance.Name, activeInstance.Platform))
	}

	return sb.String()
}
