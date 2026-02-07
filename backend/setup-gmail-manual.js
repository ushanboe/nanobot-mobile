#!/usr/bin/env node
/**
 * Gmail OAuth Manual Setup - works even when localhost redirect fails
 *
 * Usage:
 *   node setup-gmail-manual.js              # prints auth URL
 *   node setup-gmail-manual.js <code>       # exchanges code for tokens
 */

const fs = require('fs');
const path = require('path');

const KEYS_FILE = path.join(__dirname, 'gcp-oauth.keys.json');

async function main() {
  if (!fs.existsSync(KEYS_FILE)) {
    console.error('Error: gcp-oauth.keys.json not found.');
    process.exit(1);
  }

  const keysRaw = fs.readFileSync(KEYS_FILE, 'utf8');
  const keys = JSON.parse(keysRaw);
  const clientConfig = keys.installed || keys.web;

  if (!clientConfig) {
    console.error('Error: Invalid OAuth keys file.');
    process.exit(1);
  }

  const clientId = clientConfig.client_id;
  const clientSecret = clientConfig.client_secret;
  const redirectUri = 'http://localhost:3456/oauth2callback';

  const code = process.argv[2];

  if (!code) {
    // Step 1: Print the auth URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ].join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    console.log('\n=== Gmail OAuth Setup (Manual) ===\n');
    console.log('1. Open this URL in your browser:\n');
    console.log(authUrl.toString());
    console.log('\n2. Grant access. The browser will redirect to localhost (page may not load).');
    console.log('\n3. Copy the FULL URL from your browser address bar.');
    console.log('   It looks like: http://localhost:3456/oauth2callback?code=4/0AXXXXXX&scope=...');
    console.log('\n4. Run this command with the code value:\n');
    console.log('   node setup-gmail-manual.js "PASTE_THE_CODE_HERE"\n');
    return;
  }

  // Step 2: Exchange code for tokens
  console.log('Exchanging authorization code for tokens...\n');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenResponse.json();

  if (tokens.error) {
    console.error('Token exchange failed:', tokens.error_description || tokens.error);
    console.error('\nIf the code expired, go back to step 1 and try again.');
    process.exit(1);
  }

  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type || 'Bearer',
    expiry_date: tokens.expiry_date || (Date.now() + (tokens.expires_in || 3600) * 1000),
  };

  console.log('=== SUCCESS ===\n');
  console.log('Set this as GMAIL_CREDENTIALS_JSON in Railway:\n');
  console.log(JSON.stringify(credentials));
  console.log('\n');
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
