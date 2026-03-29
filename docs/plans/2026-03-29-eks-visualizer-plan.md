# EKS Visualizer — Implementation Plan

## Phase 1: Backend — EKS Discovery & K8s Client

### Task 1.1: EKS Discovery Service (`internal/aws/k8s.go`)
- Add `EKSService` struct (mirrors `CostExplorerService` pattern)
- `ListClusters(ctx, accountID, region)` — uses AWS SDK `eks.ListClusters` + `DescribeCluster`
- `GetToken(ctx, accountID, region, clusterName)` — generates bearer token via STS presigned URL
- Use existing `AccountStore` for credentials
- Returns: `[]EKSCluster{Name, Status, Version, Endpoint, Region, AccountID}`

### Task 1.2: K8s Client Pool (`internal/k8s/client.go`, `client_pool.go`)
- `ClientPool` struct — manages `map[string]*kubernetes.Clientset`
- Key: `accountID:region:clusterName`
- `Connect(clusterEndpoint, token, caCert)` → cached clientset
- `Disconnect(key)` → cleanup
- Token auto-refresh goroutine (every 10 min)
- Lazy creation on first resource request

### Task 1.3: K8s REST Handlers (`internal/handlers/k8s.go`)
- Wire `EKSService` + `ClientPool` into `Handler` struct
- Endpoints:
  - `GET /api/k8s/clusters?accountId=&region=`
  - `POST /api/k8s/connect` → returns `clusterId`
  - `GET /api/k8s/namespaces?cluster=`
  - `GET /api/k8s/resources/{type}?cluster=&namespace=`
  - `GET /api/k8s/resource/{type}/{name}?cluster=&namespace=` → YAML
  - `GET /api/k8s/crds?cluster=`
  - `GET /api/k8s/crds/{name}/resources?cluster=&namespace=`
  - `POST /api/k8s/disconnect/{cluster}`

### Task 1.4: K8s WebSocket Handlers (`internal/handlers/k8s_ws.go`)
- `GET /ws/k8s/logs?cluster=&namespace=&pod=&container=&follow=true`
- `GET /ws/k8s/exec?cluster=&namespace=&pod=&container=&command=/bin/sh`
- Reuse existing `websocket.Upgrader` from Handler
- Logs: `corev1.PodLogOptions` stream → WS
- Exec: `remotecommand.NewSPDYExecutor` → bidirectional WS

## Phase 2: Frontend — K8s Dashboard

### Task 2.1: Scaffold Vite/React App (`web/k8s-dashboard/`)
- Mirror `docker/cost-dashboard/` structure
- Dependencies: react, xterm, xterm-addon-fit, monaco-editor, react-split
- Serve from Go: `GET /k8s` → serves built dashboard

### Task 2.2: Cluster Selector (Top Bar)
- Fetch accounts from `/api/k8s/clusters`
- Account dropdown → Region dropdown → Cluster list
- Connect button → POST `/api/k8s/connect`
- Store active `clusterId` in React state

### Task 2.3: Resource Tree (Left Sidebar)
- Namespace selector (dropdown + "all" checkbox)
- Grouped tree: Workloads, Network, Config, Storage, RBAC, CRDs
- Each group expands to resource types → resource instances
- Search/filter bar
- Click resource → fetch YAML → show in middle panel

### Task 2.4: Resource Detail Panel (Middle)
- Monaco Editor for YAML/JSON (read-only, syntax highlighted)
- Toggle YAML/JSON button
- Copy button
- Secrets: eye icon → client-side base64 decode inline
- Pods: status badge, container list, events tab
- Tabs: Definition | Events | Relations

### Task 2.5: Bottom Panel — Logs & Exec (Resizable)
- `react-split` for vertical resizing (drag handle)
- Logs tab: WebSocket to `/ws/k8s/logs`, auto-scroll, timestamp toggle, filter input
- Exec tab: xterm.js terminal, WebSocket to `/ws/k8s/exec`
- Minimize/maximize via drag

## Phase 3: Integration & Polish

### Task 3.1: Main Page K8s Button
- Add K8s button next to Cost Explorer in `index.html` topbar
- `window.open('/k8s', '_blank')` on click
- Kubernetes helm icon SVG

### Task 3.2: Go Build Integration
- Add `client-go` dependencies to `go.mod`
- Wire `EKSService` + `ClientPool` in `cmd/cloudterm/main.go`
- Serve k8s dashboard static files from handler

### Task 3.3: Error Handling & Edge Cases
- RBAC errors → grayed resources with tooltip
- Connection timeout → retry button
- Token expiry → silent refresh
- Container not running → disable exec

### Task 3.4: Testing
- Unit tests for EKS discovery (mocked AWS SDK)
- Unit tests for k8s handlers (mocked clientset)
- Manual integration test with real EKS cluster
