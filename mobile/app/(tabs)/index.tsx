// Main chat screen with proper nanobot integration
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Linking, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import Markdown from 'react-native-markdown-display';
import { ChatInput } from '../../components/ChatInput';
import { loadSettings, type Settings } from '../../utils/settings';
import * as SmsService from '../../services/smsService';
import { isSmsRelated, parseResponseForActions } from '../../utils/smsHelpers';

export default function ChatScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<Array<{role: string, text: string, imageUri?: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasConnectedRef = useRef(false);

  const handleSpeak = async (text: string, index: number) => {
    if (speakingIndex === index) {
      Speech.stop();
      setSpeakingIndex(null);
      return;
    }
    Speech.stop();
    setSpeakingIndex(index);
    Speech.speak(text, {
      onDone: () => setSpeakingIndex(null),
      onStopped: () => setSpeakingIndex(null),
      onError: () => setSpeakingIndex(null),
    });
  };

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

  const handleSend = async (text: string, attachments?: Array<{ type: string; uri: string; name: string; mimeType: string; base64?: string }>) => {
    if ((!text.trim() && (!attachments || attachments.length === 0)) || isLoading) return;

    const userMessage = text.trim();
    const hasAttachments = attachments && attachments.length > 0;

    // Use the file URI directly for display
    const imageUri = hasAttachments && attachments[0].type === 'image'
      ? attachments[0].uri
      : undefined;

    setMessages(prev => [...prev, { role: 'user', text: userMessage || '[Attachment]', imageUri }]);
    setIsLoading(true);

    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    const prompt = userMessage || 'What do you see in this image?';

    // SMS context injection: if message seems SMS-related, read recent messages
    // and prepend them to the prompt so the AI has phone SMS data
    let augmentedPrompt = prompt;
    if (isSmsRelated(prompt)) {
      try {
        const smsMessages = await SmsService.getMessages({ box: 'all' }, 30);
        if (smsMessages.length > 0) {
          const smsContext = SmsService.formatSmsForContext(smsMessages);
          augmentedPrompt = `${prompt}\n\n${smsContext}`;
        }
      } catch (error) {
        console.warn('Failed to read SMS for context:', error);
      }
    }

    // Build nanobot attachments array from image and file data
    let nanobotAttachments: Array<{ url: string; mimeType: string; name: string }> | undefined;
    if (hasAttachments) {
      const processed = [];
      for (const a of attachments) {
        if (a.type === 'image' && a.base64) {
          // Images already have base64 from ImagePicker
          processed.push({
            url: `data:${a.mimeType};base64,${a.base64}`,
            mimeType: a.mimeType,
            name: a.name,
          });
        } else if (a.type === 'file' && a.uri) {
          // Read file attachments as base64 via FileSystem
          try {
            const fileBase64 = await FileSystem.readAsStringAsync(a.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            processed.push({
              url: `data:${a.mimeType};base64,${fileBase64}`,
              mimeType: a.mimeType,
              name: a.name,
            });
          } catch {
            // If file read fails, skip this attachment
          }
        }
      }
      if (processed.length > 0) {
        nanobotAttachments = processed;
      }
    }

    // Build tool arguments — include attachments if we have data
    const toolArguments: Record<string, unknown> = { prompt: augmentedPrompt };
    if (nanobotAttachments && nanobotAttachments.length > 0) {
      toolArguments.attachments = nanobotAttachments;
    }

    try {
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
            name: availableTools[0] || 'chat',
            arguments: toolArguments
          }
        })
      });

      const newSessionId = response.headers.get('Mcp-Session-Id');
      if (newSessionId) {
        setSessionId(newSessionId);
      }

      const data = await response.json();

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

      // Parse response for SMS send action tags
      const { displayText, smsAction } = parseResponseForActions(responseText);
      setMessages(prev => [...prev, { role: 'assistant', text: displayText }]);

      // If the AI wants to send an SMS, show confirmation dialog
      if (smsAction) {
        setTimeout(() => {
          Alert.alert(
            'Send SMS?',
            `To: ${smsAction.to}\n\n"${smsAction.body}"`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Send',
                onPress: async () => {
                  const result = await SmsService.sendMessage(smsAction.to, smsAction.body);
                  const statusMsg = result.success
                    ? `SMS sent to ${smsAction.to}`
                    : `Failed to send SMS: ${result.message}`;
                  setMessages(prev => [...prev, { role: 'assistant', text: statusMsg }]);
                },
              },
            ]
          );
        }, 300);
      }
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
            {msg.imageUri && (
              <Image source={{ uri: msg.imageUri }} style={styles.messageImage} />
            )}
            <Markdown
              style={markdownStyles}
              onLinkPress={(url) => { Linking.openURL(url); return false; }}
            >
              {msg.text}
            </Markdown>
            {msg.role === 'assistant' && msg.text && (
              <TouchableOpacity
                style={styles.speakButton}
                onPress={() => handleSpeak(msg.text, i)}
              >
                <Ionicons
                  name={speakingIndex === i ? 'stop-circle-outline' : 'volume-medium-outline'}
                  size={18}
                  color={speakingIndex === i ? '#f87171' : '#888'}
                />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {isLoading && (
          <View style={[styles.message, styles.assistantMessage]}>
            <ActivityIndicator color="#6366f1" size="small" />
          </View>
        )}
      </ScrollView>

      <View style={styles.inputWrapper}>
        <ChatInput
          onSend={handleSend}
          disabled={!isConnected}
          isSending={isLoading}
        />
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
  speakButton: {
    alignSelf: 'flex-end',
    marginTop: 6,
    padding: 4,
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 8,
  },
  inputWrapper: {
    paddingBottom: 25,
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  link: {
    color: '#93c5fd',
    textDecorationLine: 'underline',
  },
  heading1: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold' as const,
    marginVertical: 6,
  },
  heading2: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold' as const,
    marginVertical: 4,
  },
  heading3: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold' as const,
    marginVertical: 4,
  },
  strong: {
    fontWeight: 'bold' as const,
    color: '#fff',
  },
  em: {
    fontStyle: 'italic' as const,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginVertical: 2,
  },
  code_inline: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
    color: '#e2e8f0',
  },
  code_block: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 10,
    borderRadius: 8,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#e2e8f0',
  },
  paragraph: {
    marginVertical: 4,
  },
});
