# CloudTerm

A web-based terminal application built with Flask and XtermJS that provides secure access to AWS EC2 instances through AWS Systems Manager Session Manager.

## Features

- Web-based terminal interface using XtermJS
- Secure connection to EC2 instances via AWS Systems Manager Session Manager
- Multiple concurrent terminal sessions
- Docker containerized deployment
- AWS credentials management
- Responsive web interface
- Support for multiple environments (dev, val, prod)
- Organized instance grouping by environment and organization

## Screenshot
![Uploading image.png…]()


## Prerequisites

- Docker and Docker Compose
- AWS Account with appropriate permissions
- AWS credentials configured with necessary profiles
- EC2 instances with AWS Systems Manager Session Manager enabled

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/subbareddyalamur/cloudterm.git
cd cloudterm
```

2. Configure your AWS credentials:
```bash
mkdir -p ~/.aws
# Add your AWS credentials to ~/.aws/credentials:
[dev]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY

# Add AWS config to ~/.aws/config:
[profile dev]
region = us-east-1
output = json
```

3. Configure your instances:
```yaml
# Edit instances_list.yaml with your environment and instance details
org_name or account_name:
  region: eu-central-1
  aws_profile: dev
  instances:
    dev:
      - name: instance-name-1
        instance_id: i-xxxxxxxxxxxxxxxxx
      - name: instance-name-2
        instance_id: i-xxxxxxxxxxxxxxxxx
    val:
      - name: instance-name-3
        instance_id: i-xxxxxxxxxxxxxxxxx
```

4. Build and run the container:
```bash
docker-compose up --build -d
```

5. Access the application:
Open your browser and navigate to `http://localhost:8080`

## Configuration

### AWS Credentials

The application uses AWS profiles for authentication. Make sure you have configured your AWS credentials with the appropriate profiles in `~/.aws/credentials` and `~/.aws/config`.

### Instance Configuration

The `instances_list.yaml` file supports a hierarchical structure for organizing instances:

```yaml
org_name or account_name:  # Top-level organization name
  region: eu-central-1  # AWS region for these instances
  aws_profile: prod    # AWS credentials profile to use
  instances:
    dev:  # Environment group
      - name: instance-name     # Display name for the instance
        instance_id: i-xxxxx    # AWS EC2 instance ID
    val:  # Another environment group
      - name: instance-name
        instance_id: i-xxxxx
```

## Development

### Project Structure

```
cloudterm/
├── app.py                 # Flask application
├── instances_list.yaml    # Instance configuration
├── requirements.txt       # Python dependencies
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose configuration
├── static/               # Static assets
└── templates/            # HTML templates
```

### Local Development

1. Create a Python virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the application:
```bash
python3 app.py
```

## Security Considerations

- The application uses AWS Session Manager, which provides secure access to EC2 instances without the need for open inbound ports
- AWS credentials are mounted from the host machine and not stored in the container
- The application runs as a non-root user in the container
- Environment-specific AWS profiles ensure proper access control
- Ensure proper IAM roles and permissions are configured

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
