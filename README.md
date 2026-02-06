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
- MCP protocol (JSON-RPC 2.0) communication
- Dark theme UI with indigo accents
- Auto-connect on app launch
- Keyboard-aware chat input (adjustPan on Android)
- Image attachments from camera/gallery (ChatInput component)
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
| `nanobot.yaml` | Agent configuration (model: gpt-4o) |
| `railway.toml` | Railway deployment config |

## Environment Variables

### Backend (Railway)

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes* | OpenAI API key |
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key |

*At least one API key is required.

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
