# Modulo financiero profesional

Archivo: `modulo-financiero.html`

## KPIs
- Cobrado en el periodo (dia / semana / mes)
- Total que deben los pacientes (saldo)
- Saldo vencido (+30 dias)
- Facturado / cargos del periodo
- % cobrado vs facturado

## Vistas
- **Dia / Semana / Mes** — selector de periodo
- Antiguedad de cartera: 0–7, 8–30, 31–60, +60 dias
- Pacientes que deben (busqueda + filtro riesgo)
- Solo vencidos
- Movimientos del periodo (cargos y cobros)
- Top deudores
- Export CSV

## Integracion DentFlow
Lee `parent.pagosData` / `cargoPagado` / `cargoSaldo` / `openAbonoModal`.
Si no hay parent, usa datos demo.

En sidebar Contabilidad: enlace o iframe a `modulo-financiero.html`.
