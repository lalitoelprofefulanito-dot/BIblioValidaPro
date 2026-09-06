/* Pruebas de regresión de los 10 defectos corregidos en la auditoría.
   Cada bloque reproduce el defecto tal como se manifestaba. Si alguno vuelve
   a fallar, es que una corrección se perdió. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const raiz = __dirname;
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://ejemplo.test/', pretendToBeVisual: true });
const w = dom.window;

w.fetch = async () => { throw new Error('sin red'); };
w.FileReader = w.FileReader || class { };

const archivos = [
  'data/taxonomia-curricular.js', 'data/clasificador-sep.js', 'data/sep-catalogo-pdf-1986-2006.js', 'data/sep-catalogo-primaria.js',
  'js/00-util.js', 'js/10-model.js', 'js/20-import.js', 'js/30-sources.js',
  'js/50-sep.js', 'js/40-matching.js', 'js/60-review.js', 'js/70-export.js', 'js/80-ui.js'
];
for (const f of archivos) w.eval(fs.readFileSync(path.join(raiz, f), 'utf8'));
const LR = w.LR, U = LR.util, M = LR.model, S = LR.sep, X = LR.matching, E = LR.exportar, I = LR.importar;

let fallos = 0;
function chk(nombre, cond, extra) {
  if (!cond) fallos++;
  console.log((cond ? '  ok    ' : '  DEFECTO') + '  ' + nombre + (extra ? '  → ' + extra : ''));
}

(async () => {

console.log('\n— A. severidad de revisión —');
var r1 = M.nuevoRegistro({ titulo: 'Prueba severidad' }, { tipo: 'texto', origen: 't' });
M.aRevision(r1, 'Sin portada', 'baja');
chk('un motivo leve se guarda como leve', r1.revision.severidad === 'baja', 'quedó "' + r1.revision.severidad + '"');

var r2 = M.nuevoRegistro({ titulo: 'Prueba escalado' }, { tipo: 'texto', origen: 't' });
M.aRevision(r2, 'Sin portada', 'baja');
M.aRevision(r2, 'Conflicto', 'alta');
chk('un motivo grave posterior escala', r2.revision.severidad === 'alta', r2.revision.severidad);

console.log('\n— B. severidad al reprocesar —');
var r3 = M.nuevoRegistro({ titulo: 'Reproceso' }, { tipo: 'texto', origen: 't' });
M.aRevision(r3, 'Varias ediciones posibles', 'alta');
r3.estado = 'CONFIRMADO'; r3.confianza = 96;
// simula lo que hace X.procesar al reiniciar el registro
M.reiniciarRevision(r3);
M.aRevision(r3, 'Sin portada', 'baja');
chk('tras reprocesar, un motivo leve no arrastra la severidad vieja',
  r3.revision.severidad !== 'alta', 'severidad heredada: ' + r3.revision.severidad);
chk('un registro confirmado no se degrada por un motivo leve',
  r3.estado === 'CONFIRMADO', 'estado quedó ' + r3.estado);

console.log('\n— C. índice del catálogo PDF —');
var antes = LR.sep.buscarPdf('Adivina quién es').length;
S.construirIndice();
var despues = LR.sep.buscarPdf('Adivina quién es').length;
chk('reconstruir el índice no duplica el catálogo PDF', antes === despues, antes + ' → ' + despues);

console.log('\n— D. CSV frente a Excel —');
M.estado.registros = [];
var rc = M.nuevoRegistro({ titulo: 'Delfín, el - ¡vaya fauna!', autor: 'X' }, { tipo: 'texto', origen: 't' });
M.fijarCampo(rc, 'titulo', '-¡vaya fauna!', 'manual', 100, 'prueba');
M.fijarCampo(rc, 'autor', '=Autor', 'manual', 100, 'prueba');
rc.n = 1;
M.estado.registros.push(rc);
var csv = await E.aCsv([rc]).text();
var celdas = csv.split('\n')[1].split(',');
chk('un título que empieza con guion no se exporta como fórmula',
  !/(^|,)[-=+@]/.test(csv.split('\n')[1]), 'línea: ' + csv.split('\n')[1].substring(0, 60));

console.log('\n— E. respaldo JSON —');
M.estado.puenteManual = { 'cuentos de humor': 'Narrativa' };
var backup = JSON.parse(await E.aJson(M.estado.registros).text());
chk('el respaldo conserva los vínculos asignados a mano',
  !!backup.puenteManual, 'claves: ' + Object.keys(backup).join(', '));

console.log('\n— F. restauración de un respaldo incompleto —');
var crash = null;
try {
  // la vía real: un respaldo se normaliza al restaurarlo
  M.estado.registros = M.normalizarRegistros([{ id: 'x', n: 1, titulo: 'viejo', estado: 'NUEVO' }]);
  M.indicadores();
  LR.revision.cola();
  E.ficha(M.estado.registros[0]);
} catch (e) { crash = e.message; }
chk('un respaldo de otra versión no rompe la aplicación', crash === null, crash);
M.estado.registros = [];

console.log('\n— G. cola de red tras un fallo —');
U.red.concurrencia = 2; U.red.reintentos = 0; U.red.esperaMin = 0;
U.red._cola = []; U.red._activos = 0;
var completadas = 0;
var tareas = [];
for (var i = 0; i < 6; i++) {
  (function (n) {
    tareas.push(U.red.encolar('f' + n, function () {
      return Promise.reject(new Error('cae'));
    }).catch(function () { completadas++; }));
  })(i);
}
var t0 = Date.now();
await Promise.race([Promise.all(tareas), U.dormir(2500)]);
chk('seis consultas que fallan no dejan la cola atorada', completadas === 6,
  completadas + '/6 en ' + (Date.now() - t0) + ' ms');

console.log('\n— H. puntuación con ISBN contradictorio —');
M.estado.registros = [];
var rp = M.nuevoRegistro({ titulo: 'El pizarrón encantado', autor: 'Emilio Carballido',
  editorial: 'Petra Ediciones', anio: '1992', isbn: '9789682941801' }, { tipo: 'texto', origen: 't' });
var candOtro = LR.fuentes.candidato('googlebooks', {
  titulo: 'El pizarrón encantado', autores: ['Emilio Carballido'],
  editorial: 'Petra Ediciones', anio: '1992', isbn13: '9789681640729'
});
var pOtro = X.puntuar(rp, candOtro);
chk('un ISBN que contradice al de la entrada no puntúa como identificado',
  pOtro.score < M.estado.config.umbrales.alta, pOtro.score + ' puntos, tipo ' + pOtro.tipo);

console.log('\n— I. delegación de eventos en botones con contenido —');
var marcado = '<button class="btn-motivo" data-motivo="Sin portada">Sin portada <strong>12</strong></button>';
var cont = w.document.createElement('div'); cont.innerHTML = marcado;
var interno = cont.querySelector('strong');
chk('un clic dentro del botón encuentra el atributo',
  !!(interno.getAttribute('data-motivo') || (interno.closest && interno.closest('[data-motivo]'))),
  'getAttribute directo devuelve ' + interno.getAttribute('data-motivo'));

console.log('\n— J. desglose de línea con guion en el título —');
var d = I.desglosarLinea('Delfín, el - ¡vaya fauna!');
chk('el guion del título se marca como división débil', d._divisionDebil === true,
  'título="' + d.titulo + '" autor="' + d.autor + '" débil=' + d._divisionDebil);

console.log('\n— K. año fuera de rango —');
chk('un año plausible se reconoce', U.anio('ed. 2026') === '2026', 'devolvió "' + U.anio('ed. 2026') + '"');
chk('un año imposible no se toma por bueno', U.anio('2199') === '', 'devolvió "' + U.anio('2199') + '"');

console.log('\n— L. búsqueda SEP con entrada vacía —');
var vacio = S.buscar('', '', '', 5);
chk('buscar sin datos no devuelve coincidencias', vacio.length === 0, vacio.length + ' resultados');

console.log('\n— M. mapeo de encabezados genéricos —');
var mAl = I.detectarMapeo(['Nombre del alumno', 'Grado', 'Grupo']);
chk('una lista de alumnos no se toma por un catálogo de libros', mAl.titulo == null,
  'mapeó titulo → ' + mAl.titulo);
var mLi = I.detectarMapeo(['Título', 'Autor', 'Año de publicación', 'ISBN']);
chk('un catálogo de verdad sí se mapea', mLi.titulo === 0 && mLi.anio === 2, JSON.stringify(mLi));

console.log('\n— N. estado físico sin capturar —');
var rFis = M.nuevoRegistro({ titulo: 'X' }, { tipo: 't', origen: 'x' });
rFis.fisico.estado_fisico = 'Pendiente';
var lFis = M.checklist(rFis).lista.filter(function (x) { return x.campo === 'Estado físico'; })[0];
chk('"Pendiente" no cuenta como estado físico capturado', !lFis.ok, '"Pendiente" se dio por capturado');
rFis.fisico.estado_fisico = 'Bueno';
chk('un estado real sí cuenta', M.tieneEstadoFisico(rFis), 'no lo reconoció');

console.log('\n— O. un motivo leve no degrada un registro sin conflictos —');
var rLeve = M.nuevoRegistro({ titulo: 'Y' }, { tipo: 't', origen: 'x' });
rLeve.confianza = 100;
M.aRevision(rLeve, 'Categoría sin vínculo con el clasificador', 'baja');
chk('conserva el estado que ganó por puntuación', M.estadoFinal(rLeve) === 'CONFIRMADO',
  M.estadoFinal(rLeve));
chk('y aun así sigue en la bandeja de revisión', rLeve.revision.enCola === true, 'salió de la cola');

var rGrave = M.nuevoRegistro({ titulo: 'Z' }, { tipo: 't', origen: 'x' });
rGrave.confianza = 100;
M.aRevision(rGrave, 'Varias ediciones posibles', 'alta');
chk('un motivo grave sí degrada', M.estadoFinal(rGrave) === 'REVISIÓN', M.estadoFinal(rGrave));

var rConf = M.nuevoRegistro({ titulo: 'W' }, { tipo: 't', origen: 'x' });
rConf.confianza = 100;
rConf.conflictos = [{ id: 'c', campo: 'anio', tipo: 'X', valores: [], resolucion: '' }];
chk('un conflicto abierto nunca queda confirmado', M.estadoFinal(rConf) === 'REVISIÓN', M.estadoFinal(rConf));

console.log('\n— P. aviso del apóstrofo en el CSV —');
var rAp = M.nuevoRegistro({ titulo: '-¡vaya fauna!' }, { tipo: 't', origen: 'x' });
M.fijarCampo(rAp, 'titulo', '-¡vaya fauna!', 'manual', 100, '');
chk('los campos en riesgo se detectan para poder avisarlos',
  E.conRiesgoDeFormula([rAp]).length === 1, E.conRiesgoDeFormula([rAp]).length + ' detectados');
chk('un título normal no se marca', E.conRiesgoDeFormula([M.nuevoRegistro({ titulo: 'Stelaluna' }, { tipo: 't', origen: 'x' })]).length === 0);

console.log('\n— Q. clasificador oficial integrado —');
M.estado.taxonomia = [];
S.semilla();
var ofi = S.oficiales();
chk('las 12 categorías oficiales están desde el primer arranque', ofi.length === 12, ofi.length + ' oficiales');
chk('todas traen color', ofi.every(function (o) { return !!o.color; }),
  ofi.filter(function (o) { return !o.color; }).map(function (o) { return o.categoria; }).join(', '));
chk('todas traen contenidos', ofi.every(function (o) { return !!o.contenidos; }));
chk('todas traen grado sugerido', ofi.every(function (o) { return !!o.grado_sugerido; }));
S.construirPuente();
var vNarr = S.resolverCategoria('Cuentos de humor');
chk('una etiqueta del catálogo se vincula sola', vNarr && vNarr.fila.categoria === 'Narrativa',
  vNarr ? vNarr.fila.categoria : 'sin vínculo');
var vPoe = S.resolverCategoria('Poesía');
chk('una coincidencia exacta queda firme', vPoe && vPoe.exacta === true, vPoe ? 'confianza ' + vPoe.confianza : 'sin vínculo');

console.log('\n— R. lo que edites a mano no se pisa —');
var fila = S.filaTaxonomia('Narrativa');
fila.color = 'Azul marino (mi corrección)';
S.integrarClasificadorOficial();
chk('reintegrar el clasificador respeta tu edición',
  S.filaTaxonomia('Narrativa').color === 'Azul marino (mi corrección)',
  S.filaTaxonomia('Narrativa').color);

console.log('\n— S. registros interrumpidos a media pasada —');
var rInt = M.nuevoRegistro({ titulo: 'Interrumpido' }, { tipo: 't', origen: 'x' });
rInt.estado = 'EN BÚSQUEDA';
var rescatados = M.normalizarRegistros([rInt]);
chk('vuelve a la cola de pendientes', rescatados[0].estado === 'NUEVO', rescatados[0].estado);
chk('y queda dicho por qué', rescatados[0].observaciones.some(function (o) {
  return o.texto.indexOf('quedó a medias') > -1; }), 'sin observación');
var rOk = M.nuevoRegistro({ titulo: 'Sano' }, { tipo: 't', origen: 'x' });
rOk.estado = 'CONFIRMADO';
chk('un registro sano no se toca', M.normalizarRegistros([rOk])[0].estado === 'CONFIRMADO');

console.log('\n— T. el atributo hidden gana sobre las clases —');
var css = fs.readFileSync(path.join(raiz, 'css/app.css'), 'utf8');
var marcado = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
// La regla del navegador [hidden]{display:none} pierde frente a cualquier
// selector de clase que declare display. Sin una regla propia con !important,
// un elemento oculto por JS sigue viéndose: así quedaba la ficha abierta y
// muerta al arrancar. jsdom no aplica CSS, así que esto se comprueba sobre el
// texto de la hoja de estilos.
var guarda = /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i.test(css);
chk('existe una regla [hidden] con !important', guarda,
  'sin ella, cualquier clase con display deja visible lo que se oculte');

// Y ninguna clase de un elemento ocultable debe declarar display sin esa guarda.
var ocultables = [];
marcado.replace(/<[^>]*\bhidden\b[^>]*>/g, function (t) {
  var m = /class="([^"]+)"/.exec(t);
  if (m) m[1].split(/\s+/).forEach(function (c) { if (ocultables.indexOf(c) === -1) ocultables.push(c); });
  return t;
});
['panel-fondo'].forEach(function (c) { if (ocultables.indexOf(c) === -1) ocultables.push(c); });
var riesgosas = ocultables.filter(function (c) {
  var re = new RegExp('\\.' + c + '\\s*\\{[^}]*display\\s*:', 'i');
  return re.test(css);
});
chk('las clases ocultables con display están cubiertas por la guarda',
  riesgosas.length === 0 || guarda,
  'declaran display: ' + riesgosas.join(', '));

console.log('\n— U. entrada de datos con ISBN-10 e ISBN-13 separados —');
var ENC = ['Portada', 'N°', 'Título', 'Autor', 'Editorial', 'Año', 'ISBN-10', 'ISBN-13',
  'Estado físico', 'Reseña del libro', 'Grado', 'Tipo de texto', 'Categoría SEP',
  'Contenidos y Saberes', 'Color', 'Subserie', 'Observaciones', 'Ubicación',
  'Código Biblioteca Viva', 'Procedencia'];
var mp = I.detectarMapeo(ENC);
chk('«ISBN-10» e «ISBN-13» caen en campos distintos',
  mp.isbn10 === 6 && mp.isbn13 === 7, 'isbn10=' + mp.isbn10 + ' isbn13=' + mp.isbn13);
var sinMapear = ENC.filter(function (e, i) {
  return Object.keys(mp).every(function (k) { return mp[k] !== i; });
});
chk('todas las columnas del inventario tienen destino, salvo Portada',
  sinMapear.length === 1 && sinMapear[0] === 'Portada', 'sin mapear: ' + sinMapear.join(', '));

M.estado.registros = [];
I.integrar(I.filasAMateriales([
  ['', '1', 'Solo diez', '', '', '', '8426128394', '', '', '', '', '', '', '', '', '', '', 'Estante 3', 'BV-1', 'Rincón'],
  ['', '2', 'Solo trece', '', '', '', '', '9789681640729', '', '', '', '', '', '', '', '', '', '', '', 'General'],
  ['', '3', 'Invertidos', '', '', '', '9789685927321', '9685927367', '', '', '', '', '', '', '', '', '', '', '', '']
], mp, { tipo: 'tabla', origen: 'Inventario' }), { fusionar: false });
var f1 = E.ficha(M.estado.registros[0]), f2 = E.ficha(M.estado.registros[1]), f3 = E.ficha(M.estado.registros[2]);
chk('con solo el de 10, se calcula el de 13', f1.isbn13 === '9788426128393', f1.isbn13);
chk('con solo el de 13, se calcula el de 10', f2.isbn10 === '9681640721', f2.isbn10);
chk('si las columnas vienen invertidas se enderezan',
  f3.isbn10 === '9685927367' && f3.isbn13 === '9789685927321', f3.isbn10 + ' / ' + f3.isbn13);
chk('la ubicación y el código BV se importan', f1.ubicacion === 'Estante 3' && f1.codigo_bv === 'BV-1',
  f1.ubicacion + ' / ' + f1.codigo_bv);

console.log('\n— V. el motor ve el ISBN aunque venga separado —');
chk('ninguno cuenta como «sin ISBN»', M.indicadores().sin_isbn === 0, M.indicadores().sin_isbn + ' sin ISBN');
chk('el control de calidad lo da por capturado',
  M.checklist(M.estado.registros[1]).lista.filter(function (x) { return x.campo.indexOf('ISBN') > -1; })[0].ok);
chk('el canónico prefiere el de 13', M.isbnCanonico(M.estado.registros[0]) === '9788426128393',
  M.isbnCanonico(M.estado.registros[0]));

console.log('\n— W. procedencia capturada en el inventario —');
chk('la que trae la hoja se respeta', M.procedencia(M.estado.registros[0]) === 'Rincón' &&
  M.procedencia(M.estado.registros[1]) === 'General',
  M.procedencia(M.estado.registros[0]) + ' / ' + M.procedencia(M.estado.registros[1]));
chk('sin dato queda sin determinar', M.procedencia(M.estado.registros[2]) === 'Sin determinar');
chk('y queda dicho que no vino de una coincidencia',
  M.estado.registros[0].campos.procedencia.decision.indexOf('coincidencia') > -1);

console.log('\n— X. la aplicación no lleva datos de nadie dentro —');
var identificables = ['escuela', 'responsable', 'cicloTrabajo'];
var vacios = identificables.filter(function (k) { return !M.estado.config[k]; });
chk('los campos de identificación arrancan vacíos', vacios.length === 3,
  'traen valor: ' + identificables.filter(function (k) { return !!M.estado.config[k]; }).join(', '));
var fuentes = ['js/10-model.js', 'js/20-import.js', 'js/80-ui.js', 'js/00-util.js', 'index.html']
  .map(function (f) { return fs.readFileSync(path.join(raiz, f), 'utf8'); }).join('\n');
chk('ningún nombre de escuela quedó escrito en el código',
  !/Molino de Rosas|09DPR/i.test(fuentes),
  'hay un dato de una escuela concreta en el código publicado');

console.log('\n— Y. borrado y reinicio —');
chk('se puede vaciar la caché de consultas', typeof M.cache.vaciar === 'function');
chk('se puede restablecer la clasificación', typeof M.restablecerClasificacion === 'function');
chk('se puede borrar todo', typeof M.borrarTodo === 'function');
chk('se puede medir qué hay guardado', typeof M.diagnosticoAlmacenamiento === 'function');

console.log('\n— Z. importar una hoja con ISBN separados —');
var mCsv = I.detectarMapeo(['Título', 'Autor', 'ISBN-10', 'ISBN-13', 'Procedencia']);
chk('una hoja sin columna «ISBN» genérica sigue siendo importable',
  !!(mCsv.titulo != null || mCsv.isbn != null || mCsv.isbn10 != null || mCsv.isbn13 != null),
  JSON.stringify(mCsv));

console.log('\n— AA. cortacircuitos de fuentes (evidencia real: 136 consultas inútiles) —');
var F = LR.fuentes;
F.reiniciarCortacircuitos();
var err429 = new Error('HTTP 429'); err429.status = 429; err429.cuotaAgotada = true;
var errRed = new Error('Failed to fetch');
var err404 = new Error('HTTP 404'); err404.status = 404;

// La cuota agotada aparta de inmediato
F._siDisponible('googlebooks', function () { return Promise.resolve(null); });
chk('una fuente sana no está apartada', !F.fuenteApartada('googlebooks'));

console.log('\n— AB. la URL no viaja en el mensaje visible —');
var rTec = M.nuevoRegistro({ titulo: 'T' }, { tipo: 't', origen: 'x' });
M.observar(rTec, 'Google Books agotó su cuota de consultas y queda fuera de este lote.');
M.anotarTecnico(rTec, 'Google Books · HTTP 429 · https://www.googleapis.com/books/v1/volumes?q=algo');
chk('las observaciones no llevan URLs',
  !/https?:\/\//.test(M.observacionesTexto(rTec)), M.observacionesTexto(rTec).substring(0, 60));
chk('el detalle técnico se guarda aparte', rTec.tecnico.length === 1, rTec.tecnico.length + ' entradas');
chk('el técnico no crece sin límite', (function () {
  for (var i = 0; i < 30; i++) M.anotarTecnico(rTec, 'detalle ' + i);
  return rTec.tecnico.length <= 12;
})(), rTec.tecnico.length + ' entradas tras 30 anotaciones');

console.log('\n— AC. la exportación separa lo legible de lo técnico —');
M.estado.registros = [rTec];
rTec.n = 1;
var encT = E.tabla([rTec])[0];
chk('existe la columna «Diagnóstico técnico»', encT.indexOf('Diagnóstico técnico') > -1,
  encT.slice(-3).join(' | '));
chk('va al final, después de los campos del inventario',
  encT.indexOf('Diagnóstico técnico') === encT.length - 1);
chk('Observaciones sigue siendo una columna del inventario',
  encT.indexOf('Observaciones') > -1 && encT.indexOf('Observaciones') < encT.indexOf('Procedencia'));

console.log('\n=== ' + fallos + ' defectos ===');
if (fallos) process.exitCode = 1;
})();
