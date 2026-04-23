# CloudTerm

A secure, web-based terminal and RDP client for managing AWS EC2 instances via Systems Manager (SSM). Access your fleet from a browser — no SSH keys, no bastion hosts, no open ports.

## Features

### Multi-Account Instance Discovery
- Auto-discovers EC2 instances across multiple AWS profiles and regions concurrently
- Hierarchical sidebar: **Account > Region > Tag Group > Instance**
- Collapsible tree with inline search/filter and colour-coded environment badges
- Caches results to YAML with configurable TTL (default 30 min)
- Per-region refresh and full fleet re-scan from the toolbar

### Manual AWS Accounts
- Add AWS accounts with access key, secret key, and optional session token
- Supports cross-account access without requiring local AWS profile configuration
- Instances from manual accounts appear alongside profile-based accounts in the sidebar
- Credentials held in memory only — never written to disk

### SSH Terminal (Linux instances)
- Interactive terminal sessions via `aws ssm start-session` — no SSH keys needed
- Full xterm.js emulation with resize, scroll, Ctrl+C interrupt
- Multiple concurrent sessions as tabbed panels
- **Terminal title bar** with action buttons: Suggest, Details, Export, Record, Split, Fullscreen, End
- Zoom controls and configurable terminal font size
- 18 built-in colour themes (Warp, Linear, GitHub Dark, Nord, Dracula, Tokyo Night, Catppuccin, Monokai, Solarized, and more)
- Space-separated multi-term filter (e.g. `syc23 windows`) matches ALL terms

### RDP (Windows instances)
- Browser-based RDP via Apache Guacamole — no public IPs or open RDP ports required
- SSM port forwarding for the tunnel
- Resolution selector and fullscreen mode
- **Clipboard sync**: Cmd+C/V/X (Mac) and Ctrl+C/V/X work between host and remote desktop
- Mac Cmd-to-Ctrl key remapping
- Auto-reconnect on transient connection drops with exponential backoff
- RDP sessions appear as tabs alongside SSH sessions
- **Credential Vault**: auto-connect with saved credentials (see below)

### Session Recording & Playback
- **SSH recording**: Toggle from the terminal title bar — captures output in `.cast` (asciicast v2) format
- **RDP recording**: Server-side recording of Guacamole sessions in `.guac` format
- **Recordings browser**: List, play, convert, download, and delete recordings from a dedicated modal
- Recording status indicator with elapsed time

### Asciinema-Style .cast Player
- Built-in terminal replay player with video-player-style controls
- Idle time capping, interactive scrubber with time tooltip
- Keyboard shortcuts: Space (play/pause), Left/Right arrows (seek ±5s)
- Speed control: 0.5×, 1×, 2×, 5×, 10×

### Guacamole RDP Replay
- Play back `.guac` RDP recordings directly in the browser
- Seek and playback controls at full original resolution

### MP4 Conversion & Download
- Convert `.cast` (SSH) and `.guac` (RDP) recordings to MP4 video
- **SSH pipeline**: `.cast` → `agg` → `.gif` → `ffmpeg` → `.mp4`
- **RDP pipeline**: `.guac` → `guacenc` → `.m4v` → `ffmpeg` → `.mp4`
- Runs in a dedicated converter sidecar container — no CPU impact on the main app
- Async job queue with polling

### Terminal Log Export
- Export full SSH session output as a clean text file
- ANSI escape codes stripped, line endings normalised
- Download from the session context menu

### Terminal Theming per Environment
- Auto-colour terminal borders by environment tag (red for production, green for dev, etc.)
- Visual safety net against running commands on the wrong host
- Fully configurable in Settings → Appearance — map any environment name to any colour

### Port Forwarding
- Forward any remote port through SSM to localhost
- Active tunnels panel shows all running tunnels with local/remote port mapping
- Protocol-aware link generation: HTTP/HTTPS/RDP links shown for known ports
- Multiple concurrent tunnels per instance, auto-cleanup on stop

### File Transfer
- **Upload** files to instances (drag-and-drop or file picker, no size limit)
- **Download** files from instances (no size limit)
- Supports both Linux (bash) and Windows (PowerShell)
- Real-time progress in a non-blocking Transfer Manager panel
- Transfers use SSM SendCommand — no S3 buckets or agents needed

### Express Transfer (S3)
- **Express Upload**: Local → S3 → EC2 instance via presigned GET URL
- **Express Download**: EC2 instance → S3 → Local via presigned PUT URL
- Significantly faster than SSM-based chunking for large files
- No AWS CLI needed on the instance — uses `curl` (Linux) or `Invoke-WebRequest` (Windows)
- S3 objects deleted immediately after transfer completes

