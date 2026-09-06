# Identificación bibliográfica · Libros del Rincón

Aplicación web estática para identificar libros del acervo escolar, distinguir la **edición** concreta cuando es posible, conservar el contexto histórico del programa **Libros del Rincón** y generar el catálogo con la portada incrustada.

Todo corre en el navegador. No hay servidor, no hay base de datos remota, no se envía nada del acervo a ningún lado.

---

## 1. Publicarla en GitHub Pages

1. Crea un repositorio nuevo y sube el contenido de esta carpeta en la raíz.
2. En el repositorio, entra a **Settings** (la pestaña de configuración, arriba a la derecha).
3. En la columna izquierda, busca **Pages**.
4. En *Build and deployment* → *Source*, elige **Deploy from a branch**.
5. En *Branch*, elige `main` y la carpeta `/ (root)`. Da clic en **Save**.
6. Espera un minuto y recarga esa misma pantalla: aparecerá la dirección pública, del tipo `https://tuusuario.github.io/nombre-del-repositorio/`.

El archivo `.nojekyll` ya está incluido: evita que GitHub intente procesar la carpeta como un blog y esconda archivos.

**Sin GitHub:** también funciona abriendo `index.html` con doble clic desde tu computadora. Todos los scripts se cargan como archivos normales, sin módulos, precisamente para que eso sea posible.

---

## 2. Cómo se usa

| Pantalla | Para qué |
|---|---|
| **Importar** | Cargar TXT, CSV, XLSX, DOCX, fotos (con OCR) o pegar texto y ligas. Antes de importar una tabla se revisa la correspondencia de columnas, y puedes corregirla. |
| **Procesamiento** | Consulta las fuentes, compara evidencias y busca la portada. Guarda el avance cada cinco registros. |
| **Resultados** | La tabla del acervo. Cada ficha abre con seis vistas: datos, comparación por fuente, evidencia, ediciones candidatas, portada y control de calidad. |
| **Revisión** | Lo que el sistema no se atreve a decidir solo: varias ediciones posibles, conflictos SEP contra fuente externa, portadas no verificadas, duplicados. Los motivos funcionan como filtro: resolver de corrido todos los "sin portada" cuesta menos que saltar de un problema a otro. |
| **Catálogo maestro** | Consulta directa al catálogo histórico cargado; permite crear un registro a partir de una ficha SEP. |
| **Fuentes y evidencia** | Estado real de cada fuente y buscador de toda la evidencia del proyecto. |
| **Clasificación SEP** | La tabla curricular maestra: categoría → disciplina → color → contenidos → saberes. |
| **Exportación** | Word con portadas incrustadas, HTML imprimible, Excel con trazabilidad, CSV y respaldo JSON. Si algún campo empieza con un signo que Excel leería como fórmula, la pantalla lo dice y explica el apóstrofo que lleva el CSV. |

### El estado físico lo capturas tú

Ninguna API sabe si el ejemplar tiene páginas sueltas. En *Resultados*, la vista **Captura de estado físico** deja recorrer el estante libro por libro: eliges el estado, escribes la nota y se guarda solo, sin abrir una ficha cada vez. Queda marcado en la trazabilidad como captura manual.

### Tu decisión pesa más que cualquier fuente

En la pestaña *Comparación* de cada ficha, cada valor es un botón: tócalo y ese valor es el que va al documento. Queda marcado como decisión tuya, y ni el catálogo SEP ni un reprocesamiento posterior lo sobrescriben.

### La tabla curricular no se inventa

Disciplina, color, contenidos y saberes **solo existen si importas tu clasificador**. Nada de eso se genera aquí. Mientras una celda esté vacía, la ficha dice que el campo está pendiente en lugar de rellenarlo con algo verosímil, y el texto importado se copia tal cual, sin abreviar.

**Importar el clasificador oficial.** En *Clasificación SEP* → *Importar desde Excel*, elige el archivo y la hoja (en el inventario auditado es "Clasificador SEP - Rincón"). No importa dónde esté el encabezado ni que la hoja tenga varias tablas: se busca la más completa —la que tiene categoría, color y contenidos— y la lectura se corta donde esa tabla termina, sin arrastrar las secciones que vengan después. Como esa tabla trae **una fila por contenido**, los contenidos de cada categoría se agrupan en una sola fila, en su orden y sin recortar. También se guardan la palabra clave y el grado asignado de cada categoría.

