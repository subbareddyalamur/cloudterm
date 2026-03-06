package aws

import (
	"fmt"
	"net"
	"sort"
	"strings"
)

// ReachabilityResult is the full analysis of a source→destination path.
type ReachabilityResult struct {
	Source      ReachabilityEndpoint `json:"source"`
	Destination ReachabilityEndpoint `json:"destination"`
	Protocol    string               `json:"protocol"`
	Port        int32                `json:"port"`
	Reachable   bool                 `json:"reachable"`
	Hops        []ReachabilityHop    `json:"hops"`
	ReturnPath  []ReachabilityHop    `json:"returnPath,omitempty"`
	Issues      []string             `json:"issues"`
}

type ReachabilityEndpoint struct {
	InstanceID string `json:"instanceId,omitempty"`
	IP         string `json:"ip"`
	SubnetID   string `json:"subnetId,omitempty"`
	VPCID      string `json:"vpcId,omitempty"`
}

type ReachabilityHop struct {
	Component    string `json:"component"`
	ResourceID   string `json:"resourceId"`
	ResourceName string `json:"resourceName,omitempty"`
	Status       string `json:"status"`
	Detail       string `json:"detail"`
	MatchedRule  string `json:"matchedRule,omitempty"`
}

// ExposureResult shows internet-exposed resources.
type ExposureResult struct {
	ExposedInstances []ExposedInstance `json:"exposedInstances"`
	ExposedPorts     []ExposedPort     `json:"exposedPorts"`
}

type ExposedInstance struct {
	InstanceID string `json:"instanceId"`
	Name       string `json:"name"`
	PublicIP   string `json:"publicIp"`
	SubnetID   string `json:"subnetId"`
}

type ExposedPort struct {
	InstanceID string `json:"instanceId"`
	Name       string `json:"name"`
	Port       int32  `json:"port"`
	Protocol   string `json:"protocol"`
	Source     string `json:"source"`
	SGID       string `json:"sgId"`
	Severity   string `json:"severity"`
}

// RuleConflict identifies problematic rules.
type RuleConflict struct {
	Type         string `json:"type"`
	ResourceID   string `json:"resourceId"`
	ResourceName string `json:"resourceName"`
	Description  string `json:"description"`
	Severity     string `json:"severity"`
}

