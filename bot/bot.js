// ================================
//  ADIA Cake — Telegram Bot
//
//  Auth flow:
//    1. Site creates auth_sessions row (status=pending) with phone
//    2a. Returning user (known telegram_chat_id):
//          Bot interval finds pending session → sends confirm button → status=bot_opened
//    2b. New user:
//          User opens bot → /start → bot requests contact share
//          User shares contact → bot matches phone → sends confirm button → status=phone_matched
//    3. User taps ✅/❌ → callback_query handler → status=confirmed/cancelled
//    4. Site polls auth_sessions, detects confirmed → logs user in
//
//  DO NOT modify: order notification constants/logic (added below if needed)
// ================================

const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN    = '8710399027:AAGV8C-5Vgz02Y_wOuctPQPgu96DfGD47Ek';
const SB_URL       = 'https://orfxopppqqvwueoatasu.supabase.co';
const SB_ANON_KEY  = 'sb_publishable_XnmVOsqn1xIn-kpdSAaMmw_4V4zVkf5';
const SESSIONS_TBL = 'auth_sessions';
const CLIENTS_TBL  = 'clients';
const STAFF_TBL    = 'staff_users';
const ORDERS_TBL   = 'orders';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('[bot] Запущен. Ожидаю команды...');

bot.on('polling_error', (err) => {
  if (err.code === 'ETELEGRAM' && err.message.includes('409')) {
    console.error('[bot] Ошибка 409: уже запущен другой экземпляр бота.');
    console.error('[bot] Выполните: pkill -f "node bot.js" && node bot.js');
    process.exit(1);
  }
  console.error('[bot] Ошибка polling:', err.code, err.message);
});

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbRequest(path, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey':        SB_ANON_KEY,
      'Authorization': `Bearer ${SB_ANON_KEY}`,
      'Content-Type':  'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Supabase ${res.status}`);
  return body;
}

// ── Phone normalization ───────────────────────────────────────────────────────
// Output format: +998XXXXXXXXX  (matches clients.phone and auth_sessions.phone)

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('998')) return '+' + digits;
  if (digits.length === 9)      return '+998' + digits;
  return '+' + digits;
}

// ── /start — request contact share ───────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId, 'Добро пожаловать в ADIA Cake 🎂\nДля входа поделитесь вашим номером:', {
      reply_markup: {
        keyboard: [[{ text: '📱 Войти через Telegram', request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard:   true,
      },
    });
  } catch (err) {
    console.error('[bot] /start error:', err.message);
  }
});

// ── Contact received — match phone → send confirm button ─────────────────────

bot.on('contact', async (msg) => {
  const chatId      = msg.chat.id;
  const username    = msg.chat.username || null;
  const tgPhone     = normalizePhone(msg.contact.phone_number);
  const clientName  = [msg.contact.first_name, msg.contact.last_name].filter(Boolean).join(' ') || null;

  try {
    const now      = new Date().toISOString();
    const sessions = await sbRequest(
      `/${SESSIONS_TBL}?phone=eq.${encodeURIComponent(tgPhone)}&status=eq.pending&expires_at=gt.${encodeURIComponent(now)}&order=created_at.desc&limit=1`
    );
    const session = Array.isArray(sessions) && sessions.length ? sessions[0] : null;

    if (!session) {
      await bot.sendMessage(chatId, '⚠️ Сначала введите номер на сайте ADIA Cake', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    // Link chat_id (and username) to session and mark phone matched
    await sbRequest(`/${SESSIONS_TBL}?id=eq.${encodeURIComponent(session.id)}`, {
      method:  'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body:    JSON.stringify({
        status:            'phone_matched',
        telegram_chat_id:  String(chatId),
        telegram_username: username,
        client_name:       clientName,
      }),
    });

    // Distinguish staff from clients for the greeting
    let greeting = '✅ Подтвердите вход в ADIA Cake:';
    try {
      const staffRows = await sbRequest(
        `/${STAFF_TBL}?phone=eq.${encodeURIComponent(tgPhone)}&select=full_name&limit=1`
      );
      const staffMember = Array.isArray(staffRows) && staffRows.length ? staffRows[0] : null;
      if (staffMember?.full_name) {
        greeting = `Добро пожаловать, ${staffMember.full_name}! 👨‍💼\nПодтвердите привязку:`;
      }
    } catch { /* use default greeting */ }

    await bot.sendMessage(chatId, greeting, {
      reply_markup: {
        remove_keyboard: true,
        inline_keyboard: [[
          { text: '✅ Подтвердить', callback_data: `confirm_${session.id}` },
          { text: '❌ Отмена',      callback_data: `cancel_${session.id}` },
        ]],
      },
    });

  } catch (err) {
    console.error('[bot] contact error:', err.message);
    await bot.sendMessage(chatId, '⚠️ Произошла ошибка. Попробуйте ещё раз.').catch(() => {});
  }
});

