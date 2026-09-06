/* =========================================================================
   80-ui.js — Interfaz (§28-§31)
   Cada pantalla muestra de dónde salió cada dato. Nada se presenta como
   confirmado si el motor no lo confirmó.
   ========================================================================= */
(function (global) {
  'use strict';

  var U = global.LR.util, M = global.LR.model, I = global.LR.importar,
    F = global.LR.fuentes, S = global.LR.sep, X = global.LR.matching,
    R = global.LR.revision, E = global.LR.exportar;

  var UI = { pendientes: [], hojaCargada: null, filtro: { texto: '', estado: '' } };

  /* ---------- utilidades de interfaz ---------- */

  var tmpAviso;
  // Aviso que no desaparece solo: se usa cuando el proyecto no se pudo guardar,
  // que es lo único que puede costarle a alguien horas de trabajo.
  UI.avisoPersistente = function (texto) {
    var n = U.$('#aviso-fijo');
    if (!texto) { n.hidden = true; n.textContent = ''; return; }
    n.textContent = texto;
    n.hidden = false;
  };

  UI.aviso = function (texto) {
    var n = U.$('#aviso');
    n.textContent = texto;
    n.hidden = false;
    clearTimeout(tmpAviso);
    tmpAviso = setTimeout(function () { n.hidden = true; }, 4200);
  };

  var CLASES_ESTADO = {
    'NUEVO': 'e-nuevo', 'EXTRAYENDO': 'e-extrayendo', 'EN BÚSQUEDA': 'e-busqueda',
    'CANDIDATO': 'e-candidato', 'IDENTIFICADO': 'e-identificado', 'REVISIÓN': 'e-revision',
    'CONFIRMADO': 'e-confirmado', 'SIN RESULTADO': 'e-sin', 'COMPLETADO': 'e-completado', 'ERROR': 'e-error'
  };

  UI.claseEstado = function (estado) {
    return 'marca-estado ' + (CLASES_ESTADO[estado] || 'e-nuevo');
  };

  UI.marcaEstado = function (estado) {
    return '<span class="' + UI.claseEstado(estado) + '">' + U.esc(estado) + '</span>';
  };

  UI.panel = function (titulo, html) {
    U.$('#panel-titulo').textContent = titulo;
    U.$('#panel-cuerpo').innerHTML = html;
    var fondo = U.$('#panel-fondo');
    fondo.hidden = false;
    fondo.style.display = '';   // por si una hoja de estilos vieja quedó en caché
    U.$('#panel-cuerpo').scrollTop = 0;
  };

  // Se oculta por atributo y también por estilo en línea. El atributo es lo
  // correcto, pero pierde en la cascada frente a cualquier clase que declare
  // display, y GitHub Pages puede seguir sirviendo la hoja anterior desde la
  // caché durante un buen rato: el estilo en línea cierra el panel igual.
  UI.cerrarPanel = function () {
    var fondo = U.$('#panel-fondo');
    if (!fondo) return;
    fondo.hidden = true;
    fondo.style.display = 'none';
  };

  /* ---------- navegación ---------- */

  var SECCIONES = ['inicio', 'importar', 'procesamiento', 'resultados', 'revision',
    'catalogo', 'fuentes', 'clasificacion', 'exportacion', 'ajustes'];

  UI.ir = function (nombre) {
    if (SECCIONES.indexOf(nombre) === -1) nombre = 'inicio';
    SECCIONES.forEach(function (s) { U.$('#s-' + s).hidden = s !== nombre; });
    U.$$('.navegacion a').forEach(function (a) {
      a.classList.toggle('activo', a.getAttribute('data-seccion') === nombre);
    });
    UI['render_' + nombre]();
    UI.actualizarCabecera();
  };

  UI.actualizarCabecera = function () {
    var ind = M.indicadores();
    U.$('#estado-global').textContent = S.total.toLocaleString('es-MX') + ' fichas SEP cargadas · ' +
      ind.recibidos + ' registros en el proyecto · ' + ind.en_revision + ' en revisión';
    U.$('#nav-revision').textContent = ind.en_revision;
  };

  /* ================= INICIO ================= */

  UI.render_inicio = function () {
    var ind = M.indicadores(), cob = S.cobertura();
    var n = U.$('#s-inicio');
    n.innerHTML =
      '<h1>Del ejemplar en la mano a la ficha con portada</h1>' +
      '<p class="entrada">La aplicación recibe listas, tablas, documentos, fotos y ligas; identifica el libro y, cuando es posible, la edición concreta; cruza el catálogo histórico de Libros del Rincón; y genera el documento con la portada incrustada. Todo dato conserva su fuente, y lo que no se pudo confirmar se declara como pendiente en lugar de rellenarse.</p>' +

      '<div class="ledger">' +
      [['recibidos', 'Libros recibidos'], ['identificados', 'Identificados'], ['alta_confianza', 'Alta confianza'],
       ['en_revision', 'En revisión'], ['sin_isbn', 'Sin ISBN'], ['conflicto_edicion', 'Conflicto de edición'],
       ['sin_portada', 'Sin portada'], ['no_identificados', 'No identificados'], ['completados', 'Completados']]
        .map(function (p) { return '<div><b>' + ind[p[0]] + '</b><span>' + p[1] + '</span></div>'; }).join('') +
      '</div>' +

      '<div class="acciones">' +
      '<button class="btn" data-ir="importar">Importar libros</button>' +
      '<button class="btn btn-secundario" data-ir="procesamiento">Procesar pendientes</button>' +
      '<button class="btn btn-secundario" data-ir="exportacion">Generar documento</button>' +
      '</div>' +

      '<h2>Lo que hay cargado</h2>' +
      '<div class="rejilla">' +
      '<div class="tarjeta"><h3>Catálogo histórico SEP</h3><p class="nota">' +
      S.total.toLocaleString('es-MX') + ' fichas de Libros del Rincón (Primaria, ciclos 2003-2004 a 2018-2019) y ' +
      S.totalPdf.toLocaleString('es-MX') + ' títulos del catálogo histórico 1986-2006 como evidencia secundaria.</p>' +
      '<button class="btn btn-secundario btn-mini" data-ir="catalogo">Consultar catálogo</button></div>' +

      '<div class="tarjeta"><h3>Tabla curricular</h3><p class="nota">' + cob.categorias + ' categorías; ' +
      cob.conColor + ' con color y ' + cob.conContenidos + ' con contenidos y saberes. Los campos vacíos no se inventan: se importan de tu clasificador.</p>' +
      '<button class="btn btn-secundario btn-mini" data-ir="clasificacion">Completar tabla</button></div>' +

      '<div class="tarjeta"><h3>Fuentes activas</h3><p class="nota">' +
      F.activas().map(function (k) { return M.nombreFuente(k); }).join(', ') + '.</p>' +
      '<button class="btn btn-secundario btn-mini" data-ir="fuentes">Ver estado de fuentes</button></div>' +
      '</div>';
  };

  /* ================= IMPORTAR (§29) ================= */

  UI.render_importar = function () {
    var n = U.$('#s-importar');
    n.innerHTML =
      '<h1>Importar</h1>' +
      '<p class="entrada">Puedes combinar entradas: una tabla de Excel con los títulos, una foto del anaquel, y las ligas de las fichas que ya tengas. Cada aporte queda ligado al registro con su procedencia.</p>' +

      '<div class="tarjeta"><h3>Archivos</h3>' +
      '<div class="soltar" id="zona-soltar" tabindex="0" role="button">Arrastra aquí archivos o haz clic para elegirlos<br>' +
      '<span class="nota">TXT · CSV · XLSX · DOCX · PNG · JPG · WEBP</span></div>' +
      '<input type="file" id="archivo" multiple accept=".txt,.csv,.xlsx,.xls,.docx,.png,.jpg,.jpeg,.webp" hidden>' +
      '<p class="nota" id="estado-archivo"></p></div>' +

      '<div class="tarjeta"><h3>Texto pegado</h3>' +
      '<label for="texto-pegado">Un libro por línea, o una tabla copiada de Excel</label>' +
      '<textarea id="texto-pegado" placeholder="El pizarrón encantado | Emilio Carballido | Petra Ediciones | 1992 | ISBN 9789682941801"></textarea>' +
      '<div class="acciones"><button class="btn" id="btn-texto">Analizar texto</button></div></div>' +

      '<div class="tarjeta"><h3>Ligas</h3>' +
      '<label for="urls">Una URL por línea</label>' +
      '<textarea id="urls" style="min-height:5rem" placeholder="https://…"></textarea>' +
      '<p class="nota">El navegador solo puede leer sitios que autoricen la consulta. Si una liga falla, configura un proxy propio en Ajustes; sin él, la liga queda registrada como pendiente y no se sustituye por otra fuente.</p>' +
      '<div class="acciones"><button class="btn" id="btn-urls">Leer ligas</button></div></div>' +

      '<div id="previa"></div>';

    var zona = U.$('#zona-soltar'), input = U.$('#archivo');
    zona.addEventListener('click', function () { input.click(); });
    zona.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('encima'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('encima'); });
    });
    zona.addEventListener('drop', function (e) { UI.recibirArchivos(e.dataTransfer.files); });
    input.addEventListener('change', function () { UI.recibirArchivos(input.files); });

    U.$('#btn-texto').addEventListener('click', function () {
      var t = U.$('#texto-pegado').value;
      if (!U.limpia(t)) return UI.aviso('No hay texto que analizar.');
      UI.proponer(I.desdeTexto(t, 'texto pegado'), 'texto pegado');
    });

    U.$('#btn-urls').addEventListener('click', function () {
      var urls = U.$('#urls').value.split(/\s+/).filter(function (u) { return /^https?:\/\//.test(u); });
      if (!urls.length) return UI.aviso('Escribe al menos una URL completa (con https://).');
      U.$('#btn-urls').disabled = true;
      U.$('#btn-urls').textContent = 'Leyendo ' + urls.length + ' liga(s)…';
      var materiales = [], fallos = [];
      Promise.all(urls.map(function (u) {
        return I.leerUrl(u).then(function (d) {
          if (!d.titulo && !d.isbn) { fallos.push(u + ': la página no expone datos bibliográficos legibles'); return; }
          materiales.push({
            crudo: { titulo: d.titulo, autor: d.autor, editorial: d.editorial, anio: d.anio, isbn: d.isbn, resena: d.resena },
            entrada: { tipo: 'url', origen: u, fecha: U.ahora(), detalle: 'consulta directa', portadaWeb: d.portada }
          });
        }).catch(function (e) { fallos.push(u + ': ' + e.message); });
      })).then(function () {
        U.$('#btn-urls').disabled = false;
        U.$('#btn-urls').textContent = 'Leer ligas';
        if (fallos.length) UI.aviso(fallos.length + ' liga(s) no se pudieron leer; se detallan abajo.');
        UI.proponer(materiales, 'ligas', fallos);
      });
    });
  };

  UI.recibirArchivos = function (lista) {
    var archivos = Array.prototype.slice.call(lista || []);
    if (!archivos.length) return;
    var est = U.$('#estado-archivo');
    var materiales = [], problemas = [];
    var i = 0;

    function siguiente() {
      if (i >= archivos.length) {
        est.textContent = archivos.length + ' archivo(s) leídos.';
        UI.proponer(materiales, 'archivos', problemas);
        return;
      }
      var a = archivos[i], nombre = a.name, ext = nombre.split('.').pop().toLowerCase();
      est.textContent = 'Leyendo ' + nombre + '…';

      var tarea;
      if (ext === 'txt') {
        tarea = a.text().then(function (t) {
          materiales = materiales.concat(I.desdeTexto(t, nombre));
        });
      } else if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
        // Elegir la hoja y revisar las columnas es una decisión de la persona, y
        // tarda lo que tarde. Antes la promesa se daba por cumplida en cuanto se
        // abría el panel, así que el resto del proceso seguía adelante y pintaba
        // «Nada que importar» debajo, con la lista todavía vacía. Aquí se espera
        // de verdad a que acepte o cancele.
        tarea = I.leerHoja(a).then(function (libro) {
          return new Promise(function (listo) {
            UI.elegirHoja(libro, nombre, function (mats) {
              if (!mats || !mats.length) {
                problemas.push(nombre + ': no se obtuvo ninguna fila con las columnas asignadas. Revisa que la columna del título esté marcada.');
              }
              materiales = materiales.concat(mats || []);
              listo();
            }, function () {          // canceló
              problemas.push(nombre + ': importación cancelada.');
              listo();
            });
          });
        }).catch(function (e) {
          // Si el CDN de la biblioteca de hojas no carga —red de la escuela,
          // sin conexión, un bloqueador— el archivo no se lee y antes eso se
          // quedaba en un mensaje mudo. Aquí se dice qué pasó y qué hacer.
          problemas.push(nombre + ': no se pudo leer la hoja de cálculo (' + e.message +
            '). Suele ser que no se alcanzó el componente que lee estos archivos: revisa la conexión, ' +
            'o guarda el archivo como .txt separado por tabuladores y súbelo así.');
          throw e;
        });
      } else if (ext === 'docx') {
        tarea = I.leerDocx(a).then(function (d) {
          var deTabla = [];
          d.tablas.forEach(function (t) {
            if (t.length < 2) return;
            var mapeo = I.detectarMapeo(t[0]);
            if (Object.keys(mapeo).length >= 2) {
              deTabla = deTabla.concat(I.filasAMateriales(t.slice(1), mapeo, { tipo: 'docx-tabla', origen: nombre }));
            }
          });
          materiales = materiales.concat(deTabla.length ? deTabla : I.desdeTexto(d.texto, nombre));
        });
      } else if (['png', 'jpg', 'jpeg', 'webp'].indexOf(ext) > -1) {
        est.textContent = 'Leyendo texto de ' + nombre + ' (OCR)…';
        tarea = I.leerImagen(a, function (p) { est.textContent = 'OCR de ' + nombre + ': ' + p + '%'; }).then(function (r) {
          if (r.error) problemas.push(nombre + ': el OCR no se pudo ejecutar (' + r.error + '). La imagen se conserva como evidencia para transcribir a mano.');
          var mats = I.desdeTexto(r.texto, nombre);
          if (!mats.length) {
            problemas.push(nombre + ': no se reconoció texto suficiente. Se crea un registro con la imagen como evidencia.');
            mats = [{ crudo: { titulo: '' }, entrada: { tipo: 'imagen', origen: nombre, fecha: U.ahora(), detalle: 'sin texto reconocido' } }];
          }
          mats.forEach(function (m) {
            m.entrada.imagen = r.dataUrl;
            m.entrada.confianzaOCR = r.confianzaOCR;
            m.entrada.tipo = 'imagen';
            if (r.confianzaOCR && r.confianzaOCR < 70) m.entrada.detalle = 'OCR de baja confianza (' + r.confianzaOCR + '%)';
          });
          materiales = materiales.concat(mats);
        });
      } else {
        problemas.push(nombre + ': formato no admitido.');
        tarea = Promise.resolve();
      }

      tarea.catch(function (e) { problemas.push(nombre + ': ' + e.message); }).then(function () {
        i++;
        siguiente();
      });
    }
    siguiente();
  };

  // Selección de hoja y mapeo de columnas para tablas (§29)
  UI.elegirHoja = function (libro, nombre, alAceptar, alCancelar) {
    function pinta(hoja) {
      var filas = libro.filasDe(hoja);
      var enc = filas[0] || [];
      var mapeo = I.detectarMapeo(enc);
      var campos = Object.keys(I.ALIAS);
      var html = '<p class="nota">Archivo <strong>' + U.esc(nombre) + '</strong> · ' + (filas.length - 1) + ' filas de datos.</p>' +
        '<label for="sel-hoja">Hoja</label><select id="sel-hoja">' +
        libro.hojas.map(function (h) { return '<option' + (h === hoja ? ' selected' : '') + '>' + U.esc(h) + '</option>'; }).join('') +
        '</select>' +
        '<h3>Columnas</h3><p class="nota">Revisa la correspondencia antes de importar. Lo que dejes sin asignar no se inventa.</p>' +
        '<div class="tabla-envoltura"><table><thead><tr><th>Campo</th><th>Columna del archivo</th><th>Ejemplo</th></tr></thead><tbody>' +
        campos.map(function (c) {
          var sel = mapeo[c];
          return '<tr><td>' + U.esc(c) + '</td><td><select data-campo="' + c + '"><option value="">— no importar —</option>' +
            enc.map(function (h, idx) {
              return '<option value="' + idx + '"' + (sel === idx ? ' selected' : '') + '>' + U.esc(h || ('columna ' + (idx + 1))) + '</option>';
            }).join('') + '</select></td><td class="nota">' +
            U.esc(sel != null && filas[1] ? String(filas[1][sel] || '') : '') + '</td></tr>';
        }).join('') +
        '</tbody></table></div>' +
        '<div class="acciones"><button class="btn" id="btn-mapeo">Importar filas</button>' +
        '<button class="btn btn-secundario" id="btn-cancelar-hoja">Cancelar</button></div>';
      UI.panel('Importar tabla', html);

      U.$('#sel-hoja').addEventListener('change', function () { pinta(this.value); });
      U.$('#btn-cancelar-hoja').addEventListener('click', function () {
        UI.cerrarPanel();
        if (alCancelar) alCancelar();
      });
      U.$('#btn-mapeo').addEventListener('click', function () {
        var m = {};
        U.$$('#panel-cuerpo select[data-campo]').forEach(function (s) {
          if (s.value !== '') m[s.getAttribute('data-campo')] = parseInt(s.value, 10);
        });
        // Cualquiera de las tres columnas de ISBN sirve como identificador: al
        // separar ISBN-10 e ISBN-13 esta comprobación seguía exigiendo la
        // columna genérica «isbn», que ya no existe en la hoja Inventario, y
        // rechazaba archivos perfectamente válidos.
        if (!m.titulo && !m.isbn && !m.isbn10 && !m.isbn13) {
          return UI.aviso('Asigna al menos el título o alguna columna de ISBN.');
        }
        var mats = I.filasAMateriales(filas.slice(1), m, { tipo: 'tabla', origen: nombre + ' · ' + hoja });
        UI.cerrarPanel();
        alAceptar(mats);
      });
    }
    pinta(libro.hojas[0]);
  };

  UI.proponer = function (materiales, origen, problemas) {
    UI.pendientes = materiales;
    var n = U.$('#previa');
    if (!materiales.length) {
      n.innerHTML = '<div class="tarjeta"><h3>Nada que importar</h3><p class="nota">No se detectaron registros en ' + U.esc(origen) + '.' +
        (problemas && problemas.length ? '<br>' + problemas.map(U.esc).join('<br>') : '') + '</p></div>';
      return;
    }
    var conIsbn = materiales.filter(function (m) { return m.crudo.isbn; }).length;
    var sinTitulo = materiales.filter(function (m) { return !m.crudo.titulo; }).length;
    // Un solo índice para contar coincidencias: antes cada entrada recorría el
    // acervo completo y una lista de 300 títulos sobre 700 registros tardaba
    // segundos solo para mostrar el número.
    var idxPrevia = I.indiceRegistros(M.estado.registros, I.UMBRAL_FUSION);
    var posiblesDuplicados = materiales.filter(function (m) {
      return I.buscarSimilar(m.crudo, M.estado.registros, idxPrevia);
    }).length;

    n.innerHTML = '<div class="tarjeta"><h3>Registros detectados en ' + U.esc(origen) + '</h3>' +
      '<p class="nota">' + materiales.length + ' entradas · ' + conIsbn + ' con ISBN · ' + sinTitulo + ' sin título legible · ' +
      posiblesDuplicados + ' coinciden con registros que ya tienes.</p>' +
      ((problemas && problemas.length) ? '<div class="aviso-revision">' + problemas.map(U.esc).join('<br>') + '</div>' : '') +
      '<div class="tabla-envoltura"><table><thead><tr><th>#</th><th>Título</th><th>Autor</th><th>Editorial</th><th>Año</th><th>ISBN</th><th>Origen</th></tr></thead><tbody>' +
      materiales.slice(0, 60).map(function (m, i) {
        return '<tr><td class="numero">' + (i + 1) + '</td><td class="dato">' + U.esc(m.crudo.titulo || '—') + '</td><td>' +
          U.esc(m.crudo.autor || '') + '</td><td>' + U.esc(m.crudo.editorial || '') + '</td><td class="numero">' +
          U.esc(m.crudo.anio || '') + '</td><td>' + U.esc(m.crudo.isbn || '') + '</td><td class="nota">' +
          U.esc(m.entrada.origen + (m.entrada.detalle ? ' · ' + m.entrada.detalle : '')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (materiales.length > 60 ? '<p class="nota">Se muestran las primeras 60 de ' + materiales.length + '.</p>' : '') +
      '<label class="linea-check"><input type="checkbox" id="fusionar" checked> Fusionar con registros existentes cuando coincida el ISBN o el título</label>' +
      '<div class="acciones"><button class="btn" id="btn-agregar">Agregar ' + materiales.length + ' al proyecto</button>' +
      '<button class="btn btn-secundario" id="btn-agregar-procesar">Agregar y procesar</button></div></div>';

    function agregar() {
      var res = I.integrar(UI.pendientes, { fusionar: U.$('#fusionar').checked });
      UI.aviso(res.creados + ' registros nuevos, ' + res.fusionados + ' fusionados.');
      UI.pendientes = [];
      UI.actualizarCabecera();
      return res;
    }
    U.$('#btn-agregar').addEventListener('click', function () { agregar(); U.$('#previa').innerHTML = ''; });
    U.$('#btn-agregar-procesar').addEventListener('click', function () {
      var res = agregar();
      U.$('#previa').innerHTML = '';
      UI.ir('procesamiento');
      UI.procesar(res.registros);
    });
  };

  /* ================= PROCESAMIENTO (§26) ================= */

  UI.render_procesamiento = function () {
    // Se cuentan también los que quedaron a medias: si por cualquier vía un
    // registro conserva un estado en curso, aquí sigue estando a la vista.
    var nuevos = M.estado.registros.filter(function (r) {
      return r.estado === 'NUEVO' || M.ESTADOS_EN_CURSO.indexOf(r.estado) > -1;
    });
    var n = U.$('#s-procesamiento');
    n.innerHTML =
      '<h1>Procesamiento</h1>' +
      '<p class="entrada">El proceso consulta las fuentes activas, compara evidencias, distingue obra de edición y busca la portada de esa edición. Se guarda el avance cada pocos registros: si se interrumpe, se retoma donde quedó.</p>' +
      '<div class="tarjeta"><p><strong>' + nuevos.length + '</strong> registros sin procesar de ' + M.estado.registros.length + ' en el proyecto.</p>' +
      '<div class="progreso"><i id="barra"></i></div><p class="nota" id="mensaje-lote">En espera.</p>' +
      '<div class="acciones">' +
      '<button class="btn" id="btn-procesar-nuevos"' + (nuevos.length ? '' : ' disabled') + '>Procesar ' + nuevos.length + ' pendientes</button>' +
      '<button class="btn btn-secundario" id="btn-procesar-todos"' + (M.estado.registros.length ? '' : ' disabled') + '>Reprocesar todos</button>' +
      '<button class="btn btn-peligro" id="btn-cancelar" disabled>Detener</button>' +
      '</div></div>' +
      '<div class="tarjeta"><h3>Consultas a fuentes</h3><p class="nota stats-red"></p></div>';

    U.$('#btn-procesar-nuevos').addEventListener('click', function () { UI.procesar(nuevos); });
    U.$('#btn-procesar-todos').addEventListener('click', function () { UI.procesar(M.estado.registros.slice()); });
    U.$('#btn-cancelar').addEventListener('click', function () { X.cancelarLote(); });
    UI.statsRed();
  };

  UI.statsRed = function () {
    var nodos = U.$$('.stats-red');
    if (!nodos.length) return;
    var s = U.red.estadisticas;
    var txt = s.peticiones + ' consultas realizadas · ' + s.desdeCache + ' respuestas servidas desde la caché · ' +
      s.errores + ' errores · ' + U.pendientesRed() + ' en cola.';
    nodos.forEach(function (n) { n.textContent = txt; });
  };

  UI.procesar = function (registros) {
    if (!registros.length) return UI.aviso('No hay registros que procesar.');
    var barra = U.$('#barra'), msj = U.$('#mensaje-lote'), cancelar = U.$('#btn-cancelar');
    if (cancelar) cancelar.disabled = false;
    U.$$('#s-procesamiento .btn').forEach(function (b) { if (b.id !== 'btn-cancelar') b.disabled = true; });

    X.procesarLote(registros, function (lote) {
      if (barra) barra.style.width = Math.round((lote.indice / lote.total) * 100) + '%';
      if (msj) msj.textContent = lote.activo ? lote.mensaje : 'Listo: ' + lote.indice + ' de ' + lote.total + ' procesados.';
      UI.statsRed();
      UI.actualizarCabecera();
      if (!lote.activo) {
        if (cancelar) cancelar.disabled = true;
        UI.render_procesamiento();
        UI.aviso('Procesamiento terminado. Revisa los resultados.');
      }
    });
  };

  /* ================= RESULTADOS (§30) ================= */

  UI.render_resultados = function () {
    var n = U.$('#s-resultados');
    n.innerHTML =
      '<h1>Resultados</h1>' +
      '<div class="campo-fila"><div><label for="buscar">Buscar</label><input type="text" id="buscar" placeholder="Título, autor, ISBN" value="' + U.esc(UI.filtro.texto) + '"></div>' +
      '<div><label for="filtro-estado">Estado</label><select id="filtro-estado"><option value="">Todos</option>' +
      M.ESTADOS.map(function (e) { return '<option' + (UI.filtro.estado === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') +
      '</select></div>' +
      '<div><label for="modo-vista">Vista</label><select id="modo-vista">' +
      '<option value="tabla"' + (UI.modoVista === 'tabla' ? ' selected' : '') + '>Ficha completa</option>' +
      '<option value="fisico"' + (UI.modoVista === 'fisico' ? ' selected' : '') + '>Captura de estado físico</option>' +
      '</select></div></div>' +
      '<div id="tabla-resultados"></div>';

    U.$('#buscar').addEventListener('input', U.debounce(function () {
      UI.filtro.texto = this.value; UI.tablaResultados();
    }, 250));
    U.$('#filtro-estado').addEventListener('change', function () { UI.filtro.estado = this.value; UI.tablaResultados(); });
    U.$('#modo-vista').addEventListener('change', function () { UI.modoVista = this.value; UI.tablaResultados(); });
    UI.tablaResultados();
  };

  UI.modoVista = 'tabla';

  // Ninguna fuente sabe si al ejemplar le faltan páginas: ese dato solo existe
  // con el libro en la mano. Esta vista sirve para recorrer el estante y
  // capturarlo de corrido, sin abrir una ficha por libro.
  UI.listaFisico = function (regs) {
    var faltan = regs.filter(function (r) { return !M.tieneEstadoFisico(r); }).length;
    return '<p class="nota">' + regs.length + ' registros · ' + faltan + ' sin estado físico capturado. ' +
      'Se guarda solo, sin botón: elige el estado y sigue al siguiente libro.</p>' +
      '<ul class="lista-fisico">' +
      regs.map(function (r) {
        return '<li data-fisico-reg="' + r.id + '">' +
          '<span class="numero">' + r.n + '</span>' +
          '<span class="dato">' + U.esc(M.valor(r, 'titulo') || r.crudo.titulo || '—') + '</span>' +
          '<select data-fisico-estado="' + r.id + '" aria-label="Estado físico">' +
          '<option value="">— sin capturar —</option>' +
          M.ESTADOS_FISICOS.map(function (e) {
            return '<option' + (r.fisico.estado_fisico === e ? ' selected' : '') + '>' + e + '</option>';
          }).join('') + '</select>' +
          '<input type="text" data-fisico-nota="' + r.id + '" placeholder="Nota del ejemplar" value="' + U.esc(r.fisico.notas || '') + '">' +
          '<button class="btn btn-secundario btn-mini" data-ficha="' + r.id + '">Ficha</button>' +
          '</li>';
      }).join('') + '</ul>';
  };

  UI.registrosFiltrados = function () {
    var t = U.norm(UI.filtro.texto);
    return M.estado.registros.filter(function (r) {
      if (UI.filtro.estado && r.estado !== UI.filtro.estado) return false;
      if (!t) return true;
      var campo = [M.valor(r, 'titulo'), r.crudo.titulo, M.valor(r, 'autor'), M.isbnCanonico(r), M.valor(r, 'editorial')].join(' ');
      return U.norm(campo).indexOf(t) > -1;
    });
  };

  UI.tablaResultados = function () {
    var n = U.$('#tabla-resultados');
    if (!n) return;                     // la sección no está pintada ahora mismo
    var regs = UI.registrosFiltrados();
    if (!regs.length) {
      n.innerHTML = '<div class="tarjeta"><p class="nota">No hay registros que coincidan. Empieza por importar libros.</p></div>';
      return;
    }
    if (UI.modoVista === 'fisico') { n.innerHTML = UI.listaFisico(regs); return; }
    n.innerHTML = '<p class="nota">' + regs.length + ' registros.</p><div class="tabla-envoltura"><table><thead><tr>' +
      '<th>N°</th><th>Portada</th><th>Título</th><th>Autor</th><th>Editorial</th><th>Año</th><th>ISBN</th><th>Conf.</th><th>Estado</th><th></th>' +
      '</tr></thead><tbody>' +
      regs.map(function (r) {
        var p = r.portada;
        var img = p.url
          ? '<img class="miniportada" src="' + U.esc(p.dataUrl || p.url) + '" alt="" loading="lazy">'
          : '<span class="sinportada">s/p</span>';
        return '<tr><td class="numero">' + r.n + '</td><td>' + img + '</td>' +
          '<td class="dato">' + U.esc(M.valor(r, 'titulo') || r.crudo.titulo || '—') +
          (p.url && !p.verificada ? '<br><span class="nota-fuerte">portada por verificar</span>' : '') + '</td>' +
          '<td>' + U.esc(M.valor(r, 'autor')) + '</td><td>' + U.esc(M.valor(r, 'editorial')) + '</td>' +
          '<td class="numero">' + U.esc(M.valor(r, 'anio')) + '</td><td>' + U.esc(M.isbnCanonico(r)) + '</td>' +
          '<td class="numero">' + r.confianza + '</td><td>' + UI.marcaEstado(r.estado) + '</td>' +
          '<td><button class="btn btn-secundario btn-mini" data-ficha="' + r.id + '">Abrir</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  /* ---------- ficha detallada ---------- */

  UI.abrirFicha = function (id, pestana) {
    var reg = M.estado.registros.filter(function (r) { return r.id === id; })[0];
    if (!reg) return;
    UI.regActual = reg;
    UI.pestanaActual = pestana || 'ficha';
    UI.pintarFicha();
  };

  UI.pintarFicha = function () {
    var reg = UI.regActual;
    var pest = [['ficha', 'Ficha'], ['comparacion', 'Comparación'], ['evidencia', 'Evidencia'],
      ['candidatos', 'Ediciones'], ['portada', 'Portada'], ['calidad', 'Calidad']];
    var html = '<div class="pestanas">' + pest.map(function (p) {
      return '<button data-pestana="' + p[0] + '" class="' + (UI.pestanaActual === p[0] ? 'activo' : '') + '">' + p[1] + '</button>';
    }).join('') + '</div><div id="cuerpo-pestana">' + UI['ficha_' + UI.pestanaActual](reg) + '</div>';
    UI.panel((reg.n || '') + '. ' + (M.valor(reg, 'titulo') || reg.crudo.titulo || 'Registro sin título'), html);
  };

  UI.ficha_ficha = function (reg) {
    var f = E.ficha(reg);
    function fila(etiqueta, campo) {
      var d = reg.campos[campo];
      return '<dt>' + U.esc(etiqueta) + '</dt><dd>' + U.esc(f[campo] || '—') +
        (d ? '<small>' + U.esc(d.fuente_nombre) + ' · confianza ' + d.confianza + (d.decision ? ' · ' + d.decision : '') + '</small>' : '') + '</dd>';
    }
    return '<p>' + UI.marcaEstado(reg.estado) + ' <span class="nota">confianza ' + reg.confianza + '/100 · ' +
      reg.entradas.length + ' entrada(s) · ' + reg.evidencias.length + ' evidencias</span></p>' +
      (reg.revision.enCola ? '<div class="aviso-revision"><strong>En revisión:</strong> ' + U.esc(reg.revision.motivos.join(', ')) + '</div>' : '') +
      reg.conflictos.map(function (c) {
        return '<div class="conflicto' + (c.resolucion ? ' resuelto' : '') + '"><strong>' + U.esc(c.tipo) + ' · ' + U.esc(c.campo) + '</strong><br>' +
          U.esc(c.explicacion) + '<br>' +
          c.valores.map(function (v) { return '· ' + U.esc(v.valor) + ' <span class="nota">[' + U.esc(v.fuentes.map(function (x) { return x.fuente; }).join(', ')) + ']</span>'; }).join('<br>') +
          (c.resolucion ? '<br><em>Resuelto: ' + U.esc(c.resolucion) + '</em>' :
            '<div class="acciones">' + c.valores.map(function (v, i) {
              return '<button class="btn btn-secundario btn-mini" data-resolver="' + c.id + '" data-valor="' + i + '">Conservar «' + U.esc(v.valor.substring(0, 40)) + '»</button>';
            }).join('') + '</div>') + '</div>';
      }).join('') +
      '<dl class="ficha-datos">' +
      fila('Título', 'titulo') + fila('Autor', 'autor') + fila('Editorial', 'editorial') +
      fila('Año', 'anio') + fila('ISBN-10', 'isbn10') + fila('ISBN-13', 'isbn13') +
      '<dt>Estado físico</dt><dd>' + U.esc(f.estado_fisico) + '<small>Se captura con el ejemplar en la mano; no viene de ninguna API</small></dd>' +
      fila('Reseña del libro', 'resena') + fila('Grado', 'grado') + fila('Tipo de texto', 'tipo_texto') +
      fila('Categoría SEP', 'categoria_sep') + fila('Color', 'color') +
      fila('Subserie', 'subserie') + fila('Contenidos y Saberes', 'contenidos_saberes') +
      '<dt>Observaciones</dt><dd>' + U.esc(f.observaciones || '—') + '</dd>' +
      '</dl>' +
      '<h3>Corregir a mano</h3>' +
      '<div class="campo-fila"><div><label for="campo-editar">Campo</label><select id="campo-editar">' +
      M.CAMPOS_SALIDA.filter(function (c) { return ['portada', 'n', 'observaciones'].indexOf(c.clave) === -1; })
        .map(function (c) { return '<option value="' + c.clave + '">' + U.esc(c.etiqueta) + '</option>'; }).join('') +
      '</select></div><div><label for="valor-editar">Valor</label><input type="text" id="valor-editar"></div></div>' +
      '<div class="acciones"><button class="btn" id="btn-guardar-campo">Guardar valor</button>' +
      '<button class="btn btn-secundario" id="btn-obs">Agregar observación</button>' +
      '<button class="btn btn-secundario" id="btn-completado">Marcar completado</button>' +
      '<button class="btn btn-secundario" id="btn-reprocesar">Volver a procesar</button>' +
      '<button class="btn btn-peligro" id="btn-eliminar">Eliminar registro</button></div>' +
      // Sin la opción vacía, una ficha recién creada mostraba "Excelente"
      // preseleccionado y guardar la nota bastaba para asentar un estado que
      // nadie había revisado. El estado físico solo existe con el libro en la mano.
      '<h3>Estado físico</h3><div class="campo-fila"><div><select id="sel-fisico">' +
      '<option value="">— sin capturar —</option>' +
      M.ESTADOS_FISICOS.map(function (e) { return '<option' + (reg.fisico.estado_fisico === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') +
      '</select></div><div><input type="text" id="nota-fisico" placeholder="Nota (páginas sueltas, subrayados…)" value="' + U.esc(reg.fisico.notas) + '"></div>' +
      '<div><button class="btn btn-secundario" id="btn-fisico">Guardar estado físico</button></div></div>' +
      '<h3>Procedencia de las entradas</h3><ul class="lista-limpia">' +
      reg.entradas.map(function (e) {
        return '<li>' + U.esc(e.tipo) + ' · ' + U.esc(e.origen) + (e.detalle ? ' · ' + U.esc(e.detalle) : '') +
          ' <span class="nota">' + U.fecha(e.fecha) + '</span>' +
          (e.imagen ? '<br><img src="' + U.esc(e.imagen) + '" alt="Imagen de origen" style="max-width:220px;border:1px solid var(--linea);margin-top:.3rem">' : '') + '</li>';
      }).join('') + '</ul>';
  };

  UI.ficha_comparacion = function (reg) {
    var filas = X.comparativo(reg);
    var fuentes = [['entrada', 'Entrada'], ['sep', 'SEP'], ['sep_pdf', 'SEP 1986-2006'], ['openlibrary', 'Open Library'],
      ['googlebooks', 'Google Books'], ['isbnmexico', 'ISBN México'], ['loc', 'LOC'], ['url', 'URL'],
      ['taxonomia', 'Tabla curricular'], ['manual', 'Manual']];
    return '<p class="nota">Qué dijo cada fuente sobre cada campo y qué se decidió. Si una fuente tiene el dato correcto, tócala para que sea la que quede en el documento; la decisión se anota y ya no la cambia un reprocesamiento.</p>' +
      '<div class="tabla-envoltura"><table><thead><tr><th>Campo</th>' +
      fuentes.map(function (f) { return '<th>' + f[1] + '</th>'; }).join('') + '<th>Decisión</th></tr></thead><tbody>' +
      filas.map(function (f) {
        var decidido = reg.campos[f.campo];
        return '<tr><td><strong>' + U.esc(f.campo) + '</strong></td>' +
          fuentes.map(function (fu) {
            var v = f.valores[fu[0]] || '';
            if (!v) return '<td class="nota"></td>';
            var elegida = decidido && decidido.fuente === fu[0] && U.norm(decidido.valor) === U.norm(v);
            return '<td class="nota">' +
              '<button class="valor-fuente' + (elegida ? ' elegido' : '') + '" data-usar-campo="' + U.esc(f.campo) +
              '" data-usar-fuente="' + fu[0] + '" title="Usar este valor en el documento">' +
              U.esc(v.substring(0, 90)) + '</button></td>';
          }).join('') +
          '<td>' + (f.estado === 'revisar' ? '<span class="marca-estado e-revision">revisar</span>' :
            f.estado === 'confirmado' ? '<span class="marca-estado e-confirmado">decidido</span>' :
              '<span class="marca-estado e-nuevo">pendiente</span>') +
          (decidido && decidido.manual ? ' <span class="marca-estado e-confirmado">tu decisión</span>' : '') +
          '<br><span class="nota">' + U.esc(f.fuenteDecision) + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  UI.ficha_evidencia = function (reg) {
    if (!reg.evidencias.length) return '<p class="nota">Sin evidencias todavía. Procesa el registro.</p>';
    return '<div class="tabla-envoltura"><table><thead><tr><th>Campo</th><th>Valor</th><th>Fuente</th><th>Conf.</th><th>Referencia</th><th>Fecha</th></tr></thead><tbody>' +
      reg.evidencias.map(function (e) {
        return '<tr><td>' + U.esc(e.campo) + '</td><td class="dato">' + U.esc(e.valor.substring(0, 160)) + '</td>' +
          '<td>' + U.esc(e.fuente_nombre) + '</td><td class="numero">' + e.confianza + '</td>' +
          '<td class="nota">' + U.esc(e.referencia) + '</td><td class="nota">' + U.fecha(e.fecha) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (reg.sep ? '<h3>Ficha del catálogo histórico SEP</h3><div class="cita">' +
        U.esc(reg.sep.titulo) + ' · ' + U.esc(reg.sep.ciclo) + ' · ' + U.esc(reg.sep.grado) + ' · ' + U.esc(reg.sep.serie) +
        '<br><span class="nota">Clave SEP ' + U.esc(reg.sep.clave_sep) + ' · ' + U.esc(reg.sep.fuente_doc) + ' · ' + U.esc(reg.sep.motivo) + '</span>' +
        (reg.sep.resena ? '<p>' + U.esc(reg.sep.resena) + '</p>' : '') + '</div>' : '') +
      (reg.candidatosSep && reg.candidatosSep.length > 1 ?
        '<h3>Otras coincidencias en el catálogo SEP</h3><ul class="lista-limpia">' +
        reg.candidatosSep.slice(1).map(function (c) {
          return '<li>' + U.esc(c.titulo) + ' <span class="nota">' + U.esc(c.ciclo || '') + ' · ' + U.esc(c.grado || '') + ' · ' + c.puntos + ' puntos · ' + U.esc(c.motivo) + '</span>' +
            ' <button class="btn btn-secundario btn-mini" data-sep-aplicar="' + U.esc(c.id) + '">Usar esta ficha</button></li>';
        }).join('') + '</ul>' : '');
  };

  UI.ficha_candidatos = function (reg) {
    if (!reg.candidatos.length) return '<p class="nota">Sin candidatos. Procesa el registro o captura los datos a mano.</p>';
    return '<p class="nota">La edición elegida determina el año, el ISBN y la portada del documento. Si eliges otra, todo se recalcula.</p>' +
      '<div class="tabla-envoltura"><table><thead><tr><th></th><th>Título</th><th>Editorial</th><th>Año</th><th>ISBN</th><th>Fuente</th><th>Puntos</th><th>Por qué</th></tr></thead><tbody>' +
      reg.candidatos.map(function (c) {
        var d = c.datos;
        return '<tr>' +
          '<td>' + (c.seleccionado ? '<span class="marca-estado e-confirmado">elegida</span>' :
            '<button class="btn btn-secundario btn-mini" data-elegir="' + c.id + '">Elegir</button>') + '</td>' +
          '<td class="dato">' + U.esc(d.titulo) + '</td><td>' + U.esc(d.editorial) + '</td>' +
          '<td class="numero">' + U.esc(d.anio) + '</td><td>' + U.esc(d.isbn13 || d.isbn10 || '') + '</td>' +
          '<td>' + U.esc(d.fuente_nombre) + '</td><td class="numero">' + c.score + '</td>' +
          '<td class="nota">' + U.esc(c.explicacion) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  UI.ficha_portada = function (reg) {
    var p = reg.portada;
    return '<p>' + (p.url
      ? '<img src="' + U.esc(p.dataUrl || p.url) + '" alt="Portada" style="max-height:320px;border:1px solid var(--linea)">'
      : '<span class="nota">Sin portada localizada. No se sustituye por una imagen genérica.</span>') + '</p>' +
      '<dl class="ficha-datos">' +
      '<dt>Estado</dt><dd>' + (p.verificada ? 'Verificada' : (p.url ? 'No verificada' : 'Pendiente')) + '</dd>' +
      '<dt>Fuente</dt><dd>' + U.esc(M.nombreFuente(p.fuente) || '—') + '</dd>' +
      '<dt>ISBN usado</dt><dd>' + U.esc(p.isbn_usado || '—') + '</dd>' +
      '<dt>Identificador</dt><dd>' + U.esc(p.olid || '—') + '</dd>' +
      '<dt>Confianza</dt><dd>' + p.confianza + '/100</dd>' +
      '<dt>Liga</dt><dd class="nota">' + U.esc(p.url || '—') + '</dd>' +
      '<dt>Incrustada</dt><dd>' + (p.dataUrl ? 'Sí, lista para el documento' : 'No; se descarga al exportar') + '</dd>' +
      '</dl>' +
      '<div class="acciones">' +
      '<button class="btn btn-secundario" id="btn-buscar-portada">Volver a buscar portada</button>' +
      '<button class="btn btn-secundario" id="btn-descargar-portada">Descargar para el documento</button>' +
      '<button class="btn btn-peligro" id="btn-quitar-portada">Quitar portada</button></div>' +
      '<label for="url-portada">Poner una portada por URL</label>' +
      '<div class="campo-fila"><div><input type="url" id="url-portada" placeholder="https://…"></div>' +
      '<div><button class="btn btn-secundario" id="btn-portada-url">Usar esta imagen</button></div></div>' +
      '<p class="nota">Una portada puesta a mano se marca como no verificada mientras no se ligue al ISBN de la edición.</p>';
  };

  UI.ficha_calidad = function (reg) {
    var chk = M.checklist(reg);
    return '<p class="nota">Comprobación previa a la exportación.</p><ul class="lista-limpia">' +
      chk.lista.map(function (x) {
        return '<li>' + (x.ok ? '<span class="marca-estado e-confirmado">ok</span>' : '<span class="marca-estado e-revision">falta</span>') +
          ' ' + U.esc(x.campo) + '</li>';
      }).join('') + '</ul>' +
      '<p>' + (chk.exportableComoConfirmado
        ? '<span class="marca-estado e-confirmado">Puede exportarse como confirmado</span>'
        : '<span class="marca-estado e-revision">No puede declararse confirmado' +
        (chk.conflictoAbierto ? ': hay un conflicto sin resolver' : ': la confianza es de ' + reg.confianza + '/100') + '</span>') + '</p>' +
      '<div class="acciones"><button class="btn btn-secundario" id="btn-pendiente">Dejar pendiente</button>' +
      '<button class="btn btn-secundario" id="btn-noident">Marcar no identificado</button></div>';
  };

  /* ================= REVISIÓN (§17) ================= */

  UI.filtroRevision = null;   // { motivo } elegido por la persona

  UI.render_revision = function () {
    // Se piden solo los que caben en la lista: cruzar el acervo completo para
    // mostrar veinte era el trabajo más caro de toda la aplicación.
    var motivos = R.resumenMotivos(), dup = R.detectarDuplicados(R.TOPE_PANTALLA);
    // Si el motivo filtrado ya no existe (porque se resolvió), se vuelve a todo.
    if (UI.filtroRevision && !motivos.some(function (m) { return m.motivo === UI.filtroRevision.motivo; })) UI.filtroRevision = null;
    var cola = R.cola(UI.filtroRevision);
    var n = U.$('#s-revision');
    n.innerHTML = '<h1>Revisión</h1>' +
      '<p class="entrada">Aquí decide una persona. El sistema explica qué encontró y qué le falta; la resolución queda anotada en la ficha.</p>' +
      (motivos.length ? '<div class="tarjeta"><h3>Motivos</h3>' +
        '<p class="nota">Toca un motivo para atender de corrido todos los que lo comparten: resolver cien "sin portada" seguidos cuesta menos que saltar de un problema a otro.</p>' +
        '<div class="fichas-motivo">' +
        '<button class="btn-motivo' + (UI.filtroRevision ? '' : ' activo') + '" data-motivo="">Todos <strong>' + R.cola().length + '</strong></button>' +
        motivos.map(function (m) {
          var act = UI.filtroRevision && UI.filtroRevision.motivo === m.motivo;
          return '<button class="btn-motivo' + (act ? ' activo' : '') + '" data-motivo="' + U.esc(m.motivo) + '">' +
            U.esc(m.motivo) + ' <strong>' + m.total + '</strong></button>';
        }).join('') + '</div></div>' : '') +
      (dup.length ? '<div class="tarjeta"><h3>Posibles duplicados</h3><ul class="lista-limpia">' +
        dup.slice(0, 20).map(function (p) {
          return '<li>' + U.esc(M.valor(p.a, 'titulo') || p.a.crudo.titulo) + ' <span class="nota">y</span> ' +
            U.esc(M.valor(p.b, 'titulo') || p.b.crudo.titulo) + ' <span class="nota">· ' + U.esc(p.motivo) + '</span> ' +
            '<button class="btn btn-secundario btn-mini" data-fusionar="' + p.a.id + '|' + p.b.id + '">Fusionar</button></li>';
        }).join('') + '</ul>' +
        (dup.length >= R.TOPE_PANTALLA ? '<p class="nota">Se muestran los primeros pares encontrados; al resolverlos aparecerán los siguientes.</p>' : '') +
        '</div>' : '') +
      (cola.length ? '<div class="tabla-envoltura"><table><thead><tr><th>N°</th><th>Título</th><th>Motivos</th><th>Conf.</th><th>Estado</th><th></th></tr></thead><tbody>' +
        cola.map(function (r) {
          return '<tr><td class="numero">' + r.n + '</td><td class="dato">' + U.esc(M.valor(r, 'titulo') || r.crudo.titulo || '—') + '</td>' +
            '<td class="nota">' + U.esc(r.revision.motivos.join(', ')) + '</td><td class="numero">' + r.confianza + '</td>' +
            '<td>' + UI.marcaEstado(r.estado) + '</td>' +
            '<td><button class="btn btn-secundario btn-mini" data-ficha="' + r.id + '">Revisar</button></td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="tarjeta"><p class="nota">' +
          (UI.filtroRevision ? 'Ningún registro con ese motivo.' : 'No hay nada en la cola de revisión.') + '</p></div>');
  };

  /* ================= CATÁLOGO MAESTRO SEP ================= */

  UI.render_catalogo = function () {
    var n = U.$('#s-catalogo');
    n.innerHTML = '<h1>Catálogo maestro</h1>' +
      '<p class="entrada">Catálogo histórico de Libros del Rincón cargado en la aplicación: ' + S.total.toLocaleString('es-MX') +
      ' fichas de Primaria por ciclo, más ' + S.totalPdf.toLocaleString('es-MX') + ' títulos del catálogo 1986-2006. Es la capa que aporta grado, serie, categoría y reseña.</p>' +
      '<label for="buscar-sep">Buscar por título, autor o ISBN</label>' +
      '<input type="text" id="buscar-sep" placeholder="Stelaluna, Emilio Carballido, 9789682941801">' +
      '<div id="resultados-sep"><p class="nota">Escribe para buscar.</p></div>';

    U.$('#buscar-sep').addEventListener('input', U.debounce(function () {
      var q = this.value;
      var cont = U.$('#resultados-sep');
      if (U.limpia(q).length < 3) { cont.innerHTML = '<p class="nota">Escribe al menos tres letras.</p>'; return; }
      var isbn = U.isbn.buscarEnTexto(q)[0] || '';
      var res = S.buscar(isbn ? '' : q, '', isbn, 40);
      if (!res.length) { cont.innerHTML = '<p class="nota">Sin coincidencias en el catálogo histórico.</p>'; return; }
      cont.innerHTML = '<p class="nota">' + res.length + ' coincidencias.</p><div class="tabla-envoltura"><table><thead><tr>' +
        '<th>Título</th><th>Autor</th><th>Editorial</th><th>Año</th><th>Ciclo</th><th>Grado</th><th>Serie</th><th>Categoría</th><th></th></tr></thead><tbody>' +
        res.map(function (c) {
          var f = c.ficha;
          return '<tr><td class="dato">' + U.esc(f.titulo) + '</td><td>' + U.esc(f.autor || '') + '</td>' +
            '<td>' + U.esc(f.editorial || '') + '</td><td class="numero">' + U.esc(f.anio || '') + '</td>' +
            '<td>' + U.esc(f.ciclo || '') + '</td><td>' + U.esc(f.grado || '') + '</td>' +
            '<td>' + U.esc(f.serie || '') + '</td><td>' + U.esc(f.categoria || '') + '</td>' +
            '<td><button class="btn btn-secundario btn-mini" data-sep-ver="' + U.esc(f.id) + '">Ficha</button> ' +
            '<button class="btn btn-secundario btn-mini" data-sep-crear="' + U.esc(f.id) + '">Crear registro</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }, 300));
  };

  UI.verFichaSep = function (id) {
    var f = S.todas().filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    var campos = [['Título', f.titulo], ['Título original', f.titulo_original], ['Autor', f.autor],
      ['Traductor', f.traductor], ['Ilustrador', f.ilustrador], ['Editorial', f.editorial],
      ['Lugar', f.lugar], ['Año', f.anio], ['ISBN', f.isbn], ['Páginas', f.paginas],
      ['Dimensiones', f.dimensiones], ['Ciclo', f.ciclo], ['Grado', f.grado], ['Destino', f.destino],
      ['Serie lectora', f.serie], ['Género', f.genero], ['Categoría', f.categoria],
      ['Clave SEP', f.clave_sep], ['Documento fuente', f.fuente_doc]];
    UI.panel('Ficha SEP · ' + f.titulo,
      '<dl class="ficha-datos">' + campos.map(function (c) {
        return '<dt>' + U.esc(c[0]) + '</dt><dd>' + U.esc(c[1] || '—') + '</dd>';
      }).join('') + '</dl>' +
      (f.resena ? '<h3>Reseña</h3><div class="cita">' + U.esc(f.resena) + '</div>' : '') +
      '<div class="acciones"><button class="btn" data-sep-crear="' + U.esc(f.id) + '">Crear registro desde esta ficha</button></div>');
  };

  UI.crearDesdeSep = function (id) {
    var f = S.todas().filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    var res = I.integrar([{
      crudo: { titulo: f.titulo, autor: f.autor || '', editorial: f.editorial || '', anio: f.anio || '', isbn: f.isbn || '' },
      entrada: { tipo: 'catalogo-sep', origen: 'Catálogo histórico SEP', fecha: U.ahora(), detalle: 'ficha ' + f.id }
    }], { fusionar: true });
    var reg = res.registros[0];
    S.aplicar(reg, { ficha: f, puntos: 100, motivo: 'Ficha tomada directamente del catálogo histórico' });
    ['titulo', 'autor', 'editorial', 'anio', 'isbn'].forEach(function (c) { X.decidirCampo(reg, c); });
    M.guardarDiferido();
    UI.cerrarPanel();
    UI.aviso('Registro creado desde el catálogo SEP. Falta capturar el estado físico del ejemplar.');
    UI.actualizarCabecera();
    UI.ir('resultados');
  };

  /* ================= FUENTES Y EVIDENCIA ================= */

  UI.render_fuentes = function () {
    var n = U.$('#s-fuentes');
    var claves = ['openlibrary', 'googlebooks', 'loc', 'isbnmexico'];
    n.innerHTML = '<h1>Fuentes y evidencia</h1>' +
      '<p class="entrada">Cada fuente entra por un adaptador con la misma interfaz. Si una no está disponible, se dice: no se rellena su hueco con otra.</p>' +
      '<div class="rejilla">' + claves.map(function (k) {
        var ad = F.adaptadores[k], disp = ad.disponible();
        return '<div class="tarjeta"><h3>' + U.esc(M.nombreFuente(k)) + '</h3>' +
          '<label class="linea-check"><input type="checkbox" data-fuente="' + k + '"' + (ad.activa() ? ' checked' : '') + '> Consultar esta fuente</label>' +
          '<p class="nota">' + (disp.ok ? '' : '<span class="nota-fuerte">No disponible ahora. </span>') + U.esc(disp.nota) + '</p></div>';
      }).join('') +
      '<div class="tarjeta"><h3>Catálogo SEP (local)</h3><p class="nota">Siempre activo y con prioridad para el contexto de Libros del Rincón. ' +
      S.total.toLocaleString('es-MX') + ' fichas.</p></div></div>' +
      '<h2>Consultas</h2><div class="tarjeta"><p class="nota stats-red"></p>' +
      '<div class="acciones"><button class="btn btn-secundario" id="btn-vaciar-cache">Vaciar caché de consultas</button></div></div>' +
      '<h2>Evidencia registrada</h2><label for="buscar-ev">Buscar en las evidencias del proyecto</label>' +
      '<input type="text" id="buscar-ev" placeholder="Editorial, autor, ISBN…"><div id="lista-ev"></div>';

    UI.statsRed();
    U.$$('#s-fuentes input[data-fuente]').forEach(function (c) {
      c.addEventListener('change', function () {
        var k = c.getAttribute('data-fuente');
        var mapa = { openlibrary: 'usarOpenLibrary', googlebooks: 'usarGoogleBooks', loc: 'usarLOC', isbnmexico: 'usarIsbnMexico' };
        M.estado.config[mapa[k]] = c.checked;
        M.guardarDiferido();
        UI.render_fuentes();
      });
    });
    U.$('#btn-vaciar-cache').addEventListener('click', function () {
      M.cache.vaciar().then(function () { UI.aviso('Caché vaciada.'); UI.statsRed(); });
    });
    U.$('#buscar-ev').addEventListener('input', U.debounce(function () {
      var q = U.norm(this.value), cont = U.$('#lista-ev');
      if (q.length < 3) { cont.innerHTML = '<p class="nota">Escribe al menos tres letras.</p>'; return; }
      var hits = [];
      M.estado.registros.forEach(function (r) {
        r.evidencias.forEach(function (e) {
          if (U.norm(e.valor).indexOf(q) > -1 || U.norm(e.referencia).indexOf(q) > -1) hits.push({ r: r, e: e });
        });
      });
      cont.innerHTML = hits.length ? '<p class="nota">' + hits.length + ' coincidencias.</p><div class="tabla-envoltura"><table><thead><tr>' +
        '<th>N°</th><th>Registro</th><th>Campo</th><th>Valor</th><th>Fuente</th></tr></thead><tbody>' +
        hits.slice(0, 100).map(function (h) {
          return '<tr><td class="numero">' + h.r.n + '</td><td class="dato">' + U.esc(M.valor(h.r, 'titulo') || h.r.crudo.titulo) + '</td>' +
            '<td>' + U.esc(h.e.campo) + '</td><td>' + U.esc(h.e.valor.substring(0, 120)) + '</td><td class="nota">' + U.esc(h.e.fuente_nombre) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="nota">Sin coincidencias.</p>';
    }, 300));
  };

  /* ================= CLASIFICACIÓN SEP (§19, §20) ================= */

  // Muestra qué etiqueta del catálogo quedó ligada a qué categoría oficial y
  // deja corregir a mano las que el parecido no alcanza a resolver.
  UI.bloquePuente = function () {
    var oficiales = S.oficiales();
    if (!oficiales.length) {
      return '<div class="tarjeta"><h3>Puente con el clasificador</h3>' +
        '<p class="nota">Todavía no has importado tu clasificador oficial. Impórtalo y aquí aparecerá qué etiqueta del catálogo histórico corresponde a cada una de sus categorías.</p></div>';
    }
    var pendientes = S.categoriasSinVinculo();
    var opciones = '<option value="">— sin asignar —</option>' +
      oficiales.map(function (o) { return '<option value="' + U.esc(o.categoria) + '">' + U.esc(o.categoria) + '</option>'; }).join('');

    var vinculos = Object.keys(S.puente).map(function (k) {
      var t = (M.estado.taxonomia || []).filter(function (x) { return U.norm(x.categoria) === k; })[0];
      return { origen: t ? t.categoria : k, v: S.puente[k], registros: t ? (t.registros || 0) : 0 };
    }).sort(function (a, b) { return b.registros - a.registros; });

    return '<div class="tarjeta"><h3>Puente con el clasificador</h3>' +
      '<p class="nota">El catálogo histórico dice "Cuentos de humor"; tu clasificador lo tiene como contenido de "Narrativa". Cada vínculo dice por qué se hizo. Los que están por confirmar se aplican, pero mandan la ficha a revisión.</p>' +
      (pendientes.length
        ? '<h4>Por confirmar (' + pendientes.length + ')</h4><ul class="lista-puente">' +
        pendientes.map(function (p) {
          return '<li><span class="dato">' + U.esc(p.categoria) + '</span>' +
            '<select data-puente="' + U.esc(p.categoria) + '">' +
            opciones.replace('<option value="' + U.esc(p.propuesta || '') + '">', '<option value="' + U.esc(p.propuesta || '') + '" selected>') +
            '</select>' +
            '<span class="nota">' + U.esc(p.motivo || 'Sin equivalencia encontrada en el clasificador.') + '</span></li>';
        }).join('') + '</ul>'
        : '<p class="nota">No queda ninguna etiqueta por confirmar.</p>') +
      (vinculos.length
        ? '<details><summary>Ver los ' + vinculos.length + ' vínculos establecidos</summary><ul class="lista-puente">' +
        vinculos.map(function (x) {
          return '<li><span class="dato">' + U.esc(x.origen) + '</span>' +
            '<select data-puente="' + U.esc(x.origen) + '">' +
            opciones.replace('<option value="' + U.esc(x.v.categoria) + '">', '<option value="' + U.esc(x.v.categoria) + '" selected>') +
            '</select>' +
            '<span class="nota">' + x.registros + ' fichas · ' + U.esc(x.v.motivo) + '</span></li>';
        }).join('') + '</ul></details>'
        : '') + '</div>';
  };

  UI.render_clasificacion = function () {
    var t = M.estado.taxonomia, cob = S.cobertura();
    var n = U.$('#s-clasificacion');
    n.innerHTML = '<h1>Clasificación SEP</h1>' +
      '<p class="entrada">Categoría, disciplina, color, contenidos y saberes salen de esta tabla, no de la búsqueda bibliográfica. Tu clasificador oficial define doce categorías; el catálogo histórico usa etiquetas más finas. El puente relaciona unas con otras y explica cada vínculo. Mientras una celda esté vacía, el campo se declara pendiente en la ficha.</p>' +
      '<div class="tarjeta"><p class="nota">' + cob.categorias + ' categorías en la tabla · ' + cob.oficiales + ' del clasificador oficial · ' +
      cob.conColor + ' con color · ' + cob.conContenidos + ' con contenidos y saberes · ' +
      cob.vinculadas + ' etiquetas del catálogo vinculadas' +
      (cob.sinVinculo ? ' · <strong>' + cob.sinVinculo + ' por confirmar</strong>' : '') + '.</p>' +
      '<div class="acciones"><button class="btn btn-secundario" id="btn-importar-tax">Importar desde Excel</button>' +
      '<input type="file" id="archivo-tax" accept=".xlsx,.xls,.csv" hidden>' +
      '<button class="btn btn-secundario" id="btn-aplicar-tax">Aplicar a los registros</button>' +
      '<button class="btn btn-secundario" id="btn-exportar-tax">Descargar tabla</button></div>' +
      '<p class="nota">El texto se copia tal cual: no se abrevia ni se resume, porque de ahí dependen las fórmulas de color de tus archivos.</p></div>' +
      UI.bloquePuente() +
      '<div class="tabla-envoltura"><table><thead><tr><th>Categoría</th><th>Fichas</th><th>Disciplina</th><th>Color</th><th>Contenidos</th><th>Saberes</th></tr></thead><tbody>' +
      t.slice().sort(function (a, b) { return (b.oficial ? 1 : 0) - (a.oficial ? 1 : 0); }).map(function (f) {
        var i = M.estado.taxonomia.indexOf(f);
        return '<tr' + (f.oficial ? ' class="fila-oficial"' : '') + '><td class="dato">' + U.esc(f.categoria) +
          (f.oficial ? '<br><span class="nota">clasificador oficial' + (f.palabra_clave ? ' · ' + U.esc(f.palabra_clave) : '') +
            (f.grado_sugerido ? ' · grado sugerido ' + U.esc(f.grado_sugerido) : '') + '</span>' : '') +
          (f.revisar ? '<br><span class="nota-fuerte">pocas fichas: revisa si es una categoría real o un error de extracción</span>' : '') + '</td>' +
          '<td class="numero">' + (f.registros || 0) + '</td>' +
          ['disciplina', 'color', 'contenidos', 'saberes'].map(function (c) {
            return '<td><input type="text" data-tax="' + i + '" data-col="' + c + '" value="' + U.esc(f[c] || '') + '"></td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';

    U.$('#btn-importar-tax').addEventListener('click', function () { U.$('#archivo-tax').click(); });
    U.$('#archivo-tax').addEventListener('change', function () {
      var a = this.files[0];
      if (!a) return;
      I.leerHoja(a).then(function (libro) {
        var opciones = libro.hojas.map(function (h) { return '<option>' + U.esc(h) + '</option>'; }).join('');
        UI.panel('Importar tabla curricular',
          '<label for="hoja-tax">Hoja del archivo</label><select id="hoja-tax">' + opciones + '</select>' +
          '<p class="nota">El encabezado puede estar en cualquier renglón de la hoja: se busca solo. Si una categoría aparece en varias filas —una por contenido, como en tu clasificador—, los contenidos se agrupan en una sola, en su orden y sin recortar.</p>' +
          '<div class="acciones"><button class="btn" id="btn-tax-ok">Importar</button></div>');
        U.$('#btn-tax-ok').addEventListener('click', function () {
          var r = S.importarTaxonomia(libro.filasDe(U.$('#hoja-tax').value));
          UI.cerrarPanel();
          UI.aviso(r.error ? r.error
            : (r.agregadas + ' categorías agregadas y ' + r.actualizadas + ' actualizadas, a partir de ' + r.filasLeidas + ' filas leídas.'));
          UI.render_clasificacion();
        });
      }).catch(function (e) { UI.aviso('No se pudo leer el archivo: ' + e.message); });
    });
    U.$('#btn-aplicar-tax').addEventListener('click', function () {
      M.estado.registros.forEach(function (r) { S.aplicarTaxonomia(r); });
      M.guardar();
      UI.aviso('Tabla aplicada a ' + M.estado.registros.length + ' registros.');
    });
    U.$('#btn-exportar-tax').addEventListener('click', function () {
      var filas = [['Categoría', 'Fichas', 'Disciplina', 'Color', 'Contenidos', 'Saberes', 'Palabra clave', 'Grado sugerido', 'Origen']].concat(
        M.estado.taxonomia.map(function (f) {
          return [f.categoria, f.registros || 0, f.disciplina || '', f.color || '', f.contenidos || '', f.saberes || '',
            f.palabra_clave || '', f.grado_sugerido || '', f.oficial ? 'clasificador oficial' : 'catálogo histórico'];
        }));
      var csv = filas.map(function (f) {
        return f.map(function (c) { var s = String(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
      }).join('\n');
      U.descargar(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), 'tabla-curricular.csv');
    });
    U.$$('#s-clasificacion select[data-puente]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        S.fijarPuenteManual(sel.getAttribute('data-puente'), sel.value);
        UI.aviso(sel.value
          ? '"' + sel.getAttribute('data-puente') + '" queda ligada a "' + sel.value + '". Aplica la tabla para que las fichas la tomen.'
          : 'Vínculo retirado de "' + sel.getAttribute('data-puente') + '".');
        UI.render_clasificacion();
      });
    });
    U.$$('#s-clasificacion input[data-tax]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var i = parseInt(inp.getAttribute('data-tax'), 10), c = inp.getAttribute('data-col');
        M.estado.taxonomia[i][c] = U.limpia(inp.value);
        M.guardarDiferido();
      });
    });
  };

  /* ================= EXPORTACIÓN (§32-§35) ================= */

  UI.render_exportacion = function () {
    var n = U.$('#s-exportacion');
    var todos = M.estado.registros;
    var sinPortadaDescargada = todos.filter(function (r) { return r.portada.url && !r.portada.dataUrl; }).length;
    var conConflicto = todos.filter(function (r) { return r.conflictos.some(function (c) { return !c.resolucion; }); }).length;

    n.innerHTML = '<h1>Exportación</h1>' +
      '<p class="entrada">El documento lleva una ficha por libro con la portada arriba y los campos en el orden acordado. La portada del documento no se cuenta en la numeración: las páginas empiezan en 1 después de ella.</p>' +
      '<div class="tarjeta"><h3>Qué se exporta</h3>' +
      '<label for="sel-alcance">Registros</label><select id="sel-alcance">' +
      '<option value="todos">Todos (' + todos.length + ')</option>' +
      '<option value="sin-conflicto">Solo sin conflictos abiertos (' + (todos.length - conConflicto) + ')</option>' +
      '<option value="confirmados">Solo confirmados y completados (' + E.seleccion('confirmados').length + ')</option>' +
      '</select>' +
      '<label for="titulo-doc">Título del documento</label>' +
      '<input type="text" id="titulo-doc" value="Catálogo bibliográfico del acervo">' +
      '<label class="linea-check"><input type="checkbox" id="con-auditoria" checked> Incluir anexo de auditoría</label>' +
      (conConflicto ? '<div class="aviso-revision">' + conConflicto + ' registros tienen conflictos sin resolver. Se exportan con su estado real, nunca como confirmados.</div>' : '') +
      '</div>' +

      '<div class="tarjeta"><h3>Portadas</h3>' +
      '<p class="nota">' + sinPortadaDescargada + ' portadas están localizadas pero aún no descargadas. Word necesita la imagen descargada para incrustarla.</p>' +
      '<div class="progreso"><i id="barra-portadas"></i></div><p class="nota" id="msj-portadas"></p>' +
      '<div class="acciones"><button class="btn btn-secundario" id="btn-portadas">Descargar portadas</button></div></div>' +

      '<div class="tarjeta"><h3>Formatos</h3>' +
      '<div class="acciones">' +
      '<button class="btn" id="btn-docx">Word (.docx)</button>' +
      '<button class="btn btn-secundario" id="btn-html">HTML imprimible</button>' +
      '<button class="btn btn-secundario" id="btn-xlsx">Excel con trazabilidad</button>' +
      '<button class="btn btn-secundario" id="btn-csv">CSV</button>' +
      '<button class="btn btn-secundario" id="btn-json">Respaldo JSON</button>' +
      '</div>' +
      '<p class="nota">El HTML no depende de bibliotecas externas y sirve para imprimir o guardar como PDF desde el navegador.</p>' +
      (E.conRiesgoDeFormula(todos).length
        ? '<p class="nota"><strong>Sobre el CSV:</strong> ' + E.conRiesgoDeFormula(todos).length +
          ' campos de tu acervo empiezan con un signo que Excel lee como fórmula (un guion, un igual). ' +
          'En el CSV se les antepone un apóstrofo para que el texto llegue completo en vez de convertirse en un error; ' +
          'ese apóstrofo se ve en la celda y no forma parte del dato. El Excel con trazabilidad no lo necesita: ' +
          'ahí el texto va marcado como texto y se ve tal cual.</p>'
        : '') + '</div>';

    function sel() { return E.seleccion(U.$('#sel-alcance').value); }
    function opciones() {
      return { titulo: U.$('#titulo-doc').value, auditoria: U.$('#con-auditoria').checked };
    }

    U.$('#btn-portadas').addEventListener('click', function () {
      var regs = sel().filter(function (r) { return r.portada.url && !r.portada.dataUrl; });
      if (!regs.length) return UI.aviso('No hay portadas pendientes de descargar.');
      this.disabled = true;
      E.descargarPortadas(regs, function (i, total, titulo) {
        U.$('#barra-portadas').style.width = Math.round((i / total) * 100) + '%';
        U.$('#msj-portadas').textContent = i + ' de ' + total + ': ' + (titulo || '');
      }).then(function () {
        M.guardar();
        UI.aviso('Portadas descargadas.');
        UI.render_exportacion();
      });
    });

    U.$('#btn-docx').addEventListener('click', function () {
      var regs = sel();
      if (!regs.length) return UI.aviso('No hay registros que exportar.');
      var btn = this;
      btn.disabled = true; btn.textContent = 'Generando…';
      E.aDocx(regs, opciones()).then(function (blob) {
        U.descargar(blob, 'catalogo-libros-del-rincon.docx');
        UI.aviso('Documento de Word generado con ' + regs.length + ' fichas.');
      }).catch(function (e) {
        UI.aviso('No se pudo generar el Word: ' + e.message + '. Usa el HTML imprimible.');
      }).then(function () { btn.disabled = false; btn.textContent = 'Word (.docx)'; });
    });

    U.$('#btn-html').addEventListener('click', function () {
      U.descargar(E.aHtml(sel(), opciones()), 'catalogo-libros-del-rincon.html');
    });
    U.$('#btn-xlsx').addEventListener('click', function () {
      E.aXlsx(sel()).then(function (b) { U.descargar(b, 'catalogo-libros-del-rincon.xlsx'); })
        .catch(function (e) { UI.aviso('No se pudo generar el Excel: ' + e.message); });
    });
    U.$('#btn-csv').addEventListener('click', function () {
      U.descargar(E.aCsv(sel()), 'catalogo-libros-del-rincon.csv');
    });
    U.$('#btn-json').addEventListener('click', function () {
      U.descargar(E.aJson(M.estado.registros), 'respaldo-proyecto.json');
    });
  };

  /* ================= AJUSTES ================= */

  UI.render_ajustes = function () {
    var c = M.estado.config;
    var n = U.$('#s-ajustes');
    n.innerHTML = '<h1>Ajustes</h1>' +
      '<div class="tarjeta"><h3>Datos del documento</h3>' +
      '<label for="cfg-escuela">Escuela</label><input type="text" id="cfg-escuela" value="' + U.esc(c.escuela) + '">' +
      '<label for="cfg-responsable">Responsable</label><input type="text" id="cfg-responsable" value="' + U.esc(c.responsable) + '">' +
      '<label for="cfg-ciclo">Ciclo escolar</label><input type="text" id="cfg-ciclo" value="' + U.esc(c.cicloTrabajo) + '"></div>' +

      '<div class="tarjeta"><h3>Proxy para ligas y fuentes sin CORS</h3>' +
      '<label for="cfg-proxy">Plantilla del proxy</label>' +
      '<input type="text" id="cfg-proxy" value="' + U.esc(c.proxy) + '" placeholder="https://mi-proxy.midominio.workers.dev/?url={url}">' +
      '<p class="nota">Déjalo vacío si no tienes uno. Sin proxy, el navegador no puede leer páginas que no autoricen consultas externas, y la Agencia ISBN México queda fuera de alcance. La aplicación lo dice en cada registro en vez de rellenar el hueco con otra fuente.</p>' +
      '<label for="cfg-mx">URL de consulta de ISBN México</label>' +
      '<input type="text" id="cfg-mx" value="' + U.esc(c.urlIsbnMexico) + '"></div>' +

      '<div class="tarjeta"><h3>Umbrales de confianza</h3>' +
      '<p class="nota">Parámetros iniciales de diseño. Ajústalos conforme veas cómo se comporta tu acervo.</p><div class="campo-fila">' +
      [['confirmado', 'Confirmado desde'], ['alta', 'Alta confianza desde'], ['probable', 'Probable desde'], ['revision', 'Revisión desde']]
        .map(function (p) {
          return '<div><label for="u-' + p[0] + '">' + p[1] + '</label><input type="number" id="u-' + p[0] + '" min="0" max="100" value="' + c.umbrales[p[0]] + '"></div>';
        }).join('') + '</div>' +
      '<label for="cfg-concurrencia">Consultas simultáneas</label>' +
      '<input type="number" id="cfg-concurrencia" min="1" max="6" value="' + c.concurrencia + '"></div>' +

      '<div class="acciones"><button class="btn" id="btn-guardar-config">Guardar ajustes</button></div>' +

      '<div class="tarjeta"><h3>Proyecto</h3>' +
      '<p class="nota">Los registros viven en este navegador. Descarga un respaldo antes de cambiar de equipo.</p>' +
      '<div class="acciones"><button class="btn btn-secundario" id="btn-respaldo">Descargar respaldo</button>' +
      '<button class="btn btn-secundario" id="btn-restaurar">Restaurar respaldo</button>' +
      '<input type="file" id="archivo-respaldo" accept=".json" hidden>' +
      '</div></div>' +

      '<div class="tarjeta"><h3>Borrar y reiniciar</h3>' +
      '<p class="nota"><strong>Borrar la caché del navegador no borra nada de esto.</strong> ' +
      'Los datos de la aplicación viven en el almacenamiento del sitio (IndexedDB), que sobrevive a esa limpieza. ' +
      'Para borrarlos hay que hacerlo desde aquí, o bien desde el navegador eligiendo «Cookies y otros datos de sitios», ' +
      'que es una opción distinta a «Archivos e imágenes en caché».</p>' +
      '<div id="diagnostico-almacen" class="nota">Midiendo lo que hay guardado…</div>' +
      '<div class="acciones">' +
      '<button class="btn btn-secundario" id="btn-vaciar-cache">Vaciar caché de consultas</button>' +
      '<button class="btn btn-secundario" id="btn-reset-clasificacion">Restablecer clasificación</button>' +
      '<button class="btn btn-peligro" id="btn-borrar">Borrar los registros</button>' +
      '<button class="btn btn-peligro" id="btn-borrar-todo">Borrar TODO y empezar de cero</button>' +
      '</div>' +
      '<p class="nota"><strong>Vaciar caché de consultas:</strong> olvida lo que respondieron Open Library, Google Books e Internet Archive. ' +
      'Se guardan 30 días, así que si una consulta trajo un dato equivocado, vuelve a aparecer al reprocesar hasta que la vacíes.<br>' +
      '<strong>Restablecer clasificación:</strong> borra los vínculos que asignaste a mano y deja la tabla curricular como viene de fábrica. ' +
      'No toca los libros.<br>' +
      '<strong>Borrar los registros:</strong> se lleva los libros y conserva catálogo, clasificador y ajustes.<br>' +
      '<strong>Borrar TODO:</strong> elimina la base de datos completa. La aplicación queda como recién instalada.</p></div>';

    function pintarDiagnostico() {
      var caja = U.$('#diagnostico-almacen');
      if (!caja) return;
      M.diagnosticoAlmacenamiento().then(function (d) {
        var mb = function (b) { return (b / 1048576).toFixed(1) + ' MB'; };
        caja.innerHTML = 'Guardado ahora mismo en este navegador: <strong>' + d.registros + '</strong> registros (' +
          d.conPortadaIncrustada + ' con portada incrustada) · <strong>' + d.cacheEnDisco +
          '</strong> respuestas de fuentes en caché · <strong>' + d.vinculosManuales +
          '</strong> vínculos de categoría hechos a mano · ' + d.categorias + ' categorías' +
          (d.respaldoLocal ? ' · respaldo en localStorage de ' + mb(d.respaldoLocal) : '') +
          (d.cuota ? ' · espacio usado ' + mb(d.cuota.usado) + ' de ' + mb(d.cuota.disponible) : '');
      }).catch(function () { caja.textContent = 'No se pudo medir el almacenamiento.'; });
    }
    pintarDiagnostico();

    U.$('#btn-vaciar-cache').addEventListener('click', function () {
      M.cache.vaciar().then(function (ok) {
        UI.aviso(ok ? 'Caché de consultas vaciada. La próxima vez se preguntará de nuevo a las fuentes.'
                    : 'No se pudo vaciar la caché.');
        pintarDiagnostico();
      });
    });

    U.$('#btn-reset-clasificacion').addEventListener('click', function () {
      var n = Object.keys(M.estado.puenteManual || {}).length;
      if (!confirm('Se borrarán ' + n + ' vínculo(s) de categoría asignados a mano y la tabla curricular volverá a su estado de fábrica. Los libros no se tocan. ¿Continuar?')) return;
      M.restablecerClasificacion().then(function () {
        UI.aviso('Clasificación restablecida.');
        pintarDiagnostico(); UI.actualizarCabecera();
      });
    });

    U.$('#btn-borrar-todo').addEventListener('click', function () {
      if (!confirm('Se eliminará la base de datos completa: registros, caché, clasificación y ajustes. La aplicación quedará como recién instalada y esto NO se puede deshacer.\n\n¿Descargaste un respaldo?')) return;
      if (!confirm('Última confirmación: borrar TODO.')) return;
      M.borrarTodo().then(function (ok) {
        if (ok) {
          alert('Todo borrado. La página se va a recargar.');
          location.reload();
        } else {
          alert('No se pudo borrar la base de datos. Suele ser porque la aplicación está abierta en otra pestaña: ciérralas todas y vuelve a intentarlo.');
        }
      });
    });

    U.$('#btn-guardar-config').addEventListener('click', function () {
      c.escuela = U.$('#cfg-escuela').value;
      c.responsable = U.$('#cfg-responsable').value;
      c.cicloTrabajo = U.$('#cfg-ciclo').value;
      c.proxy = U.limpia(U.$('#cfg-proxy').value);
      c.urlIsbnMexico = U.limpia(U.$('#cfg-mx').value);
      ['confirmado', 'alta', 'probable', 'revision'].forEach(function (k) {
        c.umbrales[k] = parseInt(U.$('#u-' + k).value, 10) || c.umbrales[k];
      });
      c.concurrencia = parseInt(U.$('#cfg-concurrencia').value, 10) || 3;
      U.red.concurrencia = c.concurrencia;
      M.guardar().then(function () { UI.aviso('Ajustes guardados.'); });
    });
    U.$('#btn-respaldo').addEventListener('click', function () {
      U.descargar(E.aJson(M.estado.registros), 'respaldo-proyecto.json');
    });
    U.$('#btn-restaurar').addEventListener('click', function () { U.$('#archivo-respaldo').click(); });
    U.$('#archivo-respaldo').addEventListener('change', function () {
      var a = this.files[0];
      if (!a) return;
      a.text().then(function (t) {
        var d = JSON.parse(t);
        if (!Array.isArray(d.registros)) throw new Error('El archivo no contiene una lista de registros.');
        M.estado.registros = M.normalizarRegistros(d.registros);
        if (d.taxonomia && d.taxonomia.length) M.estado.taxonomia = d.taxonomia;
        if (d.puenteManual) M.estado.puenteManual = d.puenteManual;
        if (d.configuracion) Object.keys(d.configuracion).forEach(function (k) { M.estado.config[k] = d.configuracion[k]; });
        S.construirPuente();
        I.renumerar();
        return M.guardar();
      }).then(function () {
        UI.aviso('Respaldo restaurado: ' + M.estado.registros.length + ' registros.');
        UI.actualizarCabecera();
        UI.render_ajustes();
      }).catch(function (e) { UI.aviso('No se pudo restaurar: ' + e.message); });
    });
    U.$('#btn-borrar').addEventListener('click', function () {
      if (!confirm('Se borrarán los ' + M.estado.registros.length + ' registros del proyecto. El catálogo SEP y la tabla curricular se conservan. ¿Continuar?')) return;
      var conCache = confirm('¿Vaciar también la caché de consultas a fuentes?\n\nAceptar: se olvida lo que respondieron Open Library y Google Books, y al reprocesar se les vuelve a preguntar. Conviene si venías arrastrando datos equivocados.\nCancelar: se conserva la caché y el reproceso será más rápido.');
      M.limpiarProyecto(conCache).then(function () {
        UI.aviso('Proyecto vacío.');
        UI.actualizarCabecera();
        UI.render_ajustes();
      });
    });
  };

  /* ================= eventos delegados ================= */

  // El clic llega al nodo exacto que se tocó. Si es el <strong> con el conteo
  // dentro de un botón, ese nodo no lleva el atributo y la acción se perdía en
  // silencio: los filtros por motivo no respondían al tocarles el número.
  // Aquí se sube al elemento que sí lo declara.
  function portador(nodo, atributo) {
    if (!nodo || !nodo.closest) return null;
    return nodo.closest('[' + atributo + ']');
  }

  function accionesPanel(e) {
    var reg = UI.regActual;
    var t = e.target;
    var p;

    if ((p = portador(t, 'data-pestana'))) { t = p; }
    else if ((p = portador(t, 'data-usar-campo'))) { t = p; }
    else if ((p = portador(t, 'data-elegir'))) { t = p; }
    else if ((p = portador(t, 'data-resolver'))) { t = p; }
    else if ((p = portador(t, 'data-sep-aplicar'))) { t = p; }
    else if (t.id === '' && (p = t.closest('button[id]'))) { t = p; }

    if (t.getAttribute('data-pestana')) {
      UI.pestanaActual = t.getAttribute('data-pestana');
      UI.pintarFicha();
      return;
    }
    if (t.getAttribute('data-usar-campo')) {
      var campoU = t.getAttribute('data-usar-campo'), fuenteU = t.getAttribute('data-usar-fuente');
      if (R.conservarValor(reg, campoU, fuenteU)) {
        R.recalcularEstado(reg);
        M.guardarDiferido();
        UI.pintarFicha(); UI.tablaResultados(); UI.actualizarCabecera();
        UI.aviso('En "' + campoU + '" queda el valor de ' + M.nombreFuente(fuenteU) + '.');
      } else {
        UI.aviso('Ese valor ya no está entre las evidencias del registro.');
      }
      return;
    }
    if (t.getAttribute('data-elegir')) {
      R.confirmarCandidato(reg, t.getAttribute('data-elegir')).then(function () {
        UI.pintarFicha(); UI.tablaResultados(); UI.actualizarCabecera(); UI.aviso('Edición cambiada.');
      });
      return;
    }
    if (t.getAttribute('data-resolver')) {
      var cf = reg.conflictos.filter(function (c) { return c.id === t.getAttribute('data-resolver'); })[0];
      var idx = parseInt(t.getAttribute('data-valor'), 10);
      if (cf) {
        R.resolverConflicto(reg, cf.id, cf.valores[idx].valor, 'Elegido en revisión el valor de ' + cf.valores[idx].fuentes[0].fuente);
        UI.pintarFicha(); UI.tablaResultados(); UI.actualizarCabecera();
      }
      return;
    }
    if (t.getAttribute('data-sep-aplicar')) {
      var f = S.todas().filter(function (x) { return x.id === t.getAttribute('data-sep-aplicar'); })[0];
      if (f) {
        S.aplicar(reg, { ficha: f, puntos: 95, motivo: 'Ficha SEP elegida en revisión' });
        R.quitarDeCola(reg, 'Coincidencia SEP por confirmar');
        M.guardarDiferido();
        UI.pintarFicha(); UI.aviso('Ficha SEP aplicada.');
      }
      return;
    }

    switch (t.id) {
      case 'btn-guardar-campo':
        var campo = U.$('#campo-editar').value, valor = U.$('#valor-editar').value;
        if (!U.limpia(valor)) return UI.aviso('Escribe un valor.');
        R.capturaManual(reg, campo, valor);
        UI.pintarFicha(); UI.tablaResultados();
        break;
      case 'btn-obs':
        var texto = prompt('Observación para esta ficha:');
        if (texto) { M.observar(reg, texto, false); M.guardarDiferido(); UI.pintarFicha(); }
        break;
      case 'btn-fisico':
        reg.fisico.estado_fisico = U.$('#sel-fisico').value;
        reg.fisico.notas = U.$('#nota-fisico').value;
        if (M.tieneEstadoFisico(reg)) {
          M.fijarCampo(reg, 'estado_fisico', reg.fisico.estado_fisico, 'manual', 100, 'Capturado con el ejemplar en la mano');
        } else if (reg.campos.estado_fisico) {
          delete reg.campos.estado_fisico;   // no se asienta como capturado lo que no se capturó
        }
        M.guardarDiferido();
        UI.pintarFicha(); UI.aviso('Estado físico guardado.');
        break;
      case 'btn-completado':
        var r1 = R.marcarCompletado(reg);
        UI.aviso(r1.ok ? ('Registro completado' + (r1.pendientes.length ? '; quedan pendientes: ' + r1.pendientes.join(', ') : '.')) : r1.motivo);
        UI.pintarFicha(); UI.tablaResultados(); UI.actualizarCabecera();
        break;
      case 'btn-reprocesar':
        UI.aviso('Procesando…');
        X.procesar(reg).then(function () {
          M.guardar(); UI.pintarFicha(); UI.tablaResultados(); UI.actualizarCabecera(); UI.aviso('Registro reprocesado.');
        });
        break;
      case 'btn-eliminar':
        if (!confirm('¿Eliminar este registro del proyecto?')) return;
        M.estado.registros = M.estado.registros.filter(function (x) { return x.id !== reg.id; });
        I.renumerar(); M.guardar(); UI.cerrarPanel(); UI.tablaResultados(); UI.actualizarCabecera();
        break;
      case 'btn-pendiente':
        R.dejarPendiente(reg, prompt('¿Qué falta para cerrar esta ficha?') || '');
        UI.pintarFicha(); UI.actualizarCabecera();
        break;
      case 'btn-noident':
        R.marcarNoIdentificado(reg, prompt('Motivo:') || '');
        UI.pintarFicha(); UI.tablaResultados(); UI.actualizarCabecera();
        break;
      case 'btn-buscar-portada':
        X.resolverPortada(reg).then(function () { M.guardarDiferido(); UI.pintarFicha(); });
        break;
      case 'btn-descargar-portada':
        X.descargarPortada(reg).then(function (d) {
          M.guardarDiferido(); UI.pintarFicha();
          UI.aviso(d ? 'Portada lista para incrustarse.' : 'No se pudo descargar la imagen; se conserva la liga.');
        });
        break;
      case 'btn-quitar-portada':
        reg.portada = { url: '', fuente: 'sin_portada', isbn_usado: '', olid: '', verificada: false, confianza: 0, dataUrl: '' };
        M.observar(reg, 'Portada retirada manualmente.', false);
        M.guardarDiferido(); UI.pintarFicha(); UI.tablaResultados();
        break;
      case 'btn-portada-url':
        var u = U.limpia(U.$('#url-portada').value);
        if (!/^https?:\/\//.test(u)) return UI.aviso('Escribe una URL completa.');
        reg.portada = { url: u, fuente: 'manual', isbn_usado: '', olid: '', verificada: false, confianza: 50, dataUrl: '', ancho: 0, alto: 0 };
        M.observar(reg, 'Portada indicada manualmente; queda como no verificada hasta ligarla al ISBN de la edición.', false);
        M.guardarDiferido(); UI.pintarFicha(); UI.tablaResultados();
        break;
    }
  }

  function accionesGenerales(e) {
    var t = e.target, p;
    ['data-motivo', 'data-ir', 'data-ficha', 'data-sep-ver', 'data-sep-crear', 'data-fusionar']
      .some(function (a) { p = portador(e.target, a); if (p) { t = p; return true; } return false; });
    if (t.hasAttribute && t.hasAttribute('data-motivo')) {
      var mot = t.getAttribute('data-motivo');
      UI.filtroRevision = mot ? { motivo: mot } : null;
      return UI.render_revision();
    }
    if (t.getAttribute('data-ir')) return UI.ir(t.getAttribute('data-ir'));
    if (t.getAttribute('data-ficha')) return UI.abrirFicha(t.getAttribute('data-ficha'));
    if (t.getAttribute('data-sep-ver')) return UI.verFichaSep(t.getAttribute('data-sep-ver'));
    if (t.getAttribute('data-sep-crear')) return UI.crearDesdeSep(t.getAttribute('data-sep-crear'));
    if (t.getAttribute('data-fusionar')) {
      var ids = t.getAttribute('data-fusionar').split('|');
      var a = M.estado.registros.filter(function (r) { return r.id === ids[0]; })[0];
      var b = M.estado.registros.filter(function (r) { return r.id === ids[1]; })[0];
      if (a && b) { R.fusionar(a, b); UI.render_revision(); UI.actualizarCabecera(); UI.aviso('Registros fusionados.'); }
    }
  }

  /* ================= arranque ================= */

  UI.iniciar = function () {
    S.construirIndice();
    document.addEventListener('click', function (e) {
      if (U.$('#panel-cuerpo').contains(e.target)) accionesPanel(e);
      accionesGenerales(e);
    });
    document.addEventListener('change', function (e) {
      var id = e.target.getAttribute && (e.target.getAttribute('data-fisico-estado') || e.target.getAttribute('data-fisico-nota'));
      if (!id) return;
      var reg = M.estado.registros.filter(function (r) { return r.id === id; })[0];
      if (!reg) return;
      var fila = e.target.closest('[data-fisico-reg]');
      var est = fila.querySelector('[data-fisico-estado]').value;
      var nota = fila.querySelector('[data-fisico-nota]').value;
      reg.fisico.estado_fisico = est;
      reg.fisico.notas = nota;
      reg.fisico.revisado_en = U.ahora();
      if (M.tieneEstadoFisico(reg)) {
        M.fijarCampo(reg, 'estado_fisico', est, 'manual', 100, 'Capturado con el ejemplar en la mano (§22)');
        M.observar(reg, 'Estado físico del ejemplar: ' + est + (nota ? ' — ' + nota : '') + '.', false);
      } else if (reg.campos.estado_fisico) {
        delete reg.campos.estado_fisico;
      }
      reg.actualizado = U.ahora();
      M.guardarDiferido();
      fila.classList.add('guardado');
    });
    window.addEventListener('lr-guardado', function (e) {
      var g = e.detail;
      if (g.ok === false) {
        UI.avisoPersistente('No se pudo guardar el proyecto en este navegador (' + g.error +
          '). Descarga un respaldo desde Ajustes antes de cerrar la pestaña: lo que hagas ahora no se está conservando.');
      } else if (g.medio.indexOf('localStorage') === 0) {
        UI.avisoPersistente('El proyecto se está guardando en el respaldo del navegador, sin las portadas incrustadas. Se volverán a descargar al exportar.');
      } else {
        UI.avisoPersistente('');
      }
    });
    // Cerrado desde el primer instante: si algo falla más adelante en el
    // arranque, la ficha vacía no se queda encima de la aplicación.
    UI.cerrarPanel();
    U.$('#panel-cerrar').addEventListener('click', UI.cerrarPanel);
    U.$('#panel-fondo').addEventListener('click', function (e) { if (e.target === this) UI.cerrarPanel(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') UI.cerrarPanel(); });
    window.addEventListener('hashchange', function () { UI.ir(location.hash.replace('#', '')); });

    M.cargar().then(function () {
      S.semilla();
      S.construirPuente();
      U.red.concurrencia = M.estado.config.concurrencia || 3;
      I.renumerar();
      UI.ir(location.hash.replace('#', '') || 'inicio');
      UI.actualizarCabecera();
    });
  };

  global.LR.ui = UI;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', UI.iniciar);
  else UI.iniciar();
})(window);
