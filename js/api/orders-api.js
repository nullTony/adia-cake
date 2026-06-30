// ================================
//  ORDERS API — Supabase backend
//
//  Tables:
//    orders      — one row per order
//    order_items — one row per cart line
//
//  Supabase schema (snake_case):
//  orders:
//    id, order_number, customer_name, phone, delivery_type,
//    delivery_address, branch_id, branch_name,
//    comment, status, total_requested_amount, total_confirmed_amount,
//    created_at, updated_at
//
//  order_items:
//    id, order_id, product_id,
//    product_title_snapshot, product_price_snapshot,
//    requested_qty, confirmed_qty, item_status, admin_comment
// ================================

import { sbFetch }    from './supabase-client.js';
import { API_CONFIG } from '../config/api-config.js';

const ORDERS_TBL = API_CONFIG.SUPABASE.TABLES.ORDERS;
const ITEMS_TBL  = API_CONFIG.SUPABASE.TABLES.ORDER_ITEMS;

// ── Normalization ─────────────────────────────────────────────────────────────

export function fromOrder(row) {
  return {
    id:                   row.id,
    orderNumber:          row.order_number != null ? Number(row.order_number) : null,
    userId:               row.user_id             || null,
    customerName:         row.customer_name,
    phone:                row.phone,
    deliveryType:         row.delivery_type,
    deliveryAddress:      row.delivery_address    || null,
    deliveryLat:          row.delivery_lat  != null ? Number(row.delivery_lat)  : null,
    deliveryLng:          row.delivery_lng  != null ? Number(row.delivery_lng)  : null,
    branchId:             row.branch_id           || null,
    branchName:           row.branch_name         || null,
    comment:              row.comment             || null,
    status:               row.status              || 'new',
    cancelReason:         row.cancel_reason       || null,
    totalRequestedAmount: Number(row.total_requested_amount) || 0,
    totalConfirmedAmount: Number(row.total_confirmed_amount) || 0,
    createdAt:            row.created_at          || '',
    updatedAt:            row.updated_at          || '',
  };
}

function toOrder(o) {
  return {
    user_id:                o.userId                || null,
    customer_name:          o.customerName,
    phone:                  o.phone,
    delivery_type:          o.deliveryType,
    delivery_address:       o.deliveryAddress       || null,
    delivery_lat:           o.deliveryLat           ?? null,
    delivery_lng:           o.deliveryLng           ?? null,
    branch_id:              o.branchId              || null,
    branch_name:            o.branchName            || null,
    comment:                o.comment               || null,
    status:                 o.status                || 'new',
    total_requested_amount: o.totalRequestedAmount  || 0,
    total_confirmed_amount: 0,
  };
}

function fromItem(row) {
  return {
    id:                   row.id,
    orderId:              row.order_id,
    productId:            row.product_id,
    productTitleSnapshot: row.product_title_snapshot,
    productPriceSnapshot: Number(row.product_price_snapshot) || 0,
    requestedQty:         Number(row.requested_qty)          || 0,
    confirmedQty:         Number(row.confirmed_qty)          || 0,
    itemStatus:           row.item_status                    || 'pending',
    adminComment:         row.admin_comment                  || null,
    weightGrams:          row.weight_grams != null ? Number(row.weight_grams) : null,
  };
}

