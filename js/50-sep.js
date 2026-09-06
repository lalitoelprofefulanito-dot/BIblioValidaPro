/* =========================================================================
   50-sep.js — Catálogo histórico SEP / Libros del Rincón (§6, §18, §19, §20)
   Capa contextual histórica: no se sustituye por fuentes externas ni se
   corrige con ellas. Aporta grado, serie, categoría, reseña y clave SEP.
   La tabla curricular (disciplina, color, contenidos, saberes) se importa;
   nunca se genera.
   ========================================================================= */
(function (global) {
  'use strict';

  var U = global.LR.util, M = global.LR.model;
  var S = { listo: false, total: 0, totalPdf: 0 };

  var porTitulo = Object.create(null);   // título normalizado -> [fichas]
  var porISBN = Object.create(null);     // isbn13 -> [fichas]
  var porToken = Object.create(null);    // token -> [índices]
  var fichas = [];
  var fichasPdf = [];
  var pdfPorTitulo = Object.create(null);

  S.construirIndice = function () {
    fichas = global.SEP_CATALOGO_PRIMARIA || [];
    fichasPdf = global.SEP_CATALOGO_PDF_1986_2006 || [];
    // pdfPorTitulo se reinicia como los demás: al quedarse fuera, cada
    // reconstrucción del índice duplicaba el catálogo 1986-2006 y la misma
    // página aparecía dos y tres veces como evidencia del mismo título.
    porTitulo = Object.create(null); porISBN = Object.create(null);
    porToken = Object.create(null); pdfPorTitulo = Object.create(null);

    fichas.forEach(function (f, i) {
      var t = U.norm(f.titulo);
      if (t) (porTitulo[t] = porTitulo[t] || []).push(i);
      if (f.titulo_original) {
        var to = U.norm(f.titulo_original);
        if (to && to !== t) (porTitulo[to] = porTitulo[to] || []).push(i);
      }
      if (f.isbn) {
        var i13 = U.isbn.a13(f.isbn) || U.isbn.limpiar(f.isbn);
        if (i13) (porISBN[i13] = porISBN[i13] || []).push(i);
      }
      U.tokensSignificativos(f.titulo).forEach(function (tk) {
        (porToken[tk] = porToken[tk] || []).push(i);
      });
    });

    fichasPdf.forEach(function (f) {
      var t = U.norm(f.titulo);
      if (t) (pdfPorTitulo[t] = pdfPorTitulo[t] || []).push(f);
    });

    S.total = fichas.length;
    S.totalPdf = fichasPdf.length;
    S.listo = true;
    return S;
  };

  S.ficha = function (i) { return fichas[i]; };
  S.todas = function () { return fichas; };

  /* ---------- búsqueda en el catálogo histórico ---------- */

  // Devuelve coincidencias ordenadas: ISBN primero, luego título exacto,
  // luego similitud por tokens. Nunca decide sola: entrega candidatos.
  S.buscar = function (titulo, autor, isbn, limite) {
    if (!S.listo) S.construirIndice();
    var res = [], vistos = Object.create(null);

    function agregar(i, puntos, motivo) {
      if (vistos[i] != null) {
        if (res[vistos[i]].puntos < puntos) { res[vistos[i]].puntos = puntos; res[vistos[i]].motivo = motivo; }
        return;
      }
      vistos[i] = res.length;
      res.push({ indice: i, ficha: fichas[i], puntos: puntos, motivo: motivo });
    }

    if (isbn) {
      var i13 = U.isbn.a13(isbn) || U.isbn.limpiar(isbn);
      (porISBN[i13] || []).forEach(function (i) { agregar(i, 100, 'ISBN coincide con el catálogo SEP'); });
    }

    var tn = U.norm(titulo || '');
    if (tn) {
      (porTitulo[tn] || []).forEach(function (i) { agregar(i, 92, 'Título idéntico en el catálogo SEP'); });

      var conteo = Object.create(null);
      U.tokensSignificativos(titulo).forEach(function (tk) {
        (porToken[tk] || []).forEach(function (i) { conteo[i] = (conteo[i] || 0) + 1; });
      });
      Object.keys(conteo).forEach(function (i) {
        if (conteo[i] < 1) return;
        var sim = U.similitud(titulo, fichas[i].titulo);
        if (sim >= 0.72) agregar(+i, Math.round(sim * 88), 'Título similar en el catálogo SEP (' + Math.round(sim * 100) + '%)');
      });
    }

    // El autor solo confirma o descarta; nunca crea la coincidencia por sí solo.
    if (autor) {
      res.forEach(function (r) {
        if (!r.ficha.autor) return;
        var sim = U.similitud(autor, r.ficha.autor);
        if (sim >= 0.6) { r.puntos = Math.min(100, r.puntos + 5); r.motivo += '; autor concuerda'; }
        else if (sim < 0.25 && r.puntos < 100) { r.puntos -= 8; r.motivo += '; autor no concuerda'; }
      });
    }

    res.sort(function (a, b) { return b.puntos - a.puntos; });
    return res.slice(0, limite || 6);
  };

  // Presencia en el catálogo histórico 1986-2006 (evidencia secundaria).
  S.buscarPdf = function (titulo) {
    if (!S.listo) S.construirIndice();
    var tn = U.norm(titulo || '');
    if (!tn) return [];
    return (pdfPorTitulo[tn] || []).slice(0, 4);
  };

  /* ---------- aplicación al registro ---------- */

  // Copia la capa SEP al registro. Los datos bibliográficos de la ficha SEP
  // entran como evidencia, no como valor impuesto: la decisión la toma
  // el motor de identificación o la persona que revisa.
  // Deja lo que dice el catálogo a la vista, sin asentarlo. Sirve para que la
  // persona confirme de un golpe cuando verifique el sello, en vez de teclearlo.
  S.proponerDeCatalogo = function (reg, f, conf) {
    reg.propuestaSep = {
      grado: f.grado || '', subserie: f.serie || '',
      categoria_sep: f.categoria || '', tipo_texto: f.genero || '',
      ficha: f.id, ciclo: f.ciclo || '', confianza: conf
    };
    M.aRevision(reg, 'Procedencia sin verificar', 'media');
    return reg.propuestaSep;
  };

  S.aplicar = function (reg, coincidencia) {
    var f = coincidencia.ficha;
    reg.sep = {
      recordId: f.id, ciclo: f.ciclo || '', nivel: f.nivel || '', grado: f.grado || '',
      destino: f.destino || '', serie: f.serie || '', genero: f.genero || '',
      categoria: f.categoria || '', titulo: f.titulo || '', titulo_original: f.titulo_original || '',
      autor: f.autor || '', traductor: f.traductor || '', ilustrador: f.ilustrador || '',
      editorial: f.editorial || '', lugar: f.lugar || '', anio: f.anio || '', isbn: f.isbn || '',
      paginas: f.paginas || '', dimensiones: f.dimensiones || '', resena: f.resena || '',
      clave_sep: f.clave_sep || '', generacion: f.generacion || '', fuente_doc: f.fuente_doc || '',
      puntos: coincidencia.puntos, motivo: coincidencia.motivo
    };

    var ref = 'Ficha ' + f.id + ' · ' + (f.ciclo || 's/ciclo') + ' · ' + (f.fuente_doc || '');
    var conf = Math.min(95, coincidencia.puntos);

    [['titulo', f.titulo], ['autor', f.autor], ['editorial', f.editorial], ['anio', f.anio],
     ['isbn', f.isbn], ['resena', f.resena], ['grado', f.grado], ['subserie', f.serie],
     ['categoria_sep', f.categoria], ['tipo_texto', f.genero]].forEach(function (par) {
      if (par[1]) M.registrarEvidencia(reg, par[0], par[1], 'sep', conf, ref);
    });

    // Campos que solo existen en la capa SEP: se fijan desde aquí (§18),
    // salvo cuando una persona ya decidió ese campo en la revisión.
    function fijarSiNadieDecidio(campo, valor, decision) {
      if (!valor) return;
      if (M.decididoPorPersona(reg, campo)) return;
      M.fijarCampo(reg, campo, valor, 'sep', conf, decision);
    }
    // Coincidencia ≠ procedencia. Que el título o el ISBN aparezcan en el
    // catálogo histórico solo dice que ESE TÍTULO también se publicó en Libros
    // del Rincón; el ejemplar que se tiene en la mano puede ser perfectamente
    // una edición comercial de otra editorial. Por eso el grado, la serie, la
    // categoría y el tipo de texto del catálogo se registran como evidencia y
    // se proponen, pero no se asientan hasta que alguien confirme la
    // procedencia mirando el sello del ejemplar.
    if (M.procedencia(reg) === 'Rincón') {
      fijarSiNadieDecidio('grado', f.grado, 'Grado del catálogo histórico ' + (f.ciclo || ''));
      fijarSiNadieDecidio('subserie', f.serie, 'Serie lectora registrada por SEP');
      fijarSiNadieDecidio('categoria_sep', f.categoria, 'Categoría del catálogo SEP');
      fijarSiNadieDecidio('tipo_texto', f.genero, 'Género declarado por SEP');
    } else {
      S.proponerDeCatalogo(reg, f, conf);
    }
    // La reseña no depende de la procedencia: describe la obra, no el ejemplar.
    fijarSiNadieDecidio('resena', f.resena, 'Reseña del catálogo SEP (prioridad 1, §21)');

    M.observar(reg, 'Este TÍTULO aparece en el catálogo Libros del Rincón, ciclo ' + (f.ciclo || 'no especificado') +
      (f.destino ? ', destino ' + f.destino : '') + '. ' + coincidencia.motivo + '. ' +
      (M.procedencia(reg) === 'Rincón'
        ? 'La procedencia Rincón ya está verificada en el ejemplar, así que se aplica la clasificación oficial.'
        : 'Esto NO confirma que tu ejemplar sea de Rincón: el mismo título circula también en ediciones comerciales. ' +
          'Revisa el sello oficial SEP en la portada o la contraportada y captura la procedencia; hasta entonces la clasificación queda como propuesta.'));

    var enPdf = S.buscarPdf(f.titulo);
    if (enPdf.length) {
      M.registrarEvidencia(reg, 'titulo', f.titulo, 'sep_pdf', 60,
        'Catálogo histórico 1986-2006, p. ' + enPdf[0].pagina + ' (' + enPdf[0].anio + ', ' + (enPdf[0].grado || 's/grado') + ')');
      M.observar(reg, 'El título también aparece en el catálogo histórico 1986-2006 (' + enPdf[0].anio + ', p. ' + enPdf[0].pagina + ').');
    }

    S.aplicarTaxonomia(reg);
    return reg.sep;
  };

  /* ---------- tabla curricular maestra (§19, §20) ---------- */

  // El clasificador oficial va integrado como dato. Antes solo existía si
  // alguien importaba la hoja de Excel, y esa importación se perdía al cambiar
  // de equipo, al borrar los datos del sitio o al restaurar un respaldo
  // anterior: la tabla quedaba con las 81 categorías del catálogo y todas las
  // celdas de color, contenidos y saberes vacías, o sea sin clasificar nada.
  // Importar tu propia hoja lo sigue sobrescribiendo.
  S.integrarClasificadorOficial = function () {
    var oficial = global.CLASIFICADOR_SEP_OFICIAL || [];
    var t = M.estado.taxonomia = M.estado.taxonomia || [];
    var agregadas = 0;
    oficial.forEach(function (o) {
      var fila = S.filaTaxonomia(o.categoria);
      if (fila) {
        // Existe ya: se completa lo que esté vacío y se marca como oficial,
        // pero no se pisa nada que la persona haya escrito o importado.
        ['disciplina', 'color', 'contenidos', 'saberes', 'palabra_clave', 'grado_sugerido'].forEach(function (k) {
          if (!fila[k] && o[k]) fila[k] = o[k];
        });
        fila.oficial = true;
        fila.revisar = false;
      } else {
        t.push(JSON.parse(JSON.stringify(o)));
        agregadas++;
      }
    });
    return agregadas;
  };

  S.semilla = function () {
    if (!M.estado.taxonomia || !M.estado.taxonomia.length) {
      M.estado.taxonomia = JSON.parse(JSON.stringify(global.TAXONOMIA_CURRICULAR_SEMILLA || []));
    }
    S.integrarClasificadorOficial();
    return M.estado.taxonomia;
  };

  S.filaTaxonomia = function (categoria) {
    if (!categoria) return null;
    var n = U.norm(categoria);
    var t = M.estado.taxonomia || [];
    for (var i = 0; i < t.length; i++) {
      if (U.norm(t[i].categoria) === n) return t[i];
    }
    return null;
  };

  // Color, contenidos y saberes salen de la tabla; si la tabla no los tiene,
  // el campo queda pendiente y se declara. Nunca se redactan aquí (§36.14).
  /* ---------- tabla curricular maestra (§19, §20) ---------- */

  // La hoja del clasificador oficial trae una fila por CONTENIDO, no por
  // categoría, y su encabezado no está en la primera fila: viene después de
  // varias secciones de texto. Aquí se localiza el encabezado, se agrupan los
  // contenidos de cada categoría y se copian tal cual, sin recortar.
  // Una hoja puede tener varios encabezados (la tuya tiene tres: la matriz por
  // grado, la de consulta rápida y el clasificador propiamente dicho). Se
  // elige el más completo, no el primero; en empate, el de más abajo.
  var PESO_COLUMNA = [
    ['categoria', 2], ['color', 2], ['contenido', 2],
    ['disciplina', 1], ['saberes', 1], ['palabra clave', 1], ['grado asignado', 1]
  ];

  S.localizarEncabezado = function (filas) {
    var mejor = -1, mejorPuntos = 0;
    for (var i = 0; i < filas.length; i++) {
      var enc = (filas[i] || []).map(function (c) { return U.norm(c); });
      var tieneCat = enc.some(function (h) { return h.indexOf('categoria') > -1; });
      if (!tieneCat) continue;
      var puntos = 0;
      PESO_COLUMNA.forEach(function (p) {
        if (enc.some(function (h) { return h.indexOf(p[0]) > -1; })) puntos += p[1];
      });
      if (puntos < 4) continue;              // categoría sola no es una tabla curricular
      if (puntos >= mejorPuntos) { mejorPuntos = puntos; mejor = i; }
    }
    return mejor;
  };

  S.importarTaxonomia = function (filas) {
    if (!filas || filas.length < 2) return { agregadas: 0, actualizadas: 0, error: 'La hoja está vacía.' };
    var iEnc = S.localizarEncabezado(filas);
    if (iEnc === -1) {
      return { agregadas: 0, actualizadas: 0, error: 'No se encontró en esta hoja un encabezado con columna de categoría junto a color, disciplina o contenidos.' };
    }
    var enc = filas[iEnc].map(function (c) { return U.norm(c); });

    function col() {
      var nombres = Array.prototype.slice.call(arguments).map(U.norm);
      for (var j = 0; j < nombres.length; j++) {
        for (var i = 0; i < enc.length; i++) { if (enc[i] === nombres[j]) return i; }
      }
      for (var k = 0; k < nombres.length; k++) {
        for (var m = 0; m < enc.length; m++) { if (nombres[k] && enc[m].indexOf(nombres[k]) > -1) return m; }
      }
      return -1;
    }

    var cCat = col('categoria sep', 'categoria'),
      cDis = col('disciplina', 'campo formativo', 'tipo de textos'),
      cCol = col('color'),
      cCon = col('contenidos, saberes y tipos de texto', 'contenidos y saberes', 'contenidos'),
      cSab = col('saberes', 'procesos de desarrollo de aprendizaje', 'pda'),
      cPal = col('palabra clave'),
      cGra = col('grado asignado', 'grado sugerido');
    // El encabezado del clasificador dice "Contenidos, saberes y tipos de
    // texto": es una sola columna. Sin esta guarda, el texto se copiaría dos veces.
    if (cSab === cCon) cSab = -1;
    if (cCat === -1) return { agregadas: 0, actualizadas: 0, error: 'No se encontró una columna de categoría en la hoja seleccionada.' };

    // La tabla termina donde empieza otra cosa. Sin este corte, en tu hoja el
    // importador seguía de largo y se llevaba también la sección de series y la
    // matriz Categoría × Grado como si fueran categorías del clasificador.
    var cuerpo = [];
    var restantes = filas.slice(iEnc + 1);
    for (var iF = 0; iF < restantes.length; iF++) {
      var f = restantes[iF];
      var llenas = (f || []).filter(function (c) { return U.limpia(c); }).length;
      if (!llenas) continue;
      var esOtroEncabezado = (f || []).filter(function (c) {
        var n = U.norm(c);
        return n && enc.indexOf(n) > -1;
      }).length >= 2;
      if (esOtroEncabezado) break;                       // empieza otra tabla
      if (!U.limpia(f[cCat])) {
        if (llenas <= 2) break;                          // un título de sección: se acabó
        continue;                                        // fila suelta sin categoría
      }
      cuerpo.push(f);
    }

    var grupos = [], indice = {};
    cuerpo.forEach(function (f) {
      var cat = U.limpia(f[cCat]);
      var k = U.norm(cat);
      if (!indice[k]) {
        indice[k] = { categoria: cat, disciplina: '', color: '', contenidos: [], saberes: [], palabra_clave: '', grado_sugerido: '' };
        grupos.push(indice[k]);
      }
      var g = indice[k];
      if (cDis > -1 && !g.disciplina) g.disciplina = U.limpia(f[cDis]);
      if (cCol > -1 && !g.color) g.color = U.limpia(f[cCol]);
      if (cPal > -1 && !g.palabra_clave) g.palabra_clave = U.limpia(f[cPal]);
      if (cGra > -1 && !g.grado_sugerido) g.grado_sugerido = U.limpia(f[cGra]);
      if (cCon > -1) {
        var v = U.limpia(f[cCon]);
        if (v && g.contenidos.indexOf(v) === -1) g.contenidos.push(v);
      }
      if (cSab > -1) {
        var sv = U.limpia(f[cSab]);
        if (sv && g.saberes.indexOf(sv) === -1) g.saberes.push(sv);
      }
    });

    var agregadas = 0, actualizadas = 0;
    grupos.forEach(function (g) {
      var datos = {
        disciplina: g.disciplina, color: g.color,
        contenidos: g.contenidos.join(' · '), saberes: g.saberes.join(' · '),
        palabra_clave: g.palabra_clave, grado_sugerido: g.grado_sugerido
      };
      var fila = S.filaTaxonomia(g.categoria);
      if (fila) {
        Object.keys(datos).forEach(function (k) { if (datos[k]) fila[k] = datos[k]; });
        fila.oficial = true;
        fila.revisar = false;
        actualizadas++;
      } else {
        M.estado.taxonomia.push({
          categoria: g.categoria, registros: 0, genero_predominante: '', serie_predominante: '',
          disciplina: datos.disciplina, color: datos.color, contenidos: datos.contenidos,
          saberes: datos.saberes, palabra_clave: datos.palabra_clave,
          grado_sugerido: datos.grado_sugerido, oficial: true, revisar: false
        });
        agregadas++;
      }
    });
    S.construirPuente();
    M.guardarDiferido();
    return { agregadas: agregadas, actualizadas: actualizadas, categorias: grupos.length, filasLeidas: cuerpo.length };
  };

  /* ---------- puente entre el catálogo histórico y el clasificador ---------- */

  // El catálogo histórico usa etiquetas finas ("Cuentos de humor", "Mitos y
  // leyendas"); el clasificador oficial usa las doce categorías SEP, y esas
  // etiquetas finas aparecen dentro de su columna de contenidos. El puente
  // aprovecha esa coincidencia, pero cada vínculo queda explicado, y los que
  // no alcanzan certeza se declaran en vez de forzarse.
  S.puente = {};   // categoría del catálogo (normalizada) -> { categoria, motivo, confianza }

  S.oficiales = function () {
    return (M.estado.taxonomia || []).filter(function (t) { return t.oficial; });
  };

  S.construirPuente = function () {
    S.puente = {};
    var oficiales = S.oficiales();
    if (!oficiales.length) return S.puente;
    (M.estado.taxonomia || []).forEach(function (t) {
      if (t.oficial) return;
      var v = S.vincular(t.categoria, oficiales);
      if (v) S.puente[U.norm(t.categoria)] = v;
    });
    return S.puente;
  };

  // El parecido de letras solo no sirve aquí: "Tecnología" y "Ecología" se
  // parecen mucho como cadenas y no tienen nada que ver, mientras que
  // "El cuerpo" y "La naturaleza y El cuerpo" se parecen poco y son lo mismo.
  // Por eso el vínculo se decide por las palabras que comparten, exigiendo
  // siempre al menos una palabra con contenido en común.
  function comparar(a, b) {
    var ta = U.tokensSignificativos(a), tb = U.tokensSignificativos(b);
    if (!ta.length || !tb.length) return { puntos: 0 };
    var comunes = ta.filter(function (w) { return tb.indexOf(w) > -1; });
    if (!comunes.length) return { puntos: 0 };
    var contencion = comunes.length / Math.min(ta.length, tb.length);
    var dice = U.similitud(a, b);
    if (contencion === 1) {
      // Una etiqueta contiene íntegramente a la otra: "El cuerpo" dentro de
      // "La naturaleza y El cuerpo".
      var proporcion = Math.min(ta.length, tb.length) / Math.max(ta.length, tb.length);
      return { puntos: Math.round(80 + proporcion * 14), como: 'contiene', comunes: comunes };
    }
    if (comunes.length >= 2 && contencion >= 0.6) {
      return { puntos: Math.round(70 + contencion * 15), como: 'comparte', comunes: comunes };
    }
    if (dice >= 0.85) {
      // Misma etiqueta escrita distinto ("físico-quimicas" / "fisicoquímicas").
      return { puntos: Math.round(dice * 95), como: 'escritura', comunes: comunes };
    }
    return { puntos: 0 };
  }

  S.vincular = function (categoria, oficiales) {
    var n = U.norm(categoria);
    if (!n) return null;
    oficiales = oficiales || S.oficiales();
    var manual = (M.estado.puenteManual || {})[n];
    if (manual) return { categoria: manual, motivo: 'Vínculo asignado por la persona que clasifica.', confianza: 100, manual: true };

    var exacta = null;
    oficiales.forEach(function (o) {
      if (U.norm(o.categoria) === n) exacta = { categoria: o.categoria, motivo: 'La categoría del catálogo coincide con la del clasificador.', confianza: 100 };
    });
    if (exacta) return exacta;

    // Coincidencia literal con un contenido declarado en el clasificador.
    var porContenido = null;
    oficiales.forEach(function (o) {
      (o.contenidos || '').split(' · ').forEach(function (c) {
        if (porContenido || U.norm(c) !== n) return;
        porContenido = {
          categoria: o.categoria, confianza: 95,
          motivo: 'La categoría "' + categoria + '" del catálogo es uno de los contenidos que tu clasificador asigna a "' + o.categoria + '".'
        };
      });
    });
    if (porContenido) return porContenido;

    var mejor = null;
    oficiales.forEach(function (o) {
      // El nombre de la categoría pesa más que un contenido suelto: "Las
      // palabras" pertenece a "Las palabras (Diccionarios…)", no al contenido
      // "Adivinanzas y juegos de palabras" de "Poesía".
      var cand = [{ texto: o.categoria, donde: 'la categoría', bono: 6 }];
      (o.contenidos || '').split(' · ').forEach(function (c) {
        if (c) cand.push({ texto: c, donde: 'el contenido "' + c + '"' });
      });
      cand.forEach(function (x) {
        var r = comparar(categoria, x.texto);
        var puntos = r.puntos ? r.puntos + (x.bono || 0) : 0;
        if (puntos && (!mejor || puntos > mejor.puntos)) {
          mejor = { puntos: puntos, como: r.como, comunes: r.comunes, oficial: o, donde: x.donde, texto: x.texto };
        }
      });
    });
    if (!mejor || mejor.puntos < 72) return null;

    var explica = mejor.como === 'contiene'
      ? '"' + categoria + '" queda dentro de ' + mejor.donde + ' de "' + mejor.oficial.categoria + '"'
      : mejor.como === 'escritura'
        ? '"' + categoria + '" y ' + mejor.donde + ' de "' + mejor.oficial.categoria + '" son la misma etiqueta escrita distinto'
        : '"' + categoria + '" comparte las palabras ' + mejor.comunes.join(', ') + ' con ' + mejor.donde + ' de "' + mejor.oficial.categoria + '"';
    return {
      categoria: mejor.oficial.categoria, confianza: Math.min(94, mejor.puntos), aproximado: true,
      motivo: explica + ' (' + Math.min(94, mejor.puntos) + '%). Conviene confirmarlo.'
    };
  };

  S.fijarPuenteManual = function (categoriaCatalogo, categoriaOficial) {
    M.estado.puenteManual = M.estado.puenteManual || {};
    if (categoriaOficial) M.estado.puenteManual[U.norm(categoriaCatalogo)] = categoriaOficial;
    else delete M.estado.puenteManual[U.norm(categoriaCatalogo)];
    S.construirPuente();
    M.guardarDiferido();
  };

  // Fila del clasificador que corresponde a una categoría del catálogo, con la
  // explicación de por qué.
  S.resolverCategoria = function (categoria) {
    if (!categoria) return null;
    var directa = S.filaTaxonomia(categoria);
    if (directa && (directa.color || directa.contenidos)) {
      return { fila: directa, motivo: '', exacta: true, confianza: 100 };
    }
    var v = S.vincular(categoria);
    if (!v) return null;
    var fila = S.filaTaxonomia(v.categoria);
    if (!fila) return null;
    return { fila: fila, motivo: v.motivo, exacta: v.confianza >= 95, confianza: v.confianza, manual: !!v.manual, aproximado: !!v.aproximado };
  };

  // Categorías del catálogo presentes en el acervo que aún no tienen vínculo firme.
  S.categoriasSinVinculo = function () {
    var vistas = {}, out = [];
    (M.estado.registros || []).forEach(function (r) {
      var c = M.valor(r, 'categoria_sep') || (r.sep && r.sep.categoria) || '';
      if (!c || vistas[U.norm(c)]) return;
      vistas[U.norm(c)] = true;
      var res = S.resolverCategoria(c);
      if (!res) out.push({ categoria: c, motivo: '' });
      else if (res.confianza < 95) out.push({ categoria: c, motivo: res.motivo, propuesta: res.fila.categoria });
    });
    return out;
  };

  S.aplicarTaxonomia = function (reg) {
    var cat = M.valor(reg, 'categoria_sep') || (reg.sep && reg.sep.categoria) || '';
    var res = S.resolverCategoria(cat);
    if (!res) {
      if (cat) {
        M.observar(reg, 'La categoría "' + cat + '" del catálogo no tiene equivalencia en tu clasificador: color, contenidos y saberes quedan pendientes hasta que le asignes una.');
        M.aRevision(reg, 'Categoría sin vínculo con el clasificador', 'baja');
      }
      return;
    }
    var fila = res.fila;
    reg.curricular = {
      categoria: fila.categoria, categoria_catalogo: cat,
      disciplina: fila.disciplina || '', color: fila.color || '',
      contenidos: fila.contenidos || '', saberes: fila.saberes || '',
      palabra_clave: fila.palabra_clave || '', grado_sugerido: fila.grado_sugerido || '',
      fuente: 'taxonomia', vinculo: res.motivo, confianza: res.confianza
    };
    // Un vínculo que no es exacto se aplica, pero se declara y pasa a revisión:
    // el color de un libro no debe depender de un parecido que nadie confirmó.
    if (res.motivo) M.observar(reg, res.motivo);
    if (!res.exacta) M.aRevision(reg, 'Vínculo de categoría por confirmar', 'baja');

    // El color solo se calcula para el acervo General. Para los libros de
    // Rincón no se cuenta con el mapa completo color↔categoría oficial, así que
    // queda en blanco a propósito: es preferible el hueco declarado a un color
    // inventado que después nadie sabría distinguir de uno verificado.
    var proc = M.procedencia(reg);
    if (fila.color && proc === 'General' && !M.decididoPorPersona(reg, 'color')) {
      M.fijarCampo(reg, 'color', fila.color, 'taxonomia', res.confianza,
        'Color institucional del clasificador para "' + fila.categoria + '" (acervo General)');
    } else if (fila.color && proc === 'Rincón') {
      M.observar(reg, 'El color queda en blanco a propósito: para los libros de Rincón no se tiene el mapa completo color↔categoría oficial y ese dato no se inventa.');
    }
    if (fila.disciplina) M.registrarEvidencia(reg, 'disciplina', fila.disciplina, 'taxonomia', res.confianza, 'Clasificador · ' + fila.categoria);
    // El grado del clasificador es una sugerencia POR CATEGORÍA, y se guarda
    // como evidencia aparte para que nunca se confunda con el grado del libro.
    // La subserie no interviene aquí: es un perfil de lector (quién puede leer
    // esto), no una banda de grado, y no sirve para deducir el grado ni para
    // excluir un título de ningún grado.
    if (fila.grado_sugerido) M.registrarEvidencia(reg, 'grado_sugerido', fila.grado_sugerido, 'taxonomia', 60, 'Grado asignado por categoría en el clasificador');
    var cs = [fila.contenidos, fila.saberes].filter(Boolean).join(' | ');
    if (cs && !M.decididoPorPersona(reg, 'contenidos_saberes')) M.fijarCampo(reg, 'contenidos_saberes', cs, 'taxonomia', res.confianza, 'Contenidos y saberes del clasificador oficial, copiados sin edición de texto');
    var faltan = [];
    if (!fila.color) faltan.push('color');
    if (!fila.contenidos && !fila.saberes) faltan.push('contenidos y saberes');
    if (faltan.length) {
      M.observar(reg, 'El clasificador aún no define ' + faltan.join(' ni ') + ' para la categoría "' + fila.categoria + '".');
    }
  };

  S.cobertura = function () {
    var t = M.estado.taxonomia || [];
    var of = S.oficiales();
    var sinVinculo = S.categoriasSinVinculo();
    return {
      categorias: t.length,
      oficiales: of.length,
      conColor: t.filter(function (f) { return !!f.color; }).length,
      conContenidos: t.filter(function (f) { return !!(f.contenidos || f.saberes); }).length,
      vinculadas: Object.keys(S.puente).length,
      sinVinculo: sinVinculo.length
    };
  };

  global.LR.sep = S;
})(window);
