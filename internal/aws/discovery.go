package aws

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"cloudterm-go/internal/config"
	"cloudterm-go/internal/types"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"gopkg.in/yaml.v3"
)

// Discovery handles AWS EC2 instance discovery, caching, and persistence.
type Discovery struct {
	cfg        *config.Config
	logger     *log.Logger
	cache      *types.ScanResult
	scanning   bool
	scanStatus types.ScanStatus
	mu         sync.RWMutex
}

// NewDiscovery creates a new Discovery service.
func NewDiscovery(cfg *config.Config, logger *log.Logger) *Discovery {
	return &Discovery{
		cfg:    cfg,
		logger: logger,
	}
}

// IsScanning returns whether a scan is currently in progress.
func (d *Discovery) IsScanning() bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.scanning
}

// ScanStatus returns the current scan progress.
func (d *Discovery) ScanStatus() types.ScanStatus {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.scanStatus
}

// GetInstances returns the cached instance tree, loading from YAML if needed.
func (d *Discovery) GetInstances() (*types.InstanceTree, error) {
	d.mu.RLock()
	if d.cache != nil {
		tree := d.cache.Data
		d.mu.RUnlock()
		return tree, nil
	}
	d.mu.RUnlock()

	// Try loading from YAML file; if it doesn't exist yet, return empty tree.
	result, err := d.loadFromYAML()
	if err != nil {
		return &types.InstanceTree{}, nil
	}

	d.mu.Lock()
	d.cache = result
	d.mu.Unlock()

	return result.Data, nil
}

// GetAllInstances returns a flat list of all instances.
func (d *Discovery) GetAllInstances() ([]types.EC2Instance, error) {
	d.mu.RLock()
	if d.cache != nil {
		instances := d.cache.Instances
		d.mu.RUnlock()
		return instances, nil
	}
	d.mu.RUnlock()

	result, err := d.loadFromYAML()
	if err != nil {
		return nil, nil
	}

	d.mu.Lock()
	d.cache = result
	d.mu.Unlock()

	return result.Instances, nil
}

// GetFleetStats computes aggregate fleet statistics from cached data.
func (d *Discovery) GetFleetStats() types.FleetStats {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.cache == nil || d.cache.Instances == nil {
		return types.FleetStats{}
	}

	stats := types.FleetStats{Total: len(d.cache.Instances)}
	accounts := make(map[string]struct{})
	for _, inst := range d.cache.Instances {
		switch inst.State {
		case "running":
			stats.Running++
		case "stopped":
			stats.Stopped++
		}
		if inst.Platform == "windows" {
			stats.Windows++
		}
		if strings.EqualFold(inst.OS, "rhel") || strings.Contains(strings.ToLower(inst.OS), "red hat") {
			stats.RHEL++
		}
		// Count by account ID when available, otherwise by profile.
		key := inst.AWSProfile
		if inst.AccountID != "" {
			key = inst.AccountID
		}
		accounts[key] = struct{}{}
	}
	stats.Accounts = len(accounts)
	return stats
}

// GetFleetSummary returns a detailed fleet summary with per-account breakdown and dynamic platform counts.
func (d *Discovery) GetFleetSummary() types.FleetSummary {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.cache == nil || d.cache.Instances == nil {
		return types.FleetSummary{Platforms: map[string]int{}}
	}

	summary := types.FleetSummary{
		Total:     len(d.cache.Instances),
		Platforms: make(map[string]int),
	}

	if d.cache.ScanDuration > 0 {
		summary.ScanDuration = d.cache.ScanDuration.Round(time.Second).String()
	}

	// Per-account aggregation keyed by accountID (or profile as fallback).
	type acctKey struct {
		accountID, alias, profile string
	}
	acctMap := make(map[string]*types.AccountStats)
	acctOrder := []string{}

	for _, inst := range d.cache.Instances {
		// Global counts.
		switch inst.State {
		case "running":
			summary.Running++
		case "stopped":
			summary.Stopped++
		}

		// Dynamic platform detection: use OS if available, else Platform.
		platform := inst.OS
		if platform == "" {
			platform = inst.Platform
		}
		if platform == "" {
			platform = "unknown"
		}
		summary.Platforms[platform]++

		// Per-account.
		key := inst.AWSProfile
		if inst.AccountID != "" {
			key = inst.AccountID
		}
		acct, ok := acctMap[key]
		if !ok {
			acct = &types.AccountStats{
				AccountID:    inst.AccountID,
				AccountAlias: inst.AccountAlias,
				Profile:      inst.AWSProfile,
				Platforms:    make(map[string]int),
			}
			acctMap[key] = acct
			acctOrder = append(acctOrder, key)
		}
		acct.Total++
		switch inst.State {
		case "running":
			acct.Running++
		case "stopped":
			acct.Stopped++
		}
		acct.Platforms[platform]++
	}

	for _, key := range acctOrder {
		summary.Accounts = append(summary.Accounts, *acctMap[key])
	}
	return summary
}

