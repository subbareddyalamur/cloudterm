/**
 * Pure helper functions for local reachability analysis.
 * Evaluates SG, NACL, and route table rules without network calls.
 */

import type {
  VPCTopology,
  TopologyInstance,
  ReachabilityHop,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Protocol = "tcp" | "udp" | "icmp";

export interface LocalAnalysisResult {
  reachable: boolean;
  forwardPath: ReachabilityHop[];
  returnPath: ReachabilityHop[];
}

// ---------------------------------------------------------------------------
// CIDR / protocol helpers
// ---------------------------------------------------------------------------

export function matchesCIDR(ip: string, cidr: string): boolean {
  if (cidr === "0.0.0.0/0" || cidr === "::/0") return true;
  const [base, bits] = cidr.split("/");
  if (!bits) return ip === cidr;
  const mask = ~0 << (32 - parseInt(bits, 10));
  const ipNum = ipToNum(ip);
  const baseNum = ipToNum(base);
  return (ipNum & mask) === (baseNum & mask);
}

export function ipToNum(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
}

function protoMatch(ruleProto: string, proto: string): boolean {
  if (ruleProto === "-1" || ruleProto === "all") return true;
  return ruleProto.toLowerCase() === proto.toLowerCase();
}

function portInRange(port: number, from: number, to: number): boolean {
  if (from === 0 && to === 0) return true;
  if (from === -1 && to === -1) return true;
  return port >= from && port <= to;
}

// ---------------------------------------------------------------------------
// Severity color util (shared across tabs)
// ---------------------------------------------------------------------------

export function severityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "text-red-500";
    case "high":
      return "text-orange-500";
    case "medium":
      return "text-yellow-500";
    case "low":
      return "text-blue-400";
    default:
      return "text-muted-foreground";
  }
}

// ---------------------------------------------------------------------------
// Local rule-based analysis
// ---------------------------------------------------------------------------

