# Nanobot Backend for Railway
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git nodejs npm

WORKDIR /app

# Clone nanobot (pinned to v0.0.55 — has chat-with-* tools, 10MB bufio, --config flag)
RUN git clone --branch v0.0.55 --depth 1 https://github.com/nanobot-ai/nanobot.git .

# Build Go binary (UI disabled so go generate not needed — .dist placeholder satisfies embed)
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