// ScanRegion re-scans a single profile+region and merges results into the cache.
func (d *Discovery) ScanRegion(profile, region string) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithSharedConfigProfile(profile),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to load AWS config: %w", err)
	}

	// Resolve account info.
	var accountID, accountAlias string
	stsClient := sts.NewFromConfig(awsCfg)
	identity, err := stsClient.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	if err == nil && identity.Account != nil {
		accountID = *identity.Account
	}
	iamClient := iam.NewFromConfig(awsCfg)
	aliases, err := iamClient.ListAccountAliases(ctx, &iam.ListAccountAliasesInput{})
	if err == nil && len(aliases.AccountAliases) > 0 {
		accountAlias = aliases.AccountAliases[0]
	}

	ec2Client := ec2.NewFromConfig(awsCfg)
	instances, ownerID, err := discoverInstances(ctx, ec2Client, profile, region, accountID, accountAlias, d.cfg)
	if err != nil {
		return 0, fmt.Errorf("discover failed: %w", err)
	}
	if accountID == "" && ownerID != "" {
		accountID = ownerID
		for i := range instances {
			instances[i].AccountID = ownerID
		}
	}

	// Merge into cache: remove old instances for this profile+region, add new ones.
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.cache == nil {
		d.cache = &types.ScanResult{Timestamp: time.Now()}
	}

	var kept []types.EC2Instance
	for _, inst := range d.cache.Instances {
		if !(inst.AWSProfile == profile && inst.AWSRegion == region) {
			kept = append(kept, inst)
		}
	}
	kept = append(kept, instances...)
	d.cache.Instances = kept
	d.cache.Data = buildInstanceTree(kept)
	d.cache.Timestamp = time.Now()

	d.logger.Printf("Region scan complete: %s/%s → %d instances", profile, region, len(instances))
	return len(instances), nil
}

// GetInstanceConfig looks up the profile and region for a given instance ID.
func (d *Discovery) GetInstanceConfig(instanceID string) (profile, region string, err error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if d.cache == nil || d.cache.Instances == nil {
		return "", "", fmt.Errorf("no cached data available")
	}

	for _, inst := range d.cache.Instances {
		if inst.InstanceID == instanceID {
			return inst.AWSProfile, inst.AWSRegion, nil
		}
	}
	return "", "", fmt.Errorf("instance %s not found", instanceID)
}

// BackgroundScanLoop runs a scan immediately and then repeats every CacheTTLSeconds.
func (d *Discovery) BackgroundScanLoop(ctx context.Context) {
	d.logger.Println("Starting background scan loop")

	// Run initial scan
	if _, err := d.Scan(false); err != nil {
		d.logger.Printf("Initial scan error: %v", err)
	}

	ticker := time.NewTicker(time.Duration(d.cfg.CacheTTLSeconds) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			d.logger.Println("Background scan loop stopped")
			return
		case <-ticker.C:
			if _, err := d.Scan(false); err != nil {
				d.logger.Printf("Background scan error: %v", err)
			}
		}
	}
}

