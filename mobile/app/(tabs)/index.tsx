// Main chat screen with proper nanobot integration
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { loadSettings, type Settings } from '../../utils/settings';

export default function ChatScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{role: string, text: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasConnectedRef = useRef(false);

  // Load settings on focus (to pick up changes from Settings tab)
  useFocusEffect(
    useCallback(() => {
      loadSettings().then((loaded) => {
        setSettings(loaded);
        setSettingsLoading(false);
        // Auto-connect if settings changed and we're not connected
        if (loaded.serverUrl && !hasConnectedRef.current) {
          hasConnectedRef.current = true;
          handleConnectWithUrl(loaded.serverUrl);
        }
      });
    }, [])
  );

  const handleConnectWithUrl = async (serverUrl: string) => {
    if (!serverUrl) {
      return;
    }

    setIsLoading(true);
    try {
      // Initialize MCP connection
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

      const newSessionId = response.headers.get('Mcp-Session-Id');
      if (newSessionId) {
        setSessionId(newSessionId);
      }

      // List available tools
      const toolsResponse = await fetch(`${serverUrl}/mcp/ui`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(newSessionId && { 'Mcp-Session-Id': newSessionId })
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '2',
          method: 'tools/list',
          params: {}
        })
      });
      const toolsData = await toolsResponse.json();
      const tools = toolsData.result?.tools?.map((t: any) => t.name) || [];
      setAvailableTools(tools);
      const toolNames = tools.join(', ') || 'none';

      setIsConnected(true);
      setMessages([{ role: 'assistant', text: `Connected to ${serverUrl}\n\nAvailable tools: ${toolNames}` }]);
    } catch (error) {
      setMessages([{ role: 'assistant', text: `Connection failed: ${error}\n\nPlease check your server URL in Settings.` }]);
    }
    setIsLoading(false);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setMessages([]);
    setSessionId('');
    setAvailableTools([]);
    hasConnectedRef.current = false;
  };

  const handleConnect = () => {
    if (settings?.serverUrl) {
      handleConnectWithUrl(settings.serverUrl);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setMessage('');
    setIsLoading(true);

    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // Call the 'chat-with-assistant' tool
      const response = await fetch(`${settings?.serverUrl}/mcp/ui`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionId && { 'Mcp-Session-Id': sessionId })
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now().toString(),
          method: 'tools/call',
          params: {
            name: 'chat-with-assistant',
            arguments: {
              prompt: userMessage
            }
          }
        })
      });

      const newSessionId = response.headers.get('Mcp-Session-Id');
      if (newSessionId) {
        setSessionId(newSessionId);
      }

      const data = await response.json();

      // Extract the response text
      let responseText = 'No response';
      if (data.result?.content) {
        for (const item of data.result.content) {
          if (item.type === 'text' && item.text) {
            responseText = item.text;
            break;
          }
        }
      } else if (data.error) {
        responseText = `Error: ${data.error.message}`;
      }

      setMessages(prev => [...prev, { role: 'assistant', text: responseText }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${error}` }]);
    }

    setIsLoading(false);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Show loading state while settings are loading
  if (settingsLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator color="#6366f1" size="large" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  // Show setup prompt if no server URL configured
  if (!settings?.serverUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="settings-outline" size={60} color="#6366f1" style={styles.setupIcon} />
          <Text style={styles.title}>Welcome to Nanobot</Text>
          <Text style={styles.subtitle}>Configure your server to get started</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="arrow-forward" size={20} color="#fff" />
            <Text style={styles.buttonText}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show connecting state
  if (!isConnected && isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator color="#6366f1" size="large" />
          <Text style={styles.loadingText}>Connecting to server...</Text>
        </View>
      </View>
    );
  }

  // Show retry prompt if connection failed
  if (!isConnected && !isLoading && messages.length > 0) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={60} color="#f87171" style={styles.setupIcon} />
          <Text style={styles.title}>Connection Failed</Text>
          <Text style={styles.errorMessage}>{messages[0]?.text}</Text>
          <TouchableOpacity style={styles.button} onPress={handleConnect}>
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.buttonText}>Retry Connection</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => router.push('/settings')}
          >
            <Text style={styles.secondaryButtonText}>Check Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.connectedDot} />
          <Text style={styles.headerText}>Connected</Text>
        </View>
        <TouchableOpacity onPress={handleDisconnect}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg, i) => (
          <View key={i} style={[styles.message, msg.role === 'user' ? styles.userMessage : styles.assistantMessage]}>
            <Text style={styles.messageText}>{msg.text}</Text>
          </View>
        ))}
        {isLoading && (
          <View style={[styles.message, styles.assistantMessage]}>
            <ActivityIndicator color="#6366f1" size="small" />
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.chatInput}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          value={message}
          onChangeText={setMessage}
          onSubmitEditing={handleSend}
          onFocus={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 300)}
          editable={!isLoading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!message.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!message.trim() || isLoading}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  setupIcon: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 30,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    marginTop: 15,
  },
  errorMessage: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#6366f1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  secondaryButtonText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
  },
  headerText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '500',
  },
  disconnectText: {
    color: '#f87171',
    fontSize: 14,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 15,
    paddingBottom: 20,
  },
  message: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    maxWidth: '85%',
  },
  userMessage: {
    backgroundColor: '#6366f1',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantMessage: {
    backgroundColor: '#2a2a4e',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingTop: 15,
    paddingHorizontal: 15,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#2a2a4e',
    color: '#fff',
    padding: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#6366f1',
    width: 44,
    height: 44,
    borderRadius: 22,
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
