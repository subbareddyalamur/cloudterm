package aws

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"

	"cloudterm-go/internal/types"
)

// DeepAnalysisEvent is a single SSE event sent during deep analysis.
type DeepAnalysisEvent struct {
	Type    string      `json:"type"`    // "status", "hop", "result", "error"
	Message string      `json:"message,omitempty"`
	Hop     *DeepHop    `json:"hop,omitempty"`
	Result  *DeepResult `json:"result,omitempty"`
}

// DeepHop represents a single hop in the deep analysis path.
type DeepHop struct {
	Index         int    `json:"index"`
	Component     string `json:"component"`     // "instance", "eni", "sg", "nacl", "route-table", "igw", "nat", "tgw", "pcx", "vpc-endpoint", "elb", "subnet", "vpc"
	ComponentName string `json:"componentName"` // Human-readable name
	ResourceID    string `json:"resourceId"`
	ResourceARN   string `json:"resourceArn,omitempty"`
	Direction     string `json:"direction,omitempty"` // "inbound", "outbound", ""
	Status        string `json:"status"`              // "allow", "deny", "info"
	Detail        string `json:"detail"`
	MatchedRule   string `json:"matchedRule,omitempty"`
	InVPC         bool   `json:"inVpc"`  // Whether this hop is visible in the topology SVG
	VPCID         string `json:"vpcId,omitempty"`
}

// DeepResult is the final summary of deep analysis.
type DeepResult struct {
	Reachable    bool       `json:"reachable"`
	PathID       string     `json:"pathId"`
	AnalysisID   string     `json:"analysisId"`
	Explanations []string   `json:"explanations,omitempty"`
	HopCount     int        `json:"hopCount"`
	Hops         []DeepHop  `json:"hops"`
	Duration     string     `json:"duration"` // How long the analysis took
}

