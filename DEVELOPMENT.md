# Nanobot Mobile - Development Documentation

## Project Overview

**Nanobot Mobile** is a React Native mobile application that provides a chat interface to interact with [nanobot](https://github.com/nanobot-ai/nanobot), a lightweight (~4000 lines of code) AI agent platform. The project consists of two main components:

1. **Backend**: Nanobot server deployed on Railway
2. **Mobile App**: React Native/Expo application with tab-based navigation

### Why Nanobot?

Nanobot was chosen over heavier alternatives (like OpenClaw with 4M+ lines) because:
- Lightweight and maintainable codebase
- Built-in MCP (Model Context Protocol) support
- Stateful server architecture (requires persistent backend, not serverless)
- Supports multiple AI providers (OpenAI, Anthropic)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MOBILE APP                              │
│                   (React Native/Expo)                        │
│  ┌─────────────────┐      ┌─────────────────┐               │
│  │   Chat Screen   │      │ Settings Screen │               │
│  │   (index.tsx)   │      │ (settings.tsx)  │               │
│  └────────┬────────┘      └────────┬────────┘               │
│           │                        │                         │
│           └────────────┬───────────┘                         │
│                        │                                     │
│              ┌─────────▼─────────┐                           │
│              │  Zustand Store    │                           │
│              │  + MCPClient      │                           │
│              │  + SecureStore    │                           │
│              └───────────────────┘                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ HTTP/JSON-RPC 2.0
                          │ (MCP Protocol)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    RAILWAY BACKEND                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    Nanobot Server                    │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │ MCP Server  │  │   Agents    │  │    Tools    │  │    │
│  │  │  /mcp/ui    │  │ (assistant) │  │   (chat)    │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  └──────────────────────────┬──────────────────────────┘    │
│                              │                               │
│              ┌───────────────┼───────────────┐               │
│              ▼               ▼               ▼               │
│  ┌──────────────────┐ ┌───────────┐ ┌──────────────────┐    │
│  │ AI Provider API  │ │ Remote    │ │ Local MCP Srvrs  │    │
│  │ (OpenAI/Claude)  │ │ MCP Srvrs │ │ (stdio subprocs) │    │
│  │                  │ │ (Search,  │ │ ┌──────────────┐ │    │
│  │                  │ │  Fetch,   │ │ │ Gmail MCP    │ │    │
│  │                  │ │  Think,   │ │ │ MS365 MCP    │ │    │
│  │                  │ │  DeepWiki)│ │ │ (email,drive)│ │    │
│  └──────────────────┘ └───────────┘ │ └──────────────┘ │    │
│                                     └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
nanobot-mobile/
├── backend/                    # Backend deployment files
│   ├── Dockerfile              # Docker build for Railway (includes Node.js + MCP packages)
│   ├── entrypoint.sh           # Startup script (writes OAuth creds from env vars)
│   ├── nanobot.yaml            # Nanobot configuration (agents + MCP servers)
│   ├── setup-gmail-token.js    # Local helper: auto-redirect OAuth flow (needs localhost)
│   ├── setup-gmail-manual.js   # Local helper: manual code-paste OAuth flow (WSL-friendly)
│   ├── setup-ms365-token.js    # Local helper: MS365 device code login + token cache export
│   ├── .env.example            # Environment variable template
│   └── railway.toml            # Railway deployment config (only config file - no railway.json)
│
├── mobile/                     # React Native Expo app
│   ├── android/                # Native Android project (prebuild)
│   │   ├── app/                # Android app module
│   │   ├── build.gradle        # Root Gradle config
│   │   ├── settings.gradle     # Gradle settings
│   │   └── gradle/             # Gradle wrapper
│   │
│   ├── app/                    # Expo Router screens
│   │   ├── _layout.tsx         # Root layout (renders Slot)
│   │   └── (tabs)/             # Tab navigation group
│   │       ├── _layout.tsx     # Tab navigator config
│   │       ├── index.tsx       # Chat screen
│   │       └── settings.tsx    # Settings screen
│   │
│   ├── components/             # Reusable components
│   │   └── ChatInput.tsx       # Chat input with image attachments
│   │
│   ├── constants/              # App constants
│   │   └── theme.ts            # Colors, spacing, font sizes (light/dark)
│   │
│   ├── contexts/               # React contexts (deprecated)
│   │   └── SettingsContext.tsx  # Original context (replaced by Zustand)
│   │
│   ├── services/               # API clients
│   │   └── mcpClient.ts        # MCP protocol client (JSON-RPC 2.0)
│   │
│   ├── store/                  # State management
│   │   └── chatStore.ts        # Zustand store (connection, threads, messages)
│   │
│   ├── types/                  # TypeScript type definitions
│   │   └── mcp.ts              # MCP protocol types
│   │
│   ├── utils/                  # Utility functions
│   │   └── settings.ts         # AsyncStorage settings helper (legacy)
│   │
│   ├── assets/                 # Images, icons, splash screen
│   ├── app.json                # Expo configuration
│   ├── eas.json                # EAS Build profiles
│   ├── babel.config.js         # Babel config (+ reanimated plugin)
│   ├── metro.config.js         # Metro bundler config
│   ├── tsconfig.json           # TypeScript config (with @/* path alias)
│   └── package.json            # Dependencies & scripts
│
└── DEVELOPMENT.md              # This documentation
```

---

## Backend Setup (Railway)

### Deployment Configuration

**Dockerfile** (`backend/Dockerfile`):
```dockerfile
FROM golang:1.25-alpine AS builder
RUN apk add --no-cache git nodejs npm
WORKDIR /app
# Pinned to v0.0.55 — has chat-with-* multi-tool support, 10MB bufio buffer, --config flag
RUN git clone --branch v0.0.55 --depth 1 https://github.com/nanobot-ai/nanobot.git .

# Patch: increase bufio scanner buffer in LLM SSE readers (upstream bug — default 64KB overflows)
# The 10MB buffer in pkg/mcp/stdio.go only covers MCP stdio; the LLM SSE readers have no override.
# Insert lines.Buffer() call before each "for lines.Scan()" loop in the 3 affected files:
RUN sed -i '/for lines.Scan()/i\\tlines.Buffer(make([]byte, 0, 1024), 10*1024*1024)' \
    pkg/llm/completions/client.go pkg/llm/anthropic/client.go pkg/llm/responses/progress.go

# UI disabled so go generate not needed — .dist placeholder satisfies embed
RUN go build -o nanobot .

FROM alpine:latest
RUN apk add --no-cache ca-certificates nodejs npm
WORKDIR /app
COPY --from=builder /app/nanobot .
COPY nanobot.yaml .
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
RUN npm install -g @gongrzhe/server-gmail-autoauth-mcp @softeria/ms-365-mcp-server
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
```

**Key details**:
- Nanobot pinned to **v0.0.55** (see Version Notes below for why)
- **Bufio patch**: 3 LLM SSE reader files have their `bufio.Scanner` buffer increased from 64KB to 10MB. Without this, long AI responses cause `bufio.Scanner: token too long` errors. The patch uses `sed` to insert `lines.Buffer()` before each `for lines.Scan()` loop.
- Production image includes `nodejs npm` for running MCP server subprocesses
- Gmail and MS365 MCP packages are pre-installed globally via `npm install -g`
- `entrypoint.sh` dynamically generates `nanobot.yaml` based on available credentials
- `entrypoint.sh` writes Gmail OAuth credentials to `/root/.gmail-mcp/` using `printf` (not `echo`, to avoid JSON mangling)
- `entrypoint.sh` exports `HOME=/root` explicitly for Gmail MCP server's `os.homedir()` resolution
- `--disable-ui` flag prevents nanobot from starting its built-in web UI
- `--config ./nanobot.yaml` must use `./` prefix (required since v0.0.51)
- **Only `railway.toml` is used** for Railway config. Do NOT add `railway.json` — it conflicts with the Dockerfile ENTRYPOINT (its `startCommand` overrides Docker's entrypoint, and `healthcheckPath` points to a non-existent endpoint)

**Nanobot Version Notes**:
| Version | Tool Name | `--config` | Bufio Buffer | Built-in Agents | Notes |
|---------|-----------|------------|--------------|-----------------|-------|
| v0.0.50 | `chat` (single tool) | Not supported | 64KB default | None | Too old — only 1 tool |
| v0.0.51+ | `chat-with-assistant` | Supported | 10MB | executor, explorer, planner | Multi-tool support |
| v0.0.53 | `chat-with-assistant` | Supported | 10MB | + explorer agent added | Added MCP server search |
| v0.0.55 | `chat-with-assistant` | Supported | 10MB | executor, general-chat, planner | **Current — stable** |

The app dynamically discovers tool names via `tools/list` and uses `availableTools[0]` so it works with any version.

**Railway Configuration** (`backend/railway.toml`):
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Nanobot Agent Configuration** (`backend/nanobot.yaml`):

Note: The static `nanobot.yaml` in the repo contains the full config, but at runtime `entrypoint.sh` **dynamically regenerates** it based on which OAuth credentials are set. If Gmail creds are missing, the gmail MCP server is excluded (preventing startup crashes). Same for MS365.

```yaml
# This is the STATIC config — entrypoint.sh overwrites it at runtime
agents:
  assistant:
    model: gpt-4o
    instructions: |
      You are a helpful AI assistant with access to powerful tools.
      ...
    mcpServers:
      - search
      - fetch
      - thinking
      - deepwiki
      - gmail        # Only included if GMAIL_OAUTH_KEYS_JSON is set
      - microsoft365  # Only included if MS365_MCP_CLIENT_ID is set

mcpServers:
  search:
    url: https://mcp.exa.ai/mcp
  fetch:
    url: https://remote.mcpservers.org/fetch/mcp
  thinking:
    url: https://remote.mcpservers.org/sequentialthinking/mcp
  deepwiki:
    url: https://mcp.deepwiki.com/mcp
  gmail:
    command: npx
    args: ["@gongrzhe/server-gmail-autoauth-mcp"]
  microsoft365:
    command: npx
    args: ["-y", "@softeria/ms-365-mcp-server"]
```

**Dynamic config generation** (`entrypoint.sh`):
- Exports `HOME=/root` so the Gmail MCP server's `os.homedir()` resolves correctly
- **Injects today's date** (`$(date -u +"%Y-%m-%d")`) into AI instructions so GPT-4o knows the current date for relative queries like "yesterday's emails"
- Checks `GMAIL_OAUTH_KEYS_JSON` + `GMAIL_CREDENTIALS_JSON` — if both set:
  - Writes OAuth keys to `/root/.gmail-mcp/gcp-oauth.keys.json`
  - Writes token credentials to `/root/.gmail-mcp/credentials.json`
  - Uses `printf '%s'` (not `echo`) to avoid mangling JSON special characters
  - Validates that `refresh_token` is present in the credentials (logs warning if missing)
  - Includes gmail MCP server in generated config
- Checks `MS365_MCP_CLIENT_ID` + `MS365_MCP_CLIENT_SECRET` — if both set:
  - Includes microsoft365 MCP server in generated config
  - **Pre-seeds MS365 token cache** from `MS365_TOKEN_CACHE_JSON` env var (avoids device code login on every deploy):
    - Finds the `@softeria/ms-365-mcp-server` package root via `npm root -g`
    - Writes token cache to `<package-root>/.token-cache.json`
    - Validates the JSON is parseable
  - **Pre-seeds selected account** from `MS365_SELECTED_ACCOUNT_JSON` env var:
    - Transforms format if needed: server expects `{"accountId":"..."}` not `{"homeAccountId":"..."}`
    - Writes to `<package-root>/.selected-account.json`
  - Logs diagnostic info: npm root path, package dir existence, file sizes, JSON validity
- **Email service routing**: When both Gmail and MS365 are configured, the AI is explicitly instructed to ONLY use Gmail tools for Gmail requests and ONLY use MS365 tools for Outlook/Microsoft requests — never falling back from one to the other
- Generates `nanobot.yaml` with only the available servers, preventing "failed to build tool mappings" crashes
- Logs file sizes and credential validation results for debugging

**Gmail MCP server internal flow** (`@gongrzhe/server-gmail-autoauth-mcp` v1.1.11):
1. Reads `~/.gmail-mcp/gcp-oauth.keys.json` — extracts `installed.client_id` and `installed.client_secret`
2. Creates `OAuth2Client(client_id, client_secret, "http://localhost:3000/oauth2callback")`
3. If `~/.gmail-mcp/credentials.json` exists, reads it and calls `oauth2Client.setCredentials(credentials)`
4. Creates Gmail API with the oauth2Client — does NOT validate credentials on startup
5. When a tool is called, the Google auth library auto-refreshes the access_token using the refresh_token
6. If refresh fails (invalid/expired token), the tool returns an auth error — the AI then tells the user to log in
7. The `authenticate()` function (browser-based re-auth) is only triggered if the `auth` CLI argument is passed — it is NOT called during normal MCP server operation

### MCP Servers

The assistant has access to up to 6 MCP servers — 4 remote (URL-based, always available) and 2 local (stdio subprocesses, require OAuth credentials):

| Server | Type | What it does |
|--------|------|--------------|
| **Exa Search** | Remote | Web search — look up current events, latest docs |
| **Fetch** | Remote | URL fetching — reads and summarizes web pages |
| **Sequential Thinking** | Remote | Step-by-step reasoning for complex problems |
| **DeepWiki** | Remote | GitHub docs lookup for any project |
| **Gmail** | Local (stdio) | Gmail email — search, read, send emails |
| **Microsoft 365** | Local (stdio) | Outlook email + OneDrive files — search, read, download |

Remote servers are free and require no API keys. Local servers (Gmail, MS365) run as Node.js subprocesses inside the Docker container and require OAuth credentials (see OAuth Setup below).

**Good test prompts:**
- Search: *"What happened in the news today?"*
- Fetch: *"Summarize this page: https://github.com/nanobot-ai/nanobot"*
- Thinking: *"How would I design a login system? Think step by step."*
- DeepWiki: *"Tell me about the nanobot-ai/nanobot project on GitHub"*

### Supported Models

- OpenAI: `gpt-4o`, `gpt-4`, `gpt-3.5-turbo`
- Anthropic: `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`

### Environment Variables (Railway Dashboard)

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `OPENAI_API_KEY` | OpenAI API key (required for gpt-4o) | [platform.openai.com](https://platform.openai.com/) |
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude models) | [console.anthropic.com](https://console.anthropic.com/) |
| `GMAIL_OAUTH_KEYS_JSON` | Gmail OAuth **client keys** (the `{"installed":{...}}` JSON) | Download from Google Cloud Console > Credentials |
| `GMAIL_CREDENTIALS_JSON` | Gmail OAuth **tokens** (must have `refresh_token`!) | Run `node setup-gmail-manual.js` locally (see below) |
| `MS365_MCP_CLIENT_ID` | Azure app client ID | Azure Portal > App Registrations |
| `MS365_MCP_CLIENT_SECRET` | Azure app client secret | Azure Portal > Certificates & secrets |
| `MS365_MCP_TENANT_ID` | Azure tenant ID (use `common` for personal accounts) | Azure Portal > App Registrations > Overview |
| `MS365_TOKEN_CACHE_JSON` | MSAL token cache (avoids device code on redeploy) | Run `node setup-ms365-token.js` locally (see below) |
| `MS365_SELECTED_ACCOUNT_JSON` | Selected account for auto-login | Run `node setup-ms365-token.js` locally (see below) |

**CRITICAL: `GMAIL_CREDENTIALS_JSON` format**

This is the most common source of Gmail auth failures. It must be a **raw token object** from a completed OAuth browser flow, NOT the Google Cloud Console download:

```
CORRECT:   {"access_token":"ya29.xxx","refresh_token":"1//xxx","scope":"...","token_type":"Bearer","expiry_date":1770428316567}
WRONG:     {"installed":{"client_id":"xxx","client_secret":"xxx",...}}    <-- this is the KEYS file
WRONG:     {"type":"authorized_user","client_id":"xxx","refresh_token":"xxx"}  <-- old format
```

The `refresh_token` field is essential. Without it, the Gmail MCP server cannot authenticate in the headless Docker container. The `access_token` expires in ~1 hour but the server auto-refreshes it using the `refresh_token`.

### OAuth Setup

#### Gmail Setup

**Step 1: Create Google Cloud OAuth credentials**

1. Go to [Google Cloud Console](https://console.cloud.google.com/) > Create new project (or select existing)
2. Enable the **Gmail API** under APIs & Services > Library
3. Configure the **OAuth consent screen** (External type, add your Gmail as a test user)
4. Go to **Credentials** > Create **OAuth 2.0 Client ID** (type: **Desktop application**)
5. Download the JSON file > save as `gcp-oauth.keys.json` in `backend/`
6. Set `GMAIL_OAUTH_KEYS_JSON` in Railway to the contents of this file

**Step 2: Generate OAuth tokens (requires browser)**

Two scripts are available:

**Option A: Manual flow** (recommended, works in WSL):
```bash
cd backend
node setup-gmail-manual.js
# 1. Opens prints a URL — open it in your browser
# 2. Grant Gmail access on Google's consent screen
# 3. Browser redirects to localhost (page may not load — that's OK)
# 4. Copy the FULL URL from browser address bar
# 5. Extract the code= parameter value
# 6. Run: node setup-gmail-manual.js "PASTE_CODE_HERE"
# 7. Script outputs the token JSON
```

**Option B: Auto-redirect flow** (needs localhost accessible from browser):
```bash
cd backend
node setup-gmail-token.js
# Opens browser automatically, captures callback on localhost:3456
```

**Step 3: Set the token in Railway**

Copy the token JSON output from the script and set it as `GMAIL_CREDENTIALS_JSON` in Railway.

**Important notes:**
- The OAuth consent screen must be in "Testing" mode with your Gmail added as a test user, OR published for production
- In Testing mode, refresh tokens expire after **7 days** — you'll need to re-run the setup script
- To avoid the 7-day limit, publish the OAuth consent screen (requires Google verification for public apps, but "Internal" type for Google Workspace has no limit)
- The `refresh_token` is only returned on the FIRST authorization, or when `prompt=consent` is used (our scripts use this)

#### Microsoft 365 Setup (Outlook + OneDrive)

**Step 1: Create Azure AD app registration**

1. Go to [Azure Portal](https://portal.azure.com/) > **App Registrations** > **New registration**
   - Name: anything (e.g., "nanobot-mobile")
   - Supported account types: **Personal Microsoft accounts only** (or "Accounts in any organizational directory and personal Microsoft accounts" for both)
   - Redirect URI: leave blank for now
2. Note the **Application (client) ID** and **Directory (tenant) ID**

**Step 2: Configure for device code flow (CRITICAL)**

The `@softeria/ms-365-mcp-server` uses **device code flow** which requires specific Azure AD configuration:

3. Go to **Authentication** > **Add a platform** > **Mobile and desktop applications**
   - Check the redirect URI: `https://login.microsoftonline.com/common/oauth2/nativeclient`
   - Save
4. **CRITICAL**: Go to **Manifest** tab > find `"isFallbackPublicClient"` > set to `true` > Save
   - Without this, device code flow fails with: `AADSTS70002: The client application must be marked as 'mobile'`
   - The "Allow public client flows" toggle in Authentication UI doesn't always persist — verify in the raw manifest

**Step 3: Add API permissions**

5. Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**:
   - `User.Read` (basic profile)
   - `Mail.Read`, `Mail.Send` (for Outlook email)
   - `Files.Read`, `Files.ReadWrite` (for OneDrive)
   - `offline_access` (for refresh tokens)
6. **Grant admin consent** (or let user consent on first use)

**Step 4: Create client secret**

7. Go to **Certificates & secrets** > create a new **Client secret** > copy the Value (not the Secret ID)

**Step 5: Set Railway environment variables**

8. Set in Railway:
   - `MS365_MCP_CLIENT_ID` = Application (client) ID
   - `MS365_MCP_CLIENT_SECRET` = Client secret value
   - `MS365_MCP_TENANT_ID` = `common` (use `common` for personal Microsoft accounts like @gmail.com, @outlook.com)

**Step 6: Generate token cache (avoids device code login on every deploy)**

Without this step, users must complete device code login every time Railway redeploys (ephemeral filesystem). The setup script performs a one-time device code login and exports the MSAL token cache:

```bash
cd backend
npm install @azure/msal-node  # One-time dependency
MS365_MCP_CLIENT_ID=your-client-id node setup-ms365-token.js
# 1. Script displays a URL and code
# 2. Open https://microsoft.com/devicelogin in browser
# 3. Enter the code and sign in with your Microsoft account
# 4. Script outputs MS365_TOKEN_CACHE_JSON and MS365_SELECTED_ACCOUNT_JSON
# 5. Set both as Railway environment variables
```

**Important notes:**
- Use **InPrivate/Incognito** browser window for device code login to avoid cached account issues
- If you get `AADSTS50020` (wrong account type), ensure `MS365_MCP_TENANT_ID=common` and app supports personal accounts
- Device codes expire in ~15 minutes — complete login promptly
- Refresh tokens last ~90 days. After expiry, re-run `setup-ms365-token.js`
- The token cache JSON contains `!`, `*`, `$` characters — ensure Railway doesn't shell-expand them (paste via the UI, not CLI)

**MS365 MCP server internals** (`@softeria/ms-365-mcp-server`):
- Always uses `PublicClientApplication` from MSAL (regardless of whether client secret is set)
- Token cache stored at `<npm-global-root>/@softeria/ms-365-mcp-server/.token-cache.json` (file fallback when keytar is unavailable in Docker)
- Selected account stored at `<npm-global-root>/@softeria/ms-365-mcp-server/.selected-account.json`
- Selected account format: `{"accountId": "homeAccountId-value"}` — NOT `{"homeAccountId": "..."}`
- `getToken()` calls `acquireTokenSilent()` which uses the refresh token to get new access tokens
- If token cache is empty (no accounts), throws "No valid token found" — this means pre-seeding failed

### Railway Deployment Steps

1. Create GitHub repository with `backend/` folder
2. Create new Railway project from GitHub
3. Set root directory to `backend` in Railway settings
4. Add environment variables for API keys
5. Deploy - Railway will use Dockerfile automatically

**Production URL**: `https://nanobot-mobile-production.up.railway.app`

---

## Mobile App Setup

### Technology Stack

- **Framework**: React Native with Expo SDK 54
- **Navigation**: Expo Router with file-based routing
- **State Management**: Zustand for chat/connection state
- **Storage**: expo-secure-store for credentials/sessions, AsyncStorage for general settings
- **Styling**: React Native StyleSheet (dark theme) with theme constants
- **Icons**: @expo/vector-icons (Ionicons)
- **Animations**: react-native-reanimated + react-native-gesture-handler
- **Markdown**: react-native-markdown-display for rendering AI responses
- **Streaming**: react-native-sse for server-sent events
- **Image Handling**: expo-image-picker (camera + gallery), expo-file-system (base64 encoding)
- **Haptics**: expo-haptics for tactile feedback

### Key Dependencies

```json
{
  "expo": "^54.0.33",
  "expo-router": "~6.0.23",
  "react": "19.1.0",
  "react-dom": "19.1.0",
  "react-native": "0.81.5",
  "zustand": "^4.4.7",
  "expo-secure-store": "~15.0.8",
  "expo-image-picker": "~17.0.10",
  "expo-file-system": "~19.0.21",
  "expo-haptics": "~15.0.8",
  "expo-av": "~16.0.8",
  "expo-clipboard": "~8.0.8",
  "expo-document-picker": "~14.0.8",
  "react-native-sse": "^1.2.1",
  "react-native-markdown-display": "^7.0.2",
  "react-native-reanimated": "~4.1.1",
  "react-native-gesture-handler": "~2.28.0",
  "react-native-safe-area-context": "~5.6.0",
  "react-native-screens": "~4.16.0",
  "react-native-worklets": "^0.7.2",
  "uuid": "^9.0.1",
  "@react-native-async-storage/async-storage": "^2.2.0",
  "@expo/vector-icons": "^15.0.3"
}
```

**Critical**: `react` and `react-dom` must have identical versions (both 19.1.0).

### Running the App

```bash
cd mobile
npm install --legacy-peer-deps
npx expo start --web        # Web browser
npx expo start              # Expo Go on phone (scan QR)
npx expo run:android        # Run on Android device/emulator
```

---

## Android Build (APK)

### Prerequisites

The native Android project has been generated via `npx expo prebuild`. The `mobile/android/` directory contains the full Gradle build system.

### EAS Build Configuration

**`mobile/eas.json`**:
```json
{
  "cli": {
    "version": ">= 5.9.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview-apk": {
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      }
    },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

### Build Profiles

| Profile | Purpose | Output |
|---------|---------|--------|
| `development` | Dev client with hot reload | Internal distribution |
| `preview` | Testing APK | `.apk` file |
| `preview-apk` | Release APK (explicit assembleRelease) | `.apk` file |
| `production` | Play Store release | `.aab` bundle |

### Build Commands

```bash
# Build release APK locally (requires Android SDK / Android Studio)
cd mobile/android && ./gradlew assembleRelease

# APK output location:
# mobile/android/app/build/outputs/apk/release/app-release.apk

# Copy to Windows desktop (WSL)
cp mobile/android/app/build/outputs/apk/release/app-release.apk /mnt/c/Users/<USER>/Desktop/nanobot.apk

# Build via EAS cloud (requires eas-cli login)
npx eas-cli build --platform android --profile preview-apk
```

### Android App Configuration

Configured in `mobile/app.json`:
- **Package name**: `com.yourcompany.nanobot`
- **Adaptive icon**: `./assets/adaptive-icon.png` with `#1a1a2e` background
- **Keyboard mode**: `softwareKeyboardLayoutMode: "pan"` (sets `windowSoftInputMode="adjustPan"`)
- **Permissions**: Camera, external storage read, microphone

---

## MCP Protocol Communication

### Overview

The app communicates with nanobot using the **Model Context Protocol (MCP)** over HTTP with JSON-RPC 2.0. This is implemented in `mobile/services/mcpClient.ts` as a reusable `MCPClient` class.

### Endpoint

All requests go to: `POST {serverUrl}/mcp/ui`

### Session Management

Sessions are tracked via the `Mcp-Session-Id` header:
- First request: Server returns session ID in response header
- Subsequent requests: Include session ID in request header
- Sessions are persisted in expo-secure-store for reconnection
- On 404 (expired session): Client automatically reconnects

### MCPClient Class

The `MCPClient` (`mobile/services/mcpClient.ts`) provides:

```typescript
class MCPClient {
  connect(): Promise<InitializeResult>       // Initialize MCP connection
  listTools(): Promise<Tool[]>                // List available tools
  callTool(name, args): Promise<CallToolResult>  // Call a tool
  listResources(): Promise<Resource[]>        // List resources
  readResource(uri): Promise<...>             // Read a resource
  listPrompts(): Promise<Prompt[]>            // List prompts/agents
  listAgents(): Promise<Agent[]>              // Get agents
  sendMessage(text, threadId, ...): Promise<CallToolResult>  // Send chat message
  subscribeToThread(threadId, onEvent): () => void  // Stream events (SSE)
  listThreads(): Promise<Thread[]>            // List conversation threads
  getThreadMessages(threadId): Promise<...>   // Get thread messages
  deleteThread(threadId): Promise<void>       // Delete a thread
  createResource(name, data, mimeType): Promise<...>  // Upload file
  disconnect(): Promise<void>                 // Clear session
}
```

Singleton access via `getMCPClient(baseUrl?)` and `resetMCPClient()`.

### Request Flow

#### 1. Initialize Connection

```javascript
const response = await fetch(`${serverUrl}/mcp/ui`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '1',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'nanobot-mobile', version: '1.0.0' }
    }
  })
});

const sessionId = response.headers.get('Mcp-Session-Id');
```

#### 2. List Available Tools

```javascript
const response = await fetch(`${serverUrl}/mcp/ui`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Mcp-Session-Id': sessionId
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '2',
    method: 'tools/list',
    params: {}
  })
});

// Response: { result: { tools: [{ name: 'chat-with-assistant', ... }] } }
```

#### 3. Call a Tool (Send Text Message)

```javascript
const response = await fetch(`${serverUrl}/mcp/ui`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Mcp-Session-Id': sessionId
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now().toString(),
    method: 'tools/call',
    params: {
      name: 'chat-with-assistant',
      arguments: {
        prompt: 'Hello, how are you?'
      }
    }
  })
});

// Response: { result: { content: [{ type: 'text', text: 'I am doing well...' }] } }
```

#### 4. Call a Tool (Send Image Attachment — Multimodal)

```javascript
// Images are sent as base64 data URIs in the attachments array
const response = await fetch(`${serverUrl}/mcp/ui`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Mcp-Session-Id': sessionId
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now().toString(),
    method: 'tools/call',
    params: {
      name: 'chat-with-assistant',
      arguments: {
        prompt: 'What do you see in this image?',
        attachments: [{
          url: 'data:image/jpeg;base64,/9j/4AAQ...', // base64-encoded image
          mimeType: 'image/jpeg',
          name: 'photo.jpg'
        }]
      }
    }
  })
});

// Nanobot pipeline: attachments → inlineAttachments() → MCP Content{type:"image"} → OpenAI image_url
// Supported image types: image/png, image/jpeg, image/webp
```

### Available Tools

Nanobot v0.0.55 exposes multiple tools via the `tools/list` MCP method. Each agent becomes a `chat-with-<name>` tool:

| Tool | Source | Description |
|------|--------|-------------|
| `chat-with-assistant` | User config (`nanobot.yaml`) | Main chat tool with `prompt` + optional `attachments` |
| `chat-with-executor` | Built-in agent | Task execution agent |
| `chat-with-general-chat` | Built-in agent (explorer) | MCP server discovery + general chat |
| `chat-with-planner` | Built-in agent | Planning and step-by-step reasoning |

The mobile app dynamically discovers tool names via `tools/list` and uses `availableTools[0]` (which is `chat-with-assistant`) to send messages. The assistant agent also has access to tools provided by the MCP servers (search, fetch, sequential thinking, DeepWiki, Gmail, MS365). These tools are invoked server-side by the AI model — the mobile app only calls `chat-with-assistant` and the backend handles tool orchestration.

### Image Attachment Pipeline

When a user sends a photo, the mobile app:
1. Picks image via `expo-image-picker` (quality 0.4 to keep base64 small)
2. On send, converts to base64 via `expo-file-system` `readAsStringAsync`
3. Builds a data URI: `data:image/jpeg;base64,<data>`
4. Sends as `attachments` array in the `chat-with-assistant` tool arguments

The nanobot backend then:
1. `inlineAttachments()` extracts the base64 data from the URL
2. `convertToSampleRequest()` converts to MCP `Content{type:"image"}`
3. Sends to OpenAI as `ContentPart{type:"image_url"}` for GPT-4o vision

---

## State Management

### Zustand Store (`mobile/store/chatStore.ts`)

The app uses Zustand for global state management, replacing the earlier AsyncStorage-only approach and the deprecated SettingsContext.

**State shape:**
```typescript
interface ChatState {
  // Connection
  serverUrl: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Data
  threads: Thread[];
  currentThreadId: string | null;
  messages: Message[];
  agents: Agent[];
  currentAgentId: string | null;

  // UI State
  isLoading: boolean;
  isSending: boolean;
}
```

**Key actions:**
- `connect()` / `disconnect()` - Manage MCP connection
- `sendMessage(text, attachments?)` - Send message with optional image attachments
- `createThread()` / `deleteThread()` / `selectThread()` - Thread management
- `addStreamingMessage()` / `finalizeStreamingMessage()` - Handle streamed responses
- `loadAgents()` / `selectAgent()` - Agent selection

### Legacy Settings (`mobile/utils/settings.ts`)

Still in use by the current Chat and Settings screens for basic server URL / API key / provider persistence via AsyncStorage.

---

## Key Files Explained

### `mobile/app/_layout.tsx` - Root Layout

Simple wrapper that renders child routes. We removed the SettingsProvider context here due to navigation conflicts with expo-router.

### `mobile/app/(tabs)/_layout.tsx` - Tab Navigator

Configures two tabs (Chat and Settings) with dark theme styling, Ionicons, and 85px tab bar height.

### `mobile/app/(tabs)/index.tsx` - Chat Screen

Key features:
- Auto-connects when settings are configured
- Uses `useFocusEffect` to reload settings when tab gains focus
- Displays connection status and available tools
- Sends messages via `chat-with-assistant` tool
- Shows loading indicator during API calls
- Connection error retry with "Check Settings" option

### `mobile/app/(tabs)/settings.tsx` - Settings Screen

Key features:
- Server URL input
- AI Provider radio buttons (OpenAI/Anthropic)
- API Key input with show/hide toggle
- Persists settings via AsyncStorage

### `mobile/components/ChatInput.tsx` - Chat Input Component

Rich input component with:
- Text input (multiline, 10000 char limit)
- Image picker (gallery) with base64 encoding
- Camera capture
- Attachment preview strip with remove buttons
- Haptic feedback on send
- Theming via `constants/theme.ts`

### `mobile/services/mcpClient.ts` - MCP Client

Full MCP protocol client with:
- JSON-RPC 2.0 request/response handling
- Session management via expo-secure-store
- Automatic session recovery on 404
- Streaming support via fetch ReadableStream
- Thread and agent management
- Resource/file upload support

### `mobile/store/chatStore.ts` - Zustand Store

Global state with:
- Server connection lifecycle
- Thread CRUD operations
- Message send with streaming response handling
- Agent listing and selection
- Auto thread title from first message

### `mobile/types/mcp.ts` - TypeScript Types

Complete MCP type definitions including:
- `JsonRpcRequest` / `JsonRpcResponse`
- `Tool`, `Resource`, `Prompt`, `Agent`
- `Message`, `MessageContent`, `Thread`
- `ServerCapabilities`, `InitializeResult`, `CallToolResult`
- `StreamEvent`, `Attachment`

### `mobile/constants/theme.ts` - Theme Constants

Light and dark color palettes, spacing scale (`xs` through `xl`), and font size scale. Used by `ChatInput` and available for all components.

---

## Build Configuration

### TypeScript (`mobile/tsconfig.json`)

- Extends `expo/tsconfig.base`
- Strict mode enabled
- Path alias: `@/*` maps to `./*` (e.g., `import { Colors } from '@/constants/theme'`)

### Babel (`mobile/babel.config.js`)

- Preset: `babel-preset-expo`
- Plugin: `react-native-reanimated/plugin` (must be last)

### Metro (`mobile/metro.config.js`)

- Uses default Expo Metro config

### Expo (`mobile/app.json`)

- **Plugins**: expo-router, expo-secure-store, expo-image-picker (with permission strings)
- **Typed routes**: Enabled via `experiments.typedRoutes`
- **Scheme**: `nanobot` (for deep linking)
- **Splash**: `#1a1a2e` background
- **iOS**: Bundle ID `com.yourcompany.nanobot`, camera/photo/microphone permissions
- **Android**: Package `com.yourcompany.nanobot`, adaptive icon, camera/storage/microphone permissions, `softwareKeyboardLayoutMode: "pan"`

---

## Issues Encountered & Solutions

### 1. NavigationContainer Error

**Error**: `Couldn't register the navigator. Have you wrapped your app with 'NavigationContainer'?`

**Cause**: Multiple versions of `@react-navigation` packages (v6 from manual install, v7 from expo-router)

**Solution**: Remove manually installed `@react-navigation/native` and `@react-navigation/native-stack` from package.json. Let expo-router manage its own navigation dependencies.

### 2. React Version Mismatch

**Error**: `Incompatible React versions: react: 19.1.0, react-dom: 19.2.4`

**Solution**: Pin both to exact same version in package.json:
```json
"react": "19.1.0",
"react-dom": "19.1.0"
```

### 3. Nanobot Config Path Error

**Error**: `config path must start with ./`

**Solution**: Use `--config ./nanobot.yaml` not `--config nanobot.yaml`

### 4. Nanobot Schema Validation

**Error**: Schema validation errors for `system` and `name` fields

**Solution**: Simplify nanobot.yaml to minimal config:
```yaml
agents:
  assistant:
    model: gpt-4o
```

### 5. Railway 502 Bad Gateway

**Error**: Proxy error to port 5173

**Cause**: Nanobot's UI was trying to start on port 5173

**Solution**: Add `--disable-ui` flag to CMD

### 6. Tool Not Found

**Error**: `tool run not found`

**Solution**: Use `tools/list` to discover actual tool names. The correct tool is `chat-with-assistant`, not `run`.

### 7. Anthropic Credits Exhausted

**Error**: `credit balance is too low`

**Solution**: Switch to OpenAI by changing model in nanobot.yaml to `gpt-4o`

### 8. npm Peer Dependency Conflicts

**Solution**: Always use `npm install --legacy-peer-deps`

### 9. SettingsContext NavigationContainer Conflict

**Error**: Wrapping root layout in `SettingsProvider` caused NavigationContainer conflicts with expo-router.

**Solution**: Replaced React Context with a simple AsyncStorage utility module (`utils/settings.ts`), later augmented with Zustand store for more complex state.

### 10. Android Keyboard Covers Chat Input

**Error**: On Android, opening the keyboard hid the chat input field. The user couldn't see what they were typing.

**Cause**: Multiple compounding issues:
1. `windowSoftInputMode="adjustResize"` wasn't properly resizing the layout within Expo Router's tab navigator hierarchy
2. The tab bar (85px) was consuming space even when the keyboard was open
3. `KeyboardAvoidingView` with `behavior="height"` on Android conflicted with `adjustResize`

**Solution** (three changes):
1. Changed `windowSoftInputMode` from `adjustResize` to `adjustPan` in `AndroidManifest.xml` — lets the OS pan the entire view up to keep the focused input visible
2. Added `tabBarHideOnKeyboard: true` in `(tabs)/_layout.tsx` — frees up the 85px tab bar space when keyboard opens
3. Increased `paddingBottom` on the input container from 15 to 40 — ensures the input clears the keyboard suggestion bar
4. Set `softwareKeyboardLayoutMode: "pan"` in `app.json` — keeps manifest in sync on future `expo prebuild`
5. Set `KeyboardAvoidingView` `behavior={undefined}` on Android — disables KAV on Android since `adjustPan` handles it natively

**Note**: The Settings screen doesn't have this issue because it uses a `ScrollView` as its root container, which naturally scrolls when the keyboard opens.

### 11. Image Attachments Freeze App

**Error**: App freezes/becomes unresponsive when attaching and sending images. Send button stops working entirely even after restart.

**Cause**: Converting large images to base64 synchronously on pick (via `ImagePicker.launchImageLibraryAsync({ base64: true })`) creates multi-MB strings that block the React Native JS thread.

**Solution** (three changes):
1. Removed `base64: true` from ImagePicker options — pick only returns a URI
2. Moved base64 conversion to send time using `FileSystem.readAsStringAsync()` with try/catch
3. Lowered image quality from 0.8 to 0.4 to reduce base64 payload size

### 12. MCP Server Startup Crash (Missing Credentials)

**Error**: `failed to add tools: failed to build tool mappings: no result in response`

**Cause**: Gmail or MS365 MCP servers listed in `nanobot.yaml` but their OAuth credentials not set in Railway env vars. When nanobot tries to start a stdio MCP server that immediately fails, the entire server crashes.

**Solution**: `entrypoint.sh` dynamically generates `nanobot.yaml` at startup, only including MCP servers whose credentials are present. Gmail is included only if both `GMAIL_OAUTH_KEYS_JSON` and `GMAIL_CREDENTIALS_JSON` are set. MS365 only if `MS365_MCP_CLIENT_ID` and `MS365_MCP_CLIENT_SECRET` are set.

### 13. Nanobot Version Compatibility

**Error**: Various — `unknown flag: --config` (v0.0.50), `bufio.Scanner: token too long` (transient), tool name `chat` vs `chat-with-assistant`

**Cause**: v0.0.50 (Jan 2026) uses a single `chat` tool and doesn't support `--config`. v0.0.51+ changed to `chat-with-<agent>` naming and added `--config` flag with `./` prefix requirement.

**Solution**: Pinned to v0.0.55 which has all required features. Mobile app uses `availableTools[0]` for dynamic tool name discovery instead of hardcoding.

### 14. Tool Name Mismatch Between Versions

**Error**: `tool chat-with-assistant not found` (on v0.0.50) or `tool chat not found` (on v0.0.51+)

**Cause**: Nanobot renamed the chat tool from `chat` to `chat-with-<agentname>` in v0.0.51.

**Solution**: Mobile app calls `tools/list` on connect and stores tool names in `availableTools` state. When sending messages, uses `availableTools[0] || 'chat'` instead of a hardcoded name. Works with any nanobot version.

### 15. Railway Build Fails Instantly (0 seconds, no Docker output)

**Error**: Railway build fails at "Build > Build image" in 0 seconds with only "Using Detected Dockerfile" in logs. No Docker build output at all.

**Cause**: A `railway.json` file was present alongside `railway.toml` with conflicting settings. The JSON file had `startCommand: "nanobot run --ui"` (which overrides Docker ENTRYPOINT) and `healthcheckPath: "/health"` (which nanobot doesn't serve). Railway can get confused by having both config files.

**Solution**: Delete `railway.json` and only use `railway.toml`. Never add `railway.json` to this project.

### 16. Gmail MCP Server Asks User to Log In Despite Credentials

**Error**: AI responds with "I need you to log in to your Google account" even though `GMAIL_OAUTH_KEYS_JSON` and `GMAIL_CREDENTIALS_JSON` are set in Railway.

**Cause**: The `credentials.json` file must contain a **token object** with `refresh_token`, not the OAuth client keys. Common mistakes:
- Setting `GMAIL_CREDENTIALS_JSON` to the Google Cloud Console download (wrong — that's the keys file)
- Using `authorized_user` format instead of the raw token format
- Missing `refresh_token` field (needed for headless token refresh)

**Solution**:
1. Run `node backend/setup-gmail-token.js` locally to complete the OAuth browser flow
2. The script outputs the correct token JSON with `access_token`, `refresh_token`, `expiry_date`
3. Set that output as `GMAIL_CREDENTIALS_JSON` in Railway
4. Set the Google Cloud Console download as `GMAIL_OAUTH_KEYS_JSON`

**Expected credential formats:**
```
GMAIL_OAUTH_KEYS_JSON = {"installed":{"client_id":"...","client_secret":"...",...}}
GMAIL_CREDENTIALS_JSON = {"access_token":"ya29.xxx","refresh_token":"1//xxx","expiry_date":1700000000000,...}
```

The entrypoint logs "refresh_token: present" or "WARNING: no refresh_token" to help diagnose this.

### 17. MS365 Device Code Login Required After Every Deploy

**Error**: User must go to microsoft.com/devicelogin and enter a code every time Railway redeploys the container.

**Cause**: The `@softeria/ms-365-mcp-server` caches OAuth tokens in a file on disk. Railway's filesystem is **ephemeral** — all files are lost on container restart/redeploy. The token cache is destroyed, requiring re-authentication.

**Solution (implemented)**: Token cache pre-seeding via environment variables:
1. Run `node setup-ms365-token.js` locally to complete device code login once
2. Set `MS365_TOKEN_CACHE_JSON` and `MS365_SELECTED_ACCOUNT_JSON` in Railway env vars
3. `entrypoint.sh` writes these to the correct filesystem paths on container startup
4. The ms-365-mcp-server reads the pre-seeded cache and uses the refresh token for silent auth

**Key paths** (determined by `npm root -g`):
- Token cache: `<npm-global-root>/@softeria/ms-365-mcp-server/.token-cache.json`
- Selected account: `<npm-global-root>/@softeria/ms-365-mcp-server/.selected-account.json`

**If still failing ("No valid token found")**:
- Check Railway deploy logs for diagnostic output (npm root path, package dir existence, JSON validity)
- Verify the token cache JSON is valid: should contain Account, IdToken, AccessToken, RefreshToken sections
- Verify selected account format is `{"accountId":"..."}` not `{"homeAccountId":"..."}`
- Refresh tokens expire after ~90 days — re-run `setup-ms365-token.js` if expired

### 18. Azure AD Error: AADSTS70002 "client application must be marked as mobile"

**Error**: `post_request_failed: invalid_grant` or `AADSTS70002: The request body must contain the following parameter: 'client_assertion' or 'client_secret'. The client application must be marked as 'mobile'`

**Cause**: Azure AD app registration is not configured for public client / device code flow.

**Solution**:
1. Azure Portal > App Registration > **Authentication** > **Add a platform** > **Mobile and desktop applications**
2. Check the redirect URI: `https://login.microsoftonline.com/common/oauth2/nativeclient`
3. Go to **Manifest** tab > set `"isFallbackPublicClient": true` > Save
4. The "Allow public client flows" toggle in the UI may not persist — always verify in the raw manifest

### 19. Azure AD Error: AADSTS50020 Wrong Account Type

**Error**: `AADSTS50020: User account from identity provider 'live.com' does not exist in tenant`

**Cause**: Trying to log in with a personal Microsoft account (e.g., @gmail.com, @outlook.com) but the tenant ID is set to a specific organization tenant instead of `common`.

**Solution**:
- Set `MS365_MCP_TENANT_ID=common` in Railway env vars
- In `setup-ms365-token.js`, ensure tenant is `common`
- Use InPrivate/Incognito browser to avoid cached organizational account sessions

### 20. AI Returns Wrong Dates for "Yesterday" Email Queries

**Error**: Asking "retrieve emails from yesterday" returns emails from October 2023 or other wrong dates.

**Cause**: GPT-4o running through nanobot has no inherent knowledge of the current date. When asked about "yesterday", it guesses based on training data.

**Solution (implemented)**: `entrypoint.sh` injects `Today's date is YYYY-MM-DD` into the AI system instructions using `$(date -u +"%Y-%m-%d")`. This is regenerated on every container start, so it's always current.

### 21. AI Falls Back to MS365 When Gmail Requested (or Vice Versa)

**Error**: User asks "check my Gmail" but AI uses Microsoft 365 tools instead (or vice versa), especially when one service has auth errors.

**Cause**: Generic instructions like "use the appropriate email tools" let GPT-4o fall back to whichever service is available.

**Solution (implemented)**: Explicit routing instructions in `entrypoint.sh`:
- When both services are configured: "When the user mentions 'Gmail', ONLY use Gmail tools. When the user mentions 'Outlook' or 'Microsoft', ONLY use Microsoft 365 tools. Never fall back to one email service when the other fails."
- When only one service is configured: Instructions direct the AI to only use that service and report auth errors instead of trying alternatives.

---

## On-Device Features

### Text-to-Speech (TTS)

**Package**: `expo-speech`

Each assistant message bubble has a speaker icon button. Tapping it reads the message aloud via `Speech.speak()`. Tapping again (or tapping a different message) stops playback.

**Implementation** (`app/(tabs)/index.tsx`):
- `speakingIndex` state tracks which message is currently being spoken
- `handleSpeak(text, index)` toggles speech on/off
- Icon changes between `volume-medium-outline` (idle) and `stop-circle-outline` (speaking)
- Speech callbacks (`onDone`, `onStopped`, `onError`) reset the speaking state

### ChatInput Component

**File**: `components/ChatInput.tsx`

Rich input bar with attachment buttons + mic + text input + send button:

| Button | Icon | Action | Package |
|--------|------|--------|---------|
| Gallery | `image-outline` | Pick image from photo library | `expo-image-picker` |
| Camera | `camera-outline` | Take new photo | `expo-image-picker` |
| File | `document-outline` | Pick any file type | `expo-document-picker` |
| Mic | `mic-outline` / `mic` | Toggle voice input | `expo-speech-recognition` |

**Attachment flow**:
1. User taps an attachment button → picker opens
2. Selected file/image added to `attachments` state array (images include base64 from ImagePicker)
3. Preview appears above the input bar (thumbnail for images, icon + filename for files)
4. User can remove attachments via the X button overlay
5. On send: attachments passed to `onSend` callback with base64 data
6. Parent (`index.tsx`) builds nanobot `attachments` array with data URIs and sends via MCP

**Image quality**: 0.4 (40%) — balances visual quality with base64 payload size to avoid freezing the JS thread.

### Speech-to-Text (STT)

**Package**: `expo-speech-recognition`

On-device speech recognition using Android's `SpeechRecognizer` / iOS's `SFSpeechRecognizer`. No API keys needed.

**Implementation** (`components/ChatInput.tsx`):
- `isListening` state tracks whether voice input is active
- `toggleListening()` starts/stops recognition via `ExpoSpeechRecognitionModule`
- `useSpeechRecognitionEvent('result')` updates the text input with transcribed speech in real-time
- `useSpeechRecognitionEvent('end')` resets listening state
- `useSpeechRecognitionEvent('error')` handles permission denials
- Options: `lang: 'en-US'`, `interimResults: true`, `addsPunctuation: true`

**Visual feedback**:
- Mic icon changes from outline to filled red when listening
- TextInput border turns red, placeholder changes to "Listening..."
- Sending while listening auto-stops recognition

### Haptic Feedback

**Package**: `expo-haptics`

Light impact feedback (`ImpactFeedbackStyle.Light`) fires on every message send.

---

## UI/UX Design

### Color Scheme

Defined in `mobile/constants/theme.ts` with full light and dark palettes:

| Element | Dark | Light |
|---------|------|-------|
| Background | `#0f0f1a` | `#ffffff` |
| Surface | `#1a1a2e` | `#f5f5f5` |
| Primary | `#818cf8` | `#6366f1` |
| Text | `#f9fafb` | `#1f2937` |
| Text Secondary | `#9ca3af` | `#6b7280` |
| Border | `#374151` | `#e5e7eb` |
| Error | `#f87171` | `#ef4444` |
| Success | `#4ade80` | `#22c55e` |
| User Bubble | `#6366f1` | `#6366f1` |
| Assistant Bubble | `#1f2937` | `#f3f4f6` |

### Spacing Scale

`xs: 4, sm: 8, md: 16, lg: 24, xl: 32`

### Font Size Scale

`xs: 12, sm: 14, md: 16, lg: 18, xl: 24, xxl: 32`

### Tab Bar

- Height: 85px
- Bottom padding: 25px (for safe area)
- Icons: Ionicons outline style

---

## Future Improvements

### Planned Features — App

1. **iOS Build**: TestFlight distribution via EAS
2. **Streaming Responses**: Wire up SSE streaming in the chat UI (MCPClient supports it)
3. **Multiple Conversations**: Use Zustand thread management in the UI
4. **Offline Mode**: Queue messages when offline
5. **Agent Selection**: UI for switching between agents (executor, explorer, planner already available)
6. **Auto-include GPS location**: Attach device coordinates to messages so AI is location-aware (`expo-location`)
7. **Auto-include phone orientation**: Attach accelerometer/gyroscope data (`expo-sensors`)

### Planned Features — Personal Services

1. **SMS/Text messages**: Most complex remaining personal service
   - **Android only**: On-device SMS reading via React Native SMS library + `READ_SMS` permission
   - **iOS**: Not possible — Apple blocks SMS API access entirely
   - **Alternative**: Cloud messaging via Google Voice/Twilio APIs
   - Example: *"Did Mary reply to my text?"*

2. **Google Drive**: Similar to OneDrive pattern, using a Google Drive MCP server
   - Would use OAuth from same Google Cloud project as Gmail

### Planned Features — AI-Initiated Device Access

For the AI to proactively use device sensors (camera, GPS), several architectural approaches exist:

1. **Auto-include context (easiest)**: App silently attaches GPS/orientation data to every message. No architecture change. Toggle in Settings.

2. **AI-requested actions via response parsing (medium)**: AI responds with structured action requests (e.g., `{"action": "take_photo"}`), app detects and executes. Convention-based, requires system prompt instructions.

3. **Client-side MCP server (most powerful)**: Mobile app acts as both MCP client AND server. AI can call tools like `take-photo`, `get-location`, `get-orientation` that execute on the device. Requires persistent WebSocket/SSE connection for backend→device push. Most complex but enables fully autonomous AI+device interaction.

**Available Expo packages for device access:**

| Sensor | Package | Data |
|--------|---------|------|
| Camera | `expo-camera` | Programmatic photo/video capture |
| GPS | `expo-location` | Lat/lng, altitude, speed, heading, background tracking |
| Orientation | `expo-sensors` | Accelerometer, gyroscope, magnetometer, barometer |
| Pedometer | `expo-sensors` | Step counter |

### Code Improvements

1. Migrate chat screen from direct fetch to MCPClient service
2. Migrate settings screen from AsyncStorage to Zustand store
3. Add proper error boundaries
4. Implement retry logic for failed requests
5. Add unit tests
6. Set up CI/CD pipeline
7. Add custom app icons and splash screen
8. Replace `com.yourcompany.nanobot` with real package/bundle identifiers

### Completed

- ~~Custom MCP Tools~~: Added 4 remote MCP servers (Exa Search, Fetch, Sequential Thinking, DeepWiki)
- ~~Text-to-Speech~~: Speaker icon on assistant messages via `expo-speech` — tap to listen, tap again to stop
- ~~Camera/Gallery Integration~~: ChatInput component wired into main chat screen with `expo-image-picker`
- ~~Document Picker~~: File attachment support via `expo-document-picker`
- ~~Multimodal Image Attachments~~: Photos sent as base64 data URIs to nanobot `attachments` array for GPT-4o vision
- ~~Speech-to-Text~~: Mic button in ChatInput via `expo-speech-recognition` — on-device recognition, real-time transcription
- ~~Gmail Integration~~: `@gongrzhe/server-gmail-autoauth-mcp` as stdio MCP server — search, read, send emails
- ~~Microsoft 365 Integration~~: `@softeria/ms-365-mcp-server` as stdio MCP server — Outlook email + OneDrive files
- ~~Document Attachment Fix~~: File attachments now read as base64 via `expo-file-system` and sent to backend
- ~~Debug Logging Cleanup~~: Removed console.log and debug fallback messages from chat response handler
- ~~Nanobot v0.0.55 Upgrade~~: Multi-tool support (chat-with-*), --config flag, built-in agents (executor, explorer, planner)
- ~~Bufio Scanner Patch~~: sed patch in Dockerfile increases LLM SSE reader buffer from 64KB to 10MB
- ~~Dynamic Tool Discovery~~: Mobile app uses `tools/list` and `availableTools[0]` instead of hardcoded tool names
- ~~Dynamic Config Generation~~: entrypoint.sh only includes MCP servers whose OAuth credentials are present
- ~~Gmail OAuth Setup Scripts~~: `setup-gmail-token.js` (auto-redirect) and `setup-gmail-manual.js` (manual code paste)
- ~~Entrypoint Hardening~~: printf instead of echo for JSON, HOME=/root export, refresh_token validation logging
- ~~Railway Config Cleanup~~: Removed conflicting railway.json, only railway.toml remains
- ~~Date Awareness~~: AI instructions include today's date via `$(date -u)` in entrypoint.sh — fixes "yesterday" queries returning wrong dates
- ~~Email Service Routing~~: Explicit instructions prevent AI from falling back between Gmail and MS365
- ~~MS365 Token Persistence~~: Token cache pre-seeded from Railway env vars via entrypoint.sh — avoids device code login on redeploy
- ~~MS365 Setup Script~~: `setup-ms365-token.js` performs device code login and exports token cache + selected account JSON

---

## Quick Reference Commands

```bash
# Start mobile app (web)
cd mobile && npx expo start --web

# Start mobile app (with QR for Expo Go)
cd mobile && npx expo start

# Run on Android device/emulator
cd mobile && npx expo run:android

# Build Android APK locally
cd mobile/android && ./gradlew assembleRelease
# Output: mobile/android/app/build/outputs/apk/release/app-release.apk

# Copy APK to Windows desktop (WSL)
cp mobile/android/app/build/outputs/apk/release/app-release.apk /mnt/c/Users/<USER>/Desktop/nanobot.apk

# Clean reinstall dependencies
cd mobile && rm -rf node_modules package-lock.json && npm install --legacy-peer-deps

# Regenerate native Android project
cd mobile && npx expo prebuild --platform android

# Check React versions
cd mobile && cat node_modules/react/package.json | grep '"version"'
cd mobile && cat node_modules/react-dom/package.json | grep '"version"'

# Check navigation package versions
cd mobile && npm ls @react-navigation/native
```

---

## Production URLs

- **Railway Backend**: `https://nanobot-mobile-production.up.railway.app`
- **Mobile Web**: `http://localhost:8081` (development)

---

*Last Updated: February 2026*
