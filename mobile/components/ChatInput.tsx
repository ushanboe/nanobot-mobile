// Chat input component with attachment and voice input support
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { Colors, Spacing, FontSizes } from '@/constants/theme';
import type { Attachment } from '@/types/mcp';

interface Props {
  onSend: (text: string, attachments?: Array<{ type: string; uri: string; name: string; mimeType: string; base64?: string }>) => void;
  disabled?: boolean;
  isSending?: boolean;
}

export function ChatInput({ onSend, disabled, isSending }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isListening, setIsListening] = useState(false);

  // Speech recognition event handlers
  useSpeechRecognitionEvent('result', (event) => {
    if (event.results && event.results.length > 0) {
      setText(event.results[0].transcript);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    if (event.error === 'not-allowed') {
      Alert.alert('Permission needed', 'Please grant microphone and speech recognition permissions.');
    }
  });

  const toggleListening = async () => {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission needed', 'Please grant microphone and speech recognition permissions to use voice input.');
      return;
    }

    setIsListening(true);
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      addsPunctuation: true,
    });
  };

  const handleSend = () => {
    if ((!text.trim() && attachments.length === 0) || disabled || isSending) return;

    // Stop listening if active
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Pass attachments directly — base64 was captured at pick time by ImagePicker
    const formattedAttachments = attachments.map((att) => ({
      type: att.type,
      uri: att.uri,
      name: att.name,
      mimeType: att.mimeType,
      base64: att.base64,
    }));

    onSend(text.trim(), formattedAttachments.length > 0 ? formattedAttachments : undefined);
    setText('');
    setAttachments([]);
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please grant photo library access to attach images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.4,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachments((prev) => [
        ...prev,
        {
          type: 'image' as const,
          uri: asset.uri,
          name: asset.fileName || 'image.jpg',
          mimeType: asset.mimeType || 'image/jpeg',
          base64: asset.base64 || undefined,
        },
      ]);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please grant camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.4,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachments((prev) => [
        ...prev,
        {
          type: 'image' as const,
          uri: asset.uri,
          name: 'photo.jpg',
          mimeType: 'image/jpeg',
          base64: asset.base64 || undefined,
        },
      ]);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachments((prev) => [
        ...prev,
        {
          type: 'file' as const,
          uri: asset.uri,
          name: asset.name || 'document',
          mimeType: asset.mimeType || 'application/octet-stream',
        },
      ]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const canSend = (text.trim() || attachments.length > 0) && !disabled && !isSending;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {/* Attachment preview */}
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          style={styles.attachmentsContainer}
          contentContainerStyle={styles.attachmentsContent}
          showsHorizontalScrollIndicator={false}
        >
          {attachments.map((att, index) => (
            <View key={index} style={styles.attachmentPreview}>
              {att.type === 'image' ? (
                <Image source={{ uri: att.uri }} style={styles.attachmentImage} />
              ) : (
                <View style={[styles.filePreview, { backgroundColor: colors.background }]}>
                  <Ionicons name="document-outline" size={28} color={colors.textSecondary} />
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={2}>{att.name}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.removeButton, { backgroundColor: colors.error }]}
                onPress={() => removeAttachment(index)}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputRow}>
        {/* Attachment buttons */}
        <TouchableOpacity
          style={[styles.iconButton, { opacity: disabled ? 0.5 : 1 }]}
          onPress={pickImage}
          disabled={disabled}
        >
          <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, { opacity: disabled ? 0.5 : 1 }]}
          onPress={takePhoto}
          disabled={disabled}
        >
          <Ionicons name="camera-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, { opacity: disabled ? 0.5 : 1 }]}
          onPress={pickDocument}
          disabled={disabled}
        >
          <Ionicons name="document-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Mic button */}
        <TouchableOpacity
          style={[styles.iconButton, { opacity: disabled ? 0.5 : 1 }]}
          onPress={toggleListening}
          disabled={disabled || isSending}
        >
          <Ionicons
            name={isListening ? 'mic' : 'mic-outline'}
            size={24}
            color={isListening ? colors.error : colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.background,
              color: colors.text,
              borderColor: isListening ? colors.error : colors.border,
            },
          ]}
          placeholder={isListening ? 'Listening...' : 'Message...'}
          placeholderTextColor={isListening ? colors.error : colors.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={10000}
          editable={!disabled}
        />

        {/* Send button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor: canSend ? colors.primary : colors.border,
            },
          ]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="arrow-up" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingBottom: Spacing.md,
  },
  attachmentsContainer: {
    maxHeight: 100,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  attachmentsContent: {
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  attachmentPreview: {
    position: 'relative',
    marginRight: Spacing.sm,
  },
  attachmentImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  filePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  fileName: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
  },
  iconButton: {
    padding: Spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
    maxHeight: 120,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