// DeepAnalyze runs AWS Network Insights analysis and streams hop-by-hop results.
// The callback is called for each event (status updates, hops, final result).
func (d *Discovery) DeepAnalyze(ctx context.Context, sourceInstanceID, destInstanceID, destIP, protocol string, port int32, onEvent func(DeepAnalysisEvent)) error {
	startTime := time.Now()

	// Look up source instance to get profile/region
	sourceInst, err := d.findCachedInstance(sourceInstanceID)
	if err != nil {
		return fmt.Errorf("source instance not found: %w", err)
	}

	client, err := d.ec2ClientForInstance(ctx, sourceInst)
	if err != nil {
		return fmt.Errorf("failed to create EC2 client: %w", err)
	}

	onEvent(DeepAnalysisEvent{Type: "status", Message: "Creating Network Insights Path..."})

	// Determine destination
	destInput := &ec2.CreateNetworkInsightsPathInput{
		Source:   aws.String(sourceInstanceID),
		Protocol: ec2types.Protocol(strings.ToLower(protocol)),
		TagSpecifications: []ec2types.TagSpecification{
			{
				ResourceType: ec2types.ResourceTypeNetworkInsightsPath,
				Tags: []ec2types.Tag{
					{Key: aws.String("Name"), Value: aws.String("cloudterm-deep-analyze")},
					{Key: aws.String("cloudterm-managed"), Value: aws.String("true")},
				},
			},
		},
	}

	if protocol == "tcp" || protocol == "udp" {
		destInput.DestinationPort = aws.Int32(port)
	}

	if destInstanceID != "" {
		destInput.Destination = aws.String(destInstanceID)
	} else if destIP != "" {
		destInput.FilterAtDestination = &ec2types.PathRequestFilter{
			DestinationAddress: aws.String(destIP),
		}
		// For external IPs, we need an IGW or NAT as destination
		// Use the source's VPC IGW if available
		igwID, err := d.findVPCGateway(ctx, client, sourceInst)
		if err != nil || igwID == "" {
			return fmt.Errorf("cannot analyze external path: no internet gateway found for source VPC")
		}
		destInput.Destination = aws.String(igwID)
	}

	// Create the Network Insights Path
	pathOut, err := client.CreateNetworkInsightsPath(ctx, destInput)
	if err != nil {
		return fmt.Errorf("CreateNetworkInsightsPath failed: %w", err)
	}
	pathID := aws.ToString(pathOut.NetworkInsightsPath.NetworkInsightsPathId)

	// Always clean up the path when done
	defer func() {
		cleanCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		client.DeleteNetworkInsightsPath(cleanCtx, &ec2.DeleteNetworkInsightsPathInput{
			NetworkInsightsPathId: aws.String(pathID),
		})
	}()

	onEvent(DeepAnalysisEvent{Type: "status", Message: fmt.Sprintf("Path created (%s). Starting analysis...", pathID)})

	// Start the analysis
	analysisOut, err := client.StartNetworkInsightsAnalysis(ctx, &ec2.StartNetworkInsightsAnalysisInput{
		NetworkInsightsPathId: aws.String(pathID),
		TagSpecifications: []ec2types.TagSpecification{
			{
				ResourceType: ec2types.ResourceTypeNetworkInsightsAnalysis,
				Tags: []ec2types.Tag{
					{Key: aws.String("Name"), Value: aws.String("cloudterm-deep-analyze")},
					{Key: aws.String("cloudterm-managed"), Value: aws.String("true")},
				},
			},
		},
	})
	if err != nil {
		return fmt.Errorf("StartNetworkInsightsAnalysis failed: %w", err)
	}
	analysisID := aws.ToString(analysisOut.NetworkInsightsAnalysis.NetworkInsightsAnalysisId)

	// Clean up the analysis when done
	defer func() {
		cleanCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		client.DeleteNetworkInsightsAnalysis(cleanCtx, &ec2.DeleteNetworkInsightsAnalysisInput{
			NetworkInsightsAnalysisId: aws.String(analysisID),
		})
	}()

	onEvent(DeepAnalysisEvent{Type: "status", Message: fmt.Sprintf("Analysis running (%s)...", analysisID)})

	// Poll for completion
	var analysis *ec2types.NetworkInsightsAnalysis
	for i := 0; i < 60; i++ { // max ~2 minutes
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}

		descOut, err := client.DescribeNetworkInsightsAnalyses(ctx, &ec2.DescribeNetworkInsightsAnalysesInput{
			NetworkInsightsAnalysisIds: []string{analysisID},
		})
		if err != nil {
			return fmt.Errorf("DescribeNetworkInsightsAnalyses failed: %w", err)
		}
		if len(descOut.NetworkInsightsAnalyses) == 0 {
			continue
		}

		a := descOut.NetworkInsightsAnalyses[0]
		status := string(a.Status)

		if status == "running" {
			elapsed := time.Since(startTime).Round(time.Second)
			onEvent(DeepAnalysisEvent{Type: "status", Message: fmt.Sprintf("Analyzing... (%s elapsed)", elapsed)})
			continue
		}

		if status == "failed" {
			errMsg := aws.ToString(a.StatusMessage)
			return fmt.Errorf("analysis failed: %s", errMsg)
		}

		if status == "succeeded" {
			analysis = &a
			break
		}
	}

	if analysis == nil {
		return fmt.Errorf("analysis timed out after 2 minutes")
	}

	onEvent(DeepAnalysisEvent{Type: "status", Message: "Analysis complete. Processing results..."})

	// Parse the results into hops
	sourceVPCID := d.getInstanceVPCID(sourceInst)
	hops := d.parsePathComponents(analysis.ForwardPathComponents, sourceVPCID)
	explanations := d.parseExplanations(analysis.Explanations)

	// Stream each hop as an event
	for i, hop := range hops {
		hop.Index = i
		onEvent(DeepAnalysisEvent{Type: "hop", Hop: &hop})
	}

	duration := time.Since(startTime).Round(time.Millisecond)
	reachable := analysis.NetworkPathFound != nil && *analysis.NetworkPathFound

	result := DeepResult{
		Reachable:    reachable,
		PathID:       pathID,
		AnalysisID:   analysisID,
		Explanations: explanations,
		HopCount:     len(hops),
		Hops:         hops,
		Duration:     duration.String(),
	}

	onEvent(DeepAnalysisEvent{Type: "result", Result: &result})

	return nil
}

