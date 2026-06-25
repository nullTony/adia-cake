// ================================
//  CHECKOUT MODULE
//  Opens a modal from the cart panel "Оформить заказ" button.
//  Collects order details, posts to Supabase via orders-api,
//  shows success state and clears the cart.
// ================================

import { getCart, getCartTotal, clearCart } from '../store/cart-store.js';
import { updateCartBadge, renderCartPanel, closeAllPanels } from './cart.js';
import { createOrder, createOrderItem }     from '../api/orders-api.js';
import { getCurrentUser }                   from '../services/auth-service.js';
import { sendTelegramMessage }              from '../api/telegram-api.js';
import { getSelectedBranch }                from '../store/branch-store.js';
import { initPhoneInput, handlePhoneInput, getPhoneValue } from '../utils/phone-input.js';
import { notifyManagerNewOrder }                          from '../services/manager-notification-service.js';
import { esc, formatPrice }                              from '../utils/format.js';

// ── Overlay control ───────────────────────────────────────────────────────────

function openOverlay() {
  document.getElementById('checkoutOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOverlay() {
  document.getElementById('checkoutOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Cart summary block ────────────────────────────────────────────────────────

function buildSummary(cart) {
  const rows = cart.map(item => `
    <div class="co-summary-item">
      <span class="co-summary-name">${esc(item.name)}</span>
      <span class="co-summary-qty">× ${item.qty}</span>
      <span class="co-summary-price">${formatPrice(item.priceVal * item.qty)}</span>
    </div>`).join('');

  return `
    <div class="co-summary">
      <div class="co-summary-title">Ваш заказ</div>
      ${rows}
      <div class="co-summary-total">
        <span>Итого</span>
        <strong>${formatPrice(getCartTotal())}</strong>
      </div>
    </div>`;
}

// ── Render form ───────────────────────────────────────────────────────────────

async function renderForm() {
  const body = document.getElementById('checkoutBody');
  if (!body) return;

  const cart = getCart();
  if (!cart.length) {
    body.innerHTML = `
      <div class="co-success">
        <div class="co-success-ico">🛒</div>
        <div class="co-success-title">Корзина пуста</div>
        <div class="co-success-sub">Добавьте товары, чтобы оформить заказ.</div>
      </div>`;
    return;
  }

  const selectedBranch = getSelectedBranch();
  const branchName     = selectedBranch?.name || '';

  body.innerHTML = `
    ${buildSummary(cart)}

    <form id="checkoutForm" novalidate>

      <div class="co-field">
        <label class="co-label" for="coName">Ваше имя *</label>
        <input class="co-input" type="text" id="coName" placeholder="Имя и фамилия" autocomplete="name">
        <span class="co-error" id="coNameErr">Введите ваше имя</span>
      </div>

      <div class="co-field">
        <label class="co-label" for="coPhone">Телефон *</label>
        <input class="co-input" type="tel" id="coPhone" placeholder="+998 90 000 00 00" autocomplete="tel">
        <span class="co-error" id="coPhoneErr">Введите номер телефона</span>
      </div>

      <div class="co-field">
        <label class="co-label">Способ получения *</label>
        <div class="co-radio-group">
          <label class="co-radio-opt">
            <input type="radio" name="coDeliveryType" value="delivery"> Доставка
          </label>
          <label class="co-radio-opt">
            <input type="radio" name="coDeliveryType" value="pickup"> Самовывоз
          </label>
        </div>
        <span class="co-error" id="coTypeErr">Выберите способ получения</span>
      </div>

      <div class="co-field" id="coDeliveryField" hidden>
        <label class="co-label" for="coAddress">Адрес доставки *</label>
        <input class="co-input" type="text" id="coAddress" placeholder="Улица, дом, квартира" autocomplete="street-address">
        <span class="co-error" id="coAddressErr">Введите адрес доставки</span>
      </div>

      <div class="co-field" id="coPickupField" hidden>
        <label class="co-label">Филиал самовывоза</label>
        <div class="co-pickup-branch">📍 ${branchName || 'Не выбран'}</div>
      </div>

      <div class="co-field">
        <label class="co-label" for="coComment">
          Комментарий
          <span style="font-weight:400;color:var(--text-light)">(необязательно)</span>
        </label>
        <textarea class="co-textarea" id="coComment" placeholder="Особые пожелания, аллергии, уточнения..."></textarea>
      </div>

      <p class="co-notice">
        После отправки заказа администратор проверит наличие и свяжется с вами для подтверждения.
      </p>

      <div class="co-error" id="coFormError" style="margin-bottom:12px;text-align:center"></div>

      <button type="submit" class="btn btn-dark co-submit" id="coSubmit">Отправить заказ</button>

    </form>`;

  // Delivery-type toggle
  body.querySelectorAll('input[name="coDeliveryType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('coDeliveryField').hidden = radio.value !== 'delivery';
      document.getElementById('coPickupField').hidden   = radio.value !== 'pickup';
    });
  });

  document.getElementById('checkoutForm').addEventListener('submit', handleSubmit);

  _prefillUserData();

  const _phoneEl = document.getElementById('coPhone');
  if (_phoneEl) handlePhoneInput(_phoneEl);
}

