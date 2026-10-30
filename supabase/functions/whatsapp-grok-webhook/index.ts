/**
 * whatsapp-grok-webhook — Meta/Twilio → Grok → citas (RLS/RPC multi-tenant)
 * Deploy: supabase functions deploy whatsapp-grok-webhook --no-verify-jwt
 * Secrets: XAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, WHATSAPP_PROVIDER,
 * META_* o TWILIO_*, DEFAULT_CONSULTORIO_ID (uuid de la clinica)
 * Requiere SQL: rls_tenant_aislamiento.sql
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `Asistente WhatsApp clinica dental (DentFlow). Espanol, breve. No diagnostiques.
Intents JSON al final: confirmar_cita, cancelar_cita, reagendar_cita, consultar_presupuesto, hablar_humano, ninguna.
Solo datos del CONTEXTO.`;

function json(s: number, b: unknown) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
function normPhone(p: string) {
  return String(p || "").replace(/\D/g, "");
}
function extractIntent(t: string) {
  const m = t.match(/\{[\s\n]*"intent"\s*:\s*"[^"]+"[^}]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
function stripIntent(t: string) {
  return t.replace(/\{[\s\n]*"intent"\s*:\s*"[^"]+"[^}]*\}/g, "").trim();
}
function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
}
function resolveConsultorioId(): string | null {
  return Deno.env.get("DEFAULT_CONSULTORIO_ID") || Deno.env.get("CONSULTORIO_ID") || null;
}

async function buildContext(phone: string) {
  const sb = serviceClient();
  const consultorioId = resolveConsultorioId();
  const { data, error } = await sb.rpc("rpc_contexto_whatsapp", {
    p_telefono: phone,
    p_consultorio_id: consultorioId,
  });
  if (error) {
    console.error("rpc_contexto_whatsapp", error);
    return {
      telefono: phone,
      paciente: null,
      citas_proximas: [],
      presupuestos: [],
      nota: "Error RPC contexto. Ejecutar rls_tenant_aislamiento.sql",
    };
  }
  if (!data || data.ok === false) {
    return {
      telefono: phone,
      paciente: null,
      citas_proximas: [],
      presupuestos: [],
      nota: (data && data.error) || "paciente_no_encontrado",
    };
  }
  return {
    telefono: phone,
    paciente: data.paciente,
    consultorio_id: data.consultorio_id,
    citas_proximas: data.citas_proximas || [],
    presupuestos: data.presupuestos || [],
  };
}

async function executeIntent(intent: Record<string, unknown> | null, ctx: Record<string, unknown>) {
  if (!intent || !intent.intent || intent.intent === "ninguna") {
    return { done: false, note: "" };
  }
  const consultorioId = String(ctx.consultorio_id || resolveConsultorioId() || "");
  if (!consultorioId) {
    return { done: false, note: "Sin consultorio_id: no se aplico el cambio." };
  }
  const sb = serviceClient();
  const { data, error } = await sb.rpc("rpc_ejecutar_intent_whatsapp", {
    p_intent: intent,
    p_consultorio_id: consultorioId,
  });
  if (error) {
    console.error("rpc_ejecutar_intent_whatsapp", error);
    return { done: false, note: "No se pudo actualizar (RPC)." };
  }
  if (data && data.ok === false) {
    return { done: false, note: String(data.error || "intent_fallido") };
  }
  return { done: true, note: "Accion: " + (data?.action || intent.intent) };
}

async function callGrok(message: string, context: Record<string, unknown>) {
  const key = Deno.env.get("XAI_API_KEY");
  if (!key) throw new Error("XAI_API_KEY missing");
  const model = Deno.env.get("XAI_MODEL") || "grok-2";
  const res = await fetch(
    Deno.env.get("XAI_API_URL") || "https://api.x.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 600,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "system", content: "CONTEXTO:\n" + JSON.stringify(context) },
          { role: "user", content: message },
        ],
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  const raw = data?.choices?.[0]?.message?.content || "";
  return { reply: stripIntent(raw) || "Gracias, un momento.", intent: extractIntent(raw) };
}

async function sendWhatsApp(to: string, body: string) {
  const provider = (Deno.env.get("WHATSAPP_PROVIDER") || "meta").toLowerCase();
  if (provider === "twilio") {
    const sid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
    const token = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
    const from = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
    const toAddr = to.startsWith("whatsapp:") ? to : "whatsapp:+" + normPhone(to);
    const auth = btoa(sid + ":" + token);
    const params = new URLSearchParams({ From: from, To: toAddr, Body: body });
    await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {
      method: "POST",
      headers: {
        Authorization: "Basic " + auth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    return;
  }
  const token = Deno.env.get("META_WA_TOKEN") || "";
  const phoneId = Deno.env.get("META_WA_PHONE_NUMBER_ID") || "";
  await fetch("https://graph.facebook.com/v20.0/" + phoneId + "/messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normPhone(to),
      type: "text",
      text: { body: body.slice(0, 4000) },
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verify = Deno.env.get("META_WA_VERIFY_TOKEN") || "dentflow_verify_2026";
    if (mode === "subscribe" && token === verify && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return json(405, { error: "method" });

  const ct = req.headers.get("content-type") || "";
  let from = "";
  let text = "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await req.text());
    from = String(form.get("From") || "").replace("whatsapp:", "");
    text = String(form.get("Body") || "").trim();
  } else {
    const body = await req.json().catch(() => ({}));
    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (msg) {
      from = String(msg.from || "");
      text = String(msg.text?.body || "").trim();
    }
  }
  if (!text) return json(200, { ok: true, ignored: true });

  try {
    const ctx = await buildContext(from);
    const { reply, intent } = await callGrok(text, ctx);
    const exec = await executeIntent(intent, ctx);
    const finalReply = exec.note ? reply + "\n\n" + exec.note : reply;
    await sendWhatsApp(from, finalReply);
    return json(200, { ok: true, intent, tenant: ctx.consultorio_id || null });
  } catch (e) {
    console.error(e);
    try {
      await sendWhatsApp(from, "Problema tecnico. Intenta de nuevo o llama a la clinica.");
    } catch { /* */ }
    return json(200, { ok: false, error: String(e) });
  }
});