// Scan performs a full EC2 instance discovery across all profiles and regions.
// If force is false and a valid cache exists within TTL, it returns the cached result.
func (d *Discovery) Scan(force bool) (*types.ScanResult, error) {
	d.mu.RLock()
	if !force && d.cache != nil && time.Since(d.cache.Timestamp) < time.Duration(d.cfg.CacheTTLSeconds)*time.Second {
		result := d.cache
		d.mu.RUnlock()
		return result, nil
	}
	if d.scanning {
		d.mu.RUnlock()
		return nil, fmt.Errorf("scan already in progress")
	}
	d.mu.RUnlock()

	d.mu.Lock()
	// Double-check after acquiring write lock
	if d.scanning {
		d.mu.Unlock()
		return nil, fmt.Errorf("scan already in progress")
	}
	d.scanning = true
	d.scanStatus = types.ScanStatus{Status: "scanning", Message: "Starting scan..."}
	d.mu.Unlock()

	scanStart := time.Now()

	defer func() {
		d.mu.Lock()
		d.scanning = false
		d.mu.Unlock()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	profiles := parseAWSProfiles()
	if len(profiles) == 0 {
		d.logger.Println("No AWS profiles found in ~/.aws/credentials")
		d.mu.Lock()
		d.scanStatus = types.ScanStatus{Status: "error", Message: "No AWS profiles found"}
		d.mu.Unlock()
		return nil, fmt.Errorf("no AWS profiles found")
	}

	regions := getAWSRegions(ctx, d.logger)
	d.logger.Printf("Scanning %d profiles across %d regions", len(profiles), len(regions))

	var allInstances []types.EC2Instance
	scannedCombinations := 0
	successfulRegions := 0
	totalCombinations := len(profiles) * len(regions)

	// accountInfo caches account ID and alias per profile to avoid repeated STS/IAM calls.
	type accountMeta struct {
		accountID    string
		accountAlias string
	}
	accountCache := make(map[string]*accountMeta)
	var accountMu sync.Mutex

	// Use a semaphore to limit concurrency.
	sem := make(chan struct{}, 10)
	var wg sync.WaitGroup
	var instancesMu sync.Mutex

	for _, profile := range profiles {
		for _, region := range regions {
			wg.Add(1)
			go func(profile, region string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
					awsconfig.WithRegion(region),
					awsconfig.WithSharedConfigProfile(profile),
				)
				if err != nil {
					return
				}

				// Resolve account info (cached per profile)
				accountMu.Lock()
				meta, haveMeta := accountCache[profile]
				accountMu.Unlock()

				if !haveMeta {
					meta = &accountMeta{}
					stsClient := sts.NewFromConfig(awsCfg)
					identity, err := stsClient.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
					if err == nil && identity.Account != nil {
						meta.accountID = *identity.Account
					}

					iamClient := iam.NewFromConfig(awsCfg)
					aliases, err := iamClient.ListAccountAliases(ctx, &iam.ListAccountAliasesInput{})
					if err == nil && len(aliases.AccountAliases) > 0 {
						meta.accountAlias = aliases.AccountAliases[0]
					}

					accountMu.Lock()
					accountCache[profile] = meta
					accountMu.Unlock()
				}

				ec2Client := ec2.NewFromConfig(awsCfg)
				instances, ownerID, err := discoverInstances(ctx, ec2Client, profile, region, meta.accountID, meta.accountAlias, d.cfg)
				if err != nil {
					// Silently skip regions that fail (e.g., opt-in regions not enabled)
					return
				}

				// Backfill account ID from reservation OwnerId when STS failed.
				if meta.accountID == "" && ownerID != "" {
					accountMu.Lock()
					meta.accountID = ownerID
					accountMu.Unlock()
					for i := range instances {
						instances[i].AccountID = ownerID
					}
				}

				instancesMu.Lock()
				allInstances = append(allInstances, instances...)
				successfulRegions++
				instancesMu.Unlock()

				scannedCombinations++
				d.mu.Lock()
				d.scanStatus = types.ScanStatus{
					Status:              "scanning",
					ScannedCombinations: scannedCombinations,
					SuccessfulRegions:   successfulRegions,
					TotalInstances:      len(allInstances),
					Message:             fmt.Sprintf("Scanned %d/%d combinations", scannedCombinations, totalCombinations),
				}
				d.mu.Unlock()
			}(profile, region)
		}
	}

	wg.Wait()

	// Backfill instances whose profile got an account ID resolved after they were created.
	for i := range allInstances {
		if allInstances[i].AccountID == "" {
			if m, ok := accountCache[allInstances[i].AWSProfile]; ok && m.accountID != "" {
				allInstances[i].AccountID = m.accountID
			}
		}
	}

	tree := buildInstanceTree(allInstances)

	result := &types.ScanResult{
		Data:         tree,
		Instances:    allInstances,
		Timestamp:    time.Now(),
		ScanDuration: time.Since(scanStart),
	}

	d.mu.Lock()
	d.cache = result
	d.scanStatus = types.ScanStatus{
		Status:              "completed",
		ScannedCombinations: totalCombinations,
		SuccessfulRegions:   successfulRegions,
		TotalInstances:      len(allInstances),
		Message:             fmt.Sprintf("Scan complete: %d instances found", len(allInstances)),
	}
	d.mu.Unlock()

	if err := d.saveToYAML(allInstances); err != nil {
		d.logger.Printf("Warning: failed to save instances to YAML: %v", err)
	}

	d.logger.Printf("Scan complete: %d instances across %d successful regions", len(allInstances), successfulRegions)
	return result, nil
}

