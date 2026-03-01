package aws

import (
	"context"
	"fmt"
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
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	client, err := d.newSSMClient(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	isWin := strings.EqualFold(platform, "windows")
	docName := "AWS-RunShellScript"
	if isWin {
		docName = "AWS-RunPowerShellScript"
	}

	var cmd string
	if isWin {
		cmd = fmt.Sprintf(
			`Get-ChildItem -Path %s -Force -ErrorAction Stop | ForEach-Object { $t=if($_.PSIsContainer){"D"}else{"F"}; $s=if($_.PSIsContainer){0}else{$_.Length}; $m=$_.LastWriteTime.ToString("yyyy-MM-dd HH:mm"); "$t|$s|$m|$($_.Name)" }`,
			psQuote(path))
	} else {
		qPath := shellQuote(path)
		cmd = fmt.Sprintf(
			`ls -la --time-style=long-iso %s 2>/dev/null | tail -n +2 | while IFS= read -r line; do t="F"; if [ "$(echo "$line" | cut -c1)" = "d" ]; then t="D"; fi; perm=$(echo "$line" | awk '{print $1}'); size=$(echo "$line" | awk '{print $5}'); mod=$(echo "$line" | awk '{print $6" "$7}'); name=$(echo "$line" | awk '{print $NF}'); if [ -n "$name" ] && [ "$name" != "." ] && [ "$name" != ".." ]; then echo "$t|$size|$mod|$perm|$name"; fi; done`,
			qPath)
	}

	out, err := ssmExecOutput(ctx, client, instanceID, cmd, docName)
	if err != nil {
		return nil, fmt.Errorf("browse failed: %w", err)
	}

	return parseFileEntries(strings.TrimSpace(out), isWin), nil
}

func parseFileEntries(raw string, isWin bool) []FileEntry {
	if raw == "" {
		return nil
	}
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
