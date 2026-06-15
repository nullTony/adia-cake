// ================================
//  AUTH SESSIONS API — Supabase
//
//  Table: auth_sessions
//    id, phone, status, telegram_chat_id, expires_at, created_at
//
//  Status flow:
//    pending       — session created, waiting for bot interaction
//    bot_opened    — bot detected returning user, confirm button sent proactively
//    phone_matched — new user shared contact with bot, confirm button sent
//    confirmed     — user tapped ✅ in Telegram
//    cancelled     — user tapped ❌ in Telegram
//    expired       — past expires_at
// ================================

import { sbFetch } from './supabase-client.js';

const TABLE = 'auth_sessions';

export async function createAuthSession(phone) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const rows = await sbFetch(`/${TABLE}`, {
    method:  'POST',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify({ phone, status: 'pending', expires_at: expiresAt }),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row || null;
}

export async function getAuthSession(id) {
  const rows = await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
