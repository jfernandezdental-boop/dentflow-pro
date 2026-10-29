/**
 * Supabase Edge Function: grok-assistant
 * Endpoint de IA para DentFlow Pro (Grok / xAI).
 * Secrets: XAI_API_KEY, XAI_MODEL
 * Deploy: supabase functions deploy grok-assistant
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SYSTEM_PROMPT = `Eres el asistente oficial de DentFlow Pro, un sistema de gestión odontológica multi-clínica.
Hablas en español, breve y profesional. No diagnostiques ni inventes datos fuera del CONTEXTO.
Paciente: confirmar/cancelar/reagendar. Staff: agenda y resúmenes. Doctor: preparación de cita.
Si hay acción, termina con JSON en una línea:
{"intent":"confirmar_cita","cita_id":"...","nota":"..."}
{"intent":"cancelar_cita","cita_id":"...","motivo":"..."}
{"intent":"reagendar_cita","cita_id":"...","fecha_preferida":"YYYY-MM-DD","franja":"mañana|tarde|indistinto"}
{"intent":"hablar_humano","motivo":"..."}
{"intent":"ninguna"}`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function extractIntent(text: string) {
  const match = text.match(/\{[\s]*"intent"\s*:\s*"[^"]+"[^}]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function stripIntentLine(text: string) {
  return text.replace(/\{[\s]*"intent"\s*:\s*"[^"]+"[^}]*\}/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "Método no permitido" });

  const xaiKey = Deno.env.get("XAI_API_KEY");
  if (!xaiKey) return json(500, { ok: false, error: "XAI_API_KEY no configurada" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const authHeader = req.headers.get("Authorization") || "";
  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json(401, { ok: false, error: "No autenticado" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "JSON inválido" }); }

  const message = String(body.message || "").trim();
  if (!message) return json(400, { ok: false, error: "message es obligatorio" });

  const contextBlock = [
    "CONTEXTO:",
    "Rol: " + (body.rol || "desconocido"),
    "Canal: " + (body.canal || "panel"),
    "Datos: " + JSON.stringify(body.contexto || {}),
  ].join("\n");

  const apiUrl = Deno.env.get("XAI_API_URL") || "https://api.x.ai/v1/chat/completions";
  const model = Deno.env.get("XAI_MODEL") || "grok-2";

  const xaiRes = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + xaiKey },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: contextBlock },
        { role: "user", content: message },
      ],
    }),
  });

  const xaiJson = await xaiRes.json().catch(() => ({}));
  if (!xaiRes.ok) return json(502, { ok: false, error: "Error de xAI", detail: xaiJson });

  const raw = xaiJson?.choices?.[0]?.message?.content || "";
  const intent = extractIntent(raw);
  const reply = stripIntentLine(raw) || "No pude generar una respuesta.";

  return json(200, { ok: true, reply, intent, model, usage: xaiJson?.usage || null });
});
