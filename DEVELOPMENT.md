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
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│              ┌─────────────────────┐                         │
│              │   AI Provider API   │                         │
│              │  (OpenAI/Anthropic) │                         │
│              └─────────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
nanobot-mobile/
├── backend/                    # Backend deployment files
│   ├── Dockerfile              # Docker build for Railway
│   ├── nanobot.yaml            # Nanobot configuration
│   └── railway.toml            # Railway deployment config
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

# Clone nanobot
RUN git clone https://github.com/nanobot-ai/nanobot.git .

# Build Go binary
RUN go build -o nanobot .

# Production image
FROM alpine:latest

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /app/nanobot .

# Copy config file
COPY nanobot.yaml .

EXPOSE 8080

CMD ["./nanobot", "run", "--config", "./nanobot.yaml", "--listen-address", "0.0.0.0:8080", "--disable-ui"]
```

**Key flags explained**:
- `--config ./nanobot.yaml` - Config path must start with `./`
- `--listen-address 0.0.0.0:8080` - Listen on all interfaces
- `--disable-ui` - Disable built-in web UI (was proxying to port 5173)

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
```yaml
agents:
  assistant:
    model: gpt-4o
```

Supported models:
- OpenAI: `gpt-4o`, `gpt-4`, `gpt-3.5-turbo`
- Anthropic: `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`

### Environment Variables (Railway Dashboard)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (required for OpenAI models) |
| `ANTHROPIC_API_KEY` | Anthropic API key (required for Claude models) |

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

#### 3. Call a Tool (Send Message)

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

### Available Tools

The default nanobot configuration exposes:
- `chat-with-assistant` - Main chat tool with `prompt` argument

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

### Planned Features

1. **iOS Build**: TestFlight distribution via EAS
2. **Streaming Responses**: Wire up SSE streaming in the chat UI (MCPClient supports it)
3. **Multiple Conversations**: Use Zustand thread management in the UI
4. **Image Attachments**: Wire ChatInput component into the main chat screen
5. **Custom Tools**: Allow users to configure additional MCP tools
6. **Offline Mode**: Queue messages when offline
7. **Agent Selection**: UI for switching between agents

### Code Improvements

1. Migrate chat screen from direct fetch to MCPClient service
2. Migrate settings screen from AsyncStorage to Zustand store
3. Add proper error boundaries
4. Implement retry logic for failed requests
5. Add unit tests
6. Set up CI/CD pipeline
7. Add custom app icons and splash screen
8. Replace `com.yourcompany.nanobot` with real package/bundle identifiers

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