// findVPCGateway finds the IGW or NAT gateway for an instance's VPC.
func (d *Discovery) findVPCGateway(ctx context.Context, client *ec2.Client, inst *types.EC2Instance) (string, error) {
	// Get the instance's VPC
	descOut, err := client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
		InstanceIds: []string{inst.InstanceID},
	})
	if err != nil {
		return "", err
	}
	if len(descOut.Reservations) == 0 || len(descOut.Reservations[0].Instances) == 0 {
		return "", fmt.Errorf("instance not found")
	}
	vpcID := aws.ToString(descOut.Reservations[0].Instances[0].VpcId)

	// Look for IGW
	igwOut, err := client.DescribeInternetGateways(ctx, &ec2.DescribeInternetGatewaysInput{
		Filters: []ec2types.Filter{
			{Name: aws.String("attachment.vpc-id"), Values: []string{vpcID}},
		},
	})
	if err == nil && len(igwOut.InternetGateways) > 0 {
		return aws.ToString(igwOut.InternetGateways[0].InternetGatewayId), nil
	}

	return "", fmt.Errorf("no gateway found")
}

// getInstanceVPCID returns the VPC ID for an instance from cache.
func (d *Discovery) getInstanceVPCID(inst *types.EC2Instance) string {
	// Best-effort from cached data
	d.mu.RLock()
	defer d.mu.RUnlock()
	if d.cache == nil {
		return ""
	}
	// The instance struct may not have VPC ID, so we try to find it
	// from the VPC topology data in the topology cache if available
	return ""
}

