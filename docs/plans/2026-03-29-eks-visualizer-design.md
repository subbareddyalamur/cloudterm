# EKS Kubernetes Visualizer — Design Document

**Date:** 2026-03-29
**Branch:** `feature/eks-visualizer`
**Status:** Design Complete

---

## Overview

Add a full Kubernetes cluster visualizer to cloudterm-go, similar to OpenLens/Freelens. A "K8s" button on the main page opens a standalone dashboard in a new browser tab. Users can discover EKS clusters from configured AWS accounts, browse all K8s resources, view logs, exec into containers, inspect resource definitions, and decode secrets.

---

## 1. Architecture Overview

**Separate K8s Dashboard (Vite/React + Go backend)**

- Route: `/k8s` — serves the Vite-built React application
- API endpoints: `/api/k8s/*` — all k8s operations go through Go handlers
- WebSocket: `/ws/k8s/*` — real-time logs streaming and exec sessions

### Backend Components

| File | Responsibility |
|------|---------------|
| `internal/aws/k8s.go` | EKS cluster discovery using AWS SDK from **existing configured AWS accounts** |
| `internal/k8s/client.go` | Kubernetes client wrapper using `client-go` |
| `internal/k8s/client_pool.go` | Connection pooling and token refresh |
| `internal/handlers/k8s.go` | REST handlers for resource listing, details, secret decoding |
| `internal/handlers/k8s_ws.go` | WebSocket handlers for logs streaming and exec |
| `internal/terminal/k8s_exec.go` | Exec session manager with xterm.js integration |

### Frontend Components

| Folder/File | Responsibility |
|-------------|---------------|
| `web/k8s-dashboard/` | Standalone Vite + React app (like `docker/cost-dashboard/`) |
| Cluster selector | Account dropdown → Region dropdown → Cluster tree |
| Resource tree | Hierarchical view matching OpenLens (all resource types + CRDs) |
| Detail panel | YAML/JSON view of selected resource |
| Bottom panel | Resizable split for logs and exec |

### Integration

- AWS accounts populated from **existing Settings → AWS Accounts** configuration
- Fetched via existing `/api/accounts` endpoint
- Leverages existing vault/session credentials for AWS auth

---

## 2. K8s Client Management & Connection Flow

### Dynamic Kubeconfig Generation

1. Frontend calls `/api/k8s/clusters?accountId=xxx&region=yyy`
2. Backend fetches EKS credentials from vault for that AWS account
3. Uses AWS credentials to call EKS `get-token` API
4. Generates kubeconfig with temporary token
5. Stores in session cache and returns cluster connection ID

### Client Lifecycle

- Each active cluster connection gets a cached `client-go` client in `client_pool.go`
- Key: `accountID:region:clusterName` → `*kubernetes.Clientset`
- Tokens expire after 15-60 min → auto-refresh using existing vault credentials
- Clients are lazy-loaded: only created when user selects a cluster
- Kept alive while tab is open

### WebSocket Connection for Logs/Exec

- Frontend WebSocket connects to `/ws/k8s/exec` with cluster info and resource path
- Backend creates k8s `Exec` or `Log` stream via `client-go`'s `RemoteExecutor` interface
- Bi-directional xterm.js integration: stdin → k8s exec, stdout → frontend

---

## 3. Frontend UI/UX Layout

### Top Bar

- **Left:** CloudTerm K8s Visualizer logo/title
- **Center:** Dropdowns (Account → Region → Cluster) with refresh button
- **Right:** Settings icon, Help icon

### Main Content — Three Pane Layout

#### Left Sidebar (Resource Tree)

- Namespace selector dropdown (all namespaces checkbox available)
- Tree grouped by resource type: Pods, Deployments, StatefulSets, Services, ConfigMaps, Secrets, CRDs, etc.
- Expandable tree → click resource to select
- Search bar to filter resources
- Refresh button per namespace/cluster

#### Middle Panel (Resource Details)

- YAML or JSON view (toggle) with syntax highlighting
- Copy button
- For Secrets: Eye icon to toggle base64 decode (client-side)
- For Pods: Show status, containers, events in header above YAML
- Tabs: "Definition" | "Events" | "Relations"

#### Bottom Panel (Logs/Exec) — Resizable

- Height adjustable via drag handle between middle and bottom panels
- Tabs: "Logs" | "Exec"
- Full xterm.js for exec session
- Log viewer with auto-scroll, timestamp toggle, filter
- Panel can be dragged up to maximize (full height) or down to minimize

