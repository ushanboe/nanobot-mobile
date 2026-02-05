// Message component
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Colors, Spacing, FontSizes } from '@/constants/theme';
import type { Message as MessageType, MessageContent } from '@/types/mcp';

interface Props {
  message: MessageType;
}

export function Message({ message }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  const isError = message.status === 'error';

  const renderContent = (content: MessageContent, index: number) => {
    switch (content.type) {
      case 'text':
        if (!content.text) return null;
        return (
          <Markdown
            key={index}
            style={{
              body: {
                color: isUser ? colors.userText : colors.assistantText,
                fontSize: FontSizes.md,
                lineHeight: 24,
              },
              code_inline: {
                backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : colors.surface,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                fontFamily: 'monospace',
              },
              code_block: {
                backgroundColor: isUser ? 'rgba(255,255,255,0.1)' : colors.background,
                padding: Spacing.sm,
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: FontSizes.sm,
              },
              link: {
                color: isUser ? '#93c5fd' : colors.primary,
              },
            }}
          >
            {content.text}
          </Markdown>
        );

      case 'image':
        if (!content.data) return null;
        return (
          <Image
            key={index}
            source={{ uri: `data:${content.mimeType || 'image/png'};base64,${content.data}` }}
            style={styles.image}
            resizeMode="contain"
          />
        );

      case 'tool_use':
        return (
          <View key={index} style={[styles.toolCall, { backgroundColor: colors.surface }]}>
            <Text style={[styles.toolName, { color: colors.primary }]}>
              {content.toolName}
            </Text>
            {content.toolInput && (
              <Text style={[styles.toolInput, { color: colors.textSecondary }]}>
                {JSON.stringify(content.toolInput, null, 2)}
              </Text>
            )}
          </View>
        );

      case 'tool_result':
        return (
          <View key={index} style={[styles.toolResult, { backgroundColor: colors.surface }]}>
            <Text style={[styles.toolResultLabel, { color: colors.textSecondary }]}>
              Result:
            </Text>
            <Text style={[styles.toolResultText, { color: colors.text }]}>
              {typeof content.toolResult === 'string'
                ? content.toolResult
                : JSON.stringify(content.toolResult, null, 2)}
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? colors.userBubble : colors.assistantBubble,
            borderColor: isError ? colors.error : 'transparent',
            borderWidth: isError ? 1 : 0,
          },
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        {message.content.length === 0 && isStreaming ? (
          <View style={styles.streamingIndicator}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={[styles.streamingText, { color: colors.textSecondary }]}>
              Thinking...
            </Text>
          </View>
        ) : (
          message.content.map((content, index) => renderContent(content, index))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 16,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginVertical: Spacing.xs,
  },
  toolCall: {
    padding: Spacing.sm,
    borderRadius: 8,
    marginVertical: Spacing.xs,
  },
  toolName: {
    fontWeight: '600',
    fontSize: FontSizes.sm,
  },
  toolInput: {
    fontSize: FontSizes.xs,
    fontFamily: 'monospace',
    marginTop: Spacing.xs,
  },
  toolResult: {
    padding: Spacing.sm,
    borderRadius: 8,
    marginVertical: Spacing.xs,
  },
  toolResultLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  toolResultText: {
    fontSize: FontSizes.sm,
    fontFamily: 'monospace',
    marginTop: Spacing.xs,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  streamingText: {
    fontSize: FontSizes.sm,
  },
});
