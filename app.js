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
  let STK = {}, stockFecha = ''; // stock de HOY que publica la app (piezas por concha base)
  const cart = new Map();      // id -> cantidad
  const leerCarrito = () => { try { const o = JSON.parse(localStorage.getItem('tm-carrito') || '{}'); for (const [k, v] of Object.entries(o)) if (v > 0) cart.set(k, Math.min(MAXQ, v | 0)); } catch (e) {} };
  const guardarCarrito = () => { try { localStorage.setItem('tm-carrito', JSON.stringify(Object.fromEntries(cart))); } catch (e) {} };
  // ¿Para cuándo es el pedido? Se elige una sola vez (chip en las pestañas o "Día" en el carrito) y manda en toda la página
  let fechaSel = '', horaSel = ''; try { fechaSel = localStorage.getItem('tm-fecha') || ''; horaSel = localStorage.getItem('tm-hora') || ''; } catch (e) {}
  const fechaPedido = () => { const fs = fechasDisponibles(); if (!fs.length) return ''; if (!fs.some(o => o.f === fechaSel)) fechaSel = fs[0].f; return fechaSel; };
  const paraHoy = () => limitaHoy() && fechaPedido() === hoyYmd(); // true = el pedido es para hoy y aplica el stock del día
  const minTxt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; // 630 → "10:30"
  // Hora elegida (valor "HH:MM"); si ya no cabe en el horario del día, la primera disponible
  const horaPedido = () => { const hs = horasDe(fechaPedido() || hoyYmd()).map(minTxt); if (!hs.length) return ''; if (!hs.includes(horaSel)) horaSel = hs[0]; return horaSel; };
  function ponFecha(f, origen, hora) {
    if (!fechasDisponibles().some(o => o.f === f)) return;
    const cambia = f !== fechaSel; fechaSel = f; if (hora) horaSel = hora;
    try { localStorage.setItem('tm-fecha', f); if (hora) localStorage.setItem('tm-hora', hora); } catch (e) {}
    if (origen !== 'drawer' && $('#sel-fecha')) { $('#sel-fecha').value = f; llenarHoras(); }
    pintarCuando(); if (!cambia) return;
    pintarStockTags(); pintarCarrito(); if (typeof revisarBoton === 'function') revisarBoton();
  }
  const leerCliente = () => { try { return JSON.parse(localStorage.getItem('tm-cliente') || '{}'); } catch (e) { return {}; } };
  const guardarCliente = d => { try { localStorage.setItem('tm-cliente', JSON.stringify({ nombre: d.nombre, tel: d.tel, direccion: d.direccion, entregaTipo: d.entregaTipo, pago: d.pago })); } catch (e) {} };

  // ---------- Métricas: cuántos visitan, agregan, abren el pedido (una vez por visita) ----------
  function evento(t) {
    if (!C.api) return;
    try { if (sessionStorage.getItem('tm-ev-' + t)) return; sessionStorage.setItem('tm-ev-' + t, '1'); } catch (e) {}
    try { fetch(C.api, { method: 'POST', mode: 'no-cors', keepalive: true, body: JSON.stringify({ accion: 'evento', t }) }).catch(() => {}); } catch (e) {}
  }

  const prod = id => menu.find(p => p.id === id);
  // ---------- Stock de hoy (solo limita pedidos PARA HOY) ----------
  const hoyYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const limitaHoy = () => !!stockFecha && stockFecha === hoyYmd() && Object.keys(STK).length > 0;
  // Cuántas piezas de "id" caben hoy, tomando en cuenta lo demás del carrito (sabores que comparten la misma concha base)
  function maxHoy(id, entradas) {
    const p = prod(id); if (!limitaHoy() || !p || !p.usa.length) return Infinity;
    const uso = {}; for (const [k, q] of entradas) { if (k === id) continue; const o = prod(k); if (o) o.usa.forEach(u => { uso[u.id] = (uso[u.id] || 0) + q * u.por; }); }
    let m = Infinity; p.usa.forEach(u => { if (u.id in STK) m = Math.min(m, Math.floor((STK[u.id] - (uso[u.id] || 0)) / u.por + 1e-9)); });
    return Math.max(0, m);
  }
  // Bases que no alcanzan para hoy con lo que hay en el carrito: [{ disp, ids }]
  function conflictosHoy(entradas) {
    if (!limitaHoy()) return [];
    const uso = {}, quien = {};
    for (const [k, q] of entradas) { const o = prod(k); if (!o) continue; o.usa.forEach(u => { if (!(u.id in STK)) return; uso[u.id] = (uso[u.id] || 0) + q * u.por; (quien[u.id] = quien[u.id] || []).push({ id: k, por: u.por }); }); }
    return Object.keys(uso).filter(b => uso[b] > STK[b] + 1e-9).map(b => ({ disp: Math.max(0, Math.floor(STK[b] / Math.min(...quien[b].map(x => x.por)) + 1e-9)), ids: quien[b].map(x => x.id) }));
  }
  const textoConflicto = c => c.ids.length > 1 ? `Entre ${c.ids.map(i => prod(i).nombre).join(' y ')} solo alcanzan ${c.disp} para hoy (salen de la misma concha)`
    : c.disp <= 0 ? `${prod(c.ids[0]).nombre} ya se agotó para hoy` : `Para hoy solo ${c.disp === 1 ? 'queda 1' : 'quedan ' + c.disp} de ${prod(c.ids[0]).nombre}`;
  // Tope de piezas que se pueden agregar ahora (stock de hoy menos lo que ya está en el carrito); si hoy no se limita, MAXQ
  const topeHoy = p => { if (!p || p.agotado) return 0; if (!paraHoy()) return MAXQ; return Math.max(0, Math.min(MAXQ, quedanHoy(p.id))); };
  const enLetraT = n => ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'][n] || String(n);
  const quedanHoy = id => maxHoy(id, [...cart]) - (cart.get(id) || 0); // cuántas más puede agregar para hoy
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

  function horasDe(fecha) {
    const [y, mo, da] = fecha.split('-').map(Number), d = new Date(y, mo - 1, da);
    if (!abiertoDia(d)) return [];
    const out = [], hoy = fecha === ymd(new Date()), min = Math.ceil((minAhora() + (H.prepMin || 45)) / 30) * 30;
    for (const t of dia(d).t) for (let m = hoy ? Math.max(t.a, min) : t.a; m <= t.c - 30; m += 30) if (!out.includes(m)) out.push(m);
    return out;
  }
  function fechasDisponibles() {
    const out = [], hoy = new Date();
    for (let i = 0; i <= (C.diasAdelante || 14); i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
      if (!abiertoDia(d)) continue;
      const f = ymd(d);
      if (i === 0 && (minAhora() > cierreFinal(d) - (H.ultimoMin ?? 60) || !horasDe(f).length)) continue;
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
    H = { dias: h.dias.map(x => ({ a: !!(x && x.a), t: tramosDe(x || {}) })), ultimoMin: Number(h.ultimoMin ?? 60), prepMin: Number(h.prepMin ?? 45) };
  }

  // ---------- Menú ----------
  function normalizar(lista) {
    return lista.map((p, i) => ({
      id: String(p.id), nombre: String(p.nombre || ''), precio: Number(p.precio) || 0,
      seccion: p.seccion || 'Rellenas', categoria: p.categoria || 'Conchas', fotoV: p.fotoV || '', orden: Number(p.orden ?? i) || 0, agotado: !!p.agotado, destacado: !!p.destacado, desc: p.desc || '',
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
    const barra = $('#barra-pedido'), dest = (barra && !barra.hidden && barra.offsetParent ? $('#bp-ico') : $('#cart-open')).getBoundingClientRect(), o = img.getBoundingClientRect();
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
    // ⭐ Las favoritas (las marcas en la app): van primero
    // Solo entran las que sí se pueden pedir hoy (no agotadas y con stock); si ninguna, la sección no se muestra
    const hayHoy = p => !p.agotado && !(paraHoy() && maxHoy(p.id, []) <= 0);
    const favs = menu.filter(p => p.destacado && hayHoy(p)).sort((a, b) => a.orden - b.orden);
    const favIds = new Set(favs.map(p => p.id));
    const lista = claves.map(s => ({ s, info: K.secciones[s] || { eyebrow: '', titulo: s, texto: '' }, prods: grupos.get(s), pre: '' }));
    if (favs.length) lista.unshift({ s: 'Favoritas', info: { eyebrow: 'Lo más pedido', titulo: 'Las favoritas', texto: 'Las que más se piden. Si no sabes cuál elegir, empieza por aquí.' }, prods: favs, pre: 'fav-', fav: true });
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
    fi.append(img); if (p.agotado) fi.append(el('span', 'agotado-tag', 'Agotado hoy'));
    const stg = el('span', 'agotado-tag stk-tag'); stg.hidden = true; fi.append(stg);
    const fv = el('span', 'fav-tag', '★ Favorita'); fv.title = 'Una de las más pedidas'; fi.append(fv);
    fi.append(el('span', 'ver-mas', 'Ver')); fi.tabIndex = 0; fi.setAttribute('role', 'button'); fi.setAttribute('aria-label', 'Ver detalles de ' + p.nombre);
    fi.onclick = () => abrirDetalle(p); fi.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalle(p); } };
    const b = el('div', 'card-body'), top = el('div', 'card-top'), h3 = el('h3'), tb = el('button', 'card-tit', p.nombre);
    tb.type = 'button'; tb.onclick = () => abrirDetalle(p); h3.append(tb);
    top.append(h3, el('span', 'precio', money(p.precio)));
    b.append(top);
    if (desc(p)) b.append(el('p', 'card-desc', desc(p)));
    const acc = el('div', 'card-acc');
    let q = 1;
    const st = el('div', 'stepper'), menos = el('button', null, '−'), out = el('output', null, '1'), mas = el('button', null, '+');
    menos.type = mas.type = 'button'; menos.setAttribute('aria-label', 'Una pieza menos de ' + p.nombre); mas.setAttribute('aria-label', 'Una pieza más de ' + p.nombre);
    const upd = () => { const t = topeHoy(p); if (q > t) q = Math.max(1, t); out.textContent = q; menos.disabled = q <= 1 || t <= 0; mas.disabled = q >= t; mas.title = t < MAXQ && t > 0 && q >= t ? `Disponible hoy: ${enLetraT(t)}` : ''; };
    c._upd = upd; // se vuelve a revisar cuando cambia el carrito o el stock
    menos.onclick = () => { q = Math.max(1, q - 1); upd(); };
    mas.onclick = () => { const t = topeHoy(p); if (q >= t) { toast(t <= 0 ? `${p.nombre} · Agotada para hoy` : `${p.nombre} · Disponible hoy: ${enLetraT(t)}`); return; } q = Math.min(t, q + 1); upd(); };
    st.append(menos, out, mas); upd();
    const add = el('button', 'add', p.agotado ? 'Agotado' : 'Añadir');
    add.type = 'button'; add.disabled = p.agotado || pausa;
    let ocupado = false;
    add.onclick = () => {
      const t = topeHoy(p);
      if (ocupado || pausa || p.agotado || t <= 0) return; // mientras dice "Añadido" no vuelve a sumar; con tope 0 no agrega
      ocupado = true;
      add.textContent = '✓ Añadido'; add.classList.add('ok'); add.setAttribute('aria-disabled', 'true');
      setTimeout(() => { add.classList.remove('ok'); add.removeAttribute('aria-disabled'); ocupado = false; pintarStockTags(); }, 1300);
      agregar(p, Math.min(q, t), img); q = 1; upd();
    };
    acc.append(st, add); b.append(acc);
    c.append(fi, b);
    return c;
  }
  // Etiqueta en la foto: "Hoy quedan 2" / "Agotado para hoy" (solo si hoy se puede pedir)
  function pintarStockTags() {
    const hoy = paraHoy();
    document.querySelectorAll('.card[data-id]').forEach(c => {
      const p = prod(c.dataset.id), t = c.querySelector('.stk-tag'); if (!t || !p) return;
      const r = hoy && !p.agotado ? quedanHoy(p.id) : Infinity;
      // Sin stock para hoy: se ve en gris y ya NO se puede agregar (el cliente puede cambiar el día)
      const sinHoy = hoy && !p.agotado && r <= 0; // sin stock, o el carrito ya tiene las últimas
      if (c._upd) c._upd();
      c.classList.toggle('sin-hoy', sinHoy);
      const ad = c.querySelector('.add'); if (ad && !ad.classList.contains('ok')) { ad.disabled = p.agotado || pausa || sinHoy; ad.textContent = p.agotado ? 'Agotado' : sinHoy ? 'Agotado hoy' : 'Añadir'; }
      if (sinHoy) { t.hidden = false; t.textContent = 'Agotado hoy'; t.classList.add('cero'); return; }
      t.hidden = !(r <= 5); if (!t.hidden) { t.textContent = `Hoy ${r === 1 ? 'queda 1' : 'quedan ' + r}`; t.classList.remove('cero'); t.classList.toggle('uno', r === 1); }
    });
  }
  function agregar(p, q, img) {
    const r = paraHoy() ? quedanHoy(p.id) : Infinity;
    q = Math.min(q, topeHoy(p)); if (q <= 0) return;
    cart.set(p.id, Math.min(MAXQ, (cart.get(p.id) || 0) + q)); guardarCarrito(); pintarCarrito(); evento('agrega');
    if (sinMov || !img || !img.animate) { const b = $('#cart-count'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } else volarAlCarrito(img);
    // "Disponible hoy: dos" (en palabras del 1 al 10)
    const enLetra = n => ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'][n] || String(n);
    if (q > r) { const tot = Math.max(0, r + (cart.get(p.id) || 0) - q); toast(tot <= 0 ? `${p.nombre} · Agotada hoy. Agregada para pedir otro día.` : `${p.nombre} · Disponible hoy: ${enLetra(tot)}`); }
    else toast(`${q} × ${p.nombre} en tu pedido`);
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
  const detUpd = () => { const t = topeHoy(detP); if (detQ > t) detQ = Math.max(1, t); $('#det-q').textContent = detQ; $('#det-menos').disabled = detQ <= 1; $('#det-mas').disabled = detQ >= t;
    const a = $('#det-add'); a.disabled = !detP || detP.agotado || pausa || !!det.dataset.sinHoy; a.textContent = detP && detP.agotado ? 'Agotado' : pausa ? 'Pedidos en pausa' : det.dataset.sinHoy ? 'Agotado hoy' : `Agregar · ${money(detQ * (detP ? detP.precio : 0))}`;
  };
  function abrirDetalle(p) {
    detP = p; detQ = 1;
    const im = $('#det-img'); im.src = foto(p); im.alt = p.nombre;
    const sinHoy = !p.agotado && paraHoy() && quedanHoy(p.id) <= 0;
    det.classList.toggle('agotado', p.agotado || sinHoy); $('#det-ag').hidden = !(p.agotado || sinHoy); det.dataset.sinHoy = sinHoy ? '1' : '';
    $('#det-sec').textContent = p.seccion; $('#det-n').textContent = p.nombre; $('#det-p').textContent = money(p.precio);
    $('#det-d').textContent = desc(p); $('#det-d').hidden = !desc(p);
    const r = !p.agotado && paraHoy() ? quedanHoy(p.id) : Infinity, ds = $('#det-stk');
    ds.hidden = !(r <= 5); if (!ds.hidden) ds.textContent = r <= 0 ? 'Agotado para hoy · cambia el día para pedirla' : `Para hoy ${r === 1 ? 'queda 1 pieza' : 'quedan ' + r + ' piezas'}`;
    detUpd();
    if (!det.open) det.showModal();
  }
  function cerrarDetalle() { if (!det.open) return; det.classList.add('sale'); setTimeout(() => { det.close(); det.classList.remove('sale'); }, 170); }
  $('#det-menos').onclick = () => { detQ = Math.max(1, detQ - 1); detUpd(); };
  $('#det-mas').onclick = () => { const t = topeHoy(detP); if (detQ >= t) { toast(`${detP.nombre} · Disponible hoy: ${enLetraT(t)}`); return; } detQ = Math.min(t, detQ + 1); detUpd(); };
  $('#det-x').onclick = cerrarDetalle;
  det.addEventListener('cancel', e => { e.preventDefault(); cerrarDetalle(); });
  det.addEventListener('click', e => { if (e.target === det) cerrarDetalle(); });
  $('#det-add').onclick = () => { if (!detP || detP.agotado || pausa || topeHoy(detP) <= 0) return; agregar(detP, Math.min(detQ, topeHoy(detP)), $('#det-img')); cerrarDetalle(); };

  // ---------- Fuera de horario: se puede programar ----------
  function pintarProgramar() {
    const av = $('#aviso-cerrado'), np = $('#nota-prog'), hoy = ymd(new Date()), fs = fechasDisponibles();
    const prox = fs[0], d = new Date(), m = minAhora(), abiertoAhora = abiertoEn(d, m);
    if (pausa || !prox || prox.f === hoy) { av.hidden = true; np.hidden = true; return; }
    const h = horasDe(prox.f)[0], et = prox.txt.split(' · ')[0].toLowerCase();
    const cuando = `${et === 'mañana' ? 'mañana' : 'el ' + et}${h != null ? ' a las ' + hora12(h) : ''}`;
    av.replaceChildren(el('b', null, abiertoAhora ? '⏰ Por hoy ya no alcanzamos a preparar más pedidos.' : '🌙 Ahora estamos cerrados,'),
      (abiertoAhora ? ' Puedes' : ' pero puedes') + ' dejar tu pedido programado desde ahorita. Lo más pronto: ', el('b', null, cuando + '.'));
    av.hidden = false;
    np.textContent = `📅 Tu pedido quedará programado. Lo más pronto es ${cuando}; elige el día y la hora que prefieras.`; np.hidden = false;
  }

  // La página se actualiza sola (stock, agotados, precios) cada minuto y al volver a la pestaña; solo redibuja si algo cambió
  let firmaMenu = '';
  async function refrescarMenu() {
    if (!C.api || document.hidden) return;
    try {
      const d = await (await fetch(C.api + '?accion=menu', { cache: 'no-store' })).json(); if (!d.ok) return;
      const f = JSON.stringify([d.pausa, d.avisoPausa, d.envio, d.horario, d.stock, d.stockFecha, d.productos]);
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
      firmaMenu = JSON.stringify([d.pausa, d.avisoPausa, d.envio, d.horario, d.stock, d.stockFecha, d.productos]);
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
      STK = d.stock && typeof d.stock === 'object' ? d.stock : {}; stockFecha = d.stockFecha || '';
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
      const mid = el('div'); mid.append(el('div', 'ci-n', p.nombre), el('div', 'ci-p', `${money(p.precio)} c/u`));
      if (drawer.open && esParaHoy()) { const c = conflictosHoy([...cart]).find(x => x.ids.includes(id)); if (c) { li.classList.add('excede'); mid.append(el('div', 'ci-stk', c.ids.length > 1 ? `Comparte concha: para hoy alcanzan ${c.disp} en total` : c.disp <= 0 ? 'Agotado para hoy' : `Para hoy solo ${c.disp === 1 ? 'queda 1' : 'quedan ' + c.disp}`)); } }
      const st = el('div', 'stepper'), a = el('button', null, '−'), inp = el('input'), b = el('button', null, '+');
      a.type = b.type = 'button'; a.setAttribute('aria-label', 'Menos ' + p.nombre); b.setAttribute('aria-label', 'Más ' + p.nombre);
      Object.assign(inp, { type: 'number', min: 1, max: MAXQ, value: q, inputMode: 'numeric' }); inp.setAttribute('aria-label', 'Cantidad de ' + p.nombre);
      const tope = drawer.open && esParaHoy() ? Math.max(q, maxHoy(id, [...cart])) : MAXQ;
      a.disabled = q <= 1; b.disabled = q >= Math.min(MAXQ, tope);
      a.onclick = () => { cart.set(id, Math.max(1, q - 1)); guardarCarrito(); pintarCarrito(); };
      b.onclick = () => { cart.set(id, Math.min(MAXQ, q + 1)); guardarCarrito(); pintarCarrito(); };
      inp.onchange = () => { const v = Math.floor(Number(inp.value)); if (v >= 1 && v <= MAXQ) cart.set(id, v); guardarCarrito(); pintarCarrito(); };
      st.append(a, inp, b);
      const r = el('div', 'ci-r'), del = el('button', 'ci-del'), ctrl = el('div', 'ci-ctrl'); del.type = 'button';
      del.setAttribute('aria-label', 'Quitar ' + p.nombre); del.title = 'Quitar';
      del.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';
      del.onclick = () => { cart.delete(id); guardarCarrito(); pintarCarrito(); };
      ctrl.append(st, del);
      r.append(el('strong', null, money(q * p.precio)), ctrl);
      li.append(img, mid, r); ul.append(li);
    }
    const { pz, t } = totales();
    $('#cart-count').textContent = pz;
    $('#cart-open').setAttribute('aria-label', `Ver tu pedido, ${pz} ${pz === 1 ? 'pieza' : 'piezas'}`);
    $('#drawer-count').textContent = `${pz} ${pz === 1 ? 'pieza' : 'piezas'}`;
    $('#cart-total').textContent = money(t);
    $('#cart-empty').hidden = cart.size > 0;
    $('#form-pedido').hidden = cart.size === 0;
    const bp = $('#barra-pedido');
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
    llenarHoras();
  }
  // ---------- "Para hoy | Agendar" (barra de pestañas) ----------
  const hayHoyDisponible = () => fechasDisponibles().some(o => o.f === hoyYmd());
  function pintarCuando() {
    const box = $('#cuando'); if (!box) return;
    const fs = fechasDisponibles(), f = fechaPedido(), hoy = hoyYmd(), esHoy = f === hoy;
    box.hidden = !fs.length || pausa;
    const bh = $('#cu-hoy'), ba = $('#cu-agendar');
    bh.disabled = !hayHoyDisponible(); bh.title = bh.disabled ? 'Por hoy ya no recibimos pedidos' : '';
    bh.classList.toggle('on', esHoy); ba.classList.toggle('on', !esHoy);
    bh.setAttribute('aria-pressed', esHoy); ba.setAttribute('aria-pressed', !esHoy);
    const cur = fs.find(o => o.f === f);
    $('#cu-agendar-t').textContent = esHoy || !cur ? 'Agendar' : `${cur.txt.split(' · ')[0]} · ${hora12(hm(horaPedido()))}`;
    moverBurbuja();
  }
  // Burbuja oscura que se desliza de "Para hoy" a "Agendar" (y cambia de ancho con el texto)
  function moverBurbuja() {
    const bb = $('#cu-bubble'), on = $('#cuando .cu-btn.on'); if (!bb || !on) return;
    bb.style.width = on.offsetWidth + 'px'; bb.style.transform = `translateX(${on.offsetLeft}px)`;
    if (!bb.classList.contains('lista')) requestAnimationFrame(() => requestAnimationFrame(() => bb.classList.add('lista')));
  }
  addEventListener('resize', moverBurbuja); if (document.fonts && document.fonts.ready) document.fonts.ready.then(moverBurbuja);
  $('#cu-hoy').onclick = () => { if (!hayHoyDisponible()) return; const ya = fechaPedido() === hoyYmd(); ponFecha(hoyYmd()); if (!ya) toast('Tu pedido es para hoy'); };
  $('#cu-agendar').onclick = () => abrirAgenda();

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
  function cerrarAgenda() { if (!agenda.open) return; agenda.classList.add('sale'); setTimeout(() => { agenda.close(); agenda.classList.remove('sale'); }, 170); }
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
      if (!ok) { const dd = new Date(y, m, d); b.title = dd < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) ? '' : !abiertoDia(dd) ? 'Cerrado' : f === ymd(hoy) ? 'Por hoy ya no recibimos pedidos' : 'Fuera del plazo para agendar'; }
      b.onclick = () => { agF = f; const hs = horasDe(f).map(minTxt); if (!hs.includes(agH)) agH = hs[0] || ''; pintarCal(); pintarHorasAg(); };
      g.append(b);
    }
  }
  function pintarHorasAg() {
    const box = $('#ag-horas'); box.replaceChildren();
    const d = fechaDeYmd(agF), hs = horasDe(agF);
    const tramos = abiertoDia(d) ? dia(d).t.map(t => `${hora12(t.a)} – ${hora12(t.c)}`).join(' y ') : 'cerrado';
    $('#ag-horario').textContent = `${DIAS[d.getDay()][0].toUpperCase() + DIAS[d.getDay()].slice(1)} ${d.getDate()} ${MESES[d.getMonth()]} · ${tramos}`;
    if (!hs.length) box.append(el('p', 'muted small', 'No hay horas disponibles ese día.'));
    for (const mnt of hs) {
      const v = minTxt(mnt), b = el('button', 'hora' + (v === agH ? ' on' : ''), hora12(mnt)); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', v === agH);
      b.onclick = () => { agH = v; pintarHorasAg(); };
      box.append(b);
    }
    const ok = $('#ag-ok'), cur = fechasDisponibles().find(o => o.f === agF);
    ok.disabled = !agF || !agH; ok.textContent = ok.disabled ? 'Agendar' : `Agendar para ${cur ? cur.txt.split(' · ')[0].toLowerCase() : agF} · ${hora12(hm(agH))}`;
  }
  $('#ag-ok').onclick = () => { if (!agF || !agH) return; const cur = fechasDisponibles().find(o => o.f === agF); ponFecha(agF, null, agH); cerrarAgenda(); toast(`📅 Pedido agendado para ${cur ? cur.txt.toLowerCase() : agF}, ${hora12(hm(agH))}`); };
  $('#ag-x').onclick = $('#ag-cancel').onclick = cerrarAgenda;
  $('#cal-prev').onclick = () => { agMes = new Date(agMes.getFullYear(), agMes.getMonth() - 1, 1); pintarCal(); };
  $('#cal-next').onclick = () => { agMes = new Date(agMes.getFullYear(), agMes.getMonth() + 1, 1); pintarCal(); };
  agenda.addEventListener('cancel', e => { e.preventDefault(); cerrarAgenda(); });
  agenda.addEventListener('click', e => { if (e.target === agenda) cerrarAgenda(); });

  function llenarHoras() {
    const sel = $('#sel-hora'); sel.replaceChildren();
    for (const m of horasDe($('#sel-fecha').value)) { const op = el('option', null, hora12(m)); op.value = minTxt(m); sel.append(op); }
    const h = $('#sel-fecha').value === fechaPedido() ? horaPedido() : ''; if ([...sel.options].some(o => o.value === h)) sel.value = h;
  }
  $('#sel-hora').onchange = () => { horaSel = $('#sel-hora').value; try { localStorage.setItem('tm-hora', horaSel); } catch (e) {} pintarCuando(); };
  $('#sel-fecha').onchange = () => { $('#stk-dia').hidden = true; ponFecha($('#sel-fecha').value, 'drawer'); llenarHoras(); pintarCarrito(); };
  const ponDir = () => { $('#campo-dir').hidden = form.entregaTipo.value !== 'domicilio'; };
  form.addEventListener('change', e => { if (e.target.name === 'entregaTipo') ponDir(); });
  const esParaHoy = paraHoy; // misma regla en el carrito que en el menú
  const excedidos = () => esParaHoy() ? [...new Set(conflictosHoy([...cart]).flatMap(c => c.ids))] : [];
  const listoParaPedir = () => form.nombre.value.trim().length > 0 && form.tel.value.replace(/\D/g, '').length === 10;
  function revisarBoton() {
    const ok = listoParaPedir(), ex = excedidos().length > 0;
    $('#btn-enviar').disabled = !ok || ex; $('#falta-datos').hidden = ok;
    const a = $('#stk-aviso'); if (a) { a.hidden = !ex; if (ex) a.textContent = '⚠️ Para hoy no alcanza el stock de lo marcado en rojo. Baja la cantidad o elige otro día.'; }
  }
  form.addEventListener('input', e => { if (e.target.name === 'nombre' || e.target.name === 'tel') revisarBoton(); });
  // 1) Si ya pidió antes, sus datos aparecen llenos (se guardan solo en su celular)
  let clienteAplicado = false;
  function aplicarCliente() {
    const c = leerCliente();
    if (!clienteAplicado) {
      clienteAplicado = true;
      if (c.nombre) form.nombre.value = c.nombre; if (c.tel) form.tel.value = fmtTel(String(c.tel)); if (c.direccion) form.direccion.value = c.direccion;
      if (c.pago && [...form.pago.options].some(o => o.value === c.pago)) form.pago.value = c.pago;
    }
    if (c.entregaTipo === 'domicilio' && conEnvio && !form.dataset.tocado) form.entregaTipo.value = 'domicilio';
    if (!conEnvio && form.entregaTipo.value === 'domicilio') form.entregaTipo.value = 'recoge';
    ponDir();
    const sal = $('#saludo'); sal.hidden = !(c.nombre && c.tel);
    if (!sal.hidden) $('#saludo-t').textContent = `👋 ¡Hola de nuevo, ${c.nombre.split(' ')[0]}! Ya llenamos tus datos.`;
    revisarBoton();
  }
  form.addEventListener('change', e => { if (e.target.name === 'entregaTipo') form.dataset.tocado = '1'; });
  $('#saludo-no').onclick = () => {
    try { localStorage.removeItem('tm-cliente'); localStorage.removeItem('tm-ultimo'); } catch (e) {}
    form.nombre.value = form.tel.value = form.direccion.value = ''; form.pago.selectedIndex = 0; form.entregaTipo.value = 'recoge'; ponDir();
    $('#saludo').hidden = true; revisarBoton(); form.nombre.focus();
  };

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
    if (limitaHoy() && d.fecha === hoyYmd()) { const c = conflictosHoy([...cart])[0]; if (c) return textoConflicto(c) + '. Cambia la cantidad o elige otro día.'; }
    if (!d.hora) return mal(form.hora, 'Elige la hora.');
    return '';
  }
  function fechaTexto(f) { const [y, m, d] = f.split('-').map(Number), dt = new Date(y, m - 1, d); return `${DIAS[dt.getDay()]} ${d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m - 1]}`; }
  function mensajeWA(d, folio) {
    // Mensaje que el cliente nos manda: claro, con etiquetas en negritas y pocos emojis
    const m2 = v => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const grupos = new Map();
    d.items.forEach(i => { const c = ((prod(i.id) || {}).categoria || 'Conchas').toUpperCase(); if (!grupos.has(c)) grupos.set(c, []); grupos.get(c).push(i); });
    const lineas = [];
    [...grupos].forEach(([c, its], n) => { if (n) lineas.push(''); lineas.push(`*${c}*`, ...its.map(i => `• ${i.cant}  ${i.nombre} - ${m2(i.cant * i.precio)}`)); });
    const tot = d.items.reduce((a, i) => a + i.cant * i.precio, 0), dom = d.entregaTipo === 'domicilio';
    const L = [`Hola 👋 Soy *${d.nombre}* y quiero hacer este pedido:`, '', ...lineas, dom ? `*Subtotal: ${m2(tot)}*` : `*Total: ${m2(tot)}*`, ''];
    if (dom) L.push('• *Entrega:* a domicilio', `• *Dirección:* ${d.direccion}`, '• *Envío:* por cotizar ⏳');
    else L.push('• *Entrega:* paso a recoger');
    L.push(`• *Día:* ${fechaTexto(d.fecha)}, ${hora12(hm(d.hora))}`, `• *Pago:* ${String(d.pago).toLowerCase()}`);
    if (d.notas) L.push(`• *Nota:* ${d.notas}`);
    L.push('', dom ? 'Quedo pendiente de la cotización del envío y del total. ¡Gracias!' : '¿Me confirman, por favor? ¡Gracias!');
    return L.join('\n');
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
        if (!res.ok) { err.textContent = res.error || 'No se pudo enviar tu pedido. Inténtalo de nuevo.'; err.hidden = false; btn.classList.remove('enviando'); $('#btn-enviar-t').textContent = 'Realiza tu pedido'; revisarBoton(); if (res.stock || /disponible|agot|quedan/i.test(res.error || '')) cargarMenu(); return; }
        folio = res.folio; registrado = true;
      } catch (x) { registrado = false; }
    }
    const link = linkWA(mensajeWA(d, folio));
    cart.clear(); guardarCarrito(); pintarCarrito(); form.notas.value = ''; aplicarCliente();
    btn.classList.remove('enviando'); $('#btn-enviar-t').textContent = 'Realiza tu pedido'; revisarBoton();
    cerrar();
    toast(folio ? `¡Pedido ${folio} recibido! Abriendo WhatsApp…` : 'Abriendo WhatsApp…');
    setTimeout(() => { location.href = link; }, 400);
  });

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
  $('#wa-contacto').href = linkWA('Hola, Tira & Miga. Me gustaría hacer un pedido de conchas. ¿Qué sabores tienen disponibles?');
  leerCarrito(); aplicarCliente(); pintarHorario(); pintarProgramar(); cargarMenu(); pintarCuando(); evento('visita');
  setInterval(() => { pintarProgramar(); pintarCuando(); }, 60000);
  setInterval(refrescarMenu, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescarMenu(); });
})();
