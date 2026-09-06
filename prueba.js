/* Prueba de humo: carga la app en jsdom, importa texto, simula respuestas de
   fuentes, procesa y exporta HTML/CSV. Detecta errores de ejecución reales. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const raiz = __dirname;
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://ejemplo.test/',
  pretendToBeVisual: true
});
const w = dom.window;

const errores = [];
w.addEventListener('error', e => errores.push('window error: ' + e.message));

// IndexedDB no existe en jsdom: la app debe caer al respaldo en localStorage.
// Red simulada: solo responde el servidor de portadas, y solo para un ISBN.
const PORTADA_EXISTE = ['8434880091', '9788434880092'];   // el servidor real indexa ambas formas
w.fetch = async (url) => {
  const u = String(url);
  if (u.indexOf('covers.openlibrary.org') > -1 && PORTADA_EXISTE.some(i => u.indexOf(i) > -1)) {
    const bytes = new Uint8Array(4000).fill(120);
    return { ok: true, status: 200, blob: async () => new w.Blob([bytes], { type: 'image/jpeg' }) };
  }
  if (u.indexOf('covers.openlibrary.org') > -1) return { ok: false, status: 404 };
  throw new Error('sin red en la prueba');
};
w.FileReader = w.FileReader || class { };

const archivos = [
  'data/taxonomia-curricular.js', 'data/clasificador-sep.js', 'data/sep-catalogo-pdf-1986-2006.js', 'data/sep-catalogo-primaria.js',
  'js/00-util.js', 'js/10-model.js', 'js/20-import.js', 'js/30-sources.js',
  'js/50-sep.js', 'js/40-matching.js', 'js/60-review.js', 'js/70-export.js', 'js/80-ui.js'
];
for (const f of archivos) {
  try {
    w.eval(fs.readFileSync(path.join(raiz, f), 'utf8'));
  } catch (e) {
    console.error('FALLA al cargar', f, '→', e.message);
    process.exit(1);
  }
}

const LR = w.LR;

function ok(nombre, cond, extra) {
  console.log((cond ? '  ok   ' : '  FALLA') + '  ' + nombre + (extra ? '  → ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

(async () => {
  console.log('\n— utilidades —');
  ok('ISBN-10 válido', LR.util.isbn.valido10('84-348-8009-1'));
  ok('ISBN-10 con dígito falso se rechaza', !LR.util.isbn.valido10('84-348-8009-3'));
  ok('ISBN-13 válido', LR.util.isbn.valido13('9789682941801'));
  ok('conversión 10→13', LR.util.isbn.a13('9681640729') === '9789681640729', LR.util.isbn.a13('9681640729'));
  ok('equivalencia 10/13', LR.util.isbn.equivalentes('9681640729', '9789681640729'));
  ok('ISBN en texto', LR.util.isbn.buscarEnTexto('ISBN 978-968-29-4180-1 al final')[0] === '9789682941801');
  ok('similitud alta', LR.util.similitud('El pizarrón encantado', 'El pizarron encantado') > 0.95);

  console.log('\n— índice SEP —');
  const sep = LR.sep;
  sep.construirIndice();
  ok('catálogo cargado', sep.total > 3000, sep.total + ' fichas');
  ok('catálogo PDF cargado', sep.totalPdf > 1000, sep.totalPdf + ' títulos');
  const b = sep.buscar('El camuflaje de los animales', '', '', 3);
  ok('búsqueda por título', b.length > 0 && b[0].puntos >= 90, b[0] && b[0].ficha.titulo);
  const b2 = sep.buscar('', '', '84-348-8009-1', 3);
  ok('búsqueda por ISBN', b2.length > 0 && b2[0].puntos === 100, b2[0] && b2[0].ficha.titulo);

  console.log('\n— importación de texto —');
  const mats = LR.importar.desdeTexto(
    'El camuflaje de los animales | Renée le Bloas | SM de Ediciones | 2001 | ISBN 84-348-8009-1\n' +
    'Stelaluna - Janell Cannon\n' +
    '---\n' +
    'El pizarrón encantado; Emilio Carballido; Petra Ediciones; 1992', 'prueba');
  ok('tres registros detectados', mats.length === 3, 'detectados ' + mats.length);
  ok('ISBN separado del título', mats[0].crudo.isbn === '8434880091', mats[0].crudo.isbn);
  ok('año detectado', mats[2].crudo.anio === '1992', mats[2].crudo.anio);

  const res = LR.importar.integrar(mats, { fusionar: true });
  ok('registros creados', res.creados === 3, 'creados ' + res.creados);
  ok('numeración asignada', LR.model.estado.registros[2].n === 3);

  console.log('\n— encabezados y división de líneas —');
  const mapeo = LR.importar.detectarMapeo(['Título del libro', 'Autor', 'Encuadernación', 'ISBN', 'Año de publicación']);
  ok('mapea las columnas reconocibles', mapeo.titulo === 0 && mapeo.autor === 1 && mapeo.isbn === 3 && mapeo.anio === 4, JSON.stringify(mapeo));
  ok('no inventa columna de código a partir de una letra', mapeo.codigo === undefined);

  const conGuion = LR.importar.desdeTexto('Delfin, el - ¡vaya fauna!', 'prueba de guion');
  ok('la división por guion queda declarada', conGuion[0].entrada.divisionDebil === true);
  const conBarra = LR.importar.desdeTexto('El camuflaje de los animales | Renée le Bloas | SM', 'prueba de barra');
  ok('un separador fuerte no levanta aviso', conBarra[0].entrada.divisionDebil === false &&
    conBarra[0].crudo.autor === 'Renée le Bloas', conBarra[0].crudo.autor);

  console.log('\n— fusión —');
  const res2 = LR.importar.integrar(
    LR.importar.desdeTexto('El camuflaje de los animales | Renée le Bloas', 'segunda lista'), { fusionar: true });
  ok('fusiona el mismo libro con el mismo autor', res2.fusionados === 1 && LR.model.estado.registros.length === 3,
    'fusionados ' + res2.fusionados + ', registros ' + LR.model.estado.registros.length);
  const res3 = LR.importar.integrar(
    LR.importar.desdeTexto('El camuflaje de los animales | Otro Autor Distinto', 'tercera lista'), { fusionar: true });
  ok('no fusiona si el autor no concuerda', res3.creados === 1, 'creados ' + res3.creados);
  LR.model.estado.registros.pop();

  console.log('\n— capa SEP aplicada al registro —');
  const reg = LR.model.estado.registros[0];
  // Coincidencia ≠ procedencia: sin verificar el sello, el catálogo solo propone.
  sep.aplicar(reg, b[0]);
  ok('sin procedencia verificada no se asienta el grado', !LR.model.valor(reg, 'grado'),
    '"' + LR.model.valor(reg, 'grado') + '"');
  ok('sin procedencia verificada no se asienta la categoría', !LR.model.valor(reg, 'categoria_sep'));
  ok('pero la clasificación queda propuesta a la vista', !!reg.propuestaSep && !!reg.propuestaSep.grado,
    reg.propuestaSep ? reg.propuestaSep.grado : 'sin propuesta');
  ok('y el registro pide verificar la procedencia',
    reg.revision.motivos.indexOf('Procedencia sin verificar') > -1, reg.revision.motivos.join(', '));
  // Ahora sí: alguien revisó el ejemplar y encontró el sello oficial.
  LR.model.fijarProcedencia(reg, 'Rincón');
  sep.aplicar(reg, b[0]);
  ok('grado tomado del catálogo', !!LR.model.valor(reg, 'grado'), LR.model.valor(reg, 'grado'));
  ok('serie lectora como subserie', !!LR.model.valor(reg, 'subserie'), LR.model.valor(reg, 'subserie'));
  ok('reseña SEP con prioridad', LR.model.valor(reg, 'resena').length > 40);
  ok('categoría registrada', !!LR.model.valor(reg, 'categoria_sep'), LR.model.valor(reg, 'categoria_sep'));
  ok('sin color inventado', LR.model.valor(reg, 'color') === '', '"' + LR.model.valor(reg, 'color') + '"');

  console.log('\n— tabla curricular —');
  sep.semilla();
  ok('semilla con categorías reales', LR.model.estado.taxonomia.length > 50, LR.model.estado.taxonomia.length + ' categorías');
  const r = sep.importarTaxonomia([
    ['Categoría SEP', 'Disciplina', 'Color', 'Contenidos', 'Saberes'],
    [LR.model.valor(reg, 'categoria_sep'), 'Saberes y pensamiento científico', 'Verde', 'Seres vivos y su entorno', 'Observación y registro']
  ]);
  ok('importación de taxonomía', r.actualizadas + r.agregadas === 1, JSON.stringify(r));
  sep.aplicarTaxonomia(reg);
  ok('un libro de Rincón no recibe color inventado', LR.model.valor(reg, 'color') === '',
    '"' + LR.model.valor(reg, 'color') + '"');
  const regGen = LR.model.nuevoRegistro({ titulo: 'Libro donado de prueba' }, { tipo: 'texto', origen: 'p' });
  LR.model.fijarProcedencia(regGen, 'General');
  LR.model.fijarCampo(regGen, 'categoria_sep', LR.model.valor(reg, 'categoria_sep'), 'manual', 100, '');
  sep.aplicarTaxonomia(regGen);
  ok('color desde la tabla para el acervo General', LR.model.valor(regGen, 'color') === 'Verde',
    LR.model.valor(regGen, 'color'));
  ok('contenidos y saberes sin recortar', LR.model.valor(reg, 'contenidos_saberes').indexOf('Observación y registro') > -1);

  console.log('\n— clasificador oficial de Eduardo —');
  const clasif = JSON.parse(fs.readFileSync(path.join(raiz, 'prueba-clasificador.json'), 'utf8'));
  const imp = sep.importarTaxonomia(clasif);
  ok('encuentra el encabezado aunque esté a media hoja', !imp.error, JSON.stringify(imp));
  ok('agrupa las 12 categorías oficiales', imp.categorias === 12, imp.categorias + ' categorías');
  const narrativa = sep.filaTaxonomia('Narrativa');
  ok('junta los contenidos de una categoría', (narrativa.contenidos.match(/ · /g) || []).length === 10, narrativa.contenidos.slice(0, 80));
  ok('no duplica contenidos en saberes', narrativa.saberes === '', '"' + narrativa.saberes + '"');
  ok('conserva color, palabra clave y grado sugerido',
    narrativa.color === 'Azul' && narrativa.palabra_clave === 'Narrativa' && !!narrativa.grado_sugerido,
    narrativa.color + ' / ' + narrativa.palabra_clave + ' / ' + narrativa.grado_sugerido);
  ok('copia el contenido largo sin recortar',
    narrativa.contenidos.indexOf('Narrativa contemporánea (universal / latinoamericana / mexicana)') > -1);

  // El mismo clasificador en la disposición anterior del archivo (la tabla
  // hasta abajo, en la fila 110) debe leerse igual.
  const antes = JSON.parse(fs.readFileSync(path.join(raiz, 'prueba-clasificador-original.json'), 'utf8'));
  const impAntes = sep.importarTaxonomia(antes);
  ok('lee igual el archivo en su disposición anterior',
    impAntes.categorias === 12 && impAntes.filasLeidas === 69, JSON.stringify(impAntes));

  const puente = sep.construirPuente();
  ok('el puente liga etiquetas del catálogo con las oficiales', Object.keys(puente).length >= 40, Object.keys(puente).length + ' vinculadas');
  ok('no liga por parecido de letras sin palabras en común',
    puente[LR.util.norm('Tecnología')].categoria === 'Los objetos y su funcionamiento (Tecnología)',
    puente[LR.util.norm('Tecnología')].categoria);
  ok('el nombre de la categoría pesa más que un contenido suelto',
    puente[LR.util.norm('Las palabras')].categoria.indexOf('Las palabras') === 0,
    puente[LR.util.norm('Las palabras')].categoria);
  ok('deja sin vincular lo que no tiene equivalencia', puente[LR.util.norm('Cuentos clásicos')] === undefined);
  ok('"Mitos y leyendas" cae en Narrativa', puente[LR.util.norm('Mitos y leyendas')].categoria === 'Narrativa');
  ok('"El cuerpo" cae en La naturaleza y El cuerpo',
    puente[LR.util.norm('El cuerpo')].categoria === 'La naturaleza y El cuerpo',
    puente[LR.util.norm('El cuerpo')].motivo.slice(0, 70));
  ok('cada vínculo trae su explicación', puente[LR.util.norm('Cuentos de humor')].motivo.length > 20,
    puente[LR.util.norm('Cuentos de humor')].motivo.slice(0, 90));

  sep.fijarPuenteManual('Diccionarios', 'Las palabras (Diccionarios, enciclopedias, atlas y almanaques)');
  ok('un vínculo puesto a mano manda sobre el parecido',
    sep.resolverCategoria('Diccionarios').fila.categoria.indexOf('Las palabras') === 0 &&
    sep.resolverCategoria('Diccionarios').confianza === 100);

  ok('el clasificador aporta el color de sus categorías',
    sep.resolverCategoria('El cuerpo').fila.color === 'Azul cielo', sep.resolverCategoria('El cuerpo').fila.color);
  sep.aplicarTaxonomia(reg);
  ok('una fila propia de la categoría manda sobre el puente',
    sep.resolverCategoria(LR.model.valor(reg, 'categoria_sep')).fila.color === 'Verde',
    sep.resolverCategoria(LR.model.valor(reg, 'categoria_sep')).fila.color);
  ok('el grado del clasificador no pisa el del catálogo', LR.model.valor(reg, 'grado') === '1°', LR.model.valor(reg, 'grado'));
  ok('el vínculo aproximado deja la ficha en revisión',
    reg.revision.motivos.indexOf('Vínculo de categoría por confirmar') > -1 || reg.curricular.confianza >= 95,
    'confianza ' + reg.curricular.confianza);

  console.log('\n— puntuación y conflicto —');
  const cand = LR.fuentes.candidato('openlibrary', {
    id: 'OL1M', olid: 'OL1M', titulo: 'El camuflaje de los animales',
    autores: ['Renée le Bloas'], editorial: 'SM de Ediciones', anio: '2001',
    isbn: '8434880091', portadaUrl: 'https://covers.openlibrary.org/b/isbn/8434880091-L.jpg'
  });
  const p = LR.matching.puntuar(reg, cand);
  ok('ISBN exacto puntúa 100', p.score === 100, p.score + ' / ' + p.tipo);

  const candOtro = LR.fuentes.candidato('googlebooks', {
    id: 'GB1', titulo: 'El camuflaje de los animales', autores: ['Renée le Bloas'],
    editorial: 'Editorial Distinta', anio: '2009', isbn: '9789999999999'
  });
  const p2 = LR.matching.puntuar(reg, candOtro);
  ok('editorial y año distintos no confirman', p2.score < 95, p2.score + ' / ' + p2.tipo);

  await LR.matching._cerrar(reg, p, [p, p2]);
  ok('edición fijada', !!reg.edicion && reg.edicion.isbn10 === '8434880091');
  ok('portada verificada por ISBN exacto', reg.portada.verificada === true && !!reg.portada.dataUrl, reg.portada.url);
  ok('portada pedida con default=false', reg.portada.url.indexOf('default=false') > -1, reg.portada.url);
  ok('conflicto detectado', reg.conflictos.length > 0, reg.conflictos.map(c => c.campo + ':' + c.tipo).join(', '));
  ok('no se declara confirmado con conflicto abierto', reg.estado !== 'CONFIRMADO', reg.estado);

  console.log('\n— portada inexistente —');
  const regSinPortada = LR.model.estado.registros[2];
  LR.model.fijarCampo(regSinPortada, 'isbn', '9789999999999', 'manual', 100, 'prueba');
  regSinPortada.candidatos = [];
  await LR.matching.resolverPortada(regSinPortada);
  ok('sin portada real no se inventa imagen', regSinPortada.portada.url === '' && regSinPortada.portada.fuente === 'sin_portada');
  ok('queda anotado en revisión', regSinPortada.revision.motivos.indexOf('Sin portada') > -1);

  console.log('\n— decisiones de la persona —');
  const antesEditorial = LR.model.valor(reg, 'editorial');
  ok('la editorial sale de la edición identificada por ISBN', antesEditorial === 'SM de Ediciones', antesEditorial);
  LR.revision.conservarValor(reg, 'editorial', 'googlebooks');
  ok('se puede imponer el valor de otra fuente desde la comparación',
    LR.model.valor(reg, 'editorial') === 'Editorial Distinta', LR.model.valor(reg, 'editorial'));
  ok('queda marcado como decisión de la persona', LR.model.decididoPorPersona(reg, 'editorial'));
  ok('conservarValor rechaza una fuente sin evidencia', LR.revision.conservarValor(reg, 'editorial', 'loc') === false);
  LR.sep.aplicar(reg, b[0]);
  ok('reaplicar el catálogo SEP no pisa la decisión humana', LR.model.decididoPorPersona(reg, 'editorial'));
  LR.model.fijarCampo(reg, 'grado', '5°', 'manual', 100, 'prueba');
  LR.sep.aplicar(reg, b[0]);
  ok('el grado capturado a mano tampoco se pisa', LR.model.valor(reg, 'grado') === '5°', LR.model.valor(reg, 'grado'));

  console.log('\n— severidad y conflictos resueltos —');
  const regSev = LR.model.estado.registros[1];
  LR.model.aRevision(regSev, 'Sin portada', 'baja');
  LR.model.aRevision(regSev, 'Varias ediciones posibles', 'alta');
  ok('la severidad se queda con la más alta', regSev.revision.severidad === 'alta', regSev.revision.severidad);
  ok('la cola se puede filtrar por motivo', LR.revision.cola({ motivo: 'Varias ediciones posibles' }).length === 1);

  const cfEd = reg.conflictos.filter(c => c.campo === 'editorial')[0];
  LR.revision.resolverConflicto(reg, cfEd.id, 'SM de Ediciones', 'Es la edición que tenemos en el estante');
  LR.matching.detectarConflictos(reg);
  const reabierto = reg.conflictos.filter(c => c.campo === 'editorial' && !c.resolucion).length;
  ok('un conflicto resuelto no se reabre al reprocesar', reabierto === 0, reabierto + ' reabiertos');

  console.log('\n— revisión —');
  reg.conflictos.slice().forEach(c => LR.revision.resolverConflicto(reg, c.id, c.valores[0].valor, 'prueba'));
  ok('conflictos resueltos', reg.conflictos.every(c => !!c.resolucion));
  const cierre = LR.revision.marcarCompletado(reg);
  ok('se puede completar sin conflictos', cierre.ok === true, JSON.stringify(cierre.pendientes));

  console.log('\n— control de calidad —');
  const chk = LR.model.checklist(reg);
  ok('checklist responde', chk.lista.length === 17, chk.lista.length + ' comprobaciones');
  ok('pendientes declarados', Array.isArray(chk.pendientes), chk.pendientes.join(', ') || 'ninguno');

  console.log('\n— exportación —');
  const conAbierto = LR.model.estado.registros[0];
  conAbierto.estado = 'CONFIRMADO';
  conAbierto.conflictos.push({ id: 'cf-x', campo: 'anio', tipo: 'DISCREPANCIA ENTRE FUENTES', severidad: 'media', valores: [], impacto: '', explicacion: '', resolucion: '' });
  ok('un conflicto abierto excluye al registro de los confirmados',
    LR.exportar.seleccion('confirmados').indexOf(conAbierto) === -1);
  conAbierto.conflictos = conAbierto.conflictos.filter(c => c.id !== 'cf-x');

  const ficha = LR.exportar.ficha(reg);
  ok('ficha con los 16 campos', ['portadaEstado', 'titulo', 'contenidos_saberes', 'subserie'].every(k => k in ficha));
  const tabla = LR.exportar.tabla(LR.model.estado.registros);
  // Debe coincidir columna por columna con la hoja "Inventario" de Biblioteca
  // Viva: si divergen, la exportación deja de poder pegarse directo.
  ok('encabezados exactos del documento', tabla[0].slice(0, 20).join('|') ===
    'Portada|N°|Título|Autor|Editorial|Año|ISBN-10|ISBN-13|Estado físico|Reseña del libro|Grado|Tipo de texto|Categoría SEP|Contenidos y Saberes|Color|Subserie (SEP – Libros del Rincón)|Observaciones|Ubicación|Código Biblioteca Viva|Procedencia',
    tabla[0].slice(0, 20).join('|'));
  ok('ISBN-13 derivado del ISBN-10 por conversión exacta', (function () {
    const t = LR.model.nuevoRegistro({ titulo: 'ISBN' }, { tipo: 'texto', origen: 'p' });
    LR.model.fijarCampo(t, 'isbn', '9681640721', 'entrada', 100, '');
    LR.model.derivarIsbn(t);
    return LR.model.valor(t, 'isbn13') === '9789681640729';
  })());
  const blobHtml = LR.exportar.aHtml(LR.model.estado.registros, { titulo: 'Prueba' });
  ok('HTML generado', blobHtml && blobHtml.size > 1000, blobHtml.size + ' bytes');
  const blobCsv = LR.exportar.aCsv(LR.model.estado.registros);
  ok('CSV generado', blobCsv && blobCsv.size > 100, blobCsv.size + ' bytes');

  console.log('\n— interfaz —');
  const secciones = ['inicio', 'importar', 'procesamiento', 'resultados', 'revision', 'catalogo', 'fuentes', 'clasificacion', 'exportacion', 'ajustes'];
  for (const s of secciones) {
    try {
      LR.ui.ir(s);
      const cont = w.document.querySelector('#s-' + s);
      ok('sección ' + s, cont.innerHTML.length > 200, cont.innerHTML.length + ' caracteres');
    } catch (e) {
      ok('sección ' + s, false, e.message);
    }
  }
  LR.ui.abrirFicha(reg.id);
  ok('panel de ficha', w.document.querySelector('#panel-cuerpo').innerHTML.indexOf('Estado físico') > -1);
  for (const t of ['comparacion', 'evidencia', 'candidatos', 'portada', 'calidad']) {
    try {
      LR.ui.pestanaActual = t; LR.ui.pintarFicha();
      ok('pestaña ' + t, w.document.querySelector('#cuerpo-pestana').innerHTML.length > 50);
    } catch (e) { ok('pestaña ' + t, false, e.message); }
  }

  console.log('\n— guardado auditable —');
  await LR.model.guardar();
  ok('el guardado deja constancia de por dónde se guardó',
    LR.model.ultimoGuardado.ok === true && LR.model.ultimoGuardado.medio.indexOf('localStorage') === 0,
    LR.model.ultimoGuardado.medio);
  const almacenReal = w.localStorage;
  Object.defineProperty(w, 'localStorage', {
    configurable: true,
    value: { setItem() { throw new Error('cuota agotada'); }, getItem() { return null; }, removeItem() { } }
  });
  await LR.model.guardar();
  ok('un guardado imposible se declara, no se silencia', LR.model.ultimoGuardado.ok === false, LR.model.ultimoGuardado.error);
  ok('la interfaz muestra el aviso que no se va solo', w.document.getElementById('aviso-fijo').hidden === false);
  Object.defineProperty(w, 'localStorage', { configurable: true, value: almacenReal });

  console.log('\n— sin red: la app no se rompe —');
  const reg2 = LR.model.estado.registros[1];
  await LR.matching.procesar(reg2);
  ok('registro sin fuentes queda sin resultado, no inventado', ['SIN RESULTADO', 'REVISIÓN'].indexOf(reg2.estado) > -1, reg2.estado);
  ok('no se inventó ISBN', LR.model.valor(reg2, 'isbn') === '', '"' + LR.model.valor(reg2, 'isbn') + '"');
  const obs = LR.model.observacionesTexto(reg2);
  ok('la caída de las fuentes queda anotada en la ficha', obs.indexOf('no respondió') > -1, obs.substring(0, 120));

  console.log('\nerrores de ventana: ' + (errores.length ? errores.join(' | ') : 'ninguno'));
})();