**El puente entre dos vocabularios.** El clasificador oficial tiene doce categorías; el catálogo histórico de Libros del Rincón usa etiquetas mucho más finas —"Cuentos de humor", "Mitos y leyendas", "El cuerpo"— que suelen aparecer dentro de la columna de contenidos del clasificador. El puente aprovecha esa coincidencia:

- coincidencia exacta con una categoría o con uno de sus contenidos → vínculo firme;
- una etiqueta contenida en la otra ("El cuerpo" dentro de "La naturaleza y El cuerpo") o palabras compartidas → vínculo propuesto, que se aplica pero manda la ficha a revisión;
- sin palabras en común → **no se vincula**. El parecido de letras solo no basta: "Tecnología" y "Ecología" se escriben parecido y no tienen nada que ver.

Cada vínculo dice por qué se hizo, y en *Clasificación SEP* puedes cambiar cualquiera con un menú. Un vínculo que pongas a mano manda sobre cualquier cálculo y se conserva. Las etiquetas sin equivalencia quedan listadas como pendientes: en el acervo histórico varias de ellas son títulos de libros que se colaron en la columna de categoría del catálogo original, y esas conviene dejarlas sin vincular.

El grado que trae el clasificador es una sugerencia por categoría: se guarda como evidencia, pero el grado que va al documento sigue siendo el que el catálogo asignó a ese título.

---

## 3. Qué datos trae cargados

| Archivo | Contenido |
|---|---|
| `data/sep-catalogo-primaria.js` | 3 213 fichas del catálogo histórico consolidado de Libros del Rincón, Primaria, ciclos 2003-2004 a 2018-2019: ciclo, grado, destino, serie lectora, género, categoría, título, autor, editorial, año, ISBN, páginas, dimensiones, reseña y clave SEP. |
| `data/sep-catalogo-pdf-1986-2006.js` | 1 274 títulos de los años 2003-2006 del catálogo histórico 1986-2006, a nivel de título y página. Se usa como evidencia secundaria de presencia. |
| `data/taxonomia-curricular.js` | Las 81 categorías presentes en el catálogo, con su conteo de fichas y el género y la serie predominantes. Las categorías con muy pocas fichas van marcadas para que revises si son reales o restos de extracción. |

Para actualizar el catálogo, regenera esos archivos conservando la forma `window.NOMBRE = JSON.parse("…")`.

---

## 4. Fuentes bibliográficas

| Fuente | Estado en el navegador |
|---|---|
| Catálogo SEP (local) | Siempre disponible. Tiene prioridad para grado, serie, categoría y reseña. |
| Open Library | Consulta directa. Búsqueda por ISBN, por título, ediciones de una obra y portadas. |
| Google Books | Consulta directa. Puede devolver un límite de cuota alcanzado; cuando pasa, se anota en la ficha. |
| Library of Congress | Consulta directa; algunos navegadores la bloquean. Si falla, se dice. |
| Agencia ISBN México | **Requiere un proxy propio.** El sitio de INDAUTOR no autoriza consultas desde otro dominio. Sin proxy configurado, la fuente se declara no disponible. |

Lo mismo aplica a las ligas que pegues: el navegador solo puede leer sitios que lo autoricen. En *Ajustes* puedes poner la plantilla de tu propio proxy, por ejemplo `https://mi-proxy.midominio.workers.dev/?url={url}`. Sin proxy nada se rompe: la liga queda registrada como pendiente.

---

## 5. Las reglas que la aplicación no rompe

**Principio que gobierna todo lo demás:** serie ≠ género ≠ categoría ≠ grado ≠ procedencia. Cada uno es un dato independiente. Ninguno sustituye a otro, y ninguno sirve para excluir automáticamente un libro de un grado. La aplicación organiza los datos; la decisión es de la persona.

### La procedencia se decide con el ejemplar en la mano

