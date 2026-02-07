#!/usr/bin/env node
/**
 * Wrapper for @softeria/ms-365-mcp-server that writes the token cache
 * from environment variables BEFORE importing the server.
 *
 * Receives the package root via MS365_PKG_ROOT env var (set by entrypoint.sh)
 * to avoid require.resolve / NODE_PATH issues in child processes.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Get package root from env var (set by entrypoint.sh) or try known global path
const pkgRoot = process.env.MS365_PKG_ROOT || '/usr/local/lib/node_modules/@softeria/ms-365-mcp-server';
const serverEntry = path.join(pkgRoot, 'dist', 'index.js');
const cachePath = path.join(pkgRoot, '.token-cache.json');
const accountPath = path.join(pkgRoot, '.selected-account.json');

console.error(`[ms365-wrapper] Package root: ${pkgRoot}`);
console.error(`[ms365-wrapper] Server entry: ${serverEntry}`);
console.error(`[ms365-wrapper] Cache path: ${cachePath}`);

// Verify server entry exists
if (!fs.existsSync(serverEntry)) {
  console.error(`[ms365-wrapper] ERROR: Server entry not found at ${serverEntry}`);
  console.error(`[ms365-wrapper] Package root contents: ${JSON.stringify(fs.existsSync(pkgRoot) ? fs.readdirSync(pkgRoot) : 'DIR NOT FOUND')}`);
  process.exit(1);
}

// Write token cache from env var
if (process.env.MS365_TOKEN_CACHE_JSON) {
  fs.writeFileSync(cachePath, process.env.MS365_TOKEN_CACHE_JSON);
  fs.chmodSync(cachePath, 0o600);
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const accounts = Object.keys(data.Account || {}).length;
    const refreshTokens = Object.keys(data.RefreshToken || {}).length;
    console.error(`[ms365-wrapper] Token cache written: ${fs.statSync(cachePath).size} bytes, ${accounts} account(s), ${refreshTokens} refresh token(s)`);
  } catch (e) {
    console.error(`[ms365-wrapper] WARNING: Token cache JSON invalid: ${e.message}`);
  }
} else {
  console.error(`[ms365-wrapper] WARNING: MS365_TOKEN_CACHE_JSON not set`);
}

// Write selected account from env var
if (process.env.MS365_SELECTED_ACCOUNT_JSON) {
  try {
    const d = JSON.parse(process.env.MS365_SELECTED_ACCOUNT_JSON);
    const formatted = JSON.stringify({ accountId: d.accountId || d.homeAccountId });
    fs.writeFileSync(accountPath, formatted);
    fs.chmodSync(accountPath, 0o600);
    console.error(`[ms365-wrapper] Selected account: ${formatted}`);
  } catch (e) {
    console.error(`[ms365-wrapper] WARNING: Selected account write failed: ${e.message}`);
  }
}

// Import and run the actual server using file:// URL (required for ESM imports)
console.error(`[ms365-wrapper] Starting server...`);
await import(pathToFileURL(serverEntry).href);
