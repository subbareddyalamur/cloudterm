# CloudTerm

A web-based terminal and RDP client for AWS EC2 instances with automatic discovery and organization.

## Features

- **Auto-Discovery** - Scans EC2 instances across multiple AWS profiles and regions
- **4-Level Hierarchy** - Organizes by Account → Region → TAG1 → TAG2
- **Linux Terminal** - Web-based terminal via AWS Session Manager
- **Windows RDP** - Browser-based RDP (Docker) or native client (local)
- **Real-time Search** - Filter instances by name, ID, or tags
- **No Open Ports** - All connections through AWS Session Manager

## Architecture

### Instance Hierarchy

```
AWS Account: 123456789012
  └── Region: us-east-1
      └── Customer (TAG1): ACME Corp
          └── Environment (TAG2): production
              ├── 🟢 🐧 web-server-1 (i-xxx)
              └── 🟢 🪟 windows-server (i-yyy)
```

### Docker Compose (with Browser RDP)

```
┌──────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────┐  │
│  │ CloudTerm │──│ Guac-Lite │──│ SSM       │──│ Guacd │  │
│  │ :5001     │  │ :8080     │  │ Forwarder │  │       │  │
│  └───────────┘  └───────────┘  └───────────┘  └───────┘  │
└──────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- AWS credentials configured (`~/.aws/credentials`)
- Docker/Podman & Docker Compose/Podman compose
- EC2 instances with SSM Agent installed

### Deploy with Docker Compose (Recommended)

```bash
git clone https://github.com/subbareddyalamur/cloudterm.git
cd cloudterm

# Start all services
docker compose up -d

# Access at http://localhost:5001
```

### Deploy Locally (Python)

```bash
# Install dependencies
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Install AWS Session Manager plugin
brew install --cask session-manager-plugin  # macOS

# Run
export TAG1="Customer" TAG2="Environment"
python3 app.py

# Access at http://localhost:5000
```

## Configuration

### Environment Variables

| Variable | Default       | Description               |
| -------- | ------------- | ------------------------- |
| `TAG1`   | `Customer`    | First level grouping tag  |
| `TAG2`   | `Environment` | Second level grouping tag |
| `PORT`   | `5000`        | Application port          |

### AWS Credentials

```bash
# ~/.aws/credentials
[default]
aws_access_key_id = YOUR_KEY
aws_secret_access_key = YOUR_SECRET

[prod]
aws_access_key_id = PROD_KEY
aws_secret_access_key = PROD_SECRET
```

### EC2 Instance Tags

```yaml
Tags:
  Name: "Web Server 1"
  Customer: "ACME Corp" # TAG1
  Environment: "production" # TAG2
```

### Required AWS Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ssm:StartSession",
        "ssm:TerminateSession",
        "ssm:DescribeSessions",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

## Usage

### Linux Instances

Click any Linux instance → Terminal opens in browser

### Windows Instances (Docker Compose)

1. Click Windows instance
2. Enter Windows credential.
3. Click "Open RDP in browser

## Project Structure

```
cloudterm/
├── app.py                 # Flask application
├── docker-compose.yml     # Multi-container setup
├── Dockerfile             # Main app container
├── guac-lite/             # Guacamole WebSocket server
│   └── server.js
├── ssm_forwarder.py       # SSM port forwarding service
├── templates/
│   ├── index.html         # Main UI
│   └── rdp-client.html    # Browser RDP client
└── static/js/
    └── guacamole-common.js
```

## Troubleshooting

### General Issues

| Issue              | Solution                                  |
| ------------------ | ----------------------------------------- |
| No instances found | Check AWS credentials and IAM permissions |
| Connection timeout | Verify SSM Agent is running on instance   |
| Tags not showing   | Ensure TAG1/TAG2 env vars are set         |

### RDP Issues (Docker)

| Issue                   | Solution                                                |
| ----------------------- | ------------------------------------------------------- |
| Token validation failed | Run `docker compose ps` - ensure all containers running |
| Black screen            | Wait a few seconds for Windows to respond               |
| Connection error        | Check `docker logs ssm-forwarder`                       |
| Mouse/keyboard frozen   | Click inside RDP window to refocus                      |

### Debug Commands

```bash
# Check container status
docker compose ps

# View logs
docker logs cloudterm-app
docker logs guac-lite
docker logs ssm-forwarder
docker logs guacd

# Restart everything
docker compose down && docker compose up -d

# Rebuild from scratch
docker compose down
docker compose build --no-cache
docker compose up -d
```

## License

MIT License
