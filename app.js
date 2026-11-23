// Al refrescar, la página siempre abre desde arriba (el navegador ya no regresa a donde se había quedado).
try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
if (location.hash && location.hash !== '#menu') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
window.addEventListener('load', () => { if (!location.hash) window.scrollTo(0, 0); });
/* ===== Tira & Miga — página de pedidos ===== */
(() => {
  'use strict';
  const C = window.TM_CONFIG || {}, K = window.TM_CATALOGO || { productos: {}, secciones: {}, menuRespaldo: [] };
  const $ = s => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const money = v => '$' + Math.round(Number(v) || 0).toLocaleString('es-MX');
  const MAXQ = 99;
  let ORDEN_SEC = ['Rellenas', 'Tradicionales', 'Especiales'];
  let SEC_INFO = {}; // 21/11/2026: secciones que configuras en la app (nombre, orden, frase de arriba y texto)

  // ---------- Estado ----------
  let menu = [];               // [{ id, nombre, precio, seccion, orden, agotado, desc, foto }]
  let pausa = false, avisoPausa = '', conEnvio = true, menuEnVivo = false, datosPago = C.datosPago || '';
  let STK = {}, stockFecha = ''; // stock de HOY que publica la app (piezas por concha base)
  let capDia = 0, capLibre = {}; // capacidad por día para pedidos agendados (0 = sin límite) y piezas que aún caben por día
  let stockModo = 'stock'; // 'capacidad' = hoy aún no hay producción registrada: lo de hoy se vende contra la capacidad, no contra el stock
  const cart = new Map();      // id -> cantidad
  const leerCarrito = () => { try { const o = JSON.parse(localStorage.getItem('tm-carrito') || '{}'); for (const [k, v] of Object.entries(o)) if (v > 0) cart.set(k, Math.min(MAXQ, v | 0)); } catch (e) {} };
  const guardarCarrito = () => { try { localStorage.setItem('tm-carrito', JSON.stringify(Object.fromEntries(cart))); } catch (e) {} };
  // ¿Para cuándo es el pedido? Se elige una sola vez (chip en las pestañas o "Día" en el carrito) y manda en toda la página
  // Al entrar siempre empieza en "Para hoy" (o el primer día disponible): no se recuerda el día de la visita anterior
  let fechaSel = '', horaSel = '', fechaElegida = false; // fechaElegida = el cliente escogió el día (con "Para hoy", Agendar o la casilla Día) try { localStorage.removeItem('tm-fecha'); localStorage.removeItem('tm-hora'); } catch (e) {}
  let tipoEnt = '', horaElegida = false; // tipo de entrega elegido (recoge/domicilio) y si el cliente ya escogió la hora a propósito
  const domAnt = () => Math.max(0, Number(H.domMin ?? C.domicilioAnticipacionMin ?? 0)); // a domicilio: minutos mínimos antes de que empiece el bloque (se configura en la app; 0 = hasta que empiece) // a domicilio, mínimo de anticipación para pedidos de hoy (minutos)
  const fechaPedido = () => { const fs = fechasDisponibles(); if (!fs.length) return ''; if (!fechaElegida || !fs.some(o => o.f === fechaSel)) fechaSel = fs[0].f; return fechaSel; }; // mientras no elija, siempre el primer día disponible (se recalcula al llegar el horario de la app)
  const paraHoy = () => limitaHoy() && fechaPedido() === hoyYmd(); // true = el pedido es para hoy y aplica el stock del día
  const minTxt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; // 630 → "10:30"
  // Hora elegida (valor "HH:MM"); si ya no cabe en el horario del día, la primera disponible
  const horaPedido = () => { const hs = horasDe(fechaPedido() || hoyYmd()).map(minTxt); if (!hs.length) return ''; if (!hs.includes(horaSel)) horaSel = hs[0]; return horaSel; };
  function ponFecha(f, origen, hora) {
    if (!fechasDisponibles().some(o => o.f === f)) return;
    const cambia = f !== fechaSel; fechaSel = f; fechaElegida = true; if (hora) { horaSel = hora; horaElegida = true; } else if (cambia) horaElegida = false;
    if (origen !== 'drawer' && $('#sel-fecha')) { $('#sel-fecha').value = f; bloquearDia(); llenarHoras(); }
    pintarCuando(); if (!cambia) return;
    pintarStockTags(); pintarCarrito(); if (typeof revisarBoton === 'function') revisarBoton();
  }
  const leerCliente = () => { try { return JSON.parse(localStorage.getItem('tm-cliente') || '{}'); } catch (e) { return {}; } };
  const guardarCliente = d => { try { localStorage.setItem('tm-cliente', JSON.stringify({ nombre: d.nombre, tel: d.tel, direccion: d.direccion, dir: d.dir, referencias: d.referencias, entregaTipo: d.entregaTipo, pago: d.pago })); } catch (e) {} };

  // ---------- Métricas: cuántos visitan, agregan, abren el pedido (una vez por visita) ----------
  function evento(t) {
    if (!C.api) return;
    try { if (sessionStorage.getItem('tm-ev-' + t)) return; sessionStorage.setItem('tm-ev-' + t, '1'); } catch (e) {}
    try { fetch(C.api, { method: 'POST', mode: 'no-cors', keepalive: true, body: JSON.stringify({ accion: 'evento', t }) }).catch(() => {}); } catch (e) {}
  }

  const prod = id => menu.find(p => p.id === id);
  // ---------- Sobre pedido (p. ej. miniconchas): no se venden a diario, se piden con anticipación y con un mínimo de piezas ----------
  const SP = Object.assign({ diasAnticipacion: 1, minimo: 6 }, C.sobrePedido || {});
  const minQ = p => p && p.sobre ? Math.max(1, Math.floor(Number(SP.minimo) || 1)) : 1;
  const haySobre = () => [...cart.keys()].some(id => { const p = prod(id); return !!(p && p.sobre); });
  const spDias = () => Math.max(0, Math.floor(Number(SP.diasAnticipacion) || 0));
  const spTxt = () => { const d = spDias(), m = minQ({ sobre: true }); return `Sobre pedido · con ${d === 1 ? '1 día' : d + ' días'} de anticipación${m > 1 ? ', mínimo ' + m + ' piezas' : ''}`; };
  // ---------- Stock de hoy (solo limita pedidos PARA HOY) ----------
  const hoyYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const hoyPorCapacidad = () => stockModo === 'capacidad' && !!stockFecha && stockFecha === hoyYmd();
  const limitaHoy = () => !!stockFecha && stockFecha === hoyYmd() && !hoyPorCapacidad() && Object.keys(STK).length > 0;
  // Pedido para hoy sin stock publicado hoy (la app está cerrada): se acepta, pero se le avisa al cliente que queda por confirmar
  const hoySinStock = () => menuEnVivo && stockFecha !== hoyYmd();
  // Piezas que aún caben en un día AGENDADO (mañana en adelante). Infinity = sin límite
  const textoCap = n => n <= 0 ? 'Para el día seleccionado ya no nos quedan piezas. Elige otro día, por favor.' : `Para el día seleccionado nos ${n === 1 ? 'queda 1 pieza' : 'quedan ' + n + ' piezas'}. Cambia la cantidad o elige otro día.`;
  const libreDia = f => capDia > 0 && (f > hoyYmd() || (f === hoyYmd() && hoyPorCapacidad())) ? (Object.prototype.hasOwnProperty.call(capLibre, f) ? Math.max(0, Number(capLibre[f]) || 0) : capDia) : Infinity;
  // Cuántas piezas de "id" caben hoy, tomando en cuenta lo demás del carrito (sabores que comparten la misma concha base)
  function maxHoy(id, entradas) {
    const p = prod(id); if (!limitaHoy() || !p || !p.usa.length || p.sobre) return Infinity;
    const uso = {}; for (const [k, q] of entradas) { if (k === id) continue; const o = prod(k); if (o) o.usa.forEach(u => { uso[u.id] = (uso[u.id] || 0) + q * u.por; }); }
    let m = Infinity; p.usa.forEach(u => { if (u.id in STK) m = Math.min(m, Math.floor((STK[u.id] - (uso[u.id] || 0)) / u.por + 1e-9)); });
    return Math.max(0, m);
  }
  // Bases que no alcanzan para hoy con lo que hay en el carrito: [{ disp, ids }]
  function conflictosHoy(entradas) {
    if (!limitaHoy()) return [];
    const uso = {}, quien = {};
    for (const [k, q] of entradas) { const o = prod(k); if (!o || o.sobre) continue; o.usa.forEach(u => { if (!(u.id in STK)) return; uso[u.id] = (uso[u.id] || 0) + q * u.por; (quien[u.id] = quien[u.id] || []).push({ id: k, por: u.por }); }); }
    return Object.keys(uso).filter(b => uso[b] > STK[b] + 1e-9).map(b => ({ disp: Math.max(0, Math.floor(STK[b] / Math.min(...quien[b].map(x => x.por)) + 1e-9)), ids: quien[b].map(x => x.id) }));
  }
  const textoConflicto = c => c.ids.length > 1 ? `Entre ${c.ids.map(i => prod(i).nombre).join(' y ')} solo alcanzan ${c.disp} para hoy (salen de la misma concha)`
    : c.disp <= 0 ? `${prod(c.ids[0]).nombre} ya se agotó para hoy` : `Para hoy solo ${c.disp === 1 ? 'queda 1' : 'quedan ' + c.disp} de ${prod(c.ids[0]).nombre}`;
  // Tope de piezas que se pueden agregar ahora (stock de hoy menos lo que ya está en el carrito); si hoy no se limita, MAXQ
  // Tope del día elegido: el que sea menor entre el stock de hoy (por concha base, compartida entre sabores) y la capacidad
  // del día (piezas totales, compartidas entre TODOS los productos). Infinity = sin límite.
  const topeHoy = p => { if (!p || p.agotado) return 0; const r = quedanHoy(p.id); return isFinite(r) ? Math.max(0, Math.min(MAXQ, r)) : MAXQ; };
  const esHoySel = () => (fechaPedido() || hoyYmd()) === hoyYmd();
  const cuandoTxt = () => esHoySel() ? 'hoy' : 'ese día';
  const enLetraT = n => ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'][n] || String(n);
  const quedanStock = id => paraHoy() ? maxHoy(id, [...cart]) - (cart.get(id) || 0) : Infinity; // por stock de hoy
  const capQueda = () => { const f = fechaPedido(), lib = f ? libreDia(f) : Infinity; return isFinite(lib) ? lib - totales().pz : Infinity; }; // por capacidad del día
  const quedanHoy = id => Math.min(quedanStock(id), capQueda()); // cuántas más puede agregar para el día elegido
  const hayLimite = () => paraHoy() || isFinite(capQueda());
  // Fotos: la que publica la app (se guarda en este navegador por versión) > la de catalogo.js > la general
  const fotosApp = {};
  const fotoCache = (id, v) => { try { return localStorage.getItem('tm-foto-' + id + '-' + v) || ''; } catch (e) { return ''; } };
  const foto = p => (p.fotoV && (fotosApp[p.id + p.fotoV] || (fotosApp[p.id + p.fotoV] = fotoCache(p.id, p.fotoV)))) || (K.productos[p.id] && K.productos[p.id].foto) || K.fotoGeneral;
  async function cargarFotos() {
    const faltan = menu.filter(p => p.fotoV && !fotosApp[p.id + p.fotoV] && !fotoCache(p.id, p.fotoV));
    if (!faltan.length || !C.api) return;
    try {
      const d = await (await fetch(C.api + '?accion=fotos&ids=' + encodeURIComponent(faltan.map(p => p.id).join(',')), { cache: 'no-store' })).json();
      if (!d.ok) return;
      for (const [id, f] of Object.entries(d.fotos || {})) { if (!f.data) continue; fotosApp[id + f.v] = f.data;
        try { Object.keys(localStorage).filter(k => k.startsWith('tm-foto-' + id + '-')).forEach(k => localStorage.removeItem(k)); localStorage.setItem('tm-foto-' + id + '-' + f.v, f.data); } catch (e) {} }
      pintarMenu(); pintarCarrito();
    } catch (e) {}
  }
  const desc = p => p.desc || (K.productos[p.id] && K.productos[p.id].desc) || '';

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('ver');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('ver'), 2600);
  }

  // ---------- Horario (lo publica la app; si no, el de config.js) ----------
  const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const bloqueTxt = m => { const a = ap(m), b = ap(m + 60); return `${hNum(m)}${a !== b ? ' ' + a : ''} a ${hNum(m + 60)} ${b}`; }; // "7 a 8 pm"
  const horaTxt = (m, tipo = tipoEnt) => tipo === 'domicilio' ? bloqueTxt(m) : hora12(m);
  const hora12 = min => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
  const hCorta = min => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`; };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const minAhora = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  // Cada día puede tener varios horarios (tramos), p. ej. 9:00–14:00 y 17:00–22:00
  const HHMM = /^\d{2}:\d{2}$/;
  const tramosDe = x => {
    const l = (Array.isArray(x.tramos) && x.tramos.length ? x.tramos : [{ abre: x.abre, cierra: x.cierra }])
      .filter(t => t && HHMM.test(t.abre) && HHMM.test(t.cierra) && hm(t.cierra) > hm(t.abre)).map(t => ({ a: hm(t.abre), c: hm(t.cierra) })).sort((p, q) => p.a - q.a);
    return l.length ? l : [{ a: hm('17:00'), c: hm('22:00') }];
  };
  const horarioDeConfig = () => ({
    dias: [0, 1, 2, 3, 4, 5, 6].map(i => ({ a: !(C.diasCerrado || []).includes(i), t: tramosDe({ abre: C.abre || '17:00', cierra: C.cierra || '22:00' }) })),
    ultimoMin: Math.max(0, hm(C.cierra || '22:00') - hm(C.ultimoPedidoHoy || '21:00')), prepMin: C.minutosPreparacion || 45
  });
  let H = horarioDeConfig();
  const dia = d => H.dias[d.getDay()] || { a: false, t: [] };
  const abiertoDia = d => !!dia(d).a && dia(d).t.length > 0;
  const cierreFinal = d => Math.max(...dia(d).t.map(t => t.c));
  const abiertoEn = (d, m) => abiertoDia(d) && dia(d).t.some(t => m >= t.a && m < t.c);

  function horasDe(fecha, tipo = tipoEnt) {
    const [y, mo, da] = fecha.split('-').map(Number), d = new Date(y, mo - 1, da);
    if (!abiertoDia(d)) return [];
    // A domicilio: bloques de 1 hora en punto (7 a 8 pm, 8 a 9 pm…). Hoy se ofrecen los bloques que aún no empiezan (con la anticipación que pongas en la app).
    // Los bloques arrancan a la hora de apertura que pusiste en la app (abre 5 pm → 5 a 6, 6 a 7…; abre 5:30 → 5:30 a 6:30…).
    // Si el cliente pide ANTES de abrir, el primer bloque del día (el de apertura) sí se ofrece.
    if (tipo === 'domicilio') { const out = [], hoyD = fecha === ymd(new Date()), ahora = minAhora(), ant = domAnt();
      for (const t of dia(d).t) for (let m = t.a; m + 60 <= t.c; m += 60) { if (hoyD && !(m > ahora && m >= ahora + ant)) continue; if (!out.includes(m)) out.push(m); }
      return out.sort((a, b) => a - b); }
    // Otros días: cada 30 min hasta media hora antes de cerrar.
    // Hoy: cada 15 min desde (ahora + preparación) y hasta 15 min antes de cerrar, para que "último pedido" (p. ej. 15 min antes) sí se respete
    const out = [], hoy = fecha === ymd(new Date()), paso = 15, min = Math.ceil((minAhora() + (H.prepMin ?? 45)) / paso) * paso;
    for (const t of dia(d).t) for (let m = hoy ? Math.max(t.a, min) : t.a; m <= t.c - paso; m += paso) if (!out.includes(m)) out.push(m);
    return out;
  }
  function fechasDisponibles(todas) { // todas = sin la regla de "sobre pedido" (para el aviso general de horario)
    const out = [], hoy = new Date(), desde = todas ? 0 : (haySobre() ? spDias() : 0);
    for (let i = desde; i <= (C.diasAdelante || 14) + desde; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
      if (!abiertoDia(d)) continue;
      const f = ymd(d);
      if (i === 0 && (minAhora() > cierreFinal(d) - (H.ultimoMin ?? 60) || !horasDe(f).length)) continue;
      if (!todas && libreDia(f) <= 0) continue; // ese día ya está lleno
      const etiqueta = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : DIAS[d.getDay()][0].toUpperCase() + DIAS[d.getDay()].slice(1);
      out.push({ f, txt: `${etiqueta} · ${d.getDate()} ${MESES[d.getMonth()]}` });
    }
    return out;
  }
  // Resumen corto del horario para el encabezado: "Mar a Dom 9am - 2pm y 5pm - 10pm · Lunes cerrado"
  const hNum = m => { const h = Math.floor(m / 60) % 24, mi = m % 60; return `${((h + 11) % 12) + 1}${mi ? ':' + String(mi).padStart(2, '0') : ''}`; };
  const ap = m => (Math.floor(m / 60) % 24) < 12 ? 'am' : 'pm';
  const tramoTxt = t => `${hNum(t.a)}${ap(t.a)} - ${hNum(t.c)}${ap(t.c)}`; // "9am - 2pm"
  const rango = i => { const l = H.dias[i].t.map(tramoTxt); return l.length > 1 ? l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1] : l[0]; };
  function resumenHorario() {
    const orden = [1, 2, 3, 4, 5, 6, 0], clave = i => abiertoDia({ getDay: () => i }) ? H.dias[i].t.map(t => t.a + '-' + t.c).join(',') : 'x';
    if (orden.every(i => clave(i) === clave(orden[0]))) return clave(1) !== 'x' ? [{ dias: 'Todos los días', i: 1 }] : [{ dias: 'Cerrado', i: 1, cerrado: true }];
    let ini = orden.findIndex((i, k) => clave(i) !== clave(orden[(k + 6) % 7]));
    const grupos = [];
    for (let k = 0; k < 7; k++) { const i = orden[(ini + k) % 7], g = grupos[grupos.length - 1]; if (g && g.k === clave(i)) g.l.push(i); else grupos.push({ k: clave(i), l: [i] }); }
    return grupos.map(g => ({ dias: g.l.length === 1 ? DIAS[g.l[0]] : g.l.length === 2 ? `${DIAS_C[g.l[0]]} y ${DIAS_C[g.l[1]]}` : `${DIAS_C[g.l[0]]} a ${DIAS_C[g.l[g.l.length - 1]]}`, i: g.l[0], cerrado: g.k === 'x' }))
      .sort((a, b) => a.cerrado - b.cerrado || [1, 2, 3, 4, 5, 6, 0].indexOf(a.i) - [1, 2, 3, 4, 5, 6, 0].indexOf(b.i));
  }
  const may = t => t[0].toUpperCase() + t.slice(1);
  // El encabezado solo muestra el resumen del horario (sin "abierto / cerrado" en tiempo real)
  function pintarHorario() {
    const R = resumenHorario();
    const abiertos = R.filter(g => !g.cerrado), cerrados = R.filter(g => g.cerrado);
    document.querySelectorAll('.hb-horas').forEach(n => n.replaceChildren(...abiertos.map(g => el('span', 'hb-g', `${may(g.dias)} ${rango(g.i)}`)),
      ...(cerrados.length ? [el('span', 'hb-g hb-cerr', `${may(cerrados.map(g => g.dias.toLowerCase()).join(' y '))} cerrado`)] : [])));
  }
  function usarHorario(h) {
    if (!h || !Array.isArray(h.dias) || h.dias.length !== 7) return;
    H = { dias: h.dias.map(x => ({ a: !!(x && x.a), t: tramosDe(x || {}) })), ultimoMin: Number(h.ultimoMin ?? 60), prepMin: Number(h.prepMin ?? 45), domMin: h.domMin != null ? Number(h.domMin) : undefined };
  }

  // ---------- Menú ----------
  function normalizar(lista) {
    return lista.map((p, i) => ({
      id: String(p.id), nombre: String(p.nombre || ''), precio: Number(p.precio) || 0,
      seccion: p.seccion || 'Rellenas', categoria: p.categoria || 'Conchas', fotoV: p.fotoV || '', orden: Number(p.orden ?? i) || 0, agotado: !!p.agotado, destacado: !!p.destacado, sobre: !!p.sobrePedido, desc: p.desc || '',
      usa: Array.isArray(p.usa) ? p.usa.filter(u => u && u.id && Number(u.por) > 0).map(u => ({ id: String(u.id), por: Number(u.por) })) : []
    })).filter(p => p.id && p.nombre && p.precio > 0);
  }
  // ---------- Animaciones ----------
  const sinMov = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vistos = new Set(); // lo que ya apareció no se vuelve a animar al refrescar el menú
  const io = !sinMov && 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; e.target.classList.add('visible'); vistos.add(e.target.dataset.rv); io.unobserve(e.target);
  }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }) : null;
  function revelar(nodo, clave, k = 0) {
    nodo.classList.add('rv'); nodo.dataset.rv = clave; nodo.style.setProperty('--d', (k % 3) * 70 + 'ms');
    if (!io || vistos.has(clave)) nodo.classList.add('visible'); else io.observe(nodo);
  }
  // Mini foto que vuela de la tarjeta al carrito
  function volarAlCarrito(img) {
    if (sinMov || !img || !img.animate) return;
    const barra = $('#barra-pedido'), dest = (barra && !barra.hidden && barra.getClientRects().length ? $('#bp-ico') : $('#cart-open')).getBoundingClientRect(), o = img.getBoundingClientRect();
    // En el celular va al botón flotante de abajo (offsetParent no sirve: la barra es position: fixed)
    const f = img.cloneNode(); f.removeAttribute('loading'); f.className = 'vuela';
    const t = Math.min(o.width, o.height, 140);
    Object.assign(f.style, { left: o.left + o.width / 2 - t / 2 + 'px', top: o.top + o.height / 2 - t / 2 + 'px', width: t + 'px', height: t + 'px' });
    document.body.append(f);
    const dx = dest.left + dest.width / 2 - (o.left + o.width / 2), dy = dest.top + dest.height / 2 - (o.top + o.height / 2);
    f.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(.55)`, opacity: 1, offset: 0.55 }, { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: .4 }],
      { duration: 750, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => { f.remove(); for (const id of ['#cart-count', '#bp-num']) { const b = $(id); if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } } };
  }

  function pintarMenu() {
    const cont = $('#menu-secciones'); cont.replaceChildren();
    const grupos = new Map();
    for (const p of [...menu].sort((a, b) => a.orden - b.orden)) { if (!grupos.has(p.seccion)) grupos.set(p.seccion, []); grupos.get(p.seccion).push(p); }
    const claves = [...grupos.keys()].sort((a, b) => (ORDEN_SEC.indexOf(a) + 99) % 99 - (ORDEN_SEC.indexOf(b) + 99) % 99 || a.localeCompare(b));
    // 21/11/2026: ya no hay sección "Favoritas"; las que marcas como favoritas en la app solo llevan su etiqueta ★ en su propia sección
    const favIds = new Set(menu.filter(p => p.destacado).map(p => p.id));
    const lista = claves.map(s => ({ s, info: SEC_INFO[s] || K.secciones[s] || { eyebrow: '', titulo: s, texto: '' }, prods: grupos.get(s), pre: '' }));
    const tabs = [];
    for (const { s, info, prods, pre, fav } of lista) {
      const sec = el('section', 'sec' + (fav ? ' sec-fav' : '')); sec.setAttribute('aria-label', info.titulo); sec.id = 'sec-' + slug(s);
      tabs.push({ id: sec.id, txt: fav ? '⭐ Favoritas' : (info.corto || s) });
      const h = el('div', 'sec-head');
      if (info.eyebrow) h.append(el('p', 'eyebrow', info.eyebrow));
      h.append(el('h2', null, info.titulo));
      if (info.texto) h.append(el('p', null, info.texto));
      const g = el('div', 'grid');
      prods.forEach((p, k) => { const t = tarjeta(p); if (!fav && favIds.has(p.id)) t.classList.add('es-fav'); revelar(t, pre + p.id, k); g.append(t); });
      revelar(h, 'sec-' + s);
      sec.append(h, g); cont.append(sec);
    }
    pintarTabs(tabs); pintarStockTags();
    if (!menu.length) cont.append(el('p', 'vacio', 'Estamos actualizando el menú. Escríbenos por WhatsApp para hacer tu pedido.'));
  }
  function tarjeta(p) {
    const c = el('article', 'card' + (p.agotado ? ' agotado' : '')); c.dataset.id = p.id;
    const fi = el('div', 'card-img'), img = el('img');
    img.src = foto(p); img.alt = p.nombre; img.loading = 'lazy'; img.width = 560; img.height = 420;
    fi.append(img); if (p.agotado) fi.append(el('span', 'agotado-tag', 'Agotado hoy')); else if (p.sobre) fi.append(el('span', 'sp-tag', '📦 Sobre pedido'));
    const stg = el('span', 'agotado-tag stk-tag'); stg.hidden = true; fi.append(stg);
    const fv = el('span', 'fav-tag', '★ Favorita'); fv.title = 'Una de las más pedidas'; fi.append(fv);
    fi.append(el('span', 'ver-mas', 'Ver')); fi.tabIndex = 0; fi.setAttribute('role', 'button'); fi.setAttribute('aria-label', 'Ver detalles de ' + p.nombre);
    fi.onclick = () => abrirDetalle(p); fi.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalle(p); } };
    const b = el('div', 'card-body'), top = el('div', 'card-top'), h3 = el('h3'), tb = el('button', 'card-tit', p.nombre);
    tb.type = 'button'; tb.onclick = () => abrirDetalle(p); h3.append(tb);
    top.append(h3, el('span', 'precio', money(p.precio)));
    b.append(top);
    if (desc(p)) b.append(el('p', 'card-desc', desc(p)));
    if (p.sobre) b.append(el('p', 'card-sp', spTxt()));
    const acc = el('div', 'card-acc');
    // 22/11/2026: "Añadir" se convierte en el contador del carrito (como en Uber Eats / DiDi). Cada − / + cambia el pedido al momento:
    // ya no hay piezas "elegidas pero sin añadir", que confundían cuando varios sabores comparten la misma concha.
    const st = el('div', 'stepper en-ped'), menos = el('button', null, '−'), out = el('output'), mas = el('button', null, '+');
    menos.type = mas.type = 'button'; mas.setAttribute('aria-label', 'Una pieza más de ' + p.nombre);
    const add = el('button', 'add', p.agotado ? 'Agotado' : 'Añadir');
    add.type = 'button'; add.disabled = p.agotado || pausa;
    const sync = () => {
      const q = cart.get(p.id) || 0, t = topeHoy(p), enP = q > 0;
      st.hidden = !enP; add.hidden = enP; if (!enP) return;
      out.textContent = q; out.setAttribute('aria-label', `${q} en tu pedido`);
      menos.setAttribute('aria-label', q <= minQ(p) ? 'Quitar ' + p.nombre + ' del pedido' : 'Una pieza menos de ' + p.nombre);
      mas.disabled = pausa || t <= 0 || q >= MAXQ; mas.title = t <= 0 ? `Ya no quedan más para ${cuandoTxt()}` : '';
    };
    c._upd = sync; // se vuelve a revisar cuando cambia el carrito o el stock (también desde el carrito)
    const popCuenta = () => { const k = $('#cart-count'); if (k) { k.classList.remove('pop'); void k.offsetWidth; k.classList.add('pop'); } };
    add.onclick = () => { if (pausa || p.agotado || topeHoy(p) <= 0) return; agregar(p, minQ(p), img); sync(); };
    menos.onclick = () => { const q = cart.get(p.id) || 0; if (q - 1 < minQ(p)) cart.delete(p.id); else cart.set(p.id, q - 1); guardarCarrito(); pintarCarrito(); sync(); popCuenta(); };
    mas.onclick = () => {
      const t = topeHoy(p); if (pausa) return;
      if (t <= 0) { toast(`Ya no quedan más ${p.nombre} para ${cuandoTxt()}`); return; }
      cart.set(p.id, Math.min(MAXQ, (cart.get(p.id) || 0) + 1)); guardarCarrito(); pintarCarrito(); sync(); evento('agrega');
      if (sinMov || !img.animate) popCuenta(); else volarAlCarrito(img); // cada + hace volar la foto a la barra de abajo (sin texto)
    };
    st.append(menos, out, mas); sync();
    acc.append(add, st); b.append(acc);
    c.append(fi, b);
    return c;
  }
  // Etiqueta en la foto: "Hoy quedan 2" / "Agotado para hoy" (solo si hoy se puede pedir)
  function pintarStockTags() {
    const hoy = hayLimite(), hs = esHoySel();
    document.querySelectorAll('.card[data-id]').forEach(c => {
      const p = prod(c.dataset.id), t = c.querySelector('.stk-tag'); if (!t || !p) return;
      const r = hoy && !p.agotado ? quedanHoy(p.id) : Infinity;
      // Sin stock para hoy: se ve en gris y ya NO se puede agregar (el cliente puede cambiar el día)
      const sinHoy = hoy && !p.agotado && r <= 0; // sin stock, o el carrito ya tiene las últimas
      if (c._upd) c._upd();
      const enP = (cart.get(p.id) || 0) > 0; // ya está en su pedido: no se ve en gris aunque ya no queden más
      c.classList.toggle('sin-hoy', sinHoy && !enP);
      const ad = c.querySelector('.add'); if (ad && !ad.classList.contains('ok')) { ad.disabled = p.agotado || pausa || sinHoy; ad.textContent = p.agotado ? 'Agotado' : sinHoy ? (hs ? 'Agotado hoy' : 'Agotado') : 'Añadir'; }
      t.classList.remove('enped');
      if (sinHoy) { t.hidden = false; t.textContent = enP ? 'Agotado' : hs ? 'Agotado hoy' : 'Agotado'; t.classList.toggle('cero', !enP); t.classList.remove('uno'); t.classList.toggle('enped', enP); return; } // en su pedido y ya no quedan más: "Agotado" en coral
      t.hidden = !(r <= 5); if (!t.hidden) { t.textContent = `${hs ? 'Hoy ' : ''}${r === 1 ? (hs ? 'queda 1' : 'Queda 1') : (hs ? 'quedan ' : 'Quedan ') + r}`; t.classList.remove('cero'); t.classList.toggle('uno', r === 1); }
    });
  }
  function agregar(p, q, img) {
    const r = quedanHoy(p.id);
    q = Math.min(q, topeHoy(p)); if (q <= 0) return;
    if (p.sobre && !cart.has(p.id)) q = Math.max(q, minQ(p));
    const fAntes = fechaPedido();
    cart.set(p.id, Math.min(MAXQ, (cart.get(p.id) || 0) + q)); guardarCarrito(); pintarCarrito(); evento('agrega');
    if (sinMov || !img || !img.animate) { const b = $('#cart-count'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } else volarAlCarrito(img);
    // "Disponible hoy: dos" (en palabras del 1 al 10)
    const enLetra = n => ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'][n] || String(n);
    const fDesp = fechaPedido();
    if (p.sobre && fDesp !== fAntes) { const o = fechasDisponibles().find(x => x.f === fDesp); toast(`📦 ${p.nombre} es sobre pedido · tu pedido quedó para ${o ? o.txt.split(' · ')[0].toLowerCase() : 'otro día'}`); return; }
    if (q > r) { const tot = Math.max(0, r + (cart.get(p.id) || 0) - q); toast(tot <= 0 ? `${p.nombre} · Agotada hoy. Agregada para pedir otro día.` : `${p.nombre} · Disponible hoy: ${enLetra(tot)}`); }
    else pintarStockTags(); // 22/11/2026: sin aviso de texto al agregar; basta la animación de la foto hacia el carrito
  }
  const slug = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // ---------- Pestañas de categorías (fijas arriba al bajar) ----------
  const tabsBox = $('#tabs'), tabsIn = $('#tabs-in');
  const altoFijo = () => $('.header').offsetHeight + (tabsBox.hidden ? 0 : tabsBox.offsetHeight) + 8;
  // Píldora oscura que se desliza hasta la pestaña activa
  let pill = null;
  const moverPildora = b => {
    if (!pill || !b) return;
    pill.style.width = b.offsetWidth + 'px'; pill.style.transform = `translateX(${b.offsetLeft}px)`;
    if (!pill.classList.contains('lista')) requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.add('lista'))); // la primera vez aparece ya en su lugar, sin deslizarse desde cero
  };
  const tabsBtns = () => [...tabsIn.querySelectorAll('.tab')];
  function pintarTabs(tabs) {
    tabsIn.replaceChildren(); tabsBox.hidden = tabs.length < 2;
    for (const t of tabs) {
      const b = el('button', 'tab', t.txt); b.type = 'button'; b.dataset.sec = t.id;
      b.onclick = () => { const s = document.getElementById(t.id); if (!s) return; window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - altoFijo() + 1, behavior: sinMov ? 'auto' : 'smooth' }); };
      tabsIn.append(b);
    }
    if (sinMov) { tabsIn.classList.add('sin-pill'); pill = null; }
    else { pill = el('span', 'tab-pill'); pill.setAttribute('aria-hidden', 'true'); tabsIn.append(pill); }
    marcarTab(true);
  }
  function marcarTab(forzar) {
    if (tabsBox.hidden) return;
    const lim = altoFijo() + 40; let act = null; const btns = tabsBtns();
    for (const b of btns) { const s = document.getElementById(b.dataset.sec); if (s && s.getBoundingClientRect().top <= lim) act = b; }
    act = act || btns[0];
    for (const b of btns) { const on = b === act; if (b.classList.contains('on') !== on || (on && forzar)) { b.classList.toggle('on', on); if (on) { b.setAttribute('aria-current', 'true'); moverPildora(b); tabsIn.scrollTo({ left: b.offsetLeft - (tabsIn.clientWidth - b.offsetWidth) / 2, behavior: sinMov ? 'auto' : 'smooth' }); } else b.removeAttribute('aria-current'); } }
  }
  // Si cambia el ancho (giro del celular, carga de la fuente), la píldora se reacomoda
  const reacomodarPildora = () => moverPildora(tabsIn.querySelector('.tab.on'));
  addEventListener('resize', reacomodarPildora); if (document.fonts && document.fonts.ready) document.fonts.ready.then(reacomodarPildora);
  let tabRaf = 0; addEventListener('scroll', () => { if (!tabRaf) tabRaf = requestAnimationFrame(() => { tabRaf = 0; marcarTab(); }); }, { passive: true });
  const ponAltoHeader = () => document.documentElement.style.setProperty('--hdr', $('.header').offsetHeight + 'px');
  ponAltoHeader(); addEventListener('resize', ponAltoHeader); if ('ResizeObserver' in window) new ResizeObserver(ponAltoHeader).observe($('.header'));

  // ---------- Vista de detalle del producto ----------
  const det = $('#detalle'); let detP = null, detQ = 1;
  const detUpd = () => { const t = topeHoy(detP), mi = minQ(detP); if (detQ > t) detQ = Math.max(mi, t); $('#det-q').textContent = detQ; $('#det-menos').disabled = detQ <= mi; $('#det-mas').disabled = detQ >= t;
    // 22/11/2026: etiqueta sobre la foto ampliada, igual que en las tarjetas: "Hoy quedan 3" / "Hoy queda 1" / "Agotado" (al llegar al tope con la cantidad elegida)
    { const tg = $('#det-tag'); if (tg) { const lim = detP && !detP.agotado && !det.dataset.sinHoy && hayLimite() && isFinite(quedanHoy(detP.id)), r = !lim ? Infinity : detQ >= t && detQ > mi ? 0 : Math.max(0, t - (detQ - mi)), hs = esHoySel(); // al abrir dice lo mismo que la tarjeta; cada + baja 1; al llegar al tope: "Agotado"
      tg.hidden = !(r <= 5); tg.classList.remove('uno', 'cero', 'enped');
      if (!tg.hidden) { if (r <= 0) { tg.textContent = 'Agotado'; tg.classList.add('enped'); } else { tg.textContent = `${hs ? 'Hoy ' : ''}${r === 1 ? (hs ? 'queda 1' : 'Queda 1') : (hs ? 'quedan ' : 'Quedan ') + r}`; if (r === 1) tg.classList.add('uno'); } } } }
    const a = $('#det-add'); a.disabled = !detP || detP.agotado || pausa || !!det.dataset.sinHoy; a.textContent = detP && detP.agotado ? 'Agotado' : pausa ? 'Pedidos en pausa' : det.dataset.sinHoy ? 'Agotado hoy' : `Agregar · ${money(detQ * (detP ? detP.precio : 0))}`;
  };
  function abrirDetalle(p) {
    detP = p; detQ = minQ(p);
    const im = $('#det-img'); im.src = foto(p); im.alt = p.nombre;
    const sinHoy = !p.agotado && quedanHoy(p.id) <= 0;
    det.classList.toggle('agotado', p.agotado || sinHoy); $('#det-ag').hidden = !(p.agotado || sinHoy); det.dataset.sinHoy = sinHoy ? '1' : '';
    $('#det-sec').textContent = p.seccion; $('#det-n').textContent = p.nombre; $('#det-p').textContent = money(p.precio);
    $('#det-d').textContent = desc(p); $('#det-d').hidden = !desc(p);
    const r = !p.agotado ? quedanHoy(p.id) : Infinity, ds = $('#det-stk');
    ds.hidden = true; void r; // la cantidad que queda ya se ve en la etiqueta sobre la foto
    ds.classList.toggle('sp', !!p.sobre); if (p.sobre && !p.agotado) { ds.hidden = false; ds.textContent = '📦 ' + spTxt(); } // agotado: sin texto, basta la etiqueta y el botón "Agotado hoy"
    detUpd();
    if (!det.open) det.showModal();
  }
  function cerrarDetalle() { if (!det.open) return; det.classList.add('sale'); setTimeout(() => { det.close(); det.classList.remove('sale'); }, 170); }
  $('#det-menos').onclick = () => { detQ = Math.max(minQ(detP), detQ - 1); detUpd(); };
  $('#det-mas').onclick = () => { const t = topeHoy(detP); if (detQ >= t) { toast(t <= 0 ? `${detP.nombre} · Agotada para ${cuandoTxt()}` : `${detP.nombre} · Disponible ${cuandoTxt()}: ${enLetraT(t)}`); return; } detQ = Math.min(t, detQ + 1); detUpd(); };
  $('#det-x').onclick = cerrarDetalle;
  det.addEventListener('cancel', e => { e.preventDefault(); cerrarDetalle(); });
  det.addEventListener('click', e => { if (e.target === det) cerrarDetalle(); });
  $('#det-add').onclick = () => { if (!detP || detP.agotado || pausa || topeHoy(detP) <= 0) return; agregar(detP, Math.min(detQ, topeHoy(detP)), $('#det-img')); cerrarDetalle(); };

  // ---------- Fuera de horario: se puede programar ----------
  function pintarProgramar() {
    const av = $('#aviso-cerrado'), np = $('#nota-prog'), hoy = ymd(new Date()), fs = fechasDisponibles(true);
    const prox = fs[0], d = new Date(), m = minAhora(), abiertoAhora = abiertoEn(d, m);
    if (pausa || !prox || prox.f === hoy) { av.hidden = true; np.hidden = true; return; }
    const h = horasDe(prox.f)[0], et = prox.txt.split(' · ')[0].toLowerCase();
    const cuando = `${et === 'mañana' ? 'mañana' : 'el ' + et}${h != null ? ' a las ' + hora12(h) : ''}`;
    av.replaceChildren(el('b', null, abiertoAhora ? '⏰ Por hoy ya no alcanzamos a preparar más pedidos.' : '🌙 Ahora estamos cerrados,'),
      (abiertoAhora ? ' Puedes' : ' pero puedes') + ' dejar tu pedido programado desde ahorita. Lo más pronto: ', el('b', null, cuando + '.'));
    { const b = el('button', 'btn-av-agendar', '📅 Agendar mi pedido'); b.type = 'button'; b.onclick = () => abrirAgenda(); av.append(' ', b); }
    av.hidden = false;
    np.textContent = `📅 Tu pedido quedará programado. Lo más pronto es ${cuando}; elige el día y la hora que prefieras.`; np.hidden = false;
  }

  // La página se actualiza sola (stock, agotados, precios) cada minuto y al volver a la pestaña; solo redibuja si algo cambió
  let firmaMenu = '';
  async function refrescarMenu() {
    if (!C.api || document.hidden) return;
    try {
      const d = await (await fetch(C.api + '?accion=menu', { cache: 'no-store' })).json(); if (!d.ok) return;
      const f = JSON.stringify([d.pausa, d.avisoPausa, d.envio, d.horario, d.stock, d.stockFecha, d.stockModo, d.capDia, d.capLibre, d.productos]);
      if (f !== firmaMenu) { firmaMenu = f; aplicarMenu(d); }
    } catch (e) {}
  }
  // Mientras llega el menú en vivo se ven "esqueletos" (siluetas que laten) en lugar de un salto de contenido.
  // Si el buzón tarda más de 2.5 s o falla, se muestra el menú de respaldo de catalogo.js.
  function pintarSkeleton() {
    const cont = $('#menu-secciones'); cont.replaceChildren();
    for (let s = 0; s < 2; s++) {
      const sec = el('section', 'sec sk-sec'); sec.setAttribute('aria-hidden', 'true');
      const h = el('div', 'sec-head'); h.append(el('span', 'sk sk-eyebrow'), el('span', 'sk sk-h2')); if (s) h.append(el('span', 'sk sk-p'));
      const g = el('div', 'grid');
      for (let k = 0; k < (s ? 2 : 3); k++) {
        const c = el('article', 'card sk-card'), fi = el('div', 'card-img sk'), b = el('div', 'card-body');
        b.append(el('span', 'sk sk-tit'), el('span', 'sk sk-precio'), el('span', 'sk sk-desc'), el('span', 'sk sk-desc corta'), el('span', 'sk sk-btn'));
        c.append(fi, b); c.style.setProperty('--d', (k * 90) + 'ms'); g.append(c);
      }
      sec.append(h, g); cont.append(sec);
    }
    cont.setAttribute('aria-busy', 'true');
  }
  async function cargarMenu() {
    menu = normalizar(K.menuRespaldo || []); // el respaldo ya cuenta como menú (para que el carrito guardado no se pierda)
    if (!C.api) { pintarMenu(); pintarCarrito(); return; }
    pintarSkeleton(); pintarCarrito();
    let mostrado = false;
    const respaldo = setTimeout(() => { if (!menuEnVivo) { mostrado = true; $('#menu-secciones').removeAttribute('aria-busy'); pintarMenu(); pintarCarrito(); } }, 2500);
    try {
      const r = await fetch(C.api + '?accion=menu', { cache: 'no-store' });
      const d = await r.json();
      if (!d.ok) throw 0;
      clearTimeout(respaldo); $('#menu-secciones').removeAttribute('aria-busy');
      firmaMenu = JSON.stringify([d.pausa, d.avisoPausa, d.envio, d.horario, d.stock, d.stockFecha, d.stockModo, d.capDia, d.capLibre, d.productos]);
      aplicarMenu(d);
    } catch (e) { clearTimeout(respaldo); if (!mostrado && !menuEnVivo) { $('#menu-secciones').removeAttribute('aria-busy'); pintarMenu(); pintarCarrito(); } /* sin conexión al buzón: se queda el menú de respaldo */ }
  }
  function aplicarMenu(d) {
    try {
      pausa = !!d.pausa; avisoPausa = d.avisoPausa || ''; conEnvio = d.envio !== false;
      if (!d.sinMenu && Array.isArray(d.productos) && d.productos.length) { menu = normalizar(d.productos); menuEnVivo = true; }
      const av = $('#aviso-pausa'); av.hidden = !pausa; av.textContent = avisoPausa || 'Por ahora no estamos recibiendo pedidos en línea. Escríbenos por WhatsApp.';
      $('#op-domicilio').hidden = !conEnvio;
      usarHorario(d.horario); pintarHorario(); if (d.datosPago) datosPago = d.datosPago;
      if (Array.isArray(d.secciones) && d.secciones.length) { ORDEN_SEC = d.secciones.map(x => String(x.nombre || '')).filter(Boolean);
        SEC_INFO = Object.fromEntries(d.secciones.filter(x => x && x.nombre).map(x => [String(x.nombre), { eyebrow: String(x.eyebrow || ''), titulo: String(x.titulo || x.nombre), texto: String(x.texto || ''), corto: String(x.nombre) }])); }
      STK = d.stock && typeof d.stock === 'object' ? d.stock : {}; stockFecha = d.stockFecha || '';
      stockModo = d.stockModo === 'capacidad' ? 'capacidad' : 'stock';
      capDia = Math.max(0, Math.floor(Number(d.capDia) || 0)); capLibre = d.capLibre && typeof d.capLibre === 'object' ? d.capLibre : {};
      pintarMenu(); pintarCarrito(); aplicarCliente(); pintarProgramar(); pintarCuando(); if (drawer.open) llenarFechas();
      cargarFotos();
    } catch (e) { console.error(e); }
  }

  // ---------- Carrito ----------
  const totales = () => { let pz = 0, t = 0; for (const [id, q] of cart) { const p = prod(id); if (!p) continue; pz += q; t += q * p.precio; } return { pz, t }; };
  function pintarCarrito() {
    for (const id of [...cart.keys()]) if (!prod(id)) cart.delete(id);
    const ul = $('#cart-items'); ul.replaceChildren();
    for (const [id, q] of cart) {
      const p = prod(id), li = el('li', 'ci' + (p.agotado ? ' agot' : ''));
      const img = el('img'); img.src = foto(p); img.alt = '';
      const mid = el('div'); mid.append(el('div', 'ci-n', p.nombre), el('div', 'ci-p', `${money(p.precio)} c/u`)); if (p.sobre) mid.append(el('div', 'ci-sp', `📦 Sobre pedido${minQ(p) > 1 ? ' · mín. ' + minQ(p) : ''}`));
      let conflicto = null; // producto que no alcanza para hoy: aviso corto, foto en gris y botón para cambiar el día
      if (drawer.open && esParaHoy()) { const c = conflictosHoy([...cart]).find(x => x.ids.includes(id)); if (c) { conflicto = c; li.classList.add('excede'); mid.append(el('div', 'ci-stk', c.disp <= 0 ? '⚠️ Agotado para hoy' : `⚠️ Para hoy solo ${c.disp === 1 ? 'queda 1' : 'quedan ' + c.disp}`)); } }
      // Una sola píldora: [🗑 o −] [N ×] [+]. Con 1 pieza el botón izquierdo es el bote (quita el producto); con más, es −
      const st = el('div', 'stepper'), a = el('button', null), inp = el('input'), b = el('button', null, '+');
      a.type = b.type = 'button'; b.setAttribute('aria-label', 'Más ' + p.nombre);
      // Siempre "−" (para quitar el producto está el bote de la derecha); con la cantidad mínima se desactiva
      a.textContent = '−'; a.setAttribute('aria-label', 'Menos ' + p.nombre); a.disabled = q <= minQ(p); if (a.disabled) a.title = 'Para quitarlo usa el bote de basura';
      Object.assign(inp, { type: 'number', min: 1, max: MAXQ, value: q, inputMode: 'numeric' }); inp.setAttribute('aria-label', 'Cantidad de ' + p.nombre);
      const cq = capQueda(), tope = Math.min(drawer.open && esParaHoy() ? Math.max(q, maxHoy(id, [...cart])) : MAXQ, isFinite(cq) ? Math.max(q, q + cq) : MAXQ);
      b.disabled = q >= Math.min(MAXQ, tope);
      const quitar = () => { li.classList.add('se-va'); setTimeout(() => { cart.delete(id); guardarCarrito(); pintarCarrito(); }, 220); }; // se encoge y desaparece
      a.onclick = () => { if (q <= minQ(p)) return; cart.set(id, q - 1); guardarCarrito(); pintarCarrito(); };
      b.onclick = () => { cart.set(id, Math.min(MAXQ, q + 1)); guardarCarrito(); pintarCarrito(); };
      inp.onchange = () => { const v = Math.floor(Number(inp.value)); if (v >= 1 && v <= MAXQ) cart.set(id, Math.max(minQ(p), v)); guardarCarrito(); pintarCarrito(); };
      st.append(a, inp, b);
      const r = el('div', 'ci-r'), ctrl = el('div', 'ci-ctrl');
      ctrl.append(st);
      // Agotado para hoy: la píldora − / + se sustituye por "Cambiar" (quita el producto y vuelve al catálogo)
      if (conflicto && conflicto.disp <= 0) { const cb = el('button', 'ci-cambiar', '🔄 Cambiar'); cb.type = 'button'; cb.title = 'Quitar este producto y elegir otro del catálogo'; cb.onclick = () => { cart.delete(id); guardarCarrito(); pintarCarrito(); cerrar(); location.hash = '#menu'; toast(`${p.nombre} se quitó de tu pedido · elige otro sabor`); }; st.replaceWith(cb);
      } // (para quitarlo sin ir al catálogo está el bote de basura de la derecha)
      // Bote de basura después del precio: quita el producto completo de un clic (sin bajar con − hasta llegar al bote)
      const del = el('button', 'ci-del ci-del-q'); del.type = 'button'; del.setAttribute('aria-label', 'Quitar ' + p.nombre + ' del pedido'); del.title = 'Quitar del pedido'; del.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>'; del.onclick = () => { del.classList.add('on'); quitar(); }; // rojo mientras se va (en celular no hay "pasar el mouse")
      r.append(del, el('strong', null, money(q * p.precio)), ctrl); // la fila va al revés (row-reverse): queda píldora · precio · bote
      li.append(img, mid, r); ul.append(li);
    }
    const { pz, t } = totales();
    $('#cart-count').textContent = pz;
    $('#cart-open').setAttribute('aria-label', `Ver tu pedido, ${pz} ${pz === 1 ? 'pieza' : 'piezas'}`);
    { const n = $('#drawer-n'); if (n && n.textContent !== String(pz)) { n.textContent = pz; const ch = $('#drawer-count'); ch.classList.remove('pop'); void ch.offsetWidth; ch.classList.add('pop'); } $('#drawer-pz').textContent = pz === 1 ? 'pieza' : 'piezas'; }
    $('#cart-total').textContent = money(t);
    $('#cart-empty').hidden = cart.size > 0;
    $('#form-pedido').hidden = cart.size === 0;
    const bp = $('#barra-pedido');
    { const fp = fechaPedido(); pintarCuando(); const sf = $('#sel-fecha'); if (drawer.open && sf && sf.value !== fp) llenarFechas(); } // con "sobre pedido" el día se recorre solo
    pintarStockTags(); if (typeof revisarBoton === 'function' && $('#sel-fecha')) try { revisarBoton(); } catch (e) {}
    if (bp) { bp.hidden = !pz; $('#bp-num').textContent = pz; $('#bp-txt').textContent = `${pz} ${pz === 1 ? 'pieza' : 'piezas'} · ${money(t)}`; document.body.classList.toggle('con-barra', !!pz); }
  }

  // ---------- Panel ----------
  const drawer = $('#drawer');
  function abrir() {
    llenarFechas(); $('#stk-dia').hidden = true;
    if (!drawer.open) drawer.showModal(); pintarCarrito(); if (cart.size) evento('abre');
  }
  function cerrar() {
    if (!drawer.open) return;
    drawer.classList.add('sale');
    setTimeout(() => { drawer.close(); drawer.classList.remove('sale'); }, 190);
  }
  $('#cart-open').onclick = abrir;
  $('#barra-pedido').onclick = abrir;
  $('#drawer-close').onclick = cerrar;
  drawer.addEventListener('cancel', e => { e.preventDefault(); cerrar(); });
  drawer.addEventListener('click', e => { if (e.target === drawer) cerrar(); if (e.target.closest('[data-cerrar]')) { e.preventDefault(); cerrar(); if (e.target.matches('a')) location.hash = '#menu'; } });

  // ---------- Formulario ----------
  const form = $('#form-pedido');
  function llenarFechas() {
    const sel = $('#sel-fecha'), prev = sel.value; sel.replaceChildren();
    for (const o of fechasDisponibles()) { const op = el('option', null, o.txt); op.value = o.f; sel.append(op); }
    sel.value = fechaPedido(); // misma fecha que el chip "¿Para cuándo?"
    bloquearDia(); llenarHoras();
  }
  // Si el pedido es "Para hoy", el Día no se cambia desde el resumen (solo la hora); para otro día se usa "Agendar"
  // La casilla Día solo muestra el día elegido; se cambia únicamente con el botón "Agendar"
  function bloquearDia() { const sel = $('#sel-fecha'); if (!sel) return; const hoy = sel.value === hoyYmd(); sel.disabled = true; sel.title = 'Para cambiar el día usa "Agendar".'; const b = $('#dr-agendar'); if (b) b.classList.toggle('activo', !hoy); }
  // ---------- "Para hoy | Agendar" (barra de pestañas) ----------
  const hayHoyDisponible = () => fechasDisponibles().some(o => o.f === hoyYmd());
  function pintarCuando() {
    const box = $('#cuando'); if (!box) return;
    const fs = fechasDisponibles(), f = fechaPedido(), hoy = hoyYmd(), esHoy = f === hoy;
    box.hidden = true; // 21/11/2026: el día y la hora se eligen en el carrito (paso 2)
    const bh = $('#cu-hoy'), ba = $('#cu-agendar');
    bh.disabled = !hayHoyDisponible(); bh.title = bh.disabled ? (haySobre() ? 'Tu pedido lleva productos sobre pedido' : 'Por hoy ya no recibimos pedidos') : '';
    bh.classList.toggle('on', esHoy); ba.classList.toggle('on', !esHoy);
    bh.setAttribute('aria-pressed', esHoy); ba.setAttribute('aria-pressed', !esHoy);
    const cur = fs.find(o => o.f === f);
    $('#cu-agendar-t').textContent = esHoy || !cur ? 'Agendar pedido' : `${cur.txt.split(' · ')[0]} · ${hora12(hm(horaPedido()))}`;
    moverBurbuja();
  }
  // Burbuja oscura que se desliza de "Para hoy" a "Agendar" (y cambia de ancho con el texto)
  function moverBurbuja() {
    const bb = $('#cu-bubble'), on = $('#cuando .cu-btn.on'); if (!bb || !on) return;
    bb.style.width = on.offsetWidth + 'px'; bb.style.transform = `translateX(${on.offsetLeft}px)`;
    if (!bb.classList.contains('lista')) requestAnimationFrame(() => requestAnimationFrame(() => bb.classList.add('lista')));
  }
  addEventListener('resize', moverBurbuja); if (document.fonts && document.fonts.ready) document.fonts.ready.then(moverBurbuja);
  // Llamada de atención en "Para hoy / Agendar pedido": al aparecer en pantalla (al entrar o al regresar con scroll)
  // destella y muestra un aviso, hasta que el cliente elige para cuándo es su pedido
  { const cu = $('#cuando'); let ult = 0, tAv = 0;
    const llamar = () => { if (fechaElegida || cu.hidden || Date.now() - ult < 6000) return; ult = Date.now();
      cu.classList.remove('llama'); void cu.offsetWidth; cu.classList.add('llama'); clearTimeout(tAv); tAv = setTimeout(() => cu.classList.remove('llama'), 4200); };
    cu.addEventListener('click', () => { clearTimeout(tAv); cu.classList.remove('llama'); });
    if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setTimeout(llamar, 350); }), { threshold: .9 }).observe(cu);
  }
  $('#cu-hoy').onclick = () => { if (!hayHoyDisponible()) { if (haySobre()) toast(`📦 Tu pedido lleva productos sobre pedido (${spDias() === 1 ? '1 día' : spDias() + ' días'} de anticipación)`); return; } const ya = fechaPedido() === hoyYmd(); ponFecha(hoyYmd()); if (!ya) toast('Tu pedido es para hoy'); };
  // Al tocar "Agendar pedido": primero la burbuja se desliza al botón (animación), después se abre el minicalendario.
  // Si el cliente cierra sin elegir, la burbuja regresa sola a "Para hoy" (pintarCuando al cerrar)
  $('#cu-agendar').onclick = () => {
    const ba = $('#cu-agendar'), bh = $('#cu-hoy');
    if (ba.classList.contains('on')) return abrirAgenda();
    bh.classList.remove('on'); ba.classList.add('on'); moverBurbuja();
    setTimeout(abrirAgenda, 420);
  };
  const drAg = $('#dr-agendar'); if (drAg) drAg.onclick = () => abrirAgenda(); // mismo minicalendario desde el resumen del pedido

  // Ventana flotante: minicalendario + hora (respeta el horario que se publica desde la app)
  const agenda = $('#agenda'); let agF = '', agH = '', agMes = null; // selección provisional y mes visible
  const fechaDeYmd = f => { const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d); };
  function abrirAgenda() {
    const fs = fechasDisponibles(); if (!fs.length) { toast('Por ahora no hay días disponibles'); return; }
    const f0 = fechaPedido(), hoy = hoyYmd();
    // Si el pedido está "para hoy", propone el siguiente día disponible; si no, el que ya tiene
    const prop = f0 !== hoy ? f0 : (fs.find(o => o.f !== hoy) || fs[0]).f;
    agF = prop; agH = f0 === prop ? horaPedido() : (horasDe(prop).map(minTxt)[0] || '');
    const d = fechaDeYmd(agF); agMes = new Date(d.getFullYear(), d.getMonth(), 1);
    pintarCal(); pintarHorasAg();
    if (!agenda.open) agenda.showModal();
  }
  function cerrarAgenda() { if (!agenda.open) return; agenda.classList.add('sale'); setTimeout(() => { agenda.close(); agenda.classList.remove('sale'); pintarCuando(); }, 170); } // al cerrar, la burbuja refleja la fecha real (hoy o la agendada)
  function pintarCal() {
    const fs = fechasDisponibles(), disp = new Set(fs.map(o => o.f)), hoy = new Date(), y = agMes.getFullYear(), m = agMes.getMonth();
    const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    $('#cal-mes').textContent = `${MESES_L[m][0].toUpperCase() + MESES_L[m].slice(1)} ${y}`;
    // Solo se puede navegar entre el mes de hoy y el del último día disponible
    const ult = fechaDeYmd(fs[fs.length - 1].f), primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1), ultimo = new Date(ult.getFullYear(), ult.getMonth(), 1);
    $('#cal-prev').disabled = agMes <= primero; $('#cal-next').disabled = agMes >= ultimo;
    const g = $('#cal-dias'); g.replaceChildren();
    const off = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
    for (let i = 0; i < off; i++) g.append(el('span', 'cal-vacio'));
    const nd = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= nd; d++) {
      const f = ymd(new Date(y, m, d)), b = el('button', 'cal-d', String(d)); b.type = 'button'; b.setAttribute('role', 'gridcell');
      const ok = disp.has(f); b.disabled = !ok;
      if (f === ymd(hoy)) b.classList.add('hoy');
      if (f === agF) { b.classList.add('sel'); b.setAttribute('aria-selected', 'true'); }
      if (!ok) { const dd = new Date(y, m, d); b.title = dd < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) ? '' : !abiertoDia(dd) ? 'Cerrado' : f === ymd(hoy) ? 'Por hoy ya no recibimos pedidos' : libreDia(f) <= 0 ? 'Ese día ya está lleno' : 'Fuera del plazo para agendar'; if (abiertoDia(dd) && libreDia(f) <= 0) b.classList.add('lleno'); }
      b.onclick = () => { agF = f; const hs = horasDe(f).map(minTxt); if (!hs.includes(agH)) agH = hs[0] || ''; pintarCal(); pintarHorasAg(); };
      if (b.classList.contains('lleno')) b.setAttribute('aria-label', `${d}: día lleno`);
      g.append(b);
    }
    const ley = $('#cal-ley'); if (ley) ley.hidden = !g.querySelector('.cal-d.lleno'); // leyenda solo si en este mes hay días llenos
  }
  function pintarHorasAg() {
    const box = $('#ag-horas'); box.replaceChildren();
    const d = fechaDeYmd(agF), hs = horasDe(agF);
    const tramos = abiertoDia(d) ? dia(d).t.map(t => `${hora12(t.a)} – ${hora12(t.c)}`).join(' y ') : 'cerrado';
    const lib = libreDia(agF), quedan = isFinite(lib) && lib < capDia ? ` · quedan ${lib} ${lib === 1 ? 'pieza' : 'piezas'}` : '';
    $('#ag-horario').textContent = `${DIAS[d.getDay()][0].toUpperCase() + DIAS[d.getDay()].slice(1)} ${d.getDate()} ${MESES[d.getMonth()]} · ${tramos}${quedan}`;
    if (!hs.length) box.append(el('p', 'muted small', 'No hay horas disponibles ese día.'));
    for (const mnt of hs) {
      const v = minTxt(mnt), b = el('button', 'hora' + (v === agH ? ' on' : ''), horaTxt(mnt)); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', v === agH);
      b.onclick = () => { agH = v; pintarHorasAg(); };
      box.append(b);
    }
    const ok = $('#ag-ok'), cur = fechasDisponibles().find(o => o.f === agF);
    ok.disabled = !agF || !agH; ok.textContent = ok.disabled ? 'Agendar' : `Agendar para ${cur ? cur.txt.split(' · ')[0].toLowerCase() : agF} · ${horaTxt(hm(agH))}`;
  }
  $('#ag-ok').onclick = () => { if (!agF || !agH) return; const cur = fechasDisponibles().find(o => o.f === agF); ponFecha(agF, null, agH); cerrarAgenda(); if (!tipoEnt) horaElegida = false; toast(`📅 Pedido agendado para ${cur ? cur.txt.toLowerCase() : agF}${tipoEnt ? ', ' + horaTxt(hm(agH)) : ''}`); revisarBoton(); };
  $('#ag-x').onclick = $('#ag-cancel').onclick = cerrarAgenda;
  $('#cal-prev').onclick = () => { agMes = new Date(agMes.getFullYear(), agMes.getMonth() - 1, 1); pintarCal(); };
  $('#cal-next').onclick = () => { agMes = new Date(agMes.getFullYear(), agMes.getMonth() + 1, 1); pintarCal(); };
  agenda.addEventListener('cancel', e => { e.preventDefault(); cerrarAgenda(); });
  agenda.addEventListener('click', e => { if (e.target === agenda) cerrarAgenda(); });

  function llenarHoras() {
    const sel = $('#sel-hora'); sel.replaceChildren();
    for (const m of horasDe($('#sel-fecha').value)) { const op = el('option', null, horaTxt(m)); op.value = minTxt(m); sel.append(op); }
    const h = $('#sel-fecha').value === fechaPedido() ? horaPedido() : ''; if ([...sel.options].some(o => o.value === h)) sel.value = h;
    pintarDiaHora();
  }
  $('#sel-hora').onchange = () => { horaSel = $('#sel-hora').value; pintarCuando(); pintarDiaHora(); };
  // Resumen claro de Día y Hora; los horarios de 15 en 15 min se eligen en una ventanita flotante
  const horasDlg = $('#horas-dlg');
  function pintarDiaHora() {
    const sf = $('#sel-fecha'), sh = $('#sel-hora'), f = sf.value; if (!f) return;
    const cur = fechasDisponibles().find(o => o.f === f), et = cur ? cur.txt.split(' · ')[0] : '', ft = fechaTexto(f);
    const diaTxt = (et === 'Hoy' || et === 'Mañana') ? `${et}, ${ft}` : ft.charAt(0).toUpperCase() + ft.slice(1);
    $('#cr-dia').textContent = diaTxt;
    const tipo = form.entregaTipo.value, dom = tipo === 'domicilio';
    $('#cr-hora-lbl').textContent = tipo === 'recoge' ? 'Hora para recoger' : dom ? 'Hora de entrega' : 'Hora';
    const ch = $('#cr-hora'); ch.classList.toggle('pend', !tipo);
    const sinHoras = !!tipo && !sh.options.length; ch.classList.toggle('pend', !tipo || !horaElegida || sinHoras);
    ch.textContent = !tipo ? 'Primero elige si recoges o te lo enviamos' : sinHoras ? (dom ? 'Ya no hay horarios a domicilio este día · cambia el día' : 'Ya no hay horarios este día · cambia el día') : !horaElegida || !sh.value ? (dom ? 'Elige un horario de entrega' : 'Elige una hora') : dom ? 'De ' + bloqueTxt(hm(sh.value)) : hora12(hm(sh.value));
    $('#dr-hora').hidden = !tipo || sinHoras; $('#dr-hora').textContent = horaElegida ? 'Cambiar hora' : 'Elegir hora'; $('#dr-hora').classList.toggle('activo', !!tipo && !horaElegida);
    $('#hd-t').textContent = dom ? '¿A qué hora lo quieres recibir?' : '¿A qué hora pasas por tu pedido?';
    $('#hd-sub').textContent = ''; $('#hd-sub').hidden = true;
    $('#dr-horas').replaceChildren(...[...sh.options].map(o => { const b = el('button', 'hora' + (o.value === sh.value ? ' on' : ''), o.textContent); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', o.value === sh.value);
      b.onclick = () => { sh.value = o.value; horaSel = o.value; horaElegida = true; revisarBoton(); $('#cuando-res').classList.remove('bad'); pintarCuando(); pintarDiaHora(); cerrarHoras(true); }; return b; }));
  }
  function abrirHoras() { pintarDiaHora(); if (!horasDlg.open) horasDlg.showModal(); const on = $('#dr-horas .hora.on') || $('#dr-horas .hora'); if (on) { on.focus({ preventScroll: true }); on.scrollIntoView({ block: 'center' }); } }
  // Al elegir la hora se cierra sola y el cliente sigue con sus datos (primer campo vacío)
  function cerrarHoras(elegida) { if (!horasDlg.open) return; horasDlg.classList.add('sale');
    setTimeout(() => { horasDlg.close(); horasDlg.classList.remove('sale'); if (elegida) { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); const cd = $('#campo-dir'), dom = cd && !cd.hidden;
        (dom ? cd : $('#cuando-res')).scrollIntoView({ block: dom ? 'start' : 'center', behavior: 'smooth' }); } /* a domicilio se queda en la dirección (vacía o guardada) para llenarla o revisarla */ /* sin abrir el teclado: el cliente ve su día y hora; el teclado sale hasta que toque una casilla */ }, 170); }
  $('#dr-hora').onclick = abrirHoras;
  $('#hd-x').onclick = () => cerrarHoras(false);
  horasDlg.addEventListener('cancel', e => { e.preventDefault(); cerrarHoras(false); });
  horasDlg.addEventListener('click', e => { if (e.target === horasDlg) cerrarHoras(false); });
  $('#sel-fecha').onchange = () => { $('#stk-dia').hidden = true; ponFecha($('#sel-fecha').value, 'drawer'); llenarHoras(); pintarCarrito(); };
  // Al elegir recoger/domicilio: cambian las horas (cada 15 min o bloques de 1 h) y hay que volver a escoger la hora. Ya no se abre sola la ventanita.
  function cambiaTipo() { const f0 = fechaPedido(); tipoEnt = form.entregaTipo.value; horaElegida = false; horaSel = '';
    const f1 = fechaPedido(); llenarFechas(); if (f1 !== f0 && f0 === hoyYmd() && tipoEnt === 'domicilio') toast('🛵 Por hoy ya no alcanzamos a llevar pedidos a domicilio: elige otro día o pasa a recoger.');
    pintarCarrito(); }
  const TIENDA = Object.assign({ direccion: 'Av. Colinas de San Patricio 505, Colinas de San Patricio, C.P. 20196, Aguascalientes, Ags.', mapa: 'https://www.google.com/maps/dir/?api=1&destination=21.8865077%2C-102.2344649' }, C.tienda || {});
  const ponDir = () => { const t = form.entregaTipo.value; $('#campo-dir').hidden = t !== 'domicilio'; $('#recoge-box').hidden = t !== 'recoge';
    $('#recoge-dir').textContent = TIENDA.direccion; $('#recoge-mapa').href = TIENDA.mapa; pintarDiaHora(); };
  // Pago por transferencia: aviso visible (antes de pedir) de que los datos bancarios llegan por WhatsApp al confirmar
  const pintaTransf = () => { const a = $('#aviso-transf'); if (!a) return; const on = form.pago.value === 'Transferencia'; a.hidden = !on; if (!on) return;
    const dom = form.entregaTipo.value === 'domicilio'; a.replaceChildren(el('span', 'at-ico', '🏦'));
    const t = el('div'); t.append(el('b', null, 'Los datos para transferir te los mandamos por WhatsApp junto con la confirmación de tu pedido 😉'), el('span', null, 'No transfieras antes de recibir nuestro mensaje. ¡Gracias!')); a.append(t); };
  form.addEventListener('change', e => { if (e.target.name === 'pago' || e.target.name === 'entregaTipo') pintaTransf(); });
  form.addEventListener('change', e => { if (e.target.name === 'entregaTipo') ponDir(); if (e.target.name === 'entregaTipo' || e.target.name === 'pago') revisarBoton();
    // Al elegir "Paso a recoger" (o "A domicilio") se abre la ventanita de horarios
    if (e.target.name === 'entregaTipo') cambiaTipo(); });
  // Al tocar "Paso a recoger" o "A domicilio" se abre la ventanita de horarios (cada 15 min o bloques de 1 h); al elegir la hora se cierra sola
  form.querySelectorAll('input[name="entregaTipo"]').forEach(r => r.addEventListener('click', () => setTimeout(() => { if ($('#sel-hora').options.length && !horasDlg.open) abrirHoras(); }, 160)));
  const esParaHoy = paraHoy; // misma regla en el carrito que en el menú
  const excedidos = () => esParaHoy() ? [...new Set(conflictosHoy([...cart]).flatMap(c => c.ids))] : [];
  // Nada viene preseleccionado: el cliente elige entrega y forma de pago
  const faltantes = () => { const f = []; if (!form.entregaTipo.value) f.push('si recoges o te lo enviamos'); if (!(form.nombre.value.trim().length > 0 && form.tel.value.replace(/\D/g, '').length === 10)) f.push('tu nombre y tu WhatsApp'); if (form.entregaTipo.value && (!horaElegida || !$('#sel-hora').value)) f.push(form.entregaTipo.value === 'domicilio' ? 'el horario de entrega' : 'la hora'); if (!form.pago.value) f.push('la forma de pago'); return f; };
  const listoParaPedir = () => faltantes().length === 0;
  function revisarBoton() {
    const falta = faltantes(), ok = falta.length === 0, cq = capQueda(), exCap = cq < 0, ex = excedidos().length > 0 || exCap;
    $('#btn-enviar').disabled = !ok || ex; $('#falta-datos').hidden = ok;
    if (!ok) $('#falta-datos').textContent = `Elige ${falta.length > 1 ? falta.slice(0, -1).join(', ') + ' y ' + falta.at(-1) : falta[0]} para continuar.`;
    // Por stock, cada producto muestra su aviso y el botón Cambiar; por capacidad (piezas totales del día) el aviso es general
    const a = $('#stk-aviso'); if (a) { a.hidden = !exCap; if (exCap) a.textContent = textoCap(cq + totales().pz); }
  }
  form.addEventListener('input', e => { if (e.target.name === 'nombre' || e.target.name === 'tel') revisarBoton(); });
  // 1) Si ya pidió antes, sus datos aparecen llenos (se guardan solo en su celular)
  let clienteAplicado = false;
  function aplicarCliente() {
    const c = leerCliente();
    if (!clienteAplicado) {
      clienteAplicado = true;
      if (c.nombre) form.nombre.value = c.nombre; if (c.tel) form.tel.value = fmtTel(String(c.tel));
      if (c.dir && typeof c.dir === 'object') { form.calle.value = c.dir.calle || ''; form.numExt.value = c.dir.num || ''; form.numInt.value = c.dir.int || ''; form.colonia.value = c.dir.col || ''; form.cp.value = c.dir.cp || ''; }
      else if (c.direccion) form.calle.value = c.direccion; // dirección guardada antes de las casillas: queda en "Calle" para que la acomode
      if (c.referencias) form.referencias.value = c.referencias;
    }
    if (!conEnvio && form.entregaTipo.value === 'domicilio') form.entregaTipo.value = '';
    if (tipoEnt !== form.entregaTipo.value) { tipoEnt = form.entregaTipo.value; horaElegida = false; llenarHoras(); }
    ponDir(); pintaTransf();
    const sal = $('#saludo'); sal.hidden = !(c.nombre && c.tel);
    if (!sal.hidden) $('#saludo-t').textContent = `👋 ¡Hola de nuevo, ${c.nombre.split(' ')[0]}!`;
    revisarBoton();
  }
  form.addEventListener('change', e => { if (e.target.name === 'entregaTipo') form.dataset.tocado = '1'; });
  $('#saludo-no').onclick = () => {
    try { localStorage.removeItem('tm-cliente'); localStorage.removeItem('tm-ultimo'); } catch (e) {}
    form.nombre.value = form.tel.value = ''; ['calle', 'numExt', 'numInt', 'colonia', 'cp', 'referencias'].forEach(k => { form[k].value = ''; }); form.pago.value = ''; pintaTransf(); form.entregaTipo.value = ''; ponDir();
    $('#saludo').hidden = true; revisarBoton(); form.nombre.focus();
  };

  const fmtTel = t => t.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  function datosForm() {
    const f = form;
    return {
      nombre: f.nombre.value.replace(/\s+/g, ' ').trim(), tel: f.tel.value.replace(/\D/g, '').slice(-10),
      entregaTipo: f.entregaTipo.value, ...dirForm(),
      fecha: f.fecha.value, hora: f.hora.value, horaFin: f.entregaTipo.value === 'domicilio' && HHMM.test(f.hora.value) ? minTxt(hm(f.hora.value) + 60) : '', pago: f.pago.value, notas: f.notas.value.replace(/\s+/g, ' ').trim(), web: f.web.value,
      items: [...cart].map(([id, cant]) => ({ id, cant, nombre: prod(id).nombre, precio: prod(id).precio }))
    };
  }
  function dirForm() {
    const v = k => form[k].value.replace(/\s+/g, ' ').trim();
    const dir = { calle: v('calle'), num: v('numExt'), int: v('numInt'), col: v('colonia'), cp: v('cp').replace(/\D/g, '') };
    const direccion = [`${dir.calle}${dir.num ? ' ' + dir.num : ''}${dir.int ? ' Int. ' + dir.int : ''}`, dir.col ? (/^(col\.?|colonia|fracc\.?|fraccionamiento)\s/i.test(dir.col) ? dir.col : 'Col. ' + dir.col) : '', dir.cp ? 'C.P. ' + dir.cp : ''].filter(Boolean).join(', ');
    return { dir, direccion, referencias: v('referencias') };
  }
  function validar(d) {
    form.querySelectorAll('.bad').forEach(x => x.classList.remove('bad'));
    const mal = (campo, msg) => { if (campo === form.hora || campo === form.fecha) { const c = $('#cuando-res'); c.classList.add('bad'); c.scrollIntoView({ block: 'center' }); return msg; } if (campo) { campo.classList.add('bad'); campo.focus(); } return msg; };
    if (!d.items.length) return 'Tu pedido está vacío.';
    const ag = d.items.find(i => prod(i.id).agotado); if (ag) return `${ag.nombre} se agotó por hoy. Quítalo de tu pedido, por favor.`;
    if (!d.entregaTipo) return 'Elige si pasas a recoger o lo quieres a domicilio.';
    if (!d.nombre) return mal(form.nombre, 'Escribe tu nombre.');
    if (d.tel.length !== 10) return mal(form.tel, 'Escribe tu número de WhatsApp a 10 dígitos.');
    if (d.entregaTipo === 'domicilio') {
      if (d.dir.calle.length < 3) return mal(form.calle, 'Escribe la calle de entrega.');
      if (!d.dir.num) return mal(form.numExt, 'Escribe el número exterior (si no tiene, pon “S/N”).');
      if (d.dir.col.length < 3) return mal(form.colonia, 'Escribe la colonia o fraccionamiento.');
      if (d.dir.cp.length !== 5) return mal(form.cp, 'Escribe tu código postal (5 dígitos).');
    }
    if (!d.fecha) return mal(form.fecha, 'Elige el día.');
    if (limitaHoy() && d.fecha === hoyYmd()) { const c = conflictosHoy([...cart])[0]; if (c) return textoConflicto(c) + '. Cambia la cantidad o elige otro día.'; }
    { const lib = libreDia(d.fecha), pz = d.items.reduce((a, i) => a + i.cant, 0); if (pz > lib) return textoCap(lib); }
    if (!d.hora || !horaElegida) return mal(form.hora, d.entregaTipo === 'domicilio' ? 'Elige el horario de entrega.' : 'Elige la hora.');
    if (!d.pago) return 'Elige la forma de pago.';
    return '';
  }
  function fechaTexto(f) { const [y, m, d] = f.split('-').map(Number), dt = new Date(y, m - 1, d); return `${DIAS[dt.getDay()]} ${d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m - 1]}`; }
  function mensajeWA(d, folio, porConfirmar) {
    // Mensaje que el cliente nos manda: claro, con etiquetas en negritas y pocos emojis
    const m2 = v => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const grupos = new Map();
    d.items.forEach(i => { const c = ((prod(i.id) || {}).categoria || 'Conchas').toUpperCase(); if (!grupos.has(c)) grupos.set(c, []); grupos.get(c).push(i); });
    const lineas = [];
    [...grupos].forEach(([c, its], n) => { if (n) lineas.push(''); lineas.push(`*${c}*`, ...its.map(i => `• ${i.cant}  ${i.nombre} - ${m2(i.cant * i.precio)}`)); });
    const tot = d.items.reduce((a, i) => a + i.cant * i.precio, 0), dom = d.entregaTipo === 'domicilio';
    const L = [`Hola 👋 Soy *${d.nombre}* y quiero hacer este pedido:`, '', ...lineas, dom ? `*Subtotal: ${m2(tot)}*` : `*Total: ${m2(tot)}*`, ''];
    if (dom) { L.push('• *Entrega:* a domicilio', `• *Dirección:* ${d.direccion}`); if (d.referencias) L.push(`• *Referencias:* ${d.referencias}`); L.push('• *Envío:* por cotizar ⏳'); }
    else L.push('• *Entrega:* paso a recoger en la tienda');
    L.push(`• *Día:* ${fechaTexto(d.fecha)}, ${d.horaFin ? 'de ' + bloqueTxt(hm(d.hora)) : hora12(hm(d.hora))}`, `• *Pago:* ${String(d.pago).toLowerCase()}`);
    if (d.notas) L.push(`• *Nota:* ${d.notas}`);
    if (porConfirmar) L.push('• *Disponibilidad:* por confirmar ⏳');
    L.push('', dom ? 'Quedo pendiente de la cotización del envío y del total. ¡Gracias!' : '¿Me confirman, por favor? ¡Gracias!');
    return L.join('\n');
  }
  const linkWA = txt => `https://wa.me/${C.whatsapp || '523341016194'}?text=${encodeURIComponent(txt)}`;
  // Botón flotante de dudas por WhatsApp (mensaje sin emojis: en WhatsApp de PC salían como signos raros): mensaje ya escrito (avisa si es fuera de horario) y la etiqueta "¿Dudas?" se oculta a los pocos segundos
  { const wf = $('#wa-flot'); if (wf) {
    const ponLink = () => { const abierto = abiertoEn(new Date(), minAhora()); wf.href = linkWA('Hola \u{1F44B}, Tira & Miga. Tengo una duda sobre un producto'); };
    ponLink(); wf.addEventListener('pointerdown', ponLink); wf.addEventListener('focus', ponLink);
  } }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#form-error'), btn = $('#btn-enviar'), falla = $('#envio-falla'); err.hidden = true; falla.hidden = true;
    if (pausa) { err.textContent = avisoPausa || 'Por ahora no estamos recibiendo pedidos en línea. Escríbenos por WhatsApp.'; err.hidden = false; return; }
    const d = datosForm(), m = validar(d);
    if (m) { err.textContent = m; err.hidden = false; return; }
    guardarCliente(d);
    btn.disabled = true; btn.classList.add('enviando'); $('#btn-enviar-t').textContent = 'Enviando…';
    let folio = '', registrado = false, porConfirmar = false;
    if (C.api && !d.web) {
      try {
        const r = await fetch(C.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion: 'pedido', pedido: d }) });
        const res = await r.json();
        if (!res.ok) { err.textContent = res.error || 'No se pudo enviar tu pedido. Inténtalo de nuevo.'; err.hidden = false; btn.classList.remove('enviando'); $('#btn-enviar-t').textContent = 'Realiza tu pedido'; revisarBoton(); if (res.stock || res.cap || /disponible|agot|quedan|lleno/i.test(res.error || '')) cargarMenu(); return; }
        folio = res.folio; registrado = true; porConfirmar = !!res.porConfirmar && d.fecha === hoyYmd();
      } catch (x) { registrado = false; }
    }
    const link = linkWA(mensajeWA(d, folio, porConfirmar));
    btn.classList.remove('enviando'); $('#btn-enviar-t').textContent = 'Realiza tu pedido';
    // Sin buzón configurado: el único canal es WhatsApp (como antes)
    if (!C.api) { cart.clear(); guardarCarrito(); pintarCarrito(); form.notas.value = ''; aplicarCliente(); revisarBoton(); cerrar(); toast('Abriendo WhatsApp…'); setTimeout(() => { location.href = link; }, 400); return; }
    // Falló el registro: NO se vacía el carrito; puede reintentar o mandarlo por WhatsApp
    if (!registrado && !d.web) { $('#falla-wa').href = link; falla.hidden = false; revisarBoton(); falla.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    // Registrado: pantalla de confirmación dentro de la página (no hace falta tener WhatsApp)
    const tot = d.items.reduce((a, i) => a + i.cant * i.precio, 0), dom = d.entregaTipo === 'domicilio';
    const diaTxt = ($('#sel-fecha option:checked') || {}).textContent || '', horaTxt = ($('#sel-hora option:checked') || {}).textContent || '';
    $('#ok-folio').textContent = folio ? `Folio ${folio}` : ''; $('#ok-folio').hidden = !folio;
    const telTxt = d.tel.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1\u00a0$2\u00a0$3');
    // A domicilio el pedido no es definitivo hasta que el cliente acepta el costo de envío
    $('#ok-t').textContent = dom ? '¡Recibimos tu solicitud!' : '¡Recibimos tu pedido!';
    // Un solo mensaje corto y claro (el envío y los datos para transferir se mandan por WhatsApp)
    const queMandamos = [dom && 'el costo del envío', d.pago === 'Transferencia' && 'los datos para transferir'].filter(Boolean);
    $('#ok-txt').textContent = `Te escribiremos por WhatsApp al ${telTxt}${porConfirmar ? ' en unos minutos' : ''} ${queMandamos.length ? 'con ' + queMandamos.join(' y ') : 'para confirmar tu pedido'}.`;
    const ex = $('#ok-extra'); ex.replaceChildren(); ex.hidden = true;
    const ul = $('#ok-resumen'); ul.replaceChildren();
    [['📅', `${diaTxt.split(' · ')[0]}${diaTxt.includes('·') ? ' ' + diaTxt.split(' · ')[1] : ''} · ${horaTxt}`], [dom ? '🛵' : '🏠', dom ? 'A domicilio' : 'Paso a recoger'], ['🧾', `${d.items.reduce((a, i) => a + i.cant, 0)} ${d.items.reduce((a, i) => a + i.cant, 0) === 1 ? 'pieza' : 'piezas'} · ${money(tot)}${dom ? ' + envío por confirmar' : ''}`], [d.pago === 'Transferencia' ? '🏦' : '💵', d.pago]]
      .forEach(([ic, tx]) => { const li = el('li'); li.append(el('span', null, ic), el('span', null, tx)); ul.append(li); });
    // Recoger: la dirección de la tienda como un renglón más del resumen, con su liga a Maps
    if (!dom && TIENDA.direccion) { const li = el('li'), t = el('span', null, TIENDA.direccion + ' '); if (TIENDA.mapa) { const a = el('a', 'link-flecha', 'Cómo llegar ↗'); a.href = TIENDA.mapa; a.target = '_blank'; a.rel = 'noopener'; t.append(a); } li.append(el('span', null, '📍'), t); ul.append(li); }
    cart.clear(); guardarCarrito(); pintarCarrito(); form.notas.value = ''; aplicarCliente(); revisarBoton();
    cerrar(); setTimeout(() => { const ok = $('#confirmado'); if (!ok.open) ok.showModal(); }, 200);
  });

  // Confirmación: cerrar con "Listo", con Esc o tocando fuera
  { const ok = $('#confirmado'), fin = () => { if (!ok.open) return; ok.classList.add('sale'); setTimeout(() => { ok.close(); ok.classList.remove('sale'); }, 170); };
    $('#ok-listo').onclick = fin; ok.addEventListener('cancel', e => { e.preventDefault(); fin(); }); ok.addEventListener('click', e => { if (e.target === ok) fin(); }); }

  // ---------- DiDi Food y Uber Eats: abrir la app del celular ----------
  // Android: intent:// abre la app instalada y, si no está, la página web (browser_fallback_url).
  // iPhone: los enlaces https de Uber Eats y DiDi abren la app sola si está instalada (enlaces universales).
  (() => {
    if (!/Android/i.test(navigator.userAgent)) return;
    const rutas = {
      'com.ubercab.eats': { host: 'www.ubereats.com', scheme: 'ubereats', path: 'store/browse?storeUUID=58d3c2d3-957d-40b4-9ea7-16bdb255949c&diningMode=DELIVERY', pkg: 'com.ubercab.eats' },
      'com.xiaojukeji.didi.global.customer': { host: 'www.didi-food.com', scheme: 'globalOneTravel', path: 'soda/businessPage?shopId=5764616005389913209&rsc_media=googlemap&ddlCode=q9TJD0&cId=food_googleMap1&channelId=food_googleMap&redirectType=2&dp_sub3=es-MX&dp_sub4=10&dp_sub5=52010100&dp_sub6=21.886537&dp_sub7=-102.234484&ddlcode=q9TJD0&openfrom=food_googleMap&ddl=new', pkg: 'com.didiglobal.passenger' }
    };
    document.querySelectorAll('.app-btn[data-android-package]').forEach(a => {
      const r = rutas[a.dataset.androidPackage], web = new URL(a.href);
      if (!r || web.hostname !== r.host) return;
      a.href = `intent://${r.path}#Intent;scheme=${r.scheme};package=${r.pkg};S.browser_fallback_url=${encodeURIComponent(web.href)};end`;
      a.removeAttribute('target');
    });
  })();

  // ---------- Inicio ----------
  // (la sección "Contacto" del pie se quitó: las dudas van por el botón flotante de WhatsApp)
  leerCarrito(); aplicarCliente(); pintarHorario(); pintarProgramar(); cargarMenu(); pintarCuando(); evento('visita');
  setInterval(() => { pintarProgramar(); pintarCuando(); }, 60000);
  setInterval(refrescarMenu, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescarMenu(); });
})();
