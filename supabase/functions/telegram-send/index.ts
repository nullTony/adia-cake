// Supabase Edge Function — Telegram sendMessage proxy
// BOT_TOKEN хранится только как Supabase secret, никогда не попадает в JS бандл.
//
// Deploy:
//   supabase functions deploy telegram-send
//   supabase secrets set TELEGRAM_BOT_TOKEN=<new-token-from-botfather>
//
// Endpoint: https://orfxopppqqvwueoatasu.supabase.co/functions/v1/telegram-send

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) {
    console.error('[telegram-send] TELEGRAM_BOT_TOKEN secret not set');
    return new Response(JSON.stringify({ error: 'Bot not configured' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body: { chat_id?: unknown; text?: unknown; parse_mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { chat_id, text, parse_mode } = body;

  if (!chat_id || !text) {
    return new Response(JSON.stringify({ error: 'chat_id and text are required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const payload: Record<string, unknown> = { chat_id, text };
  if (parse_mode) payload.parse_mode = parse_mode;

  // 5-second timeout — Telegram API can hang on blocked/deleted accounts
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  let data: Record<string, unknown>;
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    data = await tgRes.json();

    // Telegram always returns HTTP 200 with { ok: false } for soft errors
    // (bot blocked, invalid chat_id, etc.). Log it but don't fail the caller —
    // notification failure must never block the order flow.
    if (!data.ok) {
      console.warn(
        `[telegram-send] Telegram rejected message to chat_id=${chat_id}:`,
        data.error_code, data.description,
      );
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.error(
      isTimeout
        ? `[telegram-send] Telegram API timed out for chat_id=${chat_id}`
        : `[telegram-send] Network error for chat_id=${chat_id}:`,
      err,
    );
    // Return 200 to caller — notification failures are non-critical
    return new Response(JSON.stringify({ ok: false, description: isTimeout ? 'timeout' : 'network_error' }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
