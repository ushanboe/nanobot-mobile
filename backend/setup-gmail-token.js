#!/usr/bin/env node
/**
 * Gmail OAuth Token Setup Script
 *
 * Run this locally to obtain Gmail OAuth credentials for the nanobot backend.
 * Prerequisites: Download your OAuth keys from Google Cloud Console first.
 *
 * Usage:
 *   1. Go to Google Cloud Console > APIs & Services > Credentials
 *   2. Create OAuth 2.0 Client ID (type: Desktop application)
 *   3. Download the JSON file and save as gcp-oauth.keys.json in this directory
 *   4. Run: node setup-gmail-token.js
 *   5. A browser window will open for Google OAuth consent
 *   6. After granting access, the script outputs the credentials JSON
 *   7. Copy the output and set it as GMAIL_CREDENTIALS_JSON in Railway env vars
 *   8. Also set GMAIL_OAUTH_KEYS_JSON to the contents of gcp-oauth.keys.json
 */

const fs = require('fs');
const http = require('http');
const { URL } = require('url');
const path = require('path');

const KEYS_FILE = path.join(__dirname, 'gcp-oauth.keys.json');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];
const REDIRECT_PORT = 3456;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

async function main() {
  // Load OAuth keys
  if (!fs.existsSync(KEYS_FILE)) {
    console.error('Error: gcp-oauth.keys.json not found in this directory.');
    console.error('Download it from Google Cloud Console > APIs & Services > Credentials');
    process.exit(1);
  }

  const keysRaw = fs.readFileSync(KEYS_FILE, 'utf8');
  const keys = JSON.parse(keysRaw);
  const clientConfig = keys.installed || keys.web;

  if (!clientConfig) {
    console.error('Error: Invalid OAuth keys file. Expected "installed" or "web" key.');
    process.exit(1);
  }

  const clientId = clientConfig.client_id;
  const clientSecret = clientConfig.client_secret;

  // Build authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('\n=== Gmail OAuth Setup ===\n');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl.toString());
  console.log('\nWaiting for OAuth callback...\n');

  // Start local server to receive the callback
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname === '/oauth2callback') {
        const authCode = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Error: ${error}</h1><p>Please try again.</p>`);
          reject(new Error(`OAuth error: ${error}`));
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Success!</h1><p>You can close this window. Return to the terminal.</p>');
          resolve(authCode);
        }
        server.close();
      }
    });
    server.listen(REDIRECT_PORT);
  });

  // Exchange authorization code for tokens
  console.log('Exchanging authorization code for tokens...\n');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenResponse.json();

  if (tokens.error) {
    console.error('Token exchange failed:', tokens.error_description || tokens.error);
    process.exit(1);
  }

  // Build the credentials object matching what the Gmail MCP server writes internally.
  // The server uses: fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(tokens))
  // So credentials.json must contain the raw token object from Google OAuth.
  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type || 'Bearer',
    expiry_date: tokens.expiry_date || (Date.now() + (tokens.expires_in || 3600) * 1000),
  };

  console.log('=== SUCCESS ===\n');
  console.log('Set these environment variables in Railway:\n');
  console.log('GMAIL_OAUTH_KEYS_JSON:');
  console.log(keysRaw.trim());
  console.log('\nGMAIL_CREDENTIALS_JSON:');
  console.log(JSON.stringify(credentials));
  console.log('\nNote: The access_token expires in ~1 hour but the refresh_token is');
  console.log('long-lived. The Gmail MCP server will auto-refresh using the refresh_token.');
  console.log('\n=== Done! ===');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
