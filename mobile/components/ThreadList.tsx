// Thread list sidebar/drawer component
import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSizes } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import type { Thread } from '@/types/mcp';

interface Props {
  onSelectThread: (threadId: string) => void;
  onClose: () => void;
}

export function ThreadList({ onSelectThread, onClose }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const { threads, currentThreadId, createThread, deleteThread } = useChatStore();

  const handleNewChat = () => {
    const threadId = createThread();
    onSelectThread(threadId);
    onClose();
  };

  const handleSelectThread = (threadId: string) => {
    onSelectThread(threadId);
    onClose();
  };

  const handleDeleteThread = (thread: Thread) => {
    Alert.alert(
      'Delete Chat',
      `Are you sure you want to delete "${thread.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteThread(thread.id),
        },
      ]
    );
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const renderThread = ({ item }: { item: Thread }) => {
    const isActive = item.id === currentThreadId;

    return (
      <TouchableOpacity
        style={[
          styles.threadItem,
          {
            backgroundColor: isActive ? colors.primary + '20' : 'transparent',
            borderLeftColor: isActive ? colors.primary : 'transparent',
          },
        ]}
        onPress={() => handleSelectThread(item.id)}
        onLongPress={() => handleDeleteThread(item)}
      >
        <View style={styles.threadContent}>
          <Text
            style={[styles.threadTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={[styles.threadDate, { color: colors.textSecondary }]}>
            {formatDate(item.updatedAt)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteThread(item)}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Chats</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* New chat button */}
      <TouchableOpacity
        style={[styles.newChatButton, { backgroundColor: colors.primary }]}
        onPress={handleNewChat}
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.newChatText}>New Chat</Text>
      </TouchableOpacity>

      {/* Thread list */}
      <FlatList
        data={threads}
        renderItem={renderThread}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No conversations yet
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: Spacing.md,
    padding: Spacing.sm,
    borderRadius: 8,
    gap: Spacing.xs,
  },
  newChatText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: Spacing.xl,
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderLeftWidth: 3,
  },
  threadContent: {
    flex: 1,
  },
  threadTitle: {
    fontSize: FontSizes.md,
    fontWeight: '500',
  },
  threadDate: {
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  deleteButton: {
    padding: Spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.md,
  },
});
