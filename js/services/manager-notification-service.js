// ================================
//  MANAGER NOTIFICATION SERVICE
//  Sends Telegram messages to the branch manager (or owner fallback)
//  when order events happen on the customer side.
// ================================

import { sbFetch }              from '../api/supabase-client.js';
import { sendTelegramMessage }  from '../api/telegram-api.js';
import { formatPrice }          from '../utils/format.js';

async function _getRecipients(branchId) {
  const rows = await sbFetch(`/rpc/get_staff_telegram_targets`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ p_branch_id: branchId || null }),
  });
  return Array.isArray(rows) ? rows.filter(r => r.telegram_chat_id) : [];
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
