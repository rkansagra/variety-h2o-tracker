// admin-assistant Edge Function: POST { question, history? } -> { answer, toolCalls }.
//
// Runs with the caller's own login, never the service-role key: the database calls go through
// RLS as the signed-in admin, and assistant_require_admin() refuses anyone else before Claude
// is called. Tool calls go over GET, which PostgREST runs in a read-only transaction.
// Secrets: ANTHROPIC_API_KEY (required), ASSISTANT_MODEL (optional, see assistant.ts).
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { DEFAULT_MODEL, runAssistant, validateRequest } from "./assistant.ts";

const TIMEOUT_MS = 60_000;

// Bearer-token auth (no cookies), so any origin may call it: the web app, Deploy Previews, and
// the Android app's webview all differ.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Supabase provides SUPABASE_ANON_KEY on projects with legacy keys and SUPABASE_PUBLISHABLE_KEYS
// (a JSON object of name -> key) on newer ones.
function publicKey(): string {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  return keys.default ?? Object.values(keys)[0] ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const started = Date.now();
  const log = (fields: Record<string, unknown>) =>
    // Tool names, counts, and timings only: no question text, arguments, or results, which can
    // contain customer names.
    console.log(JSON.stringify({ event: "admin_assistant", latency_ms: Date.now() - started, ...fields }));

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in first" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publicKey(), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: adminError } = await supabase.rpc("assistant_require_admin", {}, { get: true });
  if (adminError) {
    log({ ok: false, error_kind: "not_admin" });
    return json({ error: "Only admins can use the assistant" }, 403);
  }

  let request;
  try {
    request = validateRequest(await req.json());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Bad request" }, 400);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    log({ ok: false, error_kind: "no_api_key" });
    return json({ error: "The assistant isn't set up yet (no API key)" }, 503);
  }

  const model = Deno.env.get("ASSISTANT_MODEL") || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await runAssistant({
      client: new Anthropic({ apiKey }) as never,
      callRpc: async (rpc, args) => {
        const { data, error } = await supabase.rpc(rpc, args, { get: true }).abortSignal(controller.signal);
        if (error) throw new Error(error.message);
        return Array.isArray(data) ? data : data == null ? [] : [data];
      },
      question: request.question,
      history: request.history,
      model,
      signal: controller.signal,
    });
    log({
      ok: true,
      model,
      stop_reason: result.stopReason,
      iterations: result.iterations,
      tools: result.toolCalls.map((call) => (call.error ? `${call.name}!` : call.name)),
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
    });
    return json({ answer: result.answer, toolCalls: result.toolCalls, stopReason: result.stopReason });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    log({ ok: false, model, error_kind: timedOut ? "timeout" : "error", message: error instanceof Error ? error.name : "unknown" });
    return json({ error: timedOut ? "That took too long. Try a narrower question." : "The assistant hit an error. Try again." }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }
});
