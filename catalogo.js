/* ===== Tira & Miga — fotos, descripciones y menú de respaldo =====
   La app publica nombres, precios y agotados. Aquí viven las fotos y
   descripciones de cada producto (por su clave de la app). Si la app publica
   un producto que no está aquí, se muestra con la foto general.
   "menuRespaldo" es lo que se ve mientras carga el menú en vivo, o si no hay
   conexión con el buzón. */
window.TM_CATALOGO = {
  fotoGeneral: 'assets/conchas-surtidas.webp',
  secciones: {
    Rellenas: { eyebrow: 'Un centro lleno de sabor', titulo: 'Gourmet rellenas', texto: '' },
    Tradicionales: { eyebrow: 'Los clásicos siempre se antojan', titulo: 'Tradicionales gourmet', texto: 'Conchas gourmet sin relleno. Disfruta nuestros clásicos de chocolate y vainilla.' },
    Especiales: { eyebrow: 'De temporada', titulo: 'Especiales', texto: '' }
  },
  productos: {
    'r_concha-capuchino': { foto: 'assets/capuchino-luz-natural.webp', desc: 'Costra chocolatosa con un corazón de crema irlandesa, equilibrando la intensidad del café tostado y el cacao.' },
    'r_concha-oreo': { foto: 'assets/oreo-luz-natural.webp', desc: 'Centro cremoso de galleta Oreo coronado con una costra crujiente de trocitos de galleta.' },
    'r_concha-frutos-rojos': { foto: 'assets/frutos-rojos-luz-natural.webp', desc: 'Miga ligera que abraza una compota artesanal de frutos rojos sobre una suave base de crema.' },
    'r_concha-crema-pastelera': { foto: 'assets/crema-pastelera-luz-natural.webp', desc: 'Relleno sedoso de crema pastelera infusionada con notas acarameladas de dulce de leche casero.' },
    'r_concha-choco-abuelita': { foto: 'assets/chocolate-abuelita-luz-natural.webp', desc: 'Ganache untuoso con el inconfundible toque de canela y cacao de nuestro chocolate de mesa más tradicional.' },
    'r_concha-guayabate': { foto: 'assets/guayaba-luz-natural.webp', desc: 'Corazón de mermelada casera de guayaba natural, coronado con una suave lámina de ate artesanal.' },
    'r_concha-arroz-con-leche': { foto: 'assets/arroz-con-leche-luz-natural.webp', desc: 'Homenaje a la repostería clásica: centro aromatizado con canela y la textura reconfortante del postre de casa.' },
    'r_concha-mazapan': { foto: 'assets/mazapan-luminosa-luz-natural.webp', desc: 'Relleno denso de crema de cacahuate tostado bajo una costra espolvoreada con auténtico mazapán.' },
    'r_concha-tradicional': { foto: 'assets/tradicional-chocolate-luz-natural.webp', desc: 'Miga suave y mantequillosa coronada con costra crujiente de notas profundas de cacao.' },
    'r_mv8m2tg31zqfm': { foto: 'assets/tradicional-vainilla-luz-natural.webp', desc: 'Miga delicadamente aireada bajo una costra crujiente de pura vainilla. El sabor tradicional en su máxima expresión.' }
  },
  menuRespaldo: [
    { id: 'r_concha-capuchino', nombre: 'Capuchino', precio: 28, seccion: 'Rellenas', orden: 1 },
    { id: 'r_concha-oreo', nombre: 'Oreo', precio: 28, seccion: 'Rellenas', orden: 2 },
    { id: 'r_concha-frutos-rojos', nombre: 'Frutos rojos', precio: 28, seccion: 'Rellenas', orden: 3 },
    { id: 'r_concha-crema-pastelera', nombre: 'Crema pastelera con dulce de leche', precio: 28, seccion: 'Rellenas', orden: 4 },
    { id: 'r_concha-choco-abuelita', nombre: 'Chocolate Abuelita', precio: 28, seccion: 'Rellenas', orden: 5 },
    { id: 'r_concha-guayabate', nombre: 'Guayabate', precio: 28, seccion: 'Rellenas', orden: 6 },
    { id: 'r_concha-arroz-con-leche', nombre: 'Arroz con leche', precio: 28, seccion: 'Rellenas', orden: 7 },
    { id: 'r_concha-mazapan', nombre: 'Mazapán', precio: 28, seccion: 'Rellenas', orden: 8 },
    { id: 'r_concha-tradicional', nombre: 'Tradicional gourmet chocolate', precio: 15, seccion: 'Tradicionales', orden: 9 },
    { id: 'r_mv8m2tg31zqfm', nombre: 'Tradicional gourmet vainilla', precio: 15, seccion: 'Tradicionales', orden: 10 }
  ]
};
