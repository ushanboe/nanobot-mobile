#!/usr/bin/env node
/**
 * Wrapper for @softeria/ms-365-mcp-server that writes the token cache
 * from environment variables BEFORE importing the server.
 *
 * This ensures the cache is at the exact path the server's auth.js expects,
 * because we resolve the path using the same import mechanism (import.meta).
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);

// Resolve the actual server package root using the same resolution as import
let serverEntry;
try {
  serverEntry = require.resolve('@softeria/ms-365-mcp-server');
} catch {
  console.error('[ms365-wrapper] ERROR: Cannot resolve @softeria/ms-365-mcp-server');
  process.exit(1);
}

const pkgRoot = path.resolve(path.dirname(serverEntry), '..');
const cachePath = path.join(pkgRoot, '.token-cache.json');
const accountPath = path.join(pkgRoot, '.selected-account.json');

console.error(`[ms365-wrapper] Server entry: ${serverEntry}`);
console.error(`[ms365-wrapper] Package root: ${pkgRoot}`);
console.error(`[ms365-wrapper] Cache path: ${cachePath}`);

// Write token cache from env var
if (process.env.MS365_TOKEN_CACHE_JSON) {
  fs.writeFileSync(cachePath, process.env.MS365_TOKEN_CACHE_JSON);
  fs.chmodSync(cachePath, 0o600);
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const accounts = Object.keys(data.Account || {}).length;
    const refreshTokens = Object.keys(data.RefreshToken || {}).length;
    console.error(`[ms365-wrapper] Token cache: ${fs.statSync(cachePath).size} bytes, ${accounts} account(s), ${refreshTokens} refresh token(s)`);
  } catch (e) {
    console.error(`[ms365-wrapper] WARNING: Token cache JSON invalid: ${e.message}`);
  }
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

// Import and run the actual server
console.error(`[ms365-wrapper] Starting server...`);
await import(serverEntry);
