/**
 * DentFlow Pro — Cliente Grok (xAI)
 * <script src="dentflow-grok-api.js"></script>
 * window.DENTFLOW_GROK_CONFIG = { mode: 'edge', edgeFunction: 'grok-assistant' };
 */
(function (global) {
  "use strict";
  const DEFAULTS = { mode: "edge", edgeFunction: "grok-assistant", model: "grok-2" };
  function cfg() { return Object.assign({}, DEFAULTS, global.DENTFLOW_GROK_CONFIG || {}); }
  function getSupa() {
    if (typeof global.getAppSupa === "function") try { return global.getAppSupa(); } catch (_) {}
    return global.appSupa || null;
  }
  function extractIntent(text) {
    const m = String(text || "").match(/\{[\s\n]*"intent"\s*:\s*"[^"]+"[^}]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
  function stripIntent(text) {
    return String(text || "").replace(/\{[\s\n]*"intent"\s*:\s*"[^"]+"[^}]*\}/g, "").trim();
  }
  async function ask(message, opts) {
    opts = opts || {};
    message = String(message || "").trim();
    if (!message) return { reply: "Escribe un mensaje.", intent: { intent: "ninguna" } };
    const c = cfg();
    const supa = getSupa();
    const base = (typeof global.APP_SUPA_CONFIG !== "undefined" && global.APP_SUPA_CONFIG.url) || "";
    if (c.mode === "edge" && base) {
      let token = global.APP_SUPA_CONFIG.anonKey || "";
      if (supa?.auth) {
        const { data } = await supa.auth.getSession();
        if (data?.session?.access_token) token = data.session.access_token;
      }
      const res = await fetch(base.replace(/\/$/, "") + "/functions/v1/" + c.edgeFunction, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: global.APP_SUPA_CONFIG?.anonKey || "",
        },
        body: JSON.stringify({
          message,
          rol: opts.rol || "staff",
          canal: opts.canal || "panel",
          contexto: opts.contexto || {},
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (data.intent?.intent && data.intent.intent !== "ninguna") {
          try { global.dispatchEvent(new CustomEvent("dentflow-ai-intent", { detail: data.intent })); } catch (_) {}
        }
        return { reply: data.reply, intent: data.intent || { intent: "ninguna" }, source: "edge" };
      }
    }
    return {
      reply: "Configura Edge Function grok-assistant y XAI_API_KEY. Mensaje: " + message.slice(0, 80),
      intent: { intent: "ninguna" },
      source: "fallback",
    };
  }
  async function ejecutarIntent(intent) {
    if (!intent || intent.intent === "ninguna") return { ok: true, action: "none" };
    if (typeof global.DENTFLOW_GROK_INTENT_HANDLER === "function") {
      return global.DENTFLOW_GROK_INTENT_HANDLER(intent);
    }
    return { ok: true, action: intent.intent, intent };
  }
  global.DentflowGrok = { ask, ejecutarIntent, extractIntent, stripIntent, version: "1.0.1" };
  global.dentflowAI = { ask, applyIntent: ejecutarIntent };
})(typeof window !== "undefined" ? window : globalThis);
