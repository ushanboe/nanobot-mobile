# Nanobot Backend for Railway
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git nodejs npm

WORKDIR /app

# Clone nanobot
RUN git clone https://github.com/nanobot-ai/nanobot.git .

# Build Go binary
RUN go build -o nanobot .

# Production image
FROM alpine:latest

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /app/nanobot .

# Copy config file
COPY nanobot.yaml .

EXPOSE 8080

CMD ["./nanobot", "run", "--config", "./nanobot.yaml", "--listen-address", "0.0.0.0:8080", "--disable-ui"]
