// Simple settings utility using AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AIProvider = 'openai' | 'anthropic';

export interface Settings {
  serverUrl: string;
  aiProvider: AIProvider;
  apiKey: string;
}

const STORAGE_KEY = '@nanobot_settings';

const defaultSettings: Settings = {
  serverUrl: '',
  aiProvider: 'openai',
  apiKey: '',
};

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return defaultSettings;
}

export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
  try {
    const current = await loadSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}