### Remote File Browser
- Visual directory navigator for remote instances
- Breadcrumb path navigation, file size, permissions, and modification time
- Click a file to download; upload to the currently browsed directory
- Regular and Express Download buttons per file

### Saved Command Snippets
- Quick-access library of reusable commands
- Seeded with common defaults (df, free, top, uptime, ss, systemctl)
- Add, edit, delete, and organise custom snippets
- One-click insert into the active SSH terminal

### Session History & Audit Log
- Tracks all session activity: SSH start/stop, RDP connections, file transfers
- JSON-lines format (`audit.log`) for easy parsing
- History modal with searchable, paginated event list

### Instance Quick Metrics
- CPU load and core count, memory usage, disk usage, system uptime
- Color-coded gauge bars (green < 70%, orange 70–90%, red > 90%)
- Works on both Linux and Windows

### Favorites / Pinned Instances
- Star frequently-used instances for quick access
- Dedicated favorites section at the top of the sidebar
- One-click to connect, persisted across sessions

### AI Assistant
- Context-aware AI chat panel for AWS operations and diagnostics
- **Multi-provider support**: AWS Bedrock (default), Anthropic, OpenAI, Google Gemini, and local Ollama
- AI has full awareness of your fleet — all instances, IPs, states, and the active session
- **Tool use**: AI can query security groups, NACLs, route tables, load balancers, and instance details
- **Run commands**: AI proposes commands; you review and approve before anything is typed into the terminal
- **Safety guardrails**: destructive commands (`rm -rf`, `shutdown`, `reboot`, etc.) are detected and flagged
- Streaming responses via Server-Sent Events with markdown rendering
- Conversation history maintained per session

### Terminal Intelligence Engine
- **Embedded, self-learning** autocomplete — no external model or API required
- **Ghost text suggestions**: dim inline text appears as you type, like fish shell
  - **Tab**: accept full suggestion
  - **Right Arrow**: accept word-by-word
  - **Escape**: dismiss
- **Trie prefix tree**: instant lookup from bootstrap corpus (~190 common Linux/AWS/Docker/K8s commands)
- **Frecency scoring**: frequency × recency ranking with 1-week half-life
- **Micro neural network**: 47-parameter MLP for contextual re-ranking based on exit code, directory, environment, and usage patterns
- **Error detection**: 20 built-in regex patterns + TF-IDF cosine similarity for learned patterns
- **Self-learning**: every command is recorded; n-gram model and frecency scores update automatically
- **Encrypted storage**: command history and learned patterns stored in bbolt with AES-256-GCM

### RDP Credential Vault
- **Encrypted password vault** for RDP session credentials
- **Auto-connect**: vault checks for matching credentials and connects immediately — no modal prompt
- **Match hierarchy** (checked in priority order):
  1. Exact instance ID
  2. Name substring (e.g. `windows`)
  3. Name pattern — glob (e.g. `*-windows-*`)
  4. Environment tag (e.g. `dev`)
  5. Account
  6. Global fallback
- **AES-256-GCM encryption** at rest — passwords never sent to frontend
- **Vault Management UI** in Settings → Credential Vault

### Network Topology Map
- Interactive D3.js visualisation of your entire VPC architecture
- Covers VPC, subnets, instances, security groups, NACLs, route tables, internet/NAT gateways, transit gateway attachments, VPC peerings, VPC endpoints, load balancers, Elastic IPs, flow logs, and prefix lists
- Zoom, pan, and search with auto-focus; click any resource for full metadata

### Instance Details
- Live `DescribeInstances` + `DescribeSecurityGroups` + `DescribeVolumes` fetch
- Sections: Instance, Network, Network Interfaces, Storage, Security Groups, Tags, Quick Metrics

### Settings
- **Appearance**: Theme selector (18 themes), font size, environment colour mapping
- **General**: Compact mode, scrollback lines, S3 bucket, experimental feature toggles
- **AWS Accounts**: Add/remove manual accounts with access keys
- **AI Agent**: Provider and model selection, API keys, Bedrock config
- **Credential Vault**: View and delete saved RDP credentials
- **Database Viewer**: Query the embedded bbolt suggestion store
- Preferences synced to server and persisted across sessions

### UI Themes
18 built-in themes across dark and light modes:

