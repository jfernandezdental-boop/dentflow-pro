# Proformas por Email + WhatsApp

Function: `enviar-proforma`
Canales: email (SendGrid) + whatsapp (Meta/Twilio)
Requiere pacientes.email y pacientes.telefono + presupuestos.consultorio_id

```bash
supabase secrets set SENDGRID_API_KEY=SG...
supabase secrets set SENDGRID_FROM_EMAIL=noreply@clinica.com
supabase functions deploy enviar-proforma
```
