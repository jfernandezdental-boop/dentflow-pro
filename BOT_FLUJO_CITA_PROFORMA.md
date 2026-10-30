# Bot IA — Flujo: confirmar → agenda/proforma

El bot **no improvisa**: confirma lo pedido, revisa agenda y luego actúa.

## Ciclo

1. Paciente escribe (cita o proforma)
2. Bot **confirma** lo entendido
3. **Cita:** `rpc_disponibilidad_doctor` → si libre `rpc_crear_cita` / si no, propone huecos
4. **Proforma:** `rpc_crear_proforma` → `enviar-proforma` (email SendGrid + WhatsApp)
5. **Reagenda:** solo con `consultorio_id` del paciente (multi-tenant)

## SQL
1. `rls_tenant_aislamiento.sql`
2. `rls_bot_agenda_proforma.sql`

## Functions
```bash
supabase functions deploy whatsapp-grok-webhook --no-verify-jwt
supabase functions deploy enviar-proforma
```

Secrets: XAI_API_KEY, SENDGRID_*, WhatsApp Meta/Twilio, DEFAULT_CONSULTORIO_ID
