#!/bin/sh
# Entrypoint script for nanobot backend
# Dynamically builds nanobot.yaml based on which credentials are available

# Gmail: write OAuth keys and credentials to ~/.gmail-mcp/
GMAIL_READY=false
if [ -n "$GMAIL_OAUTH_KEYS_JSON" ] && [ -n "$GMAIL_CREDENTIALS_JSON" ]; then
  mkdir -p /root/.gmail-mcp
  echo "$GMAIL_OAUTH_KEYS_JSON" > /root/.gmail-mcp/gcp-oauth.keys.json
  echo "$GMAIL_CREDENTIALS_JSON" > /root/.gmail-mcp/credentials.json
  GMAIL_READY=true
  echo "Gmail credentials configured"
fi

# MS365 env vars are read directly by the ms-365-mcp-server
MS365_READY=false
if [ -n "$MS365_MCP_CLIENT_ID" ] && [ -n "$MS365_MCP_CLIENT_SECRET" ]; then
  MS365_READY=true
  echo "MS365 credentials configured"
fi

# Build dynamic nanobot.yaml with only available MCP servers
EXTRA_INSTRUCTIONS=""
EXTRA_AGENT_SERVERS=""
EXTRA_MCP_SERVERS=""

if [ "$GMAIL_READY" = true ]; then
  EXTRA_INSTRUCTIONS="${EXTRA_INSTRUCTIONS}
      You can access the user's Gmail to search, read, and send emails."
  EXTRA_AGENT_SERVERS="${EXTRA_AGENT_SERVERS}
      - gmail"
  EXTRA_MCP_SERVERS="${EXTRA_MCP_SERVERS}
  gmail:
    command: npx
    args: [\"@gongrzhe/server-gmail-autoauth-mcp\"]"
fi

if [ "$MS365_READY" = true ]; then
  EXTRA_INSTRUCTIONS="${EXTRA_INSTRUCTIONS}
      You can access the user's Microsoft 365 account for Outlook email and OneDrive files.
      When asked about files or documents in their cloud storage, use OneDrive tools to search and retrieve them."
  EXTRA_AGENT_SERVERS="${EXTRA_AGENT_SERVERS}
      - microsoft365"
  EXTRA_MCP_SERVERS="${EXTRA_MCP_SERVERS}
  microsoft365:
    command: npx
    args: [\"-y\", \"@softeria/ms-365-mcp-server\"]"
fi

if [ "$GMAIL_READY" = true ] || [ "$MS365_READY" = true ]; then
  EXTRA_INSTRUCTIONS="${EXTRA_INSTRUCTIONS}
      When asked about emails, use the appropriate Gmail or Outlook tools."
fi

cat > /app/nanobot.yaml << YAML
agents:
  assistant:
    model: gpt-4o
    instructions: |
      You are a helpful AI assistant with access to powerful tools.
      When the user asks a question that needs current information, use web search.
      When the user shares a URL, use fetch to read its contents.
      Think step by step for complex problems using sequential thinking.
      When asked about a GitHub project, use DeepWiki to look up its documentation.${EXTRA_INSTRUCTIONS}
    mcpServers:
      - search
      - fetch
      - thinking
      - deepwiki${EXTRA_AGENT_SERVERS}

mcpServers:
  search:
    url: https://mcp.exa.ai/mcp
  fetch:
    url: https://remote.mcpservers.org/fetch/mcp
  thinking:
    url: https://remote.mcpservers.org/sequentialthinking/mcp
  deepwiki:
    url: https://mcp.deepwiki.com/mcp${EXTRA_MCP_SERVERS}
YAML

echo "Generated nanobot.yaml:"
cat /app/nanobot.yaml
echo "---"

# Start nanobot (--config path must start with ./ for v0.0.51+)
exec ./nanobot run --config ./nanobot.yaml --listen-address 0.0.0.0:8080 --disable-ui
