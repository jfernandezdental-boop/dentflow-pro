# Proforma / Presupuesto → Contabilidad

## Que pide el paciente
"Cuanto me va a salir el tratamiento?"

El doctor emite una **proforma (presupuesto)**.

| Documento | Para el paciente | Contabilidad |
|-----------|------------------|--------------|
| **Proforma** | Cotizacion del tratamiento | No genera deuda firme |
| **Factura** (desde proforma) | Documento de cobro | Si → cargo cuentas por cobrar |
| **Abono** | Pago | Reduce saldo; ingreso del periodo |

## Flujo
1. Doctor arma proforma (paciente, items, plantilla IVA)
2. Enviar al paciente (WhatsApp/email)
3. **Facturar y cobrar** → crea CARGO
4. Aparece en modulo financiero (deuda, vencidos, cobrado dia/semana/mes)

## Parametros de plantilla
- razonSocial, ruc, IVA %, titulos, validezDias, series PRO/FAC, texto pie, moneda

Archivos: `flujo_proforma_contabilidad.js`, `sql_proforma_cargo.sql`

La proforma **no** infla la cartera; solo la factura/cargo.
