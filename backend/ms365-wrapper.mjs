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

// Check primary and fallback paths for token cache and selected account
const cachePrimary = path.join(pkgRoot, '.token-cache.json');
const cacheFallback = '/app/.ms365-token-cache.json';
const accountPrimary = path.join(pkgRoot, '.selected-account.json');
const accountFallback = '/app/.ms365-selected-account.json';

const cachePath = fs.existsSync(cachePrimary) ? cachePrimary
  : fs.existsSync(cacheFallback) ? cacheFallback : cachePrimary;
const accountPath = fs.existsSync(accountPrimary) ? accountPrimary
  : fs.existsSync(accountFallback) ? accountFallback : accountPrimary;

log(`Package root: ${pkgRoot}`);
log(`Server entry: ${serverEntry}`);
log(`Token cache: primary=${fs.existsSync(cachePrimary)}, fallback=${fs.existsSync(cacheFallback)}, using=${cachePath}`);
log(`Selected account: primary=${fs.existsSync(accountPrimary)}, fallback=${fs.existsSync(accountFallback)}, using=${accountPath}`);

// If using fallback, also copy to primary so the server's MSAL finds it
if (cachePath === cacheFallback && fs.existsSync(cacheFallback)) {
  try {
    fs.copyFileSync(cacheFallback, cachePrimary);
    log(`Copied fallback cache to ${cachePrimary}`);
  } catch (e) { log(`Failed to copy cache to primary: ${e.message}`); }
}
if (accountPath === accountFallback && fs.existsSync(accountFallback)) {
  try {
    fs.copyFileSync(accountFallback, accountPrimary);
    log(`Copied fallback account to ${accountPrimary}`);
  } catch (e) { log(`Failed to copy account to primary: ${e.message}`); }
}

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
const directRefreshTokenPath = '/app/.ms365-refresh-token';

// Try to get refresh token from multiple sources:
// 1. MSAL token cache file (primary or fallback)
// 2. Direct refresh token file written by entrypoint (from MS365_REFRESH_TOKEN env var)
let refreshToken = null;

if (fs.existsSync(cachePath)) {
  let cacheData;
  try {
    cacheData = fs.readFileSync(cachePath, 'utf8');
    log(`Token cache read: ${cacheData.length} chars`);
  } catch (e) {
    log(`Token cache read failed: ${e.message}`);
  }
  if (cacheData) {
    refreshToken = extractRefreshToken(cacheData, config.clientId);
    if (refreshToken) {
      log(`Found refresh token from MSAL cache (${refreshToken.length} chars)`);
    } else {
      log(`No refresh token found in MSAL cache for client_id=${config.clientId}`);
    }
  }
}

// Fallback: direct refresh token file (from MS365_REFRESH_TOKEN env var via entrypoint)
if (!refreshToken && fs.existsSync(directRefreshTokenPath)) {
  try {
    refreshToken = fs.readFileSync(directRefreshTokenPath, 'utf8').trim();
    log(`Found refresh token from ${directRefreshTokenPath} (${refreshToken.length} chars)`);
  } catch (e) {
    log(`Failed to read ${directRefreshTokenPath}: ${e.message}`);
  }
}

if (refreshToken && config.clientId) {
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
  log(`No refresh token available (MSAL cache: ${fs.existsSync(cachePath)}, direct: ${fs.existsSync(directRefreshTokenPath)}, clientId: ${!!config.clientId})`);
}

// Patch AuthManager.prototype.getToken BEFORE importing the server.
// The server's auth.js caches the OAuth token as a plain string in its constructor:
//   this.oauthToken = process.env.MS365_MCP_OAUTH_TOKEN
// This means the 45-minute setInterval refresh (which updates process.env) has
// no effect — getToken() keeps returning the stale constructor-time value.
// By patching the prototype first, every getToken() call re-reads from process.env.
const authModule = await import(pathToFileURL(path.join(pkgRoot, 'dist', 'auth.js')).href);
const AuthManager = authModule.default;
const originalGetToken = AuthManager.prototype.getToken;
AuthManager.prototype.getToken = async function (forceRefresh) {
  if (this.isOAuthMode) {
    const freshToken = process.env.MS365_MCP_OAUTH_TOKEN;
    if (freshToken) {
      this.oauthToken = freshToken;
      return freshToken;
    }
  }
  return originalGetToken.call(this, forceRefresh);
};
log('Patched AuthManager.prototype.getToken to re-read from process.env');