1. **Coincidencia ≠ procedencia.** Que el título o el ISBN aparezcan en el catálogo histórico solo dice que *ese título* también se publicó en Libros del Rincón. El ejemplar que tienes en la mano puede ser una edición comercial de otra editorial, porque el mismo título circula por las dos vías. La procedencia se decide mirando el sello o logotipo oficial SEP impreso en la portada o la contraportada, y **solo una persona puede fijarla**: no existe ninguna vía automática, a propósito.
2. Depende del **origen del ejemplar, no de lo educativo o literario que sea su contenido**. Un libro donado sobre ciencia sigue siendo acervo General.
3. Mientras la procedencia no esté verificada, el grado, la subserie, la categoría y el tipo de texto del catálogo **se proponen a la vista pero no se asientan**, y el registro pide verificar el sello. Así, confirmar la procedencia aplica la clasificación de golpe en vez de teclearla.
4. La reseña sí se aplica sin esperar: describe la obra, no el ejemplar.

### La clasificación depende de tres datos, no de uno

5. La **categoría SEP** depende de procedencia + grado + tipo de texto. Con procedencia General se elige entre las categorías del clasificador institucional; con procedencia Rincón, entre las categorías oficiales para ese grado y ese género.
6. El **tipo de texto** (Informativo / Literario) describe el contenido y es independiente de la procedencia.
7. La **subserie** (Al Sol Solito, Pasos de Luna, Astrolabio, Espejo de Urania, Cometas Convidados) es un **perfil de lector, no una banda de grado**. Nunca se usa para deducir el grado ni para excluir un título de ningún grado.
8. El **color** solo se calcula para el acervo General, con los colores institucionales reales. Para los libros de Rincón queda en blanco a propósito: no se tiene el mapa completo color↔categoría oficial y ese dato no se inventa. Un hueco declarado vale más que un color que después nadie sabría distinguir de uno verificado.
9. La matriz categoría×grado del catálogo histórico es un **referente de frecuencia**, no una regla de asignación. Una categoría "desierta" en un proceso no queda invalidada para ese grado.

### Los datos del ejemplar

10. No inventa ISBN, autor, editorial ni año. Si el ejemplar no trae ISBN visible, el campo queda en blanco: no se copia el de otra edición del mismo título.
11. Obra y edición son cosas distintas: el año que va al documento es el de **esta** edición, no el de la primera publicación.
12. Si la edición se identificó por su ISBN, la editorial y el año son los de esa edición, no los del catálogo: un ISBN de una edición junto al año de otra sería un dato falso. La diferencia queda como conflicto abierto, nunca sustituida en silencio.
13. La editorial no es la colección. "A la Orilla del Viento" es una colección; la editorial es el Fondo de Cultura Económica.
14. El **estado físico** es juicio de quien revisa el ejemplar, no un dato de catálogo: ninguna fuente lo propone y "Pendiente" no cuenta como capturado.
15. Una portada de otra edición no se presenta como la correcta. La existencia de la imagen se comprueba antes de declararla; si no existe, el campo dice "sin portada" y no se pone una imagen genérica.

### Lo que la aplicación señala pero no resuelve

16. **Duplicado detectado ≠ resolución automática.** Un título o un ISBN repetido se marca como posible duplicado; nunca se asume cuál renglón sobra. Puede ser una edición distinta, un ejemplar físico duplicado real o un error de captura. La persona decide.
17. Una coincidencia por título no se convierte en confirmación.
18. Un registro con un conflicto abierto nunca se exporta como confirmado, aunque su estado diga lo contrario.
19. Un conflicto que ya resolviste no vuelve a abrirse al reprocesar, salvo que aparezca un valor nuevo que no habías visto.
20. Cuando una línea de texto se divide por un guion suelto —que en este acervo suele ser parte del título, como en "Delfín, el - ¡vaya fauna!"—, el registro lo declara y pasa a revisión en vez de dar el corte por bueno.
21. **Nada se borra:** el valor original de la entrada y la evidencia de cada discrepancia se conservan.
22. La columna **Procedencia va al final** de la exportación a propósito, no en medio, para no romper las integraciones externas que leen columnas por posición.

---

## 6. Arquitectura

```
index.html
css/app.css
data/    catálogos históricos y tabla curricular semilla
js/
  00-util.js       normalización, ISBN, similitud, cola de red con backoff
  10-model.js      registro, evidencia, estados, persistencia (IndexedDB)
  20-import.js     TXT, tablas, DOCX, imágenes con OCR, URLs, fusión
  30-sources.js    adaptadores: Open Library, Google Books, LOC, ISBN México
  50-sep.js        índice del catálogo histórico y tabla curricular
  40-matching.js   puntuación, obra/edición, conflictos, portadas
  60-review.js     bandeja de revisión y resolución
  70-export.js     Word, HTML, Excel, CSV, JSON y anexo de auditoría
  80-ui.js         las diez pantallas
```

