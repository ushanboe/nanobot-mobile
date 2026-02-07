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
MS365_ENTRY=""
if [ -n "$MS365_MCP_CLIENT_ID" ] && [ -n "$MS365_MCP_CLIENT_SECRET" ]; then
  MS365_READY=true
  echo "MS365 credentials configured (client_id and client_secret set)"

  # Resolve the actual ms-365-mcp-server entry point and package root.
  # CRITICAL: We must use `node <entry>` instead of `npx -y` to run the server,
  # because npx may create a cached copy in a DIFFERENT directory. The server's
  # auth.js uses import.meta.url to find .token-cache.json relative to its own
  # location, so the pre-seeded cache must be in the same directory tree.
  MS365_ENTRY=$(node -e "try{console.log(require.resolve('@softeria/ms-365-mcp-server'))}catch(e){}" 2>/dev/null)
  if [ -n "$MS365_ENTRY" ]; then
    # Entry is like .../dist/index.js → package root is parent of dist/
    MS365_PKG_ROOT=$(node -e "const p=require('path');console.log(p.resolve(p.dirname(require.resolve('@softeria/ms-365-mcp-server')),'..'))" 2>/dev/null)
    echo "  MS365 entry: $MS365_ENTRY"
    echo "  MS365 package root (resolved): $MS365_PKG_ROOT"
  else
    MS365_PKG_ROOT="$(npm root -g)/@softeria/ms-365-mcp-server"
    echo "  WARNING: Could not resolve ms-365-mcp-server, falling back to npm root: $MS365_PKG_ROOT"
  fi
  echo "  Package dir exists: $([ -d "$MS365_PKG_ROOT" ] && echo yes || echo no)"
  echo "  dist dir exists: $([ -d "$MS365_PKG_ROOT/dist" ] && echo yes || echo no)"

  # Pre-seed MSAL token cache if provided (avoids device code login on every deploy)
  # The ms-365-mcp-server stores its token cache at <package-root>/.token-cache.json
  if [ -n "$MS365_TOKEN_CACHE_JSON" ]; then
    if [ -d "$MS365_PKG_ROOT" ]; then
      printf '%s' "$MS365_TOKEN_CACHE_JSON" > "$MS365_PKG_ROOT/.token-cache.json"
      chmod 600 "$MS365_PKG_ROOT/.token-cache.json"
      echo "  Token cache written: $MS365_PKG_ROOT/.token-cache.json ($(wc -c < "$MS365_PKG_ROOT/.token-cache.json") bytes)"
      # Verify the JSON is valid
      if node -e "JSON.parse(require('fs').readFileSync('$MS365_PKG_ROOT/.token-cache.json','utf8'))" 2>/dev/null; then
        echo "  Token cache JSON: valid"
      else
        echo "  WARNING: Token cache JSON is invalid!"
      fi
    else
      echo "  WARNING: MS365 package not found at $MS365_PKG_ROOT"
      echo "  Listing global packages:"
      ls "$(npm root -g)/" 2>/dev/null || echo "    (failed to list)"
    fi
  else
    echo "  Note: No MS365_TOKEN_CACHE_JSON set - user must complete device code login"
  fi

  # Pre-seed selected account if provided
  if [ -n "$MS365_SELECTED_ACCOUNT_JSON" ]; then
    if [ -d "$MS365_PKG_ROOT" ]; then
      # Transform format if needed: server expects {"accountId":"..."} not {"homeAccountId":"..."}
      ACCOUNT_ID=$(echo "$MS365_SELECTED_ACCOUNT_JSON" | node -e "
        const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        process.stdout.write(JSON.stringify({accountId: d.accountId || d.homeAccountId}));
      " 2>/dev/null)
      if [ -n "$ACCOUNT_ID" ]; then
        printf '%s' "$ACCOUNT_ID" > "$MS365_PKG_ROOT/.selected-account.json"
      else
        printf '%s' "$MS365_SELECTED_ACCOUNT_JSON" > "$MS365_PKG_ROOT/.selected-account.json"
      fi
      chmod 600 "$MS365_PKG_ROOT/.selected-account.json"
      echo "  Selected account written: $(cat "$MS365_PKG_ROOT/.selected-account.json")"
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
  # Use resolved entry point (node <path>) instead of npx to ensure import.meta.url
  # matches the directory where we pre-seeded the token cache
  if [ -n "$MS365_ENTRY" ]; then
    EXTRA_MCP_SERVERS="${EXTRA_MCP_SERVERS}
  microsoft365:
    command: node
    args: [\"$MS365_ENTRY\"]"
  else
    EXTRA_MCP_SERVERS="${EXTRA_MCP_SERVERS}
  microsoft365:
    command: npx
    args: [\"-y\", \"@softeria/ms-365-mcp-server\"]"
  fi
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