// ── Prefill from current session ──────────────────────────────────────────────

function _prefillUserData() {
  const user = getCurrentUser();
  const phoneEl = document.getElementById('coPhone');
  if (phoneEl) initPhoneInput(phoneEl, user?.phone || null);
  const nameEl  = document.getElementById('coName');
  if (nameEl && user?.name) nameEl.value = user.name;
}

// ── Validation ────────────────────────────────────────────────────────────────

function setFieldError(inputId, errId, show) {
  document.getElementById(inputId)?.classList.toggle('error', show);
  document.getElementById(errId)?.classList.toggle('visible', show);
}

function validateForm() {
  let ok = true;

  const name = document.getElementById('coName')?.value.trim();
  setFieldError('coName', 'coNameErr', !name);
  if (!name) ok = false;

  const phoneEl2 = document.getElementById('coPhone');
  const phone    = phoneEl2 ? getPhoneValue(phoneEl2) : '';
  const phoneOk  = phone.replace(/\D/g, '').length >= 10;
  setFieldError('coPhone', 'coPhoneErr', !phoneOk);
  if (!phoneOk) ok = false;

  const typeEl = document.querySelector('input[name="coDeliveryType"]:checked');
  const typeOk = !!typeEl;
  document.getElementById('coTypeErr')?.classList.toggle('visible', !typeOk);
  if (!typeOk) { ok = false; }
  else if (typeEl.value === 'delivery') {
    const addr = document.getElementById('coAddress')?.value.trim();
    setFieldError('coAddress', 'coAddressErr', !addr);
    if (!addr) ok = false;
  }

  return ok;
}

// ── Submit ────────────────────────────────────────────────────────────────────

async function handleSubmit(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const submitBtn = document.getElementById('coSubmit');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Отправляем…';

  const formErrEl = document.getElementById('coFormError');
  formErrEl?.classList.remove('visible');

  try {
    const cart      = getCart();
    const total     = getCartTotal();
    const name      = document.getElementById('coName').value.trim();
    const phone     = getPhoneValue(document.getElementById('coPhone'));
    const typeEl    = document.querySelector('input[name="coDeliveryType"]:checked');
    const type      = typeEl.value;
    const address        = type === 'delivery' ? document.getElementById('coAddress').value.trim() : null;
    const selectedBranch = getSelectedBranch();
    const branchId       = selectedBranch?.id || null;
    const comment        = document.getElementById('coComment').value.trim() || null;

    const user = getCurrentUser();
    const order = await createOrder({
      userId:               user?.id || null,
      customerName:         name,
      phone,
      deliveryType:         type,
      deliveryAddress:      address,
      branchId:             branchId ? String(branchId) : null,
      branchName:           selectedBranch?.name || null,
      comment,
      totalRequestedAmount: total,
    });

    if (!order?.id) throw new Error('Order was not created');

    await Promise.all(cart.map(item =>
      createOrderItem({
        orderId:              order.id,
        productId:            item.productId || item.id, // weight items carry base productId
        productTitleSnapshot: item.name,
        productPriceSnapshot: item.priceVal,
        requestedQty:         item.qty,
        weightGrams:          item.weightGrams || null,
      })
    ));

    clearCart();
    updateCartBadge();
    renderCartPanel();
    showSuccess(order);

    // Fire-and-forget: notify customer if linked to Telegram
    if (user?.telegramId) {
      _sendTelegramOrderNotification(user.telegramId, order, cart).catch(() => {});
    }
    // Fire-and-forget: notify branch manager
    notifyManagerNewOrder(order).catch(() => {});

  } catch (err) {
    console.error('[checkout] Order creation failed:', err);
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Отправить заказ';
    if (formErrEl) {
      formErrEl.textContent = 'Произошла ошибка. Попробуйте ещё раз.';
      formErrEl.classList.add('visible');
    }
  }
}

