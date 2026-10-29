/**
 * whatsapp-grok-webhook — Meta/Twilio → Grok → citas/presupuestos
 * Deploy: supabase functions deploy whatsapp-grok-webhook --no-verify-jwt
 * Secrets: XAI_API_KEY, WHATSAPP_PROVIDER=meta|twilio,
 * META_WA_TOKEN, META_WA_PHONE_NUMBER_ID, META_WA_VERIFY_TOKEN
 * o TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 * SUPABASE_SERVICE_ROLE_KEY
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SYSTEM = `Asistente WhatsApp de clínica dental (DentFlow). Español, breve. No diagnostiques.
Intents JSON al final: confirmar_cita, cancelar_cita, reagendar_cita, enviar_presupuesto, consultar_presupuesto, hablar_humano, ninguna.`;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

function json(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
function normPhone(p: string) { return String(p || "").replace(/\D/g, ""); }
function extractIntent(t: string) {
  const m = t.match(/\{[\s\n]*"intent"\s*:\s*"[^"]+"[^}]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
function stripIntent(t: string) {
  return t.replace(/\{[\s\n]*"intent"\s*:\s*"[^"]+"[^}]*\}/g, "").trim();
}
function sb() {
  return createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
}

async function buildContext(phone: string) {
  const client = sb();
  const digits = normPhone(phone);
  const tail = digits.slice(-9);
  const { data: pacientes } = await client.from("pacientes").select("*").limit(300);
  const paciente = (pacientes || []).find((p: Record<string, unknown>) => {
    const t = normPhone(String(p.telefono || p.phone || ""));
    return t && (t === digits || t.endsWith(tail) || digits.endsWith(t.slice(-9)));
  }) || null;
  const ctx: Record<string, unknown> = { telefono: phone, paciente: null, citas_proximas: [], presupuestos: [], huecos_sugeridos: [] };
  if (!paciente) { ctx.nota = "Paciente no encontrado por teléfono"; return ctx; }
  ctx.paciente = { id: paciente.id, nombre: paciente.nombre || paciente.name };
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: citas } = await client.from("citas").select("*").eq("paciente_id", paciente.id).limit(20);
  ctx.citas_proximas = (citas || []).filter((c: Record<string, unknown>) => String(c.fecha || c.dateKey || "") >= hoy).slice(0, 8);
  try {
    const { data: pres } = await client.from("presupuestos").select("id,estado,total,numero_factura").eq("paciente_id", paciente.id).limit(5);
    ctx.presupuestos = pres || [];
  } catch { /* optional table */ }
  const huecos: { fecha: string; hora: string }[] = [];
  for (let i = 1; i <= 7 && huecos.length < 6; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    if (d.getDay() === 0) continue;
    const fecha = d.toISOString().slice(0, 10);
    huecos.push({ fecha, hora: "09:00" }, { fecha, hora: "10:30" });
  }
  ctx.huecos_sugeridos = huecos.slice(0, 6);
  return ctx;
}

async function callGrok(message: string, context: Record<string, unknown>) {
  const key = Deno.env.get("XAI_API_KEY");
  if (!key) throw new Error("XAI_API_KEY missing");
  const model = Deno.env.get("XAI_MODEL") || "grok-2";
  const res = await fetch(Deno.env.get("XAI_API_URL") || "https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model, temperature: 0.25, max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "system", content: "CONTEXTO:\n" + JSON.stringify(context) },
        { role: "user", content: message },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  const raw = data?.choices?.[0]?.message?.content || "";
  return { reply: stripIntent(raw) || "Gracias, un momento.", intent: extractIntent(raw) };
}

async function executeIntent(intent: Record<string, unknown> | null) {
  if (!intent?.intent || intent.intent === "ninguna") return "";
  const client = sb();
  const id = String(intent.cita_id || "");
  if (intent.intent === "confirmar_cita" && id) {
    await client.from("citas").update({ estado: "confirmada" }).eq("id", id);
    return "Cita confirmada.";
  }
  if (intent.intent === "cancelar_cita" && id) {
    await client.from("citas").update({ estado: "cancelada" }).eq("id", id);
    return "Cita cancelada.";
  }
  if (intent.intent === "reagendar_cita" && id) {
    const patch: Record<string, unknown> = { estado: "pendiente" };
    if (intent.fecha_preferida) { patch.fecha = intent.fecha_preferida; patch.dateKey = intent.fecha_preferida; }
    await client.from("citas").update(patch).eq("id", id);
    return "Reagenda registrada.";
  }
  return "";
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
      headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    return;
  }
  const token = Deno.env.get("META_WA_TOKEN") || "";
  const phoneId = Deno.env.get("META_WA_PHONE_NUMBER_ID") || "";
  await fetch("https://graph.facebook.com/v20.0/" + phoneId + "/messages", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: normPhone(to), type: "text", text: { body: body.slice(0, 4000) } }),
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
    if (mode === "subscribe" && token === verify && challenge) return new Response(challenge, { status: 200 });
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
    const entry = body?.entry?.[0];
    const value = entry?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (msg) { from = String(msg.from || ""); text = String(msg.text?.body || "").trim(); }
  }
  if (!text) return json(200, { ok: true, ignored: true });

  try {
    const ctx = await buildContext(from);
    const { reply, intent } = await callGrok(text, ctx);
    const note = await executeIntent(intent);
    const finalReply = note ? reply + "\n\n" + note : reply;
    await sendWhatsApp(from, finalReply);
    return json(200, { ok: true, intent });
  } catch (e) {
    console.error(e);
    try { await sendWhatsApp(from, "Problema técnico. Intenta de nuevo o llama a la clínica."); } catch { /* */ }
    return json(200, { ok: false, error: String(e) });
  }
});