export function analyzeLocal(
  topo: VPCTopology,
  source: TopologyInstance,
  destIp: string,
  destInst: TopologyInstance | undefined,
  protocol: Protocol,
  port: number,
): LocalAnalysisResult {
  const forwardPath: ReachabilityHop[] = [];
  const returnPath: ReachabilityHop[] = [];
  let reachable = true;

  // 1. Source SG outbound
  const srcSGs = topo.securityGroups.filter((sg) =>
    source.securityGroups.includes(sg.id),
  );
  let sgOutAllow = false;
  let sgOutRule = "";
  for (const sg of srcSGs) {
    for (const rule of sg.outboundRules) {
      if (
        protoMatch(rule.protocol, protocol) &&
        portInRange(port, rule.fromPort, rule.toPort) &&
        matchesCIDR(destIp, rule.source)
      ) {
        sgOutAllow = true;
        sgOutRule = `${sg.name}: ${rule.protocol} ${rule.fromPort}-${rule.toPort} → ${rule.source}`;
        break;
      }
    }
    if (sgOutAllow) break;
  }
  forwardPath.push({
    component: "Security Group (Outbound)",
    resourceId: srcSGs.map((s) => s.id).join(", "),
    resourceName: srcSGs.map((s) => s.name).join(", "),
    status: sgOutAllow ? "allow" : "deny",
    detail: sgOutAllow ? "Matched outbound rule" : "No matching outbound rule",
    matchedRule: sgOutRule || undefined,
  });
  if (!sgOutAllow) reachable = false;

  // 2. Source subnet NACL outbound
  const srcSubnet = topo.subnets.find((s) => s.id === source.subnetId);
  const srcNacl = topo.networkAcls.find((n) => n.id === srcSubnet?.networkAclId);
  let naclOutAllow = false;
  let naclOutRule = "";
  if (srcNacl) {
    const outRules = srcNacl.rules
      .filter((r) => r.direction === "egress")
      .sort((a, b) => a.ruleNumber - b.ruleNumber);
    for (const rule of outRules) {
      if (
        protoMatch(rule.protocol, protocol) &&
        portInRange(port, rule.fromPort, rule.toPort) &&
        matchesCIDR(destIp, rule.cidrBlock)
      ) {
        naclOutAllow = rule.action === "allow";
        naclOutRule = `#${rule.ruleNumber} ${rule.action} ${rule.cidrBlock} ${rule.protocol} ${rule.fromPort}-${rule.toPort}`;
        break;
      }
    }
  }
  forwardPath.push({
    component: "Network ACL (Outbound)",
    resourceId: srcNacl?.id ?? "unknown",
    status: naclOutAllow ? "allow" : "deny",
    detail: naclOutAllow ? "Matched outbound NACL rule" : "No matching or denied by NACL",
    matchedRule: naclOutRule || undefined,
  });
  if (!naclOutAllow) reachable = false;

  // 3. Route table (subnet-specific first, then main as fallback)
  const srcRT = topo.routeTables.find((rt) => rt.subnetIds.includes(source.subnetId))
    ?? topo.routeTables.find((rt) => rt.isMain);
  let routeMatch = false;
  let routeTarget = "";
  if (srcRT) {
    for (const route of srcRT.routes) {
      if (matchesCIDR(destIp, route.destination)) {
        routeMatch = true;
        routeTarget = `${route.destination} → ${route.target} (${route.targetType})`;
        break;
      }
    }
  }
  forwardPath.push({
    component: "Route Table",
    resourceId: srcRT?.id ?? "unknown",
    resourceName: srcRT?.name,
    status: routeMatch ? "allow" : "deny",
    detail: routeMatch ? "Route found" : "No matching route",
    matchedRule: routeTarget || undefined,
  });
  if (!routeMatch) reachable = false;

  // 4–5. Destination NACL inbound + SG inbound (if dest in VPC)
  if (destInst) {
    const dstSubnet = topo.subnets.find((s) => s.id === destInst.subnetId);
    const dstNacl = topo.networkAcls.find((n) => n.id === dstSubnet?.networkAclId);

    // 4. NACL inbound
    let naclInAllow = false;
    let naclInRule = "";
    if (dstNacl) {
      const inRules = dstNacl.rules
        .filter((r) => r.direction === "ingress")
        .sort((a, b) => a.ruleNumber - b.ruleNumber);
      for (const rule of inRules) {
        if (
          protoMatch(rule.protocol, protocol) &&
          portInRange(port, rule.fromPort, rule.toPort) &&
          matchesCIDR(source.privateIp, rule.cidrBlock)
        ) {
          naclInAllow = rule.action === "allow";
          naclInRule = `#${rule.ruleNumber} ${rule.action} ${rule.cidrBlock} ${rule.protocol} ${rule.fromPort}-${rule.toPort}`;
          break;
        }
      }
    }
    forwardPath.push({
      component: "Network ACL (Inbound)",
      resourceId: dstNacl?.id ?? "unknown",
      status: naclInAllow ? "allow" : "deny",
      detail: naclInAllow ? "Matched inbound NACL rule" : "No matching or denied by NACL",
      matchedRule: naclInRule || undefined,
    });
    if (!naclInAllow) reachable = false;

    // 5. SG inbound
    const dstSGs = topo.securityGroups.filter((sg) =>
      destInst.securityGroups.includes(sg.id),
    );
    let sgInAllow = false;
    let sgInRule = "";
    for (const sg of dstSGs) {
      for (const rule of sg.inboundRules) {
        if (
          protoMatch(rule.protocol, protocol) &&
          portInRange(port, rule.fromPort, rule.toPort) &&
          matchesCIDR(source.privateIp, rule.source)
        ) {
          sgInAllow = true;
          sgInRule = `${sg.name}: ${rule.protocol} ${rule.fromPort}-${rule.toPort} ← ${rule.source}`;
          break;
        }
      }
      if (sgInAllow) break;
    }
    forwardPath.push({
      component: "Security Group (Inbound)",
      resourceId: dstSGs.map((s) => s.id).join(", "),
      resourceName: dstSGs.map((s) => s.name).join(", "),
      status: sgInAllow ? "allow" : "deny",
      detail: sgInAllow ? "Matched inbound rule" : "No matching inbound rule",
      matchedRule: sgInRule || undefined,
    });
    if (!sgInAllow) reachable = false;

    // Return path: SG outbound + NACL outbound from dest
    let retSGAllow = false;
    let retSGRule = "";
    for (const sg of dstSGs) {
      for (const rule of sg.outboundRules) {
        if (
          protoMatch(rule.protocol, protocol) &&
          matchesCIDR(source.privateIp, rule.source)
        ) {
          retSGAllow = true;
          retSGRule = `${sg.name}: ${rule.protocol} → ${rule.source}`;
          break;
        }
      }
      if (retSGAllow) break;
    }
    returnPath.push({
      component: "Return SG (Outbound)",
      resourceId: dstSGs.map((s) => s.id).join(", "),
      status: retSGAllow ? "allow" : "deny",
      detail: retSGAllow ? "Return traffic allowed" : "Return traffic denied",
      matchedRule: retSGRule || undefined,
    });

    let retNACLAllow = false;
    let retNACLRule = "";
    if (dstNacl) {
      const outRules = dstNacl.rules
        .filter((r) => r.direction === "egress")
        .sort((a, b) => a.ruleNumber - b.ruleNumber);
      for (const rule of outRules) {
        if (
          protoMatch(rule.protocol, protocol) &&
          matchesCIDR(source.privateIp, rule.cidrBlock)
        ) {
          retNACLAllow = rule.action === "allow";
          retNACLRule = `#${rule.ruleNumber} ${rule.action} ${rule.cidrBlock}`;
          break;
        }
      }
    }
    returnPath.push({
      component: "Return NACL (Outbound)",
      resourceId: dstNacl?.id ?? "unknown",
      status: retNACLAllow ? "allow" : "deny",
      detail: retNACLAllow ? "Return traffic allowed" : "Return traffic denied",
      matchedRule: retNACLRule || undefined,
    });
  } else {
    forwardPath.push({
      component: "Destination NACL (Inbound)",
      resourceId: "external",
      status: "allow",
      detail: "Destination outside VPC — not analyzed locally",
    });
    forwardPath.push({
      component: "Destination SG (Inbound)",
      resourceId: "external",
      status: "allow",
      detail: "Destination outside VPC — not analyzed locally",
    });
  }

  return { reachable, forwardPath, returnPath };
}
