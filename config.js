/* ===== Tira & Miga — configuración de la página =====
   Lo único que normalmente cambiarás aquí es "api": la dirección de tu buzón
   de Google (termina en /exec). Si "api" está vacío, la página sigue
   funcionando: los pedidos se mandan solo por WhatsApp.
   El horario de aquí es solo de respaldo: la página usa el que publicas en la app. */
window.TM_CONFIG = {
  api: 'https://script.google.com/macros/s/AKfycbxJoiLIrP0w5jGY5XmA9HV8pPzUvM-hOyqrVAi8kzXPOtFOXshEVTj-YCAMd-tBGOYk/exec',
  whatsapp: '523341016194',
  // Tienda para "Paso a recoger" (se muestra al cliente al elegir recoger y al terminar su pedido)
  tienda: { direccion: 'Av. Colinas de San Patricio 505, Colinas de San Patricio, C.P. 20196, Aguascalientes, Ags.', mapa: 'https://www.google.com/maps/dir/?api=1&destination=21.8865077%2C-102.2344649' },
  // Datos para transferencia (los que pongas en la app los reemplazan)
  datosPago: 'CLABE: 170180019435675074\nBanco: REVOLUT\nA nombre: Esteban Cancino',
  // Días: 0 = domingo, 1 = lunes, 2 = martes … 6 = sábado
  diasCerrado: [],
  abre: '17:00',
  cierra: '22:45',
  // Último pedido para HOY: hasta esta hora; después solo se puede pedir para otro día
  ultimoPedidoHoy: '22:30',
  // Minutos que necesitas para tener listo un pedido de hoy
  minutosPreparacion: 0,
  // Cuántos días adelante se puede apartar
  diasAdelante: 14,
  // Productos "sobre pedido" (los marcas en la app, p. ej. miniconchas): días de anticipación y piezas mínimas
  sobrePedido: { diasAnticipacion: 1, minimo: 1 }
};
