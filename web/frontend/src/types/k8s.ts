/** EKS cluster returned by GET /api/k8s/clusters. */
export interface EKSCluster {
  name: string;
  status: string;
  version: string;
  endpoint: string;
  region: string;
  account_id: string;
  ca_cert: string;
}

/** Resource category returned by GET /api/k8s/categories. */
export interface ResourceCategory {
  name: string;
  resources: ResourceType[];
}

export interface ResourceType {
  name: string;
  kind: string;
  group: string;
  version: string;
  namespaced: boolean;
}

/** A selected resource in the k8s dashboard tree. */
export interface K8sSelectedResource {
  kind: string;
  name: string;
  namespace: string;
  group: string;
  version: string;
  resource: string;
  containers: string[];
}

/** Pod reference for logs/exec. */
export interface K8sPodRef {
  namespace: string;
  name: string;
  containers: string[];
}

/** Cluster info shown after connection. */
export interface K8sClusterInfo {
  name: string;
  version: string;
  endpoint: string;
}

/** Connect response from POST /api/k8s/connect. */
export interface K8sConnectResponse {
  cluster_id: string;
}

/** Kubeconfig upload response. */
export interface K8sKubeconfigUploadResponse {
  clusters: K8sKubeconfigCluster[];
}

/** A cluster parsed from an uploaded kubeconfig. */
export interface K8sKubeconfigCluster {
  name: string;
  server: string;
  certificateAuthority: string;
  exec_cmd?: string;
  exec_args?: string[];
  is_teleport?: boolean;
}

/** Kubeconfig connect response. */
export interface K8sKubeconfigConnectResponse {
  cluster_id?: string;
  error?: string;
  auth_required?: string;
  proxy?: string;
  auth_type?: string;
}

/** Teleport credential response. */
export interface K8sTeleportCredentials {
  auth_url: string;
  callback_id: string;
  error?: string;
}

/** Teleport status poll response. */
export interface K8sTeleportStatus {
  status: "pending" | "connected" | "failed";
  error?: string;
}

/** K8s resource item from the API (generic shape). */
export interface K8sResourceItem {
  metadata?: {
    name?: string;
    namespace?: string;
  };
  spec?: {
    containers?: Array<{ name: string }>;
  };
  status?: {
    phase?: string;
  };
  data?: Record<string, string>;
  [key: string]: unknown;
}

/** A log WebSocket message. */
export interface K8sLogMessage {
  log?: string;
  error?: string;
}

/** AWS account. */
export interface K8sAWSAccount {
  id: string;
  name?: string;
}
