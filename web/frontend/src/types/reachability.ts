/** Result of reachability analysis between two endpoints. */
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

/** Request body for POST /topology/deep-analyze. */
export interface AnalyzeRequest {
  sourceInstanceId: string;
  destInstanceId?: string;
  destIp?: string;
  protocol: string;
  port: number;
}