// AnalyzeReachability traces the packet path from source to destination.
func AnalyzeReachability(topo *VPCTopology, sourceID, destID string, protocol string, port int32) *ReachabilityResult {
	result := &ReachabilityResult{
		Protocol: protocol,
		Port:     port,
		Hops:     []ReachabilityHop{},
		Issues:   []string{},
	}

	// Find source instance
	sourceInst := findInstance(topo, sourceID)
	if sourceInst == nil {
		result.Issues = append(result.Issues, fmt.Sprintf("Source instance %s not found", sourceID))
		result.Reachable = false
		return result
	}

	sourceSubnet := findSubnet(topo, sourceInst.SubnetID)
	if sourceSubnet == nil {
		result.Issues = append(result.Issues, fmt.Sprintf("Source subnet %s not found", sourceInst.SubnetID))
		result.Reachable = false
		return result
	}

	result.Source = ReachabilityEndpoint{
		InstanceID: sourceInst.ID,
		IP:         sourceInst.PrivateIP,
		SubnetID:   sourceInst.SubnetID,
		VPCID:      topo.VPC.ID,
	}

	// Find destination instance (by ID or by private IP)
	destInst := findInstance(topo, destID)
	if destInst == nil {
		destInst = findInstanceByIP(topo, destID)
	}

	// Determine if destination is external (not in VPC)
	isExternalDest := destInst == nil
	destIP := destID // for external destinations, use the raw IP/ID as destIP

	if isExternalDest {
		// External destination (internet IP, cross-VPC IP, etc.)
		result.Destination = ReachabilityEndpoint{
			IP: destIP,
		}
		return analyzeExternalPath(topo, result, sourceInst, sourceSubnet, destIP, protocol, port)
	}

	destSubnet := findSubnet(topo, destInst.SubnetID)
	if destSubnet == nil {
		result.Issues = append(result.Issues, fmt.Sprintf("Destination subnet %s not found", destInst.SubnetID))
		result.Reachable = false
		return result
	}

	result.Destination = ReachabilityEndpoint{
		InstanceID: destInst.ID,
		IP:         destInst.PrivateIP,
		SubnetID:   destInst.SubnetID,
		VPCID:      topo.VPC.ID,
	}

	destIP = destInst.PrivateIP

	allAllowed := true

	// Hop 1: Source SG Outbound
	sgOutboundAllowed, sgOutboundDetail := checkSourceSGOutbound(topo, sourceInst, destIP, protocol, port)
	hop1 := ReachabilityHop{
		Component:   "sg-outbound",
		ResourceID:  strings.Join(sourceInst.SecurityGroups, ","),
		Status:      "allow",
		Detail:      sgOutboundDetail,
		MatchedRule: sgOutboundDetail,
	}
	if !sgOutboundAllowed {
		hop1.Status = "deny"
		allAllowed = false
		result.Issues = append(result.Issues, fmt.Sprintf("Source SG blocks outbound: %s", sgOutboundDetail))
	}
	result.Hops = append(result.Hops, hop1)

	// Hop 2: Source Subnet NACL Outbound
	sourceNACL := findNACL(topo, sourceSubnet.NetworkACLID)
	if sourceNACL != nil {
		action, detail, matchedRule := matchNACLRule(sourceNACL.Rules, "outbound", destIP, protocol, port)
		hop2 := ReachabilityHop{
			Component:   "nacl-outbound",
			ResourceID:  sourceNACL.ID,
			ResourceName: sourceNACL.ID,
			Status:      action,
			Detail:      detail,
			MatchedRule: matchedRule,
		}
		if action != "allow" {
			allAllowed = false
			result.Issues = append(result.Issues, fmt.Sprintf("Source NACL blocks outbound: %s", detail))
		}
		result.Hops = append(result.Hops, hop2)
	}

	// Hop 3: Route Table
	routeTable := findRouteTableForSubnet(topo, sourceInst.SubnetID)
	if routeTable != nil {
		target, targetType, detail := matchRoute(routeTable, destIP)
		hopStatus := "allow"
		if target == "" {
			hopStatus = "no-route"
			allAllowed = false
			result.Issues = append(result.Issues, "No route to destination")
		}
		hop3 := ReachabilityHop{
			Component:    "route-table",
			ResourceID:   routeTable.ID,
			ResourceName: routeTable.Name,
			Status:       hopStatus,
			Detail:       detail,
		}
		result.Hops = append(result.Hops, hop3)

		// Add intermediate hop for non-local routes
		if target != "" && targetType != "local" {
			hop3a := ReachabilityHop{
				Component:  targetType,
				ResourceID: target,
				Status:     "allow",
				Detail:     fmt.Sprintf("Traffic forwarded via %s", targetType),
			}
			result.Hops = append(result.Hops, hop3a)
		}
	}

	// Hop 4: Dest Subnet NACL Inbound
	destNACL := findNACL(topo, destSubnet.NetworkACLID)
	if destNACL != nil {
		action, detail, matchedRule := matchNACLRule(destNACL.Rules, "inbound", sourceInst.PrivateIP, protocol, port)
		hop4 := ReachabilityHop{
			Component:   "nacl-inbound",
			ResourceID:  destNACL.ID,
			ResourceName: destNACL.ID,
			Status:      action,
			Detail:      detail,
			MatchedRule: matchedRule,
		}
		if action != "allow" {
			allAllowed = false
			result.Issues = append(result.Issues, fmt.Sprintf("Destination NACL blocks inbound: %s", detail))
		}
		result.Hops = append(result.Hops, hop4)
	}

	// Hop 5: Dest SG Inbound
	sgInboundAllowed, sgInboundDetail := checkDestSGInbound(topo, destInst, sourceInst.PrivateIP, protocol, port)
	hop5 := ReachabilityHop{
		Component:   "sg-inbound",
		ResourceID:  strings.Join(destInst.SecurityGroups, ","),
		Status:      "allow",
		Detail:      sgInboundDetail,
		MatchedRule: sgInboundDetail,
	}
	if !sgInboundAllowed {
		hop5.Status = "deny"
		allAllowed = false
		result.Issues = append(result.Issues, fmt.Sprintf("Destination SG blocks inbound: %s", sgInboundDetail))
	}
	result.Hops = append(result.Hops, hop5)

	// Return path (NACL stateless check)
	if destNACL != nil {
		action, detail, matchedRule := matchNACLRule(destNACL.Rules, "outbound", sourceInst.PrivateIP, protocol, 32768)
		hopReturn1 := ReachabilityHop{
			Component:   "nacl-outbound-return",
			ResourceID:  destNACL.ID,
			ResourceName: destNACL.ID,
			Status:      action,
			Detail:      fmt.Sprintf("Return traffic (ephemeral): %s", detail),
			MatchedRule: matchedRule,
		}
		if action != "allow" {
			allAllowed = false
			result.Issues = append(result.Issues, fmt.Sprintf("Destination NACL blocks return traffic: %s", detail))
		}
		result.ReturnPath = append(result.ReturnPath, hopReturn1)
	}

	if sourceNACL != nil {
		action, detail, matchedRule := matchNACLRule(sourceNACL.Rules, "inbound", destIP, protocol, 32768)
		hopReturn2 := ReachabilityHop{
			Component:   "nacl-inbound-return",
			ResourceID:  sourceNACL.ID,
			ResourceName: sourceNACL.ID,
			Status:      action,
			Detail:      fmt.Sprintf("Return traffic (ephemeral): %s", detail),
			MatchedRule: matchedRule,
		}
		if action != "allow" {
			allAllowed = false
			result.Issues = append(result.Issues, fmt.Sprintf("Source NACL blocks return traffic: %s", detail))
		}
		result.ReturnPath = append(result.ReturnPath, hopReturn2)
	}

	result.Reachable = allAllowed
	return result
}

