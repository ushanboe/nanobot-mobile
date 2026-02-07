#!/usr/bin/env node
/**
 * MS365 Token Setup - performs device code login and outputs token cache JSON
 *
 * Prerequisites:
 *   npm install @azure/msal-node
 *
 * Usage:
 *   node setup-ms365-token.js
 *
 * Environment variables (or edit values below):
 *   MS365_MCP_CLIENT_ID     - Azure AD app client ID
 *   MS365_MCP_CLIENT_SECRET - Azure AD client secret
 *   MS365_MCP_TENANT_ID     - Azure AD tenant ID (default: "common")
 */

const { PublicClientApplication } = require('@azure/msal-node');

const CLIENT_ID = process.env.MS365_MCP_CLIENT_ID || '';
const TENANT_ID = process.env.MS365_MCP_TENANT_ID || 'common';

if (!CLIENT_ID) {
  console.error('Error: MS365_MCP_CLIENT_ID environment variable is required.');
  console.error('');
  console.error('Usage:');
  console.error('  MS365_MCP_CLIENT_ID=your-client-id node setup-ms365-token.js');
  process.exit(1);
}

const SCOPES = [
  'User.Read',
  'Mail.Read',
  'Mail.Send',
  'Files.Read',
  'Files.ReadWrite',
  'offline_access',
];

async function main() {
  const msalConfig = {
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    },
  };

  const pca = new PublicClientApplication(msalConfig);

  console.log('\n=== MS365 Device Code Login ===\n');

  const response = await pca.acquireTokenByDeviceCode({
    scopes: SCOPES,
    deviceCodeCallback: (deviceCodeResponse) => {
      console.log(deviceCodeResponse.message);
      console.log('');
    },
  });

  console.log('\n=== SUCCESS ===\n');
  console.log(`Logged in as: ${response.account.username}`);
  console.log('');

  // Serialize the MSAL token cache
  const cacheData = pca.getTokenCache().serialize();
  const selectedAccount = JSON.stringify({
    homeAccountId: response.account.homeAccountId,
    environment: response.account.environment,
    username: response.account.username,
  });

  console.log('Set these as Railway environment variables:\n');

  console.log('--- MS365_TOKEN_CACHE_JSON ---');
  console.log(cacheData);
  console.log('');

  console.log('--- MS365_SELECTED_ACCOUNT_JSON ---');
  console.log(selectedAccount);
  console.log('');
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