// discoverInstances calls EC2 DescribeInstances for a single profile+region and returns parsed instances.
// The returned ownerID is the reservation OwnerId (useful as fallback when STS fails).
func discoverInstances(ctx context.Context, client *ec2.Client, profile, region, accountID, accountAlias string, cfg *config.Config) ([]types.EC2Instance, string, error) {
	var instances []types.EC2Instance
	var ownerID string
	paginator := ec2.NewDescribeInstancesPaginator(client, &ec2.DescribeInstancesInput{})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, "", err
		}
		for _, reservation := range page.Reservations {
			if ownerID == "" && reservation.OwnerId != nil {
				ownerID = *reservation.OwnerId
			}
			for _, inst := range reservation.Instances {
				ec2Inst := parseInstance(inst, profile, region, accountID, accountAlias, cfg)
				instances = append(instances, ec2Inst)
			}
		}
	}
	return instances, ownerID, nil
}

// parseInstance extracts an EC2Instance from the SDK instance type.
func parseInstance(inst ec2types.Instance, profile, region, accountID, accountAlias string, cfg *config.Config) types.EC2Instance {
	name := ""
	tag1 := ""
	tag2 := ""
	allTags := make(map[string]string, len(inst.Tags))
	for _, tag := range inst.Tags {
		key := aws.ToString(tag.Key)
		val := aws.ToString(tag.Value)
		allTags[key] = val
		switch key {
		case "Name":
			name = val
		case cfg.Tag1:
			tag1 = val
		case cfg.Tag2:
			tag2 = val
		}
	}

	platform := "linux"
	if strings.EqualFold(string(inst.Platform), "windows") ||
		strings.Contains(strings.ToLower(aws.ToString(inst.PlatformDetails)), "windows") {
		platform = "windows"
	}

	osType := detectOS(inst, platform)

	state := ""
	if inst.State != nil {
		state = string(inst.State.Name)
	}

	privateIP := aws.ToString(inst.PrivateIpAddress)
	publicIP := aws.ToString(inst.PublicIpAddress)
	instanceType := string(inst.InstanceType)
	launchTime := ""
	if inst.LaunchTime != nil {
		launchTime = inst.LaunchTime.Format(time.RFC3339)
	}

	amiID := aws.ToString(inst.ImageId)
	instanceProfile := ""
	if inst.IamInstanceProfile != nil {
		instanceProfile = aws.ToString(inst.IamInstanceProfile.Arn)
	}

	return types.EC2Instance{
		InstanceID:      aws.ToString(inst.InstanceId),
		Name:            name,
		PrivateIP:       privateIP,
		PublicIP:        publicIP,
		State:           state,
		Platform:        platform,
		OS:              osType,
		InstanceType:    instanceType,
		AWSProfile:      profile,
		AWSRegion:       region,
		AccountID:       accountID,
		AccountAlias:    accountAlias,
		Tag1Value:       tag1,
		Tag2Value:       tag2,
		LaunchTime:      launchTime,
		AMIID:           amiID,
		InstanceProfile: instanceProfile,
		Tags:            allTags,
	}
}

