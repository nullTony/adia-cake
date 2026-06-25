-- MED-5: Enforce auth_sessions expiry server-side via RLS
-- Run in Supabase Dashboard → SQL Editor
-- Prevents fetching expired sessions via direct REST API calls.

-- Enable RLS if not already enabled
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing permissive policy if present
DROP POLICY IF EXISTS "auth_sessions_select_valid_only" ON auth_sessions;

-- Allow SELECT only on non-expired sessions (server enforces expires_at)
CREATE POLICY "auth_sessions_select_valid_only" ON auth_sessions
  FOR SELECT
  USING (expires_at > now());

-- Anon users can insert new sessions (start of auth flow)
DROP POLICY IF EXISTS "auth_sessions_insert_anon" ON auth_sessions;
CREATE POLICY "auth_sessions_insert_anon" ON auth_sessions
  FOR INSERT
  WITH CHECK (true);

-- Anon users can update only non-expired sessions (bot confirmation)
-- Note: bot.js uses service_role key which bypasses RLS — this covers REST callers
DROP POLICY IF EXISTS "auth_sessions_update_valid_only" ON auth_sessions;
CREATE POLICY "auth_sessions_update_valid_only" ON auth_sessions
  FOR UPDATE
  USING (expires_at > now());