// ── Inline button — confirm or cancel ────────────────────────────────────────

bot.on('callback_query', async (query) => {
  // Split only on the first underscore so UUID (which uses dashes) is preserved intact
  const firstUnderscore = query.data.indexOf('_');
  if (firstUnderscore === -1) { bot.answerCallbackQuery(query.id).catch(() => {}); return; }

  const action    = query.data.substring(0, firstUnderscore);
  const sessionId = query.data.substring(firstUnderscore + 1);

  try {
    if (action === 'confirm') {
      await sbRequest(`/${SESSIONS_TBL}?id=eq.${encodeURIComponent(sessionId)}`, {
        method:  'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body:    JSON.stringify({ status: 'confirmed' }),
      });
      await bot.editMessageText('✅ Вы успешно вошли в ADIA Cake 🎂', {
        chat_id:    query.message.chat.id,
        message_id: query.message.message_id,
      });
    } else if (action === 'cancel') {
      await sbRequest(`/${SESSIONS_TBL}?id=eq.${encodeURIComponent(sessionId)}`, {
        method:  'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body:    JSON.stringify({ status: 'cancelled' }),
      });
      await bot.editMessageText('Вход отменён', {
        chat_id:    query.message.chat.id,
        message_id: query.message.message_id,
      });
    }
  } catch (err) {
    console.error('[bot] callback_query error:', err.message);
  }

  bot.answerCallbackQuery(query.id).catch(() => {});
});

// ── Branch manager notifications ──────────────────────────────────────────────

function formatPrice(val) {
  return String(Math.round(val || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум';
}

async function notifyBranchManager(branchId, message) {
  if (!branchId) return;
  let recipients = [];

  try {
    const managers = await sbRequest(
      `/${STAFF_TBL}?branch_id=eq.${encodeURIComponent(branchId)}&role=eq.manager&is_active=eq.true&telegram_chat_id=not.is.null&select=telegram_chat_id,full_name`
    );
    recipients = Array.isArray(managers) ? managers : [];
  } catch { return; }

  // Fallback: notify super_admin when branch has no manager
  if (!recipients.length) {
    try {
      const owners = await sbRequest(
        `/${STAFF_TBL}?role=eq.super_admin&is_active=eq.true&telegram_chat_id=not.is.null&select=telegram_chat_id,full_name`
      );
      recipients = Array.isArray(owners) ? owners : [];
    } catch { return; }
  }

  for (const r of recipients) {
    try {
      await bot.sendMessage(r.telegram_chat_id, message);
    } catch (err) {
      console.error(`[bot] Failed to notify ${r.full_name || r.telegram_chat_id}:`, err.message);
    }
  }
}

const ITEMS_TBL = 'order_items';

// ── Proactive confirm for returning users (runs every 3 s) ───────────────────
// Finds pending sessions whose phone is already in clients (known telegram_chat_id)
// and sends a confirm button without the user having to open the bot.

setInterval(async () => {
  let sessions;
  try {
    const now = new Date().toISOString();
    sessions  = await sbRequest(
      `/${SESSIONS_TBL}?status=eq.pending&expires_at=gt.${encodeURIComponent(now)}`
    );
  } catch { return; }

  for (const session of sessions || []) {
    try {
      const clients = await sbRequest(
        `/${CLIENTS_TBL}?phone=eq.${encodeURIComponent(session.phone)}&limit=1`
      );
      const client = Array.isArray(clients) && clients.length ? clients[0] : null;
      if (!client?.telegram_chat_id) continue;

      // Claim the session immediately to avoid duplicate sends
      await sbRequest(`/${SESSIONS_TBL}?id=eq.${encodeURIComponent(session.id)}`, {
        method:  'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body:    JSON.stringify({
          status:           'bot_opened',
          telegram_chat_id: client.telegram_chat_id,
        }),
      });

      await bot.sendMessage(client.telegram_chat_id, 'Подтвердите вход в ADIA Cake 🎂', {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Войти',  callback_data: `confirm_${session.id}` },
            { text: '❌ Отмена', callback_data: `cancel_${session.id}` },
          ]],
        },
      });

    } catch (err) {
      console.error('[bot] interval error for session', session.id, ':', err.message);
    }
  }
}, 3000);