// analyzeExternalPath traces the packet path from source to an external destination (outside VPC).
// For external traffic: SG outbound → NACL outbound → Route table → gateway (NAT/IGW/TGW) → return NACL inbound.
func analyzeExternalPath(topo *VPCTopology, result *ReachabilityResult, sourceInst *TopologyInstance, sourceSubnet *SubnetInfo, destIP string, protocol string, port int32) *ReachabilityResult {
	allAllowed := true

	// Hop 1: Source SG Outbound
	sgOutboundAllowed, sgOutboundDetail := checkSourceSGOutbound(topo, sourceInst, destIP, protocol, port)
	hop1 := ReachabilityHop{
		Component:   "sg-outbound",
		ResourceID:  strings.Join(sourceInst.SecurityGroups, ","),
		Status:      "allow",
		Detail:      sgOutboundDetail,
		MatchedRule: sgOutboundDetail,
	}
	if !sgOutboundAllowed {
		hop1.Status = "deny"
		allAllowed = false
		result.Issues = append(result.Issues, fmt.Sprintf("Source SG blocks outbound: %s", sgOutboundDetail))
	}
	result.Hops = append(result.Hops, hop1)

	// Hop 2: Source Subnet NACL Outbound
	sourceNACL := findNACL(topo, sourceSubnet.NetworkACLID)
	if sourceNACL != nil {
		action, detail, matchedRule := matchNACLRule(sourceNACL.Rules, "outbound", destIP, protocol, port)
		hop2 := ReachabilityHop{
			Component:    "nacl-outbound",
			ResourceID:   sourceNACL.ID,
			ResourceName: sourceNACL.ID,
			Status:       action,
			Detail:       detail,
			MatchedRule:  matchedRule,
		}
		if action != "allow" {
			allAllowed = false
			result.Issues = append(result.Issues, fmt.Sprintf("Source NACL blocks outbound: %s", detail))
		}
		result.Hops = append(result.Hops, hop2)
	}

	// Hop 3: Route Table — find route to external destination
	routeTable := findRouteTableForSubnet(topo, sourceInst.SubnetID)
	if routeTable != nil {
		target, targetType, detail := matchRoute(routeTable, destIP)
		hopStatus := "allow"
		if target == "" {
			hopStatus = "no-route"
			allAllowed = false
			result.Issues = append(result.Issues, "No route to destination")
		}
		hop3 := ReachabilityHop{
			Component:    "route-table",
			ResourceID:   routeTable.ID,
			ResourceName: routeTable.Name,
			Status:       hopStatus,
			Detail:       detail,
		}
		result.Hops = append(result.Hops, hop3)

		// Add gateway hop (NAT, IGW, TGW, VPC Peering)
		if target != "" && targetType != "local" {
			gwHop := ReachabilityHop{
				Component:  targetType,
				ResourceID: target,
				Status:     "allow",
				Detail:     fmt.Sprintf("Traffic exits VPC via %s (%s)", targetType, target),
			}
			// Resolve gateway name
			switch targetType {
			case "nat":
				for _, nat := range topo.NatGateways {
					if nat.ID == target {
						gwHop.ResourceName = nat.Name
						gwHop.Detail = fmt.Sprintf("Traffic exits via NAT GW %s (%s)", nat.Name, nat.PublicIP)
						break
					}
				}
			case "igw":
				for _, igw := range topo.InternetGateways {
					if igw.ID == target {
						gwHop.ResourceName = igw.ID
						gwHop.Detail = fmt.Sprintf("Traffic exits via Internet GW %s", igw.ID)
						break
					}
				}
			case "tgw":
				for _, tgw := range topo.TGWAttachments {
					if tgw.TGWID == target || tgw.AttachmentID == target {
						gwHop.ResourceName = tgw.TGWName
						gwHop.Detail = fmt.Sprintf("Traffic exits via TGW %s (%s)", tgw.TGWName, tgw.TGWID)
						break
					}
				}
			case "pcx":
				for _, pcx := range topo.VPCPeerings {
					if pcx.ID == target {
						gwHop.ResourceName = pcx.ID
						gwHop.Detail = fmt.Sprintf("Traffic exits via VPC Peering %s to %s", pcx.ID, pcx.AccepterVPC)
						break
					}
				}
			}
			result.Hops = append(result.Hops, gwHop)
		}
	} else {
		allAllowed = false
		result.Issues = append(result.Issues, "No route table found for source subnet")
	}

	// Return path: NACL inbound for return traffic (NACLs are stateless)
	if sourceNACL != nil {
		action, detail, matchedRule := matchNACLRule(sourceNACL.Rules, "inbound", destIP, protocol, 32768)
		hopReturn := ReachabilityHop{
			Component:    "nacl-inbound-return",
			ResourceID:   sourceNACL.ID,
			ResourceName: sourceNACL.ID,
			Status:       action,
			Detail:       fmt.Sprintf("Return traffic (ephemeral): %s", detail),
			MatchedRule:  matchedRule,
		}
		if action != "allow" {
			allAllowed = false
			result.Issues = append(result.Issues, fmt.Sprintf("Source NACL blocks return traffic: %s", detail))
		}
		result.ReturnPath = append(result.ReturnPath, hopReturn)
	}

	result.Reachable = allAllowed
	return result
}