// ── Success state ─────────────────────────────────────────────────────────────

function showSuccess(order) {
  const body = document.getElementById('checkoutBody');
  if (!body) return;
  const num = order.orderNumber ?? order.id;
  body.innerHTML = `
    <div class="co-success">
      <div class="co-success-ico">🎉</div>
      <div class="co-success-title">Заказ отправлен!</div>
      <div class="co-success-sub">
        Мы свяжемся с вами после проверки наличия.<br>
        Номер вашего заказа: <strong>#${num}</strong>
      </div>
      <button class="btn btn-dark co-submit" id="coCloseSuccess">Закрыть</button>
    </div>`;
  document.getElementById('coCloseSuccess')?.addEventListener('click', closeOverlay);
}

// ── Telegram order notification ───────────────────────────────────────────────

async function _sendTelegramOrderNotification(telegramId, order, cartItems) {
  if (!telegramId) return;

  const deliveryLine = order.deliveryType === 'pickup'
    ? `🏪 Самовывоз`
    : `🚚 Доставка: ${order.deliveryAddress || '—'}`;

  const itemLines = cartItems
    .map(i => `  • ${i.name} × ${i.qty} — ${formatPrice(i.priceVal * i.qty)}`)
    .join('\n');

  const text =
    `🎂 <b>Ваш заказ #${order.orderNumber} принят!</b>\n\n` +
    `${itemLines}\n\n` +
    `<b>Итого:</b> ${formatPrice(order.totalRequestedAmount)}\n` +
    `${deliveryLine}\n\n` +
    `Администратор свяжется с вами для подтверждения.`;

  await sendTelegramMessage(telegramId, text, 'HTML');
}

// ── Modal injection ───────────────────────────────────────────────────────────

function ensureCheckoutModal() {
  if (document.getElementById('checkoutOverlay')) return;
  const el = document.createElement('div');
  el.id        = 'checkoutOverlay';
  el.className = 'checkout-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Оформление заказа');
  el.innerHTML = `
    <div class="checkout-modal">
      <div class="checkout-head">
        <h2>Оформление заказа</h2>
        <button class="checkout-close" id="checkoutClose" aria-label="Закрыть">✕</button>
      </div>
      <div class="checkout-body" id="checkoutBody"></div>
    </div>`;
  document.body.appendChild(el);
}

// ── Init ──────────────────────────────────────────────────────────────────────

let _initialized = false;

export function initCheckout() {
  if (_initialized) return;
  _initialized = true;

  ensureCheckoutModal();

  // Delegation — works for any button with data-checkout-open, static or dynamic
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-checkout-open]')) return;
    if (!getCart().length) return;
    closeAllPanels();
    renderForm();
    openOverlay();
  });

  document.getElementById('checkoutClose')?.addEventListener('click', closeOverlay);

  document.getElementById('checkoutOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('checkoutOverlay')) closeOverlay();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeOverlay();
  });
}