// ============================================================
//  ORDER NOTIFICATION SYSTEM
//
//  Polls orders table every 5 s for new/changed orders.
//  Detects status transitions and sends Telegram messages to
//  the affected client and the branch manager (or owner fallback).
//
//  Uses polling instead of Supabase Realtime to avoid adding
//  the @supabase/supabase-js dependency to the bot.
// ============================================================

// ── Core helpers ─────────────────────────────────────────────────────────────

async function sendTG(chatId, text) {
  if (!chatId) return;
  try {
    await bot.sendMessage(String(chatId), text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error(`[notify] sendTG ${chatId}:`, err.message);
  }
}

// HTML-escape user data inserted into message templates
function _h(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Format number with ru-RU locale thousands separator
function fmtN(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

async function _getClientChatId(userId) {
  if (!userId) return null;
  try {
    const rows = await sbRequest(
      `/${CLIENTS_TBL}?id=eq.${encodeURIComponent(userId)}&select=telegram_chat_id&limit=1`
    );
    const v = Array.isArray(rows) && rows[0]?.telegram_chat_id;
    return v ? String(v) : null;
  } catch { return null; }
}

// Single branch manager with telegram_chat_id, or null
async function _getBranchManager(branchId) {
  if (!branchId) return null;
  try {
    const rows = await sbRequest(
      `/${STAFF_TBL}?branch_id=eq.${encodeURIComponent(branchId)}` +
      `&role=eq.manager&is_active=eq.true&telegram_chat_id=not.is.null` +
      `&select=telegram_chat_id&limit=1`
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch { return null; }
}

// All super_admins with telegram_chat_id
async function _getOwners() {
  try {
    const rows = await sbRequest(
      `/${STAFF_TBL}?role=eq.super_admin&is_active=eq.true` +
      `&telegram_chat_id=not.is.null&select=telegram_chat_id`
    );
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

// Send to branch manager; if none, send to all owners with warning prefix
async function _notifyStaff(branchId, text) {
  const manager = await _getBranchManager(branchId);
  if (manager?.telegram_chat_id) {
    await sendTG(manager.telegram_chat_id, text);
    return;
  }
  const owners = await _getOwners();
  const prefix = branchId ? '⚠️ <b>Нет менеджера для филиала</b>\n\n' : '';
  for (const o of owners) await sendTG(o.telegram_chat_id, prefix + text);
}

// Format order items list using actual DB column names
function _fmtItemsReq(items) {
  if (!items?.length) return '';
  return items.map(i => {
    const qty = i.weight_grams ? `${i.weight_grams} г` : `${i.requested_qty} шт`;
    return `• ${_h(i.product_title_snapshot)} — ${qty}`;
  }).join('\n');
}

// ── Deduplication ─────────────────────────────────────────────────────────────
// Prevents double-send when a poll tick overlaps a status update.

const _notifiedKeys = new Set();

function _deduped(orderId, event) {
  const key = `${orderId}::${event}`;
  if (_notifiedKeys.has(key)) return true;
  _notifiedKeys.add(key);
  setTimeout(() => _notifiedKeys.delete(key), 60_000);
  return false;
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function _onNewOrder(order) {
  if (_deduped(order.id, 'new')) return;

  let items = [];
  try {
    const rows = await sbRequest(
      `/${ITEMS_TBL}?order_id=eq.${encodeURIComponent(order.id)}`
    );
    items = Array.isArray(rows) ? rows : [];
  } catch {}

  const delType = order.delivery_type === 'pickup' ? '🏪 Самовывоз' : '🚚 Доставка';
  const iLines  = _fmtItemsReq(items);

  // → Client: order received
  await sendTG(
    await _getClientChatId(order.user_id),
    `🎂 <b>Заказ #${order.order_number} принят!</b>\n\n` +
    (iLines ? iLines + '\n\n' : '') +
    `💰 Сумма: <b>${fmtN(order.total_requested_amount)} сум</b>\n` +
    `${delType}${order.branch_name ? ': ' + _h(order.branch_name) : ''}\n\n` +
    `⏳ Ожидайте подтверждения от кондитерской.`
  );

  // → Manager: new order alert
  await _notifyStaff(
    order.branch_id,
    `🆕 <b>Новый заказ #${order.order_number}</b>\n\n` +
    `👤 ${_h(order.customer_name)}\n` +
    `📞 ${_h(order.phone)}\n` +
    `${delType}${order.branch_name ? ' · ' + _h(order.branch_name) : ''}\n\n` +
    (iLines ? iLines + '\n\n' : '') +
    `💰 <b>${fmtN(order.total_requested_amount)} сум</b>`
  );
}

async function _onOrderConfirmed(order, items) {
  // Use status as dedup key — partial uses 'awaiting_client', full uses 'confirmed'
  if (_deduped(order.id, order.status)) return;

  const confirmed   = items.filter(i => (i.confirmed_qty || 0) > 0);
  const unavailable = items.filter(i => (i.confirmed_qty || 0) === 0);
  const partial     = unavailable.length > 0;

  const clientChatId = await _getClientChatId(order.user_id);

  if (partial) {
    const confLines = confirmed.map(i => {
      const qty = i.weight_grams ? `${i.weight_grams} г` : `${i.confirmed_qty} шт`;
      return `✅ ${_h(i.product_title_snapshot)} — ${qty}`;
    }).join('\n');
    const unavLines = unavailable
      .map(i => `❌ ${_h(i.product_title_snapshot)} — нет в наличии`)
      .join('\n');

    await sendTG(clientChatId,
      `📋 <b>Заказ #${order.order_number} — требует вашего подтверждения</b>\n\n` +
      (confLines  ? confLines  + '\n' : '') +
      (unavLines  ? unavLines  + '\n' : '') +
      `\n💰 Новая сумма: <b>${fmtN(order.total_confirmed_amount)} сум</b>\n` +
      `<s>${fmtN(order.total_requested_amount)} сум</s>\n\n` +
      `Подтвердите или отмените заказ в личном кабинете.`
    );
  } else {
    const confLines = confirmed.map(i => {
      const qty = i.weight_grams ? `${i.weight_grams} г` : `${i.confirmed_qty} шт`;
      return `✅ ${_h(i.product_title_snapshot)} — ${qty}`;
    }).join('\n');

    await sendTG(clientChatId,
      `✅ <b>Заказ #${order.order_number} подтверждён!</b>\n\n` +
      (confLines ? confLines + '\n\n' : '') +
      `💰 <b>${fmtN(order.total_confirmed_amount || order.total_requested_amount)} сум</b>\n\n` +
      `Мы начнём готовить ваш заказ. Ожидайте!`
    );
  }
}

async function _onClientAccepted(order) {
  if (_deduped(order.id, 'client_accepted')) return;
  await _notifyStaff(order.branch_id,
    `✅ <b>Клиент подтвердил изменения</b>\n\n` +
    `Заказ #${order.order_number}\n` +
    `👤 ${_h(order.customer_name)}\n` +
    `📞 ${_h(order.phone)}\n` +
    `💰 <b>${fmtN(order.total_confirmed_amount)} сум</b>\n\n` +
    `Можно приступать к приготовлению.`
  );
}

async function _onClientCancelled(order) {
  if (_deduped(order.id, 'client_cancelled')) return;
  await sendTG(
    await _getClientChatId(order.user_id),
    `❌ <b>Заказ #${order.order_number} отменён</b>\n\n` +
    `Ваш заказ был отменён по вашему запросу.\n` +
    `Если это ошибка — свяжитесь с нами.`
  );
  await _notifyStaff(order.branch_id,
    `❌ <b>Клиент отменил заказ #${order.order_number}</b>\n\n` +
    `👤 ${_h(order.customer_name)}\n` +
    `📞 ${_h(order.phone)}`
  );
}

async function _onManagerCancelled(order) {
  if (_deduped(order.id, 'mgr_cancelled')) return;
  await sendTG(
    await _getClientChatId(order.user_id),
    `❌ <b>Заказ #${order.order_number} отменён</b>\n\n` +
    (order.cancel_reason
      ? `Причина: ${_h(order.cancel_reason)}\n\n`
      : `Причина не указана.\n\n`) +
    `Приносим извинения. Вы можете оформить новый заказ.`
  );
}

async function _onStatusProgress(order, status) {
  if (_deduped(order.id, status)) return;
  const msgs = {
    preparing:
      `👨‍🍳 <b>Заказ #${order.order_number} готовится</b>\n\n` +
      `Мы уже приступили к приготовлению. Сообщим когда будет готов!`,
    ready:
      `🎂 <b>Заказ #${order.order_number} готов!</b>\n\n` +
      (order.delivery_type === 'pickup'
        ? `Заберите в филиале:\n📍 ${_h(order.branch_name || '')}`
        : `🚚 Курьер скоро выедет к вам`),
    completed:
      `❤️ <b>Заказ #${order.order_number} выполнен</b>\n\n` +
      `Спасибо что выбрали ADIA Cake! Будем рады видеть вас снова 🎂`,
  };
  if (msgs[status]) await sendTG(await _getClientChatId(order.user_id), msgs[status]);
}

// ── Status transition router ──────────────────────────────────────────────────

async function _handleTransition(order, oldStatus, newStatus) {
  if (newStatus === 'confirmed' && oldStatus === 'awaiting_client') {
    // Client accepted the partial changes
    await _onClientAccepted(order);

  } else if (newStatus === 'confirmed' || newStatus === 'awaiting_client') {
    // Manager confirmed the order (full or partial)
    let items = [];
    try {
      const rows = await sbRequest(
        `/${ITEMS_TBL}?order_id=eq.${encodeURIComponent(order.id)}`
      );
      items = Array.isArray(rows) ? rows : [];
    } catch {}
    await _onOrderConfirmed(order, items);

  } else if (newStatus === 'cancelled') {
    await _onManagerCancelled(order);

  } else if (newStatus === 'cancelled_by_client') {
    await _onClientCancelled(order);

  } else {
    // preparing / ready / completed
    await _onStatusProgress(order, newStatus);
  }
}

// ── Polling loop ──────────────────────────────────────────────────────────────

const _orderCache = new Map();   // orderId → last known status
let   _pollSince  = new Date().toISOString(); // only notify events from now on

setInterval(async () => {
  const since = _pollSince;
  _pollSince  = new Date().toISOString();
  const enc   = encodeURIComponent;

  // Two queries: one for newly created orders, one for updated orders.
  // Merge by id to process each order only once per tick.
  let createdRows = [], updatedRows = [];
  try {
    [createdRows, updatedRows] = await Promise.all([
      sbRequest(`/${ORDERS_TBL}?created_at=gt.${enc(since)}&order=created_at.asc&limit=50`),
      sbRequest(`/${ORDERS_TBL}?updated_at=gt.${enc(since)}&order=updated_at.asc&limit=50`),
    ]);
  } catch { return; }

  const byId = new Map();
  for (const r of [...(createdRows || []), ...(updatedRows || [])]) byId.set(r.id, r);

  for (const order of byId.values()) {
    const cached = _orderCache.get(order.id);
    const status = order.status;

    if (cached === undefined) {
      // First time we see this order in this bot session
      _orderCache.set(order.id, status);
      if (status === 'new') await _onNewOrder(order);
    } else if (cached !== status) {
      // Status has changed since last poll
      _orderCache.set(order.id, status);
      await _handleTransition(order, cached, status);
    }

    // Free cache entries after terminal states (delayed to catch late duplicates)
    if (['completed', 'cancelled', 'cancelled_by_client'].includes(status)) {
      setTimeout(() => _orderCache.delete(order.id), 120_000);
    }
  }
}, 5000);
