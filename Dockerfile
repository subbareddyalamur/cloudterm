# =============================================================================
# CloudTerm - Modern AWS EC2 Terminal with Auto-Discovery
# =============================================================================

# Build stage - Install Python dependencies
FROM python:3.11-slim as builder

# Install build dependencies for Python packages
RUN apt-get update && apt-get install -y \
    build-essential \
    python3-dev \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create and activate virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# =============================================================================
# Runtime stage - Minimal production image
# =============================================================================
FROM ubuntu:22.04

# Metadata
LABEL maintainer="CloudTerm Team" \
      description="Web-based AWS EC2 terminal with automatic instance discovery" \
      version="2.0.0"

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-distutils \
    awscli \
    curl \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install AWS Session Manager Plugin for secure connections
RUN curl -sSL "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" \
    -o "/tmp/session-manager-plugin.deb" \
    && dpkg -i /tmp/session-manager-plugin.deb \
    && rm -f /tmp/session-manager-plugin.deb

# Copy Python virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv

# Set Python environment
ENV PATH="/opt/venv/bin:$PATH" \
    VIRTUAL_ENV="/opt/venv" \
    PYTHONPATH="/opt/venv/lib/python3.11/site-packages:$PYTHONPATH"

# Create non-root user for security
RUN useradd -m -s /bin/bash -u 1000 appuser \
    && mkdir -p /home/appuser/.aws /app \
    && chown -R appuser:appuser /home/appuser /app

# Set working directory
WORKDIR /app

# Copy application files with proper ownership
COPY --chown=appuser:appuser app.py ./
COPY --chown=appuser:appuser instances_list.yaml ./
COPY --chown=appuser:appuser run_with_tags.sh ./
COPY --chown=appuser:appuser templates/ ./templates/
COPY --chown=appuser:appuser static/ ./static/

# Make scripts executable
RUN chmod +x run_with_tags.sh

# Switch to non-root user
USER appuser

# Expose application port
EXPOSE 5000

# Set application environment variables
ENV FLASK_APP=app.py \
    FLASK_ENV=production \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=5000

# Set default tag configuration for auto-scan
ENV TAG1=Customer \
    TAG2=Environment

# Health check to ensure application is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/ || exit 1

# Start the application
CMD ["python3", "app.py"]