// checkSourceSGOutbound checks if source SG allows outbound traffic.
func checkSourceSGOutbound(topo *VPCTopology, sourceInst *TopologyInstance, destIP string, protocol string, port int32) (bool, string) {
	if len(sourceInst.SecurityGroups) == 0 {
		return false, "No security groups attached"
	}

	for _, sgID := range sourceInst.SecurityGroups {
		sg := findSG(topo, sgID)
		if sg == nil {
			continue
		}
		allowed, detail := matchSGRule(sg.OutboundRules, destIP, protocol, port)
		if allowed {
			return true, fmt.Sprintf("SG %s outbound rule allows: %s", sgID, detail)
		}
	}

	return false, "No matching outbound rule in security groups"
}

// checkDestSGInbound checks if destination SG allows inbound traffic.
func checkDestSGInbound(topo *VPCTopology, destInst *TopologyInstance, sourceIP string, protocol string, port int32) (bool, string) {
	if len(destInst.SecurityGroups) == 0 {
		return false, "No security groups attached"
	}

	for _, sgID := range destInst.SecurityGroups {
		sg := findSG(topo, sgID)
		if sg == nil {
			continue
		}
		allowed, detail := matchSGRule(sg.InboundRules, sourceIP, protocol, port)
		if allowed {
			return true, fmt.Sprintf("SG %s inbound rule allows: %s", sgID, detail)
		}
	}

	return false, "No matching inbound rule in security groups"
}

// matchSGRule checks if any rule in the list allows the given IP, protocol, and port.
func matchSGRule(rules []SGRuleInfo, targetIP string, protocol string, port int32) (bool, string) {
	for _, rule := range rules {
		if !protocolMatch(rule.Protocol, protocol) {
			continue
		}

		if protocol == "tcp" || protocol == "udp" {
			if !portInRange(port, rule.FromPort, rule.ToPort) {
				continue
			}
		}

		if strings.HasPrefix(rule.Source, "sg-") {
			return true, fmt.Sprintf("Protocol %s port %d from SG %s", protocol, port, rule.Source)
		}

		if ipInCIDR(targetIP, rule.Source) {
			return true, fmt.Sprintf("Protocol %s port %d from %s", protocol, port, rule.Source)
		}
	}

	return false, ""
}