---

## 4. API Design & Data Flow

### REST API Endpoints

```
GET  /api/k8s/accounts                  - List AWS accounts configured
GET  /api/k8s/accounts/:id/regions      - List regions with EKS clusters
GET  /api/k8s/clusters                  - Discover EKS clusters (account, region, name)
POST /api/k8s/connect                   - Connect to cluster (returns connection token)
GET  /api/k8s/namespaces                - List namespaces in connected cluster
GET  /api/k8s/resources/:type           - List resources (pods, deployments, etc.)
GET  /api/k8s/resource/:type/:name      - Get full YAML for specific resource
GET  /api/k8s/pods/:name/containers     - Get containers for a pod
POST /api/k8s/disconnect/:cluster       - Close connection, release client

# CRD discovery
GET  /api/k8s/crds                      - List all Custom Resource Definitions
GET  /api/k8s/crds/:name/resources      - List instances of a CRD
```

### Data Flow for Resource Discovery

1. Frontend requests `/api/k8s/clusters?accountId=xxx&region=yyy`
2. Backend uses AWS SDK with vault credentials to `ListClusters` in that region
3. Returns array: `[{name, status, version, endpoint}]`
4. User selects cluster, frontend POSTs `/api/k8s/connect`
5. Backend validates connection, creates `client-go` client, caches it, returns `clusterId`
6. Frontend calls all resource endpoints with `?cluster=xyz` header/param

### WebSocket Endpoints

```
WS   /ws/k8s/logs   - Stream container logs (query: cluster, namespace, pod, container, follow=true)
WS   /ws/k8s/exec   - Bi-directional exec session (query: cluster, namespace, pod, container, command=[/bin/sh])
```

---

## 5. Error Handling & Edge Cases

### Connection Errors

- Invalid AWS credentials → Show dialog with link to Settings → AWS Accounts
- EKS cluster not found → Show error, offer to refresh cluster list
- Kubeconfig generation failed → Show error with AWS IAM permissions hint
- Token expired → Auto-refresh silently; if fails, prompt user to re-auth

### Resource Access Errors

- 403 Forbidden (RBAC) → Show "No access to resource" badge, grayed out entry
- Resource not found → Remove from tree, auto-refresh namespace
- CRD definition missing → Show "Custom Resource" generic icon, allow viewing raw YAML

### WebSocket/Stream Errors

- Logs stream closed → Reconnect automatically with user notification
- Exec session dropped → Show "Session closed" with option to reconnect or close panel
- Container not running (for exec) → Disable exec button, show status badge

### Client State Management

- Cluster connection timeout (30s) → Show connection error with retry button
- Multiple tabs with same cluster → Share cached client, reference counting
- Browser refresh → Re-establish connections only for previously opened clusters

### Secret Decoding Safety

- Eye icon shows base64 decode only (client-side), no server-side decryption
- Warning tooltip: "Shows base64-decoded values only"

---

## 6. Testing & Implementation Notes

### Testing Strategy

**Unit Tests:**
- `internal/aws/k8s_test.go` — EKS cluster discovery with mocked AWS SDK
- `internal/k8s/client_test.go` — Client pool management, token refresh
- `internal/handlers/k8s_test.go` — Resource listing, YAML generation, secret handling

**Integration Tests:**
- Use `kind` (Kubernetes in Docker) or `minikube` for local k8s clusters
- Test with real EKS clusters in dev account
- Test logs streaming and exec with sample pods
- Test CRD discovery and CRD resource listing

### Key Dependencies

**Go (go.mod):**
```
k8s.io/client-go v0.30.0
k8s.io/api v0.30.0
k8s.io/apimachinery v0.30.0
k8s.io/metrics v0.30.0
```

**Frontend (web/k8s-dashboard/package.json):**
```json
{
  "monaco-editor": "^0.45.0",
  "xterm": "^5.3.0",
  "xterm-addon-fit": "^0.8.0",
  "react-split": "^2.0.14"
}
```

### Performance Considerations

- Resource tree paginates for large clusters (limit 100 items per type initially)
- Debounce search filter input (300ms)
- Lazy-load resource details only when clicked
- WebSocket message batching for logs (every 100ms or 10 lines)

### Security

- Validate cluster connection ownership (user can only access their configured AWS accounts)
- No direct kubeconfig exposure to browser (server-side client only)
- Rate limit API endpoints to prevent abuse
