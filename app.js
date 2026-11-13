/* ===== Tira & Miga — página de pedidos ===== */
(() => {
  'use strict';
  const C = window.TM_CONFIG || {}, K = window.TM_CATALOGO || { productos: {}, secciones: {}, menuRespaldo: [] };
  const $ = s => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const money = v => '$' + Math.round(Number(v) || 0).toLocaleString('es-MX');
  const MAXQ = 99;
  const ORDEN_SEC = ['Rellenas', 'Tradicionales', 'Especiales'];

  // ---------- Estado ----------
  let menu = [];               // [{ id, nombre, precio, seccion, orden, agotado, desc, foto }]
  let pausa = false, avisoPausa = '', conEnvio = true, menuEnVivo = false, datosPago = C.datosPago || '';
  const cart = new Map();      // id -> cantidad
  const leerCarrito = () => { try { const o = JSON.parse(localStorage.getItem('tm-carrito') || '{}'); for (const [k, v] of Object.entries(o)) if (v > 0) cart.set(k, Math.min(MAXQ, v | 0)); } catch (e) {} };
  const guardarCarrito = () => { try { localStorage.setItem('tm-carrito', JSON.stringify(Object.fromEntries(cart))); } catch (e) {} };
  const leerCliente = () => { try { return JSON.parse(localStorage.getItem('tm-cliente') || '{}'); } catch (e) { return {}; } };
  const guardarCliente = d => { try { localStorage.setItem('tm-cliente', JSON.stringify({ nombre: d.nombre, tel: d.tel, direccion: d.direccion })); } catch (e) {} };

  const prod = id => menu.find(p => p.id === id);
  const foto = p => (K.productos[p.id] && K.productos[p.id].foto) || K.fotoGeneral;
  const desc = p => p.desc || (K.productos[p.id] && K.productos[p.id].desc) || '';

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('ver'), 2600);
  }

  // ---------- Horario (lo publica la app; si no, el de config.js) ----------
  const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const hora12 = min => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
  const hCorta = min => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`; };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const minAhora = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const horarioDeConfig = () => ({
    dias: [0, 1, 2, 3, 4, 5, 6].map(i => ({ a: !(C.diasCerrado || []).includes(i), abre: C.abre || '17:00', cierra: C.cierra || '22:00' })),
    ultimoMin: Math.max(0, hm(C.cierra || '22:00') - hm(C.ultimoPedidoHoy || '21:00')), prepMin: C.minutosPreparacion || 45
  });
  let H = horarioDeConfig();
  const dia = d => H.dias[d.getDay()] || { a: false };
  const abiertoDia = d => !!dia(d).a;
  const abreDe = d => hm(dia(d).abre), cierraDe = d => hm(dia(d).cierra);

  function horasDe(fecha) {
    const [y, mo, da] = fecha.split('-').map(Number), d = new Date(y, mo - 1, da);
    if (!abiertoDia(d)) return [];
    const out = [], ini = abreDe(d), fin = cierraDe(d) - 30;
    let desde = ini;
    if (fecha === ymd(new Date())) desde = Math.max(ini, Math.ceil((minAhora() + (H.prepMin || 45)) / 30) * 30);
    for (let m = desde; m <= fin; m += 30) out.push(m);
    return out;
  }
  function fechasDisponibles() {
    const out = [], hoy = new Date();
    for (let i = 0; i <= (C.diasAdelante || 14); i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
      if (!abiertoDia(d)) continue;
      const f = ymd(d);
      if (i === 0 && (minAhora() > cierraDe(d) - (H.ultimoMin ?? 60) || !horasDe(f).length)) continue;
      const etiqueta = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : DIAS[d.getDay()][0].toUpperCase() + DIAS[d.getDay()].slice(1);
      out.push({ f, txt: `${etiqueta} · ${d.getDate()} ${MESES[d.getMonth()]}` });
    }
    return out;
  }
  // Resumen tipo "Mié a lun · 5 – 10 pm" y "Martes cerrado" (semana de lunes a domingo, agrupando días seguidos iguales)
  function resumenHorario() {
    const orden = [1, 2, 3, 4, 5, 6, 0], clave = i => H.dias[i].a ? H.dias[i].abre + '-' + H.dias[i].cierra : 'x';
    if (orden.every(i => clave(i) === clave(orden[0]))) return H.dias[1].a ? [{ dias: 'Todos los días', i: 1 }] : [{ dias: 'Cerrado', i: 1, cerrado: true }];
    let ini = orden.findIndex((i, k) => clave(i) !== clave(orden[(k + 6) % 7]));
    const grupos = [];
    for (let k = 0; k < 7; k++) { const i = orden[(ini + k) % 7], g = grupos[grupos.length - 1]; if (g && g.k === clave(i)) g.l.push(i); else grupos.push({ k: clave(i), l: [i] }); }
    return grupos.map(g => ({ dias: g.l.length === 1 ? DIAS[g.l[0]] : g.l.length === 2 ? `${DIAS_C[g.l[0]]} y ${DIAS_C[g.l[1]].toLowerCase()}` : `${DIAS_C[g.l[0]]} a ${DIAS_C[g.l[g.l.length - 1]].toLowerCase()}`, i: g.l[0], cerrado: g.k === 'x' }))
      .sort((a, b) => a.cerrado - b.cerrado);
  }
  const rango = i => { const a = hm(H.dias[i].abre), c = hm(H.dias[i].cierra), mismo = (a < 720) === (c % 1440 < 720); return mismo ? `${hCorta(a)} – ${hora12(c)}` : `${hora12(a)} – ${hora12(c)}`; };
  const may = t => t[0].toUpperCase() + t.slice(1);
  function pintarHorario() {
    const R = resumenHorario();
    const abiertos = R.filter(g => !g.cerrado), cerrados = R.filter(g => g.cerrado);
    const lineaCorta = abiertos.map(g => `${may(g.dias)} ${rango(g.i)}`).join(' · ') + (cerrados.length ? ` · ${may(cerrados.map(g => g.dias.toLowerCase()).join(' y '))} cerrado` : '');
    $('#hb-horas').textContent = lineaCorta;
    const box = $('#horario-dias'); box.replaceChildren();
    abiertos.forEach(g => { const p = el('p'); p.append(may(g.dias), el('br'), el('b', null, rango(g.i))); box.append(p); });
    cerrados.forEach(g => box.append(el('p', 'muted', `${may(g.dias)} cerrado`)));
  }
  function pintarEstadoHoy() {
    const e = $('#hb-estado'), bx = $('#horario-badge'), d = new Date(), m = minAhora();
    bx.classList.remove('abierto', 'pausa');
    if (pausa) { bx.classList.add('pausa'); e.textContent = 'Pedidos en línea en pausa'; return; }
    if (abiertoDia(d) && m >= abreDe(d) && m < cierraDe(d)) { bx.classList.add('abierto'); e.textContent = `Abierto ahora · hasta las ${hora12(cierraDe(d))}`; return; }
    if (abiertoDia(d) && m < abreDe(d)) { e.textContent = `Hoy abrimos a las ${hora12(abreDe(d))}`; return; }
    let k = 1; while (k < 8 && !abiertoDia(new Date(d.getFullYear(), d.getMonth(), d.getDate() + k))) k++;
    if (k >= 8) { e.textContent = 'Cerrado por ahora'; return; }
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
    e.textContent = `Cerrado · abrimos ${k === 1 ? 'mañana' : 'el ' + DIAS[dd.getDay()]} a las ${hora12(abreDe(dd))}`;
  }
  function usarHorario(h) {
    if (!h || !Array.isArray(h.dias) || h.dias.length !== 7) return;
    H = { dias: h.dias.map(x => ({ a: !!x.a, abre: /^\d{2}:\d{2}$/.test(x.abre) ? x.abre : '17:00', cierra: /^\d{2}:\d{2}$/.test(x.cierra) ? x.cierra : '22:00' })), ultimoMin: Number(h.ultimoMin ?? 60), prepMin: Number(h.prepMin ?? 45) };
  }

  // ---------- Menú ----------
  function normalizar(lista) {
    return lista.map((p, i) => ({
      id: String(p.id), nombre: String(p.nombre || ''), precio: Number(p.precio) || 0,
      seccion: p.seccion || 'Rellenas', orden: Number(p.orden ?? i) || 0, agotado: !!p.agotado, desc: p.desc || ''
    })).filter(p => p.id && p.nombre && p.precio > 0);
  }
  function pintarMenu() {
    const cont = $('#menu-secciones'); cont.replaceChildren();
    const grupos = new Map();
    for (const p of [...menu].sort((a, b) => a.orden - b.orden)) { if (!grupos.has(p.seccion)) grupos.set(p.seccion, []); grupos.get(p.seccion).push(p); }
    const claves = [...grupos.keys()].sort((a, b) => (ORDEN_SEC.indexOf(a) + 99) % 99 - (ORDEN_SEC.indexOf(b) + 99) % 99 || a.localeCompare(b));
    for (const s of claves) {
      const info = K.secciones[s] || { eyebrow: '', titulo: s, texto: '' };
      const sec = el('section', 'sec'); sec.setAttribute('aria-label', info.titulo);
      const h = el('div', 'sec-head');
      if (info.eyebrow) h.append(el('p', 'eyebrow', info.eyebrow));
      h.append(el('h2', null, info.titulo));
      if (info.texto) h.append(el('p', null, info.texto));
      const g = el('div', 'grid');
      grupos.get(s).forEach(p => g.append(tarjeta(p)));
      sec.append(h, g); cont.append(sec);
    }
    if (!menu.length) cont.append(el('p', 'vacio', 'Estamos actualizando el menú. Escríbenos por WhatsApp para hacer tu pedido.'));
  }
  function tarjeta(p) {
    const c = el('article', 'card' + (p.agotado ? ' agotado' : ''));
    const fi = el('div', 'card-img'), img = el('img');
    img.src = foto(p); img.alt = p.nombre; img.loading = 'lazy'; img.width = 560; img.height = 420;
    fi.append(img); if (p.agotado) fi.append(el('span', 'agotado-tag', 'Agotado hoy'));
    const b = el('div', 'card-body'), top = el('div', 'card-top');
    top.append(el('h3', null, p.nombre), el('span', 'precio', money(p.precio)));
    b.append(top);
    if (desc(p)) b.append(el('p', 'card-desc', desc(p)));
    const acc = el('div', 'card-acc');
    let q = 1;
    const st = el('div', 'stepper'), menos = el('button', null, '−'), out = el('output', null, '1'), mas = el('button', null, '+');
    menos.type = mas.type = 'button'; menos.setAttribute('aria-label', 'Una pieza menos de ' + p.nombre); mas.setAttribute('aria-label', 'Una pieza más de ' + p.nombre);
    const upd = () => { out.textContent = q; menos.disabled = q <= 1 || p.agotado; mas.disabled = q >= MAXQ || p.agotado; };
    menos.onclick = () => { q = Math.max(1, q - 1); upd(); }; mas.onclick = () => { q = Math.min(MAXQ, q + 1); upd(); };
    st.append(menos, out, mas); upd();
    const add = el('button', 'add', p.agotado ? 'Agotado' : 'Añadir');
    add.type = 'button'; add.disabled = p.agotado || pausa;
    let ocupado = false;
    add.onclick = () => {
      if (ocupado || pausa || p.agotado) return; // mientras dice "Añadido" no vuelve a sumar
      ocupado = true;
      const n = Math.min(MAXQ, (cart.get(p.id) || 0) + q); cart.set(p.id, n); guardarCarrito(); pintarCarrito();
      add.textContent = '✓ Añadido'; add.classList.add('ok'); add.setAttribute('aria-disabled', 'true');
      setTimeout(() => { add.textContent = 'Añadir'; add.classList.remove('ok'); add.removeAttribute('aria-disabled'); ocupado = false; }, 1300);
      const b = $('#cart-count'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      toast(`${q} × ${p.nombre} en tu pedido`); q = 1; upd();
    };
    acc.append(st, add); b.append(acc);
    c.append(fi, b);
    return c;
  }
  async function cargarMenu() {
    menu = normalizar(K.menuRespaldo || []); pintarMenu(); pintarCarrito();
    if (!C.api) return;
    try {
      const r = await fetch(C.api + '?accion=menu', { cache: 'no-store' });
      const d = await r.json();
      if (!d.ok) return;
      pausa = !!d.pausa; avisoPausa = d.avisoPausa || ''; conEnvio = d.envio !== false;
      if (!d.sinMenu && Array.isArray(d.productos) && d.productos.length) { menu = normalizar(d.productos); menuEnVivo = true; }
      const av = $('#aviso-pausa'); av.hidden = !pausa; av.textContent = avisoPausa || 'Por ahora no estamos recibiendo pedidos en línea. Escríbenos por WhatsApp.';
      $('#op-domicilio').hidden = !conEnvio;
      usarHorario(d.horario); pintarHorario(); if (d.datosPago) datosPago = d.datosPago;
      pintarMenu(); pintarCarrito(); pintarEstadoHoy(); if (drawer.open) llenarFechas();
    } catch (e) { /* sin conexión al buzón: se queda el menú de respaldo */ }
  }

  // ---------- Carrito ----------
  const totales = () => { let pz = 0, t = 0; for (const [id, q] of cart) { const p = prod(id); if (!p) continue; pz += q; t += q * p.precio; } return { pz, t }; };
  function pintarCarrito() {
    for (const id of [...cart.keys()]) if (!prod(id)) cart.delete(id);
    const ul = $('#cart-items'); ul.replaceChildren();
    for (const [id, q] of cart) {
      const p = prod(id), li = el('li', 'ci' + (p.agotado ? ' agot' : ''));
      const img = el('img'); img.src = foto(p); img.alt = '';
      const mid = el('div'); mid.append(el('div', 'ci-n', p.nombre), el('div', 'ci-p', `${money(p.precio)} c/u`));
      const st = el('div', 'stepper'), a = el('button', null, '−'), inp = el('input'), b = el('button', null, '+');
      a.type = b.type = 'button'; a.setAttribute('aria-label', 'Menos ' + p.nombre); b.setAttribute('aria-label', 'Más ' + p.nombre);
      Object.assign(inp, { type: 'number', min: 1, max: MAXQ, value: q, inputMode: 'numeric' }); inp.setAttribute('aria-label', 'Cantidad de ' + p.nombre);
      a.disabled = q <= 1; b.disabled = q >= MAXQ;
      a.onclick = () => { cart.set(id, Math.max(1, q - 1)); guardarCarrito(); pintarCarrito(); };
      b.onclick = () => { cart.set(id, Math.min(MAXQ, q + 1)); guardarCarrito(); pintarCarrito(); };
      inp.onchange = () => { const v = Math.floor(Number(inp.value)); if (v >= 1 && v <= MAXQ) cart.set(id, v); guardarCarrito(); pintarCarrito(); };
      st.append(a, inp, b);
      const r = el('div', 'ci-r'), del = el('button', 'ci-del', 'Quitar'); del.type = 'button';
      del.onclick = () => { cart.delete(id); guardarCarrito(); pintarCarrito(); };
      r.append(el('strong', null, money(q * p.precio)), st, del);
      li.append(img, mid, r); ul.append(li);
    }
    const { pz, t } = totales();
    $('#cart-count').textContent = pz;
    $('#cart-open').setAttribute('aria-label', `Ver tu pedido, ${pz} ${pz === 1 ? 'pieza' : 'piezas'}`);
    $('#drawer-count').textContent = `${pz} ${pz === 1 ? 'pieza' : 'piezas'}`;
    $('#cart-total').textContent = money(t);
    $('#cart-empty').hidden = cart.size > 0;
    $('#form-pedido').hidden = cart.size === 0;
  }

  // ---------- Panel ----------
  const drawer = $('#drawer');
  function abrir() {
    llenarFechas(); if (!drawer.open) drawer.showModal();
  }
  function cerrar() {
    if (!drawer.open) return;
    drawer.classList.add('sale');
    setTimeout(() => { drawer.close(); drawer.classList.remove('sale'); }, 190);
  }
  $('#cart-open').onclick = abrir;
  $('#drawer-close').onclick = cerrar;
  drawer.addEventListener('cancel', e => { e.preventDefault(); cerrar(); });
  drawer.addEventListener('click', e => { if (e.target === drawer) cerrar(); if (e.target.closest('[data-cerrar]')) { e.preventDefault(); cerrar(); if (e.target.matches('a')) location.hash = '#menu'; } });

  // ---------- Formulario ----------
  const form = $('#form-pedido');
  function llenarFechas() {
    const sel = $('#sel-fecha'), prev = sel.value; sel.replaceChildren();
    for (const o of fechasDisponibles()) { const op = el('option', null, o.txt); op.value = o.f; sel.append(op); }
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
    llenarHoras();
  }
  function llenarHoras() {
    const sel = $('#sel-hora'), prev = sel.value; sel.replaceChildren();
    for (const m of horasDe($('#sel-fecha').value)) { const v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; const op = el('option', null, hora12(m)); op.value = v; sel.append(op); }
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
  $('#sel-fecha').onchange = llenarHoras;
  form.addEventListener('change', e => {
    if (e.target.name === 'entregaTipo') { const dom = form.entregaTipo.value === 'domicilio'; $('#campo-dir').hidden = !dom; }
  });
  const listoParaPedir = () => form.nombre.value.trim().length > 0 && form.tel.value.replace(/\D/g, '').length === 10;
  function revisarBoton() { const ok = listoParaPedir(); $('#btn-enviar').disabled = !ok; $('#falta-datos').hidden = ok; }
  form.addEventListener('input', e => { if (e.target.name === 'nombre' || e.target.name === 'tel') revisarBoton(); });
  (() => { const c = leerCliente(); if (c.nombre) form.nombre.value = c.nombre; if (c.tel) form.tel.value = c.tel; if (c.direccion) form.direccion.value = c.direccion; revisarBoton(); })();

  const fmtTel = t => t.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  function datosForm() {
    const f = form;
    return {
      nombre: f.nombre.value.replace(/\s+/g, ' ').trim(), tel: f.tel.value.replace(/\D/g, '').slice(-10),
      entregaTipo: f.entregaTipo.value, direccion: f.direccion.value.replace(/\s+/g, ' ').trim(),
      fecha: f.fecha.value, hora: f.hora.value, pago: f.pago.value, notas: f.notas.value.replace(/\s+/g, ' ').trim(), web: f.web.value,
      items: [...cart].map(([id, cant]) => ({ id, cant, nombre: prod(id).nombre, precio: prod(id).precio }))
    };
  }
  function validar(d) {
    form.querySelectorAll('.bad').forEach(x => x.classList.remove('bad'));
    const mal = (campo, msg) => { if (campo) { campo.classList.add('bad'); campo.focus(); } return msg; };
    if (!d.items.length) return 'Tu pedido está vacío.';
    const ag = d.items.find(i => prod(i.id).agotado); if (ag) return `${ag.nombre} se agotó por hoy. Quítalo de tu pedido, por favor.`;
    if (!d.nombre) return mal(form.nombre, 'Escribe tu nombre.');
    if (d.tel.length !== 10) return mal(form.tel, 'Escribe tu número de WhatsApp a 10 dígitos.');
    if (d.entregaTipo === 'domicilio' && d.direccion.length < 8) return mal(form.direccion, 'Escribe la dirección de entrega.');
    if (!d.fecha) return mal(form.fecha, 'Elige el día.');
    if (!d.hora) return mal(form.hora, 'Elige la hora.');
    return '';
  }
  function fechaTexto(f) { const [y, m, d] = f.split('-').map(Number), dt = new Date(y, m - 1, d); return `${DIAS[dt.getDay()]} ${d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m - 1]}`; }
  function mensajeWA(d, folio) {
    const lineas = d.items.map(i => `• ${i.cant} × ${i.nombre} — ${money(i.cant * i.precio)}`);
    const tot = d.items.reduce((a, i) => a + i.cant * i.precio, 0);
    return [
      `Hola, Tira & Miga 👋 Soy ${d.nombre}.`, folio ? `Hice el pedido *${folio}* en su página:` : 'Quiero hacer este pedido:', '',
      ...lineas, '', `*Total de productos: ${money(tot)}*`,
      d.entregaTipo === 'domicilio' ? `🛵 A domicilio *[Cotizando]*‼️: ${d.direccion}` : '🏠 Paso a recoger',
      `📅 ${fechaTexto(d.fecha)}, ${hora12(hm(d.hora))}`, `💳 Pago: ${d.pago}`,
      d.notas ? `📝 ${d.notas}` : '', '', '¿Me confirman, por favor?',
      ...(d.pago === 'Transferencia' && datosPago.trim() ? ['', '━━━━━━━━━━━━', '💳 *Datos para transferencia*', datosPago.trim(), '',
        d.entregaTipo === 'domicilio' ? '⚠️ *Realiza tu transferencia hasta que te confirmemos el costo del envío y el total.*' : '⚠️ *Realiza tu transferencia hasta que te confirmemos tu pedido.*'] : [])
    ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  }
  const linkWA = txt => `https://wa.me/${C.whatsapp || '523341016194'}?text=${encodeURIComponent(txt)}`;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#form-error'), btn = $('#btn-enviar'); err.hidden = true;
    if (pausa) { err.textContent = avisoPausa || 'Por ahora no estamos recibiendo pedidos en línea. Escríbenos por WhatsApp.'; err.hidden = false; return; }
    const d = datosForm(), m = validar(d);
    if (m) { err.textContent = m; err.hidden = false; return; }
    guardarCliente(d);
    btn.disabled = true; btn.classList.add('enviando'); $('#btn-enviar-t').textContent = 'Enviando…';
    let folio = '', registrado = false;
    if (C.api && !d.web) {
      try {
        const r = await fetch(C.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion: 'pedido', pedido: d }) });
        const res = await r.json();
        if (!res.ok) { err.textContent = res.error || 'No se pudo enviar tu pedido. Inténtalo de nuevo.'; err.hidden = false; btn.classList.remove('enviando'); $('#btn-enviar-t').textContent = 'Realiza tu pedido'; revisarBoton(); if (/disponible|agot/i.test(res.error || '')) cargarMenu(); return; }
        folio = res.folio; registrado = true;
      } catch (x) { registrado = false; }
    }
    const link = linkWA(mensajeWA(d, folio));
    cart.clear(); guardarCarrito(); pintarCarrito(); form.notas.value = '';
    btn.classList.remove('enviando'); $('#btn-enviar-t').textContent = 'Realiza tu pedido'; revisarBoton();
    cerrar();
    toast(folio ? `¡Pedido ${folio} recibido! Abriendo WhatsApp…` : 'Abriendo WhatsApp…');
    setTimeout(() => { location.href = link; }, 400);
  });

  // ---------- Inicio ----------
  $('#wa-contacto').href = linkWA('Hola, Tira & Miga. Me gustaría hacer un pedido de conchas. ¿Qué sabores tienen disponibles?');
  leerCarrito(); pintarHorario(); pintarEstadoHoy(); cargarMenu();
  setInterval(pintarEstadoHoy, 60000);
})();
