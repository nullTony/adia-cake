// ================================
//  BRANCH SELECTOR
//  First visit (no branch stored): modal is mandatory — no dismiss.
//  Returning user (branch stored): × button + backdrop click can close.
// ================================

import { getBranches }                      from '../api/branches-api.js';
import { getSelectedBranch, setSelectedBranch } from '../store/branch-store.js';
import { getCartForBranch }                 from '../store/cart-store.js';
import { updateCartBadge }                  from './cart.js';

const OVERLAY_ID = 'bsOverlay';

let _branches     = [];
let _pendingSwitch = null;
let _canClose     = false; // true only when a branch is already selected on open

// ── Public ────────────────────────────────────────────────────────────────────

export function shouldShowBranchSelector() {
  return !getSelectedBranch()?.id;
}

export function renderBranchIndicator() {
  const el = document.getElementById('branchIndicator');
  if (!el) return;
  const branch = getSelectedBranch();
  if (branch) {
    el.innerHTML =
      `<span class="bi-icon">📍</span>` +
      `<span class="bi-name">${_esc(branch.name)}</span>` +
      `<span class="bi-chevron">▼</span>`;
  } else {
    el.innerHTML =
      `<span class="bi-icon">📍</span>` +
      `<span class="bi-placeholder">Выберите филиал</span>` +
      `<span class="bi-chevron">▼</span>`;
  }
}

export async function openBranchModal() {
  // Decide dismiss-ability BEFORE showing anything
  _canClose = !!getSelectedBranch()?.id;

  _ensureOverlay();
  document.getElementById(OVERLAY_ID).classList.add('open');
  document.body.style.overflow = 'hidden';

  _renderState('loading');

  try {
    _branches = await getBranches();
  } catch {
    _renderState('error');
    return;
  }

  _pendingSwitch = null;
  _renderBranchList();
}

export function closeBranchModal() {
  document.getElementById(OVERLAY_ID)?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initBranchSelector() {
  renderBranchIndicator();

  document.getElementById('branchIndicator')
    ?.addEventListener('click', () => openBranchModal());

  window.addEventListener('adia:branch-change', () => {
    renderBranchIndicator();
    updateCartBadge();
  });

  let needsModal = shouldShowBranchSelector();

  if (!needsModal) {
    try {
      _branches = await getBranches();
      const stored = getSelectedBranch();
      if (!_branches.find(b => b.id === stored?.id)) {
        setSelectedBranch(null);
        needsModal = true;
      }
    } catch {
      // Network error — keep stored branch, don't force modal
    }
  }

  if (needsModal) {
    await openBranchModal();
  }
}

// ── Modal HTML ────────────────────────────────────────────────────────────────

function _ensureOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;
  const el = document.createElement('div');
  el.id        = OVERLAY_ID;
  el.className = 'bs-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Выбор филиала');
  el.innerHTML = `<div class="bs-modal" id="bsModal"></div>`;
  document.body.appendChild(el);

  // Backdrop click — only dismisses when user already has a branch
  el.addEventListener('click', e => {
    if (e.target === el && _canClose) closeBranchModal();
  });
}

// ── Close button snippet ──────────────────────────────────────────────────────

function _closeBtn() {
  if (!_canClose) return '';
  return `<button type="button" class="bs-close-btn" id="bsClose" aria-label="Закрыть">✕</button>`;
}

function _wireCloseBtn() {
  document.getElementById('bsClose')?.addEventListener('click', closeBranchModal);
}

// ── State renders ─────────────────────────────────────────────────────────────

function _renderState(state) {
  const modal = document.getElementById('bsModal');
  if (!modal) return;
  const head = `
    ${_closeBtn()}
    <div class="bs-head">
      <div class="bs-icon">📍</div>
      <h2 class="bs-title">Выберите филиал</h2>
      <p class="bs-subtitle">Чтобы увидеть актуальный ассортимент</p>
    </div>`;
  modal.innerHTML = head + (
    state === 'loading'
      ? `<div class="bs-loading">Загрузка филиалов…</div>`
      : `<div class="bs-empty">Филиалы временно недоступны. Попробуйте позже.</div>`
  );
  _wireCloseBtn();
}

