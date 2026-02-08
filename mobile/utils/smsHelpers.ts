const SMS_KEYWORDS = [
  'sms',
  'text message',
  'text messages',
  'send a text',
  'send text',
  'send sms',
  'my texts',
  'my text',
  'recent texts',
  'recent text',
  'read my texts',
  'read my messages',
  'check my texts',
  'check my messages',
  'who texted',
  'who messaged',
  'unread texts',
  'unread text',
  'reply to text',
  'respond to text',
  'text back',
];

export function isSmsRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return SMS_KEYWORDS.some((kw) => lower.includes(kw));
}

export interface SmsAction {
  to: string;
  body: string;
}

export interface ParsedResponse {
  displayText: string;
  smsAction: SmsAction | null;
}

export function parseResponseForActions(responseText: string): ParsedResponse {
  const actionRegex = /\[ACTION:SEND_SMS\]([\s\S]*?)\[\/ACTION\]/;
  const match = responseText.match(actionRegex);

  if (!match) {
    return { displayText: responseText, smsAction: null };
  }

  try {
    const actionData = JSON.parse(match[1]);
    const displayText = responseText.replace(actionRegex, '').trim();
    return {
      displayText,
      smsAction: {
        to: actionData.to,
        body: actionData.body,
      },
    };
  } catch {
    return { displayText: responseText, smsAction: null };
  }
}
