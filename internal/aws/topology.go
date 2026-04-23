package aws

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/elasticloadbalancingv2"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// VPCTopology is the complete topology data for a VPC.
type VPCTopology struct {
	VPC              VPCInfo              `json:"vpc"`
	Subnets          []SubnetInfo         `json:"subnets"`
	Instances        []TopologyInstance   `json:"instances"`
	SecurityGroups   []SecurityGroupInfo  `json:"securityGroups"`
	NetworkACLs      []NetworkACLInfo     `json:"networkAcls"`
	RouteTables      []RouteTableInfo     `json:"routeTables"`
	InternetGateways []IGWInfo            `json:"internetGateways"`
	NatGateways      []NATGWInfo          `json:"natGateways"`
	TGWAttachments   []TGWAttachmentInfo  `json:"tgwAttachments"`
	VPCPeerings      []VPCPeeringInfo     `json:"vpcPeerings"`
	VPCEndpoints     []VPCEndpointInfo    `json:"vpcEndpoints"`
	LoadBalancers    []TopologyLBInfo     `json:"loadBalancers"`
	PeerVPCDetails   []PeerVPCDetails     `json:"peerVpcDetails,omitempty"`
	ElasticIPs       []ElasticIPInfo      `json:"elasticIps,omitempty"`
	DHCPOptions      *DHCPOptionsInfo     `json:"dhcpOptions,omitempty"`
	FlowLogs         []FlowLogInfo        `json:"flowLogs,omitempty"`
	PrefixLists      []PrefixListInfo     `json:"prefixLists,omitempty"`
	FetchedAt        string               `json:"fetchedAt"`
}

// PeerVPCDetails holds the resources fetched for a peer or connected VPC.
type PeerVPCDetails struct {
	VPCID          string             `json:"vpcId"`
	Name           string             `json:"name"`
	CIDR           string             `json:"cidr"`
	AccountID      string             `json:"accountId,omitempty"`
	Region         string             `json:"region,omitempty"`
	ConnectionType string             `json:"connectionType,omitempty"` // "peering", "tgw", "privatelink"
	Subnets        []SubnetInfo       `json:"subnets"`
	Instances      []TopologyInstance `json:"instances"`
	NatGateways    []NATGWInfo        `json:"natGateways,omitempty"`
}

type VPCInfo struct {
	ID        string `json:"id"`
	CIDR      string `json:"cidr"`
	Name      string `json:"name"`
	IsDefault bool   `json:"isDefault"`
}

type SubnetInfo struct {
	ID               string `json:"id"`
	CIDR             string `json:"cidr"`
	Name             string `json:"name"`
	AZ               string `json:"az"`
	IsPublic         bool   `json:"isPublic"`
	AvailableIPs     int32  `json:"availableIps"`
	RouteTableID     string `json:"routeTableId"`
	NetworkACLID     string `json:"networkAclId"`
}

type TopologyInstance struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	PrivateIP      string   `json:"privateIp"`
	PublicIP       string   `json:"publicIp"`
	State          string   `json:"state"`
	Platform       string   `json:"platform"`
	InstanceType   string   `json:"instanceType"`
	SubnetID       string   `json:"subnetId"`
	SecurityGroups []string `json:"securityGroups"`
}

type SecurityGroupInfo struct {
	ID            string       `json:"id"`
	Name          string       `json:"name"`
	Description   string       `json:"description"`
	InboundRules  []SGRuleInfo `json:"inboundRules"`
	OutboundRules []SGRuleInfo `json:"outboundRules"`
}

type SGRuleInfo struct {
	Protocol    string `json:"protocol"`
	FromPort    int32  `json:"fromPort"`
	ToPort      int32  `json:"toPort"`
	Source      string `json:"source"`
	Description string `json:"description,omitempty"`
}

type NetworkACLInfo struct {
	ID        string         `json:"id"`
	IsDefault bool           `json:"isDefault"`
	SubnetIDs []string       `json:"subnetIds"`
	Rules     []NACLRuleInfo `json:"rules"`
}

type NACLRuleInfo struct {
	RuleNumber int32  `json:"ruleNumber"`
	Direction  string `json:"direction"`
	Protocol   string `json:"protocol"`
	FromPort   int32  `json:"fromPort"`
	ToPort     int32  `json:"toPort"`
	CIDRBlock  string `json:"cidrBlock"`
	Action     string `json:"action"`
}

type RouteTableInfo struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	SubnetIDs []string    `json:"subnetIds"`
	IsMain    bool        `json:"isMain"`
	Routes    []RouteInfo `json:"routes"`
}

type RouteInfo struct {
	Destination string `json:"destination"`
	Target      string `json:"target"`
	TargetType  string `json:"targetType"`
	State       string `json:"state"`
}

type IGWInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type NATGWInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	SubnetID string `json:"subnetId"`
	PublicIP string `json:"publicIp"`
	State    string `json:"state"`
}

type TGWAttachmentInfo struct {
	AttachmentID string              `json:"attachmentId"`
	TGWID        string              `json:"tgwId"`
	TGWName      string              `json:"tgwName"`
	ResourceType string              `json:"resourceType"`
	State        string              `json:"state"`
	SubnetIDs    []string            `json:"subnetIds,omitempty"`
	PeerAttachments []TGWPeerAttachment `json:"peerAttachments,omitempty"`
}

type TGWPeerAttachment struct {
	AttachmentID string `json:"attachmentId"`
	ResourceType string `json:"resourceType"`
	ResourceID   string `json:"resourceId"`
	ResourceName string `json:"resourceName,omitempty"`
	ResourceCIDR string `json:"resourceCidr,omitempty"`
	State        string `json:"state"`
	AccountID    string `json:"accountId,omitempty"`
}

type VPCPeeringInfo struct {
	ID            string `json:"id"`
	Status        string `json:"status"`
	RequesterVPC  string `json:"requesterVpc"`
	RequesterCIDR string `json:"requesterCidr"`
	AccepterVPC   string `json:"accepterVpc"`
	AccepterCIDR  string `json:"accepterCidr"`
	PeerAccountID string `json:"peerAccountId,omitempty"`
	PeerRegion    string `json:"peerRegion,omitempty"`
	PeerVPCName   string `json:"peerVpcName,omitempty"`
}

