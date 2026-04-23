# Stage 1: Build React v2 frontend (pnpm + Vite, embed_v2)
FROM node:20-alpine AS frontend-builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /build/web/frontend-v2
COPY web/frontend-v2/package.json web/frontend-v2/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/frontend-v2/ ./
RUN pnpm build

# Stage 2: Build Go binary with embed_v2 tag
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache git
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Inject the built v2 assets into the Go embed
COPY --from=frontend-builder /build/web/frontend-v2/dist ./web/frontend-v2/dist
RUN CGO_ENABLED=0 GOOS=linux go build -o cloudterm ./cmd/cloudterm

# Stage 3: Runtime
FROM amazonlinux:2023

# AWS CLI v2
RUN dnf install -y unzip shadow-utils less groff && \
    curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscli.zip && \
    unzip -q /tmp/awscli.zip -d /tmp && \
    /tmp/aws/install && \
    rm -rf /tmp/aws /tmp/awscli.zip

# SSM session-manager-plugin (required for aws ssm start-session)
RUN dnf install -y tar gzip && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_64bit/session-manager-plugin.rpm" -o /tmp/ssm-plugin.rpm; \
    else \
      curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_arm64/session-manager-plugin.rpm" -o /tmp/ssm-plugin.rpm; \
    fi && \
    dnf install -y /tmp/ssm-plugin.rpm && \
    rm -f /tmp/ssm-plugin.rpm && \
    dnf clean all

# Teleport tsh (for K8s Visualizer - Teleport-proxied clusters)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      ARCH_NAME="amd64"; \
    else \
      ARCH_NAME="arm64"; \
    fi && \
    curl -L "https://cdn.teleport.dev/teleport-v17.5.3-linux-${ARCH_NAME}-bin.tar.gz" -o /tmp/teleport.tar.gz && \
    tar -xzf /tmp/teleport.tar.gz -C /tmp && \
    mv /tmp/teleport/tsh /usr/local/bin/tsh && \
    chmod +x /usr/local/bin/tsh && \
    rm -rf /tmp/teleport /tmp/teleport.tar.gz

RUN useradd -m cloudterm
WORKDIR /app
COPY --from=builder /build/cloudterm .
# v2 frontend is embedded in the binary via embed_v2 build tag.
# Legacy web/ assets (templates, static) still served at / for backward-compat.
COPY web/ ./web/
RUN mkdir -p /app/cache && chown -R cloudterm:cloudterm /app
USER cloudterm
EXPOSE 5000
CMD ["./cloudterm"]
