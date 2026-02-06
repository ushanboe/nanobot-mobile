#!/bin/sh
# Entrypoint script for nanobot backend
# Writes OAuth credential files from environment variables before starting nanobot

# Gmail: write OAuth keys and credentials to ~/.gmail-mcp/
if [ -n "$GMAIL_OAUTH_KEYS_JSON" ]; then
  mkdir -p /root/.gmail-mcp
  echo "$GMAIL_OAUTH_KEYS_JSON" > /root/.gmail-mcp/gcp-oauth.keys.json
  echo "Gmail OAuth keys written"
fi

if [ -n "$GMAIL_CREDENTIALS_JSON" ]; then
  mkdir -p /root/.gmail-mcp
  echo "$GMAIL_CREDENTIALS_JSON" > /root/.gmail-mcp/credentials.json
  echo "Gmail credentials written"
fi

# MS365 env vars (MS365_MCP_CLIENT_ID, MS365_MCP_CLIENT_SECRET, MS365_MCP_TENANT_ID)
# are read directly by the ms-365-mcp-server from the environment — no file writing needed

# Start nanobot
exec ./nanobot run --config ./nanobot.yaml --listen-address 0.0.0.0:8080 --disable-ui
