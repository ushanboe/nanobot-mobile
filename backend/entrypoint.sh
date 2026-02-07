#!/bin/sh
# Entrypoint script for nanobot backend
# Dynamically builds nanobot.yaml based on which credentials are available

# Ensure HOME is set (needed for ~/.gmail-mcp/ resolution in Gmail MCP server)
export HOME=/root

# Gmail: write OAuth keys and credentials to ~/.gmail-mcp/
# The Gmail MCP server (@gongrzhe/server-gmail-autoauth-mcp) reads:
#   ~/.gmail-mcp/gcp-oauth.keys.json  - OAuth client keys from Google Cloud Console
#   ~/.gmail-mcp/credentials.json     - Token object with refresh_token (from setup-gmail-token.js)
GMAIL_READY=false
if [ -n "$GMAIL_OAUTH_KEYS_JSON" ] && [ -n "$GMAIL_CREDENTIALS_JSON" ]; then
  mkdir -p /root/.gmail-mcp
  # Use printf to avoid echo mangling JSON special characters
  printf '%s' "$GMAIL_OAUTH_KEYS_JSON" > /root/.gmail-mcp/gcp-oauth.keys.json
  printf '%s' "$GMAIL_CREDENTIALS_JSON" > /root/.gmail-mcp/credentials.json
  GMAIL_READY=true
  echo "Gmail credentials configured at /root/.gmail-mcp/"
  echo "  gcp-oauth.keys.json: $(wc -c < /root/.gmail-mcp/gcp-oauth.keys.json) bytes"
  echo "  credentials.json: $(wc -c < /root/.gmail-mcp/credentials.json) bytes"
  # Validate that credentials.json has a refresh_token
  if printf '%s' "$GMAIL_CREDENTIALS_JSON" | grep -q '"refresh_token"'; then
    echo "  refresh_token: present"
  else
    echo "  WARNING: credentials.json has no refresh_token - Gmail auth will fail!"
    echo "  Run 'node setup-gmail-token.js' locally to generate proper credentials."
  fi
fi

# MS365: env vars read by ms-365-mcp-server + optional pre-seeded token cache
MS365_READY=false
if [ -n "$MS365_MCP_CLIENT_ID" ] && [ -n "$MS365_MCP_CLIENT_SECRET" ]; then
  MS365_READY=true
  echo "MS365 credentials configured (client_id and client_secret set)"

  # Pre-seed MSAL token cache if provided (avoids device code login on every deploy)
  # The ms-365-mcp-server stores its token cache at <package-root>/.token-cache.json
  if [ -n "$MS365_TOKEN_CACHE_JSON" ]; then
    MS365_PKG_ROOT="$(npm root -g)/@softeria/ms-365-mcp-server"
    if [ -d "$MS365_PKG_ROOT" ]; then
      printf '%s' "$MS365_TOKEN_CACHE_JSON" > "$MS365_PKG_ROOT/.token-cache.json"
      chmod 600 "$MS365_PKG_ROOT/.token-cache.json"
      echo "  Token cache pre-seeded at $MS365_PKG_ROOT/.token-cache.json ($(wc -c < "$MS365_PKG_ROOT/.token-cache.json") bytes)"
    else
      echo "  WARNING: MS365 package not found at $MS365_PKG_ROOT - token cache not pre-seeded"
    fi
  else
    echo "  Note: No MS365_TOKEN_CACHE_JSON set - user must complete device code login"
  fi

  # Pre-seed selected account if provided
  if [ -n "$MS365_SELECTED_ACCOUNT_JSON" ]; then
    MS365_PKG_ROOT="${MS365_PKG_ROOT:-$(npm root -g)/@softeria/ms-365-mcp-server}"
    if [ -d "$MS365_PKG_ROOT" ]; then
      printf '%s' "$MS365_SELECTED_ACCOUNT_JSON" > "$MS365_PKG_ROOT/.selected-account.json"
      chmod 600 "$MS365_PKG_ROOT/.selected-account.json"
      echo "  Selected account pre-seeded"
    fi
  fi
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

if [ "$GMAIL_READY" = true ] && [ "$MS365_READY" = true ]; then
  EXTRA_INSTRUCTIONS="${EXTRA_INSTRUCTIONS}
      IMPORTANT: When the user mentions 'Gmail', ONLY use Gmail tools. When the user mentions 'Outlook' or 'Microsoft', ONLY use Microsoft 365 tools. Never fall back to one email service when the other fails - instead tell the user there was an authentication error."
elif [ "$GMAIL_READY" = true ]; then
  EXTRA_INSTRUCTIONS="${EXTRA_INSTRUCTIONS}
      Use Gmail tools when the user asks about emails. If Gmail tools fail with auth errors, tell the user their Gmail credentials need to be updated - do NOT try other tools."
elif [ "$MS365_READY" = true ]; then
  EXTRA_INSTRUCTIONS="${EXTRA_INSTRUCTIONS}
      Use Microsoft 365 tools when the user asks about emails. If the tools require login, provide the device code login instructions."
fi

TODAY=$(date -u +"%Y-%m-%d")

cat > /app/nanobot.yaml << YAML
agents:
  assistant:
    model: gpt-4o
    instructions: |
      You are a helpful AI assistant with access to powerful tools.
      Today's date is ${TODAY}.
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
