// Settings screen with AI provider and API key configuration
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loadSettings, saveSettings, type AIProvider } from '../../utils/settings';

export default function SettingsScreen() {
  const [serverUrl, setServerUrl] = useState('');
  const [aiProvider, setAiProvider] = useState<AIProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings when component mounts
  useEffect(() => {
    loadSettings().then((settings) => {
      setServerUrl(settings.serverUrl);
      setAiProvider(settings.aiProvider);
      setApiKey(settings.apiKey);
      setIsLoading(false);
    });
  }, []);

  const handleSave = async () => {
    if (!serverUrl.trim()) {
      Alert.alert('Error', 'Please enter a server URL');
      return;
    }

    setIsSaving(true);
    try {
      await saveSettings({
        serverUrl: serverUrl.trim(),
        aiProvider,
        apiKey: apiKey.trim(),
      });
      Alert.alert('Success', 'Settings saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Server Configuration</Text>

      <Text style={styles.label}>Server URL</Text>
      <TextInput
        style={styles.input}
        placeholder="https://your-server.railway.app"
        placeholderTextColor="#666"
        value={serverUrl}
        onChangeText={setServerUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text style={styles.sectionTitle}>AI Provider</Text>

      <View style={styles.providerContainer}>
        <TouchableOpacity
          style={[styles.providerButton, aiProvider === 'openai' && styles.providerButtonActive]}
          onPress={() => setAiProvider('openai')}
        >
          <View style={styles.providerContent}>
            <View style={[styles.radioOuter, aiProvider === 'openai' && styles.radioOuterActive]}>
              {aiProvider === 'openai' && <View style={styles.radioInner} />}
            </View>
            <View>
              <Text style={[styles.providerText, aiProvider === 'openai' && styles.providerTextActive]}>
                OpenAI
              </Text>
              <Text style={styles.providerSubtext}>GPT-4o, GPT-4, etc.</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.providerButton, aiProvider === 'anthropic' && styles.providerButtonActive]}
          onPress={() => setAiProvider('anthropic')}
        >
          <View style={styles.providerContent}>
            <View style={[styles.radioOuter, aiProvider === 'anthropic' && styles.radioOuterActive]}>
              {aiProvider === 'anthropic' && <View style={styles.radioInner} />}
            </View>
            <View>
              <Text style={[styles.providerText, aiProvider === 'anthropic' && styles.providerTextActive]}>
                Anthropic
              </Text>
              <Text style={styles.providerSubtext}>Claude 3.5 Sonnet, etc.</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>API Key (Optional)</Text>
      <Text style={styles.hint}>
        Leave blank if API key is configured on the server
      </Text>
      <View style={styles.apiKeyContainer}>
        <TextInput
          style={styles.apiKeyInput}
          placeholder={aiProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
          placeholderTextColor="#666"
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!showApiKey}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowApiKey(!showApiKey)}
        >
          <Ionicons
            name={showApiKey ? 'eye-off-outline' : 'eye-outline'}
            size={22}
            color="#666"
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, isSaving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={isSaving}
      >
        <Text style={styles.buttonText}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color="#6366f1" />
        <Text style={styles.infoText}>
          The server must be running nanobot with the selected AI provider configured.
          Update nanobot.yaml on your server to switch between providers.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 15,
  },
  label: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 10,
  },
  hint: {
    color: '#666',
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2a2a4e',
    color: '#fff',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
  },
  providerContainer: {
    gap: 10,
  },
  providerButton: {
    backgroundColor: '#2a2a4e',
    padding: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  providerButtonActive: {
    borderColor: '#6366f1',
    backgroundColor: '#2a2a5e',
  },
  providerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: '#6366f1',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#6366f1',
  },
  providerText: {
    color: '#ccc',
    fontSize: 16,
    fontWeight: '500',
  },
  providerTextActive: {
    color: '#fff',
  },
  providerSubtext: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  apiKeyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  apiKeyInput: {
    flex: 1,
    backgroundColor: '#2a2a4e',
    color: '#fff',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    paddingRight: 50,
  },
  eyeButton: {
    position: 'absolute',
    right: 15,
    padding: 5,
  },
  button: {
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 30,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#252545',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: {
    color: '#888',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
