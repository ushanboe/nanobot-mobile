#!/bin/sh
# Wrapper for ms-365-mcp-server that:
# 1. Reads config from /app/ms365-config.json
# 2. Reads token cache file and extracts refresh token
# 3. Calls Microsoft token endpoint to get fresh access token
# 4. Exports MS365_MCP_OAUTH_TOKEN and other env vars
# 5. Starts the server via exec (inherits all env vars)
#
# Uses shell + curl instead of Node.js to avoid module resolution issues.

DIAG="/tmp/ms365-wrapper-diag.txt"
: > "$DIAG"

log() {
  echo "[ms365-wrapper] $1" >&2
  echo "[ms365-wrapper] $1" >> "$DIAG"
}

# Read config file
CONFIG_FILE="/app/ms365-config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  log "ERROR: Config file not found at $CONFIG_FILE"
  exit 1
fi

# Parse config with node one-liner (safe: reads local file, no external deps)
eval "$(node -e "
  const c = JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));
  console.log('export MS365_MCP_CLIENT_ID=\"' + (c.clientId || '') + '\"');
  console.log('export MS365_MCP_TENANT_ID=\"' + (c.tenantId || 'common') + '\"');
  console.log('export MS365_MCP_CLIENT_SECRET=\"' + (c.clientSecret || '') + '\"');
  console.log('export NODE_PATH=\"' + (c.nodePath || '') + '\"');
  console.log('export MS365_PKG_ROOT=\"' + (c.pkgRoot || '') + '\"');
")"

log "Config loaded: clientId=${MS365_MCP_CLIENT_ID:+set}, tenantId=$MS365_MCP_TENANT_ID"
log "Package root: $MS365_PKG_ROOT"

CACHE_FILE="$MS365_PKG_ROOT/.token-cache.json"
SERVER_ENTRY="$MS365_PKG_ROOT/dist/index.js"

log "Token cache exists: $([ -f "$CACHE_FILE" ] && echo yes || echo no)"
log "Server entry exists: $([ -f "$SERVER_ENTRY" ] && echo yes || echo no)"

if [ ! -f "$SERVER_ENTRY" ]; then
  log "ERROR: Server entry not found"
  exit 1
fi

# Extract refresh token and acquire access token
if [ -f "$CACHE_FILE" ] && [ -n "$MS365_MCP_CLIENT_ID" ]; then
  CACHE_SIZE=$(wc -c < "$CACHE_FILE")
  log "Token cache: $CACHE_SIZE bytes"

  # Extract refresh token using node one-liner
  REFRESH_TOKEN=$(node -e "
    try {
      const cache = JSON.parse(require('fs').readFileSync('$CACHE_FILE','utf8'));
      const tokens = cache.RefreshToken || {};
      for (const val of Object.values(tokens)) {
        if (val.secret) { process.stdout.write(val.secret); break; }
      }
    } catch(e) { process.stderr.write('Parse error: ' + e.message); }
  " 2>>"$DIAG")

  if [ -n "$REFRESH_TOKEN" ]; then
    RT_LEN=$(printf '%s' "$REFRESH_TOKEN" | wc -c)
    log "Found refresh token ($RT_LEN chars)"

    # Call Microsoft token endpoint with curl
    SCOPES="User.Read Mail.Read Mail.Send Files.Read Files.ReadWrite offline_access"
    TOKEN_RESPONSE=$(curl -s -X POST \
      "https://login.microsoftonline.com/$MS365_MCP_TENANT_ID/oauth2/v2.0/token" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "grant_type=refresh_token&client_id=$MS365_MCP_CLIENT_ID&refresh_token=$REFRESH_TOKEN&scope=$SCOPES")

    # Extract access_token from response
    ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | node -e "
      const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      if (d.access_token) {
        process.stdout.write(d.access_token);
      } else {
        process.stderr.write('Token error: ' + (d.error_description || d.error || JSON.stringify(d)));
      }
    " 2>>"$DIAG")

    if [ -n "$ACCESS_TOKEN" ]; then
      AT_LEN=$(printf '%s' "$ACCESS_TOKEN" | wc -c)
      export MS365_MCP_OAUTH_TOKEN="$ACCESS_TOKEN"
      log "SUCCESS: Got access token ($AT_LEN chars)"
    else
      log "Failed to get access token (see error above)"
    fi
  else
    log "No refresh token found in cache"
    # Diagnostic: show cache structure
    node -e "
      try {
        const c = JSON.parse(require('fs').readFileSync('$CACHE_FILE','utf8'));
        const msg = 'Cache keys: ' + Object.keys(c).join(', ') +
          ', RefreshToken entries: ' + Object.keys(c.RefreshToken||{}).length;
        process.stderr.write(msg);
      } catch(e) { process.stderr.write('Parse error: ' + e.message); }
    " 2>>"$DIAG"
  fi
else
  log "Skipping token acquisition (cache: $([ -f "$CACHE_FILE" ] && echo yes || echo no), clientId: ${MS365_MCP_CLIENT_ID:+set})"
fi

log "Starting server (OAUTH_TOKEN set: $([ -n "$MS365_MCP_OAUTH_TOKEN" ] && echo yes || echo no))"

# exec replaces this process with node — all env vars are inherited
exec node "$SERVER_ENTRY"