// matchNACLRule evaluates ordered NACL rules for a given IP, protocol, port.
func matchNACLRule(rules []NACLRuleInfo, direction string, targetIP string, protocol string, port int32) (string, string, string) {
	filtered := []NACLRuleInfo{}
	for _, rule := range rules {
		if rule.Direction == direction {
			filtered = append(filtered, rule)
		}
	}

	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].RuleNumber < filtered[j].RuleNumber
	})

	for _, rule := range filtered {
		if rule.RuleNumber == 32767 {
			continue
		}

		if !protocolMatch(rule.Protocol, protocol) {
			continue
		}

		if protocol == "tcp" || protocol == "udp" {
			if !portInRange(port, rule.FromPort, rule.ToPort) {
				continue
			}
		}

		if ipInCIDR(targetIP, rule.CIDRBlock) {
			detail := fmt.Sprintf("Rule %d: %s %s port %d from %s",
				rule.RuleNumber, strings.ToUpper(rule.Action), protocol, port, rule.CIDRBlock)
			matchedRule := fmt.Sprintf("Rule %d: %s %s/%d-%d %s",
				rule.RuleNumber, rule.Action, rule.Protocol, rule.FromPort, rule.ToPort, rule.CIDRBlock)
			return rule.Action, detail, matchedRule
		}
	}

	return "deny", "Default rule: DENY all", "Rule 32767: deny all"
}

// matchRoute does longest-prefix matching on the route table for the destination IP.
func matchRoute(rt *RouteTableInfo, destIP string) (string, string, string) {
	var bestRoute *RouteInfo
	var longestPrefix int = -1

	for i := range rt.Routes {
		route := &rt.Routes[i]
		if route.State != "active" {
			continue
		}

		if ipInCIDR(destIP, route.Destination) {
			_, network, err := net.ParseCIDR(route.Destination)
			if err != nil {
				continue
			}
			prefixLen, _ := network.Mask.Size()
			if prefixLen > longestPrefix {
				longestPrefix = prefixLen
				bestRoute = route
			}
		}
	}

	if bestRoute == nil {
		return "", "", "No matching route"
	}

	detail := fmt.Sprintf("Route to %s via %s (%s)", bestRoute.Destination, bestRoute.Target, bestRoute.TargetType)
	return bestRoute.Target, bestRoute.TargetType, detail
}

// AnalyzeExposure identifies internet-exposed instances and ports.
func AnalyzeExposure(topo *VPCTopology) *ExposureResult {
	result := &ExposureResult{
		ExposedInstances: []ExposedInstance{},
		ExposedPorts:     []ExposedPort{},
	}

	for _, instance := range topo.Instances {
		subnet := findSubnet(topo, instance.SubnetID)
		if subnet == nil || !subnet.IsPublic {
			continue
		}

		publicIP := instance.PrivateIP
		if instance.ID != "" {
			result.ExposedInstances = append(result.ExposedInstances, ExposedInstance{
				InstanceID: instance.ID,
				Name:       instance.Name,
				PublicIP:   publicIP,
				SubnetID:   instance.SubnetID,
			})
		}

		for _, sgID := range instance.SecurityGroups {
			sg := findSG(topo, sgID)
			if sg == nil {
				continue
			}

			for _, rule := range sg.InboundRules {
				if !isPermissiveSource(rule.Source) {
					continue
				}

				severity := calculateSeverity(rule.Protocol, rule.FromPort, rule.ToPort, rule.Source)

				if rule.FromPort == rule.ToPort {
					result.ExposedPorts = append(result.ExposedPorts, ExposedPort{
						InstanceID: instance.ID,
						Name:       instance.Name,
						Port:       rule.FromPort,
						Protocol:   rule.Protocol,
						Source:     rule.Source,
						SGID:       sgID,
						Severity:   severity,
					})
				} else {
					for port := rule.FromPort; port <= rule.ToPort && port < rule.FromPort+100; port++ {
						result.ExposedPorts = append(result.ExposedPorts, ExposedPort{
							InstanceID: instance.ID,
							Name:       instance.Name,
							Port:       port,
							Protocol:   rule.Protocol,
							Source:     rule.Source,
							SGID:       sgID,
							Severity:   severity,
						})
					}
				}
			}
		}
	}

	return result
}

