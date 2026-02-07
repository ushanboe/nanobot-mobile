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

console.error(`[ms365-wrapper] Package root: ${pkgRoot}`);
console.error(`[ms365-wrapper] Server entry: ${serverEntry}`);

if (!fs.existsSync(serverEntry)) {
  console.error(`[ms365-wrapper] ERROR: Server entry not found at ${serverEntry}`);
  process.exit(1);
}

// Write token cache and selected account files from env vars
if (process.env.MS365_TOKEN_CACHE_JSON) {
  fs.writeFileSync(cachePath, process.env.MS365_TOKEN_CACHE_JSON);
  fs.chmodSync(cachePath, 0o600);
  console.error(`[ms365-wrapper] Token cache written: ${fs.statSync(cachePath).size} bytes`);
}
if (process.env.MS365_SELECTED_ACCOUNT_JSON) {
  try {
    const d = JSON.parse(process.env.MS365_SELECTED_ACCOUNT_JSON);
    const formatted = JSON.stringify({ accountId: d.accountId || d.homeAccountId });
    fs.writeFileSync(accountPath, formatted);
    fs.chmodSync(accountPath, 0o600);
    console.error(`[ms365-wrapper] Selected account: ${formatted}`);
  } catch (e) {
    console.error(`[ms365-wrapper] Selected account write failed: ${e.message}`);
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
    console.error(`[ms365-wrapper] Found refresh token (${refreshToken.length} chars)`);

    try {
      const result = await refreshAccessToken(refreshToken, clientId, tenantId, scopes);
      process.env.MS365_MCP_OAUTH_TOKEN = result.access_token;
      currentRefreshToken = result.refresh_token || refreshToken;
      console.error(`[ms365-wrapper] Got access token (${result.access_token.length} chars), expires_in: ${result.expires_in}s`);

      // Schedule token refresh every 45 minutes
      setInterval(async () => {
        try {
          const r = await refreshAccessToken(currentRefreshToken, clientId, tenantId, scopes);
          process.env.MS365_MCP_OAUTH_TOKEN = r.access_token;
          currentRefreshToken = r.refresh_token || currentRefreshToken;
          console.error(`[ms365-wrapper] Token refreshed, expires_in: ${r.expires_in}s`);
        } catch (e) {
          console.error(`[ms365-wrapper] Token refresh failed: ${e.message}`);
        }
      }, 45 * 60 * 1000);
    } catch (e) {
      console.error(`[ms365-wrapper] Token acquisition failed: ${e.message}`);
      console.error(`[ms365-wrapper] Will fall back to server's own auth flow`);
    }
  } else {
    console.error(`[ms365-wrapper] No refresh token found in cache`);
    console.error(`[ms365-wrapper] Cache env var length: ${process.env.MS365_TOKEN_CACHE_JSON.length}`);
    try {
      const parsed = JSON.parse(process.env.MS365_TOKEN_CACHE_JSON);
      console.error(`[ms365-wrapper] Cache keys: ${Object.keys(parsed).join(', ')}`);
      const rt = parsed.RefreshToken || {};
      console.error(`[ms365-wrapper] RefreshToken entries: ${Object.keys(rt).length}`);
      for (const [k, v] of Object.entries(rt)) {
        console.error(`[ms365-wrapper]   Key: ${k}, has secret: ${!!v.secret}, client_id: ${v.client_id}`);
      }
    } catch (e) {
      console.error(`[ms365-wrapper] Cache parse failed: ${e.message}`);
    }
  }
} else {
  console.error(`[ms365-wrapper] Skipping token pre-acquisition (cache: ${!!process.env.MS365_TOKEN_CACHE_JSON}, clientId: ${!!clientId})`);
}

// Import and run the actual server
console.error(`[ms365-wrapper] Starting server...`);
await import(pathToFileURL(serverEntry).href);