| Dark | Light |
|------|-------|
| Warp (default), Linear, VS Code, Arc, GitHub Dark, Nord, Atom One Dark, Dracula, Solarized Dark, Tokyo Night, Catppuccin Mocha, Monokai | GitHub Light, Solarized Light, One Light, Tokyo Night Day, Catppuccin Latte, Rosé Pine Dawn |

## Architecture

```
+----------------------------------------------------------------------+
|                            Browser                                   |
|  React + xterm.js  | Guacamole RDP | File I/O | AI Chat | Topology  |
+----------+-----------+-------+-------+------+-------+-------+-------+
           | WebSocket         | WebSocket     | HTTP / SSE
           v                   v               v
+--------------------+  +--------------+  +----------------------+
|  CloudTerm (Go)    |  |  guac-lite   |  |  CloudTerm           |
|  Port 5000         |  |  (Node.js)   |  |  /upload  /download  |
|                    |  |  Port 8080   |  |  /ai-agent/chat      |
|  - EC2 Discovery   |  +------+-------+  |  /topology           |
|  - SSM Sessions    |         |          +----------------------+
|  - File Transfer   |         v
|  - AI Assistant    |  +--------------+
|  - Topology API    |  |    guacd     |
|  - Audit Log       |  |  Port 4822   |
|  - Recordings API  |  +--------------+
|  - REST API        |
+--------+-----------+
         |                +-----------------+
         v                |  Converter      |
+--------------------+    |  Port 5002      |
|  SSM Forwarder     |    |  guacenc + agg  |
|  (Go) Port 5001    |    |  + ffmpeg       |
|  - RDP tunnels     |    +-----------------+
|  - Port forwards   |
|  - Port allocation |
+--------------------+
         |
         v
  AWS SSM / EC2 / VPC / Bedrock
```

**Services:**

| Service | Role | Base Image |
|---------|------|------------|
| `cloudterm` | Main web app, terminal sessions, API | amazonlinux:2023 + AWS CLI |
| `ssm-forwarder` | RDP + port forwarding via SSM + socat | amazonlinux:2023 + AWS CLI |
| `guac-lite` | Guacamole WebSocket proxy | Node.js 18 Alpine |
| `guacd` | Apache Guacamole daemon | guacamole/guacd |
| `converter` | Recording → MP4 conversion (guacenc, agg, ffmpeg) | debian:bookworm-slim |

## Prerequisites

- **Docker** and **Docker Compose**
- **AWS credentials** configured in `~/.aws/` (profiles with `credentials` and/or `config`)
- EC2 instances must have the **SSM Agent** installed and an appropriate **IAM instance profile**

## Quick Start

```bash
# Clone the repository
git clone https://github.com/subbareddyalamur/cloudterm.git
cd cloudterm

# Create data directories (container runs as non-root)
mkdir -p .cache .sessionrecordings .terminalexport .suggestdata

# Start all services
docker compose up -d

# Open in browser
open http://localhost:5000
```

CloudTerm automatically discovers instances across all configured AWS profiles on startup.

## Configuration

