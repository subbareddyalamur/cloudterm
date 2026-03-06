package aws

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
	elbv2 "github.com/aws/aws-sdk-go-v2/service/elasticloadbalancingv2"

	"cloudterm-go/internal/types"
)

// SGRule is a simplified security group rule for JSON output.
type SGRule struct {
	GroupID   string `json:"group_id"`
	GroupName string `json:"group_name"`
	Direction string `json:"direction"` // "inbound" or "outbound"
	Protocol  string `json:"protocol"`
	FromPort  int32  `json:"from_port"`
	ToPort    int32  `json:"to_port"`
	Source    string `json:"source"` // CIDR or SG ID
}

// NACLRule is a simplified NACL rule.
type NACLRule struct {
	NACLID     string `json:"nacl_id"`
	RuleNumber int32  `json:"rule_number"`
	Direction  string `json:"direction"` // "inbound" or "outbound"
	Protocol   string `json:"protocol"`
	FromPort   int32  `json:"from_port"`
	ToPort     int32  `json:"to_port"`
	CIDRBlock  string `json:"cidr_block"`
	Action     string `json:"action"` // "allow" or "deny"
}

// Route is a simplified route table entry.
type Route struct {
	RouteTableID string `json:"route_table_id"`
	Destination  string `json:"destination"`
	Target       string `json:"target"`
	State        string `json:"state"`
}

// LBInfo describes a load balancer and its target health.
type LBInfo struct {
	Name      string     `json:"name"`
	DNSName   string     `json:"dns_name"`
	Type      string     `json:"type"`
	Scheme    string     `json:"scheme"`
	Listeners []string   `json:"listeners"`
	Targets   []LBTarget `json:"targets"`
}

// LBTarget is a target in a target group.
type LBTarget struct {
	TargetID    string `json:"target_id"`
	Port        int32  `json:"port"`
	HealthState string `json:"health_state"`
	Reason      string `json:"reason,omitempty"`
}

// findCachedInstance looks up an instance by ID from the cached scan results.
func (d *Discovery) findCachedInstance(instanceID string) (*types.EC2Instance, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	if d.cache == nil {
		return nil, fmt.Errorf("no cached instances")
	}
	for i := range d.cache.Instances {
		if d.cache.Instances[i].InstanceID == instanceID {
			return &d.cache.Instances[i], nil
		}
	}
	return nil, fmt.Errorf("instance %s not found in cache", instanceID)
}

// DescribeInstance returns cached instance details as a formatted string.
func (d *Discovery) DescribeInstance(instanceID string) (string, error) {
	inst, err := d.findCachedInstance(instanceID)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Instance: %s (%s)\n", inst.InstanceID, inst.Name))
	sb.WriteString(fmt.Sprintf("State: %s\n", inst.State))
	sb.WriteString(fmt.Sprintf("Instance Type: %s\n", inst.InstanceType))
	sb.WriteString(fmt.Sprintf("Platform: %s | OS: %s\n", inst.Platform, inst.OS))
	sb.WriteString(fmt.Sprintf("Private IP: %s\n", inst.PrivateIP))
	if inst.PublicIP != "" {
		sb.WriteString(fmt.Sprintf("Public IP: %s\n", inst.PublicIP))
	}
	sb.WriteString(fmt.Sprintf("VPC: %s\n", inst.VpcID))
	sb.WriteString(fmt.Sprintf("Subnet: %s\n", inst.SubnetID))
	if len(inst.SecurityGroups) > 0 {
		sb.WriteString(fmt.Sprintf("Security Groups: %s\n", strings.Join(inst.SecurityGroups, ", ")))
	}
	if inst.InstanceProfile != "" {
		sb.WriteString(fmt.Sprintf("IAM Instance Profile: %s\n", inst.InstanceProfile))
	} else {
		sb.WriteString("IAM Instance Profile: (none)\n")
	}
	sb.WriteString(fmt.Sprintf("AMI: %s\n", inst.AMIID))
	sb.WriteString(fmt.Sprintf("Launch Time: %s\n", inst.LaunchTime))
	sb.WriteString(fmt.Sprintf("Account: %s (%s) | Region: %s | Profile: %s\n", inst.AccountID, inst.AccountAlias, inst.AWSRegion, inst.AWSProfile))
	if len(inst.Tags) > 0 {
		sb.WriteString("Tags:\n")
		for k, v := range inst.Tags {
			sb.WriteString(fmt.Sprintf("  %s = %s\n", k, v))
		}
	}
	return sb.String(), nil
}

