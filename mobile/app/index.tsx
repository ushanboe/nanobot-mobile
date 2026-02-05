// Main chat screen
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  Text,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Message } from '@/components/Message';
import { ChatInput } from '@/components/ChatInput';
import { ThreadList } from '@/components/ThreadList';
import { useChatStore } from '@/store/chatStore';
import { Colors, Spacing, FontSizes } from '@/constants/theme';
import type { Message as MessageType } from '@/types/mcp';

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const flatListRef = useRef<FlatList>(null);
  const [showThreads, setShowThreads] = useState(false);

  const {
    isConnected,
    isConnecting,
    connectionError,
    serverUrl,
    messages,
    isSending,
    currentThreadId,
    agents,
    currentAgentId,
    selectThread,
    selectAgent,
    sendMessage,
    loadThreads,
  } = useChatStore();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSend = (text: string, attachments?: Array<{ type: string; data: string; mimeType: string }>) => {
    sendMessage(text, attachments);
  };

  const handleSelectThread = (threadId: string) => {
    selectThread(threadId);
  };

  // Not connected state
  if (!serverUrl) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="cloud-offline-outline" size={64} color={colors.textSecondary} />
        <Text style={[styles.statusTitle, { color: colors.text }]}>Not Connected</Text>
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>
          Configure your Nanobot server to get started
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/settings')}
        >
          <Text style={styles.primaryButtonText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Connecting state
  if (isConnecting) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="sync-outline" size={64} color={colors.primary} />
        <Text style={[styles.statusTitle, { color: colors.text }]}>Connecting...</Text>
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>{serverUrl}</Text>
      </View>
    );
  }

  // Connection error state
  if (connectionError) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        <Text style={[styles.statusTitle, { color: colors.text }]}>Connection Failed</Text>
        <Text style={[styles.statusText, { color: colors.textSecondary }]}>{connectionError}</Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={() => useChatStore.getState().connect()}
        >
          <Text style={styles.primaryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: colors.border }]}
          onPress={() => router.push('/settings')}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentAgent = agents.find((a) => a.id === currentAgentId);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header bar with thread/agent selectors */}
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setShowThreads(true)}
        >
          <Ionicons name="menu-outline" size={24} color={colors.text} />
        </TouchableOpacity>

        {/* Agent selector */}
        {agents.length > 1 && (
          <TouchableOpacity
            style={[styles.agentSelector, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.agentName, { color: colors.text }]} numberOfLines={1}>
              {currentAgent?.name || 'Select Agent'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push('/settings')}
        >
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Messages list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={({ item }) => <Message message={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.messageList,
          { paddingBottom: Spacing.md },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubble-ellipses-outline" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyChatText, { color: colors.textSecondary }]}>
              Start a conversation
            </Text>
            {currentAgent && (
              <Text style={[styles.emptyChatAgent, { color: colors.primary }]}>
                with {currentAgent.name}
              </Text>
            )}
          </View>
        }
      />

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={!isConnected}
        isSending={isSending}
      />

      {/* Thread list modal */}
      <Modal
        visible={showThreads}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowThreads(false)}
      >
        <ThreadList
          onSelectThread={handleSelectThread}
          onClose={() => setShowThreads(false)}
        />
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  statusTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '600',
    marginTop: Spacing.md,
  },
  statusText: {
    fontSize: FontSizes.md,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  primaryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    marginTop: Spacing.lg,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    marginTop: Spacing.md,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '500',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: Spacing.sm,
  },
  agentSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    gap: Spacing.xs,
    maxWidth: 200,
  },
  agentName: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  messageList: {
    flexGrow: 1,
    paddingTop: Spacing.md,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl * 4,
  },
  emptyChatText: {
    fontSize: FontSizes.lg,
    marginTop: Spacing.md,
  },
  emptyChatAgent: {
    fontSize: FontSizes.md,
    fontWeight: '500',
    marginTop: Spacing.xs,
  },
});