// parsePathComponents converts AWS ForwardPathComponents to our DeepHop format.
func (d *Discovery) parsePathComponents(components []ec2types.PathComponent, sourceVPCID string) []DeepHop {
	hops := []DeepHop{}

	for _, comp := range components {
		hop := DeepHop{
			Status: "allow", // Forward path components are all on the reachable path
			InVPC:  false,
		}

		// Component identification
		if comp.Component != nil {
			compID := aws.ToString(comp.Component.Id)
			compARN := aws.ToString(comp.Component.Arn)
			hop.ResourceID = compID
			hop.ResourceARN = compARN

			switch {
			case strings.HasPrefix(compID, "i-"):
				hop.Component = "instance"
				hop.ComponentName = d.resolveResourceName(compID, "Instance")
				hop.InVPC = true
			case strings.HasPrefix(compID, "eni-"):
				hop.Component = "eni"
				hop.ComponentName = "Network Interface"
				hop.InVPC = true
			case strings.HasPrefix(compID, "sg-"):
				hop.Component = "sg"
				hop.ComponentName = d.resolveResourceName(compID, "Security Group")
				hop.InVPC = true
			case strings.HasPrefix(compID, "acl-"):
				hop.Component = "nacl"
				hop.ComponentName = "Network ACL"
				hop.InVPC = true
			case strings.HasPrefix(compID, "rtb-"):
				hop.Component = "route-table"
				hop.ComponentName = d.resolveResourceName(compID, "Route Table")
				hop.InVPC = true
			case strings.HasPrefix(compID, "igw-"):
				hop.Component = "igw"
				hop.ComponentName = "Internet Gateway"
				hop.InVPC = true
			case strings.HasPrefix(compID, "nat-"):
				hop.Component = "nat"
				hop.ComponentName = "NAT Gateway"
				hop.InVPC = true
			case strings.HasPrefix(compID, "tgw-"):
				hop.Component = "tgw"
				hop.ComponentName = "Transit Gateway"
				hop.InVPC = false // TGW spans VPCs
			case strings.HasPrefix(compID, "pcx-"):
				hop.Component = "pcx"
				hop.ComponentName = "VPC Peering"
				hop.InVPC = false
			case strings.HasPrefix(compID, "vpce-"):
				hop.Component = "vpc-endpoint"
				hop.ComponentName = "VPC Endpoint"
				hop.InVPC = true
			case strings.HasPrefix(compID, "subnet-"):
				hop.Component = "subnet"
				hop.ComponentName = d.resolveResourceName(compID, "Subnet")
				hop.InVPC = true
			case strings.HasPrefix(compID, "vpc-"):
				hop.Component = "vpc"
				hop.ComponentName = d.resolveResourceName(compID, "VPC")
				hop.InVPC = (compID == sourceVPCID)
			default:
				hop.Component = "unknown"
				hop.ComponentName = compID
			}
		}

		// ACL rule detail
		if comp.AclRule != nil {
			rule := comp.AclRule
			action := "ALLOW"
			if rule.RuleAction != nil {
				action = string(*rule.RuleAction)
			}
			hop.Direction = "inbound"
			if comp.OutboundHeader != nil {
				hop.Direction = "outbound"
			} else if comp.InboundHeader != nil {
				hop.Direction = "inbound"
			}
			hop.MatchedRule = fmt.Sprintf("Rule %d: %s %s %s",
				aws.ToInt32(rule.RuleNumber),
				strings.ToUpper(action),
				aws.ToString(rule.Protocol),
				aws.ToString(rule.Cidr))
			if action == "deny" || action == "DENY" {
				hop.Status = "deny"
			}
		}

		// Security group rule detail
		if comp.SecurityGroupRule != nil {
			rule := comp.SecurityGroupRule
			direction := aws.ToString(rule.Direction)
			hop.Direction = direction
			cidr := aws.ToString(rule.Cidr)
			if cidr == "" {
				cidr = aws.ToString(rule.PrefixListId)
			}
			portRange := ""
			if rule.PortRange != nil {
				if aws.ToInt32(rule.PortRange.From) == aws.ToInt32(rule.PortRange.To) {
					portRange = fmt.Sprintf("port %d", aws.ToInt32(rule.PortRange.From))
				} else {
					portRange = fmt.Sprintf("ports %d-%d", aws.ToInt32(rule.PortRange.From), aws.ToInt32(rule.PortRange.To))
				}
			}
			hop.MatchedRule = fmt.Sprintf("SG %s: %s %s %s %s",
				aws.ToString(rule.SecurityGroupId),
				direction,
				aws.ToString(rule.Protocol),
				portRange,
				cidr)
		}

		// Route table route detail
		if comp.RouteTableRoute != nil {
			route := comp.RouteTableRoute
			dest := aws.ToString(route.DestinationCidr)
			if dest == "" {
				dest = aws.ToString(route.DestinationPrefixListId)
			}
			target := ""
			if route.NatGatewayId != nil {
				target = "nat:" + aws.ToString(route.NatGatewayId)
			} else if route.GatewayId != nil {
				target = "gw:" + aws.ToString(route.GatewayId)
			} else if route.TransitGatewayId != nil {
				target = "tgw:" + aws.ToString(route.TransitGatewayId)
			} else if route.VpcPeeringConnectionId != nil {
				target = "pcx:" + aws.ToString(route.VpcPeeringConnectionId)
			} else if aws.ToString(route.Origin) == "CreateRouteTable" {
				target = "local"
			}
			state := aws.ToString(route.State)
			hop.MatchedRule = fmt.Sprintf("Route: %s -> %s (%s)", dest, target, state)
			if state == "blackhole" {
				hop.Status = "deny"
			}
		}

		// Build detail text
		detail := hop.ComponentName
		if hop.ResourceID != "" && hop.ResourceID != hop.ComponentName {
			detail += " (" + hop.ResourceID + ")"
		}
		if hop.MatchedRule != "" {
			detail += " — " + hop.MatchedRule
		}
		hop.Detail = detail

		// Inbound/outbound headers give us packet info
		if comp.InboundHeader != nil {
			h := comp.InboundHeader
			if h.SourceAddresses != nil && h.DestinationAddresses != nil {
				srcAddrs := strings.Join(h.SourceAddresses, ",")
				dstAddrs := strings.Join(h.DestinationAddresses, ",")
				hop.Detail += fmt.Sprintf(" [%s -> %s]", srcAddrs, dstAddrs)
			}
		}

		hops = append(hops, hop)
	}

	return hops
}

