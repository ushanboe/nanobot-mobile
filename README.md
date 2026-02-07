# Nanobot Mobile

A React Native mobile app for [Nanobot](https://github.com/nanobot-ai/nanobot) - the lightweight MCP-based AI agent platform.

## Architecture

```
nanobot-mobile/
├── backend/          # Nanobot server (deploys to Railway)
│   ├── Dockerfile
│   ├── nanobot.yaml
│   └── railway.toml
│
└── mobile/           # React Native app (Expo)
    ├── android/      # Native Android project (prebuild)
    ├── app/          # Screens (Expo Router)
    ├── components/   # UI components
    ├── constants/    # Theme colors, spacing, fonts
    ├── services/     # MCP client
    ├── store/        # Zustand state management
    ├── types/        # TypeScript types
    └── utils/        # Settings helpers
```

## Quick Start

### 1. Deploy Backend to Railway

1. **Create a new Railway project:**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select/connect your repository

2. **Or deploy from this repo:**
   ```bash
   cd backend
   railway login
   railway init
   railway up
   ```

3. **Set environment variables in Railway:**
   ```
   OPENAI_API_KEY=your-key-here
   # OR
   ANTHROPIC_API_KEY=your-key-here
   ```

4. **Get your Railway URL:**
   - It will be something like: `https://nanobot-mobile-production.up.railway.app`

### 2. Run Mobile App

```bash
cd mobile

# Install dependencies
npm install --legacy-peer-deps

# Start Expo development server
npx expo start --web        # Web browser
npx expo start              # Expo Go on phone (scan QR)
npx expo run:android        # Run on Android device/emulator
```

### 3. Build Android APK

```bash
cd mobile

# Build release APK locally (requires Android SDK)
cd android && ./gradlew assembleRelease

# APK output: android/app/build/outputs/apk/release/app-release.apk
```

### 4. Connect to Backend

1. Install the APK on your Android device
2. Open the app and go to Settings
3. Enter your Railway backend URL
4. Go back to Chat — it auto-connects

## Features

- Chat with GPT-4o / Claude via your own API keys
- **AI tools via MCP servers**: web search (Exa), URL fetching, step-by-step reasoning, GitHub project lookup (DeepWiki)
- **Gmail integration**: Search, read, and send emails via Gmail MCP server
- **Microsoft 365 integration**: Outlook email + OneDrive files via MS365 MCP server
- **Multimodal image support**: Send photos to GPT-4o for visual analysis (camera or gallery)
- **Text-to-Speech**: Tap the speaker icon on any assistant message to hear it read aloud
- **Speech-to-Text**: On-device voice input via mic button
- **Attachments**: Camera photos, gallery images, and document/file picker
- MCP protocol (JSON-RPC 2.0) communication
- Dark theme UI with indigo accents
- Auto-connect on app launch
- Keyboard-aware chat input (adjustPan on Android)
- Haptic feedback on send
- Secure credential storage (expo-secure-store)
- Settings persist via AsyncStorage

## Project Structure

### Mobile App

| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root layout (renders Slot) |
| `app/(tabs)/_layout.tsx` | Tab navigator (Chat + Settings) |
| `app/(tabs)/index.tsx` | Chat screen |
| `app/(tabs)/settings.tsx` | Settings screen |
| `components/ChatInput.tsx` | Rich input with image attachments |
| `constants/theme.ts` | Colors, spacing, font sizes |
| `services/mcpClient.ts` | MCP protocol client |
| `store/chatStore.ts` | Zustand state management |
| `types/mcp.ts` | TypeScript type definitions |
| `utils/settings.ts` | AsyncStorage settings helper |

### Backend

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Go build for Railway |
| `entrypoint.sh` | Startup script — writes OAuth creds, generates nanobot.yaml |
| `nanobot.yaml` | Agent config (GPT-4o + up to 6 MCP servers) |
| `ms365-wrapper.mjs` | MS365 MCP server launcher — token refresh, AuthManager patch |
| `setup-ms365-token.js` | Local: MS365 device code login, exports refresh token |
| `setup-gmail-manual.js` | Local: Gmail OAuth flow (WSL-friendly) |
| `test-onedrive.js` | Diagnostic: tests Graph API chain directly |
| `railway.toml` | Railway deployment config |

### MCP Servers (Backend Tools)

| Server | Type | Purpose |
|--------|------|---------|
| Exa Search | Remote | Web search for current information |
| Fetch | Remote | Read and summarize URLs |
| Sequential Thinking | Remote | Step-by-step reasoning |
| DeepWiki | Remote | GitHub project documentation lookup |
| Gmail | Local (stdio) | Gmail email — search, read, send |
| Microsoft 365 | Local (stdio) | Outlook email + OneDrive files |

## Environment Variables

### Backend (Railway)

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes* | OpenAI API key |
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key |
| `GMAIL_OAUTH_KEYS_JSON` | For Gmail | OAuth client keys from Google Cloud Console |
| `GMAIL_CREDENTIALS_JSON` | For Gmail | OAuth tokens with `refresh_token` (from setup script) |
| `MS365_MCP_CLIENT_ID` | For MS365 | Azure AD app client ID |
| `MS365_MCP_CLIENT_SECRET` | For MS365 | Azure AD client secret |
| `MS365_MCP_TENANT_ID` | For MS365 | `consumers` (personal OneDrive) or `common` (any) |
| `MS365_REFRESH_TOKEN` | For MS365 | Refresh token (~400 chars, from setup script) |

*At least one API key is required. Gmail and MS365 variables are optional — the backend auto-detects available services.

## Theming

Edit `mobile/constants/theme.ts` to customize colors. Supports both light and dark palettes.

## Tech Stack

- **Frontend:** React Native 0.81, Expo SDK 54, Expo Router, Zustand
- **Backend:** Go (Nanobot), MCP Protocol
- **Build:** Local Gradle (Android APK), EAS Build (cloud)
- **Deployment:** Railway (backend)

## Key Technical Notes

- `react` and `react-dom` must both be exactly `19.1.0`
- Always use `npm install --legacy-peer-deps`
- Android uses `windowSoftInputMode="adjustPan"` for keyboard handling
- Tab bar hides on keyboard open (`tabBarHideOnKeyboard: true`)
- See `DEVELOPMENT.md` for full technical documentation

## License

MIT - See the original [Nanobot repository](https://github.com/nanobot-ai/nanobot) for license details.
