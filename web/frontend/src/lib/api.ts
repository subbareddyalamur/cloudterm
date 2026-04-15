import type {
  EC2Instance,
  EC2InstanceDetails,
  InstanceTree,
  FleetStats,
  FleetSummary,
  ScanStatus,
  ScanResult,
  InstanceMetrics,
  ManualAccount,
  AuditEvent,
  Recording,
  SuggestStatus,
  FileEntry,
  TransferProgress,
  VaultEntry,
  VaultMatchRule,
  RDPClient,
  RDPSessionInfo,
  GuacamoleTokenRequest,
  GuacamoleTokenResponse,
  ForwarderStartRequest,
  ForwarderStartResponse,
  ForwarderSession,
  BroadcastTarget,
  BroadcastResult,
  CloneStatus,
  CloneSettings,
  ReachabilityResult,
  AnalyzeRequest,
  CostSummary,
  CostBreakdown,
  CostTrend,
  CostDetails,
  ComprehensiveCost,
  CostFilters,
  CostQueryParams,
  EKSCluster,
  ResourceCategory,
  AIMessage,
  K8sConnectResponse,
  K8sResourceItem,
  K8sKubeconfigUploadResponse,
  K8sKubeconfigConnectResponse,
  K8sTeleportCredentials,
  K8sTeleportStatus,
  K8sAWSAccount,
} from "@/types";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Base helpers
// ---------------------------------------------------------------------------

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(url, init);
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body.error) msg = body.error;
    } catch {
      // use default message
    }
    throw new ApiError(resp.status, msg);
  }
  return resp.json() as Promise<T>;
}

function get<T>(url: string): Promise<T> {
  return request<T>(url);
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function put<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function del<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "DELETE",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// NDJSON streaming helper
// ---------------------------------------------------------------------------

export type NDJSONCallback<T = unknown> = (chunk: T) => void;

/**
 * Read an NDJSON response body, invoking `onMessage` for each parsed line.
 * Used for file transfer progress, AI streaming, etc.
 */
export async function readNDJSON<T = unknown>(
  resp: Response,
  onMessage: NDJSONCallback<T>,
): Promise<void> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.trim()) {
        try {
          onMessage(JSON.parse(line) as T);
        } catch {
          // skip malformed
        }
      }
    }
  }
  if (buffer.trim()) {
    try {
      onMessage(JSON.parse(buffer) as T);
    } catch {
      // skip
    }
  }
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

export function getInstances(): Promise<InstanceTree> {
  return get<InstanceTree>("/instances");
}

export function scanInstances(force = false): Promise<ScanResult> {
  return get<ScanResult>(`/scan-instances${force ? "?force=true" : ""}`);
}

export function scanRegion(profile: string, region: string): Promise<EC2Instance[]> {
  return get<EC2Instance[]>(`/scan-region${qs({ profile, region })}`);
}

export function scanStatus(): Promise<ScanStatus> {
  return get<ScanStatus>("/scan-status");
}

export function fleetStats(): Promise<FleetStats> {
  return get<FleetStats>("/fleet-stats");
}

export function fleetSummary(): Promise<FleetSummary> {
  return get<FleetSummary>("/fleet-summary");
}

// ---------------------------------------------------------------------------
// Instance details & metrics
// ---------------------------------------------------------------------------

export function instanceDetails(id: string): Promise<EC2InstanceDetails> {
  return get<EC2InstanceDetails>(`/instance-details${qs({ id })}`);
}

export function instanceMetrics(instanceId: string): Promise<InstanceMetrics> {
  return get<InstanceMetrics>(`/instance-metrics${qs({ instance_id: instanceId })}`);
}

// ---------------------------------------------------------------------------
// File transfer
// ---------------------------------------------------------------------------

export async function uploadFile(
  form: FormData,
  onProgress?: NDJSONCallback<TransferProgress>,
): Promise<void> {
  if (onProgress) {
    const resp = await fetch("/upload-file", { method: "POST", body: form });
    if (!resp.ok) throw new ApiError(resp.status, "Upload failed");
    await readNDJSON(resp, onProgress);
  } else {
    await post<unknown>("/upload-file", form);
  }
}

