-- Performance indexes recommended after Этап 3 backend audit
-- Run in Supabase Dashboard → SQL Editor

-- 1. Notification poller queries orders by user_id + updated_at every 15s
CREATE INDEX IF NOT EXISTS idx_orders_user_id_updated_at
  ON orders (user_id, updated_at DESC);

-- 2. Phone-based order lookup (getOrdersByUserId guest fallback)
CREATE INDEX IF NOT EXISTS idx_orders_phone_updated_at
  ON orders (phone, updated_at DESC);

-- 3. Admin order list filtered by branch
CREATE INDEX IF NOT EXISTS idx_orders_branch_id_created_at
  ON orders (branch_id, created_at DESC);

-- 4. getOrderItems — called on every admin card expand
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items (order_id);

-- ── CRITICAL: Fix race condition on order_number ───────────────────────────
-- Current: client reads MAX(order_number)+1 — two concurrent checkouts
-- can produce duplicate order numbers.
-- Fix: use a PostgreSQL sequence as the default value.

CREATE SEQUENCE IF NOT EXISTS orders_order_number_seq START 1;

ALTER TABLE orders
  ALTER COLUMN order_number SET DEFAULT nextval('orders_order_number_seq');

-- After running this: remove getNextOrderNumber() call from checkout.js
-- and stop passing order_number to createOrder() — DB generates it automatically.
