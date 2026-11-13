/* ===== Tira & Miga — configuración de la página =====
   Lo único que normalmente cambiarás aquí es "api": la dirección de tu buzón
   de Google (termina en /exec). Si "api" está vacío, la página sigue
   funcionando: los pedidos se mandan solo por WhatsApp. */
window.TM_CONFIG = {
  api: 'https://script.google.com/macros/s/AKfycbxJoiLIrP0w5jGY5XmA9HV8pPzUvM-hOyqrVAi8kzXPOtFOXshEVTj-YCAMd-tBGOYk/exec',
  whatsapp: '523341016194',
  // Días: 0 = domingo, 1 = lunes, 2 = martes … 6 = sábado
  diasCerrado: [2],
  abre: '17:00',
  cierra: '22:00',
  // Último pedido para HOY: hasta esta hora; después solo se puede pedir para otro día
  ultimoPedidoHoy: '21:00',
  // Minutos que necesitas para tener listo un pedido de hoy
  minutosPreparacion: 45,
  // Cuántos días adelante se puede apartar
  diasAdelante: 14
};