export async function downloadFile(
  body: { instance_id: string; remote_path: string; instance_name: string; aws_profile: string; aws_region: string },
  onProgress?: NDJSONCallback<TransferProgress>,
): Promise<void> {
  const resp = await fetch("/download-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new ApiError(resp.status, "Download failed");
  if (onProgress) {
    await readNDJSON(resp, onProgress);
  }
}

export function browseDirectory(body: {
  instance_id: string;
  path: string;
  aws_profile: string;
  aws_region: string;
}): Promise<FileEntry[]> {
  return post<FileEntry[]>("/browse-directory", body);
}

export async function expressUpload(
  form: FormData,
  onProgress?: NDJSONCallback<TransferProgress>,
): Promise<void> {
  const resp = await fetch("/express-upload", { method: "POST", body: form });
  if (!resp.ok) throw new ApiError(resp.status, "Express upload failed");
  if (onProgress) await readNDJSON(resp, onProgress);
}

export async function expressDownload(
  body: { instance_id: string; remote_path: string; aws_profile: string; aws_region: string },
  onProgress?: NDJSONCallback<TransferProgress>,
): Promise<void> {
  const resp = await fetch("/express-download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new ApiError(resp.status, "Express download failed");
  if (onProgress) await readNDJSON(resp, onProgress);
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

export function broadcastCommand(body: {
  command: string;
  targets: BroadcastTarget[];
}): Promise<BroadcastResult[]> {
  return post<BroadcastResult[]>("/broadcast-command", body);
}

// ---------------------------------------------------------------------------
// Port forwarding
// ---------------------------------------------------------------------------

export function startPortForward(body: ForwarderStartRequest): Promise<ForwarderStartResponse> {
  return post<ForwarderStartResponse>("/start-port-forward", body);
}

export function stopPortForward(body: {
  instance_id: string;
  local_port: number;
}): Promise<{ status: string }> {
  return post<{ status: string }>("/stop-port-forward", body);
}

export function activeTunnels(): Promise<ForwarderSession[]> {
  return get<ForwarderSession[]>("/active-tunnels");
}

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

export function listRecordings(): Promise<Recording[]> {
  return get<Recording[]>("/recordings");
}

export function deleteRecording(name: string): Promise<void> {
  return del<void>(`/recordings/${encodeURIComponent(name)}`);
}

export function toggleRecording(body: {
  session_id: string;
  enabled: boolean;
}): Promise<{ status: string }> {
  return post<{ status: string }>("/toggle-recording", body);
}

export function convertRecording(body: {
  filename: string;
}): Promise<{ job_id: string }> {
  return post<{ job_id: string }>("/convert-recording", body);
}

export function convertStatus(jobId: string): Promise<{
  status: string;
  progress: number;
  output_file?: string;
  error?: string;
}> {
  return get(`/convert-status/${encodeURIComponent(jobId)}`);
}

// ---------------------------------------------------------------------------
// RDP
// ---------------------------------------------------------------------------

export function startGuacamoleRDP(body: GuacamoleTokenRequest): Promise<GuacamoleTokenResponse> {
  return post<GuacamoleTokenResponse>("/start-guacamole-rdp", body);
}

export function stopGuacamoleRDP(body: { instance_id: string }): Promise<{ status: string }> {
  return post<{ status: string }>("/stop-guacamole-rdp", body);
}

export function guacamoleSessions(): Promise<RDPSessionInfo[]> {
  return get<RDPSessionInfo[]>("/guacamole-sessions");
}

export function rdpMode(): Promise<{ mode: string; guac_ws_url: string }> {
  return get<{ mode: string; guac_ws_url: string }>("/rdp-mode");
}

export function detectRDPClients(): Promise<RDPClient[]> {
  return get<RDPClient[]>("/detect-rdp-clients");
}

export function startRDPSession(body: {
  instance_id: string;
  instance_name: string;
  aws_profile: string;
  aws_region: string;
  port_number: number;
}): Promise<ForwarderStartResponse> {
  return post<ForwarderStartResponse>("/start-rdp-session", body);
}

export function launchRDPClient(body: {
  port: number;
  client?: string;
}): Promise<{ status: string }> {
  return post<{ status: string }>("/launch-rdp-client", body);
}

export function stopRDPSession(body: {
  instance_id: string;
}): Promise<{ status: string }> {
  return post<{ status: string }>("/stop-rdp-session", body);
}

// ---------------------------------------------------------------------------
// Settings / Preferences
// ---------------------------------------------------------------------------

export function getPreferences(): Promise<Record<string, unknown>> {
  return get<Record<string, unknown>>("/preferences");
}

export function savePreferences(prefs: Record<string, unknown>): Promise<void> {
  return put<void>("/preferences", prefs);
}

// ---------------------------------------------------------------------------
// AWS accounts
// ---------------------------------------------------------------------------

export function listAWSAccounts(): Promise<ManualAccount[]> {
  return get<ManualAccount[]>("/aws-accounts");
}

export function addAWSAccount(body: {
  name: string;
  access_key_id: string;
  secret_access_key: string;
  session_token?: string;
}): Promise<ManualAccount> {
  return post<ManualAccount>("/aws-accounts", body);
}

export function deleteAWSAccount(id: string): Promise<void> {
  return del<void>(`/aws-accounts/${encodeURIComponent(id)}`);
}

export function scanAWSAccount(id: string): Promise<{ status: string }> {
  return post<{ status: string }>(`/aws-accounts/scan/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

export function vaultList(): Promise<VaultEntry[]> {
  return get<VaultEntry[]>("/vault/credentials");
}

export function vaultSave(entry: VaultEntry): Promise<void> {
  return post<void>("/vault/credentials", entry);
}

export function vaultDelete(body: { id: string }): Promise<void> {
  return del<void>("/vault/credentials", body);
}

export function vaultMatch(params: {
  instance_id: string;
  name: string;
  platform: string;
  tags?: string;
}): Promise<VaultMatchRule | null> {
  return get<VaultMatchRule | null>(`/vault/match${qs(params)}`);
}

export function vaultResolve(ruleId: string): Promise<VaultEntry> {
  return get<VaultEntry>(`/vault/credentials${qs({ resolve: ruleId })}`);
}

// ---------------------------------------------------------------------------
// AI agent
// ---------------------------------------------------------------------------

/**
 * Start an AI chat streaming response. Returns the raw Response so the
 * caller can read SSE-style `data:` lines via {@link readAIChatStream}.
 */
export async function aiChat(body: {
  messages: AIMessage[];
  active_instance_id?: string;
}): Promise<Response> {
  const resp = await fetch("/ai-agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const e = await resp.json();
      if (e.error) msg = e.error;
    } catch {
      // use default
    }
    throw new ApiError(resp.status, msg);
  }
  return resp;
}

export function aiContext(): Promise<{ instances: unknown[] }> {
  return get<{ instances: unknown[] }>("/ai-agent/context");
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function auditLog(
  limit = 100,
  offset = 0,
): Promise<AuditEvent[]> {
  return get<AuditEvent[]>(`/audit-log${qs({ limit, offset })}`);
}

// ---------------------------------------------------------------------------
// Suggest
// ---------------------------------------------------------------------------

export function suggestStatus(): Promise<SuggestStatus> {
  return get<SuggestStatus>("/suggest-status");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportSession(body: {
  session_id: string;
  format: string;
}): Promise<{ file: string }> {
  return post<{ file: string }>("/export-session", body);
}

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------

export function cloneStart(body: {
  instance_id: string;
  name: string;
  aws_profile: string;
  aws_region: string;
}): Promise<{ clone_id: string }> {
  return post<{ clone_id: string }>("/clone/start", body);
}

export function cloneStatus(id: string): Promise<CloneStatus> {
  return get<CloneStatus>(`/clone/status/${encodeURIComponent(id)}`);
}

export function cloneSettings(id: string): Promise<CloneSettings> {
  return get<CloneSettings>(`/clone/settings/${encodeURIComponent(id)}`);
}

export function cloneLaunch(
  id: string,
  body: Record<string, unknown>,
): Promise<{ instance_id: string }> {
  return post<{ instance_id: string }>(`/clone/launch/${encodeURIComponent(id)}`, body);
}

// ---------------------------------------------------------------------------
// Topology & Reachability
// ---------------------------------------------------------------------------

export function topology(instanceId: string): Promise<unknown> {
  return get<unknown>(`/topology/${encodeURIComponent(instanceId)}`);
}

export function topologyDeepAnalyze(body: AnalyzeRequest): Promise<ReachabilityResult> {
  return post<ReachabilityResult>("/topology/deep-analyze", body);
}

export function topologyExposure(instanceId: string): Promise<unknown> {
  return get<unknown>(`/topology/exposure/${encodeURIComponent(instanceId)}`);
}

export function topologyConflicts(instanceId: string): Promise<unknown> {
  return get<unknown>(`/topology/conflicts/${encodeURIComponent(instanceId)}`);
}

// ---------------------------------------------------------------------------
// Cost Explorer
// ---------------------------------------------------------------------------

export function costSummary(params?: CostQueryParams): Promise<CostSummary> {
  return params ? post<CostSummary>("/cost-explorer/summary", params) : get<CostSummary>("/cost-explorer/summary");
}

export function costByService(params?: CostQueryParams): Promise<CostBreakdown> {
  return params ? post<CostBreakdown>("/cost-explorer/by-service", params) : get<CostBreakdown>("/cost-explorer/by-service");
}

export function costByAccount(params?: CostQueryParams): Promise<CostBreakdown> {
  return params ? post<CostBreakdown>("/cost-explorer/by-account", params) : get<CostBreakdown>("/cost-explorer/by-account");
}

export function costByTag(params?: CostQueryParams): Promise<CostBreakdown> {
  return params ? post<CostBreakdown>("/cost-explorer/by-tag", params) : get<CostBreakdown>("/cost-explorer/by-tag");
}

export function costTrend(params?: CostQueryParams): Promise<CostTrend> {
  return params ? post<CostTrend>("/cost-explorer/trend", params) : get<CostTrend>("/cost-explorer/trend");
}

export function costDetails(params?: CostQueryParams): Promise<CostDetails> {
  return params ? post<CostDetails>("/cost-explorer/details", params) : get<CostDetails>("/cost-explorer/details");
}

export function costComprehensive(): Promise<ComprehensiveCost> {
  return get<ComprehensiveCost>("/cost-explorer/comprehensive");
}

export function costFilters(): Promise<CostFilters> {
  return get<CostFilters>("/cost-explorer/filters");
}

// ---------------------------------------------------------------------------
// K8s / EKS
// ---------------------------------------------------------------------------

export function k8sListClusters(params?: {
  accountId?: string;
  region?: string;
}): Promise<EKSCluster[]> {
  return get<EKSCluster[]>(`/api/k8s/clusters${qs(params ?? {})}`);
}

export function k8sConnect(body: {
  account_id: string;
  region: string;
  cluster: string;
}): Promise<K8sConnectResponse> {
  return post<K8sConnectResponse>("/api/k8s/connect", body);
}

export function k8sDisconnect(clusterId: string): Promise<{ status: string }> {
  return post<{ status: string }>(`/api/k8s/disconnect/${encodeURIComponent(clusterId)}`);
}

export function k8sNamespaces(params?: {
  cluster?: string;
}): Promise<string[]> {
  return get<string[]>(`/api/k8s/namespaces${qs(params ?? {})}`);
}

export function k8sCategories(params?: {
  cluster?: string;
}): Promise<ResourceCategory[]> {
  return get<ResourceCategory[]>(`/api/k8s/categories${qs(params ?? {})}`);
}

export function k8sListResources(
  type: string,
  params?: { cluster?: string; namespace?: string; group?: string; version?: string },
): Promise<K8sResourceItem[]> {
  return get<K8sResourceItem[]>(`/api/k8s/resources/${encodeURIComponent(type)}${qs(params ?? {})}`);
}

export function k8sGetResource(
  type: string,
  name: string,
  params?: { cluster?: string; namespace?: string; group?: string; version?: string },
): Promise<K8sResourceItem> {
  return get<K8sResourceItem>(
    `/api/k8s/resource/${encodeURIComponent(type)}/${encodeURIComponent(name)}${qs(params ?? {})}`,
  );
}

export function k8sListCRDs(): Promise<unknown[]> {
  return get<unknown[]>("/api/k8s/crds");
}

export function k8sCRDResources(name: string): Promise<unknown[]> {
  return get<unknown[]>(`/api/k8s/crds/${encodeURIComponent(name)}/resources`);
}

export function k8sKubeconfigUpload(form: FormData): Promise<K8sKubeconfigUploadResponse> {
  return post<K8sKubeconfigUploadResponse>("/api/k8s/kubeconfig/upload", form);
}

export function k8sKubeconfigConnect(body: {
  server: string;
  ca_data: string;
  cluster_name: string;
  exec_cmd: string;
  exec_args: string[];
  is_teleport: boolean;
  teleport_session_id?: string;
}): Promise<K8sKubeconfigConnectResponse> {
  return post<K8sKubeconfigConnectResponse>("/api/k8s/kubeconfig/connect", body);
}

export function k8sAWSAccounts(): Promise<K8sAWSAccount[]> {
  return get<K8sAWSAccount[]>("/aws-accounts");
}

/** Build a WebSocket URL for k8s log/exec streaming. */
export function k8sWebSocketUrl(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${proto}//${window.location.host}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Teleport
// ---------------------------------------------------------------------------

export function teleportRequestCredentials(params: {
  proxy: string;
  auth_type: string;
}): Promise<K8sTeleportCredentials> {
  return get<K8sTeleportCredentials>(`/api/teleport/request-credentials${qs(params)}`);
}

export function teleportStatus(params: {
  callback_id: string;
}): Promise<K8sTeleportStatus> {
  return get<K8sTeleportStatus>(`/api/teleport/status${qs(params)}`);
}

// ---------------------------------------------------------------------------
// DB Viewer (bolt/bbolt)
// ---------------------------------------------------------------------------

export function dbViewerBuckets(db: string): Promise<string[]> {
  return get<string[]>(`/db-viewer${qs({ db })}`);
}

export function dbViewerEntries(
  db: string,
  bucket: string,
): Promise<unknown[]> {
  return get<unknown[]>(`/db-viewer${qs({ db, bucket })}`);
}
