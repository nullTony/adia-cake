// ================================
//  TELEGRAM API
// ================================

import { API_CONFIG } from '../config/api-config.js';

const { BOT_USERNAME } = API_CONFIG.TELEGRAM;

const EDGE_URL = `${API_CONFIG.SUPABASE.URL}/functions/v1/telegram-send`;

// Returns a Telegram deep link (triggers /start verify_{code} in bot).
export function buildDeepLink(code) {
  const username = BOT_USERNAME.replace(/^@/, '');
  return `https://t.me/${username}?start=verify_${code}`;
}

// Sends a message via the server-side Edge Function proxy.
// BOT_TOKEN never touches the browser — it lives in Supabase secrets.
export async function sendTelegramMessage(chatId, text, parseMode = null) {
  if (!chatId || !text) return;
  const body = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  await fetch(EDGE_URL, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey':        API_CONFIG.SUPABASE.ANON_KEY,
    },
    body: JSON.stringify(body),
  }).catch(err => console.warn('[telegram] sendMessage failed:', err.message));
}