Los adaptadores comparten la misma interfaz (`porISBN`, `porTitulo`, `edicionesDeObra`, `portada`, `disponible`), así que agregar una fuente nueva no obliga a tocar el motor.

Bibliotecas externas que se cargan solo cuando hacen falta: SheetJS (leer y escribir Excel), Mammoth (DOCX), Tesseract.js (OCR) y docx (generar Word). Si no hay internet, la aplicación sigue funcionando con lo que no las necesita, y el HTML imprimible nunca depende de ellas.

### Dónde viven los datos

En IndexedDB del navegador, con respaldo en `localStorage` si aquella no está disponible. Cambiar de computadora o borrar los datos del sitio significa perder el proyecto: usa **Ajustes → Descargar respaldo** con regularidad.

Cada guardado deja constancia. Si el navegador no puede guardar —cuota llena, modo privado, permisos—, aparece un aviso rojo que no desaparece solo, porque un guardado que falla en silencio es lo único que puede costarte horas de trabajo. Si el respaldo entra por `localStorage`, las portadas incrustadas no caben ahí y se vuelven a descargar al exportar; también se avisa.

Las respuestas de las fuentes se guardan en caché 30 días. Pasado ese plazo se vuelven a consultar, porque una ficha corregida en el origen no debe quedar congelada aquí.

---

## 7. Pruebas

Tres archivos, tres propósitos distintos:

| Archivo | Qué comprueba |
|---|---|
| `prueba.js` | 99 comportamientos: validación de ISBN, índice SEP, importación, fusión, puntuación, detección de conflictos, portada verificada frente a portada inexistente, permanencia de las decisiones humanas, escalamiento de severidad, mapeo de encabezados, aviso de guardado fallido, importación del clasificador real y sus vínculos, control de calidad, encabezados exactos de exportación y las diez pantallas. |
| `prueba-defectos.js` | Reproduce los quince defectos corregidos en la auditoría de septiembre de 2026, cada uno tal como se manifestaba. Si alguno vuelve a fallar, es que una corrección se perdió. Devuelve código de error distinto de cero. |
| `prueba-escala.js` | No comprueba correctitud: mide el tiempo del cruce de duplicados y de la fusión por similitud con un acervo de 704 registros reales, para vigilar que no vuelvan a crecer al cuadrado. |

```bash
npm install jsdom
node prueba.js
node prueba-defectos.js
node prueba-escala.js
```

---

## 8. Auditoría de septiembre de 2026

Las 99 pruebas de humo pasaban, y aun así había quince defectos. Todos estaban fuera de lo que esa suite miraba. Quedan corregidos y con prueba propia.

**Se perdían datos**

1. El respaldo JSON no incluía `puenteManual`: los vínculos de categoría asignados a mano —trabajo de criterio que ninguna fuente reconstruye— se perdían al restaurar en otro equipo, aunque este documento prometiera que se conservan.
2. Restaurar un respaldo de otra versión tumbaba la aplicación entera con un error de estructura. Ahora los registros se normalizan al cargarlos: se completa lo que falte sin sobrescribir lo que sí venga.
3. El CSV entregaba a Excel como fórmula todo título que empezara con `=`, `+`, `@` o guion. En este acervo no es hipotético: un título como «El delfín ‑¡vaya fauna!» llegaba a la hoja convertido en `#NAME?`. Ahora esas celdas llevan un apóstrofo delante, que Excel entiende como «esto es texto»; el valor queda íntegro. El XLSX ya era seguro y no lo necesita.
4. `construirIndice` reiniciaba tres índices y olvidaba el del catálogo 1986‑2006: cada reconstrucción lo duplicaba y la misma página aparecía dos y tres veces como evidencia del mismo título.

**Se identificaba mal**

5. Un candidato cuyo ISBN contradecía al de la entrada llegaba a 90 puntos y se declaraba identificado, si título, autor, editorial y año concordaban. Son dos ediciones distintas. Ahora se topa por debajo del umbral de alta confianza, con el tipo `edicion_distinta` y la contradicción escrita en la explicación.
6. Todo motivo leve se guardaba como «media», porque el valor por defecto pisaba a `baja`. «Sin portada» y «guion en el título» llenaban la bandeja de urgencias falsas.
7. Al reprocesar no se limpiaba la severidad: un registro que alguna vez tuvo un problema grave lo arrastraba para siempre y volvía a degradarse aunque ya estuviera resuelto.