type VPCEndpointInfo struct {
	ID            string   `json:"id"`
	ServiceName   string   `json:"serviceName"`
	Type          string   `json:"type"`
	State         string   `json:"state"`
	SubnetIDs     []string `json:"subnetIds,omitempty"`
	RouteTableIDs []string `json:"routeTableIds,omitempty"`
}

type TopologyLBInfo struct {
	ARN       string           `json:"arn"`
	Name      string           `json:"name"`
	DNSName   string           `json:"dnsName"`
	Type      string           `json:"type"`
	Scheme    string           `json:"scheme"`
	SubnetIDs []string         `json:"subnetIds"`
	SGIDs     []string         `json:"securityGroups,omitempty"`
	Listeners []LBListenerInfo `json:"listeners"`
	Targets   []LBTargetInfo   `json:"targets"`
}

type LBListenerInfo struct {
	Port     int32  `json:"port"`
	Protocol string `json:"protocol"`
}

type LBTargetInfo struct {
	TargetID    string `json:"targetId"`
	Port        int32  `json:"port"`
	HealthState string `json:"healthState"`
}

type ElasticIPInfo struct {
	AllocationID  string `json:"allocationId"`
	PublicIP      string `json:"publicIp"`
	InstanceID    string `json:"instanceId,omitempty"`
	ENI           string `json:"eni,omitempty"`
	PrivateIP     string `json:"privateIp,omitempty"`
	Name          string `json:"name,omitempty"`
}

type DHCPOptionsInfo struct {
	ID            string            `json:"id"`
	DomainName    string            `json:"domainName,omitempty"`
	DomainServers []string          `json:"domainServers,omitempty"`
	NTPServers    []string          `json:"ntpServers,omitempty"`
}

type FlowLogInfo struct {
	ID              string `json:"id"`
	Status          string `json:"status"`
	TrafficType     string `json:"trafficType"`
	LogDestination  string `json:"logDestination"`
	DestinationType string `json:"destinationType"`
}

type PrefixListInfo struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	CIDRs   []string `json:"cidrs,omitempty"`
	MaxEntries int32 `json:"maxEntries"`
}

// extractName extracts the Name tag value from EC2 tags.
func extractName(tags []ec2types.Tag) string {
	for _, t := range tags {
		if aws.ToString(t.Key) == "Name" {
			return aws.ToString(t.Value)
		}
	}
	return ""
}

