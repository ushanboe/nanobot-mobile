// Main chat screen with proper nanobot integration
import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

export default function ChatScreen() {
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{role: string, text: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleConnect = async () => {
    if (!serverUrl) {
      alert('Please enter a server URL');
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
      const toolNames = toolsData.result?.tools?.map((t: any) => t.name).join(', ') || 'none';

      setIsConnected(true);
      setMessages([{ role: 'assistant', text: `Connected! Available tools: ${toolNames}` }]);
    } catch (error) {
      alert(`Connection failed: ${error}`);
    }
    setIsLoading(false);
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
      const response = await fetch(`${serverUrl}/mcp/ui`, {
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

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Nanobot Mobile</Text>
        <Text style={styles.subtitle}>Connect to your server</Text>
        <TextInput
          style={styles.input}
          placeholder="https://nanobot-mobile-production.up.railway.app"
          placeholderTextColor="#666"
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Connect</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Connected</Text>
        <TouchableOpacity onPress={() => { setIsConnected(false); setMessages([]); setSessionId(''); }}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
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
          editable={!isLoading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!message.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!message.trim() || isLoading}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginTop: 100,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#2a2a4e',
    color: '#fff',
    padding: 15,
    marginHorizontal: 20,
    borderRadius: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#6366f1',
    padding: 15,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
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
    padding: 15,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginLeft: 10,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