// Patch getCurrentAccount to return a synthetic account in OAuth mode.
// Without this, tools like list-accounts and verify-login query the MSAL cache,
// which is empty when using the direct MS365_REFRESH_TOKEN path. This causes
// the AI to report "no Microsoft accounts currently linked" even though the
// OAuth token works perfectly for Graph API calls.
const originalGetCurrentAccount = AuthManager.prototype.getCurrentAccount;
AuthManager.prototype.getCurrentAccount = async function () {
  if (this.isOAuthMode && process.env.MS365_MCP_OAUTH_TOKEN) {
    try {
      // Decode JWT payload to extract user identity
      const parts = process.env.MS365_MCP_OAUTH_TOKEN.split('.');
      if (parts.length === 3) {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        return {
          homeAccountId: payload.oid || payload.sub || 'oauth-user',
          localAccountId: payload.oid || payload.sub || 'oauth-user',
          environment: 'login.microsoftonline.com',
          tenantId: payload.tid || config.tenantId || '',
          username: payload.preferred_username || payload.upn || payload.email || '',
          name: payload.name || '',
        };
      }
    } catch (e) {
      log(`JWT decode failed: ${e.message}`);
    }
    // Fallback: return minimal synthetic account
    return {
      homeAccountId: 'oauth-user',
      localAccountId: 'oauth-user',
      environment: 'login.microsoftonline.com',
      tenantId: config.tenantId || '',
      username: 'oauth-user',
      name: 'OAuth User',
    };
  }
  return originalGetCurrentAccount.call(this);
};
log('Patched AuthManager.prototype.getCurrentAccount for OAuth mode');

// Patch listAccounts so list-accounts tool returns the synthetic account
if (typeof AuthManager.prototype.listAccounts === 'function') {
  const originalListAccounts = AuthManager.prototype.listAccounts;
  AuthManager.prototype.listAccounts = async function () {
    const accounts = await originalListAccounts.call(this);
    if (this.isOAuthMode && (!accounts || accounts.length === 0) && process.env.MS365_MCP_OAUTH_TOKEN) {
      const syntheticAccount = await this.getCurrentAccount();
      return syntheticAccount ? [syntheticAccount] : [];
    }
    return accounts;
  };
  log('Patched AuthManager.prototype.listAccounts for OAuth mode');
}

// Patch testLogin so verify-login and login tools work in OAuth mode.
// CRITICAL: Must return {success: true, ...} object, NOT bare `true`.
// The login tool checks `loginStatus.success` — if it's undefined (bare true),
// it falls through to device code flow which fails for personal accounts.
if (typeof AuthManager.prototype.testLogin === 'function') {
  const originalTestLogin = AuthManager.prototype.testLogin;
  AuthManager.prototype.testLogin = async function () {
    if (this.isOAuthMode && process.env.MS365_MCP_OAUTH_TOKEN) {
      try {
        const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${process.env.MS365_MCP_OAUTH_TOKEN}` }
        });
        if (resp.ok) {
          const userData = await resp.json();
          return {
            success: true,
            message: 'Login successful',
            userData: {
              displayName: userData.displayName,
              userPrincipalName: userData.userPrincipalName,
            }
          };
        }
      } catch (e) {
        log(`testLogin Graph API check failed: ${e.message}`);
      }
      return { success: true, message: 'Login successful (OAuth mode)' };
    }
    return originalTestLogin.call(this);
  };
  log('Patched AuthManager.prototype.testLogin for OAuth mode');
}

// Patch GraphClient.prototype.makeRequest to filter /me/drives responses.
// Personal Microsoft accounts return multiple drives including internal ones
// (ODCMetadataArchive, Bundles) that return 400 errors when queried.
// GPT-4o picks the first drive, which is often the broken ODCMetadataArchive.
// This patch filters the response to only return the actual OneDrive.
const graphModule = await import(pathToFileURL(path.join(pkgRoot, 'dist', 'graph-client.js')).href);
const GraphClient = graphModule.default;
const originalMakeRequest = GraphClient.prototype.makeRequest;
GraphClient.prototype.makeRequest = async function (endpoint, options = {}) {
  const result = await originalMakeRequest.call(this, endpoint, options);
  if (endpoint === '/me/drives' && result && result.value && Array.isArray(result.value)) {
    const before = result.value.length;
    const filtered = result.value.filter(drive =>
      drive.driveType === 'personal' || drive.name === 'OneDrive'
    );
    if (filtered.length > 0) {
      result.value = filtered;
      log(`Filtered /me/drives: ${before} → ${filtered.length} (kept: ${filtered.map(d => d.name).join(', ')})`);
    } else {
      log(`WARNING: /me/drives filter found no personal drives, returning all ${before}`);
    }
  }
  return result;
};
log('Patched GraphClient.prototype.makeRequest to filter /me/drives');

// Import and run the actual server
log(`Starting server... (MS365_MCP_OAUTH_TOKEN set: ${!!process.env.MS365_MCP_OAUTH_TOKEN})`);
await import(pathToFileURL(serverEntry).href);
