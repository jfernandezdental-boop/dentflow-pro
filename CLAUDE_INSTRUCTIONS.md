# Instrucciones para Claude — DentFlow Pro

## Objetivo
Analizar, mejorar y desplegar este repositorio a:
- **Supabase** (SQL + Edge Functions + secrets)
- **Vercel** (frontend estático `index.html`)

## Estructura
```
index.html / dentflow-pro.html   → App principal (frontend)
vercel.json                     → Deploy estático Vercel
deploy.sh                       → Script de deploy
supabase_migration.sql          → RLS roles JWT + imágenes
rls_roles_jwt.sql
rls_imagenes_clinicas.sql
supabase/functions/grok-assistant/          → IA panel (Grok)
supabase/functions/whatsapp-grok-webhook/   → WhatsApp → Grok → citas/presupuestos
dentflow-grok-api.js            → Cliente JS Grok
WHATSAPP_GROK_CITAS_PRESUPUESTO.md
IA_GROK_DENTFLOW.md
grok_system_prompt.md
```

## Mejoras prioritarias pedidas por el dueño
1. Datos **reales** (Supabase), no solo localStorage demo
2. WhatsApp + Grok: confirmar / reagendar citas + presupuestos
3. Email (SendGrid) para recetas / reportes al doctor
4. Multi-tenant con RLS y JWT claims
5. Sin API keys en el frontend (solo secrets)

## Deploy Supabase
```bash
supabase db execute -f supabase_migration.sql   # o SQL Editor
supabase functions deploy grok-assistant
supabase functions deploy whatsapp-grok-webhook --no-verify-jwt
supabase secrets set XAI_API_KEY=xai-...
supabase secrets set WHATSAPP_PROVIDER=meta   # o twilio
# + META_* o TWILIO_* y SUPABASE_SERVICE_ROLE_KEY
```

## Deploy Vercel
- Root: index.html + vercel.json
- `npx vercel --prod` o conectar el repo en Vercel Dashboard

## Seguridad
- Nunca commitear XAI_API_KEY, Twilio, Meta tokens
- Service role solo en Edge Functions
