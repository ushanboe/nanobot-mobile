# Nanobot Backend for Railway
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git nodejs npm

WORKDIR /app

# Clone nanobot
RUN git clone https://github.com/nanobot-ai/nanobot.git .

# Build Go binary
RUN go build -o nanobot .

# Build UI
WORKDIR /app/packages/ui
RUN npm install -g pnpm && pnpm install && pnpm build

# Production image
FROM alpine:latest

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /app/nanobot .
COPY --from=builder /app/packages/ui/build ./packages/ui/build

# Create config directory
RUN mkdir -p .nanobot

EXPOSE 8080

CMD ["./nanobot", "run", "--ui", "--listen", "0.0.0.0:8080"]
