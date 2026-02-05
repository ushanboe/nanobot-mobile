// MCP Client for React Native
// Ported from nanobot's packages/ui/src/lib/mcpclient.ts

import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  Tool,
  Resource,
  Prompt,
  Agent,
  InitializeResult,
  CallToolResult,
  StreamEvent,
} from '@/types/mcp';

const SESSION_KEY = 'nanobot_session_id';
const MCP_VERSION = '2024-11-05';

export class MCPClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private initialized: boolean = false;
  private eventSource: EventSource | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // Initialize connection and load session
  async connect(): Promise<InitializeResult> {
    // Try to restore session
    this.sessionId = await SecureStore.getItemAsync(SESSION_KEY);

    const result = await this.exchange<InitializeResult>('initialize', {
      protocolVersion: MCP_VERSION,
      capabilities: {
        roots: { listChanged: true },
      },
      clientInfo: {
        name: 'nanobot-mobile',
        version: '1.0.0',
      },
    });

    this.initialized = true;

    // Save new session ID if we got one
    if (this.sessionId) {
      await SecureStore.setItemAsync(SESSION_KEY, this.sessionId);
    }

    return result;
  }

  // Core JSON-RPC exchange
  async exchange<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method,
      params,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    const response = await fetch(`${this.baseUrl}/mcp/ui`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    // Capture session ID from response
    const newSessionId = response.headers.get('Mcp-Session-Id');
    if (newSessionId && newSessionId !== this.sessionId) {
      this.sessionId = newSessionId;
      await SecureStore.setItemAsync(SESSION_KEY, newSessionId);
    }

    if (!response.ok) {
      // Session expired - reconnect
      if (response.status === 404 && this.initialized) {
        this.initialized = false;
        this.sessionId = null;
        await SecureStore.deleteItemAsync(SESSION_KEY);
        await this.connect();
        return this.exchange(method, params);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json: JsonRpcResponse = await response.json();

    if (json.error) {
      throw new Error(`RPC Error ${json.error.code}: ${json.error.message}`);
    }

    return json.result as T;
  }

  // List available tools
  async listTools(): Promise<Tool[]> {
    const result = await this.exchange<{ tools: Tool[] }>('tools/list');
    return result.tools;
  }

  // Call a tool
  async callTool(
    name: string,
    args: Record<string, unknown>,
    options?: { async?: boolean; progressToken?: string }
  ): Promise<CallToolResult> {
    const params: Record<string, unknown> = {
      name,
      arguments: args,
    };

    if (options?.async || options?.progressToken) {
      params._meta = {
        ...(options.async && { 'ai.nanobot.async': true }),
        ...(options.progressToken && { progressToken: options.progressToken }),
      };
    }

    return this.exchange<CallToolResult>('tools/call', params);
  }

  // List resources
  async listResources(): Promise<Resource[]> {
    const result = await this.exchange<{ resources: Resource[] }>('resources/list');
    return result.resources;
  }

  // Read a resource
  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }> }> {
    return this.exchange('resources/read', { uri });
  }

  // List prompts/agents
  async listPrompts(): Promise<Prompt[]> {
    const result = await this.exchange<{ prompts: Prompt[] }>('prompts/list');
    return result.prompts;
  }

  // Get agents
  async listAgents(): Promise<Agent[]> {
    try {
      const result = await this.callTool('list_agents', {});
      if (result.content?.[0]?.text) {
        return JSON.parse(result.content[0].text);
      }
    } catch (e) {
      console.warn('Failed to list agents:', e);
    }
    return [];
  }

  // Send a chat message
  async sendMessage(
    text: string,
    threadId: string,
    agentId?: string,
    attachments?: Array<{ type: string; data: string; mimeType: string }>
  ): Promise<CallToolResult> {
    const args: Record<string, unknown> = {
      prompt: text,
      thread_id: threadId,
    };

    if (agentId) {
      args.agent = agentId;
    }

    if (attachments && attachments.length > 0) {
      args.attachments = attachments;
    }

    return this.callTool('run', args, { async: true });
  }

  // Subscribe to streaming events for a thread
  subscribeToThread(
    threadId: string,
    onEvent: (event: StreamEvent) => void,
    onError?: (error: Error) => void
  ): () => void {
    const url = `${this.baseUrl}/mcp/ui?stream=true&thread=${threadId}`;

    // React Native doesn't have native EventSource, using polyfill approach
    const controller = new AbortController();

    const fetchStream = async () => {
      try {
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        };

        if (this.sessionId) {
          headers['Mcp-Session-Id'] = this.sessionId;
        }

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Stream error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                onEvent(data);
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          onError?.(error);
        }
      }
    };

    fetchStream();

    // Return unsubscribe function
    return () => {
      controller.abort();
    };
  }

  // Create a resource (for file uploads)
  async createResource(
    name: string,
    data: string,
    mimeType: string
  ): Promise<{ uri: string }> {
    const result = await this.callTool('create_resource', {
      name,
      data,
      mimeType,
    });

    if (result.content?.[0]?.text) {
      return JSON.parse(result.content[0].text);
    }

    throw new Error('Failed to create resource');
  }

  // List threads
  async listThreads(): Promise<Array<{ id: string; title: string; updatedAt: number }>> {
    try {
      const result = await this.callTool('list_threads', {});
      if (result.content?.[0]?.text) {
        return JSON.parse(result.content[0].text);
      }
    } catch (e) {
      console.warn('Failed to list threads:', e);
    }
    return [];
  }

  // Get thread messages
  async getThreadMessages(threadId: string): Promise<Array<{ role: string; content: unknown[] }>> {
    try {
      const result = await this.callTool('get_thread', { thread_id: threadId });
      if (result.content?.[0]?.text) {
        const thread = JSON.parse(result.content[0].text);
        return thread.messages || [];
      }
    } catch (e) {
      console.warn('Failed to get thread:', e);
    }
    return [];
  }

  // Delete a thread
  async deleteThread(threadId: string): Promise<void> {
    await this.callTool('delete_thread', { thread_id: threadId });
  }

  // Clear session
  async disconnect(): Promise<void> {
    this.initialized = false;
    this.sessionId = null;
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }

  // Get current session ID
  getSessionId(): string | null {
    return this.sessionId;
  }

  // Check if connected
  isConnected(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let client: MCPClient | null = null;

export function getMCPClient(baseUrl?: string): MCPClient {
  if (!client && baseUrl) {
    client = new MCPClient(baseUrl);
  }
  if (!client) {
    throw new Error('MCP Client not initialized. Call getMCPClient with baseUrl first.');
  }
  return client;
}

export function resetMCPClient(): void {
  client = null;
}
