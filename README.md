# Nanobot Mobile

A React Native mobile app for [Nanobot](https://github.com/nanobot-ai/nanobot) - the lightweight MCP-based AI agent platform.

## Architecture

```
nanobot-mobile/
├── backend/          # Nanobot server (deploys to Railway)
│   ├── Dockerfile
│   ├── railway.json
│   └── .env.example
│
└── mobile/           # React Native app (Expo)
    ├── app/          # Screens (Expo Router)
    ├── components/   # UI components
    ├── services/     # MCP client
    ├── store/        # Zustand state management
    └── types/        # TypeScript types
```

## Quick Start

### 1. Deploy Backend to Railway

1. **Create a new Railway project:**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select/connect your forked nanobot repository

2. **Or deploy from this repo:**
   ```bash
   cd backend
   railway login
   railway init
   railway up
   ```

3. **Set environment variables in Railway:**
   ```
   ANTHROPIC_API_KEY=your-key-here
   # OR
   OPENAI_API_KEY=your-key-here
   ```

4. **Get your Railway URL:**
   - It will be something like: `https://nanobot-production-xxxx.up.railway.app`

### 2. Run Mobile App

```bash
cd mobile

# Install dependencies
npm install

# Start Expo development server
npm start

# Or run directly on device/simulator
npm run ios     # iOS Simulator
npm run android # Android Emulator
```

### 3. Connect to Backend

1. Open the app on your device/simulator
2. Go to Settings
3. Enter your Railway backend URL
4. Tap "Connect"

## Features

- Chat with Claude/GPT via your own API keys
- Multiple conversation threads
- Support for custom agents
- Image attachments from camera/gallery
- Dark/light mode support
- Secure credential storage

## Building for Production

### iOS

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure your Apple credentials
eas build:configure

# Build for iOS
eas build --platform ios
```

### Android

```bash
# Build for Android
eas build --platform android
```

## Project Structure

### Mobile App

| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root navigation layout |
| `app/index.tsx` | Main chat screen |
| `app/settings.tsx` | Settings & connection config |
| `components/Message.tsx` | Chat message bubble |
| `components/ChatInput.tsx` | Message input with attachments |
| `components/ThreadList.tsx` | Conversation list |
| `services/mcpClient.ts` | MCP protocol client |
| `store/chatStore.ts` | Zustand state management |
| `types/mcp.ts` | TypeScript type definitions |

### Backend

The backend uses the official Nanobot Docker image with minimal configuration.

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build for Go + UI |
| `railway.json` | Railway deployment config |
| `.env.example` | Environment variables template |

## Environment Variables

### Backend (Railway)

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key |
| `OPENAI_API_KEY` | Yes* | OpenAI API key |
| `NANOBOT_DEFAULT_MODEL` | No | Default model (e.g., `claude-sonnet-4-20250514`) |
| `PORT` | No | Server port (Railway sets this) |

*At least one API key is required.

## Customization

### Adding Custom Agents

Create a `.nanobot/agents/` directory on the server with YAML or Markdown agent definitions:

```yaml
# .nanobot/agents/assistant.yaml
name: Assistant
model: claude-sonnet-4-20250514
system: |
  You are a helpful assistant.
```

### Theming

Edit `mobile/constants/theme.ts` to customize colors.

## Tech Stack

- **Frontend:** React Native, Expo, Expo Router, Zustand
- **Backend:** Go, MCP Protocol
- **Deployment:** Railway (backend), EAS Build (mobile)

## License

MIT - See the original [Nanobot repository](https://github.com/nanobot-ai/nanobot) for license details.
