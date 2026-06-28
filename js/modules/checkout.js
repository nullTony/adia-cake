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
import { loadYandexMaps, reverseGeocode }               from '../utils/yandex-maps.js';

// ── Map state — reset each time the form is rendered ─────────────────────────

let _deliveryLat = null;
let _deliveryLng = null;
let _coMap       = null;   // ymaps.Map instance
let _coPl        = null;   // ymaps.Placemark instance
let _ymaps       = null;   // resolved ymaps global — persists across form opens

function _resetMapState() {
  if (_coMap) { try { _coMap.destroy(); } catch {} }
  _coMap       = null;
  _coPl        = null;
  _deliveryLat = null;
  _deliveryLng = null;
  // _ymaps kept — no need to reload the script
}

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
  _resetMapState();

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
        <label class="co-label">Точка доставки на карте *</label>
        <div class="co-map-wrap">
          <div id="coMap" class="co-map"></div>
          <button type="button" class="co-geo-btn" id="coGeoBtn">
            <i class="ti ti-current-location"></i> Моё местоположение
          </button>
        </div>
        <span class="co-error" id="coMapErr">Укажите точку доставки на карте</span>
        <label class="co-label" for="coAddress" style="margin-top:10px">
          Адрес <span style="font-weight:400;color:var(--text-light)">(подъезд, этаж, кв.)</span>
        </label>
        <input class="co-input" type="text" id="coAddress"
          placeholder="Заполнится с карты, можно дополнить"
          autocomplete="off">
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
    radio.addEventListener('change', async () => {
      const isDelivery = radio.value === 'delivery';
      document.getElementById('coDeliveryField').hidden = !isDelivery;
      document.getElementById('coPickupField').hidden   = radio.value !== 'pickup';
      if (isDelivery) {
        // Let the browser render the container before init
        await new Promise(r => requestAnimationFrame(r));
        _initDeliveryMap().catch(err => console.warn('[checkout] map init failed:', err));
      }
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

// ── Yandex Maps — delivery map ────────────────────────────────────────────────

const TASHKENT = [41.2995, 69.2401];

async function _initDeliveryMap() {
  if (_coMap) {
    try { _coMap.container.fitToViewport(); } catch {}
    return;
  }

  const container = document.getElementById('coMap');
  if (!container) return;

  _ymaps = await loadYandexMaps();

  _coMap = new _ymaps.Map(container, {
    center: TASHKENT,
    zoom: 13,
    controls: ['zoomControl'],
  }, {
    suppressMapOpenBlock: true,
  });

  // Click anywhere on the map → place / move pin
  _coMap.events.add('click', e => _placePin(e.get('coords')));

  document.getElementById('coGeoBtn')?.addEventListener('click', _geolocate);
}

// Saves coords, moves/creates pin, then tries HTTP reverse geocoding (non-blocking).
function _placePin(coords) {
  if (!_ymaps || !_coMap) return;

  _deliveryLat = coords[0];
  _deliveryLng = coords[1];
  document.getElementById('coMapErr')?.classList.remove('visible');

  if (!_coPl) {
    _coPl = new _ymaps.Placemark(coords, { hintContent: 'Точка доставки' }, {
      preset: 'islands#redDotIcon',
      draggable: true,
    });
    _coMap.geoObjects.add(_coPl);
    // Drag also updates coords + geocodes
    _coPl.events.add('dragend', () => _placePin(_coPl.geometry.getCoordinates()));
  } else {
    _coPl.geometry.setCoordinates(coords);
  }

  // HTTP geocoder replaces ymaps.geocode (which throws "scriptError" with this key).
  // Failure is silent — lat/lng are already saved, user can type address manually.
  reverseGeocode(_deliveryLat, _deliveryLng).then(addr => {
    if (addr) {
      const el = document.getElementById('coAddress');
      if (el) el.value = addr;
    }
  }).catch(() => {});
}

function _geolocate() {
  if (!_coMap) return;
  if (!navigator.geolocation) { _showGeoError(); return; }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const coords = [pos.coords.latitude, pos.coords.longitude];
      _coMap.setCenter(coords, 16);
      _placePin(coords);
    },
    () => _showGeoError(),
    { timeout: 10_000 },
  );
}

function _showGeoError() {
  const mapErr = document.getElementById('coMapErr');
  if (!mapErr) return;
  let msg = document.getElementById('coGeoMsg');
  if (!msg) {
    msg = document.createElement('p');
    msg.id = 'coGeoMsg';
    msg.style.cssText = 'font-size:12px;color:var(--text-muted);margin:2px 0 0;line-height:1.4';
    mapErr.after(msg);
  }
  msg.textContent = 'Не удалось определить местоположение — укажите точку на карте вручную';
  clearTimeout(msg._t);
  msg._t = setTimeout(() => { if (msg.parentNode) msg.remove(); }, 6000);
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
  if (!typeOk) {
    ok = false;
  } else if (typeEl.value === 'delivery') {
    // Require marker to be placed (lat/lng set)
    const hasPin = _deliveryLat !== null && _deliveryLng !== null;
    document.getElementById('coMapErr')?.classList.toggle('visible', !hasPin);
    if (!hasPin) ok = false;
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
    const address        = type === 'delivery' ? document.getElementById('coAddress').value.trim() || null : null;
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
      deliveryLat:          type === 'delivery' ? _deliveryLat : null,
      deliveryLng:          type === 'delivery' ? _deliveryLng : null,
      branchId:             branchId ? String(branchId) : null,
      branchName:           selectedBranch?.name || null,
      comment,
      totalRequestedAmount: total,
    });

    if (!order?.id) throw new Error('Order was not created');

    await Promise.all(cart.map(item =>
      createOrderItem({
        orderId:              order.id,
        productId:            item.productId || item.id,
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

    if (user?.telegramId) {
      _sendTelegramOrderNotification(user.telegramId, order, cart).catch(() => {});
    }
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
