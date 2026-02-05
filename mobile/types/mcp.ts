// MCP Protocol Types - Ported from nanobot
// Based on MCP spec 2024-11-05

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: MessageContent[];
  timestamp: number;
  status?: 'sending' | 'sent' | 'error' | 'streaming';
}

export interface MessageContent {
  type: 'text' | 'image' | 'tool_use' | 'tool_result' | 'resource';
  text?: string;
  data?: string; // base64 for images
  mimeType?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  resourceUri?: string;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  agentId?: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  model?: string;
  systemPrompt?: string;
}

export interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, never>;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface CallToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface StreamEvent {
  type: 'message' | 'tool_call' | 'tool_result' | 'done' | 'error';
  data: unknown;
}

export interface Attachment {
  type: 'image' | 'file';
  uri: string;
  name: string;
  mimeType: string;
  base64?: string;
}
