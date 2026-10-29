# DentFlow Pro

Sistema odontológico integral multi-tenant: citas, historial clínico, odontograma, presupuestos/facturación, RRHH, contabilidad, imágenes, bot WhatsApp + **Grok (xAI)**.

## Para Claude / desarrolladores

Lee **[CLAUDE_INSTRUCTIONS.md](./CLAUDE_INSTRUCTIONS.md)** primero.

## Stack
- Frontend: `index.html` (app completa)
- Deploy: Vercel (`vercel.json`)
- Backend: Supabase (Auth, Postgres RLS, Storage, Edge Functions)
- IA: xAI Grok API
- Mensajería: WhatsApp (Meta Cloud API o Twilio) + Email (SendGrid)

## Edge Functions
| Function | Uso |
|----------|-----|
| `grok-assistant` | Asistente IA panel (staff) |
| `whatsapp-grok-webhook` | WhatsApp → Grok → confirmar/reagendar citas y presupuestos |

## Secrets (no commitear)
```
XAI_API_KEY
META_WA_TOKEN / META_WA_PHONE_NUMBER_ID / META_WA_VERIFY_TOKEN
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM
SUPABASE_SERVICE_ROLE_KEY
```

## SQL
- `supabase_migration.sql` — roles JWT + RLS imágenes
- `rls_roles_jwt.sql`, `rls_imagenes_clinicas.sql`

## Deploy rápido
```bash
# Supabase
supabase functions deploy grok-assistant
supabase functions deploy whatsapp-grok-webhook --no-verify-jwt
# Vercel
npx vercel --prod
```

Repo: https://github.com/jfernandezdental-boop/dentflow-pro
