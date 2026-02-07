#!/usr/bin/env node
/**
 * Wrapper for @softeria/ms-365-mcp-server that:
 * 1. Writes the token cache from env vars
 * 2. Extracts refresh token and calls Microsoft token endpoint directly
 * 3. Sets MS365_MCP_OAUTH_TOKEN so the server uses the fresh access token
 * 4. Periodically refreshes the token before it expires
 * 5. Imports and runs the actual server
 *
 * This bypasses MSAL deserialization entirely — uses raw HTTP to get tokens.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const pkgRoot = process.env.MS365_PKG_ROOT || '/usr/local/lib/node_modules/@softeria/ms-365-mcp-server';
const serverEntry = path.join(pkgRoot, 'dist', 'index.js');
const cachePath = path.join(pkgRoot, '.token-cache.json');
const accountPath = path.join(pkgRoot, '.selected-account.json');
const diagPath = '/tmp/ms365-wrapper-diag.txt';

// Log to both stderr and a diagnostic file the AI can read
const diagLog = [];
function log(msg) {
  const line = `[ms365-wrapper] ${msg}`;
  console.error(line);
  diagLog.push(line);
  fs.writeFileSync(diagPath, diagLog.join('\n') + '\n');
}

log(`Package root: ${pkgRoot}`);
log(`Server entry: ${serverEntry}`);
log(`NODE_PATH: ${process.env.NODE_PATH || '(not set)'}`);
log(`MS365_TOKEN_CACHE_JSON set: ${!!process.env.MS365_TOKEN_CACHE_JSON}`);
log(`MS365_TOKEN_CACHE_JSON length: ${(process.env.MS365_TOKEN_CACHE_JSON || '').length}`);
log(`MS365_MCP_CLIENT_ID set: ${!!process.env.MS365_MCP_CLIENT_ID}`);
log(`MS365_MCP_TENANT_ID: ${process.env.MS365_MCP_TENANT_ID || '(not set)'}`);
log(`MS365_SELECTED_ACCOUNT_JSON set: ${!!process.env.MS365_SELECTED_ACCOUNT_JSON}`);

if (!fs.existsSync(serverEntry)) {
  log(` ERROR: Server entry not found at ${serverEntry}`);
  process.exit(1);
}

// Write token cache and selected account files from env vars
if (process.env.MS365_TOKEN_CACHE_JSON) {
  fs.writeFileSync(cachePath, process.env.MS365_TOKEN_CACHE_JSON);
  fs.chmodSync(cachePath, 0o600);
  log(` Token cache written: ${fs.statSync(cachePath).size} bytes`);
}
if (process.env.MS365_SELECTED_ACCOUNT_JSON) {
  try {
    const d = JSON.parse(process.env.MS365_SELECTED_ACCOUNT_JSON);
    const formatted = JSON.stringify({ accountId: d.accountId || d.homeAccountId });
    fs.writeFileSync(accountPath, formatted);
    fs.chmodSync(accountPath, 0o600);
    log(` Selected account: ${formatted}`);
  } catch (e) {
    log(` Selected account write failed: ${e.message}`);
  }
}

/**
 * Extract refresh token from MSAL token cache JSON.
 * Cache format: { RefreshToken: { "key": { secret: "...", client_id: "..." } } }
 */
function extractRefreshToken(cacheJson, clientId) {
  try {
    const cache = JSON.parse(cacheJson);
    const tokens = cache.RefreshToken || {};
    for (const [key, val] of Object.entries(tokens)) {
      if (val.secret && (!clientId || val.client_id === clientId)) {
        return val.secret;
      }
    }
  } catch {}
  return null;
}

/**
 * Call Microsoft OAuth token endpoint to exchange refresh token for access token.
 */
async function refreshAccessToken(refreshToken, clientId, tenantId, scopes) {
  const url = `https://login.microsoftonline.com/${tenantId || 'common'}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    scope: scopes.join(' '),
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${text}`);
  }

  return await resp.json();
}

// Pre-acquire access token by directly calling Microsoft's token endpoint
let currentRefreshToken = null;
const clientId = process.env.MS365_MCP_CLIENT_ID;
const tenantId = process.env.MS365_MCP_TENANT_ID || 'common';
const scopes = ['User.Read', 'Mail.Read', 'Mail.Send', 'Files.Read', 'Files.ReadWrite', 'offline_access'];

if (process.env.MS365_TOKEN_CACHE_JSON && clientId) {
  const refreshToken = extractRefreshToken(process.env.MS365_TOKEN_CACHE_JSON, clientId);

  if (refreshToken) {
    log(` Found refresh token (${refreshToken.length} chars)`);

    try {
      const result = await refreshAccessToken(refreshToken, clientId, tenantId, scopes);
      process.env.MS365_MCP_OAUTH_TOKEN = result.access_token;
      currentRefreshToken = result.refresh_token || refreshToken;
      log(` Got access token (${result.access_token.length} chars), expires_in: ${result.expires_in}s`);

      // Schedule token refresh every 45 minutes
      setInterval(async () => {
        try {
          const r = await refreshAccessToken(currentRefreshToken, clientId, tenantId, scopes);
          process.env.MS365_MCP_OAUTH_TOKEN = r.access_token;
          currentRefreshToken = r.refresh_token || currentRefreshToken;
          log(` Token refreshed, expires_in: ${r.expires_in}s`);
        } catch (e) {
          log(` Token refresh failed: ${e.message}`);
        }
      }, 45 * 60 * 1000);
    } catch (e) {
      log(` Token acquisition failed: ${e.message}`);
      log(` Will fall back to server's own auth flow`);
    }
  } else {
    log(` No refresh token found in cache`);
    log(` Cache env var length: ${process.env.MS365_TOKEN_CACHE_JSON.length}`);
    try {
      const parsed = JSON.parse(process.env.MS365_TOKEN_CACHE_JSON);
      log(` Cache keys: ${Object.keys(parsed).join(', ')}`);
      const rt = parsed.RefreshToken || {};
      log(` RefreshToken entries: ${Object.keys(rt).length}`);
      for (const [k, v] of Object.entries(rt)) {
        log(`   Key: ${k}, has secret: ${!!v.secret}, client_id: ${v.client_id}`);
      }
    } catch (e) {
      log(` Cache parse failed: ${e.message}`);
    }
  }
} else {
  log(` Skipping token pre-acquisition (cache: ${!!process.env.MS365_TOKEN_CACHE_JSON}, clientId: ${!!clientId})`);
}

// Import and run the actual server
log(`Starting server...`);
await import(pathToFileURL(serverEntry).href);
