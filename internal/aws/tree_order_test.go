package aws

import (
	"testing"

	"cloudterm-go/internal/types"
)

func TestBuildInstanceTreeIsStable(t *testing.T) {
	instances := []types.EC2Instance{
		{InstanceID: "i-3", Name: "syca-mo-prod-1", AccountID: "2", AccountAlias: "dsi-sso", AWSRegion: "us-east-2", Tag1Value: "DAIICHI SANKYO", Tag2Value: "PROD"},
		{InstanceID: "i-1", Name: "syca-mo-dev", AccountID: "2", AccountAlias: "dsi-sso", AWSRegion: "us-east-2", Tag1Value: "DAIICHI SANKYO", Tag2Value: "DEV"},
		{InstanceID: "i-2", Name: "syca-mo-bastion-dev", AccountID: "2", AccountAlias: "dsi-sso", AWSRegion: "us-east-2", Tag1Value: "DAIICHI SANKYO", Tag2Value: "DEV"},
		{InstanceID: "i-4", Name: "shiny_server_1", AccountID: "1", AccountAlias: "Sycamore", AWSRegion: "us-east-1", Tag1Value: "Sycamore", Tag2Value: "DEV"},
		{InstanceID: "i-5", Name: "syca-mo-val-1", AccountID: "2", AccountAlias: "dsi-sso", AWSRegion: "us-east-2", Tag1Value: "DAIICHI SANKYO", Tag2Value: "VAL"},
	}
	for run := 0; run < 20; run++ {
		tree := buildInstanceTree(instances)
		if got := tree.Accounts[0].AccountAlias; got != "dsi-sso" {
			t.Fatalf("run %d: first account %q", run, got)
		}
		groups := tree.Accounts[0].Regions[0].Groups
		var envs []string
		for _, g := range groups {
			envs = append(envs, g.Tag2)
		}
		if len(envs) != 3 || envs[0] != "DEV" || envs[1] != "PROD" || envs[2] != "VAL" {
			t.Fatalf("run %d: environment order %v", run, envs)
		}
		if groups[0].Instances[0].Name != "syca-mo-bastion-dev" {
			t.Fatalf("run %d: host order %q first", run, groups[0].Instances[0].Name)
		}
	}
}
