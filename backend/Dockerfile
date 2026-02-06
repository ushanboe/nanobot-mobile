# Nanobot Backend for Railway
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git nodejs npm

WORKDIR /app

# Clone nanobot (pinned to v0.0.50 for stability)
RUN git clone --branch v0.0.50 --depth 1 https://github.com/nanobot-ai/nanobot.git .

# Build Go binary
RUN go build -o nanobot .

# Production image
FROM alpine:latest

RUN apk add --no-cache ca-certificates nodejs npm

WORKDIR /app

COPY --from=builder /app/nanobot .

# Copy config and entrypoint
COPY nanobot.yaml .
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Pre-install MCP server packages globally
RUN npm install -g @gongrzhe/server-gmail-autoauth-mcp @softeria/ms-365-mcp-server

EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
