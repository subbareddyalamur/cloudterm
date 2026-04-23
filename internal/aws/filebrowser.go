package aws

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"
)

type FileEntry struct {
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	IsDir       bool   `json:"is_dir"`
	Modified    string `json:"modified,omitempty"`
	Permissions string `json:"permissions,omitempty"`
}

func (d *Discovery) BrowseDirectory(profile, region, instanceID, path, platform string) ([]FileEntry, error) {
	log.Printf("[BrowseDirectory] instanceID=%q path=%q profile=%q region=%q platform=%q", instanceID, path, profile, region, platform)

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	client, err := d.newSSMClient(ctx, profile, region)
	if err != nil {
		log.Printf("[BrowseDirectory] newSSMClient error: %v", err)
		return nil, err
	}

	isWin := strings.EqualFold(platform, "windows")
	docName := "AWS-RunShellScript"
	if isWin {
		docName = "AWS-RunPowerShellScript"
	}

	var cmd string
	if isWin {
		// Normalise any forward-slash paths to Windows backslashes.
		winPath := strings.ReplaceAll(path, "/", "\\")
		if winPath == "\\" {
			winPath = "C:\\"
		}
		cmd = fmt.Sprintf(
			`Get-ChildItem -Path %s -Force -ErrorAction SilentlyContinue | ForEach-Object { $t=$(if($_.PSIsContainer){"D"}else{"F"}); $s=$(if($_.PSIsContainer){0}else{$_.Length}); $m=$_.LastWriteTime.ToString("yyyy-MM-dd HH:mm"); "$t|$s|$m|$($_.Name)" }`,
			psQuote(winPath))
	} else {
		qPath := shellQuote(path)
		// Use plain `ls -la` (no --time-style, works on GNU, busybox, Alpine).
		// awk extracts fields; name is everything from field 9 onward to handle spaces.
		// Uses POSIX awk (no ternary, explicit concat) to work with mawk/nawk/gawk.
		// head -n 500 caps output to stay within SSM's 24KB stdout limit.
		cmd = fmt.Sprintf(
			`ls -la %s 2>/dev/null | tail -n +2 | head -n 500 | awk 'NF>=9 {if($1~/^d/) t="D"; else t="F"; perm=$1; size=$5; mod=$6" "$7" "$8; n=""; for(i=9;i<=NF;i++){if(n!="") n=n" "; n=n$i}; if(n!="." && n!=".." && n!="") print t"|"size"|"mod"|"perm"|"n}'`,
			qPath)
	}

	log.Printf("[BrowseDirectory] cmd=%q", cmd)
	out, err := ssmExecOutput(ctx, client, instanceID, cmd, docName)
	if err != nil {
		log.Printf("[BrowseDirectory] ssmExecOutput error: %v", err)
		return nil, fmt.Errorf("browse failed: %w", err)
	}
	log.Printf("[BrowseDirectory] output (first 500): %q", func() string {
		if len(out) > 500 {
			return out[:500]
		}
		return out
	}())

	return parseFileEntries(strings.TrimSpace(out), isWin), nil
}

func parseFileEntries(raw string, isWin bool) []FileEntry {
	if raw == "" {
		return nil
	}
	// Normalise Windows CRLF
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	lines := strings.Split(raw, "\n")
	var entries []FileEntry

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if isWin {
			parts := strings.SplitN(line, "|", 4)
			if len(parts) < 4 {
				continue
			}
			size, _ := strconv.ParseInt(parts[1], 10, 64)
			entries = append(entries, FileEntry{
				Name:     parts[3],
				Size:     size,
				IsDir:    parts[0] == "D",
				Modified: parts[2],
			})
		} else {
			parts := strings.SplitN(line, "|", 5)
			if len(parts) < 5 {
				continue
			}
			size, _ := strconv.ParseInt(parts[1], 10, 64)
			entries = append(entries, FileEntry{
				Name:        parts[4],
				Size:        size,
				IsDir:       parts[0] == "D",
				Modified:    parts[2],
				Permissions: parts[3],
			})
		}
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	return entries
}