// ec2ClientForInstance creates an EC2 client for the instance's region/profile.
func (d *Discovery) ec2ClientForInstance(ctx context.Context, inst *types.EC2Instance) (*ec2.Client, error) {
	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(inst.AWSRegion),
	}
	if inst.AWSProfile != "" {
		opts = append(opts, awsconfig.WithSharedConfigProfile(inst.AWSProfile))
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}
	return ec2.NewFromConfig(cfg), nil
}

// DescribeSecurityGroups returns all SG rules for an instance.
func (d *Discovery) DescribeSecurityGroups(ctx context.Context, instanceID string) (string, error) {
	inst, err := d.findCachedInstance(instanceID)
	if err != nil {
		return "", err
	}
	if len(inst.SecurityGroups) == 0 {
		return "[]", nil
	}

	client, err := d.ec2ClientForInstance(ctx, inst)
	if err != nil {
		return "", err
	}

	out, err := client.DescribeSecurityGroups(ctx, &ec2.DescribeSecurityGroupsInput{
		GroupIds: inst.SecurityGroups,
	})
	if err != nil {
		return "", fmt.Errorf("describe security groups: %w", err)
	}

	var rules []SGRule
	for _, sg := range out.SecurityGroups {
		gid := aws.ToString(sg.GroupId)
		gname := aws.ToString(sg.GroupName)
		for _, perm := range sg.IpPermissions {
			base := SGRule{
				GroupID:   gid,
				GroupName: gname,
				Direction: "inbound",
				Protocol:  aws.ToString(perm.IpProtocol),
				FromPort:  aws.ToInt32(perm.FromPort),
				ToPort:    aws.ToInt32(perm.ToPort),
			}
			for _, r := range perm.IpRanges {
				rule := base
				rule.Source = aws.ToString(r.CidrIp)
				rules = append(rules, rule)
			}
			for _, r := range perm.Ipv6Ranges {
				rule := base
				rule.Source = aws.ToString(r.CidrIpv6)
				rules = append(rules, rule)
			}
			for _, r := range perm.UserIdGroupPairs {
				rule := base
				rule.Source = aws.ToString(r.GroupId)
				rules = append(rules, rule)
			}
		}
		for _, perm := range sg.IpPermissionsEgress {
			base := SGRule{
				GroupID:   gid,
				GroupName: gname,
				Direction: "outbound",
				Protocol:  aws.ToString(perm.IpProtocol),
				FromPort:  aws.ToInt32(perm.FromPort),
				ToPort:    aws.ToInt32(perm.ToPort),
			}
			for _, r := range perm.IpRanges {
				rule := base
				rule.Source = aws.ToString(r.CidrIp)
				rules = append(rules, rule)
			}
			for _, r := range perm.Ipv6Ranges {
				rule := base
				rule.Source = aws.ToString(r.CidrIpv6)
				rules = append(rules, rule)
			}
			for _, r := range perm.UserIdGroupPairs {
				rule := base
				rule.Source = aws.ToString(r.GroupId)
				rules = append(rules, rule)
			}
		}
	}

	b, _ := json.Marshal(rules)
	return string(b), nil
}