// AnalyzeRuleConflicts finds problematic SG/NACL rules.
func AnalyzeRuleConflicts(topo *VPCTopology) []RuleConflict {
	conflicts := []RuleConflict{}

	for _, sg := range topo.SecurityGroups {
		for _, rule := range sg.InboundRules {
			if rule.Source == "0.0.0.0/0" || rule.Source == "::/0" {
				if rule.FromPort == 0 && rule.ToPort == 65535 {
					conflicts = append(conflicts, RuleConflict{
						Type:         "overly-permissive",
						ResourceID:   sg.ID,
						ResourceName: sg.Name,
						Description:  fmt.Sprintf("SG allows all traffic from internet: %s protocol %s", rule.Source, rule.Protocol),
						Severity:     "high",
					})
				}
			}
		}

		redundant := findRedundantSGRules(sg.InboundRules)
		for _, desc := range redundant {
			conflicts = append(conflicts, RuleConflict{
				Type:         "redundant",
				ResourceID:   sg.ID,
				ResourceName: sg.Name,
				Description:  desc,
				Severity:     "low",
			})
		}
	}

	for _, nacl := range topo.NetworkACLs {
		shadowed := findShadowedNACLRules(nacl.Rules)
		for _, desc := range shadowed {
			conflicts = append(conflicts, RuleConflict{
				Type:         "shadowed",
				ResourceID:   nacl.ID,
				ResourceName: nacl.ID,
				Description:  desc,
				Severity:     "medium",
			})
		}

		if !hasEphemeralPorts(nacl.Rules) {
			conflicts = append(conflicts, RuleConflict{
				Type:         "missing-ephemeral",
				ResourceID:   nacl.ID,
				ResourceName: nacl.ID,
				Description:  "NACL may block return traffic (ephemeral ports 1024-65535 not explicitly allowed)",
				Severity:     "high",
			})
		}
	}

	return conflicts
}

// Helper functions

func findInstance(topo *VPCTopology, instanceID string) *TopologyInstance {
	for i := range topo.Instances {
		if topo.Instances[i].ID == instanceID {
			return &topo.Instances[i]
		}
	}
	return nil
}

func findInstanceByIP(topo *VPCTopology, ip string) *TopologyInstance {
	for i := range topo.Instances {
		if topo.Instances[i].PrivateIP == ip || topo.Instances[i].PublicIP == ip {
			return &topo.Instances[i]
		}
	}
	return nil
}

func findSubnet(topo *VPCTopology, subnetID string) *SubnetInfo {
	for i := range topo.Subnets {
		if topo.Subnets[i].ID == subnetID {
			return &topo.Subnets[i]
		}
	}
	return nil
}

func findSG(topo *VPCTopology, sgID string) *SecurityGroupInfo {
	for i := range topo.SecurityGroups {
		if topo.SecurityGroups[i].ID == sgID {
			return &topo.SecurityGroups[i]
		}
	}
	return nil
}

func findNACL(topo *VPCTopology, naclID string) *NetworkACLInfo {
	for i := range topo.NetworkACLs {
		if topo.NetworkACLs[i].ID == naclID {
			return &topo.NetworkACLs[i]
		}
	}
	return nil
}

func findRouteTableForSubnet(topo *VPCTopology, subnetID string) *RouteTableInfo {
	for i := range topo.RouteTables {
		for _, sid := range topo.RouteTables[i].SubnetIDs {
			if sid == subnetID {
				return &topo.RouteTables[i]
			}
		}
	}
	for i := range topo.RouteTables {
		if topo.RouteTables[i].IsMain {
			return &topo.RouteTables[i]
		}
	}
	return nil
}

func isPermissiveSource(source string) bool {
	return source == "0.0.0.0/0" || source == "::/0"
}

func calculateSeverity(protocol string, fromPort, toPort int32, source string) string {
	sensitivePorts := map[int32]bool{
		22: true, 3389: true, 3306: true, 5432: true,
		1433: true, 27017: true, 6379: true, 9200: true, 5601: true,
	}

	if sensitivePorts[fromPort] || sensitivePorts[toPort] {
		return "critical"
	}

	if (source == "0.0.0.0/0" || source == "::/0") && fromPort == 0 && toPort == 65535 {
		return "high"
	}

	return "medium"
}

