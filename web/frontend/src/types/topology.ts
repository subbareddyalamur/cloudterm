/** Full VPC topology returned by GET /topology/{instanceId}. */
export interface VPCTopology {
  vpc: VPCInfo;
  subnets: SubnetInfo[];
  instances: TopologyInstance[];
  securityGroups: TopologySecurityGroup[];
  networkAcls: NetworkACLInfo[];
  routeTables: RouteTableInfo[];
  internetGateways: IGWInfo[];
  natGateways: NATGWInfo[];
  tgwAttachments: TGWAttachmentInfo[];
  vpcPeerings: VPCPeeringInfo[];
  vpcEndpoints: VPCEndpointInfo[];
  loadBalancers: TopologyLBInfo[];
  elasticIps?: ElasticIPInfo[];
  dhcpOptions?: DHCPOptionsInfo;
  flowLogs?: FlowLogInfo[];
  prefixLists?: PrefixListInfo[];
  fetchedAt: string;
}

export interface VPCInfo {
  id: string;
  cidr: string;
  name: string;
  isDefault: boolean;
}

export interface SubnetInfo {
  id: string;
  cidr: string;
  name: string;
  az: string;
  isPublic: boolean;
  availableIps: number;
  routeTableId: string;
  networkAclId: string;
}

export interface TopologyInstance {
  id: string;
  name: string;
  privateIp: string;
  publicIp: string;
  state: string;
  platform: string;
  instanceType: string;
  subnetId: string;
  securityGroups: string[];
}

/** Security group as seen in the topology (camelCase keys). */
export interface TopologySecurityGroup {
  id: string;
  name: string;
  description: string;
  inboundRules: SGRuleInfo[];
  outboundRules: SGRuleInfo[];
}

export interface SGRuleInfo {
  protocol: string;
  fromPort: number;
  toPort: number;
  source: string;
  description?: string;
}

export interface NetworkACLInfo {
  id: string;
  isDefault: boolean;
  subnetIds: string[];
  rules: NACLRuleInfo[];
}

export interface NACLRuleInfo {
  ruleNumber: number;
  direction: string;
  protocol: string;
  fromPort: number;
  toPort: number;
  cidrBlock: string;
  action: string;
}

export interface RouteTableInfo {
  id: string;
  name: string;
  subnetIds: string[];
  isMain: boolean;
  routes: RouteInfo[];
}

export interface RouteInfo {
  destination: string;
  target: string;
  targetType: string;
  state: string;
}

export interface IGWInfo {
  id: string;
  name: string;
}

export interface NATGWInfo {
  id: string;
  name: string;
  subnetId: string;
  publicIp: string;
  state: string;
}

export interface TGWAttachmentInfo {
  attachmentId: string;
  tgwId: string;
  tgwName: string;
  resourceType: string;
  state: string;
  subnetIds?: string[];
  peerAttachments?: TGWPeerAttachment[];
}

export interface TGWPeerAttachment {
  attachmentId: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  resourceCidr?: string;
  state: string;
  accountId?: string;
}

export interface VPCPeeringInfo {
  id: string;
  status: string;
  requesterVpc: string;
  requesterCidr: string;
  accepterVpc: string;
  accepterCidr: string;
  peerAccountId?: string;
  peerRegion?: string;
  peerVpcName?: string;
}

export interface VPCEndpointInfo {
  id: string;
  serviceName: string;
  type: string;
  state: string;
  subnetIds?: string[];
  routeTableIds?: string[];
}

export interface TopologyLBInfo {
  arn: string;
  name: string;
  dnsName: string;
  type: string;
  scheme: string;
  subnetIds: string[];
  securityGroups?: string[];
  listeners: LBListenerInfo[];
  targets: LBTargetInfo[];
}

export interface LBListenerInfo {
  port: number;
  protocol: string;
}

export interface LBTargetInfo {
  targetId: string;
  port: number;
  healthState: string;
}

export interface ElasticIPInfo {
  allocationId: string;
  publicIp: string;
  instanceId?: string;
  eni?: string;
  privateIp?: string;
  name?: string;
}

export interface DHCPOptionsInfo {
  id: string;
  domainName?: string;
  domainServers?: string[];
  ntpServers?: string[];
}

export interface FlowLogInfo {
  id: string;
  status: string;
  trafficType: string;
  logDestination: string;
  destinationType: string;
}

export interface PrefixListInfo {
  id: string;
  name: string;
  cidrs?: string[];
  maxEntries: number;
}

// --- Deep Analysis SSE events (POST /topology/deep-analyze) ---

export interface DeepAnalysisEvent {
  type: "status" | "hop" | "result" | "error";
  message?: string;
  hop?: DeepHop;
  result?: DeepResult;
}

export interface DeepHop {
  index: number;
  component: string;
  componentName: string;
  resourceId: string;
  resourceArn?: string;
  direction?: string;
  status: string;
  detail: string;
  matchedRule?: string;
  inVpc: boolean;
  vpcId?: string;
}

export interface DeepResult {
  reachable: boolean;
  pathId: string;
  analysisId: string;
  explanations?: string[];
  hopCount: number;
  hops: DeepHop[];
}

// --- Exposure analysis (GET /topology/exposure/{instanceId}) ---

export interface ExposureResult {
  exposedInstances: ExposedInstance[];
  exposedPorts: ExposedPort[];
}

export interface ExposedInstance {
  instanceId: string;
  name: string;
  publicIp: string;
  subnetId: string;
}

export interface ExposedPort {
  instanceId: string;
  name: string;
  port: number;
  protocol: string;
  source: string;
  sgId: string;
  severity: string;
}

// --- Rule conflicts (GET /topology/conflicts/{instanceId}) ---

export interface RuleConflict {
  type: string;
  resourceId: string;
  resourceName: string;
  description: string;
  severity: string;
}