// DescribeNetworkACLs returns NACL rules for an instance's subnet.
func (d *Discovery) DescribeNetworkACLs(ctx context.Context, instanceID string) (string, error) {
	inst, err := d.findCachedInstance(instanceID)
	if err != nil {
		return "", err
	}
	if inst.SubnetID == "" {
		return "[]", nil
	}

	client, err := d.ec2ClientForInstance(ctx, inst)
	if err != nil {
		return "", err
	}

	out, err := client.DescribeNetworkAcls(ctx, &ec2.DescribeNetworkAclsInput{
		Filters: []ec2types.Filter{
			{Name: aws.String("association.subnet-id"), Values: []string{inst.SubnetID}},
		},
	})
	if err != nil {
		return "", fmt.Errorf("describe network acls: %w", err)
	}

	var rules []NACLRule
	for _, nacl := range out.NetworkAcls {
		naclID := aws.ToString(nacl.NetworkAclId)
		for _, entry := range nacl.Entries {
			dir := "inbound"
			if aws.ToBool(entry.Egress) {
				dir = "outbound"
			}
			proto := aws.ToString(entry.Protocol)
			var fromPort, toPort int32
			if entry.PortRange != nil {
				fromPort = aws.ToInt32(entry.PortRange.From)
				toPort = aws.ToInt32(entry.PortRange.To)
			}
			action := string(entry.RuleAction)
			cidr := aws.ToString(entry.CidrBlock)
			if cidr == "" {
				cidr = aws.ToString(entry.Ipv6CidrBlock)
			}
			rules = append(rules, NACLRule{
				NACLID:     naclID,
				RuleNumber: aws.ToInt32(entry.RuleNumber),
				Direction:  dir,
				Protocol:   proto,
				FromPort:   fromPort,
				ToPort:     toPort,
				CIDRBlock:  cidr,
				Action:     action,
			})
		}
	}

	b, _ := json.Marshal(rules)
	return string(b), nil
}

// DescribeRouteTables returns routes for an instance's subnet.
func (d *Discovery) DescribeRouteTables(ctx context.Context, instanceID string) (string, error) {
	inst, err := d.findCachedInstance(instanceID)
	if err != nil {
		return "", err
	}
	if inst.SubnetID == "" {
		return "[]", nil
	}

	client, err := d.ec2ClientForInstance(ctx, inst)
	if err != nil {
		return "", err
	}

	out, err := client.DescribeRouteTables(ctx, &ec2.DescribeRouteTablesInput{
		Filters: []ec2types.Filter{
			{Name: aws.String("association.subnet-id"), Values: []string{inst.SubnetID}},
		},
	})
	if err != nil {
		return "", fmt.Errorf("describe route tables: %w", err)
	}

	// If no explicit association, try the VPC's main route table
	if len(out.RouteTables) == 0 && inst.VpcID != "" {
		out, err = client.DescribeRouteTables(ctx, &ec2.DescribeRouteTablesInput{
			Filters: []ec2types.Filter{
				{Name: aws.String("vpc-id"), Values: []string{inst.VpcID}},
				{Name: aws.String("association.main"), Values: []string{"true"}},
			},
		})
		if err != nil {
			return "", fmt.Errorf("describe main route table: %w", err)
		}
	}

	var routes []Route
	for _, rt := range out.RouteTables {
		rtID := aws.ToString(rt.RouteTableId)
		for _, r := range rt.Routes {
			dest := aws.ToString(r.DestinationCidrBlock)
			if dest == "" {
				dest = aws.ToString(r.DestinationIpv6CidrBlock)
			}
			if dest == "" {
				dest = aws.ToString(r.DestinationPrefixListId)
			}

			target := ""
			switch {
			case r.GatewayId != nil:
				target = *r.GatewayId
			case r.NatGatewayId != nil:
				target = *r.NatGatewayId
			case r.InstanceId != nil:
				target = *r.InstanceId
			case r.TransitGatewayId != nil:
				target = *r.TransitGatewayId
			case r.VpcPeeringConnectionId != nil:
				target = *r.VpcPeeringConnectionId
			case r.NetworkInterfaceId != nil:
				target = *r.NetworkInterfaceId
			default:
				target = "local"
			}

			routes = append(routes, Route{
				RouteTableID: rtID,
				Destination:  dest,
				Target:       target,
				State:        string(r.State),
			})
		}
	}

	b, _ := json.Marshal(routes)
	return string(b), nil
}

