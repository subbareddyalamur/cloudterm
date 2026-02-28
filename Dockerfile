# Stage 1: Build Go binary
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache git
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o cloudterm ./cmd/cloudterm

# Stage 2: Runtime
FROM amazonlinux:2023

# AWS CLI v2
RUN dnf install -y unzip shadow-utils less groff && \
    curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscli.zip && \
    unzip -q /tmp/awscli.zip -d /tmp && \
    /tmp/aws/install && \
    rm -rf /tmp/aws /tmp/awscli.zip

# SSM session-manager-plugin (required for aws ssm start-session)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_64bit/session-manager-plugin.rpm" -o /tmp/ssm-plugin.rpm; \
    else \
      curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_arm64/session-manager-plugin.rpm" -o /tmp/ssm-plugin.rpm; \
    fi && \
    dnf install -y /tmp/ssm-plugin.rpm && \
    rm -f /tmp/ssm-plugin.rpm && \
    dnf clean all

RUN useradd -m cloudterm
WORKDIR /app
COPY --from=builder /build/cloudterm .
COPY web/ ./web/
RUN mkdir -p /app/cache && chown cloudterm:cloudterm /app/cache
USER cloudterm
EXPOSE 5000
CMD ["./cloudterm"]
