# Build stage
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3-dev \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment and update pip
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Final stage
FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    awscli \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Session Manager Plugin
RUN curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "/tmp/session-manager-plugin.deb" \
    && dpkg -i /tmp/session-manager-plugin.deb \
    && rm -f /tmp/session-manager-plugin.deb

# Copy Python virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    VIRTUAL_ENV="/opt/venv" \
    PYTHONPATH="/opt/venv/lib/python3.11/site-packages:$PYTHONPATH"

# Create a non-root user
RUN useradd -m -s /bin/bash appuser \
    && mkdir -p /home/appuser/.aws \
    && chown -R appuser:appuser /home/appuser/.aws

# Set working directory and change ownership
WORKDIR /app
COPY --chown=appuser:appuser app.py ./
COPY --chown=appuser:appuser instances_list.yaml ./
COPY --chown=appuser:appuser static ./static
COPY --chown=appuser:appuser templates ./templates

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5000

# Set environment variables
ENV FLASK_APP=app.py \
    FLASK_ENV=production \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Run the application with the virtual environment python
CMD ["python3", "app.py"]