// detectOS tries to determine the OS from the instance image description or platform details.
func detectOS(inst ec2types.Instance, platform string) string {
	if platform == "windows" {
		return "windows"
	}
	// Check PlatformDetails for hints
	details := strings.ToLower(aws.ToString(inst.PlatformDetails))
	switch {
	case strings.Contains(details, "red hat"):
		return "rhel"
	case strings.Contains(details, "suse"):
		return "suse"
	case strings.Contains(details, "ubuntu"):
		return "ubuntu"
	case strings.Contains(details, "amazon"):
		return "amazon-linux"
	default:
		return "linux"
	}
}

// buildInstanceTree organizes a flat list of instances into the 4-level hierarchy.
func buildInstanceTree(instances []types.EC2Instance) *types.InstanceTree {
	// Group by account key → region → tag1 → tag2
	type tag2Group struct {
		instances []types.EC2Instance
	}
	type tag1Group struct {
		tag2s map[string]*tag2Group
	}
	type regionGroup struct {
		tag1s map[string]*tag1Group
	}
	type accountGroup struct {
		accountID    string
		accountAlias string
		profile      string
		regions      map[string]*regionGroup
	}

	accounts := make(map[string]*accountGroup) // keyed by display name

	for _, inst := range instances {
		// Group by account ID when available, otherwise by profile name.
		// This ensures each AWS account (or profile) gets its own tree entry.
		accountKey := inst.AWSProfile
		if inst.AccountID != "" {
			accountKey = inst.AccountID
		}

		acct, ok := accounts[accountKey]
		if !ok {
			acct = &accountGroup{
				accountID:    inst.AccountID,
				accountAlias: inst.AccountAlias,
				profile:      inst.AWSProfile,
				regions:      make(map[string]*regionGroup),
			}
			accounts[accountKey] = acct
		}

		rg, ok := acct.regions[inst.AWSRegion]
		if !ok {
			rg = &regionGroup{tag1s: make(map[string]*tag1Group)}
			acct.regions[inst.AWSRegion] = rg
		}

		t1Key := inst.Tag1Value
		if t1Key == "" {
			t1Key = "Untagged"
		}
		t1, ok := rg.tag1s[t1Key]
		if !ok {
			t1 = &tag1Group{tag2s: make(map[string]*tag2Group)}
			rg.tag1s[t1Key] = t1
		}

		t2Key := inst.Tag2Value
		if t2Key == "" {
			t2Key = "Untagged"
		}
		t2, ok := t1.tag2s[t2Key]
		if !ok {
			t2 = &tag2Group{}
			t1.tag2s[t2Key] = t2
		}

		t2.instances = append(t2.instances, inst)
	}

	tree := &types.InstanceTree{}
	for accountKey, acct := range accounts {
		_ = accountKey
		node := types.AccountNode{
			AccountID:    acct.accountID,
			AccountAlias: acct.accountAlias,
			Profile:      acct.profile,
		}
		for regionName, rg := range acct.regions {
			rn := types.RegionNode{Region: regionName}
			for t1Name, t1 := range rg.tag1s {
				for t2Name, t2 := range t1.tag2s {
					rn.Groups = append(rn.Groups, types.TagGroup{
						Tag1:      t1Name,
						Tag2:      t2Name,
						Instances: t2.instances,
					})
				}
			}
			node.Regions = append(node.Regions, rn)
		}
		tree.Accounts = append(tree.Accounts, node)
	}

	return tree
}