// DescribeLoadBalancers finds ALBs/NLBs targeting an instance and returns health info.
func (d *Discovery) DescribeLoadBalancers(ctx context.Context, instanceID string) (string, error) {
	inst, err := d.findCachedInstance(instanceID)
	if err != nil {
		return "", err
	}

	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(inst.AWSRegion),
	}
	if inst.AWSProfile != "" {
		opts = append(opts, awsconfig.WithSharedConfigProfile(inst.AWSProfile))
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return "", err
	}
	elbClient := elbv2.NewFromConfig(cfg)

	// List all target groups, then check which ones have this instance
	tgOut, err := elbClient.DescribeTargetGroups(ctx, &elbv2.DescribeTargetGroupsInput{})
	if err != nil {
		return "", fmt.Errorf("describe target groups: %w", err)
	}

	var results []LBInfo
	for _, tg := range tgOut.TargetGroups {
		healthOut, err := elbClient.DescribeTargetHealth(ctx, &elbv2.DescribeTargetHealthInput{
			TargetGroupArn: tg.TargetGroupArn,
		})
		if err != nil {
			continue
		}

		// Check if this instance is a target
		found := false
		var targets []LBTarget
		for _, th := range healthOut.TargetHealthDescriptions {
			if th.Target != nil && aws.ToString(th.Target.Id) == instanceID {
				found = true
			}
			if th.Target != nil {
				t := LBTarget{
					TargetID: aws.ToString(th.Target.Id),
					Port:     aws.ToInt32(th.Target.Port),
				}
				if th.TargetHealth != nil {
					t.HealthState = string(th.TargetHealth.State)
					t.Reason = string(th.TargetHealth.Reason)
				}
				targets = append(targets, t)
			}
		}
		if !found {
			continue
		}

		// Found a TG with our instance — find its LBs
		for _, lbArn := range tg.LoadBalancerArns {
			lbOut, err := elbClient.DescribeLoadBalancers(ctx, &elbv2.DescribeLoadBalancersInput{
				LoadBalancerArns: []string{lbArn},
			})
			if err != nil || len(lbOut.LoadBalancers) == 0 {
				continue
			}
			lb := lbOut.LoadBalancers[0]

			// Get listeners
			listOut, err := elbClient.DescribeListeners(ctx, &elbv2.DescribeListenersInput{
				LoadBalancerArn: lb.LoadBalancerArn,
			})
			var listeners []string
			if err == nil {
				for _, l := range listOut.Listeners {
					listeners = append(listeners, fmt.Sprintf("%s:%d", l.Protocol, aws.ToInt32(l.Port)))
				}
			}

			results = append(results, LBInfo{
				Name:      aws.ToString(lb.LoadBalancerName),
				DNSName:   aws.ToString(lb.DNSName),
				Type:      string(lb.Type),
				Scheme:    string(lb.Scheme),
				Listeners: listeners,
				Targets:   targets,
			})
		}
	}

	b, _ := json.Marshal(results)
	return string(b), nil
}

// GetInstanceSummaries returns minimal instance info for the AI agent context.
func (d *Discovery) GetInstanceSummaries() []map[string]string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	if d.cache == nil {
		return nil
	}
	var out []map[string]string
	for _, inst := range d.cache.Instances {
		out = append(out, map[string]string{
			"instance_id": inst.InstanceID,
			"name":        inst.Name,
			"platform":    inst.Platform,
			"state":       inst.State,
			"private_ip":  inst.PrivateIP,
			"public_ip":   inst.PublicIP,
			"region":      inst.AWSRegion,
		})
	}
	return out
}
