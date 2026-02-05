// Settings screen
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useChatStore } from '@/store/chatStore';
import { Colors, Spacing, FontSizes } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];

  const { serverUrl, isConnected, setServerUrl, connect, disconnect } = useChatStore();

  const [url, setUrl] = useState(serverUrl || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a server URL');
      return;
    }

    // Validate URL format
    let validUrl = url.trim();
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = 'https://' + validUrl;
    }

    setIsSaving(true);
    try {
      await setServerUrl(validUrl);
      await connect();
      router.back();
    } catch (error) {
      Alert.alert(
        'Connection Failed',
        error instanceof Error ? error.message : 'Failed to connect to server'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect',
      'Are you sure you want to disconnect from the server?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnect();
            setUrl('');
          },
        },
      ]
    );
  };

  const handleClearData = async () => {
    Alert.alert(
      'Clear All Data',
      'This will clear all local data including your server URL and session. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await disconnect();
            await SecureStore.deleteItemAsync('nanobot_server_url');
            await SecureStore.deleteItemAsync('nanobot_session_id');
            setUrl('');
            Alert.alert('Done', 'All local data has been cleared.');
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Server Configuration */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Server</Text>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Server URL</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="https://your-nanobot-server.railway.app"
            placeholderTextColor={colors.textSecondary}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: colors.primary,
                opacity: isSaving ? 0.7 : 1,
              },
            ]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.buttonText}>
              {isSaving ? 'Connecting...' : isConnected ? 'Update & Reconnect' : 'Connect'}
            </Text>
          </TouchableOpacity>

          {isConnected && (
            <View style={styles.connectedStatus}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={[styles.connectedText, { color: colors.success }]}>Connected</Text>
            </View>
          )}
        </View>
      </View>

      {/* Connection Info */}
      {isConnected && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Connection</Text>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Status</Text>
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.infoValue, { color: colors.text }]}>Connected</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Server</Text>
              <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
                {serverUrl}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.dangerButton, { borderColor: colors.error }]}
              onPress={handleDisconnect}
            >
              <Text style={[styles.dangerButtonText, { color: colors.error }]}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* About */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>App Version</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>1.0.0</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Nanobot</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>github.com/nanobot-ai/nanobot</Text>
          </View>
        </View>
      </View>

      {/* Danger Zone */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.error }]}>Danger Zone</Text>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.dangerText, { color: colors.textSecondary }]}>
            Clear all local data including server URL and session information.
          </Text>
          <TouchableOpacity
            style={[styles.dangerButton, { borderColor: colors.error }]}
            onPress={handleClearData}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
            <Text style={[styles.dangerButtonText, { color: colors.error }]}>Clear All Data</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl * 2,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    borderRadius: 12,
    padding: Spacing.md,
  },
  label: {
    fontSize: FontSizes.sm,
    marginBottom: Spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
    marginBottom: Spacing.md,
  },
  button: {
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  connectedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  connectedText: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  infoLabel: {
    fontSize: FontSizes.md,
  },
  infoValue: {
    fontSize: FontSizes.md,
    fontWeight: '500',
    maxWidth: '60%',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dangerText: {
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  dangerButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '500',
  },
});
