#!/usr/bin/env node
/**
 * Wrapper for @softeria/ms-365-mcp-server that:
 * 1. Reads config from /app/ms365-config.json (written by entrypoint.sh)
 * 2. Reads token cache from file (written by entrypoint.sh)
 * 3. Extracts refresh token and calls Microsoft token endpoint directly
 * 4. Sets MS365_MCP_OAUTH_TOKEN so the server uses the fresh access token
 * 5. Sets all MS365_MCP_* env vars so the server's secrets.js finds them
 * 6. Periodically refreshes the token before it expires
 * 7. Imports and runs the actual server
 *
 * All config is file-based because nanobot doesn't pass env vars to child processes.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const configPath = '/app/ms365-config.json';
const diagPath = '/tmp/ms365-wrapper-diag.txt';

const diagLog = [];
function log(msg) {
  const line = `[ms365-wrapper] ${msg}`;
  console.error(line);
  diagLog.push(line);
  try { fs.writeFileSync(diagPath, diagLog.join('\n') + '\n'); } catch {}
}

// Read config file written by entrypoint.sh
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  log(`Config loaded: clientId=${!!config.clientId}, tenantId=${config.tenantId}, pkgRoot=${config.pkgRoot}`);
} catch (e) {
  log(`ERROR: Cannot read config from ${configPath}: ${e.message}`);
  log(`This means entrypoint.sh didn't write the config file.`);
  process.exit(1);
}

// Set env vars that the server's secrets.js and auth.js need
process.env.MS365_MCP_CLIENT_ID = config.clientId;
process.env.MS365_MCP_TENANT_ID = config.tenantId;
if (config.clientSecret) process.env.MS365_MCP_CLIENT_SECRET = config.clientSecret;
if (config.nodePath) process.env.NODE_PATH = config.nodePath;

const pkgRoot = config.pkgRoot;
const serverEntry = path.join(pkgRoot, 'dist', 'index.js');
const cachePath = path.join(pkgRoot, '.token-cache.json');
const accountPath = path.join(pkgRoot, '.selected-account.json');

log(`Package root: ${pkgRoot}`);
log(`Server entry: ${serverEntry}`);
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

// Pre-acquire access token
let currentRefreshToken = null;
const scopes = ['User.Read', 'Mail.Read', 'Mail.Send', 'Files.Read', 'Files.ReadWrite', 'offline_access'];

if (fs.existsSync(cachePath) && config.clientId) {
  let cacheData;
  try {
    cacheData = fs.readFileSync(cachePath, 'utf8');
    log(`Token cache read: ${cacheData.length} chars`);
  } catch (e) {
    log(`Token cache read failed: ${e.message}`);
  }

  if (cacheData) {
    const refreshToken = extractRefreshToken(cacheData, config.clientId);

    if (refreshToken) {
      log(`Found refresh token (${refreshToken.length} chars)`);

      try {
        const result = await refreshAccessToken(refreshToken, config.clientId, config.tenantId, scopes);
        process.env.MS365_MCP_OAUTH_TOKEN = result.access_token;
        currentRefreshToken = result.refresh_token || refreshToken;
        log(`SUCCESS: Got access token (${result.access_token.length} chars), expires_in: ${result.expires_in}s`);

        // Schedule token refresh every 45 minutes
        setInterval(async () => {
          try {
            const r = await refreshAccessToken(currentRefreshToken, config.clientId, config.tenantId, scopes);
            process.env.MS365_MCP_OAUTH_TOKEN = r.access_token;
            currentRefreshToken = r.refresh_token || currentRefreshToken;
            log(`Token refreshed, expires_in: ${r.expires_in}s`);
          } catch (e) {
            log(`Token refresh failed: ${e.message}`);
          }
        }, 45 * 60 * 1000);
      } catch (e) {
        log(`Token acquisition failed: ${e.message}`);
        log(`Will fall back to server's device code auth flow`);
      }
    } else {
      log(`No refresh token found in cache for client_id=${config.clientId}`);
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
  log(`Skipping token pre-acquisition (cacheFile: ${fs.existsSync(cachePath)}, clientId: ${!!config.clientId})`);
}

// Import and run the actual server
log(`Starting server... (MS365_MCP_OAUTH_TOKEN set: ${!!process.env.MS365_MCP_OAUTH_TOKEN})`);
await import(pathToFileURL(serverEntry).href);