**Se declaraba mal el estado**

8. Un registro con confianza 100 y sin ningún conflicto se degradaba a REVISIÓN por un motivo leve. Contradecía al propio código, que documenta que un motivo leve «lo deja confirmado pero en la bandeja». En la práctica era peor: mientras no se importara el clasificador, *todos* los registros caían por el mismo aviso menor y la exportación «solo confirmados y completados» no devolvía ninguno. La regla vive ahora en un solo lugar, `M.estadoFinal`: un conflicto abierto nunca se declara confirmado, un motivo grave o medio degrada, y uno leve conserva el estado ganado y solo mantiene la ficha en la bandeja.
9. «Pendiente» contaba como estado físico capturado en el control de calidad, que es justo lo contrario de lo que significa. Peor: el selector de la ficha no tenía opción vacía, así que en un registro nuevo aparecía «Excelente» preseleccionado y guardar la nota bastaba para asentar un estado que nadie había revisado.
10. Alias demasiado generales capturaban columnas ajenas: «Nombre» dentro de «Nombre del alumno» convertía una lista de grupo en un catálogo de libros. Como los DOCX y las tablas pegadas se mapean sin pasar por la pantalla de revisión, el error entraba sin que nadie lo viera.

**Se perdía trabajo o quedaba invisible**

11. Un registro cuyo procesamiento se interrumpía —cerrar el navegador, perder la conexión— quedaba asentado en `EN BÚSQUEDA` por el guardado incremental, y desde ahí era **invisible en toda la aplicación**: Procesamiento solo ofrece los `NUEVO`, la bandeja solo muestra los que están en revisión, y ningún indicador lo contaba salvo «recibidos». El libro desaparecía de la vista sin haberse procesado. Al cargar, esos registros vuelven a la cola con una observación que explica qué pasó; nada de lo ya averiguado se borra.
12. El clasificador oficial solo existía si alguien importaba la hoja de Excel, y esa importación se perdía al cambiar de equipo, borrar los datos del sitio o restaurar un respaldo anterior: la tabla quedaba con las 81 categorías del catálogo y todas las celdas de color, contenidos y saberes vacías, o sea sin clasificar nada. Ahora las 12 categorías van integradas como dato en `data/clasificador-sep.js` y **41 etiquetas del catálogo se vinculan solas desde el primer arranque**. Importar tu propia hoja lo sigue sobrescribiendo, y lo que edites a mano no se pisa.

**Interacción y red**

13. Los filtros por motivo no respondían si se tocaba el número dentro del botón: el `<strong>` no lleva el atributo y la acción se perdía en silencio. La delegación ahora sube al elemento que sí lo declara.
14. Con la concurrencia llena, dos consultas fallidas dejaban su hueco sin ocupar hasta que saltara el reintento, y el lote entero se paraba con trabajo listo esperando.
15. El rango de años estaba fijo hasta 2049, y habría dejado de reconocer años válidos sin avisar. Ahora el tope se calcula a partir de la fecha, y además rechaza como imposible un «2199» que antes pasaba por bueno.

### Rendimiento

El cruce de duplicados comparaba cada registro contra todos los demás, y se ejecutaba en cada pintado de la pantalla *Revisión*. Con 704 libros eran 3.2 segundos de interfaz congelada; con el acervo completo, más de tres segundos cada vez que se tocaba un filtro.

Se corrigió sin cambiar ningún resultado —los mismos pares, las mismas fusiones— con tres medidas: los ISBN se resuelven por tabla; los títulos solo se comparan dentro de la franja de longitud donde la similitud puede alcanzar el umbral (la cota `2·min/(na+nb)` es exacta, así que no se pierde ninguna coincidencia); y la normalización y los bigramas se guardan en memoria, porque el mismo título se procesaba cientos de veces. Además el resultado se memoriza mientras el acervo no cambie.

| Operación | Antes | Ahora |
|---|---|---|
| Cruce de duplicados, 704 registros | 3 252 ms | 241 ms |
| Cruce de duplicados, 3 213 registros | 3 025 ms | 40 ms |
| El mismo, repintando sin cambios | 3 025 ms | 1 ms |
| Fusión por similitud, 300 sobre 704 | 2 713 ms | 285 ms |

