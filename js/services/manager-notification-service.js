// ================================
//  MANAGER NOTIFICATION SERVICE
//  Sends Telegram messages to the branch manager (or owner fallback)
//  when order events happen on the customer side.
// ================================

import { sbFetch }              from '../api/supabase-client.js';
import { sendTelegramMessage }  from '../api/telegram-api.js';
import { formatPrice }          from '../utils/format.js';

const STAFF_TBL = 'staff_users';

async function _getRecipients(branchId) {
  const filter = branchId
    ? `branch_id=eq.${encodeURIComponent(branchId)}&role=eq.manager&is_active=eq.true`
    : 'role=eq.super_admin&is_active=eq.true';

  const rows = await sbFetch(
    `/${STAFF_TBL}?${filter}&telegram_chat_id=not.is.null&select=telegram_chat_id`
  );
  const managers = Array.isArray(rows) ? rows.filter(r => r.telegram_chat_id) : [];

  // Fallback to super_admin when branch has no manager
  if (!managers.length && branchId) {
    const owners = await sbFetch(
      `/${STAFF_TBL}?role=eq.super_admin&is_active=eq.true&telegram_chat_id=not.is.null&select=telegram_chat_id`
    );
    return Array.isArray(owners) ? owners.filter(r => r.telegram_chat_id) : [];
  }
  return managers;
}

async function _send(chatId, text) {
  await sendTelegramMessage(chatId, text);
}

export async function notifyManagerNewOrder(order) {
  try {
    const recipients = await _getRecipients(order.branchId);
    if (!recipients.length) return;

    const num  = order.orderNumber ?? order.id;
    const type = order.deliveryType === 'pickup' ? '🏪 Самовывоз' : '🚚 Доставка';
    const text =
      `🆕 Новый заказ #${num}\n\n` +
      `👤 ${order.customerName || '—'}\n` +
      `📞 ${order.phone || '—'}\n` +
      `💰 ${formatPrice(order.totalRequestedAmount)}\n` +
      `${type}`;

    await Promise.all(recipients.map(r => _send(r.telegram_chat_id, text)));
  } catch { /* non-critical — never crash the order flow */ }
}

export async function notifyManagerClientConfirmed(order) {
  try {
    const recipients = await _getRecipients(order.branchId);
    if (!recipients.length) return;

    const num  = order.orderNumber ?? order.id;
    const text =
      `✅ Клиент подтвердил изменения\n\n` +
      `Заказ #${num}\n` +
      `👤 ${order.customerName || '—'}\n` +
      `💰 ${formatPrice(order.totalConfirmedAmount || order.totalRequestedAmount)}`;

    await Promise.all(recipients.map(r => _send(r.telegram_chat_id, text)));
  } catch { /* non-critical */ }
}

export async function notifyManagerClientCancelled(order) {
  try {
    const recipients = await _getRecipients(order.branchId);
    if (!recipients.length) return;

    const num  = order.orderNumber ?? order.id;
    const text =
      `❌ Клиент отменил заказ #${num}\n` +
      `👤 ${order.customerName || '—'}`;

    await Promise.all(recipients.map(r => _send(r.telegram_chat_id, text)));
  } catch { /* non-critical */ }
}
