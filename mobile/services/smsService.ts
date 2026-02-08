import { NativeModules, Platform, PermissionsAndroid } from 'react-native';

const { SmsModule } = NativeModules;

export interface SmsMessage {
  id: string;
  address: string;
  body: string;
  date: number;
  type: number; // 1=received, 2=sent
  read: boolean;
}

export interface SmsFilter {
  box?: 'inbox' | 'sent' | 'all';
  search?: string;
  address?: string;
}

export interface SmsSendResult {
  success: boolean;
  message: string;
}

export function isSmsAvailable(): boolean {
  return Platform.OS === 'android' && SmsModule != null;
}

export async function requestReadPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: 'SMS Permission',
        message: 'Nanobot needs access to your messages so the AI can help you with SMS.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function requestSendPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      {
        title: 'Send SMS Permission',
        message: 'Nanobot needs permission to send text messages on your behalf.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function getMessages(
  filter: SmsFilter = {},
  count: number = 20
): Promise<SmsMessage[]> {
  if (!isSmsAvailable()) return [];

  const hasPermission = await requestReadPermission();
  if (!hasPermission) return [];

  try {
    const messages = await SmsModule.getMessages(
      {
        box: filter.box || 'inbox',
        search: filter.search || '',
        address: filter.address || '',
      },
      Math.min(count, 100)
    );
    return messages as SmsMessage[];
  } catch (error) {
    console.warn('Failed to read SMS:', error);
    return [];
  }
}

export async function sendMessage(
  phoneNumber: string,
  body: string
): Promise<SmsSendResult> {
  if (!isSmsAvailable()) {
    return { success: false, message: 'SMS not available on this device' };
  }

  const hasPermission = await requestSendPermission();
  if (!hasPermission) {
    return { success: false, message: 'SMS send permission denied' };
  }

  try {
    const result = await SmsModule.sendMessage(phoneNumber, body);
    return result as SmsSendResult;
  } catch (error) {
    return {
      success: false,
      message: `Failed to send SMS: ${error}`,
    };
  }
}

export function formatSmsForContext(messages: SmsMessage[]): string {
  if (messages.length === 0) return '';

  const lines = messages.map((msg) => {
    const direction = msg.type === 1 ? 'FROM' : 'TO';
    const date = new Date(msg.date).toLocaleString();
    const readStatus = msg.type === 1 ? (msg.read ? '' : ' [UNREAD]') : '';
    return `${direction}: ${msg.address} | ${date}${readStatus}\n${msg.body}`;
  });

  return `[SMS_CONTEXT]\nRecent text messages from this phone (${messages.length} messages):\n\n${lines.join('\n---\n')}\n[/SMS_CONTEXT]`;
}