All configuration is via environment variables (set in `docker-compose.yml` or shell):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Web server port |
| `TAG1` | `App` | Primary tag for grouping instances in sidebar |
| `TAG2` | `Environment` | Secondary tag for grouping instances |
| `RDP_MODE` | `native` | RDP mode: `native` (local client) or `guacamole` (browser) |
| `GUAC_WS_URL` | `ws://localhost:8080` | Guacamole WebSocket URL |
| `GUAC_CRYPT_SECRET` | — | 32-byte AES key for Guacamole token encryption |
| `SSM_FORWARDER_HOST` | `ssm-forwarder` | Forwarder service hostname |
| `SSM_FORWARDER_PORT` | `5001` | Forwarder service port |
| `INSTANCES_FILE` | `instances_list.yaml` | Cached instance data filename |
| `CACHE_TTL_SECONDS` | `1800` | Instance cache TTL (seconds) |
| `PORT_RANGE_START` | `33890` | Start of dynamic port range for tunnels |
| `PORT_RANGE_END` | `33999` | End of dynamic port range |
| `AUDIT_LOG_FILE` | `audit.log` | Audit log filename |
| `PREFERENCES_FILE` | `preferences.json` | User preferences filename |
| `SESSION_RECORDING_DIR` | `.sessionrecordings` | Directory for session recordings |
| `TERMINAL_EXPORT_DIR` | `.terminalexport` | Directory for exported terminal logs |
| `AUTO_RECORD` | `false` | Auto-start recording on new sessions |
| `AWS_ACCOUNTS_FILE` | `aws_accounts.json` | Manual AWS accounts storage |
| `AI_PROVIDER` | `bedrock` | AI provider: `bedrock`, `anthropic`, `openai`, `gemini`, `ollama` |
| `AI_MODEL` | — | Model identifier (e.g. `anthropic.claude-sonnet-4-5`) |
| `AI_MAX_TOKENS` | `4096` | Max response tokens |
| `AI_TEMPERATURE` | `0.3` | Sampling temperature |
| `AI_BEDROCK_REGION` | — | AWS region for Bedrock |
| `AI_BEDROCK_PROFILE` | — | AWS profile for Bedrock |
| `AI_ANTHROPIC_KEY` | — | Anthropic API key |
| `AI_OPENAI_KEY` | — | OpenAI API key |
| `AI_GEMINI_KEY` | — | Gemini API key |
| `AI_OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `SUGGEST_ENABLED` | `true` | Enable terminal autocomplete and suggestion engine |
| `SUGGEST_DATA_DIR` | `/app/suggestdata` | Directory for suggestion engine data |
| `SUGGEST_ENCRYPTION_KEY` | — | AES-256 encryption key for suggestion data and vault (auto-generated if empty) |
| `DEBUG` | `false` | Enable debug logging |

## Project Structure

```
cloudterm/
├── cmd/
│   ├── cloudterm/main.go              # Main app entry point
│   └── forwarder/main.go             # Port forwarder entry point
├── internal/
│   ├── audit/logger.go               # Session audit logging (JSON lines)
│   ├── aws/
│   │   ├── accounts.go               # Manual AWS account management
│   │   ├── discovery.go              # EC2 discovery, scanning, caching
│   │   ├── filetransfer.go           # File upload/download via SSM
│   │   ├── s3transfer.go             # Express file transfer via S3 presigned URLs
│   │   ├── filebrowser.go            # Remote directory browsing via SSM
│   │   ├── metrics.go                # Instance CPU/memory/disk metrics
│   │   ├── topology.go               # VPC topology fetching (16+ AWS APIs)
│   │   ├── reachability.go           # Local reachability analysis & exposure scan
│   │   ├── network_insights.go       # AWS Network Insights deep analysis
│   │   └── networking.go             # Network utility functions
│   ├── config/config.go              # Environment variable config
│   ├── crypto/aes.go                 # AES-256-GCM encryption helpers
│   ├── guacamole/token.go            # Guacamole token encryption (AES-256-CBC)
│   ├── handlers/
│   │   ├── handlers.go               # HTTP + WebSocket handlers
│   │   └── topology.go               # Topology & reachability endpoints
│   ├── llm/
│   │   ├── provider.go               # LLM provider interface & types
│   │   ├── bedrock.go                # AWS Bedrock provider
│   │   ├── anthropic.go              # Anthropic API provider
│   │   ├── openai.go                 # OpenAI API provider
│   │   ├── gemini.go                 # Google Gemini provider
│   │   ├── ollama.go                 # Local Ollama provider
│   │   ├── agent.go                  # System prompts & instance context
│   │   ├── tools.go                  # AI tool definitions
│   │   └── safety.go                 # Destructive command patterns
│   ├── session/
│   │   ├── manager.go                # Terminal session lifecycle (PTY)
│   │   └── recorder.go               # Session recording (.cast format)
│   ├── suggest/
│   │   ├── engine.go                 # Suggestion engine orchestrator
│   │   ├── trie.go                   # Compressed radix trie (prefix lookup)
│   │   ├── frecency.go               # Frequency × recency scorer
│   │   ├── mlp.go                    # 47-param micro neural network
│   │   ├── store.go                  # bbolt encrypted KV storage
│   │   ├── errorkb.go                # Error pattern detection + TF-IDF
│   │   ├── observer.go               # Non-blocking terminal I/O observer
│   │   ├── ansistrip.go              # ANSI escape sequence stripper
│   │   ├── bootstrap.go              # Bootstrap command corpus loader
│   │   └── data/                     # Embedded JSON data (commands, error patterns)
│   ├── vault/
│   │   └── store.go                  # RDP credential vault (bbolt + AES-GCM)
│   └── types/types.go                # Shared data structures
├── web/
│   ├── frontend-v2/                  # React + TypeScript frontend (active)
│   │   ├── src/
│   │   │   ├── components/           # UI components (terminal, sidebar, modals, AI, etc.)
│   │   │   ├── stores/               # Zustand state stores
│   │   │   ├── lib/                  # API client, platform detection, themes
│   │   │   └── styles/               # CSS tokens (18 themes), base styles
│   │   ├── public/guacamole/         # guacamole-common.js
│   │   └── dist/                     # Production build (embedded into binary)
│   ├── static/vendor/                # Legacy vendor assets (guacamole, d3)
│   ├── templates/                    # Go HTML templates (RDP client page)
│   └── embed_v2.go                   # Embeds frontend-v2/dist into the Go binary
├── docker/
│   ├── converter/                    # MP4 converter sidecar
│   │   ├── Dockerfile                # guacenc + agg + ffmpeg
│   │   └── api.py                    # Conversion REST API
│   └── guac-lite/                    # Guacamole-Lite server (Node.js)
├── Dockerfile                        # Main app container
├── Dockerfile.forwarder              # Forwarder container
└── docker-compose.yml                # Full stack orchestration
```

## AWS Services Used

| Service | Purpose |
|---------|---------|
| **EC2** | `DescribeInstances` for discovery; VPC/subnet/SG/NACL/routing/gateway/peering/endpoint/EIP/DHCP/flow-log/prefix-list APIs for topology; Network Insights for reachability |
| **ELB** | `DescribeLoadBalancers`, `DescribeListeners`, `DescribeTargetGroups`, `DescribeTargetHealth` |
| **SSM** | `StartSession` for terminals, `SendCommand` for file transfer and metrics |
| **S3** | `PutObject`, `GetObject`, `DeleteObject` for Express Transfers (optional) |
| **Bedrock** | `ConverseStream` for AI assistant (optional) |
| **STS** | `GetCallerIdentity` for account ID resolution |
| **IAM** | `ListAccountAliases` for account alias lookup |

## Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeRegions",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeNetworkAcls",
        "ec2:DescribeRouteTables",
        "ec2:DescribeInternetGateways",
        "ec2:DescribeNatGateways",
        "ec2:DescribeTransitGatewayAttachments",
        "ec2:DescribeVpcPeeringConnections",
        "ec2:DescribeVpcEndpoints",
        "ec2:DescribeAddresses",
        "ec2:DescribeDhcpOptions",
        "ec2:DescribeFlowLogs",
        "ec2:DescribeManagedPrefixLists",
        "ec2:CreateNetworkInsightsPath",
        "ec2:DeleteNetworkInsightsPath",
        "ec2:StartNetworkInsightsAnalysis",
        "ec2:GetNetworkInsightsAnalyses",
        "ec2:DeleteNetworkInsightsAnalysis",
        "elasticloadbalancing:DescribeLoadBalancers",
        "elasticloadbalancing:DescribeListeners",
        "elasticloadbalancing:DescribeTargetGroups",
        "elasticloadbalancing:DescribeTargetHealth",
        "ssm:StartSession",
        "ssm:TerminateSession",
        "ssm:SendCommand",
        "ssm:GetCommandInvocation",
        "sts:GetCallerIdentity",
        "iam:ListAccountAliases",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "*"
    }
  ]
}
```

