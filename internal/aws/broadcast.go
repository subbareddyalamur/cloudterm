package aws

import (
	"context"
	"strings"
	"sync"
	"time"

	"cloudterm-go/internal/types"
)

type BroadcastTarget struct {
	InstanceID string `json:"instance_id"`
	Name       string `json:"name"`
	Profile    string `json:"profile"`
	Region     string `json:"region"`
	Platform   string `json:"platform"`
}

type BroadcastResult struct {
	InstanceID string `json:"instance_id"`
	Name       string `json:"name"`
	Output     string `json:"output"`
	Error      string `json:"error,omitempty"`
	Success    bool   `json:"success"`
}

// GetInstance looks up a single instance by ID from the cache.
func (d *Discovery) GetInstance(instanceID string) *types.EC2Instance {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.cache == nil || d.cache.Instances == nil {
		return nil
	}
	for i := range d.cache.Instances {
		if d.cache.Instances[i].InstanceID == instanceID {
			cp := d.cache.Instances[i]
			return &cp
		}
	}
	return nil
}

func (d *Discovery) BroadcastCommand(targets []BroadcastTarget, command string) []BroadcastResult {
	results := make([]BroadcastResult, len(targets))
	sem := make(chan struct{}, 10)
	var wg sync.WaitGroup

	for i, target := range targets {
		wg.Add(1)
		go func(idx int, t BroadcastTarget) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()

			client, err := d.newSSMClient(ctx, t.Profile, t.Region)
			if err != nil {
				results[idx] = BroadcastResult{
					InstanceID: t.InstanceID, Name: t.Name,
					Error: err.Error(), Success: false,
				}
				return
			}

			docName := "AWS-RunShellScript"
			if strings.EqualFold(t.Platform, "windows") {
				docName = "AWS-RunPowerShellScript"
			}

			out, err := ssmExecOutput(ctx, client, t.InstanceID, command, docName)
			if err != nil {
				results[idx] = BroadcastResult{
					InstanceID: t.InstanceID, Name: t.Name,
					Error: err.Error(), Success: false,
				}
				return
			}

			results[idx] = BroadcastResult{
				InstanceID: t.InstanceID, Name: t.Name,
				Output: out, Success: true,
			}
		}(i, target)
	}

	wg.Wait()
	return results
}
