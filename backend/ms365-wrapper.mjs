#!/usr/bin/env node
/**
 * Wrapper for @softeria/ms-365-mcp-server that:
 * 1. Reads the token cache from file (written by entrypoint.sh)
 * 2. Extracts refresh token and calls Microsoft token endpoint directly
 * 3. Sets MS365_MCP_OAUTH_TOKEN so the server uses the fresh access token
 * 4. Periodically refreshes the token before it expires
 * 5. Imports and runs the actual server
 *
 * Env vars passed via nanobot.yaml env: field (nanobot doesn't inherit parent env):
 *   MS365_PKG_ROOT, MS365_MCP_CLIENT_ID, MS365_MCP_TENANT_ID, NODE_PATH
 * Token cache is read from file at $MS365_PKG_ROOT/.token-cache.json
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const pkgRoot = process.env.MS365_PKG_ROOT || '/usr/local/lib/node_modules/@softeria/ms-365-mcp-server';
const serverEntry = path.join(pkgRoot, 'dist', 'index.js');
const cachePath = path.join(pkgRoot, '.token-cache.json');
const accountPath = path.join(pkgRoot, '.selected-account.json');
const diagPath = '/tmp/ms365-wrapper-diag.txt';

const diagLog = [];
function log(msg) {
  const line = `[ms365-wrapper] ${msg}`;
  console.error(line);
  diagLog.push(line);
  try { fs.writeFileSync(diagPath, diagLog.join('\n') + '\n'); } catch {}
}

log(`Package root: ${pkgRoot}`);
log(`Server entry: ${serverEntry}`);
log(`NODE_PATH: ${process.env.NODE_PATH || '(not set)'}`);
log(`MS365_MCP_CLIENT_ID set: ${!!process.env.MS365_MCP_CLIENT_ID}`);
log(`MS365_MCP_TENANT_ID: ${process.env.MS365_MCP_TENANT_ID || '(not set)'}`);
log(`Token cache file exists: ${fs.existsSync(cachePath)}`);
log(`Selected account file exists: ${fs.existsSync(accountPath)}`);

if (!fs.existsSync(serverEntry)) {
  log(`ERROR: Server entry not found at ${serverEntry}`);
  process.exit(1);
}

/**
 * Extract refresh token from MSAL token cache JSON.
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

// Pre-acquire access token by reading token cache FILE and calling Microsoft's token endpoint
let currentRefreshToken = null;
const clientId = process.env.MS365_MCP_CLIENT_ID;
const tenantId = process.env.MS365_MCP_TENANT_ID || 'common';
const scopes = ['User.Read', 'Mail.Read', 'Mail.Send', 'Files.Read', 'Files.ReadWrite', 'offline_access'];

if (fs.existsSync(cachePath) && clientId) {
  let cacheData;
  try {
    cacheData = fs.readFileSync(cachePath, 'utf8');
    log(`Token cache read: ${cacheData.length} chars`);
  } catch (e) {
    log(`Token cache read failed: ${e.message}`);
  }

  if (cacheData) {
    const refreshToken = extractRefreshToken(cacheData, clientId);

    if (refreshToken) {
      log(`Found refresh token (${refreshToken.length} chars)`);

      try {
        const result = await refreshAccessToken(refreshToken, clientId, tenantId, scopes);
        process.env.MS365_MCP_OAUTH_TOKEN = result.access_token;
        currentRefreshToken = result.refresh_token || refreshToken;
        log(`SUCCESS: Got access token (${result.access_token.length} chars), expires_in: ${result.expires_in}s`);

        // Schedule token refresh every 45 minutes
        setInterval(async () => {
          try {
            const r = await refreshAccessToken(currentRefreshToken, clientId, tenantId, scopes);
            process.env.MS365_MCP_OAUTH_TOKEN = r.access_token;
            currentRefreshToken = r.refresh_token || currentRefreshToken;
            log(`Token refreshed, expires_in: ${r.expires_in}s`);
          } catch (e) {
            log(`Token refresh failed: ${e.message}`);
          }
        }, 45 * 60 * 1000);
      } catch (e) {
        log(`Token acquisition failed: ${e.message}`);
        log(`Will fall back to server's own auth flow`);
      }
    } else {
      log(`No refresh token found in cache for client_id=${clientId}`);
      try {
        const parsed = JSON.parse(cacheData);
        log(`Cache keys: ${Object.keys(parsed).join(', ')}`);
        const rt = parsed.RefreshToken || {};
        log(`RefreshToken entries: ${Object.keys(rt).length}`);
        for (const [k, v] of Object.entries(rt)) {
          log(`  Key: ${k}, has secret: ${!!v.secret}, client_id: ${v.client_id}`);
        }
      } catch (e) {
        log(`Cache parse failed: ${e.message}`);
      }
    }
  }
} else {
  log(`Skipping token pre-acquisition (cacheFile: ${fs.existsSync(cachePath)}, clientId: ${!!clientId})`);
}

// Import and run the actual server
log(`Starting server... (MS365_MCP_OAUTH_TOKEN set: ${!!process.env.MS365_MCP_OAUTH_TOKEN})`);
await import(pathToFileURL(serverEntry).href);