// --- YAML persistence ---

// yamlAccountEntry matches the YAML file format for backward compatibility with Python code.
type yamlAccountEntry struct {
	AWSProfile string                       `yaml:"aws_profile"`
	AccountID  string                       `yaml:"account_id"`
	Regions    map[string]yamlRegionEntry   `yaml:"regions,omitempty"`
}

type yamlRegionEntry struct {
	Customers map[string]yamlCustomerEntry `yaml:"customers,omitempty"`
}

type yamlCustomerEntry struct {
	Environments map[string]yamlEnvironmentEntry `yaml:"environments,omitempty"`
}

type yamlEnvironmentEntry struct {
	Instances []yamlInstanceEntry `yaml:"instances,omitempty"`
}

type yamlInstanceEntry struct {
	Name         string `yaml:"name"`
	InstanceID   string `yaml:"instance_id"`
	Region       string `yaml:"region"`
	AWSProfile   string `yaml:"aws_profile"`
	State        string `yaml:"state"`
	Platform     string `yaml:"platform"`
	InstanceType string `yaml:"instance_type,omitempty"`
	PrivateIP    string `yaml:"private_ip,omitempty"`
	PublicIP     string `yaml:"public_ip,omitempty"`
}

// saveToYAML writes the instance data to the YAML file in the Python-compatible format.
func (d *Discovery) saveToYAML(instances []types.EC2Instance) error {
	// Build the structure: accountKey -> yamlAccountEntry
	accounts := make(map[string]*yamlAccountEntry)

	for _, inst := range instances {
		accountKey := fmt.Sprintf("AWS_Account_%s", inst.AccountID)
		if inst.AccountAlias != "" {
			accountKey = inst.AccountAlias
		}

		acct, ok := accounts[accountKey]
		if !ok {
			acct = &yamlAccountEntry{
				AWSProfile: inst.AWSProfile,
				AccountID:  inst.AccountID,
				Regions:    make(map[string]yamlRegionEntry),
			}
			accounts[accountKey] = acct
		}

		rg, ok := acct.Regions[inst.AWSRegion]
		if !ok {
			rg = yamlRegionEntry{Customers: make(map[string]yamlCustomerEntry)}
		}

		t1Key := inst.Tag1Value
		if t1Key == "" {
			t1Key = "Untagged"
		}
		cust, ok := rg.Customers[t1Key]
		if !ok {
			cust = yamlCustomerEntry{Environments: make(map[string]yamlEnvironmentEntry)}
		}

		t2Key := inst.Tag2Value
		if t2Key == "" {
			t2Key = "Untagged"
		}
		env := cust.Environments[t2Key]

		env.Instances = append(env.Instances, yamlInstanceEntry{
			Name:         inst.Name,
			InstanceID:   inst.InstanceID,
			Region:       inst.AWSRegion,
			AWSProfile:   inst.AWSProfile,
			State:        inst.State,
			Platform:     inst.Platform,
			InstanceType: inst.InstanceType,
			PrivateIP:    inst.PrivateIP,
			PublicIP:     inst.PublicIP,
		})

		cust.Environments[t2Key] = env
		rg.Customers[t1Key] = cust
		acct.Regions[inst.AWSRegion] = rg
	}

	// Marshal to ordered YAML
	data, err := yaml.Marshal(accounts)
	if err != nil {
		return fmt.Errorf("marshal YAML: %w", err)
	}

	path := d.cfg.InstancesFile
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}

	d.logger.Printf("Saved %d instances to %s", len(instances), path)
	return nil
}

