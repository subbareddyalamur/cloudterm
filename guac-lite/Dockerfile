# =============================================================================
# Guacamole-Lite Server - Lightweight WebSocket tunnel to guacd
# No authentication required - uses encrypted tokens from CloudTerm backend
# =============================================================================

FROM node:20-slim

WORKDIR /app

# Install guacamole-lite
RUN npm install guacamole-lite

# Copy server script
COPY server.js ./

# Expose WebSocket port
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
