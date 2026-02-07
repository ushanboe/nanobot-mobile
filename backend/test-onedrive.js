#!/usr/bin/env node
/**
 * Quick test: refresh token → access token → call Graph API for OneDrive
 * Shows the actual error if OneDrive access fails.
 *
 * Usage:
 *   MS365_MCP_CLIENT_ID=xxx MS365_REFRESH_TOKEN=xxx node test-onedrive.js
 */

const CLIENT_ID = process.env.MS365_MCP_CLIENT_ID;
const REFRESH_TOKEN = process.env.MS365_REFRESH_TOKEN;
const TENANT = process.env.MS365_MCP_TENANT_ID || 'consumers';

if (!CLIENT_ID || !REFRESH_TOKEN) {
  console.error('Usage: MS365_MCP_CLIENT_ID=xxx MS365_REFRESH_TOKEN=xxx node test-onedrive.js');
  process.exit(1);
}

async function main() {
  // Step 1: Get access token
  console.log('=== Step 1: Refreshing access token ===');
  const tokenResp = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: REFRESH_TOKEN,
      scope: 'User.Read Mail.Read Mail.Send Files.Read Files.ReadWrite offline_access',
    }).toString(),
  });

  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) {
    console.error('Token refresh FAILED:', JSON.stringify(tokenData, null, 2));
    process.exit(1);
  }
  console.log(`Access token: ${tokenData.access_token.length} chars`);
  console.log(`Scopes granted: ${tokenData.scope}`);
  console.log('');

  const headers = { Authorization: `Bearer ${tokenData.access_token}` };

  // Step 2: Get user profile
  console.log('=== Step 2: GET /me (user profile) ===');
  const meResp = await fetch('https://graph.microsoft.com/v1.0/me', { headers });
  const meData = await meResp.json();
  console.log(`Status: ${meResp.status}`);
  console.log(JSON.stringify(meData, null, 2));
  console.log('');

  // Step 3: Get OneDrive root
  console.log('=== Step 3: GET /me/drive (OneDrive info) ===');
  const driveResp = await fetch('https://graph.microsoft.com/v1.0/me/drive', { headers });
  const driveData = await driveResp.json();
  console.log(`Status: ${driveResp.status}`);
  console.log(JSON.stringify(driveData, null, 2));
  console.log('');

  // Step 4: List root files
  console.log('=== Step 4: GET /me/drive/root/children (list files) ===');
  const filesResp = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children?$top=5&$select=name,size,folder', { headers });
  const filesData = await filesResp.json();
  console.log(`Status: ${filesResp.status}`);
  console.log(JSON.stringify(filesData, null, 2));
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
