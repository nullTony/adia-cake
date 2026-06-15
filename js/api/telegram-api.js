// ================================
//  TELEGRAM API
//  Current MVP: deep-link flow.
//
//  Flow:
//    1. Frontend generates a 4-digit code.
//    2. buildDeepLink(code) creates https://t.me/{BOT}?start=verify_{code}
//    3. User opens the link — Telegram sends /start verify_{code} to the bot.
//    4. Bot must echo the code back: "Ваш код: {code}"
//    5. User returns to the site and enters the code.
//    6. Frontend verifies locally (no server round-trip needed).
//
//  Future backend upgrade path:
//    Replace this module with calls to your backend endpoint, which uses
//    Bot API sendMessage() to push the code directly to a known chat_id.
//    The signature of sendCodeViaTelegram() is reserved for that purpose.
// ================================

import { API_CONFIG } from '../config/api-config.js';

const { BOT_USERNAME } = API_CONFIG.TELEGRAM;

// Returns a Telegram deep link.
// Opening it triggers /start verify_{code} inside the bot conversation.
export function buildDeepLink(code) {
  if (!BOT_USERNAME || BOT_USERNAME === 'YOUR_BOT_USERNAME') {
    console.warn('[telegram] BOT_USERNAME not configured in api-config.js');
  }
  // Strip leading '@' — Telegram URLs use the username without it
  const username = BOT_USERNAME.replace(/^@/, '');
  return `https://t.me/${username}?start=verify_${code}`;
}

// ── Placeholder for future backend integration ────────────────────────────
// When you have a backend that knows the user's Telegram chat_id,
// call this to push the code directly without requiring the deep-link step.
//
// export async function sendCodeViaTelegram(phone, code) {
//   const res = await fetch('/api/telegram/send-code', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ phone, code }),
//   });
//   if (!res.ok) throw new Error('Telegram send failed');
// }