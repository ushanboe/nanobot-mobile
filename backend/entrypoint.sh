#!/bin/sh
# Entrypoint script for nanobot backend
# Dynamically builds nanobot.yaml based on which credentials are available

# Ensure HOME is set (needed for ~/.gmail-mcp/ resolution in Gmail MCP server)
export HOME=/root

# Set NODE_PATH so node -e commands and child processes can resolve globally installed packages.
# Without this, require.resolve('@softeria/ms-365-mcp-server') fails from /app because
# Node.js only searches CWD/node_modules upward, not the global install path.
export NODE_PATH="$(npm root -g)"

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

  # Derive package root and entry point directly from npm root -g.
  # We use `node <entry>` instead of `npx -y` to run the server, because npx
  # may create a cached copy in a DIFFERENT directory. The server's auth.js
  # uses import.meta.url to find .token-cache.json relative to its own location.
  export MS365_PKG_ROOT="$(npm root -g)/@softeria/ms-365-mcp-server"
  if [ -f "$MS365_PKG_ROOT/dist/index.js" ]; then
    MS365_ENTRY="$MS365_PKG_ROOT/dist/index.js"
    echo "  MS365 entry: $MS365_ENTRY"
  else
    MS365_ENTRY=""
    echo "  WARNING: ms-365-mcp-server entry not found at $MS365_PKG_ROOT/dist/index.js"
    echo "  npm root -g: $(npm root -g)"
    ls -la "$(npm root -g)/@softeria/" 2>/dev/null || echo "  @softeria not found in global modules"
  fi
  echo "  Package dir exists: $([ -d "$MS365_PKG_ROOT" ] && echo yes || echo no)"
  echo "  dist dir exists: $([ -d "$MS365_PKG_ROOT/dist" ] && echo yes || echo no)"

  # Pre-seed MSAL token cache if provided (avoids device code login on every deploy)
  # Write to BOTH the package root (for server's own MSAL) AND /app/ (fallback for wrapper)
  CACHE_LEN=$(printf '%s' "$MS365_TOKEN_CACHE_JSON" | wc -c)
  echo "  MS365_TOKEN_CACHE_JSON env var: ${CACHE_LEN} chars"
  if [ -n "$MS365_TOKEN_CACHE_JSON" ]; then
    # Always write to /app/ as fallback (wrapper checks here if pkg root copy missing)
    printf '%s' "$MS365_TOKEN_CACHE_JSON" > /app/.ms365-token-cache.json
    chmod 600 /app/.ms365-token-cache.json
    echo "  Fallback cache written: /app/.ms365-token-cache.json ($(wc -c < /app/.ms365-token-cache.json) bytes)"
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
      echo "  WARNING: MS365 package not found at $MS365_PKG_ROOT — using fallback path only"
      echo "  Listing global packages:"
      ls "$(npm root -g)/" 2>/dev/null || echo "    (failed to list)"
    fi
  else
    echo "  Note: No MS365_TOKEN_CACHE_JSON set"
  fi

  # Get refresh token — prefer extracting from MSAL cache, fall back to MS365_REFRESH_TOKEN env var.
  # MS365_REFRESH_TOKEN is a simple ~200 char string that's easy to paste into Railway,
  # unlike MS365_TOKEN_CACHE_JSON which is a large complex JSON blob that may fail to save.
  REFRESH_TOKEN=""
  if [ -n "$MS365_TOKEN_CACHE_JSON" ]; then
    REFRESH_TOKEN=$(printf '%s' "$MS365_TOKEN_CACHE_JSON" | node -e "
      const cache = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const tokens = cache.RefreshToken || {};
      for (const val of Object.values(tokens)) {
        if (val.secret) { process.stdout.write(val.secret); break; }
      }
    " 2>/dev/null)
    if [ -n "$REFRESH_TOKEN" ]; then
      echo "  Refresh token extracted from MSAL cache ($(printf '%s' "$REFRESH_TOKEN" | wc -c) chars)"
    else
      echo "  WARNING: No refresh token found in MSAL cache"
    fi
  fi

  # Fallback: use MS365_REFRESH_TOKEN env var directly
  if [ -z "$REFRESH_TOKEN" ] && [ -n "$MS365_REFRESH_TOKEN" ]; then
    REFRESH_TOKEN="$MS365_REFRESH_TOKEN"
    echo "  Using MS365_REFRESH_TOKEN env var directly ($(printf '%s' "$REFRESH_TOKEN" | wc -c) chars)"
  fi

  # Write refresh token to file so wrapper can use it (nanobot doesn't pass env vars to children)
  if [ -n "$REFRESH_TOKEN" ]; then
    printf '%s' "$REFRESH_TOKEN" > /app/.ms365-refresh-token
    chmod 600 /app/.ms365-refresh-token
    echo "  Refresh token written to /app/.ms365-refresh-token"
  else
    echo "  WARNING: No refresh token available from cache or env var"
    echo "  Set MS365_REFRESH_TOKEN in Railway (just the token string, ~200 chars)"
    echo "  Or set MS365_TOKEN_CACHE_JSON (full MSAL cache JSON)"
  fi

  # Pre-acquire access token using the refresh token
  MS365_ACCESS_TOKEN=""
  if [ -n "$REFRESH_TOKEN" ]; then
    SCOPES="User.Read Mail.Read Mail.Send Files.Read Files.ReadWrite offline_access"
    TENANT="${MS365_MCP_TENANT_ID:-common}"
    TOKEN_RESPONSE=$(curl -s -X POST \
      "https://login.microsoftonline.com/$TENANT/oauth2/v2.0/token" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "grant_type=refresh_token&client_id=$MS365_MCP_CLIENT_ID&refresh_token=$REFRESH_TOKEN&scope=$SCOPES" 2>/dev/null)

    ACTUAL_TOKEN=$(printf '%s' "$TOKEN_RESPONSE" | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      if (d.access_token) process.stdout.write(d.access_token);
    " 2>/dev/null)

    if [ -n "$ACTUAL_TOKEN" ]; then
      AT_LEN=$(printf '%s' "$ACTUAL_TOKEN" | wc -c)
      MS365_ACCESS_TOKEN="$ACTUAL_TOKEN"
      echo "  ACCESS TOKEN ACQUIRED ($AT_LEN chars)"
    else
      echo "  WARNING: Token acquisition failed"
      printf '%s' "$TOKEN_RESPONSE" | head -c 300
      echo ""
    fi
  fi

  # Write access token to a separate file (too large/fragile for JSON embedding)
  if [ -n "$MS365_ACCESS_TOKEN" ]; then
    printf '%s' "$MS365_ACCESS_TOKEN" > /app/ms365-oauth-token.txt
    chmod 600 /app/ms365-oauth-token.txt
    echo "  OAuth token written to /app/ms365-oauth-token.txt"
  fi

  node -e "
    const fs = require('fs');
    fs.writeFileSync('/app/ms365-config.json', JSON.stringify({
      pkgRoot: process.env.MS365_PKG_ROOT,
      clientId: process.env.MS365_MCP_CLIENT_ID,
      clientSecret: process.env.MS365_MCP_CLIENT_SECRET || '',
      tenantId: process.env.MS365_MCP_TENANT_ID || 'common',
      nodePath: '$(npm root -g)',
    }));
    console.log('  Wrapper config written: /app/ms365-config.json');
  "

  # Pre-seed selected account if provided
  if [ -n "$MS365_SELECTED_ACCOUNT_JSON" ]; then
    # Transform format if needed: server expects {"accountId":"..."} not {"homeAccountId":"..."}
    ACCOUNT_ID=$(echo "$MS365_SELECTED_ACCOUNT_JSON" | node -e "
      const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      process.stdout.write(JSON.stringify({accountId: d.accountId || d.homeAccountId}));
    " 2>/dev/null)
    ACCOUNT_DATA="${ACCOUNT_ID:-$MS365_SELECTED_ACCOUNT_JSON}"
    # Write to /app/ as fallback
    printf '%s' "$ACCOUNT_DATA" > /app/.ms365-selected-account.json
    chmod 600 /app/.ms365-selected-account.json
    echo "  Fallback selected account written: /app/.ms365-selected-account.json"
    if [ -d "$MS365_PKG_ROOT" ]; then
      printf '%s' "$ACCOUNT_DATA" > "$MS365_PKG_ROOT/.selected-account.json"
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
      You are already logged in - do NOT call the login tool or ask the user to log in.
      For OneDrive: first call list-drives to get all drives. IMPORTANT: The account has multiple drives including internal ones like 'ODCMetadataArchive' that will return errors. Always use the drive named 'OneDrive' (driveType: 'personal'). Ignore any drives named ODCMetadataArchive or Bundles. Once you have the correct OneDrive drive ID, use it with list-folder-files (use driveItemId=root for the root folder).
      When listing folder contents, ALWAYS set fetchAllPages to true to get all items (some folders have 100+ files).
      IMPORTANT: When searching for a specific file, you MUST search recursively through subfolders. Files are often nested 2-3 levels deep (e.g., Personal docs > PBoe Resumes and Bios > resume.doc). For each top-level folder (especially Personal docs, Documents, Desktop), list its contents with fetchAllPages=true, then for EVERY subfolder found inside it, also list that subfolder contents. Keep going deeper until you find the file or exhaust all directories. Do NOT give up after only checking top-level folders.
      For email: use list-mail-messages to search and read Outlook emails."
  EXTRA_AGENT_SERVERS="${EXTRA_AGENT_SERVERS}
      - microsoft365"
  # Use ms365-wrapper.mjs (Node ESM script) which:
  # 1. Reads config from /app/ms365-config.json
  # 2. Pre-acquires access token via refresh token
  # 3. Patches AuthManager.prototype.getToken so refreshed tokens take effect
  # 4. Refreshes the token every 45 minutes via setInterval
  # 5. Imports and runs the actual server
  # All config is file-based because nanobot doesn't pass env vars to children.
  EXTRA_MCP_SERVERS="${EXTRA_MCP_SERVERS}
  microsoft365:
    command: node
    args: [\"/app/ms365-wrapper.mjs\"]"
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
