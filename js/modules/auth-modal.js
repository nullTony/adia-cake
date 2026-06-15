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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
            </svg>
            Открыть Telegram-бота
          </button>
        </div>

        <!-- Returning user: bot sends button automatically -->
        <div id="authTgReturning" class="auth-step--hidden">
          <p class="auth-modal__sub">Мы отправили запрос подтверждения в ваш Telegram.<br>Нажмите «Войти» в боте 👆</p>
        </div>

        <!-- Name field — new users only -->
        <div class="auth-name-wrap auth-step--hidden" id="authNameWrap">
          <div class="auth-field">
            <input id="authName" class="auth-input" type="text"
                   placeholder="Ваше имя" maxlength="60" autocomplete="name">
          </div>
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
  document.getElementById('authName').value     = '';
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
    const name = document.getElementById('authName')?.value.trim() || '';
    try {
      const user = await finalizeClientLogin(phone, name, sessionId);
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
      document.getElementById('authNameWrap')
        .classList.toggle('auth-step--hidden', role !== 'new');

      _showStep('tg');
      if (role === 'new') setTimeout(() => document.getElementById('authName').focus(), 80);

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
