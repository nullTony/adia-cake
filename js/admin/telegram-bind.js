// ================================
//  ADMIN — Telegram Binding Page
//  Allows staff to link Telegram account via the shared bot.
// ================================

import { getStaffSession }           from './rbac.js';
import { createAuthSession,
         getAuthSession }             from '../api/tg-verification-api.js';
import { updateStaffTelegramChatId } from '../api/staff-api.js';
import { API_CONFIG }                from '../config/api-config.js';

const SESSION_KEY = 'adia_staff';

const phoneEl  = document.getElementById('tbPhone');
const openBtn  = document.getElementById('tbOpenBtn');
const statusEl = document.getElementById('tbStatus');
const skipBtn  = document.getElementById('tbSkip');

let _pollTimer = null;

// ── Guard: redirect if already bound ─────────────────────────────────────────

const staff = getStaffSession();
if (!staff?.id) {
  window.location.replace('login.html');
} else if (staff.telegram_chat_id) {
  window.location.replace(_homeFor(staff.role));
}

// ── Display phone ─────────────────────────────────────────────────────────────

if (phoneEl && staff?.phone) {
  phoneEl.textContent = staff.phone;
}

// ── Open bot + start session ──────────────────────────────────────────────────

openBtn?.addEventListener('click', async () => {
  openBtn.disabled = true;
  _setStatus('Создаём сессию…', '');

  try {
    const session = await createAuthSession(staff.phone);
    if (!session?.id) throw new Error('Не удалось создать сессию');

    // Open bot in new tab
    const botUsername = API_CONFIG.TELEGRAM?.BOT_USERNAME || '@nodetree_bot';
    window.open(`https://t.me/${botUsername.replace('@', '')}`, '_blank');

    _setStatus('Ожидаем подтверждения… ⏳', 'waiting');
    _startPolling(session.id);
  } catch (err) {
    _setStatus('Ошибка: ' + (err.message || 'попробуйте ещё раз'), 'error');
    openBtn.disabled = false;
  }
});

// ── Skip ──────────────────────────────────────────────────────────────────────

skipBtn?.addEventListener('click', () => {
  clearInterval(_pollTimer);
  window.location.href = _homeFor(staff.role);
});

// ── Polling ───────────────────────────────────────────────────────────────────

function _startPolling(sessionId) {
  clearInterval(_pollTimer);
  _pollTimer = setInterval(() => _checkSession(sessionId), 2000);
}

async function _checkSession(sessionId) {
  try {
    const session = await getAuthSession(sessionId);
    if (!session) return;

    if (session.status === 'confirmed') {
      clearInterval(_pollTimer);
      await _onConfirmed(session);
    } else if (session.status === 'cancelled') {
      clearInterval(_pollTimer);
      _setStatus('Вход отменён в Telegram. Попробуйте ещё раз.', 'error');
      openBtn.disabled = false;
    }
  } catch { /* network error, retry next tick */ }
}

async function _onConfirmed(session) {
  const chatId = session.telegram_chat_id;
  if (!chatId) {
    _setStatus('Ошибка: chat_id не получен', 'error');
    openBtn.disabled = false;
    return;
  }

  try {
    await updateStaffTelegramChatId(staff.id, chatId);

    // Update local session
    const fresh = { ...staff, telegram_chat_id: chatId };
    localStorage.setItem(SESSION_KEY, JSON.stringify(fresh));

    _setStatus('✅ Telegram успешно привязан!', 'success');
    setTimeout(() => { window.location.href = _homeFor(staff.role); }, 1500);
  } catch (err) {
    _setStatus('Ошибка сохранения: ' + (err.message || 'попробуйте ещё раз'), 'error');
    openBtn.disabled = false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _setStatus(text, cls) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className   = 'tb-status' + (cls ? ' ' + cls : '');
}

function _homeFor(role) {
  return (['manager', 'operator'].includes(role)) ? 'orders.html' : 'index.html';
}
