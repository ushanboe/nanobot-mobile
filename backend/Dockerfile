# Nanobot Backend for Railway
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git nodejs npm

WORKDIR /app

# Clone nanobot (pinned to v0.0.55 — has chat-with-* tools, 10MB bufio, --config flag)
RUN git clone --branch v0.0.55 --depth 1 https://github.com/nanobot-ai/nanobot.git .

# Patch: increase bufio scanner buffer in LLM SSE readers (upstream bug — default 64KB overflows)
# Insert lines.Buffer() call before each "for lines.Scan()" loop
RUN sed -i '/for lines.Scan()/i\\tlines.Buffer(make([]byte, 0, 1024), 10*1024*1024)' \
    pkg/llm/completions/client.go pkg/llm/anthropic/client.go pkg/llm/responses/progress.go

# Build Go binary (UI disabled so go generate not needed — .dist placeholder satisfies embed)
RUN go build -o nanobot .

# Production image
FROM alpine:latest

RUN apk add --no-cache ca-certificates nodejs npm

WORKDIR /app

COPY --from=builder /app/nanobot .

# Copy config, entrypoint, and wrapper scripts
COPY nanobot.yaml .
COPY entrypoint.sh .
COPY ms365-wrapper.mjs .
RUN chmod +x entrypoint.sh

# Pre-install MCP server packages globally
RUN npm install -g @gongrzhe/server-gmail-autoauth-mcp @softeria/ms-365-mcp-server

EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