func findRedundantSGRules(rules []SGRuleInfo) []string {
	redundant := []string{}
	for i := 0; i < len(rules); i++ {
		for j := i + 1; j < len(rules); j++ {
			if rules[i].Protocol == rules[j].Protocol &&
				rules[i].FromPort == rules[j].FromPort &&
				rules[i].ToPort == rules[j].ToPort &&
				rules[i].Source == rules[j].Source {
				redundant = append(redundant, fmt.Sprintf("Redundant rule: %s %d-%d from %s",
					rules[i].Protocol, rules[i].FromPort, rules[i].ToPort, rules[i].Source))
			}
		}
	}
	return redundant
}

func findShadowedNACLRules(rules []NACLRuleInfo) []string {
	shadowed := []string{}

	ingressRules := []NACLRuleInfo{}
	egressRules := []NACLRuleInfo{}

	for _, rule := range rules {
		if rule.Direction == "ingress" {
			ingressRules = append(ingressRules, rule)
		} else {
			egressRules = append(egressRules, rule)
		}
	}

	shadowed = append(shadowed, checkShadowing(ingressRules, "ingress")...)
	shadowed = append(shadowed, checkShadowing(egressRules, "egress")...)

	return shadowed
}

func checkShadowing(rules []NACLRuleInfo, direction string) []string {
	shadowed := []string{}

	sort.Slice(rules, func(i, j int) bool {
		return rules[i].RuleNumber < rules[j].RuleNumber
	})

	for i := 0; i < len(rules); i++ {
		if rules[i].RuleNumber == 32767 {
			continue
		}
		for j := i + 1; j < len(rules); j++ {
			if rules[j].RuleNumber == 32767 {
				continue
			}
			if rules[i].Action == "deny" && rules[j].Action == "allow" {
				if cidrOverlaps(rules[i].CIDRBlock, rules[j].CIDRBlock) &&
					protocolMatch(rules[i].Protocol, rules[j].Protocol) {
					shadowed = append(shadowed, fmt.Sprintf(
						"Rule %d (DENY) shadows rule %d (ALLOW) in %s direction",
						rules[i].RuleNumber, rules[j].RuleNumber, direction))
				}
			}
		}
	}

	return shadowed
}

func cidrOverlaps(cidr1, cidr2 string) bool {
	_, net1, err1 := net.ParseCIDR(cidr1)
	_, net2, err2 := net.ParseCIDR(cidr2)
	if err1 != nil || err2 != nil {
		return false
	}
	return net1.Contains(net2.IP) || net2.Contains(net1.IP)
}

func hasEphemeralPorts(rules []NACLRuleInfo) bool {
	for _, rule := range rules {
		if rule.Action == "allow" && (rule.Direction == "egress" || rule.Direction == "ingress") {
			if rule.FromPort <= 1024 && rule.ToPort >= 65535 {
				return true
			}
		}
	}
	return false
}

// ipInCIDR checks if an IP is within a CIDR range.
func ipInCIDR(ip string, cidr string) bool {
	if cidr == "" || ip == "" {
		return false
	}
	if cidr == "0.0.0.0/0" || cidr == "::/0" {
		return true
	}
	_, network, err := net.ParseCIDR(cidr)
	if err != nil {
		return false
	}
	return network.Contains(net.ParseIP(ip))
}

// protocolMatch checks if two protocol values match.
func protocolMatch(ruleProto, queryProto string) bool {
	if ruleProto == "-1" || ruleProto == "all" {
		return true
	}

	normalizedRule := normalizeProtocol(ruleProto)
	normalizedQuery := normalizeProtocol(queryProto)

	return normalizedRule == normalizedQuery
}

func normalizeProtocol(proto string) string {
	switch proto {
	case "tcp":
		return "6"
	case "udp":
		return "17"
	case "icmp":
		return "1"
	default:
		return proto
	}
}

// portInRange checks if a port falls within a from-to range.
func portInRange(port, fromPort, toPort int32) bool {
	if fromPort == 0 && toPort == 0 {
		return true
	}
	if fromPort == 0 && toPort == 65535 {
		return true
	}
	return port >= fromPort && port <= toPort
}
