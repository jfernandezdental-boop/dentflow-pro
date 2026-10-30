/** DentFlow · Proforma → Factura → Contabilidad */
(function (global) {
  function defaultTemplate(c) {
    c = c || {};
    return {
      razonSocial: c.nombre || 'Clinica Dental',
      ruc: c.ruc || '',
      ivaActivo: true,
      iva: 15,
      tituloProforma: 'PROFORMA / PRESUPUESTO',
      tituloFactura: 'FACTURA',
      validezDias: 30,
      moneda: 'USD',
      serieProforma: 'PRO',
      serieFactura: 'FAC',
      textoPie: 'La proforma no constituye factura fiscal hasta su emision formal.'
    };
  }
  function calcTotales(items, discountPct, template) {
    const t = template || defaultTemplate();
    const disc = Number(discountPct) || 0;
    const itemNet = (it) => {
      const p = Number(it.price || it.precio || 0);
      const d = Number(it.discount || 0);
      return p * (1 - d / 100);
    };
    const subtotal = (items || []).reduce((s, i) => s + Number(i.price || i.precio || 0), 0);
    const neto = (items || []).reduce((s, i) => s + itemNet(i), 0);
    const base = neto * (1 - disc / 100);
    const ivaPct = t.ivaActivo ? Number(t.iva) || 0 : 0;
    const ivaMonto = base * (ivaPct / 100);
    return { subtotal, base, ivaPct, ivaMonto, total: base + ivaMonto };
  }
  function buildProformaPayload(opts) {
    const template = Object.assign(defaultTemplate(opts.consultorio), opts.template || {});
    const totals = calcTotales(opts.items || [], opts.discountPct, template);
    return Object.assign({
      tipo: 'proforma',
      estado: opts.estado || 'borrador',
      consultorio_id: opts.consultorio_id || null,
      paciente_id: opts.paciente_id || null,
      paciente_nombre: opts.paciente_nombre || '',
      items: opts.items || [],
      contabilidad: { genera_cargo: false, cargo_id: null }
    }, totals, { template: template });
  }
  function buildFacturaFromProforma(proforma, opts) {
    const pr = proforma || {};
    const template = Object.assign(defaultTemplate(opts && opts.consultorio), pr.template || {});
    const totals = calcTotales(pr.items || [], pr.discountPct, template);
    const cargoId = (opts && opts.cargo_id) || 'cg_' + Math.random().toString(36).slice(2, 10);
    const cargo = {
      id: cargoId,
      proforma_id: pr.id || null,
      consultorio_id: pr.consultorio_id,
      paciente_id: pr.paciente_id,
      patient: pr.paciente_nombre,
      proc: (pr.items || []).map(function (i) { return i.name || i.nombre; }).filter(Boolean).join(', ').slice(0, 120) || 'Tratamiento dental',
      total: totals.total,
      pagado: 0,
      pagos: [],
      fecha: new Date().toISOString().slice(0, 10),
      estado: 'pendiente',
      origen: 'factura_desde_proforma'
    };
    return {
      factura: Object.assign({ tipo: 'factura', estado: 'facturado', proforma_id: pr.id }, totals),
      cargo: cargo,
      proformaEstado: 'facturado'
    };
  }
  global.DentflowProforma = {
    defaultTemplate: defaultTemplate,
    calcTotales: calcTotales,
    buildProformaPayload: buildProformaPayload,
    buildFacturaFromProforma: buildFacturaFromProforma
  };
})(typeof window !== 'undefined' ? window : globalThis);