// FetchVPCTopology collects the full networking topology for a VPC.
// It takes instanceID to find the VPC, then queries all resources in that VPC.
func (d *Discovery) FetchVPCTopology(ctx context.Context, instanceID string) (*VPCTopology, error) {
	inst, err := d.findCachedInstance(instanceID)
	if err != nil {
		return nil, fmt.Errorf("find instance: %w", err)
	}
	if inst.VpcID == "" {
		return nil, fmt.Errorf("instance %s is not in a VPC", instanceID)
	}

	ec2Client, err := d.ec2ClientForInstance(ctx, inst)
	if err != nil {
		return nil, fmt.Errorf("create EC2 client: %w", err)
	}

	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(inst.AWSRegion),
	}
	if inst.AWSProfile != "" {
		opts = append(opts, awsconfig.WithSharedConfigProfile(inst.AWSProfile))
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("load AWS config: %w", err)
	}
	elbClient := elasticloadbalancingv2.NewFromConfig(cfg)

	topology := &VPCTopology{
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
	}

	vpcFilter := []ec2types.Filter{
		{Name: aws.String("vpc-id"), Values: []string{inst.VpcID}},
	}

	vpcOut, err := ec2Client.DescribeVpcs(ctx, &ec2.DescribeVpcsInput{
		VpcIds: []string{inst.VpcID},
	})
	if err != nil {
		return nil, fmt.Errorf("describe VPC: %w", err)
	}
	if len(vpcOut.Vpcs) > 0 {
		vpc := vpcOut.Vpcs[0]
		topology.VPC = VPCInfo{
			ID:        aws.ToString(vpc.VpcId),
			CIDR:      aws.ToString(vpc.CidrBlock),
			Name:      extractName(vpc.Tags),
			IsDefault: aws.ToBool(vpc.IsDefault),
		}
	}

	subnetsOut, err := ec2Client.DescribeSubnets(ctx, &ec2.DescribeSubnetsInput{
		Filters: vpcFilter,
	})
	if err != nil {
		return nil, fmt.Errorf("describe subnets: %w", err)
	}

	instancesOut, err := ec2Client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
		Filters: vpcFilter,
	})
	if err != nil {
		return nil, fmt.Errorf("describe instances: %w", err)
	}
	for _, reservation := range instancesOut.Reservations {
		for _, instance := range reservation.Instances {
			var sgIDs []string
			for _, sg := range instance.SecurityGroups {
				if sg.GroupId != nil {
					sgIDs = append(sgIDs, *sg.GroupId)
				}
			}
			topology.Instances = append(topology.Instances, TopologyInstance{
				ID:             aws.ToString(instance.InstanceId),
				Name:           extractName(instance.Tags),
				PrivateIP:      aws.ToString(instance.PrivateIpAddress),
				PublicIP:       aws.ToString(instance.PublicIpAddress),
				State:          string(instance.State.Name),
				Platform:       string(instance.Platform),
				InstanceType:   string(instance.InstanceType),
				SubnetID:       aws.ToString(instance.SubnetId),
				SecurityGroups: sgIDs,
			})
		}
	}

	sgsOut, err := ec2Client.DescribeSecurityGroups(ctx, &ec2.DescribeSecurityGroupsInput{
		Filters: vpcFilter,
	})
	if err != nil {
		return nil, fmt.Errorf("describe security groups: %w", err)
	}
	for _, sg := range sgsOut.SecurityGroups {
		sgInfo := SecurityGroupInfo{
			ID:          aws.ToString(sg.GroupId),
			Name:        aws.ToString(sg.GroupName),
			Description: aws.ToString(sg.Description),
		}
		for _, perm := range sg.IpPermissions {
			rule := SGRuleInfo{
				Protocol: aws.ToString(perm.IpProtocol),
				FromPort: aws.ToInt32(perm.FromPort),
				ToPort:   aws.ToInt32(perm.ToPort),
			}
			if perm.IpProtocol != nil && *perm.IpProtocol == "-1" {
				rule.Protocol = "all"
			}
			for _, ipRange := range perm.IpRanges {
				nr := rule
				nr.Source = aws.ToString(ipRange.CidrIp)
				nr.Description = aws.ToString(ipRange.Description)
				sgInfo.InboundRules = append(sgInfo.InboundRules, nr)
			}
			for _, ipv6Range := range perm.Ipv6Ranges {
				nr := rule
				nr.Source = aws.ToString(ipv6Range.CidrIpv6)
				nr.Description = aws.ToString(ipv6Range.Description)
				sgInfo.InboundRules = append(sgInfo.InboundRules, nr)
			}
			for _, pair := range perm.UserIdGroupPairs {
				nr := rule
				nr.Source = aws.ToString(pair.GroupId)
				nr.Description = aws.ToString(pair.Description)
				sgInfo.InboundRules = append(sgInfo.InboundRules, nr)
			}
		}
		for _, perm := range sg.IpPermissionsEgress {
			rule := SGRuleInfo{
				Protocol: aws.ToString(perm.IpProtocol),
				FromPort: aws.ToInt32(perm.FromPort),
				ToPort:   aws.ToInt32(perm.ToPort),
			}
			if perm.IpProtocol != nil && *perm.IpProtocol == "-1" {
				rule.Protocol = "all"
			}
			for _, ipRange := range perm.IpRanges {
				nr := rule
				nr.Source = aws.ToString(ipRange.CidrIp)
				nr.Description = aws.ToString(ipRange.Description)
				sgInfo.OutboundRules = append(sgInfo.OutboundRules, nr)
			}
			for _, ipv6Range := range perm.Ipv6Ranges {
				nr := rule
				nr.Source = aws.ToString(ipv6Range.CidrIpv6)
				nr.Description = aws.ToString(ipv6Range.Description)
				sgInfo.OutboundRules = append(sgInfo.OutboundRules, nr)
			}
			for _, pair := range perm.UserIdGroupPairs {
				nr := rule
				nr.Source = aws.ToString(pair.GroupId)
				nr.Description = aws.ToString(pair.Description)
				sgInfo.OutboundRules = append(sgInfo.OutboundRules, nr)
			}
		}
		topology.SecurityGroups = append(topology.SecurityGroups, sgInfo)
	}

	naclsOut, err := ec2Client.DescribeNetworkAcls(ctx, &ec2.DescribeNetworkAclsInput{
		Filters: vpcFilter,
	})
	if err != nil {
		return nil, fmt.Errorf("describe network ACLs: %w", err)
	}
	for _, nacl := range naclsOut.NetworkAcls {
		naclInfo := NetworkACLInfo{
			ID:        aws.ToString(nacl.NetworkAclId),
			IsDefault: aws.ToBool(nacl.IsDefault),
		}
		for _, assoc := range nacl.Associations {
			if assoc.SubnetId != nil {
				naclInfo.SubnetIDs = append(naclInfo.SubnetIDs, *assoc.SubnetId)
			}
		}
		for _, entry := range nacl.Entries {
			direction := "inbound"
			if aws.ToBool(entry.Egress) {
				direction = "outbound"
			}
			proto := aws.ToString(entry.Protocol)
			if proto == "-1" {
				proto = "all"
			}
			var fromPort, toPort int32
			if entry.PortRange != nil {
				fromPort = aws.ToInt32(entry.PortRange.From)
				toPort = aws.ToInt32(entry.PortRange.To)
			}
			cidr := aws.ToString(entry.CidrBlock)
			if cidr == "" {
				cidr = aws.ToString(entry.Ipv6CidrBlock)
			}
			naclInfo.Rules = append(naclInfo.Rules, NACLRuleInfo{
				RuleNumber: aws.ToInt32(entry.RuleNumber),
				Direction:  direction,
				Protocol:   proto,
				FromPort:   fromPort,
				ToPort:     toPort,
				CIDRBlock:  cidr,
				Action:     string(entry.RuleAction),
			})
		}
		topology.NetworkACLs = append(topology.NetworkACLs, naclInfo)
	}

	rtsOut, err := ec2Client.DescribeRouteTables(ctx, &ec2.DescribeRouteTablesInput{
		Filters: vpcFilter,
	})
	if err != nil {
		return nil, fmt.Errorf("describe route tables: %w", err)
	}
	igwSet := make(map[string]bool)
	for _, rt := range rtsOut.RouteTables {
		rtInfo := RouteTableInfo{
			ID:   aws.ToString(rt.RouteTableId),
			Name: extractName(rt.Tags),
		}
		for _, assoc := range rt.Associations {
			if aws.ToBool(assoc.Main) {
				rtInfo.IsMain = true
			}
			if assoc.SubnetId != nil {
				rtInfo.SubnetIDs = append(rtInfo.SubnetIDs, *assoc.SubnetId)
			}
		}
		for _, r := range rt.Routes {
			dest := aws.ToString(r.DestinationCidrBlock)
			if dest == "" {
				dest = aws.ToString(r.DestinationIpv6CidrBlock)
			}
			if dest == "" {
				dest = aws.ToString(r.DestinationPrefixListId)
			}

			target := ""
			targetType := ""
			switch {
			case r.GatewayId != nil:
				target = *r.GatewayId
				if *r.GatewayId == "local" {
					targetType = "local"
				} else if len(*r.GatewayId) > 4 && (*r.GatewayId)[:4] == "igw-" {
					targetType = "igw"
					igwSet[*r.GatewayId] = true
				}
			case r.NatGatewayId != nil:
				target = *r.NatGatewayId
				targetType = "nat"
			case r.TransitGatewayId != nil:
				target = *r.TransitGatewayId
				targetType = "tgw"
			case r.VpcPeeringConnectionId != nil:
				target = *r.VpcPeeringConnectionId
				targetType = "pcx"
			case r.NetworkInterfaceId != nil:
				target = *r.NetworkInterfaceId
				targetType = "eni"
			case r.InstanceId != nil:
				target = *r.InstanceId
				targetType = "instance"
			default:
				target = "local"
				targetType = "local"
			}

			rtInfo.Routes = append(rtInfo.Routes, RouteInfo{
				Destination: dest,
				Target:      target,
				TargetType:  targetType,
				State:       string(r.State),
			})
		}
		topology.RouteTables = append(topology.RouteTables, rtInfo)
	}

	for _, subnet := range subnetsOut.Subnets {
		subnetID := aws.ToString(subnet.SubnetId)
		rtID := ""
		for _, rt := range topology.RouteTables {
			for _, sid := range rt.SubnetIDs {
				if sid == subnetID {
					rtID = rt.ID
					break
				}
			}
			if rtID != "" {
				break
			}
		}
		if rtID == "" {
			for _, rt := range topology.RouteTables {
				if rt.IsMain {
					rtID = rt.ID
					break
				}
			}
		}

		naclID := ""
		for _, nacl := range topology.NetworkACLs {
			for _, sid := range nacl.SubnetIDs {
				if sid == subnetID {
					naclID = nacl.ID
					break
				}
			}
			if naclID != "" {
				break
			}
		}

		isPublic := false
		for _, rt := range topology.RouteTables {
			if rt.ID == rtID {
				for _, route := range rt.Routes {
					if (route.Destination == "0.0.0.0/0" || route.Destination == "::/0") && route.TargetType == "igw" {
						isPublic = true
						break
					}
				}
			}
			if isPublic {
				break
			}
		}

		topology.Subnets = append(topology.Subnets, SubnetInfo{
			ID:               subnetID,
			CIDR:             aws.ToString(subnet.CidrBlock),
			Name:             extractName(subnet.Tags),
			AZ:               aws.ToString(subnet.AvailabilityZone),
			IsPublic:         isPublic,
			AvailableIPs:     aws.ToInt32(subnet.AvailableIpAddressCount),
			RouteTableID:     rtID,
			NetworkACLID:     naclID,
		})
	}

	igwsOut, err := ec2Client.DescribeInternetGateways(ctx, &ec2.DescribeInternetGatewaysInput{
		Filters: []ec2types.Filter{
			{Name: aws.String("attachment.vpc-id"), Values: []string{inst.VpcID}},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("describe internet gateways: %w", err)
	}
	for _, igw := range igwsOut.InternetGateways {
		topology.InternetGateways = append(topology.InternetGateways, IGWInfo{
			ID:   aws.ToString(igw.InternetGatewayId),
			Name: extractName(igw.Tags),
		})
	}

	natgwsOut, err := ec2Client.DescribeNatGateways(ctx, &ec2.DescribeNatGatewaysInput{
		Filter: vpcFilter,
	})
	if err != nil {
		return nil, fmt.Errorf("describe NAT gateways: %w", err)
	}
	for _, natgw := range natgwsOut.NatGateways {
		publicIP := ""
		for _, addr := range natgw.NatGatewayAddresses {
			if addr.PublicIp != nil {
				publicIP = *addr.PublicIp
				break
			}
		}
		topology.NatGateways = append(topology.NatGateways, NATGWInfo{
			ID:       aws.ToString(natgw.NatGatewayId),
			Name:     extractName(natgw.Tags),
			SubnetID: aws.ToString(natgw.SubnetId),
			PublicIP: publicIP,
			State:    string(natgw.State),
		})
	}

	tgwsOut, err := ec2Client.DescribeTransitGatewayAttachments(ctx, &ec2.DescribeTransitGatewayAttachmentsInput{
		Filters: []ec2types.Filter{
			{Name: aws.String("resource-id"), Values: []string{inst.VpcID}},
		},
	})
	if err == nil {
		tgwIDs := make(map[string]bool)
		for _, att := range tgwsOut.TransitGatewayAttachments {
			tgwID := aws.ToString(att.TransitGatewayId)
			tgwIDs[tgwID] = true
			var subnetIDs []string
			if att.ResourceType == ec2types.TransitGatewayAttachmentResourceTypeVpc {
				tgwVpcOut, err := ec2Client.DescribeTransitGatewayVpcAttachments(ctx, &ec2.DescribeTransitGatewayVpcAttachmentsInput{
					TransitGatewayAttachmentIds: []string{aws.ToString(att.TransitGatewayAttachmentId)},
				})
				if err == nil && len(tgwVpcOut.TransitGatewayVpcAttachments) > 0 {
					for _, sid := range tgwVpcOut.TransitGatewayVpcAttachments[0].SubnetIds {
						subnetIDs = append(subnetIDs, sid)
					}
				}
			}
			topology.TGWAttachments = append(topology.TGWAttachments, TGWAttachmentInfo{
				AttachmentID: aws.ToString(att.TransitGatewayAttachmentId),
				TGWID:        tgwID,
				ResourceType: string(att.ResourceType),
				State:        string(att.State),
				SubnetIDs:    subnetIDs,
			})
		}

		if len(tgwIDs) > 0 {
			var ids []string
			for id := range tgwIDs {
				ids = append(ids, id)
			}
			tgwDetailsOut, err := ec2Client.DescribeTransitGateways(ctx, &ec2.DescribeTransitGatewaysInput{
				TransitGatewayIds: ids,
			})
			if err == nil {
				tgwNames := make(map[string]string)
				for _, tgw := range tgwDetailsOut.TransitGateways {
					tgwNames[aws.ToString(tgw.TransitGatewayId)] = extractName(tgw.Tags)
				}
				for i := range topology.TGWAttachments {
					topology.TGWAttachments[i].TGWName = tgwNames[topology.TGWAttachments[i].TGWID]
				}
			}

			// Fetch peer attachments for each TGW (other VPCs/VPNs connected to the same TGW)
			for i, att := range topology.TGWAttachments {
				peerAttsOut, err := ec2Client.DescribeTransitGatewayAttachments(ctx, &ec2.DescribeTransitGatewayAttachmentsInput{
					Filters: []ec2types.Filter{
						{Name: aws.String("transit-gateway-id"), Values: []string{att.TGWID}},
					},
				})
				if err != nil {
					continue
				}
				var peerVPCIDs []string
				for _, pa := range peerAttsOut.TransitGatewayAttachments {
					resID := aws.ToString(pa.ResourceId)
					// Skip our own VPC attachment
					if resID == inst.VpcID {
						continue
					}
					peer := TGWPeerAttachment{
						AttachmentID: aws.ToString(pa.TransitGatewayAttachmentId),
						ResourceType: string(pa.ResourceType),
						ResourceID:   resID,
						State:        string(pa.State),
					}
					if pa.ResourceOwnerId != nil {
						peer.AccountID = aws.ToString(pa.ResourceOwnerId)
					}
					topology.TGWAttachments[i].PeerAttachments = append(topology.TGWAttachments[i].PeerAttachments, peer)
					if pa.ResourceType == ec2types.TransitGatewayAttachmentResourceTypeVpc {
						peerVPCIDs = append(peerVPCIDs, resID)
					}
				}
				// Resolve peer VPC names and CIDRs
				if len(peerVPCIDs) > 0 {
					peerVPCOut, err := ec2Client.DescribeVpcs(ctx, &ec2.DescribeVpcsInput{
						VpcIds: peerVPCIDs,
					})
					if err == nil {
						vpcInfo := make(map[string][2]string) // id -> [name, cidr]
						for _, v := range peerVPCOut.Vpcs {
							vid := aws.ToString(v.VpcId)
							vpcInfo[vid] = [2]string{extractName(v.Tags), aws.ToString(v.CidrBlock)}
						}
						for j := range topology.TGWAttachments[i].PeerAttachments {
							pa := &topology.TGWAttachments[i].PeerAttachments[j]
							if info, ok := vpcInfo[pa.ResourceID]; ok {
								pa.ResourceName = info[0]
								pa.ResourceCIDR = info[1]
							}
						}
					}
				}
			}
		}
	}

	peeringsOut, err := ec2Client.DescribeVpcPeeringConnections(ctx, &ec2.DescribeVpcPeeringConnectionsInput{
		Filters: []ec2types.Filter{
			{Name: aws.String("requester-vpc-info.vpc-id"), Values: []string{inst.VpcID}},
		},
	})
	if err == nil {
		for _, pcx := range peeringsOut.VpcPeeringConnections {
			peerAccountID := ""
			peerRegion := ""
			if pcx.AccepterVpcInfo != nil {
				peerAccountID = aws.ToString(pcx.AccepterVpcInfo.OwnerId)
				peerRegion = aws.ToString(pcx.AccepterVpcInfo.Region)
			}
			topology.VPCPeerings = append(topology.VPCPeerings, VPCPeeringInfo{
				ID:            aws.ToString(pcx.VpcPeeringConnectionId),
				Status:        string(pcx.Status.Code),
				RequesterVPC:  aws.ToString(pcx.RequesterVpcInfo.VpcId),
				RequesterCIDR: aws.ToString(pcx.RequesterVpcInfo.CidrBlock),
				AccepterVPC:   aws.ToString(pcx.AccepterVpcInfo.VpcId),
				AccepterCIDR:  aws.ToString(pcx.AccepterVpcInfo.CidrBlock),
				PeerAccountID: peerAccountID,
				PeerRegion:    peerRegion,
			})
		}
	}

	peeringsOut2, err := ec2Client.DescribeVpcPeeringConnections(ctx, &ec2.DescribeVpcPeeringConnectionsInput{
		Filters: []ec2types.Filter{
			{Name: aws.String("accepter-vpc-info.vpc-id"), Values: []string{inst.VpcID}},
		},
	})
	if err == nil {
		for _, pcx := range peeringsOut2.VpcPeeringConnections {
			peerAccountID := ""
			peerRegion := ""
			if pcx.RequesterVpcInfo != nil {
				peerAccountID = aws.ToString(pcx.RequesterVpcInfo.OwnerId)
				peerRegion = aws.ToString(pcx.RequesterVpcInfo.Region)
			}
			topology.VPCPeerings = append(topology.VPCPeerings, VPCPeeringInfo{
				ID:            aws.ToString(pcx.VpcPeeringConnectionId),
				Status:        string(pcx.Status.Code),
				RequesterVPC:  aws.ToString(pcx.RequesterVpcInfo.VpcId),
				RequesterCIDR: aws.ToString(pcx.RequesterVpcInfo.CidrBlock),
				AccepterVPC:   aws.ToString(pcx.AccepterVpcInfo.VpcId),
				AccepterCIDR:  aws.ToString(pcx.AccepterVpcInfo.CidrBlock),
				PeerAccountID: peerAccountID,
				PeerRegion:    peerRegion,
			})
		}
	}

	// Resolve peer VPC names for peering connections (same-account only)
	if len(topology.VPCPeerings) > 0 {
		var peerVPCIDs []string
		for _, pcx := range topology.VPCPeerings {
			peerVPC := pcx.AccepterVPC
			if pcx.AccepterVPC == inst.VpcID {
				peerVPC = pcx.RequesterVPC
			}
			if peerVPC != "" && peerVPC != inst.VpcID {
				peerVPCIDs = append(peerVPCIDs, peerVPC)
			}
		}
		if len(peerVPCIDs) > 0 {
			peerVPCOut, err := ec2Client.DescribeVpcs(ctx, &ec2.DescribeVpcsInput{
				VpcIds: peerVPCIDs,
			})
			if err == nil {
				vpcNames := make(map[string]string)
				for _, v := range peerVPCOut.Vpcs {
					vpcNames[aws.ToString(v.VpcId)] = extractName(v.Tags)
				}
				for i := range topology.VPCPeerings {
					peerVPC := topology.VPCPeerings[i].AccepterVPC
					if peerVPC == inst.VpcID {
						peerVPC = topology.VPCPeerings[i].RequesterVPC
					}
					if name, ok := vpcNames[peerVPC]; ok {
						topology.VPCPeerings[i].PeerVPCName = name
					}
				}
			}
		}
	}

	// Fetch resources for all connected VPCs: peerings, TGW, and PrivateLink.
	// Build a credential resolver that covers both ~/.aws/credentials profiles
	// and manually-added accounts from the UI.
	credResolver := d.buildCredentialResolver(ctx, inst.AWSRegion)

	// Collect peer VPCs: track (vpcID, accountID, region, connectionType, name, cidr).
	type peerVPCEntry struct {
		vpcID          string
		accountID      string
		region         string
		connectionType string
		name           string
		cidr           string
	}
	peerVPCMap := make(map[string]*peerVPCEntry) // keyed by vpcID

	upsertPeer := func(vpcID, accountID, region, connType, name, cidr string) {
		if vpcID == "" || vpcID == inst.VpcID {
			return
		}
		if e, ok := peerVPCMap[vpcID]; ok {
			if e.name == "" && name != "" {
				e.name = name
			}
			if e.cidr == "" && cidr != "" {
				e.cidr = cidr
			}
			return
		}
		peerVPCMap[vpcID] = &peerVPCEntry{
			vpcID:          vpcID,
			accountID:      accountID,
			region:         region,
			connectionType: connType,
			name:           name,
			cidr:           cidr,
		}
	}

	for _, pcx := range topology.VPCPeerings {
		peerVPC := pcx.AccepterVPC
		peerCIDR := pcx.AccepterCIDR
		peerAcct := pcx.PeerAccountID
		peerRegion := pcx.PeerRegion
		name := pcx.PeerVPCName
		if peerVPC == inst.VpcID {
			peerVPC = pcx.RequesterVPC
			peerCIDR = pcx.RequesterCIDR
		}
		upsertPeer(peerVPC, peerAcct, peerRegion, "peering", name, peerCIDR)
	}

	for _, att := range topology.TGWAttachments {
		for _, pa := range att.PeerAttachments {
			if pa.ResourceType == "vpc" {
				upsertPeer(pa.ResourceID, pa.AccountID, "", "tgw", pa.ResourceName, pa.ResourceCIDR)
			}
		}
	}

	// PrivateLink: for Interface-type endpoints, resolve the service's provider VPC.
	for _, ep := range topology.VPCEndpoints {
		if ep.Type != "Interface" {
			continue
		}
		svcOut, err := ec2Client.DescribeVpcEndpointServices(ctx, &ec2.DescribeVpcEndpointServicesInput{
			ServiceNames: []string{ep.ServiceName},
		})
		if err != nil || len(svcOut.ServiceDetails) == 0 {
			continue
		}
		svc := svcOut.ServiceDetails[0]
		ownerAccountID := aws.ToString(svc.Owner)
		// Each service can be backed by multiple AZ-specific DescribeVpcEndpointServiceConfigurations
		// to find the actual service VPC. We need DescribeVpcEndpointServiceConfigurations (owner's API).
		// Skip AWS-managed services (owner == "amazon").
		if ownerAccountID == "amazon" || ownerAccountID == "" {
			continue
		}
		// Resolve service VPC via the owner's credentials.
		ownerClient, _, ownerRegion := credResolver(ownerAccountID, inst.AWSRegion)
		if ownerClient == nil {
			continue
		}
		svcConfOut, err := ownerClient.DescribeVpcEndpointServiceConfigurations(ctx,
			&ec2.DescribeVpcEndpointServiceConfigurationsInput{
				Filters: []ec2types.Filter{
					{Name: aws.String("service-name"), Values: []string{ep.ServiceName}},
				},
			})
		if err != nil || len(svcConfOut.ServiceConfigurations) == 0 {
			continue
		}
		svcConf := svcConfOut.ServiceConfigurations[0]
		// Get the NLB ARNs and resolve their VPC IDs using the owner's credentials.
		_, ownerCfgOpts, _ := credResolver(ownerAccountID, ownerRegion)
		for _, nlbARN := range svcConf.NetworkLoadBalancerArns {
			elbFullCfg, err := awsconfig.LoadDefaultConfig(ctx, ownerCfgOpts...)
			if err != nil {
				continue
			}
			elbCl := elasticloadbalancingv2.NewFromConfig(elbFullCfg)
			lbOut, err := elbCl.DescribeLoadBalancers(ctx, &elasticloadbalancingv2.DescribeLoadBalancersInput{
				LoadBalancerArns: []string{nlbARN},
			})
			if err != nil || len(lbOut.LoadBalancers) == 0 {
				continue
			}
			lb := lbOut.LoadBalancers[0]
			if lb.VpcId == nil {
				continue
			}
			svcVPCID := *lb.VpcId
			vpcNameOut, err := ownerClient.DescribeVpcs(ctx, &ec2.DescribeVpcsInput{
				VpcIds: []string{svcVPCID},
			})
			vpcName := ""
			vpcCIDR := ""
			if err == nil && len(vpcNameOut.Vpcs) > 0 {
				vpcName = extractName(vpcNameOut.Vpcs[0].Tags)
				vpcCIDR = aws.ToString(vpcNameOut.Vpcs[0].CidrBlock)
			}
			upsertPeer(svcVPCID, ownerAccountID, ownerRegion, "privatelink", vpcName, vpcCIDR)
		}
	}

	// Fetch resources for each connected VPC using the right credentials.
	for _, entry := range peerVPCMap {
		// Use the known region for the peer VPC if available, else fall back to primary region.
		targetRegion := inst.AWSRegion
		if entry.region != "" {
			targetRegion = entry.region
		}

		peerEC2, _, peerRegion := credResolver(entry.accountID, targetRegion)
		if peerRegion == "" {
			peerRegion = targetRegion
		}

		// Fallback: use primary account client (covers same-account peers where accountID is empty).
		if peerEC2 == nil {
			peerEC2 = ec2Client
		}

		details := PeerVPCDetails{
			VPCID:          entry.vpcID,
			Name:           entry.name,
			CIDR:           entry.cidr,
			AccountID:      entry.accountID,
			Region:         peerRegion,
			ConnectionType: entry.connectionType,
		}

		peerFilter := []ec2types.Filter{
			{Name: aws.String("vpc-id"), Values: []string{entry.vpcID}},
		}

		if subnetsOut, err := peerEC2.DescribeSubnets(ctx, &ec2.DescribeSubnetsInput{Filters: peerFilter}); err == nil {
			for _, s := range subnetsOut.Subnets {
				details.Subnets = append(details.Subnets, SubnetInfo{
					ID:           aws.ToString(s.SubnetId),
					CIDR:         aws.ToString(s.CidrBlock),
					Name:         extractName(s.Tags),
					AZ:           aws.ToString(s.AvailabilityZone),
					IsPublic:     aws.ToBool(s.MapPublicIpOnLaunch),
					AvailableIPs: aws.ToInt32(s.AvailableIpAddressCount),
				})
			}
		}

		if instsOut, err := peerEC2.DescribeInstances(ctx, &ec2.DescribeInstancesInput{Filters: peerFilter}); err == nil {
			for _, res := range instsOut.Reservations {
				for _, i := range res.Instances {
					var sgIDs []string
					for _, sg := range i.SecurityGroups {
						if sg.GroupId != nil {
							sgIDs = append(sgIDs, *sg.GroupId)
						}
					}
					details.Instances = append(details.Instances, TopologyInstance{
						ID:             aws.ToString(i.InstanceId),
						Name:           extractName(i.Tags),
						PrivateIP:      aws.ToString(i.PrivateIpAddress),
						PublicIP:       aws.ToString(i.PublicIpAddress),
						State:          string(i.State.Name),
						Platform:       string(i.Platform),
						InstanceType:   string(i.InstanceType),
						SubnetID:       aws.ToString(i.SubnetId),
						SecurityGroups: sgIDs,
					})
				}
			}
		}

		if natOut, err := peerEC2.DescribeNatGateways(ctx, &ec2.DescribeNatGatewaysInput{Filter: peerFilter}); err == nil {
			for _, n := range natOut.NatGateways {
				publicIP := ""
				if len(n.NatGatewayAddresses) > 0 {
					publicIP = aws.ToString(n.NatGatewayAddresses[0].PublicIp)
				}
				details.NatGateways = append(details.NatGateways, NATGWInfo{
					ID:       aws.ToString(n.NatGatewayId),
					Name:     extractName(n.Tags),
					SubnetID: aws.ToString(n.SubnetId),
					PublicIP: publicIP,
					State:    string(n.State),
				})
			}
		}

		topology.PeerVPCDetails = append(topology.PeerVPCDetails, details)
	}

	endpointsOut, err := ec2Client.DescribeVpcEndpoints(ctx, &ec2.DescribeVpcEndpointsInput{
		Filters: vpcFilter,
	})
	if err == nil {
		for _, ep := range endpointsOut.VpcEndpoints {
			epInfo := VPCEndpointInfo{
				ID:          aws.ToString(ep.VpcEndpointId),
				ServiceName: aws.ToString(ep.ServiceName),
				Type:        string(ep.VpcEndpointType),
				State:       string(ep.State),
			}
			if ep.VpcEndpointType == ec2types.VpcEndpointTypeInterface {
				epInfo.SubnetIDs = ep.SubnetIds
			} else if ep.VpcEndpointType == ec2types.VpcEndpointTypeGateway {
				epInfo.RouteTableIDs = ep.RouteTableIds
			}
			topology.VPCEndpoints = append(topology.VPCEndpoints, epInfo)
		}
	}

	lbsOut, err := elbClient.DescribeLoadBalancers(ctx, &elasticloadbalancingv2.DescribeLoadBalancersInput{})
	if err == nil {
		for _, lb := range lbsOut.LoadBalancers {
			inVPC := false
			if lb.VpcId != nil && *lb.VpcId == inst.VpcID {
				inVPC = true
			}
			if !inVPC {
				continue
			}

			lbInfo := TopologyLBInfo{
				ARN:     aws.ToString(lb.LoadBalancerArn),
				Name:    aws.ToString(lb.LoadBalancerName),
				DNSName: aws.ToString(lb.DNSName),
				Type:    string(lb.Type),
				Scheme:  string(lb.Scheme),
			}
			for _, az := range lb.AvailabilityZones {
				if az.SubnetId != nil {
					lbInfo.SubnetIDs = append(lbInfo.SubnetIDs, *az.SubnetId)
				}
			}
			for _, sgID := range lb.SecurityGroups {
				lbInfo.SGIDs = append(lbInfo.SGIDs, sgID)
			}

			listenersOut, err := elbClient.DescribeListeners(ctx, &elasticloadbalancingv2.DescribeListenersInput{
				LoadBalancerArn: lb.LoadBalancerArn,
			})
			if err == nil {
				for _, l := range listenersOut.Listeners {
					lbInfo.Listeners = append(lbInfo.Listeners, LBListenerInfo{
						Port:     aws.ToInt32(l.Port),
						Protocol: string(l.Protocol),
					})
				}
			}

			tgsOut, err := elbClient.DescribeTargetGroups(ctx, &elasticloadbalancingv2.DescribeTargetGroupsInput{
				LoadBalancerArn: lb.LoadBalancerArn,
			})
			if err == nil {
				for _, tg := range tgsOut.TargetGroups {
					healthOut, err := elbClient.DescribeTargetHealth(ctx, &elasticloadbalancingv2.DescribeTargetHealthInput{
						TargetGroupArn: tg.TargetGroupArn,
					})
					if err == nil {
						for _, th := range healthOut.TargetHealthDescriptions {
							if th.Target != nil {
								t := LBTargetInfo{
									TargetID: aws.ToString(th.Target.Id),
									Port:     aws.ToInt32(th.Target.Port),
								}
								if th.TargetHealth != nil {
									t.HealthState = string(th.TargetHealth.State)
								}
								lbInfo.Targets = append(lbInfo.Targets, t)
							}
						}
					}
				}
			}

			topology.LoadBalancers = append(topology.LoadBalancers, lbInfo)
		}
	}

	// Elastic IPs in this VPC
	eipsOut, err := ec2Client.DescribeAddresses(ctx, &ec2.DescribeAddressesInput{
		Filters: []ec2types.Filter{
			{Name: aws.String("domain"), Values: []string{"vpc"}},
		},
	})
	if err == nil {
		// Filter to EIPs associated with instances in this VPC
		instSet := make(map[string]bool)
		for _, inst := range topology.Instances {
			instSet[inst.ID] = true
		}
		for _, addr := range eipsOut.Addresses {
			instID := aws.ToString(addr.InstanceId)
			// Only include EIPs associated with instances in this VPC
			if !instSet[instID] {
				continue
			}
			topology.ElasticIPs = append(topology.ElasticIPs, ElasticIPInfo{
				AllocationID: aws.ToString(addr.AllocationId),
				PublicIP:     aws.ToString(addr.PublicIp),
				InstanceID:   instID,
				ENI:          aws.ToString(addr.NetworkInterfaceId),
				PrivateIP:    aws.ToString(addr.PrivateIpAddress),
				Name:         extractName(addr.Tags),
			})
		}
	}

	// DHCP Options
	if len(vpcOut.Vpcs) > 0 && vpcOut.Vpcs[0].DhcpOptionsId != nil {
		dhcpID := aws.ToString(vpcOut.Vpcs[0].DhcpOptionsId)
		if dhcpID != "" && dhcpID != "default" {
			dhcpOut, err := ec2Client.DescribeDhcpOptions(ctx, &ec2.DescribeDhcpOptionsInput{
				DhcpOptionsIds: []string{dhcpID},
			})
			if err == nil && len(dhcpOut.DhcpOptions) > 0 {
				opts := dhcpOut.DhcpOptions[0]
				info := &DHCPOptionsInfo{ID: dhcpID}
				for _, cfg := range opts.DhcpConfigurations {
					key := aws.ToString(cfg.Key)
					var vals []string
					for _, v := range cfg.Values {
						vals = append(vals, aws.ToString(v.Value))
					}
					switch key {
					case "domain-name":
						if len(vals) > 0 {
							info.DomainName = vals[0]
						}
					case "domain-name-servers":
						info.DomainServers = vals
					case "ntp-servers":
						info.NTPServers = vals
					}
				}
				topology.DHCPOptions = info
			}
		}
	}

	// VPC Flow Logs
	flowLogsOut, err := ec2Client.DescribeFlowLogs(ctx, &ec2.DescribeFlowLogsInput{
		Filter: []ec2types.Filter{
			{Name: aws.String("resource-id"), Values: []string{inst.VpcID}},
		},
	})
	if err == nil {
		for _, fl := range flowLogsOut.FlowLogs {
			logDest := aws.ToString(fl.LogDestination)
			if logDest == "" {
				logDest = aws.ToString(fl.LogGroupName)
			}
			topology.FlowLogs = append(topology.FlowLogs, FlowLogInfo{
				ID:              aws.ToString(fl.FlowLogId),
				Status:          aws.ToString(fl.FlowLogStatus),
				TrafficType:     string(fl.TrafficType),
				LogDestination:  logDest,
				DestinationType: string(fl.LogDestinationType),
			})
		}
	}

	// Prefix Lists (referenced in routes)
	prefixListIDs := make(map[string]bool)
	for _, rt := range topology.RouteTables {
		for _, r := range rt.Routes {
			if len(r.Destination) > 3 && r.Destination[:3] == "pl-" {
				prefixListIDs[r.Destination] = true
			}
		}
	}
	if len(prefixListIDs) > 0 {
		var plIDs []string
		for id := range prefixListIDs {
			plIDs = append(plIDs, id)
		}
		plOut, err := ec2Client.DescribeManagedPrefixLists(ctx, &ec2.DescribeManagedPrefixListsInput{
			Filters: []ec2types.Filter{
				{Name: aws.String("prefix-list-id"), Values: plIDs},
			},
		})
		if err == nil {
			for _, pl := range plOut.PrefixLists {
				plInfo := PrefixListInfo{
					ID:         aws.ToString(pl.PrefixListId),
					Name:       aws.ToString(pl.PrefixListName),
					MaxEntries: aws.ToInt32(pl.MaxEntries),
				}
				// Get entries for each prefix list
				entriesOut, err := ec2Client.GetManagedPrefixListEntries(ctx, &ec2.GetManagedPrefixListEntriesInput{
					PrefixListId: pl.PrefixListId,
				})
				if err == nil {
					for _, e := range entriesOut.Entries {
						plInfo.CIDRs = append(plInfo.CIDRs, aws.ToString(e.Cidr))
					}
				}
				topology.PrefixLists = append(topology.PrefixLists, plInfo)
			}
		}
	}

	return topology, nil
}

// credResolverFunc returns (ec2Client, configOpts, region) for a given accountID.
// Returns nil client if no matching credentials are found.
type credResolverFunc func(accountID, fallbackRegion string) (*ec2.Client, []func(*awsconfig.LoadOptions) error, string)

// buildCredentialResolver builds a lookup function that, given an AWS account ID,
// returns an EC2 client and config options for that account.
//
// Priority order:
//  1. ~/.aws/credentials profiles (checked via STS GetCallerIdentity)
//  2. Manually-added accounts from the UI (d.accounts)
func (d *Discovery) buildCredentialResolver(ctx context.Context, fallbackRegion string) credResolverFunc {
	// Map accountID -> config opts (region will be overridden per-call)
	type entry struct {
		opts   []func(*awsconfig.LoadOptions) error
		region string
	}
	cache := make(map[string]*entry)

	// 1. Scan ~/.aws/credentials profiles — this is the primary source.
	home, _ := os.UserHomeDir()
	credsPath := filepath.Join(home, ".aws", "credentials")
	if f, err := os.Open(credsPath); err == nil {
		defer f.Close()
		scanner := bufio.NewScanner(f)
		var profiles []string
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
				p := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(line, "["), "]"))
				if p != "" {
					profiles = append(profiles, p)
				}
			}
		}
		for _, profile := range profiles {
			opts := []func(*awsconfig.LoadOptions) error{
				awsconfig.WithRegion(fallbackRegion),
				awsconfig.WithSharedConfigProfile(profile),
			}
			cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
			if err != nil {
				continue
			}
			stsClient := sts.NewFromConfig(cfg)
			identity, err := stsClient.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
			if err != nil {
				continue
			}
			accountID := aws.ToString(identity.Account)
			if accountID != "" {
				if _, exists := cache[accountID]; !exists {
					cache[accountID] = &entry{opts: opts, region: fallbackRegion}
				}
			}
		}
	}

	// 2. Manually-added accounts (UI-added) — used if not already covered by a profile.
	if d.accounts != nil {
		for _, acct := range d.accounts.ListRaw() {
			// The ManualAccount.ID is an internal random UUID, not the AWS account ID.
			// We need to call GetCallerIdentity to find the actual AWS account ID.
			opts := []func(*awsconfig.LoadOptions) error{
				awsconfig.WithRegion(fallbackRegion),
				awsconfig.WithCredentialsProvider(
					credentials.NewStaticCredentialsProvider(
						acct.AccessKeyID, acct.SecretAccessKey, acct.SessionToken,
					),
				),
			}
			cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
			if err != nil {
				continue
			}
			stsClient := sts.NewFromConfig(cfg)
			identity, err := stsClient.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
			if err != nil {
				continue
			}
			accountID := aws.ToString(identity.Account)
			if accountID != "" {
				if _, exists := cache[accountID]; !exists {
					cache[accountID] = &entry{opts: opts, region: fallbackRegion}
				}
			}
		}
	}

	return func(accountID, region string) (*ec2.Client, []func(*awsconfig.LoadOptions) error, string) {
		if region == "" {
			region = fallbackRegion
		}
		e, ok := cache[accountID]
		if !ok {
			return nil, nil, region
		}
		// Rebuild opts with the correct region.
		opts := []func(*awsconfig.LoadOptions) error{awsconfig.WithRegion(region)}
		opts = append(opts, e.opts[1:]...) // skip the first (region) opt from cached entry
		cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
		if err != nil {
			return nil, nil, region
		}
		return ec2.NewFromConfig(cfg), opts, region
	}
}
