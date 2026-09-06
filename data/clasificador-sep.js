/* =========================================================================
   clasificador-sep.js — Clasificador oficial SEP de Libros del Rincón
   Las 12 categorías del clasificador, con su disciplina, color, contenidos,
   palabra clave y grado sugerido. Va integrado como dato para que la
   aplicación clasifique desde el primer arranque, sin depender de que alguien
   importe una hoja de Excel: al cambiar de equipo o borrar los datos del sitio
   esa hoja se perdía y la tabla curricular quedaba vacía.
   El encabezado original dice "Contenidos, saberes y tipos de texto": es una
   sola columna, por eso `saberes` va vacío y no se duplica el texto.
   Sigue pudiendo sobrescribirse importando tu propia hoja.
   ========================================================================= */
window.CLASIFICADOR_SEP_OFICIAL=[
 {
  "categoria": "Ciencias físicoquímicas",
  "disciplina": "Informativo",
  "color": "Verde",
  "contenidos": "Propiedades de la materia · Fenómenos físicos · Reacciones químicas · Energía",
  "saberes": "",
  "palabra_clave": "Ciencia",
  "grado_sugerido": "5°",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "La naturaleza y El cuerpo",
  "disciplina": "Informativo",
  "color": "Azul cielo",
  "contenidos": "Ecología · Biodiversidad · Ecosistemas · Anatomía · Fisiología · Salud",
  "saberes": "",
  "palabra_clave": "Naturaleza",
  "grado_sugerido": "1º",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "Los números y las formas (Matemáticas)",
  "disciplina": "Informativo",
  "color": "Rosa claro",
  "contenidos": "Numeración · Operaciones · Geometría · Medida · Probabilidad · Resolución de problemas",
  "saberes": "",
  "palabra_clave": "Matemáticas",
  "grado_sugerido": "6º",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "Los objetos y su funcionamiento (Tecnología)",
  "disciplina": "Informativo",
  "color": "Gris claro",
  "contenidos": "Máquinas simples · Herramientas · Procesos tecnológicos · Diseño · Innovación",
  "saberes": "",
  "palabra_clave": "Tecnología",
  "grado_sugerido": "4°",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "Las personas, historias del pasado",
  "disciplina": "Informativo",
  "color": "Café",
  "contenidos": "Biografías · Civilizaciones · Costumbres · Tradiciones · Identidad cultural · Convivencia",
  "saberes": "",
  "palabra_clave": "Historia",
  "grado_sugerido": "3.º",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "Los lugares, la Tierra y el espacio",
  "disciplina": "Informativo",
  "color": "Morado",
  "contenidos": "Geoformas · Clima · Regiones · Astronomía · Fenómenos naturales · Sostenibilidad",
  "saberes": "",
  "palabra_clave": "Geografía",
  "grado_sugerido": "4°",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "Las artes y los oficios",
  "disciplina": "Informativo",
  "color": "Gris oscuro",
  "contenidos": "Música · Plástica · Danza · Teatro · Oficios tradicionales · Expresión creativa",
  "saberes": "",
  "palabra_clave": "Artes",
  "grado_sugerido": "2º",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "Los juegos, actividades y experimentos",
  "disciplina": "Informativo",
  "color": "Amarillo",
  "contenidos": "Juegos de mesa · Pasatiempos · Acertijos · Experimentos · Dinámicas · Aprender jugando",
  "saberes": "",
  "palabra_clave": "Juegos",
  "grado_sugerido": "2º",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "Las palabras (Diccionarios, enciclopedias, atlas y almanaques)",
  "disciplina": "Informativo",
  "color": "Lila",
  "contenidos": "Vocabulario · Significados · Referencias · Consulta rápida · Conocimiento general",
  "saberes": "",
  "palabra_clave": "Lenguaje",
  "grado_sugerido": "3.º",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "Narrativa",
  "disciplina": "Literario",
  "color": "Azul",
  "contenidos": "Cuentos de aventuras · Cuentos de humor · Cuentos de misterio · Cuentos de vida cotidiana · Mitos y leyendas · Narrativa de ciencia ficción · Narrativa policiaca · Narrativa contemporánea (universal / latinoamericana / mexicana) · Narrativa histórica y clásica · Diarios · Crónicas y reportajes",
  "saberes": "",
  "palabra_clave": "Narrativa",
  "grado_sugerido": "3.º",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "Poesía",
  "disciplina": "Literario",
  "color": "Rosa",
  "contenidos": "Poesía · Rimas · Canciones · Adivinanzas y juegos de palabras · Poesía de autor · Poesía popular",
  "saberes": "",
  "palabra_clave": "Poesía",
  "grado_sugerido": "1º",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 },
 {
  "categoria": "Teatro",
  "disciplina": "Literario",
  "color": "Rojo",
  "contenidos": "Teatro · Representaciones con títeres y marionetas",
  "saberes": "",
  "palabra_clave": "Teatro",
  "grado_sugerido": "3.º",
  "oficial": true,
  "revisar": false,
  "origen": "integrado"
 }
];
