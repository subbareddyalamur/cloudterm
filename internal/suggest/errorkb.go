package suggest

import (
	"math"
	"regexp"
	"strings"
	"sync"
)

// ErrorKB detects errors in terminal output and suggests fixes.
type ErrorKB struct {
	mu       sync.RWMutex
	patterns []errorPattern
	learned  map[string]string
}

type errorPattern struct {
	re   *regexp.Regexp
	desc string
	fix  string
}

var defaultPatterns = []struct {
	pattern string
	desc    string
	fix     string
}{
	{`(?i)permission denied`, "Permission denied", "Check file permissions with `ls -la`. Try `sudo` or `chmod` to fix."},
	{`(?i)command not found`, "Command not found", "Install the missing command or check PATH. Use `which` or `type` to verify."},
	{`(?i)no such file or directory`, "File/directory not found", "Check the path exists with `ls`. Verify spelling and case sensitivity."},
	{`(?i)connection refused`, "Connection refused", "Verify the service is running and the port is correct. Check with `netstat -tlnp`."},
	{`(?i)connection timed out`, "Connection timed out", "Check network connectivity and firewall rules. Verify security group settings."},
	{`(?i)name or service not known`, "DNS resolution failed", "Check DNS settings. Try `nslookup` or `dig` to debug. Verify /etc/resolv.conf."},
	{`(?i)no space left on device`, "Disk full", "Free disk space with `df -h` to check, `du -sh /*` to find large dirs."},
	{`(?i)too many open files`, "File descriptor limit", "Increase ulimit with `ulimit -n 65535`. Check `/etc/security/limits.conf`."},
	{`(?i)out of memory|OOM|oom-kill`, "Out of memory", "Check memory with `free -h`. Identify memory hogs with `top` or `ps aux --sort=-%mem`."},
	{`(?i)access denied|AccessDenied`, "Access denied (AWS)", "Check IAM permissions. Verify the role/user has required policy attached."},
	{`(?i)unable to locate package`, "Package not found", "Run `apt update` or `yum update` to refresh repos. Check package name spelling."},
	{`(?i)E: Unable to lock|Could not get lock`, "Package lock held", "Wait for other package operations or run `sudo rm /var/lib/dpkg/lock-frontend`."},
	{`(?i)FATAL|panic:|fatal error`, "Fatal error/panic", "Check the stack trace above for the root cause. Look for nil pointer or index out of range."},
	{`(?i)Operation not permitted`, "Operation not permitted", "May need elevated privileges. Try `sudo` or check SELinux/AppArmor with `getenforce`."},
	{`(?i)port.*already in use|address already in use`, "Port conflict", "Find the process using the port: `lsof -i :<port>` or `netstat -tlnp | grep <port>`."},
	{`(?i)certificate.*expired|x509.*certificate`, "Certificate error", "Check certificate expiry. Update CA certificates with `update-ca-certificates`."},
	{`(?i)authentication fail`, "Authentication failed", "Verify credentials. Check SSH keys with `ssh-add -l`. Reset password if needed."},
	{`(?i)segmentation fault|SIGSEGV`, "Segfault", "Core dump analysis needed. Check for memory corruption or incompatible library versions."},
	{`(?i)Traceback \(most recent call last\)`, "Python traceback", "Read the last line of the traceback for the actual error. Check the exception type."},
	{`(?i)Error: ENOSPC`, "Node.js disk full", "Clear node_modules, npm cache, or tmp files. Check disk with `df -h`."},
}

// NewErrorKB creates an error knowledge base with default patterns.
func NewErrorKB() *ErrorKB {
	kb := &ErrorKB{learned: make(map[string]string)}
	for _, p := range defaultPatterns {
		re, err := regexp.Compile(p.pattern)
		if err != nil {
			continue
		}
		kb.patterns = append(kb.patterns, errorPattern{re: re, desc: p.desc, fix: p.fix})
	}
	return kb
}

// DetectErrors scans output for known error patterns.
func (kb *ErrorKB) DetectErrors(output string) []LogInsight {
	kb.mu.RLock()
	defer kb.mu.RUnlock()

	var insights []LogInsight
	seen := make(map[string]bool)
	for _, p := range kb.patterns {
		if p.re.MatchString(output) && !seen[p.desc] {
			seen[p.desc] = true
			insights = append(insights, LogInsight{
				ErrorSummary: p.desc,
				SuggestedFix: p.fix,
				Confidence:   0.8,
				Pattern:      p.re.String(),
			})
		}
	}

	for pattern, fix := range kb.learned {
		if strings.Contains(strings.ToLower(output), strings.ToLower(pattern)) && !seen[pattern] {
			seen[pattern] = true
			insights = append(insights, LogInsight{
				ErrorSummary: pattern,
				SuggestedFix: fix,
				Confidence:   0.6,
				Pattern:      pattern,
			})
		}
	}
	return insights
}

// RecordResolution learns that a specific error was resolved by a command.
func (kb *ErrorKB) RecordResolution(errorSnippet, resolutionCmd string) {
	kb.mu.Lock()
	defer kb.mu.Unlock()
	key := normalizeError(errorSnippet)
	if key != "" {
		kb.learned[key] = resolutionCmd
	}
}

// SuggestFix finds the most similar learned resolution using TF-IDF cosine similarity.
func (kb *ErrorKB) SuggestFix(errorOutput string) *LogInsight {
	kb.mu.RLock()
	defer kb.mu.RUnlock()

	if len(kb.learned) == 0 {
		return nil
	}

	queryTokens := tokenize(errorOutput)
	if len(queryTokens) == 0 {
		return nil
	}

	var bestPattern string
	var bestFix string
	bestSim := 0.0

	for pattern, fix := range kb.learned {
		patternTokens := tokenize(pattern)
		sim := cosineSimilarity(queryTokens, patternTokens)
		if sim > bestSim {
			bestSim = sim
			bestPattern = pattern
			bestFix = fix
		}
	}

	if bestSim < 0.3 {
		return nil
	}
	return &LogInsight{
		ErrorSummary: bestPattern,
		SuggestedFix: bestFix,
		Confidence:   bestSim,
	}
}

// LearnedCount returns the number of learned error-resolution pairs.
func (kb *ErrorKB) LearnedCount() int {
	kb.mu.RLock()
	defer kb.mu.RUnlock()
	return len(kb.learned)
}

func normalizeError(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

func tokenize(s string) map[string]float64 {
	tokens := make(map[string]float64)
	for _, word := range strings.Fields(strings.ToLower(s)) {
		if len(word) > 2 {
			tokens[word]++
		}
	}
	return tokens
}

func cosineSimilarity(a, b map[string]float64) float64 {
	var dot, normA, normB float64
	for k, v := range a {
		normA += v * v
		if bv, ok := b[k]; ok {
			dot += v * bv
		}
	}
	for _, v := range b {
		normB += v * v
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}
