package llm

import (
	"fmt"
	"regexp"
	"strings"
)

var destructivePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\brm\s+(-[a-z]*f|-[a-z]*r|--force|--recursive)\b`),
	regexp.MustCompile(`(?i)\brm\s+-rf\b`),
	regexp.MustCompile(`(?i)\bmkfs\b`),
	regexp.MustCompile(`(?i)\bdd\s+.*of=/dev/`),
	regexp.MustCompile(`(?i):\(\)\{\s*:\|:&\s*\};:`),
	regexp.MustCompile(`(?i)^\s*shutdown\b`),
	regexp.MustCompile(`(?i)^\s*reboot\b`),
	regexp.MustCompile(`(?i)^\s*init\s+[06]\b`),
	regexp.MustCompile(`(?i)\bsystemctl\s+(stop|disable|mask)\b`),
	regexp.MustCompile(`(?i)\biptables\s+-F\b`),
	regexp.MustCompile(`(?i)\bchmod\s+-R\s+777\b`),
	regexp.MustCompile(`(?i)\bkill\s+-9\s+-1\b`),
	regexp.MustCompile(`(?i)>\s*/dev/sd[a-z]`),
	regexp.MustCompile(`(?i)^\s*format\b.*\b[cC]:`),
	regexp.MustCompile(`(?i)^\s*del\s+/[sS]\b`),
	regexp.MustCompile(`(?i)\bStop-Computer\b`),
	regexp.MustCompile(`(?i)\bRestart-Computer\b`),
	regexp.MustCompile(`(?i)\bdrop\s+database\b`),
	regexp.MustCompile(`(?i)\btruncate\s+table\b`),
	regexp.MustCompile(`(?i)\b>\s*/dev/null\s*2>&1\s*&\s*disown`),
	regexp.MustCompile(`(?i)\bparted\s.*\brm\b`),
	regexp.MustCompile(`(?i)\bfdisk\b`),
}

// IsDestructive checks each pipeline segment against destructive patterns.
// Returns true + reason if blocked, false + "" if safe.
func IsDestructive(cmd string) (bool, string) {
	segments := strings.Split(cmd, "|")
	for _, seg := range segments {
		seg = strings.TrimSpace(seg)
		for _, p := range destructivePatterns {
			if p.MatchString(seg) {
				return true, fmt.Sprintf("Blocked: matches destructive pattern %q", p.String())
			}
		}
	}
	return false, ""
}
