// Chat State Management with Zustand
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { getMCPClient, resetMCPClient } from '@/services/mcpClient';
import type { Message, Thread, Agent, MessageContent } from '@/types/mcp';
import { v4 as uuidv4 } from 'uuid';

const SERVER_URL_KEY = 'nanobot_server_url';

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

  // Actions
  setServerUrl: (url: string) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;

  loadThreads: () => Promise<void>;
  selectThread: (threadId: string) => Promise<void>;
  createThread: () => string;
  deleteThread: (threadId: string) => Promise<void>;

  loadAgents: () => Promise<void>;
  selectAgent: (agentId: string) => void;

  sendMessage: (text: string, attachments?: Array<{ type: string; data: string; mimeType: string }>) => Promise<void>;
  addStreamingMessage: (content: MessageContent) => void;
  finalizeStreamingMessage: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  serverUrl: null,
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  threads: [],
  currentThreadId: null,
  messages: [],
  agents: [],
  currentAgentId: null,
  isLoading: false,
  isSending: false,

  // Set and save server URL
  setServerUrl: async (url: string) => {
    await SecureStore.setItemAsync(SERVER_URL_KEY, url);
    resetMCPClient();
    set({ serverUrl: url, isConnected: false, connectionError: null });
  },

  // Connect to server
  connect: async () => {
    const { serverUrl } = get();
    if (!serverUrl) {
      set({ connectionError: 'No server URL configured' });
      return;
    }

    set({ isConnecting: true, connectionError: null });

    try {
      const client = getMCPClient(serverUrl);
      await client.connect();
      set({ isConnected: true, isConnecting: false });

      // Load initial data
      await get().loadAgents();
      await get().loadThreads();
    } catch (error) {
      set({
        isConnecting: false,
        connectionError: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  },

  // Disconnect
  disconnect: async () => {
    try {
      const client = getMCPClient();
      await client.disconnect();
    } catch (e) {
      // Ignore errors
    }
    resetMCPClient();
    set({
      isConnected: false,
      threads: [],
      messages: [],
      currentThreadId: null,
    });
  },

  // Load threads
  loadThreads: async () => {
    set({ isLoading: true });
    try {
      const client = getMCPClient();
      const threads = await client.listThreads();
      set({
        threads: threads.map((t) => ({
          id: t.id,
          title: t.title || 'New Chat',
          createdAt: t.updatedAt,
          updatedAt: t.updatedAt,
        })),
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to load threads:', error);
      set({ isLoading: false });
    }
  },

  // Select and load a thread
  selectThread: async (threadId: string) => {
    set({ currentThreadId: threadId, isLoading: true, messages: [] });

    try {
      const client = getMCPClient();
      const rawMessages = await client.getThreadMessages(threadId);

      const messages: Message[] = rawMessages.map((m, i) => ({
        id: `${threadId}-${i}`,
        role: m.role as 'user' | 'assistant',
        content: Array.isArray(m.content)
          ? m.content.map((c: any) => ({
              type: c.type || 'text',
              text: c.text,
              data: c.data,
              mimeType: c.mimeType,
              toolName: c.name,
              toolInput: c.input,
              toolResult: c.content,
            }))
          : [{ type: 'text', text: String(m.content) }],
        timestamp: Date.now() - (rawMessages.length - i) * 1000,
        status: 'sent',
      }));

      set({ messages, isLoading: false });
    } catch (error) {
      console.error('Failed to load thread messages:', error);
      set({ isLoading: false });
    }
  },

  // Create a new thread
  createThread: () => {
    const threadId = uuidv4();
    const newThread: Thread = {
      id: threadId,
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set((state) => ({
      threads: [newThread, ...state.threads],
      currentThreadId: threadId,
      messages: [],
    }));

    return threadId;
  },

  // Delete a thread
  deleteThread: async (threadId: string) => {
    try {
      const client = getMCPClient();
      await client.deleteThread(threadId);

      set((state) => ({
        threads: state.threads.filter((t) => t.id !== threadId),
        currentThreadId: state.currentThreadId === threadId ? null : state.currentThreadId,
        messages: state.currentThreadId === threadId ? [] : state.messages,
      }));
    } catch (error) {
      console.error('Failed to delete thread:', error);
    }
  },

  // Load agents
  loadAgents: async () => {
    try {
      const client = getMCPClient();
      const agents = await client.listAgents();
      set({ agents });

      // Select first agent by default
      if (agents.length > 0 && !get().currentAgentId) {
        set({ currentAgentId: agents[0].id });
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  },

  // Select an agent
  selectAgent: (agentId: string) => {
    set({ currentAgentId: agentId });
  },

  // Send a message
  sendMessage: async (text: string, attachments) => {
    const { currentThreadId, currentAgentId } = get();

    // Create thread if needed
    let threadId = currentThreadId;
    if (!threadId) {
      threadId = get().createThread();
    }

    // Add user message to UI
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: Date.now(),
      status: 'sent',
    };

    // Add placeholder for assistant response
    const assistantMessage: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: [],
      timestamp: Date.now(),
      status: 'streaming',
    };

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isSending: true,
    }));

    try {
      const client = getMCPClient();

      // Subscribe to streaming events
      const unsubscribe = client.subscribeToThread(
        threadId,
        (event) => {
          if (event.type === 'message' || event.type === 'tool_result') {
            get().addStreamingMessage(event.data as MessageContent);
          } else if (event.type === 'done') {
            get().finalizeStreamingMessage();
            unsubscribe();
          } else if (event.type === 'error') {
            set((state) => {
              const messages = [...state.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg && lastMsg.role === 'assistant') {
                lastMsg.status = 'error';
                lastMsg.content = [{ type: 'text', text: 'Error: ' + String(event.data) }];
              }
              return { messages, isSending: false };
            });
            unsubscribe();
          }
        },
        (error) => {
          console.error('Stream error:', error);
          get().finalizeStreamingMessage();
        }
      );

      // Send the message
      await client.sendMessage(text, threadId, currentAgentId || undefined, attachments);

      // Update thread title if first message
      set((state) => {
        const thread = state.threads.find((t) => t.id === threadId);
        if (thread && thread.title === 'New Chat') {
          const title = text.slice(0, 30) + (text.length > 30 ? '...' : '');
          return {
            threads: state.threads.map((t) =>
              t.id === threadId ? { ...t, title, updatedAt: Date.now() } : t
            ),
          };
        }
        return {};
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      set((state) => {
        const messages = [...state.messages];
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.status = 'error';
          lastMsg.content = [
            { type: 'text', text: 'Failed to send message: ' + (error instanceof Error ? error.message : 'Unknown error') },
          ];
        }
        return { messages, isSending: false };
      });
    }
  },

  // Add content to streaming message
  addStreamingMessage: (content: MessageContent) => {
    set((state) => {
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];

      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.status === 'streaming') {
        // If it's text and we already have text, append
        if (content.type === 'text' && content.text) {
          const existingText = lastMsg.content.find((c) => c.type === 'text');
          if (existingText) {
            existingText.text = (existingText.text || '') + content.text;
          } else {
            lastMsg.content.push(content);
          }
        } else {
          lastMsg.content.push(content);
        }
      }

      return { messages };
    });
  },

  // Finalize streaming message
  finalizeStreamingMessage: () => {
    set((state) => {
      const messages = [...state.messages];
      const lastMsg = messages[messages.length - 1];

      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.status = 'sent';
      }

      return { messages, isSending: false };
    });
  },
}));

// Initialize from storage
export async function initializeChatStore() {
  const serverUrl = await SecureStore.getItemAsync(SERVER_URL_KEY);
  if (serverUrl) {
    useChatStore.setState({ serverUrl });
  }
}
