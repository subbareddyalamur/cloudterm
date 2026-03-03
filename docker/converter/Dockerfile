# Build guacenc from guacamole-server 1.6.0 source
FROM debian:bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential automake autoconf libtool pkg-config \
    libcairo2-dev libjpeg62-turbo-dev libpng-dev \
    libavcodec-dev libavformat-dev libavutil-dev libswscale-dev \
    uuid-dev libossp-uuid-dev \
    wget ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ARG GUAC_VERSION=1.6.0
RUN wget -q "https://apache.org/dyn/closer.cgi?action=download&filename=guacamole/${GUAC_VERSION}/source/guacamole-server-${GUAC_VERSION}.tar.gz" \
      -O /tmp/guacamole-server.tar.gz && \
    tar xzf /tmp/guacamole-server.tar.gz -C /tmp

WORKDIR /tmp/guacamole-server-${GUAC_VERSION}
RUN autoreconf -fi && \
    ./configure --without-pulse --without-pango --without-terminal-emulator \
                --without-ssh --without-telnet --without-vnc --without-rdp \
                --without-kubernetes --without-websockets --without-ssl \
                --disable-guacd --disable-guaclog && \
    make -j$(nproc) && \
    make install && \
    ldconfig

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libjpeg62-turbo libpng16-16 \
    libavcodec59 libavformat59 libavutil57 libswscale6 \
    ffmpeg python3 curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/lib/libguac*.so* /usr/local/lib/
COPY --from=builder /usr/local/bin/guacenc /usr/local/bin/guacenc
RUN ldconfig

# Install agg (asciinema gif generator) for .cast → gif → mp4 conversion.
ARG AGG_VERSION=1.5.0
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then AGG_ARCH="x86_64-unknown-linux-gnu"; \
    else AGG_ARCH="aarch64-unknown-linux-gnu"; fi && \
    curl -fsSL "https://github.com/asciinema/agg/releases/download/v${AGG_VERSION}/agg-${AGG_ARCH}" \
      -o /usr/local/bin/agg && \
    chmod +x /usr/local/bin/agg

COPY api.py /app/api.py
WORKDIR /app

EXPOSE 5002
CMD ["python3", "/app/api.py"]
