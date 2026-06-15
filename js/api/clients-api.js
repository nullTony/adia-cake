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

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getClientByPhone(phone) {
  const clean = _clean(phone);
  const rows  = await sbFetch(`/${TABLE}?phone=eq.${encodeURIComponent(clean)}&limit=1`);
  if (Array.isArray(rows) && rows.length) return fromClient(rows[0]);
  // Fallback: try the phone exactly as entered (in case stored format differs)
  if (clean !== phone) {
    const rows2 = await sbFetch(`/${TABLE}?phone=eq.${encodeURIComponent(phone)}&limit=1`);
    if (Array.isArray(rows2) && rows2.length) return fromClient(rows2[0]);
  }
  return null;
}

export async function getClientById(id) {
  if (!id) return null;
  const rows = await sbFetch(`/${TABLE}?id=eq.${encodeURIComponent(id)}&limit=1`);
  return Array.isArray(rows) && rows.length ? fromClient(rows[0]) : null;
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
  const rows = await sbFetch(`/${TABLE}`, {
    method:  'POST',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify({
      full_name:        name || 'Пользователь',
      phone:            _clean(phone),
      telegram_chat_id: telegramChatId || null,
      is_verified:      true,
    }),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromClient(row) : null;
}

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
