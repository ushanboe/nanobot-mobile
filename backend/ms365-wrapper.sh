#!/bin/sh
# Minimal wrapper for ms-365-mcp-server.
# Reads config + pre-acquired access token from files written by entrypoint.sh,
# exports them as env vars, then exec's the node server.
#
# Why: nanobot doesn't pass parent env vars to child MCP server processes.

DIAG="/tmp/ms365-wrapper-diag.txt"
: > "$DIAG" 2>/dev/null

log() {
  echo "[ms365-wrapper] $1" >&2
  echo "[ms365-wrapper] $1" >> "$DIAG" 2>/dev/null
}

# Set PATH explicitly (child process may not inherit it)
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

CONFIG_FILE="/app/ms365-config.json"
TOKEN_FILE="/app/ms365-oauth-token.txt"

log "Starting wrapper..."
log "Config exists: $([ -f "$CONFIG_FILE" ] && echo yes || echo no)"
log "Token file exists: $([ -f "$TOKEN_FILE" ] && echo yes || echo no)"

if [ ! -f "$CONFIG_FILE" ]; then
  log "ERROR: Config file not found"
  exit 1
fi

# Parse config with node
eval "$(node -e "
  const c = JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));
  console.log('export MS365_MCP_CLIENT_ID=\"' + (c.clientId || '') + '\"');
  console.log('export MS365_MCP_TENANT_ID=\"' + (c.tenantId || 'common') + '\"');
  if (c.clientSecret) console.log('export MS365_MCP_CLIENT_SECRET=\"' + c.clientSecret + '\"');
  console.log('export NODE_PATH=\"' + (c.nodePath || '') + '\"');
  console.log('MS365_PKG_ROOT=\"' + (c.pkgRoot || '') + '\"');
" 2>>"$DIAG")"

log "clientId: ${MS365_MCP_CLIENT_ID:+set}"
log "tenantId: $MS365_MCP_TENANT_ID"
log "pkgRoot: $MS365_PKG_ROOT"

SERVER_ENTRY="$MS365_PKG_ROOT/dist/index.js"
log "Server entry exists: $([ -f "$SERVER_ENTRY" ] && echo yes || echo no)"

if [ ! -f "$SERVER_ENTRY" ]; then
  log "ERROR: Server entry not found at $SERVER_ENTRY"
  exit 1
fi

# Read pre-acquired access token
if [ -f "$TOKEN_FILE" ]; then
  OAUTH_TOKEN=$(cat "$TOKEN_FILE")
  if [ -n "$OAUTH_TOKEN" ]; then
    export MS365_MCP_OAUTH_TOKEN="$OAUTH_TOKEN"
    TOKEN_LEN=$(printf '%s' "$OAUTH_TOKEN" | wc -c)
    log "OAuth token loaded ($TOKEN_LEN chars)"
  else
    log "Token file is empty"
  fi
else
  log "No pre-acquired token, will use server's auth flow"
fi

log "Starting server (OAUTH_TOKEN: $([ -n "$MS365_MCP_OAUTH_TOKEN" ] && echo set || echo unset))"

exec node "$SERVER_ENTRY"
