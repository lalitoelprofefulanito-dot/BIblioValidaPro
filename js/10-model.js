/* =========================================================================
   10-model.js — Modelo de datos y persistencia (§4, §7, §24, §27)
   Un registro = un ejemplar/ficha en trabajo. Separa obra, edición,
   registro SEP, ejemplar físico, evidencia, fuente y portada.
   Cada valor de campo guarda de dónde salió: sin evidencia no hay valor.
   ========================================================================= */
(function (global) {
  'use strict';

  var U = global.LR.util;
  var M = {};

  /* ---------- estados del registro (§27) ---------- */

  M.ESTADOS = ['NUEVO', 'EXTRAYENDO', 'EN BÚSQUEDA', 'CANDIDATO', 'IDENTIFICADO',
    'REVISIÓN', 'CONFIRMADO', 'SIN RESULTADO', 'COMPLETADO', 'ERROR'];

  // Umbrales de puntuación (§10). Editables desde Configuración: son parámetros
  // de diseño, no verdades; deben calibrarse con el corpus real.
  M.UMBRALES_POR_DEFECTO = { confirmado: 95, alta: 85, probable: 70, revision: 50 };

  M.PUNTOS_POR_DEFECTO = {
    isbn_exacto: 100,
    isbn_equivalente: 98,
    isbn_titulo: 95,
    isbn_autor: 95,
    titulo_autor_editorial_anio: 90,
    titulo_autor_anio: 80,
    titulo_editorial: 70,
    titulo_similar: 50,
    solo_titulo: 30
  };

  M.estadoPorPuntuacion = function (p, umbrales) {
    var u = umbrales || M.UMBRALES_POR_DEFECTO;
    if (p >= u.confirmado) return 'CONFIRMADO';
    if (p >= u.alta) return 'IDENTIFICADO';
    if (p >= u.probable) return 'CANDIDATO';
    if (p >= u.revision) return 'REVISIÓN';
    return 'SIN RESULTADO';
  };

  M.ESTADOS_FISICOS = ['Excelente', 'Bueno', 'Regular', 'Deteriorado', 'Incompleto', 'Pendiente'];

  /* ---------- campos exportables, en el orden exacto del documento (§32) ---------- */

  M.CAMPOS_SALIDA = [
    { clave: 'portada', etiqueta: 'Portada' },
    { clave: 'n', etiqueta: 'N°' },
    { clave: 'titulo', etiqueta: 'Título' },
    { clave: 'autor', etiqueta: 'Autor' },
    { clave: 'editorial', etiqueta: 'Editorial' },
    { clave: 'anio', etiqueta: 'Año' },
    // ISBN-10 e ISBN-13 en columnas separadas, en este orden, para que la
    // exportación caiga exactamente sobre la hoja "Inventario" de Biblioteca
    // Viva. El orden de aquí abajo replica el de esa hoja columna por columna:
    // si divergen, la exportación deja de servir para pegarla directo.
    { clave: 'isbn10', etiqueta: 'ISBN-10' },
    { clave: 'isbn13', etiqueta: 'ISBN-13' },
    { clave: 'estado_fisico', etiqueta: 'Estado físico' },
    { clave: 'resena', etiqueta: 'Reseña del libro' },
    { clave: 'grado', etiqueta: 'Grado' },
    { clave: 'tipo_texto', etiqueta: 'Tipo de texto' },
    { clave: 'categoria_sep', etiqueta: 'Categoría SEP' },
    { clave: 'contenidos_saberes', etiqueta: 'Contenidos y Saberes' },
    { clave: 'color', etiqueta: 'Color' },
    { clave: 'subserie', etiqueta: 'Subserie (SEP – Libros del Rincón)' },
    { clave: 'observaciones', etiqueta: 'Observaciones' },
    { clave: 'ubicacion', etiqueta: 'Ubicación' },
    { clave: 'codigo_bv', etiqueta: 'Código Biblioteca Viva' },
    // Va al final a propósito: agregarla en medio rompería las integraciones
    // externas que leen columnas por posición.
    { clave: 'procedencia', etiqueta: 'Procedencia' }
  ];

  /* ---------- ISBN-10 / ISBN-13 ---------- */

  // Convertir entre ISBN-10 e ISBN-13 no es adivinar: es una operación exacta
  // (prefijo 978 y recálculo del dígito de control). Por eso se deriva el que
  // falte, siempre que el que existe pase su propia validación, y se deja dicho
  // que salió de una conversión y no de una fuente. Un ISBN-13 que empieza con
  // 979 no tiene equivalente de 10 dígitos y se queda solo.
  M.derivarIsbn = function (reg) {
    // Se mira también lo que vino en la entrada: al importar, los valores aún
    // son evidencia y no decisión, y leyendo solo lo decidido la derivación no
    // encontraba nada que convertir y se quedaba sin hacer su trabajo.
    var c = reg.crudo || {};
    var d10 = U.isbn.limpiar(M.valor(reg, 'isbn10') || c.isbn10 || ''),
        d13 = U.isbn.limpiar(M.valor(reg, 'isbn13') || c.isbn13 || ''),
        suelto = U.isbn.limpiar(M.valor(reg, 'isbn') || c.isbn || '');
    if (suelto && !d10 && !d13) {
      if (suelto.length === 10) d10 = suelto; else if (suelto.length === 13) d13 = suelto;
    }
    if (d10 && U.isbn.valido10(d10) && !M.valor(reg, 'isbn10')) {
      M.fijarCampo(reg, 'isbn10', d10, 'entrada', 100, 'ISBN de 10 dígitos de la entrada');
    }
    if (d13 && U.isbn.valido13(d13) && !M.valor(reg, 'isbn13')) {
      M.fijarCampo(reg, 'isbn13', d13, 'entrada', 100, 'ISBN de 13 dígitos de la entrada');
    }
    if (d10 && U.isbn.valido10(d10) && !d13) {
      var n13 = U.isbn.a13(d10);
      if (n13) M.fijarCampo(reg, 'isbn13', n13, 'derivado', 100,
        'Calculado a partir del ISBN-10 ' + d10 + ': conversión exacta con prefijo 978, no proviene de ninguna fuente externa');
    } else if (d13 && U.isbn.valido13(d13) && !d10 && d13.indexOf('978') === 0) {
      var n10 = U.isbn.a10(d13);
      if (n10) M.fijarCampo(reg, 'isbn10', n10, 'derivado', 100,
        'Calculado a partir del ISBN-13 ' + d13 + ': conversión exacta, no proviene de ninguna fuente externa');
    } else if (d13 && U.isbn.valido13(d13) && !d10 && d13.indexOf('979') === 0) {
      M.observar(reg, 'Este ISBN-13 empieza con 979 y por eso no tiene equivalente de 10 dígitos: la columna ISBN-10 queda vacía a propósito.');
    }
    if (d13 && !M.valor(reg, 'isbn13') && U.isbn.valido13(d13)) {
      M.fijarCampo(reg, 'isbn13', d13, 'entrada', 100, 'ISBN de 13 dígitos de la entrada');
    }
    return { isbn10: M.valor(reg, 'isbn10'), isbn13: M.valor(reg, 'isbn13') };
  };

  // El ISBN que usa el motor para buscar, cruzar y detectar duplicados. Existe
  // para que separar la columna en ISBN-10 e ISBN-13 no obligue a tocar cada
  // sitio que consulta el ISBN: si solo se hubiera cambiado la salida, un
  // registro con ISBN-13 habría contado como «sin ISBN» en el control de
  // calidad, en los indicadores y en el cruce de duplicados.
  M.isbnCanonico = function (reg) {
    if (!reg) return '';
    return U.limpia(M.valor(reg, 'isbn13')) || U.limpia(M.valor(reg, 'isbn10')) ||
           U.limpia(M.valor(reg, 'isbn')) ||
           U.limpia(reg.crudo && (reg.crudo.isbn13 || reg.crudo.isbn10 || reg.crudo.isbn)) || '';
  };

  /* ---------- procedencia: se decide con el ejemplar en la mano ---------- */

  // La procedencia distingue el acervo de Libros del Rincón del acervo General
  // (donado, comprado, comercial). Se decide por el sello o logotipo oficial SEP
  // impreso en el ejemplar, NO por lo educativo que parezca su contenido y NO
  // por coincidir con algún catálogo: el mismo título circula también en
  // ediciones comerciales de otras editoriales.
  M.PROCEDENCIAS = ['Rincón', 'General'];
  M.PROCEDENCIA_PENDIENTE = 'Sin determinar';

  M.procedencia = function (reg) {
    var v = U.limpia(M.valor(reg, 'procedencia'));
    return M.PROCEDENCIAS.indexOf(v) > -1 ? v : M.PROCEDENCIA_PENDIENTE;
  };

  // Solo una persona puede fijarla. No hay ninguna vía automática, a propósito.
  M.fijarProcedencia = function (reg, valor, nota) {
    if (M.PROCEDENCIAS.indexOf(valor) === -1) {
      delete reg.campos.procedencia;
      return M.PROCEDENCIA_PENDIENTE;
    }
    M.fijarCampo(reg, 'procedencia', valor, 'manual', 100,
      nota || 'Verificado en el ejemplar físico: ' +
      (valor === 'Rincón' ? 'trae el sello oficial de Libros del Rincón' : 'no trae el sello oficial SEP'));
    return valor;
  };

  /* ---------- fuentes (§5, §40) ---------- */

  M.FUENTES = {
    entrada: { nombre: 'Entrada del usuario', tipo: 'entrada', prioridad: 1 },
    sep: { nombre: 'Catálogo histórico SEP / Libros del Rincón', tipo: 'sep', prioridad: 1 },
    // No es una fuente externa: es aritmética sobre un dato que ya estaba.
    derivado: { nombre: 'Conversión exacta de ISBN', tipo: 'derivado', prioridad: 1 },
    sep_pdf: { nombre: 'Catálogo histórico SEP 1986-2006 (PDF)', tipo: 'sep', prioridad: 2 },
    openlibrary: { nombre: 'Open Library', tipo: 'bibliografica', prioridad: 2 },
    googlebooks: { nombre: 'Google Books', tipo: 'bibliografica', prioridad: 3 },
    isbnmexico: { nombre: 'Agencia ISBN México', tipo: 'bibliografica', prioridad: 4 },
    loc: { nombre: 'Library of Congress', tipo: 'bibliografica', prioridad: 5 },
    url: { nombre: 'URL suministrada', tipo: 'web', prioridad: 6 },
    ocr: { nombre: 'OCR de imagen', tipo: 'imagen', prioridad: 7 },
    manual: { nombre: 'Captura manual', tipo: 'manual', prioridad: 0 },
    taxonomia: { nombre: 'Tabla curricular maestra', tipo: 'curricular', prioridad: 1 }
  };

  M.nombreFuente = function (id) {
    return (M.FUENTES[id] && M.FUENTES[id].nombre) || id || 'Sin fuente';
  };

  /* ---------- registro ---------- */

  M.nuevoRegistro = function (datosCrudos, entrada) {
    var r = {
      id: U.uid('reg'),
      n: null,
      estado: 'NUEVO',
      confianza: 0,
      crudo: datosCrudos || {},          // lo que llegó, nunca se modifica (§36.11)
      entradas: entrada ? [entrada] : [], // procedencia de cada aporte (§15)
      campos: {},                        // valor elegido por campo, con su fuente
      evidencias: [],                    // todo lo que dijo cada fuente (§24)
      candidatos: [],                    // ediciones candidatas puntuadas (§9, §10)
      obra: null,                        // {titulo_canonico, titulo_original, autores, ol_work}
      edicion: null,                     // {isbn10, isbn13, editorial, anio, ...}
      sep: null,                         // ficha del catálogo histórico
      curricular: null,                  // {categoria, disciplina, color, contenidos, saberes}
      portada: { url: '', fuente: '', isbn_usado: '', olid: '', verificada: false, confianza: 0, dataUrl: '' },
      fisico: { estado_fisico: '', notas: '' },
      observaciones: [],
      conflictos: [],
      revision: { enCola: false, motivos: [], severidad: '', resolucion: '', resuelto_en: '' },
      creado: U.ahora(),
      actualizado: U.ahora()
    };
    // Los valores de entrada son la primera evidencia.
    ['titulo', 'autor', 'editorial', 'anio', 'isbn', 'isbn10', 'isbn13',
     'estado_fisico', 'grado', 'tipo_texto', 'categoria_sep', 'subserie',
     'ubicacion', 'codigo_bv', 'observaciones'].forEach(function (c) {
      var v = U.limpia(r.crudo[c]);
      if (v) M.registrarEvidencia(r, c, v, 'entrada', 60, (entrada && entrada.origen) || '');
    });
    if (r.crudo.estado_fisico) r.fisico.estado_fisico = U.limpia(r.crudo.estado_fisico);
    // El par ISBN se completa desde el primer momento: convertir entre 10 y 13
    // es exacto y así el registro nace con las dos columnas de la hoja llenas.
    M.derivarIsbn(r);
    // La procedencia que trae un inventario NO es una deducción de la máquina:
    // es la decisión de quien revisó el ejemplar, escrita antes. Lo que la regla
    // prohíbe es inferirla de una coincidencia de catálogo, no recogerla de la
    // hoja donde ya se había asentado. Se acepta diciendo de dónde viene.
    var pr = U.limpia(r.crudo.procedencia);
    if (M.PROCEDENCIAS.indexOf(pr) > -1) {
      M.fijarProcedencia(r, pr, 'Capturada en el inventario' +
        ((entrada && entrada.origen) ? ' («' + entrada.origen + '»)' : '') +
        ' por quien revisó el ejemplar; no proviene de ninguna coincidencia de catálogo');
    }
    return r;
  };

  // Un respaldo escrito por una versión anterior —o editado a mano— puede no
  // traer todas las estructuras. Antes, un registro sin `revision` tumbaba la
  // aplicación al abrirla y el proyecto entero quedaba inaccesible. Aquí se
  // completa lo que falte sin tocar lo que sí venga: nada se sobrescribe.
  // Estados que solo existen mientras un registro se está procesando. Si el
  // navegador se cierra a media pasada, el guardado incremental los deja
  // asentados y el registro queda huérfano: Procesamiento solo ofrece los
  // NUEVO, la bandeja solo muestra los que están en revisión, y ningún
  // indicador lo cuenta. El libro desaparecía de la vista sin haberse
  // procesado. Al cargar se devuelven a la cola y se declara por qué.
  M.ESTADOS_EN_CURSO = ['EXTRAYENDO', 'EN BÚSQUEDA'];

  M.rescatarInterrumpidos = function (registros) {
    var rescatados = [];
    (registros || []).forEach(function (r) {
      if (M.ESTADOS_EN_CURSO.indexOf(r.estado) === -1) return;
      r.estado = 'NUEVO';
      M.observar(r, 'El procesamiento de este registro quedó a medias (se cerró la aplicación o se perdió la conexión). Vuelve a la cola de pendientes; nada de lo que ya se había averiguado se borró.');
      rescatados.push(r);
    });
    return rescatados;
  };

  M.normalizarRegistro = function (r) {
    if (!r || typeof r !== 'object') return null;
    r.id = r.id || U.uid('reg');
    r.estado = M.ESTADOS.indexOf(r.estado) > -1 ? r.estado : 'NUEVO';
    r.confianza = typeof r.confianza === 'number' ? r.confianza : 0;
    r.crudo = r.crudo || {};
    r.campos = r.campos || {};
    ['entradas', 'evidencias', 'candidatos', 'observaciones', 'conflictos', 'tecnico'].forEach(function (k) {
      if (!Array.isArray(r[k])) r[k] = [];
    });
    r.revision = r.revision || {};
    if (!Array.isArray(r.revision.motivos)) r.revision.motivos = [];
    r.revision.enCola = r.revision.enCola === true;
    if (typeof r.revision.severidad !== 'string') r.revision.severidad = '';
    r.fisico = r.fisico || { estado_fisico: '', notas: '' };
    r.portada = r.portada || {};
    ['url', 'fuente', 'isbn_usado', 'olid', 'dataUrl'].forEach(function (k) {
      if (typeof r.portada[k] !== 'string') r.portada[k] = '';
    });
    r.portada.verificada = r.portada.verificada === true;
    if (typeof r.portada.confianza !== 'number') r.portada.confianza = 0;
    r.creado = r.creado || U.ahora();
    r.actualizado = r.actualizado || U.ahora();
    return r;
  };

  M.normalizarRegistros = function (lista) {
    var out = (Array.isArray(lista) ? lista : []).map(M.normalizarRegistro).filter(Boolean);
    M.rescatarInterrumpidos(out);
    return out;
  };

  // Guarda lo que dijo una fuente sobre un campo. No elige nada todavía.
  M.registrarEvidencia = function (reg, campo, valor, fuenteId, confianza, ref, extra) {
    valor = U.limpia(valor);
    if (!valor) return null;
    var ev = {
      id: U.uid('ev'),
      campo: campo,
      valor: valor,
      fuente: fuenteId,
      fuente_nombre: M.nombreFuente(fuenteId),
      confianza: confianza == null ? 50 : confianza,
      referencia: ref || '',
      extra: extra || null,
      fecha: U.ahora()
    };
    // No duplicar evidencia idéntica de la misma fuente.
    var yaEsta = reg.evidencias.some(function (e) {
      return e.campo === campo && e.fuente === fuenteId && U.norm(e.valor) === U.norm(valor);
    });
    if (yaEsta) return null;
    reg.evidencias.push(ev);
    reg.actualizado = U.ahora();
    return ev;
  };

  // Fija el valor que irá al documento, siempre con fuente y motivo explícitos (§24).
  // `humano` marca que la decisión la tomó una persona aunque el valor
  // provenga de una fuente: eso impide que un reprocesamiento la borre.
  M.fijarCampo = function (reg, campo, valor, fuenteId, confianza, decision, humano) {
    valor = U.limpia(valor);
    reg.campos[campo] = {
      valor: valor,
      fuente: fuenteId,
      fuente_nombre: M.nombreFuente(fuenteId),
      confianza: confianza == null ? 50 : confianza,
      decision: decision || '',
      fecha: U.ahora(),
      manual: fuenteId === 'manual' || humano === true
    };
    reg.actualizado = U.ahora();
    return reg.campos[campo];
  };

  // Un campo decidido por una persona no se sobrescribe automáticamente (§24).
  M.decididoPorPersona = function (reg, campo) {
    return !!(reg.campos[campo] && reg.campos[campo].manual);
  };

  M.valor = function (reg, campo) {
    return (reg.campos[campo] && reg.campos[campo].valor) || '';
  };

  M.evidenciasDe = function (reg, campo) {
    return reg.evidencias.filter(function (e) { return e.campo === campo; });
  };

  // Detalle técnico (URLs, códigos HTTP). Va en su propio sitio porque las
  // observaciones acaban impresas en la columna del inventario, y una URL con
  // el título codificado dentro ocupaba doscientos caracteres por incidencia.
  // Aquí queda disponible para diagnosticar sin ensuciar lo que se lee.
  M.anotarTecnico = function (reg, texto) {
    texto = U.limpia(texto);
    if (!texto) return;
    if (!Array.isArray(reg.tecnico)) reg.tecnico = [];
    if (reg.tecnico.indexOf(texto) > -1) return;
    reg.tecnico.push(texto);
    // Acotado: interesa lo último que falló, no un historial infinito.
    if (reg.tecnico.length > 12) reg.tecnico = reg.tecnico.slice(-12);
  };

  M.observar = function (reg, texto, auto) {
    texto = U.limpia(texto);
    if (!texto) return;
    var existe = reg.observaciones.some(function (o) { return o.texto === texto; });
    if (existe) return;
    reg.observaciones.push({ texto: texto, auto: auto !== false, fecha: U.ahora() });
    reg.actualizado = U.ahora();
  };

  M.observacionesTexto = function (reg) {
    return reg.observaciones.map(function (o) { return o.texto; }).join(' ');
  };

  var ORDEN_SEVERIDAD = { alta: 0, media: 1, baja: 2 };

  // Deja la revisión en blanco para que una nueva vuelta la vuelva a construir
  // con los motivos que encuentre ahora. Las resoluciones ya tomadas viven en
  // reg.conflictos y no se tocan aquí.
  M.reiniciarRevision = function (reg) {
    reg.revision = reg.revision || {};
    reg.revision.motivos = [];
    reg.revision.enCola = false;
    reg.revision.severidad = '';
    return reg.revision;
  };

  M.aRevision = function (reg, motivo, severidad) {
    reg.revision.enCola = true;
    if (reg.revision.motivos.indexOf(motivo) === -1) reg.revision.motivos.push(motivo);
    // La severidad se queda con la más alta acumulada: un motivo grave posterior
    // no debe quedar oculto detrás de uno leve anterior. El primer motivo fija
    // la severidad tal cual llega: tomar "media" como piso convertía en media
    // toda incidencia leve —"sin portada", "guion en el título"— y llenaba la
    // bandeja de urgencias falsas.
    var nueva = ORDEN_SEVERIDAD[severidad] != null ? severidad : 'media';
    var previa = ORDEN_SEVERIDAD[reg.revision.severidad] != null ? reg.revision.severidad : null;
    reg.revision.severidad = (previa === null || ORDEN_SEVERIDAD[nueva] < ORDEN_SEVERIDAD[previa]) ? nueva : previa;
    // Un motivo grave sí degrada un registro ya confirmado; uno leve
    // (por ejemplo, sin portada) lo deja confirmado pero en la bandeja.
    if (reg.estado !== 'CONFIRMADO' || reg.revision.severidad === 'alta') reg.estado = 'REVISIÓN';
    reg.actualizado = U.ahora();
  };

  /* ---------- estado global del proyecto ---------- */

  M.estado = {
    registros: [],
    taxonomia: [],                 // tabla curricular maestra (§19, §20)
    puenteManual: {},              // categoría del catálogo -> categoría del clasificador, asignada a mano
    config: {
      proxy: '',                   // plantilla con {url}; vacío = sin proxy
      usarOpenLibrary: true,
      usarGoogleBooks: true,
      usarLOC: true,
      usarIsbnMexico: false,       // requiere proxy: sin él no hay consulta posible
      urlIsbnMexico: 'https://www.isbnmexico.indautor.gob.mx/frmconsultaisbn.php?isbn={isbn}',
      umbrales: JSON.parse(JSON.stringify(M.UMBRALES_POR_DEFECTO)),
      puntos: JSON.parse(JSON.stringify(M.PUNTOS_POR_DEFECTO)),
      concurrencia: 3,
      // Vacíos a propósito. Llevaban el nombre de una escuela concreta escrito
      // en el código, así que cualquiera que abriera la dirección pública del
      // repositorio veía ese dato sin haberlo capturado: parecía que la
      // aplicación «recordaba» cosas entre navegadores distintos. Se llenan
      // desde Ajustes y se guardan solo en el equipo de cada persona.
      escuela: '',
      responsable: '',
      cicloTrabajo: ''
    },
    meta: { creado: U.ahora(), actualizado: U.ahora(), version: '1.0' }
  };

  /* ---------- persistencia: IndexedDB con respaldo en localStorage ---------- */

  var DB_NOMBRE = 'libros-del-rincon', DB_VER = 1, db = null;

  function abrirDB() {
    return new Promise(function (res, rej) {
      if (db) return res(db);
      if (!global.indexedDB) return rej(new Error('IndexedDB no disponible'));
      var req = global.indexedDB.open(DB_NOMBRE, DB_VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('proyecto')) d.createObjectStore('proyecto');
        if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache');
      };
      req.onsuccess = function () { db = req.result; res(db); };
      req.onerror = function () { rej(req.error || new Error('No se pudo abrir la base local')); };
    });
  }

  function idbPut(almacen, clave, valor) {
    return abrirDB().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(almacen, 'readwrite');
        tx.objectStore(almacen).put(valor, clave);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  function idbGet(almacen, clave) {
    return abrirDB().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(almacen, 'readonly');
        var q = tx.objectStore(almacen).get(clave);
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }

  // Un guardado que falla en silencio es la peor falla posible en un
  // inventario de cientos de libros: aquí queda registrado y la interfaz lo avisa.
  M.ultimoGuardado = { ok: null, medio: '', fecha: '', error: '' };

  function asentarGuardado(ok, medio, error) {
    M.ultimoGuardado = { ok: ok, medio: medio, fecha: U.ahora(), error: error || '' };
    if (global.dispatchEvent && global.CustomEvent) {
      global.dispatchEvent(new global.CustomEvent('lr-guardado', { detail: M.ultimoGuardado }));
    }
    return ok;
  }

  M.guardar = function () {
    M.estado.meta.actualizado = U.ahora();
    // IndexedDB clona por su cuenta: copiar aquí duplicaría en memoria el
    // proyecto entero (con portadas) en cada guardado.
    return idbPut('proyecto', 'actual', M.estado).then(function () {
      return asentarGuardado(true, 'IndexedDB');
    }).catch(function (e1) {
      // Respaldo: sin imágenes incrustadas para no reventar la cuota.
      try {
        var liviano = JSON.parse(JSON.stringify(M.estado));
        liviano.registros.forEach(function (r) {
          if (r.portada) r.portada.dataUrl = '';
          r.entradas.forEach(function (e) { if (e.imagen) e.imagen = ''; });
        });
        localStorage.setItem('lr-proyecto', JSON.stringify(liviano));
        return asentarGuardado(true, 'localStorage (sin portadas incrustadas)');
      } catch (e2) {
        return asentarGuardado(false, '', (e1 && e1.message ? e1.message + '; ' : '') + (e2.message || 'sin espacio disponible'));
      }
    });
  };

  M.guardarDiferido = U.debounce(function () { M.guardar(); }, 900);

  M.cargar = function () {
    return idbGet('proyecto', 'actual').then(function (v) {
      if (v) return v;
      var s = localStorage.getItem('lr-proyecto');
      return s ? JSON.parse(s) : null;
    }).catch(function () {
      try {
        var s = localStorage.getItem('lr-proyecto');
        return s ? JSON.parse(s) : null;
      } catch (e) { return null; }
    }).then(function (v) {
      if (!v) return false;
      M.estado.registros = M.normalizarRegistros(v.registros);
      M.estado.taxonomia = v.taxonomia || [];
      M.estado.puenteManual = v.puenteManual || {};
      if (v.config) Object.keys(v.config).forEach(function (k) { M.estado.config[k] = v.config[k]; });
      M.estado.meta = v.meta || M.estado.meta;
      return true;
    });
  };

  // Borrado por niveles. Antes solo existía este, que vaciaba la lista de
  // registros y dejaba intacta la caché de consultas: al volver a procesar
  // reaparecían las mismas respuestas guardadas, incluidas las equivocadas, y
  // parecía que los datos «no se iban». Ahora se dice qué se borra y qué no,
  // y hay una opción para llevarse todo por delante.

  // Nivel 1 — los libros, conservando catálogo, clasificador y ajustes.
  M.limpiarProyecto = function (tambienCache) {
    M.estado.registros = [];
    M.estado.meta.creado = U.ahora();
    var previo = tambienCache ? M.cache.vaciar() : Promise.resolve(true);
    return previo.then(function () { return M.guardar(); });
  };

  // Nivel 2 — la clasificación: vínculos hechos a mano y ediciones de la tabla.
  M.restablecerClasificacion = function () {
    M.estado.puenteManual = {};
    M.estado.taxonomia = [];
    if (global.LR && global.LR.sep) {
      global.LR.sep.semilla();
      global.LR.sep.construirPuente();
    }
    return M.guardar();
  };

  // Nivel 3 — todo: base de datos completa y respaldo de localStorage. Deja la
  // aplicación como recién instalada. No hay vuelta atrás desde aquí.
  M.borrarTodo = function () {
    M.estado.registros = [];
    M.estado.puenteManual = {};
    M.estado.taxonomia = [];
    M.cache.mem = Object.create(null);
    try { localStorage.removeItem('lr-proyecto'); } catch (e) { }
    function cerrarYBorrar() {
      return new Promise(function (res) {
        try {
          if (db) { db.close(); db = null; }
          var req = global.indexedDB.deleteDatabase(DB_NOMBRE);
          req.onsuccess = function () { res(true); };
          req.onerror = function () { res(false); };
          req.onblocked = function () { res(false); };   // otra pestaña la tiene abierta
          setTimeout(function () { res(false); }, 3000);
        } catch (e) { res(false); }
      });
    }
    return cerrarYBorrar();
  };

  // Qué hay guardado de verdad, para poder mirarlo en vez de suponerlo.
  M.diagnosticoAlmacenamiento = function () {
    var d = {
      registros: M.estado.registros.length,
      conPortadaIncrustada: M.estado.registros.filter(function (r) { return r.portada && r.portada.dataUrl; }).length,
      vinculosManuales: Object.keys(M.estado.puenteManual || {}).length,
      categorias: (M.estado.taxonomia || []).length,
      cacheEnMemoria: Object.keys(M.cache.mem).length,
      cacheEnDisco: 0,
      respaldoLocal: 0,
      cuota: null
    };
    try {
      var s = localStorage.getItem('lr-proyecto');
      d.respaldoLocal = s ? s.length : 0;
    } catch (e) { }
    var pasos = [
      abrirDB().then(function (bd) {
        return new Promise(function (res) {
          var tx = bd.transaction('cache', 'readonly');
          var req = tx.objectStore('cache').count();
          req.onsuccess = function () { d.cacheEnDisco = req.result; res(); };
          req.onerror = function () { res(); };
        });
      }).catch(function () { })
    ];
    if (global.navigator && navigator.storage && navigator.storage.estimate) {
      pasos.push(navigator.storage.estimate().then(function (e) {
        d.cuota = { usado: e.usage, disponible: e.quota };
      }).catch(function () { }));
    }
    return Promise.all(pasos).then(function () { return d; });
  };

  /* ---------- caché de consultas a fuentes (§25) ---------- */

  M.cache = {
    mem: Object.create(null),
    clave: function (fuente, tipo, valor) { return fuente + '|' + tipo + '|' + U.norm(valor); },
    // Una ficha guardada hace meses puede estar corregida en la fuente:
    // pasados 30 días se vuelve a consultar en lugar de repetir lo viejo.
    diasVigencia: 30,
    obtener: function (k) {
      if (M.cache.mem[k] !== undefined) { U.red.estadisticas.desdeCache++; return Promise.resolve(M.cache.mem[k]); }
      return idbGet('cache', k).then(function (v) {
        if (v === undefined) return undefined;
        var edad = (Date.now() - new Date(v.fecha).getTime()) / 86400000;
        if (isNaN(edad) || edad > M.cache.diasVigencia) return undefined;
        M.cache.mem[k] = v.respuesta;
        U.red.estadisticas.desdeCache++;
        return v.respuesta;
      }).catch(function () { return undefined; });
    },
    guardar: function (k, respuesta) {
      M.cache.mem[k] = respuesta;
      return idbPut('cache', k, { respuesta: respuesta, fecha: U.ahora() }).catch(function () { return false; });
    },
    vaciar: function () {
      M.cache.mem = Object.create(null);
      return abrirDB().then(function (d) {
        return new Promise(function (res) {
          var tx = d.transaction('cache', 'readwrite');
          tx.objectStore('cache').clear();
          tx.oncomplete = function () { res(true); };
          tx.onerror = function () { res(false); };
        });
      }).catch(function () { return false; });
    }
  };

  /* ---------- indicadores del lote (§26) ---------- */

  M.indicadores = function () {
    var regs = M.estado.registros;
    var i = {
      recibidos: regs.length, identificados: 0, alta_confianza: 0, en_revision: 0,
      sin_isbn: 0, conflicto_edicion: 0, sin_portada: 0, no_identificados: 0, completados: 0
    };
    regs.forEach(function (r) {
      if (['IDENTIFICADO', 'CONFIRMADO', 'COMPLETADO'].indexOf(r.estado) > -1) i.identificados++;
      if (r.confianza >= M.estado.config.umbrales.alta) i.alta_confianza++;
      if (r.revision.enCola) i.en_revision++;
      if (!M.isbnCanonico(r)) i.sin_isbn++;
      if (r.conflictos.some(function (c) { return c.tipo === 'POSIBLE EDICIÓN DISTINTA' && !c.resolucion; })) i.conflicto_edicion++;
      if (!r.portada.url) i.sin_portada++;
      if (r.estado === 'SIN RESULTADO' || r.estado === 'ERROR') i.no_identificados++;
      if (r.estado === 'COMPLETADO') i.completados++;
    });
    return i;
  };

  /* ---------- control de calidad previo a exportar (§46) ---------- */

  // «Pendiente» es la ausencia del dato, no el dato: darlo por capturado
  // vaciaba de sentido la única comprobación que no puede resolver ninguna
  // fuente, porque solo existe con el ejemplar en la mano.
  M.ESTADO_FISICO_PENDIENTE = 'Pendiente';

  M.tieneEstadoFisico = function (reg) {
    var v = U.limpia(reg.fisico && reg.fisico.estado_fisico);
    return !!v && v !== M.ESTADO_FISICO_PENDIENTE;
  };

  // Regla única de qué estado queda cuando ya se procesó o se revisó un
  // registro. Estaba escrita dos veces —en el cierre del proceso y en el
  // recálculo de la revisión— y en ambas cualquier motivo, por leve que fuera,
  // tumbaba el estado a REVISIÓN. Con eso, mientras no se importara el
  // clasificador, los miles de registros quedaban degradados por el mismo aviso
  // menor y la exportación «solo confirmados» no devolvía ninguno.
  //
  // Lo que manda: un conflicto abierto nunca se declara confirmado (§46); un
  // motivo grave o medio degrada; uno leve deja el estado que ganó por
  // puntuación y solo lo mantiene en la bandeja, que es lo que dice aRevision.
  M.estadoFinal = function (reg) {
    if (reg.estado === 'COMPLETADO') return 'COMPLETADO';
    var abiertos = reg.conflictos.some(function (c) { return !c.resolucion; });
    var porPuntos = M.estadoPorPuntuacion(reg.confianza, M.estado.config.umbrales);
    if (abiertos) return 'REVISIÓN';
    if (reg.revision.enCola) {
      var sev = reg.revision.severidad || 'media';
      if (sev !== 'baja') return 'REVISIÓN';
      // Motivo leve: sigue en la bandeja, pero conserva lo que ganó.
    }
    return porPuntos;
  };

  M.checklist = function (reg) {
    var v = function (c) { return M.valor(reg, c); };
    var lista = [
      { campo: 'Título', ok: !!v('titulo') },
      { campo: 'ISBN validado o marcado sin ISBN', ok: !!M.isbnCanonico(reg) || M.observacionesTexto(reg).indexOf('Sin ISBN') > -1 },
      { campo: 'Autor', ok: !!v('autor') },
      { campo: 'Editorial', ok: !!v('editorial') },
      { campo: 'Año de la edición', ok: !!v('anio') },
      { campo: 'Estado físico', ok: M.tieneEstadoFisico(reg) },
      { campo: 'Reseña', ok: !!v('resena') },
      { campo: 'Grado', ok: !!v('grado') },
      { campo: 'Tipo de texto', ok: !!v('tipo_texto') },
      { campo: 'Categoría SEP', ok: !!v('categoria_sep') },
      { campo: 'Color', ok: !!v('color') },
      { campo: 'Observaciones', ok: reg.observaciones.length > 0 },
      { campo: 'Subserie', ok: !!v('subserie') },
      { campo: 'Contenidos y Saberes', ok: !!v('contenidos_saberes') },
      { campo: 'Portada localizada o estado declarado', ok: !!reg.portada.url || reg.portada.fuente === 'sin_portada' },
      { campo: 'Confianza calculada', ok: reg.confianza > 0 },
      { campo: 'Evidencia registrada', ok: reg.evidencias.length > 0 }
    ];
    var conflictoAbierto = reg.conflictos.some(function (c) { return !c.resolucion; });
    return {
      lista: lista,
      pendientes: lista.filter(function (x) { return !x.ok; }).map(function (x) { return x.campo; }),
      conflictoAbierto: conflictoAbierto,
      // Si hay conflicto sin resolver, no se marca como plenamente confirmado (§46).
      exportableComoConfirmado: !conflictoAbierto && reg.confianza >= M.estado.config.umbrales.confirmado
    };
  };

  global.LR.model = M;
})(window);