function toItem(i) {
  return {
    order_id:               i.orderId,
    product_id:             i.productId,
    product_title_snapshot: i.productTitleSnapshot,
    product_price_snapshot: i.productPriceSnapshot,
    requested_qty:          i.requestedQty,
    confirmed_qty:          0,
    item_status:            'pending',
    admin_comment:          null,
    weight_grams:           i.weightGrams ?? null,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

// Client: create order via SECURITY DEFINER RPC.
// order_number is generated atomically inside the function.
// RETURNING * bypasses RLS so the inserted row comes back to anon.
export async function createOrder(orderData) {
  const b = toOrder(orderData);
  const result = await sbFetch('/rpc/create_order', {
    method: 'POST',
    body:   JSON.stringify({
      p_user_id:                b.user_id                || null,
      p_customer_name:          b.customer_name,
      p_phone:                  b.phone,
      p_delivery_type:          b.delivery_type,
      p_delivery_address:       b.delivery_address       || null,
      p_delivery_lat:           b.delivery_lat           ?? null,
      p_delivery_lng:           b.delivery_lng           ?? null,
      p_branch_id:              b.branch_id              || null,
      p_branch_name:            b.branch_name            || null,
      p_comment:                b.comment                || null,
      p_total_requested_amount: b.total_requested_amount || 0,
    }),
  });
  const row = Array.isArray(result) ? result[0] : result;
  return row ? fromOrder(row) : null;
}

// Client: create order item via SECURITY DEFINER RPC.
export async function createOrderItem(itemData) {
  const b = toItem(itemData);
  const result = await sbFetch('/rpc/create_order_item', {
    method: 'POST',
    body:   JSON.stringify({
      p_order_id:               b.order_id,
      p_product_id:             b.product_id,
      p_product_title_snapshot: b.product_title_snapshot,
      p_product_price_snapshot: b.product_price_snapshot,
      p_requested_qty:          b.requested_qty,
      p_weight_grams:           b.weight_grams ?? null,
    }),
  });
  const row = Array.isArray(result) ? result[0] : result;
  return row ? fromItem(row) : null;
}

// Admin: all orders, newest first. Pass branchId to restrict to one branch.
export async function getOrders(branchId = null) {
  const filter = branchId
    ? `&branch_id=eq.${encodeURIComponent(branchId)}`
    : '';
  const rows = await sbFetch(`/${ORDERS_TBL}?order=created_at.desc${filter}`);
  if (!Array.isArray(rows)) return [];
  return rows.map(fromOrder);
}

// Admin: single order by id
export async function getOrderById(id) {
  const rows = await sbFetch(`/${ORDERS_TBL}?id=eq.${encodeURIComponent(id)}`);
  if (!Array.isArray(rows) || !rows.length) return null;
  return fromOrder(rows[0]);
}

// Admin: items for one order (requires JWT / staff context)
export async function getOrderItems(orderId) {
  const rows = await sbFetch(`/${ITEMS_TBL}?order_id=eq.${encodeURIComponent(orderId)}`);
  if (!Array.isArray(rows)) return [];
  return rows.map(fromItem);
}

// Client: items for one of the client's own orders via SECURITY DEFINER RPC.
// p_phone is required so the function can verify ownership.
export async function getMyOrderItems(orderId, phone) {
  const rows = await sbFetch('/rpc/get_my_order_items', {
    method: 'POST',
    body:   JSON.stringify({ p_order_id: orderId, p_phone: phone }),
  });
  if (!Array.isArray(rows)) return [];
  return rows.map(fromItem);
}

// User: orders by user_id + phone fallback via SECURITY DEFINER RPC.
export async function getOrdersByUserId(userId, phone = null) {
  const rows = await sbFetch('/rpc/get_my_orders', {
    method: 'POST',
    body:   JSON.stringify({ p_user_id: userId || null, p_phone: phone || null }),
  });
  if (!Array.isArray(rows)) return [];
  return rows.map(fromOrder);
}

// Admin: update confirmed_qty + item_status for one item
export async function updateOrderItem(itemId, { confirmedQty, itemStatus }) {
  const rows = await sbFetch(`/${ITEMS_TBL}?id=eq.${encodeURIComponent(itemId)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify({ confirmed_qty: confirmedQty, item_status: itemStatus }),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromItem(row) : null;
}

// Admin: write back recalculated total_confirmed_amount
export async function updateOrderConfirmedTotal(id, total) {
  const rows = await sbFetch(`/${ORDERS_TBL}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify({ total_confirmed_amount: total, updated_at: new Date().toISOString() }),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromOrder(row) : null;
}

// Admin: bulk-confirm all pending items for an order (called when order completes).
// Only updates item_status; confirmed_qty stays 0 — display layer shows requestedQty instead.
export async function confirmPendingItems(orderId) {
  await sbFetch(
    `/${ITEMS_TBL}?order_id=eq.${encodeURIComponent(orderId)}&item_status=eq.pending`,
    {
      method:  'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body:    JSON.stringify({ item_status: 'confirmed' }),
    }
  );
}

// Client: count in-progress orders (for mobile nav badge) via SECURITY DEFINER RPC.
export async function countActiveOrders(userId, phone = null) {
  if (!userId && !phone) return 0;
  const result = await sbFetch('/rpc/count_active_orders', {
    method: 'POST',
    body:   JSON.stringify({ p_user_id: userId || null, p_phone: phone || null }),
  }).catch(() => 0);
  return Number(result) || 0;
}

// Client: update order status for own order (confirmed / cancelled_by_client only).
// p_phone verifies ownership; RPC rejects any status not in the allowed client set.
export async function clientUpdateOrderStatus(orderId, newStatus, phone) {
  await sbFetch('/rpc/client_update_order_status', {
    method: 'POST',
    body:   JSON.stringify({ p_order_id: orderId, p_status: newStatus, p_phone: phone }),
  });
}

// Admin: update order status (cancelReason only stored when status = 'cancelled')
export async function updateOrderStatus(id, status, cancelReason = null) {
  const payload = { status, updated_at: new Date().toISOString() };
  if (status === 'cancelled') payload.cancel_reason = cancelReason || null;
  const rows = await sbFetch(`/${ORDERS_TBL}?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body:    JSON.stringify(payload),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? fromOrder(row) : null;
}