function _renderBranchList() {
  const modal = document.getElementById('bsModal');
  if (!modal) return;

  if (!_branches.length) {
    _renderState('error');
    return;
  }

  const current = getSelectedBranch();

  modal.innerHTML = `
    ${_closeBtn()}
    <div class="bs-head">
      <div class="bs-icon">📍</div>
      <h2 class="bs-title">Выберите филиал</h2>
      <p class="bs-subtitle">Чтобы увидеть актуальный ассортимент</p>
    </div>
    <div class="bs-branches" id="bsBranches">
      ${_branches.map(b => `
        <button type="button"
                class="bs-branch-card${current?.id === b.id ? ' bs-branch-card--selected' : ''}"
                data-bid="${_esc(b.id)}"
                aria-pressed="${current?.id === b.id ? 'true' : 'false'}">
          <div class="bs-branch-inner">
            <span class="bs-branch-icon">🏪</span>
            <div class="bs-branch-info">
              <span class="bs-branch-name">${_esc(b.name)}</span>
              ${b.address    ? `<span class="bs-branch-addr">${_esc(b.address)}</span>` : ''}
              ${b.workingHours ? `<span class="bs-branch-hours">${_esc(b.workingHours)}</span>` : ''}
            </div>
            ${current?.id === b.id ? '<span class="bs-branch-check">✓</span>' : ''}
          </div>
        </button>`).join('')}
    </div>
    <div class="bs-switch-notice" id="bsSwitchNotice" hidden>
      <div class="bsn-icon">⚠️</div>
      <div class="bsn-body">
        <div class="bsn-title">В вашей корзине есть товары</div>
        <div class="bsn-sub" id="bsnSub"></div>
        <p class="bsn-text">
          При смене филиала корзина будет очищена, но товары сохранятся
          и вернутся когда вы снова выберете этот филиал.
        </p>
        <div class="bsn-actions">
          <button type="button" class="bsn-confirm" id="bsnConfirm">Сменить филиал</button>
          <button type="button" class="bsn-cancel"  id="bsnCancel">Отмена</button>
        </div>
      </div>
    </div>`;

  _wireCloseBtn();

  modal.querySelectorAll('.bs-branch-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const branch = _branches.find(b => b.id === btn.dataset.bid);
      if (branch) _handleBranchPick(branch);
    });
  });

  document.getElementById('bsnConfirm')?.addEventListener('click', () => {
    if (_pendingSwitch) _doSwitch(_pendingSwitch);
  });
  // "Отмена" in conflict warning: close the whole modal if branch already exists,
  // otherwise just dismiss the notice and let user pick again.
  document.getElementById('bsnCancel')?.addEventListener('click', () => {
    if (_canClose) {
      closeBranchModal();
    } else {
      _cancelSwitchNotice();
    }
  });
}

// ── Branch selection logic ────────────────────────────────────────────────────

function _handleBranchPick(branch) {
  const current = getSelectedBranch();

  if (current?.id === branch.id) {
    closeBranchModal();
    return;
  }

  const oldCart = current ? getCartForBranch(current.id) : [];
  if (oldCart.length > 0) {
    _showSwitchNotice(branch, current);
    return;
  }

  _doSwitch(branch);
}

function _showSwitchNotice(newBranch, oldBranch) {
  _pendingSwitch = newBranch;
  const notice = document.getElementById('bsSwitchNotice');
  const sub    = document.getElementById('bsnSub');
  if (sub) sub.textContent = `из филиала "${oldBranch?.name || ''}"`;
  if (notice) notice.hidden = false;
  const list = document.getElementById('bsBranches');
  if (list) { list.style.opacity = '0.4'; list.style.pointerEvents = 'none'; }
}

function _cancelSwitchNotice() {
  _pendingSwitch = null;
  const notice = document.getElementById('bsSwitchNotice');
  if (notice) notice.hidden = true;
  const list = document.getElementById('bsBranches');
  if (list) { list.style.opacity = ''; list.style.pointerEvents = ''; }
}

function _doSwitch(branch) {
  setSelectedBranch(branch);
  updateCartBadge();
  _pendingSwitch = null;
  closeBranchModal();
}

// ── Utility ───────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
