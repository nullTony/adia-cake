// ================================
//  AUTH MODAL
//  Steps: entry → tg → success  (admin: entry → password → success)
//
//  Client TG flow:
//    1. Phone entered → checkPhone() → startAuth() → creates auth_session in DB
//    2a. Returning user (known telegram_chat_id): bot sends confirm button automatically
//    2b. New user: user opens bot, shares contact → bot sends confirm button
//    3. pollAuthSession() polls DB every 2s until confirmed/cancelled/timeout
//    4. finalizeClientLogin() → finds/creates client record → saves local session
//
// ================================

import {
  checkPhone, startAuth, pollAuthSession, finalizeClientLogin, verifyAdminPassword,
} from '../services/auth-service.js';
import { API_CONFIG } from '../config/api-config.js';
import { initPhoneInput } from './phone-input.js';

const BOT_URL = `https://t.me/${API_CONFIG.TELEGRAM.BOT_USERNAME.replace(/^@/, '')}`;

// ── Inject HTML ───────────────────────────────────────────────────────────────

function injectModal() {
  if (document.getElementById('authModal')) return;

  const el = document.createElement('div');
  el.id = 'authModal';
  el.className = 'auth-modal-backdrop';
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('role', 'dialog');
  el.innerHTML = `
    <div class="auth-modal">
      <button type="button" class="auth-modal__close" id="authModalClose" aria-label="Закрыть">&times;</button>

      <!-- Step: entry -->
      <div class="auth-step" id="authStepEntry">
        <h2 class="auth-modal__title">Войти или зарегистрироваться</h2>
        <p class="auth-modal__sub">Введите номер телефона</p>
        <div class="auth-field" id="phoneInputMount"></div>
        <input id="authPhone" type="hidden">
        <div class="auth-error" id="authEntryError"></div>
        <button type="button" class="auth-btn" id="authPhoneNext" data-label="Продолжить">Продолжить</button>
      </div>

      <!-- Step: Telegram confirmation -->
      <div class="auth-step auth-step--hidden" id="authStepTg">
        <h2 class="auth-modal__title">Подтверждение через Telegram</h2>

        <!-- New user: must open bot and share contact -->
        <div id="authTgNewUser">
          <p class="auth-modal__sub">Откройте нашего бота и поделитесь номером телефона для подтверждения</p>
          <button type="button" class="auth-btn auth-tg-btn" id="authTgBtn">
            <i class="ti ti-brand-telegram" style="font-size:20px;flex-shrink:0"></i>
            Открыть Telegram-бота
          </button>
        </div>

        <!-- Returning user: bot sends button automatically -->
        <div id="authTgReturning" class="auth-step--hidden">
          <p class="auth-modal__sub">Мы отправили запрос подтверждения в ваш Telegram.<br>Нажмите «Войти» в боте 👆</p>
        </div>

        <p class="auth-tg-hint">Ожидание подтверждения…</p>
        <div class="auth-error" id="authTgError"></div>
        <button type="button" class="auth-link" id="authBackToPhone">← Изменить номер</button>
      </div>

      <!-- Step: admin password -->
      <div class="auth-step auth-step--hidden" id="authStepPassword">
        <h2 class="auth-modal__title">Пароль администратора</h2>
        <div class="auth-field">
          <input id="authPassword" class="auth-input" type="password"
                 placeholder="Пароль" autocomplete="current-password">
        </div>
        <div class="auth-error" id="authPasswordError"></div>
        <button type="button" class="auth-btn" id="authPasswordNext" data-label="Войти">Войти</button>
        <button type="button" class="auth-link" id="authBackToPhone2">← Изменить номер</button>
      </div>

      <!-- Step: success -->
      <div class="auth-step auth-step--hidden" id="authStepSuccess">
        <div class="auth-success-icon">✓</div>
        <h2 class="auth-modal__title">Вы вошли!</h2>
        <p class="auth-modal__sub" id="authSuccessName"></p>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  _bindModal(el);
}

// ── State ─────────────────────────────────────────────────────────────────────

let _onSuccess         = null;
let _pendingPhone      = '';
let _pendingRole       = '';
let _pollController    = null;
let _phoneInputCleanup = null;

function _initPhone() {
  if (_phoneInputCleanup) _phoneInputCleanup();
  const mountEl     = document.getElementById('phoneInputMount');
  const hiddenInput = document.getElementById('authPhone');
  if (!mountEl || !hiddenInput) return;
  _phoneInputCleanup = initPhoneInput(mountEl, hiddenInput, {
    onEnter: () => document.getElementById('authPhoneNext')?.click(),
  });
}

function _abortPoll() {
  if (_pollController) {
    _pollController.abort();
    _pollController = null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function openAuthModal({ onSuccess } = {}) {
  injectModal();
  _onSuccess = onSuccess || null;
  _initPhone();
  _showStep('entry');
  document.getElementById('authPassword').value = '';
  _clearErrors();
  document.getElementById('authModal').classList.add('open');
  setTimeout(() => {
    document.getElementById('phoneInputMount')?.querySelector('.pi-national')?.focus();
  }, 80);
}

export function closeAuthModal() {
  _abortPoll();
  document.getElementById('authModal')?.classList.remove('open');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _showStep(name) {
  ['entry', 'tg', 'password', 'success'].forEach(s => {
    const el = document.getElementById(`authStep${s[0].toUpperCase()}${s.slice(1)}`);
    el?.classList.toggle('auth-step--hidden', s !== name);
  });
}

function _clearErrors() {
  document.querySelectorAll('.auth-error').forEach(el => { el.textContent = ''; });
}

function _setError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function _setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? '…' : (btn.dataset.label || btn.textContent);
}

// ── Polling ───────────────────────────────────────────────────────────────────

async function _runPoll(signal, sessionId, phone) {
  const result = await pollAuthSession(sessionId, signal);
  if (result === 'aborted') return;

  if (result === 'confirmed') {
    try {
      const user = await finalizeClientLogin(phone, '', sessionId);
      _handleSuccess(user);
    } catch (err) {
      _setError('authTgError', err.message || 'Ошибка входа. Попробуйте позже.');
    }
  } else if (result === 'cancelled') {
    _setError('authTgError', 'Вход отменён в Telegram');
  } else {
    _setError('authTgError', 'Время ожидания истекло. Попробуйте снова.');
  }
  _pollController = null;
}

// ── Bind events ───────────────────────────────────────────────────────────────

function _bindModal(backdrop) {
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeAuthModal(); });
  document.getElementById('authModalClose').addEventListener('click', closeAuthModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAuthModal(); });

  // ── Entry ─────────────────────────────────────────────────────────────────

  document.getElementById('authPhoneNext').addEventListener('click', async () => {
    _clearErrors();
    const phone = document.getElementById('authPhone').value;
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      _setError('authEntryError', 'Введите корректный номер телефона');
      return;
    }

    _setLoading('authPhoneNext', true);
    try {
      const { role } = await checkPhone(phone);
      _pendingPhone = phone;
      _pendingRole  = role;

      if (role === 'admin') {
        _showStep('password');
        setTimeout(() => document.getElementById('authPassword').focus(), 80);
        return;
      }

      const { sessionId, isReturning } = await startAuth(phone);

      // Show the right sub-view inside the TG step
      document.getElementById('authTgNewUser')
        .classList.toggle('auth-step--hidden', isReturning);
      document.getElementById('authTgReturning')
        .classList.toggle('auth-step--hidden', !isReturning);

      _showStep('tg');

      // Kick off background poll
      _abortPoll();
      _pollController = new AbortController();
      _runPoll(_pollController.signal, sessionId, phone);

    } catch (err) {
      _setError('authEntryError', err.message || 'Ошибка. Попробуйте позже.');
    } finally {
      _setLoading('authPhoneNext', false);
    }
  });

  // ── Telegram step ─────────────────────────────────────────────────────────

  document.getElementById('authTgBtn').addEventListener('click', () => {
    window.open(BOT_URL, '_blank', 'noopener,noreferrer');
  });

  document.getElementById('authBackToPhone').addEventListener('click', () => {
    _abortPoll();
    _clearErrors();
    _showStep('entry');
    setTimeout(() => {
      document.getElementById('phoneInputMount')?.querySelector('.pi-national')?.focus();
    }, 80);
  });

  // ── Password step ─────────────────────────────────────────────────────────

  document.getElementById('authPasswordNext').addEventListener('click', async () => {
    _clearErrors();
    const password = document.getElementById('authPassword').value;
    if (!password) { _setError('authPasswordError', 'Введите пароль'); return; }

    _setLoading('authPasswordNext', true);
    try {
      const user = await verifyAdminPassword(_pendingPhone, password);
      _handleSuccess(user);
    } catch (err) {
      _setError('authPasswordError', err.message || 'Неверный пароль');
    } finally {
      _setLoading('authPasswordNext', false);
    }
  });

  document.getElementById('authPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('authPasswordNext').click();
  });

  document.getElementById('authBackToPhone2').addEventListener('click', () => {
    _clearErrors();
    _showStep('entry');
    setTimeout(() => {
      document.getElementById('phoneInputMount')?.querySelector('.pi-national')?.focus();
    }, 80);
  });
}

// ── Success ───────────────────────────────────────────────────────────────────

function _handleSuccess(user) {
  document.getElementById('authSuccessName').textContent = user.name || user.phone;
  _showStep('success');
  setTimeout(() => {
    closeAuthModal();
    if (_onSuccess) { const cb = _onSuccess; _onSuccess = null; cb(user); }
  }, 1200);
}

// ── Logout confirmation ───────────────────────────────────────────────────────

export function showLogoutConfirm(onConfirm) {
  function injectLogoutModal() {
    if (document.getElementById('logoutConfirmModal')) return;

    const el = document.createElement('div');
    el.id = 'logoutConfirmModal';
    el.className = 'logout-confirm-modal-overlay';
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('role', 'dialog');
    el.innerHTML = `
      <div class="logout-confirm-modal">
        <h3 style="margin:0 0 0.5rem; font-size:18px; font-weight:700; color:var(--text-dark);">Выйти из аккаунта?</h3>
        <p style="color:var(--text-muted); margin:0 0 1.5rem; font-size:14px; line-height:1.5;">
          Вы уверены что хотите выйти?
        </p>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button id="logoutCancelBtn" class="btn btn-outline" type="button">Отмена</button>
          <button id="logoutConfirmBtn" class="btn btn-dark" type="button">Выйти</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(el);

    document.getElementById('logoutCancelBtn').addEventListener('click', () => {
      el.classList.remove('open');
    });

    document.getElementById('logoutConfirmBtn').addEventListener('click', () => {
      el.classList.remove('open');
      if (onConfirm) onConfirm();
    });

    document.addEventListener('click', (e) => {
      if (e.target === el && el.classList.contains('open')) {
        el.classList.remove('open');
      }
    });
  }

  injectLogoutModal();
  document.getElementById('logoutConfirmModal')?.classList.add('open');
}