// parseExplanations extracts human-readable explanations from the analysis.
func (d *Discovery) parseExplanations(explanations []ec2types.Explanation) []string {
	result := []string{}
	for _, exp := range explanations {
		parts := []string{}

		if exp.Component != nil {
			parts = append(parts, aws.ToString(exp.Component.Id))
		}

		// Direction
		if exp.Direction != nil {
			parts = append(parts, string(*exp.Direction))
		}

		// The explanation text comes from various fields
		if exp.Acl != nil {
			parts = append(parts, fmt.Sprintf("ACL %s", aws.ToString(exp.Acl.Id)))
		}
		if exp.SecurityGroup != nil {
			parts = append(parts, fmt.Sprintf("SG %s", aws.ToString(exp.SecurityGroup.Id)))
		}
		if exp.RouteTable != nil {
			parts = append(parts, fmt.Sprintf("Route Table %s", aws.ToString(exp.RouteTable.Id)))
		}
		if exp.Subnet != nil {
			parts = append(parts, fmt.Sprintf("Subnet %s", aws.ToString(exp.Subnet.Id)))
		}
		if exp.Vpc != nil {
			parts = append(parts, fmt.Sprintf("VPC %s", aws.ToString(exp.Vpc.Id)))
		}

		// Missing component
		if exp.MissingComponent != nil {
			parts = append(parts, fmt.Sprintf("Missing: %s", aws.ToString(exp.MissingComponent)))
		}

		// Port/protocol info
		if exp.Port != nil {
			parts = append(parts, fmt.Sprintf("port %d", aws.ToInt32(exp.Port)))
		}
		if len(exp.Protocols) > 0 {
			parts = append(parts, fmt.Sprintf("protocol %s", strings.Join(exp.Protocols, "/")))
		}

		// VPC info
		if exp.SourceVpc != nil {
			parts = append(parts, fmt.Sprintf("from VPC %s", aws.ToString(exp.SourceVpc.Id)))
		}
		if exp.DestinationVpc != nil {
			parts = append(parts, fmt.Sprintf("to VPC %s", aws.ToString(exp.DestinationVpc.Id)))
		}
		if len(exp.Addresses) > 0 {
			parts = append(parts, fmt.Sprintf("addresses: %s", strings.Join(exp.Addresses, ", ")))
		}

		// Explanation code from the enum
		if exp.ExplanationCode != nil {
			parts = append(parts, string(*exp.ExplanationCode))
		}

		if len(parts) > 0 {
			result = append(result, strings.Join(parts, " | "))
		}
	}
	return result
}

// resolveResourceName tries to find a human-friendly name for a resource ID.
func (d *Discovery) resolveResourceName(resourceID, fallbackType string) string {
	// Try from the cached instance list
	d.mu.RLock()
	defer d.mu.RUnlock()
	if d.cache != nil {
		for _, inst := range d.cache.Instances {
			if inst.InstanceID == resourceID {
				if inst.Name != "" {
					return inst.Name
				}
				return fallbackType
			}
		}
	}
	return fallbackType
}
