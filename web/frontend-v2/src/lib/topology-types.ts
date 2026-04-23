export type NodeKind =
  | 'vpc'
  | 'az'
  | 'subnet'
  | 'instance'
  | 'sg'
  | 'igw'
  | 'nat'
  | 'route-table'
  | 'endpoint'
  | 'peer-vpc'
  | 'tgw'
  | 'tgw-peer'
  | 'vpc-endpoint';

export type EdgeKind = 'route' | 'sg-attach' | 'nat-flow' | 'peering' | 'dependency' | 'tgw-connect' | 'endpoint-connect';

export interface TopoNode {
  id: string;
  kind: NodeKind;
  label: string;
  data: Record<string, unknown>;
  position?: { x: number; y: number };
  parent?: string;
}

export interface TopoEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

export interface Topology {
  nodes: TopoNode[];
  edges: TopoEdge[];
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

export interface SGRuleInfo {
  protocol: string;
  fromPort: number;
  toPort: number;
  source: string;
  description?: string;
}

export interface SecurityGroupInfo {
  id: string;
  name: string;
  description: string;
  inboundRules: SGRuleInfo[];
  outboundRules: SGRuleInfo[];
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

export interface NetworkACLInfo {
  id: string;
  isDefault: boolean;
  subnetIds: string[];
  rules: NACLRuleInfo[];
}

export interface RouteInfo {
  destination: string;
  target: string;
  targetType: string;
  state: string;
}

export interface RouteTableInfo {
  id: string;
  name: string;
  subnetIds: string[];
  isMain: boolean;
  routes: RouteInfo[];
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

export interface TGWPeerAttachment {
  attachmentId: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  resourceCidr?: string;
  state: string;
  accountId?: string;
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

export interface LBListenerInfo {
  port: number;
  protocol: string;
}

export interface LBTargetInfo {
  targetId: string;
  port: number;
  healthState: string;
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

export interface PeerVPCDetails {
  vpcId: string;
  name: string;
  cidr: string;
  accountId?: string;
  region?: string;
  connectionType?: 'peering' | 'tgw' | 'privatelink';
  subnets: SubnetInfo[];
  instances: TopologyInstance[];
  natGateways?: NATGWInfo[];
}

export interface VPCTopology {
  vpc: VPCInfo;
  subnets: SubnetInfo[];
  instances: TopologyInstance[];
  securityGroups: SecurityGroupInfo[];
  networkAcls: NetworkACLInfo[];
  routeTables: RouteTableInfo[];
  internetGateways: IGWInfo[];
  natGateways: NATGWInfo[];
  tgwAttachments?: TGWAttachmentInfo[];
  vpcPeerings?: VPCPeeringInfo[];
  vpcEndpoints?: VPCEndpointInfo[];
  loadBalancers?: TopologyLBInfo[];
  peerVpcDetails?: PeerVPCDetails[];
  fetchedAt: string;
}

export interface ReachabilityEndpoint {
  instanceId?: string;
  ip: string;
  subnetId?: string;
  vpcId?: string;
}

export interface ReachabilityHop {
  component: string;
  resourceId: string;
  resourceName?: string;
  status: string;
  detail: string;
  matchedRule?: string;
}

export interface ReachabilityResult {
  source: ReachabilityEndpoint;
  destination: ReachabilityEndpoint;
  protocol: string;
  port: number;
  reachable: boolean;
  hops: ReachabilityHop[];
  returnPath?: ReachabilityHop[];
  issues: string[];
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

export interface ExposureResult {
  exposedInstances: ExposedInstance[];
  exposedPorts: ExposedPort[];
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
  path: DeepHop[];
  blocker?: string;
}

export interface DeepAnalysisEvent {
  type: 'status' | 'hop' | 'result' | 'error';
  message?: string;
  hop?: DeepHop;
  result?: DeepResult;
}

export interface AnalyzeRequest {
  sourceInstanceId: string;
  destInstanceId?: string;
  destIp?: string;
  protocol: string;
  port: number;
}

export interface RuleConflict {
  type: string;
  resourceId: string;
  resourceName: string;
  description: string;
  severity: string;
}
