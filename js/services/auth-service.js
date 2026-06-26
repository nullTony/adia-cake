// ================================
//  AUTH SERVICE — Supabase
//
//  Client flow (Telegram session confirmation):
//    1. startAuth(phone)                         → creates auth_session, returns { sessionId, isReturning }
//    2. Bot sends confirm button                 → proactive interval (returning) or /start+contact (new)
//    3. pollAuthSession(sessionId, signal)       → polls DB every 2s until resolved
//    4. finalizeClientLogin(phone, name, sessId) → finds/creates client, saves session
//
//  Staff flow:
//    verifyAdminPassword(phone, password) → lookup staff_users, compare password
//
//  Session format in localStorage:
//    { clientId, type: 'client' }  or  { staffId, type: 'staff' }
// ================================

import { getClientByPhone, getClientById, createClient, updateClient } from '../api/clients-api.js';
import { getStaffByPhoneWithPassword, getStaffById, fromStaff }        from '../api/staff-api.js';
import { createAuthSession, getAuthSession }                            from '../api/tg-verification-api.js';
import { showLogoutConfirm }                                            from '../modules/auth-modal.js';

const SESSION_KEY = 'adia_user_session';
const SESSION_VALIDATION_KEY = 'adia_session_validated_at';
const SESSION_VALIDATION_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ── In-memory state ───────────────────────────────────────────────────────────

let _currentUser = null;

// ── localStorage helpers ──────────────────────────────────────────────────────

function _readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}

function _clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_VALIDATION_KEY);
}

function _isSessionCacheValid() {
  try {
    const lastValidated = localStorage.getItem(SESSION_VALIDATION_KEY);
    if (!lastValidated) return false;
    const timestamp = parseInt(lastValidated, 10);
    return Date.now() - timestamp < SESSION_VALIDATION_TTL;
  } catch {
    return false;
  }
}

function _markSessionAsValidated() {
  localStorage.setItem(SESSION_VALIDATION_KEY, String(Date.now()));
}

// ── Public session API ────────────────────────────────────────────────────────

export function getCurrentUser()  { return _currentUser; }
export function isAuthenticated() { return _currentUser !== null; }
export function isAdmin()         { return _currentUser?.type === 'staff'; }

// ── initAuth ──────────────────────────────────────────────────────────────────

export async function initAuth() {
  const stored = _readSession();
  if (!stored || !stored.type) {
    _clearSession();
    _currentUser = null;
    _emitAuthChange();
    return;
  }

  // Trust cached session if validated recently (within 24 hours)
  if (_isSessionCacheValid()) {
    _currentUser = stored;
    _emitAuthChange();
    return;
  }

  // Re-validate session with Supabase if cache expired
  try {
    if (stored.type === 'client' && stored.clientId) {
      _currentUser = await getClientById(stored.clientId);
    } else if (stored.type === 'staff' && stored.staffId) {
      _currentUser = await getStaffById(stored.staffId);
    } else {
      _currentUser = null;
    }
  } catch {
    _currentUser = null;
  }

  if (!_currentUser) {
    _clearSession();
  } else {
    _markSessionAsValidated();
  }
  _emitAuthChange();
}

// ── logout ────────────────────────────────────────────────────────────────────

function _performLogout() {
  _currentUser = null;
  _clearSession();
  _emitAuthChange();
  window.location.href = '/index.html';
}

export async function logout() {
  showLogoutConfirm(_performLogout);
}

function _emitAuthChange() {
  window.dispatchEvent(new CustomEvent('adia:auth-change', { detail: { user: _currentUser } }));
}

// ── Step 1: Check phone ───────────────────────────────────────────────────────
// Returns { role: 'admin' | 'client' | 'new' }

export async function checkPhone(phone) {
  const staffRow = await getStaffByPhoneWithPassword(phone).catch(() => null);
  if (staffRow && staffRow.is_active !== false) return { role: 'admin' };

  const client = await getClientByPhone(phone).catch(() => null);
  if (client) return { role: 'client' };

  return { role: 'new' };
}

// ── Step 2: Create auth session ───────────────────────────────────────────────
// Returns { sessionId, isReturning }
//   isReturning = true  → bot will send confirm button automatically via its polling interval
//   isReturning = false → user must open bot and share their contact

export async function startAuth(phone) {
  const session = await createAuthSession(phone);
  if (!session) throw new Error('Не удалось создать сессию. Попробуйте позже.');

  const client      = await getClientByPhone(phone).catch(() => null);
  const isReturning = !!(client?.telegramId);

  return { sessionId: session.id, isReturning };
}

// ── Step 3: Poll until session resolved ──────────────────────────────────────
// Returns 'confirmed' | 'cancelled' | 'expired' | 'timeout' | 'aborted'

export async function pollAuthSession(sessionId, signal) {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    if (signal?.aborted) return 'aborted';
    await _sleep(2000);
    if (signal?.aborted) return 'aborted';

    let session;
    try {
      session = await getAuthSession(sessionId);
    } catch {
      continue; // transient network error — keep trying
    }

    if (!session)                        return 'expired';
    if (session.status === 'confirmed')  return 'confirmed';
    if (session.status === 'cancelled')  return 'cancelled';
    if (session.status === 'expired')    return 'expired';
  }
  return 'timeout';
}

// ── Step 4: Finalize client login ─────────────────────────────────────────────
// Reads telegram_chat_id from the auth_session, finds/creates client, saves local session.

export async function finalizeClientLogin(phone, name = '', sessionId = null) {
  // Safety: staff phones must never produce a client session
  const staffRow = await getStaffByPhoneWithPassword(phone).catch(() => null);
  if (staffRow && staffRow.is_active !== false) {
    const staffUser = fromStaff(staffRow);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ staffId: staffUser.id, type: 'staff' }));
    _markSessionAsValidated();
    _currentUser = staffUser;
    _emitAuthChange();
    return _currentUser;
  }

  // Pull telegram_chat_id from the completed session
  let telegramChatId = null;
  if (sessionId) {
    const session = await getAuthSession(sessionId).catch(() => null);
    telegramChatId = session?.telegram_chat_id ? String(session.telegram_chat_id) : null;
  }

  let client = await getClientByPhone(phone);
  if (!client) {
    client = await createClient({ phone, name: name || 'Пользователь', telegramChatId });
  } else if (telegramChatId && !client.telegramId) {
    updateClient(client.id, { telegramChatId }).catch(() => {});
    client = { ...client, telegramId: telegramChatId };
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify({ clientId: client.id, type: 'client' }));
  _markSessionAsValidated();
  _currentUser = client;
  _emitAuthChange();
  return _currentUser;
}

// ── Staff password login ──────────────────────────────────────────────────────

export async function verifyAdminPassword(phone, password) {
  const row = await getStaffByPhoneWithPassword(phone);
  if (!row)           throw new Error('Сотрудник не найден');
  if (!row.is_active) throw new Error('Аккаунт деактивирован');

  const stored = row.password ?? null;
  const valid  = stored !== null && stored === password;
  if (!valid) throw new Error('Неверный пароль');

  const staffUser = fromStaff(row);
  localStorage.setItem(SESSION_KEY, JSON.stringify({ staffId: staffUser.id, type: 'staff' }));
  _markSessionAsValidated();
  _currentUser = staffUser;
  _emitAuthChange();
  return _currentUser;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