// loadFromYAML reads the YAML file and reconstructs the scan result.
func (d *Discovery) loadFromYAML() (*types.ScanResult, error) {
	path := d.cfg.InstancesFile
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	// Parse the Python-compatible YAML format
	var raw map[string]yamlAccountEntry
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("unmarshal YAML: %w", err)
	}

	var allInstances []types.EC2Instance
	tree := &types.InstanceTree{}

	for accountKey, acct := range raw {
		_ = accountKey
		node := types.AccountNode{
			AccountID:    acct.AccountID,
			AccountAlias: accountKey,
			Profile:      acct.AWSProfile,
		}

		for regionName, rg := range acct.Regions {
			rn := types.RegionNode{Region: regionName}
			for custName, cust := range rg.Customers {
				for envName, env := range cust.Environments {
					var groupInstances []types.EC2Instance
					for _, yi := range env.Instances {
						inst := types.EC2Instance{
							InstanceID:   yi.InstanceID,
							Name:         yi.Name,
							PrivateIP:    yi.PrivateIP,
							PublicIP:     yi.PublicIP,
							State:        yi.State,
							Platform:     yi.Platform,
							InstanceType: yi.InstanceType,
							AWSProfile:   yi.AWSProfile,
							AWSRegion:    yi.Region,
							AccountID:    acct.AccountID,
							AccountAlias: accountKey,
							Tag1Value:    custName,
							Tag2Value:    envName,
						}
						groupInstances = append(groupInstances, inst)
						allInstances = append(allInstances, inst)
					}
					rn.Groups = append(rn.Groups, types.TagGroup{
						Tag1:      custName,
						Tag2:      envName,
						Instances: groupInstances,
					})
				}
			}
			node.Regions = append(node.Regions, rn)
		}

		tree.Accounts = append(tree.Accounts, node)
	}

	info, _ := os.Stat(path)
	ts := time.Now()
	if info != nil {
		ts = info.ModTime()
	}

	return &types.ScanResult{
		Data:      tree,
		Instances: allInstances,
		Timestamp: ts,
	}, nil
}

// --- AWS profile and region helpers ---

// parseAWSProfiles reads profile names from ~/.aws/credentials.
func parseAWSProfiles() []string {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	path := filepath.Join(home, ".aws", "credentials")
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var profiles []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			profile := strings.TrimPrefix(strings.TrimSuffix(line, "]"), "[")
			profile = strings.TrimSpace(profile)
			if profile != "" {
				profiles = append(profiles, profile)
			}
		}
	}
	return profiles
}

// getAWSRegions fetches all AWS regions via the CLI, falling back to a hardcoded list.
func getAWSRegions(ctx context.Context, logger *log.Logger) []string {
	regions, err := fetchRegionsFromCLI(ctx)
	if err == nil && len(regions) > 0 {
		return regions
	}
	if err != nil {
		logger.Printf("Failed to fetch regions from CLI, using fallback: %v", err)
	}
	return fallbackRegions()
}

// fetchRegionsFromCLI calls aws ec2 describe-regions --all-regions and parses the JSON output.
func fetchRegionsFromCLI(ctx context.Context) ([]string, error) {
	cmd := exec.CommandContext(ctx, "aws", "ec2", "describe-regions", "--all-regions", "--output", "json")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var result struct {
		Regions []struct {
			RegionName string `json:"RegionName"`
		} `json:"Regions"`
	}
	if err := json.Unmarshal(out, &result); err != nil {
		return nil, fmt.Errorf("parse describe-regions output: %w", err)
	}

	var regions []string
	for _, r := range result.Regions {
		regions = append(regions, r.RegionName)
	}
	return regions, nil
}

// fallbackRegions returns a hardcoded list of commonly used AWS regions.
func fallbackRegions() []string {
	return []string{
		"us-east-1",
		"us-east-2",
		"us-west-1",
		"us-west-2",
		"af-south-1",
		"ap-east-1",
		"ap-south-1",
		"ap-south-2",
		"ap-southeast-1",
		"ap-southeast-2",
		"ap-southeast-3",
		"ap-northeast-1",
		"ap-northeast-2",
		"ap-northeast-3",
		"ca-central-1",
		"eu-central-1",
		"eu-central-2",
		"eu-west-1",
		"eu-west-2",
		"eu-west-3",
		"eu-south-1",
		"eu-south-2",
		"eu-north-1",
		"me-south-1",
		"me-central-1",
		"sa-east-1",
	}
}
