#!/usr/bin/env node
/**
 * Wrapper for @softeria/ms-365-mcp-server that:
 * 1. Writes the token cache from env vars
 * 2. Acquires a fresh access token using MSAL
 * 3. Sets MS365_MCP_OAUTH_TOKEN so the server uses it directly
 * 4. Periodically refreshes the token before it expires
 * 5. Imports and runs the actual server
 *
 * Receives the package root via MS365_PKG_ROOT env var (set by entrypoint.sh).
 *
 * IMPORTANT: ESM import() does NOT respect NODE_PATH, so we use createRequire
 * (CJS resolution) to load @azure/msal-node from global node_modules.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

// createRequire with NODE_PATH can resolve globally installed packages
const require = createRequire(import.meta.url);

const pkgRoot = process.env.MS365_PKG_ROOT || '/usr/local/lib/node_modules/@softeria/ms-365-mcp-server';
const serverEntry = path.join(pkgRoot, 'dist', 'index.js');
const cachePath = path.join(pkgRoot, '.token-cache.json');
const accountPath = path.join(pkgRoot, '.selected-account.json');

console.error(`[ms365-wrapper] Package root: ${pkgRoot}`);
console.error(`[ms365-wrapper] Server entry: ${serverEntry}`);
console.error(`[ms365-wrapper] NODE_PATH: ${process.env.NODE_PATH || '(not set)'}`);

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

// Attempt to acquire a fresh access token and inject it via MS365_MCP_OAUTH_TOKEN
// This bypasses the server's own loadTokenCache/getToken which may have issues
if (process.env.MS365_TOKEN_CACHE_JSON && process.env.MS365_MCP_CLIENT_ID) {
  try {
    // Use createRequire (CJS) to load MSAL — ESM import() doesn't check NODE_PATH
    let PublicClientApplication;
    try {
      ({ PublicClientApplication } = require('@azure/msal-node'));
      console.error(`[ms365-wrapper] Loaded @azure/msal-node via CJS require`);
    } catch (e1) {
      console.error(`[ms365-wrapper] CJS require failed: ${e1.message}`);
      // Fallback: try loading from the ms365 package's own node_modules
      const msalDir = path.join(pkgRoot, 'node_modules', '@azure', 'msal-node');
      console.error(`[ms365-wrapper] Trying fallback: ${msalDir}`);
      ({ PublicClientApplication } = require(msalDir));
      console.error(`[ms365-wrapper] Loaded @azure/msal-node from package node_modules`);
    }

    const pca = new PublicClientApplication({
      auth: {
        clientId: process.env.MS365_MCP_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.MS365_MCP_TENANT_ID || 'common'}`,
      },
    });

    // Deserialize the token cache
    const cacheData = fs.readFileSync(cachePath, 'utf8');
    pca.getTokenCache().deserialize(cacheData);

    const accounts = await pca.getTokenCache().getAllAccounts();
    console.error(`[ms365-wrapper] MSAL accounts after deserialize: ${accounts.length}`);

    if (accounts.length > 0) {
      // Find the right account (matching selected account or first)
      let account = accounts[0];
      if (process.env.MS365_SELECTED_ACCOUNT_JSON) {
        try {
          const sel = JSON.parse(process.env.MS365_SELECTED_ACCOUNT_JSON);
          const selId = sel.accountId || sel.homeAccountId;
          const found = accounts.find(a => a.homeAccountId === selId);
          if (found) account = found;
        } catch {}
      }
      console.error(`[ms365-wrapper] Using account: ${account.username}`);

      // Use the same scopes that setup-ms365-token.js consented to
      const scopes = ['User.Read', 'Mail.Read', 'Mail.Send', 'Files.Read', 'Files.ReadWrite'];

      try {
        const result = await pca.acquireTokenSilent({ account, scopes });
        process.env.MS365_MCP_OAUTH_TOKEN = result.accessToken;
        console.error(`[ms365-wrapper] Got fresh token, expires: ${result.expiresOn}`);
        console.error(`[ms365-wrapper] Token length: ${result.accessToken.length}`);

        // Save updated cache (may have new access/refresh tokens)
        const updatedCache = pca.getTokenCache().serialize();
        fs.writeFileSync(cachePath, updatedCache);
        console.error(`[ms365-wrapper] Updated token cache saved`);

        // Schedule token refresh every 45 minutes (tokens last ~60 min)
        setInterval(async () => {
          try {
            const r = await pca.acquireTokenSilent({ account, scopes, forceRefresh: true });
            process.env.MS365_MCP_OAUTH_TOKEN = r.accessToken;
            fs.writeFileSync(cachePath, pca.getTokenCache().serialize());
            console.error(`[ms365-wrapper] Token refreshed, expires: ${r.expiresOn}`);
          } catch (e) {
            console.error(`[ms365-wrapper] Token refresh failed: ${e.message}`);
          }
        }, 45 * 60 * 1000);
      } catch (e) {
        console.error(`[ms365-wrapper] acquireTokenSilent failed: ${e.message}`);
        console.error(`[ms365-wrapper] Will fall back to server's own auth flow`);
      }
    } else {
      console.error(`[ms365-wrapper] No accounts in cache — checking cache structure:`);
      try {
        const parsed = JSON.parse(cacheData);
        console.error(`[ms365-wrapper] Cache keys: ${Object.keys(parsed).join(', ')}`);
        for (const [section, entries] of Object.entries(parsed)) {
          if (typeof entries === 'object' && entries !== null) {
            console.error(`[ms365-wrapper]   ${section}: ${Object.keys(entries).length} entries`);
          }
        }
      } catch {}
    }
  } catch (e) {
    console.error(`[ms365-wrapper] Token pre-acquisition failed: ${e.message}`);
    console.error(`[ms365-wrapper] Stack: ${e.stack}`);
  }
}

// Import and run the actual server
console.error(`[ms365-wrapper] Starting server...`);
await import(pathToFileURL(serverEntry).href);
