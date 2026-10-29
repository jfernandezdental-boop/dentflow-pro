# Módulo IA Grok — DentFlow Pro

## Archivos
| Archivo | Uso |
|---------|-----|
| grok_system_prompt.md | Prompt de sistema |
| supabase/functions/grok-assistant/index.ts | Edge Function panel |
| dentflow-grok-api.js | Cliente JS |
| modulo_asistente_ia.js | Chat UI helper |
| ui_asistente_ia_snippet.html | Snippet UI |

## Deploy
```bash
supabase functions deploy grok-assistant
supabase secrets set XAI_API_KEY=xai-...
```

API key solo en secrets. Frontend mode: edge.
