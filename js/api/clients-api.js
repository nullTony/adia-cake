// ================================
//  CLIENTS API — Supabase
//  Table: clients
//  Regular customer accounts.
// ================================

import { sbFetch } from './supabase-client.js';

const TABLE = 'clients';

export function fromClient(row) {
  return {
    id:               row.id,
    name:             row.full_name            || '',
    phone:            row.phone                || '',
    telegramId:       row.telegram_chat_id ? String(row.telegram_chat_id) : null,
    isVerified:       row.is_verified          || false,
    createdAt:        row.created_at           || '',
    type:             'client',
  };
}

function _clean(phone) {
  return '+' + (phone || '').replace(/\D/g, '');
}

// ── Queries (SECURITY DEFINER RPCs — no direct anon SELECT on clients) ────────

export async function getClientByPhone(phone) {
  const clean = _clean(phone);
  const row = await sbFetch('/rpc/get_client_by_phone', {
    method: 'POST',
    body:   JSON.stringify({ p_phone: clean }),
  });
  if (row && row.id) return fromClient(row);
  // Fallback: try phone exactly as entered if normalisation changed it
  if (clean !== phone) {
    const row2 = await sbFetch('/rpc/get_client_by_phone', {
      method: 'POST',
      body:   JSON.stringify({ p_phone: phone }),
    });
    if (row2 && row2.id) return fromClient(row2);
  }
  return null;
}

export async function getClientById(id) {
  if (!id) return null;
  const row = await sbFetch('/rpc/get_client_by_id', {
    method: 'POST',
    body:   JSON.stringify({ p_id: id }),
  });
  return row && row.id ? fromClient(row) : null;
}

export async function getAllClients(search = '') {
  const rows = await sbFetch(`/rpc/get_all_clients`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_search: search }),
  });
  return Array.isArray(rows) ? rows.map(fromClient) : [];
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createClient({ name, phone, telegramChatId = null }) {
  const result = await sbFetch('/rpc/create_client', {
    method: 'POST',
    body:   JSON.stringify({
      p_full_name:        name || 'Пользователь',
      p_phone:            _clean(phone),
      p_telegram_chat_id: telegramChatId || null,
    }),
  });
  const row = Array.isArray(result) ? result[0] : result;
  return row ? fromClient(row) : null;
}

// Client: bind Telegram chat_id after verification via SECURITY DEFINER RPC.
// Fire-and-forget safe — errors are swallowed; session is already updated in-memory.
export async function updateClientTelegram(id, chatId) {
  await sbFetch('/rpc/update_client_telegram', {
    method: 'POST',
    body:   JSON.stringify({ p_id: id, p_chat_id: chatId }),
  }).catch(() => {});
}

// Admin: update client fields (requires staff JWT — staff_all_clients policy allows PATCH+RETURNING).
export async function updateClient(id, fields) {
  const payload = { updated_at: new Date().toISOString() };
  if (fields.name           !== undefined) payload.full_name        = fields.name;
  if (fields.telegramChatId !== undefined) payload.telegram_chat_id = fields.telegramChatId;
  if (fields.isVerified     !== undefined) payload.is_verified      = fields.isVerified;

  const rows = await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify(payload),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromClient(row) : null;
}
