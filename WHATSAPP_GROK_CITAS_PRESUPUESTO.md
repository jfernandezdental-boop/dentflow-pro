# WhatsApp + Grok — Citas y presupuestos (DentFlow)

Objetivo: que el **paciente escriba por WhatsApp** y **Grok** ayude a:

- confirmar / cancelar / **cambiar fecha** de cita (según disponibilidad del contexto)
- consultar o **enviar resumen de presupuesto / proforma** cuando lo pida

Esto **no es un API key de WhatsApp único** como el de Grok. WhatsApp usa **tokens de Meta o de Twilio**. Grok usa **XAI_API_KEY**.

## Arquitectura

```
Paciente (WhatsApp)
    → Meta Cloud API  o  Twilio
    → Edge Function: whatsapp-grok-webhook
         1) Busca paciente por teléfono (Supabase)
         2) Carga citas próximas + presupuestos
         3) Llama a Grok (XAI_API_KEY)
         4) Ejecuta intent (confirmar / reagendar / presupuesto)
         5) Responde por WhatsApp
```

Webhook: `https://<TU_PROJECT>.supabase.co/functions/v1/whatsapp-grok-webhook`

## Grok API key
1. https://console.x.ai → API Keys → crear (`xai-...`)
2. `supabase secrets set XAI_API_KEY=xai-tu-clave`

## WhatsApp
### Meta: https://developers.facebook.com/
### Twilio: https://console.twilio.com/

Ver archivo completo en historial del proyecto y function `supabase/functions/whatsapp-grok-webhook/index.ts`.

## Deploy
```bash
supabase functions deploy whatsapp-grok-webhook --no-verify-jwt
supabase secrets set WHATSAPP_PROVIDER=meta
# META_WA_TOKEN, META_WA_PHONE_NUMBER_ID, META_WA_VERIFY_TOKEN
# o TWILIO_*
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```