> **Note:** S3 permissions are only required if you use Express Transfers — scope to a specific bucket ARN if preferred. Bedrock permission is only required for the AI assistant with the Bedrock provider. Network Insights permissions are only required for deep reachability analysis.

EC2 instances must have an IAM instance profile with the `AmazonSSMManagedInstanceCore` managed policy (or equivalent).

## Tech Stack

- **Backend**: Go 1.24, AWS SDK v2, Gorilla WebSocket, creack/pty, bbolt (encrypted KV)
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS, Zustand, xterm.js, D3.js
- **Containers**: Docker with multi-stage builds on amazonlinux:2023
- **RDP Proxy**: Apache Guacamole (guacd + guacamole-lite)
- **Converter**: Python 3 + guacenc + agg + ffmpeg on debian:bookworm-slim

## Security

- All instance access goes through AWS SSM — no SSH keys, no open ports
- AWS credentials are mounted read-only from the host
- Manual account credentials are held in memory only (never written to AWS config)
- Guacamole RDP tokens are encrypted with AES-256-CBC
- **Credential vault**: RDP passwords encrypted at rest with AES-256-GCM; passwords never sent to frontend
- **Suggestion engine data**: command history and learned patterns encrypted at rest with AES-256-GCM in bbolt
- File transfers are chunked via SSM with timeouts that scale with file size
- Each terminal session runs in an isolated PTY with its own process group
- RDP clipboard sync uses postMessage bridge (no plaintext clipboard in WS messages)
- AI never executes commands — all proposals require explicit user approval before being typed into the terminal
- All actions are logged to an append-only audit log


