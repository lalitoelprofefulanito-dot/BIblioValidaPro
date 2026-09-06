/* =========================================================================
   40-matching.js — Identificación, puntuación, edición y portada
   (§9, §10, §11, §12, §15, §16, §23, §41-§43)
   Regla que gobierna todo el archivo: una coincidencia débil nunca se
   convierte en confirmación, y ningún dato SEP se sobrescribe en silencio.
   ========================================================================= */
(function (global) {
  'use strict';

  var U = global.LR.util, M = global.LR.model, F = global.LR.fuentes, S = global.LR.sep;
  var X = {};

  /* ---------- puntuación de un candidato frente a la entrada (§9, §10) ---------- */

  X.puntuar = function (reg, cand) {
    var P = M.estado.config.puntos;
    var isbnEntrada = M.isbnCanonico(reg);
    var titulo = M.valor(reg, 'titulo') || U.limpia(reg.crudo.titulo);
    var autor = M.valor(reg, 'autor') || U.limpia(reg.crudo.autor);
    var editorial = M.valor(reg, 'editorial') || U.limpia(reg.crudo.editorial);
    var anio = U.anio(M.valor(reg, 'anio') || reg.crudo.anio);

    var formasCand = [cand.isbn_original, cand.isbn13, cand.isbn10].filter(Boolean);
    var isbnCand = cand.isbn13 || cand.isbn10 || cand.isbn_original;
    var simTitulo = U.similitud(titulo, cand.titulo);
    var simAutor = autor && cand.autores.length ? Math.max.apply(null, cand.autores.map(function (a) { return U.similitud(autor, a); })) : 0;
    var simEditorial = editorial && cand.editorial ? U.similitud(editorial, cand.editorial) : 0;
    var mismoAnio = anio && cand.anio && U.anio(cand.anio) === anio;

    var puntos = 0, tipo = '', explica = [], isbnContradice = false;

    if (isbnEntrada && isbnCand) {
      // Exacto si la fuente registra el mismo ISBN en cualquiera de sus formas;
      // equivalente si solo coincide al convertir entre ISBN-10 e ISBN-13 (§5.3).
      var exacto = formasCand.some(function (f) { return U.isbn.limpiar(f) === U.isbn.limpiar(isbnEntrada); });
      if (exacto) {
        puntos = P.isbn_exacto; tipo = 'isbn_exacto';
        explica.push('ISBN idéntico al de la entrada');
      } else if (U.isbn.equivalentes(isbnEntrada, isbnCand)) {
        puntos = P.isbn_equivalente; tipo = 'isbn_equivalente';
        explica.push('ISBN-10 e ISBN-13 equivalentes (no es contradicción)');
      }
      if (puntos && simTitulo >= 0.7) explica.push('el título concuerda');
      if (puntos && simAutor >= 0.6) explica.push('el autor concuerda');
      // Ambos declaran ISBN y no son el mismo ni equivalentes: es otro ejemplar
      // catalogado, casi siempre otra edición de la misma obra. Sirve como
      // evidencia, nunca como identificación del ejemplar que se tiene en la mano.
      if (!puntos) isbnContradice = true;
    }

    if (!puntos && isbnEntrada && !isbnCand && simTitulo >= 0.85) {
      puntos = P.titulo_similar; tipo = 'titulo_similar';
      explica.push('la fuente no expone ISBN para comparar; solo coincide el título');
    }

    if (!puntos) {
      if (simTitulo >= 0.75 && simAutor >= 0.6 && simEditorial >= 0.6 && mismoAnio) {
        puntos = P.titulo_autor_editorial_anio; tipo = 'titulo_autor_editorial_anio';
        explica.push('título, autor, editorial y año concuerdan');
      } else if (simTitulo >= 0.75 && simAutor >= 0.6 && mismoAnio) {
        puntos = P.titulo_autor_anio; tipo = 'titulo_autor_anio';
        explica.push('título, autor y año concuerdan');
      } else if (simTitulo >= 0.75 && simEditorial >= 0.6) {
        puntos = P.titulo_editorial; tipo = 'titulo_editorial';
        explica.push('título y editorial concuerdan');
      } else if (simTitulo >= 0.85) {
        puntos = P.titulo_similar; tipo = 'titulo_similar';
        explica.push('el título es muy parecido (' + Math.round(simTitulo * 100) + '%)');
      } else if (simTitulo >= 0.6) {
        puntos = P.solo_titulo; tipo = 'solo_titulo';
        explica.push('solo hay parecido de título (' + Math.round(simTitulo * 100) + '%), sin confirmación');
      }
    }

    if (puntos && simAutor > 0 && simAutor < 0.3 && tipo.indexOf('isbn') !== 0) {
      puntos -= 12;
      explica.push('el autor difiere de la entrada');
    }

    // Un ISBN distinto identifica a otra edición. Aunque título, autor,
    // editorial y año concuerden, el candidato no puede declararse el mismo
    // ejemplar: se queda por debajo del umbral de alta confianza para que pase
    // por revisión en vez de entrar solo al documento.
    if (puntos && isbnContradice) {
      var techo = Math.max(0, (M.estado.config.umbrales.alta || 85) - 20);
      if (puntos > techo) puntos = techo;
      tipo = 'edicion_distinta';
      explica.push('la fuente registra el ISBN ' + (cand.isbn13 || cand.isbn10 || cand.isbn_original) +
        ', distinto del de la entrada (' + U.limpia(isbnEntrada) + '): corresponde a otra edición');
    }

    return {
      id: U.uid('cand'), fuente: cand.fuente, fuente_nombre: cand.fuente_nombre,
      score: Math.max(0, Math.round(puntos)), tipo: tipo || 'sin_coincidencia',
      explicacion: explica.join('; ') || 'sin elementos suficientes para vincular',
      datos: cand, seleccionado: false
    };
  };

  /* ---------- selección de edición (§11) ---------- */

  // De una obra con varias ediciones, elige por evidencia, no por cantidad
  // de metadatos. Si no hay señal suficiente, no elige: manda a revisión.
  X.elegirEdicion = function (reg, ediciones) {
    var isbnEntrada = M.isbnCanonico(reg);
    var editorial = M.valor(reg, 'editorial') || U.limpia(reg.crudo.editorial) || (reg.sep && reg.sep.editorial) || '';
    var anio = U.anio(M.valor(reg, 'anio') || reg.crudo.anio || (reg.sep && reg.sep.anio) || '');
    var mejores = ediciones.map(function (e) {
      var p = 0, por = [];
      var isbnE = e.isbn13 || e.isbn10 || e.isbn_original;
      if (isbnEntrada && isbnE && U.isbn.equivalentes(isbnEntrada, isbnE)) { p += 100; por.push('ISBN de la entrada'); }
      if (editorial && e.editorial && U.similitud(editorial, e.editorial) >= 0.6) { p += 30; por.push('editorial concuerda'); }
      if (anio && U.anio(e.anio) === anio) { p += 25; por.push('año concuerda'); }
      if (e.idioma && ['spa', 'es'].indexOf(e.idioma) > -1) { p += 8; por.push('edición en español'); }
      return { edicion: e, puntos: p, porque: por.join(', ') };
    }).sort(function (a, b) { return b.puntos - a.puntos; });

    if (!mejores.length) return null;
    var top = mejores[0];
    var segundo = mejores[1];
    if (top.puntos < 25) {
      return { edicion: null, ambigua: true, motivo: 'Hay ' + ediciones.length + ' ediciones y ninguna coincide con la editorial, el año o el ISBN de la entrada.' };
    }
    if (segundo && top.puntos - segundo.puntos < 10 && top.puntos < 100) {
      return { edicion: null, ambigua: true, motivo: 'Dos ediciones puntúan casi igual (' + top.puntos + ' y ' + segundo.puntos + '): no hay base para elegir automáticamente.' };
    }
    return { edicion: top.edicion, ambigua: false, motivo: top.porque, puntos: top.puntos };
  };

  /* ---------- decisión de valor por campo (§24, §40) ---------- */

  var PRIORIDAD_BIBLIO = ['sep', 'openlibrary', 'googlebooks', 'isbnmexico', 'loc', 'url', 'entrada', 'ocr'];

  // Elige el valor de un campo entre las evidencias disponibles y deja
  // asentado por qué. Nunca fusiona textos de fuentes distintas.
  X.decidirCampo = function (reg, campo, opciones) {
    opciones = opciones || {};
    if (reg.campos[campo] && reg.campos[campo].manual) return reg.campos[campo]; // la decisión humana manda
    var evs = M.evidenciasDe(reg, campo);
    if (!evs.length) return null;

    var orden = opciones.prioridad || PRIORIDAD_BIBLIO;
    var ordenadas = evs.slice().sort(function (a, b) {
      var pa = orden.indexOf(a.fuente), pb = orden.indexOf(b.fuente);
      if (pa === -1) pa = 99; if (pb === -1) pb = 99;
      if (pa !== pb) return pa - pb;
      return b.confianza - a.confianza;
    });

    var elegida = ordenadas[0];
    var motivo = 'Valor tomado de ' + elegida.fuente_nombre +
      (evs.length > 1 ? ' entre ' + evs.length + ' fuentes que aportaron este campo.' : '.');
    return M.fijarCampo(reg, campo, elegida.valor, elegida.fuente, elegida.confianza, motivo);
  };

  /* ---------- detección de conflictos (§16, §42) ---------- */

  var CAMPOS_CONFLICTO = ['titulo', 'autor', 'editorial', 'anio', 'isbn'];

  X.detectarConflictos = function (reg) {
    reg.conflictos = reg.conflictos.filter(function (c) { return c.resolucion; }); // conserva lo ya resuelto

    // Un conflicto que la persona ya resolvió no vuelve a abrirse al reprocesar,
    // salvo que aparezca un valor nuevo que ella no haya visto.
    function yaResuelto(campo, grupos) {
      return reg.conflictos.some(function (c) {
        if (c.campo !== campo || !c.resolucion) return false;
        var vistos = c.valores.map(function (v) { return U.norm(v.valor); });
        return grupos.every(function (g) { return vistos.indexOf(U.norm(g.valor)) > -1; });
      });
    }

    CAMPOS_CONFLICTO.forEach(function (campo) {
      var evs = M.evidenciasDe(reg, campo).filter(function (e) { return e.fuente !== 'entrada' || campo === 'isbn'; });
      if (evs.length < 2) return;
      var grupos = [];
      evs.forEach(function (e) {
        var g = grupos.filter(function (gr) {
          if (campo === 'isbn') return U.isbn.equivalentes(gr.valor, e.valor);
          if (campo === 'anio') return U.anio(gr.valor) === U.anio(e.valor);
          return U.similitud(gr.valor, e.valor) >= 0.82;
        })[0];
        if (g) g.fuentes.push({ fuente: e.fuente_nombre, valor: e.valor, referencia: e.referencia });
        else grupos.push({ valor: e.valor, fuentes: [{ fuente: e.fuente_nombre, valor: e.valor, referencia: e.referencia }] });
      });
      if (grupos.length < 2) return;
      if (yaResuelto(campo, grupos)) return;

      var hayS = evs.some(function (e) { return e.fuente === 'sep'; });
      var hayExterna = evs.some(function (e) { return ['openlibrary', 'googlebooks', 'loc', 'isbnmexico'].indexOf(e.fuente) > -1; });
      var tipo = (hayS && hayExterna && ['editorial', 'anio', 'isbn'].indexOf(campo) > -1)
        ? 'POSIBLE EDICIÓN DISTINTA' : 'DISCREPANCIA ENTRE FUENTES';

      reg.conflictos.push({
        id: U.uid('cf'), campo: campo, tipo: tipo,
        severidad: tipo === 'POSIBLE EDICIÓN DISTINTA' ? 'alta' : 'media',
        valores: grupos.map(function (g) { return { valor: g.valor, fuentes: g.fuentes }; }),
        impacto: campo === 'isbn' || campo === 'anio' || campo === 'editorial'
          ? 'Afecta la identificación de la edición y, por lo tanto, la portada que corresponde.'
          : 'Afecta el dato que aparecerá en el documento.',
        explicacion: tipo === 'POSIBLE EDICIÓN DISTINTA'
          ? 'El catálogo SEP y las fuentes bibliográficas registran valores distintos en "' + campo + '". No se sobrescribe ninguno: se requiere decidir qué edición corresponde al ejemplar.'
          : 'Las fuentes consultadas no coinciden en "' + campo + '".',
        resolucion: ''
      });
      M.aRevision(reg, 'Conflicto en ' + campo, tipo === 'POSIBLE EDICIÓN DISTINTA' ? 'alta' : 'media');
    });
    return reg.conflictos;
  };

  /* ---------- portada (§12, §34) ---------- */

  // El servidor de portadas de Open Library devuelve una imagen en blanco
  // cuando no tiene nada: por eso se pide con default=false y se comprueba
  // que la descarga traiga una imagen real antes de declarar la portada.
  X.urlPortadaOL = function (clave, valor) {
    return 'https://covers.openlibrary.org/b/' + clave + '/' + valor + '-L.jpg?default=false';
  };

  X.verificarImagen = function (url) {
    return U.red.encolar('portadas', function () {
      return U.traer(url, { tipo: 'blob', timeout: 25000 });
    }).then(function (blob) {
      if (!blob || blob.size < 900) return null;   // marcador de posición, no portada
      return U.blobADataUrl(blob).then(function (d) {
        var img = d.length > 700000 ? '' : d;       // muy pesada: se guarda solo la liga
        return U.medirImagen(d).then(function (m) {
          return { dataUrl: img, ancho: m.ancho, alto: m.alto };
        });
      });
    }).catch(function () { return null; });
  };

  X.resolverPortada = function (reg) {
    var isbn = M.isbnCanonico(reg);
    var elegido = reg.candidatos.filter(function (c) { return c.seleccionado; })[0];
    var cand = elegido ? elegido.datos : null;
    var opciones = [];

    // 1. Portada ligada al ISBN exacto de la edición identificada.
    if (isbn && cand && (cand.isbn13 || cand.isbn10) && U.isbn.equivalentes(isbn, cand.isbn13 || cand.isbn10)) {
      if (cand.portadaUrl) {
        opciones.push({
          url: cand.portadaUrl.indexOf('covers.openlibrary.org') > -1 ? X.urlPortadaOL('isbn', U.isbn.limpiar(isbn)) : cand.portadaUrl,
          fuente: cand.fuente, verificada: true, confianza: 95, isbn_usado: U.isbn.limpiar(isbn), olid: cand.olid,
          nota: 'Portada recuperada por ISBN exacto de la edición identificada (' + cand.fuente_nombre + ').'
        });
      }
    }
    // 2. Portada por identificador de la edición.
    if (cand && cand.olid) {
      opciones.push({
        url: X.urlPortadaOL('olid', cand.olid), fuente: 'openlibrary', verificada: true, confianza: 88,
        isbn_usado: '', olid: cand.olid,
        nota: 'Portada vinculada al identificador de edición ' + cand.olid + '.'
      });
    }
    // 3. Open Library Covers por el ISBN del registro.
    if (isbn) {
      opciones.push({
        url: X.urlPortadaOL('isbn', U.isbn.limpiar(isbn)), fuente: 'openlibrary', verificada: true, confianza: 85,
        isbn_usado: U.isbn.limpiar(isbn), olid: '',
        nota: 'Portada obtenida de Open Library Covers a partir del ISBN del registro.'
      });
    }
    // 3b. La otra forma del ISBN: Open Library no siempre indexa ambas.
    if (isbn) {
      var otra = U.isbn.limpiar(isbn).length === 13 ? U.isbn.a10(isbn) : U.isbn.a13(isbn);
      if (otra) {
        opciones.push({
          url: X.urlPortadaOL('isbn', U.isbn.limpiar(otra)), fuente: 'openlibrary', verificada: true, confianza: 82,
          isbn_usado: U.isbn.limpiar(otra), olid: '',
          nota: 'Portada obtenida de Open Library Covers usando la otra forma del mismo ISBN (' + U.isbn.limpiar(otra) + ').'
        });
      }
    }
    // 4. Imagen de un candidato sin ISBN comprobado: evidencia, no portada confirmada.
    reg.candidatos.filter(function (c) { return c.datos.portadaUrl; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 2).forEach(function (c) {
        opciones.push({
          url: c.datos.portadaUrl, fuente: c.fuente, verificada: false, confianza: 45,
          isbn_usado: '', olid: c.datos.olid,
          nota: 'La portada localizada podría corresponder a otra edición; se conserva como evidencia visual y requiere revisión.',
          revisar: 'Portada no verificada'
        });
      });
    // 5. Imagen encontrada en una liga suministrada por el usuario.
    reg.entradas.forEach(function (e) {
      if (e.portadaWeb) {
        opciones.push({
          url: e.portadaWeb, fuente: 'url', verificada: false, confianza: 40, isbn_usado: '', olid: '',
          nota: 'Imagen tomada de la liga ' + e.origen + '; no está ligada al ISBN de la edición.',
          revisar: 'Portada no verificada'
        });
      }
    });

    var i = 0;
    function intentar() {
      if (i >= opciones.length) {
        // Sin portada: estado declarado, nunca una imagen genérica (§12).
        reg.portada = { url: '', fuente: 'sin_portada', isbn_usado: '', olid: '', verificada: false, confianza: 0, dataUrl: '', ancho: 0, alto: 0 };
        M.observar(reg, 'No se localizó portada asociada a esta edición. No se sustituye por una imagen genérica.');
        M.aRevision(reg, 'Sin portada', 'baja');
        return Promise.resolve(reg.portada);
      }
      var o = opciones[i++];
      return X.verificarImagen(o.url).then(function (img) {
        if (img === null) return intentar();       // no existe o no se pudo comprobar
        reg.portada = {
          url: o.url, fuente: o.fuente, isbn_usado: o.isbn_usado, olid: o.olid,
          verificada: o.verificada, confianza: o.confianza,
          dataUrl: img.dataUrl || '', ancho: img.ancho || 0, alto: img.alto || 0
        };
        M.observar(reg, o.nota);
        if (!img.dataUrl) M.observar(reg, 'La imagen es demasiado pesada para guardarse en el proyecto; se conserva la liga y se descarga al exportar.');
        if (o.revisar) M.aRevision(reg, o.revisar, 'media');
        return reg.portada;
      });
    }
    return intentar();
  };

  // Descarga la imagen para incrustarla en el documento (§32). Si el servidor
  // no autoriza la descarga desde el navegador, se dice, no se disimula.
  X.descargarPortada = function (reg) {
    if (!reg.portada.url) return Promise.resolve(null);
    if (reg.portada.dataUrl) return Promise.resolve(reg.portada.dataUrl);
    return X.verificarImagen(reg.portada.url).then(function (img) {
      if (img === null) {
        M.observar(reg, 'La imagen de portada ya no está disponible en ' + reg.portada.url + '; en el documento se registrará su procedencia sin incrustarla.');
        return null;
      }
      reg.portada.dataUrl = img.dataUrl || '';
      reg.portada.ancho = img.ancho || 0;
      reg.portada.alto = img.alto || 0;
      return img.dataUrl || null;
    });
  };

  /* ---------- observaciones automáticas (§23) ---------- */

  X.redactarObservaciones = function (reg) {
    var isbn = M.isbnCanonico(reg);
    var fuentesISBN = M.evidenciasDe(reg, 'isbn').filter(function (e) { return e.fuente !== 'entrada'; });
    if (isbn && fuentesISBN.length >= 2) {
      var todasIguales = fuentesISBN.every(function (e) { return U.isbn.equivalentes(e.valor, isbn); });
      if (todasIguales) {
        M.observar(reg, 'ISBN coincide en ' + fuentesISBN.length + ' fuentes: ' +
          fuentesISBN.map(function (e) { return e.fuente_nombre; }).join(', ') + '.');
      }
    }
    // Con lo que aportaron las fuentes ya se puede completar el par: si llegó
    // un ISBN-10 se calcula el de 13 y al revés. Es conversión exacta, y deja
    // las dos columnas de la hoja Inventario listas.
    M.derivarIsbn(reg);
    var an = U.isbn.analizar(M.isbnCanonico(reg));
    if (an.isbn10 && an.isbn13 && an.original) {
      M.observar(reg, 'ISBN registrado como ' + an.original + '; equivalencias ISBN-10 ' + an.isbn10 + ' / ISBN-13 ' + an.isbn13 + '.');
    }
    if (an.normalizado && !an.valido && an.nota) {
      M.observar(reg, 'Aviso sobre el ISBN: ' + an.nota + '. Se conserva el valor original sin corregirlo.');
    }
    var autores = M.evidenciasDe(reg, 'autor');
    if (autores.length >= 3) {
      var v0 = autores[0].valor;
      if (autores.every(function (e) { return U.similitud(e.valor, v0) >= 0.75; })) {
        M.observar(reg, 'El autor coincide en ' + autores.length + ' fuentes.');
      }
    }
    var sel = reg.candidatos.filter(function (c) { return c.seleccionado; })[0];
    if (sel && sel.tipo === 'solo_titulo') {
      M.observar(reg, 'Identificación realizada únicamente por título; no confirmada.');
    }
    if (!isbn) {
      M.observar(reg, 'Sin ISBN disponible en la entrada ni en las fuentes consultadas. No se genera ninguno.');
    }
    if (reg.sep && reg.sep.anio && M.valor(reg, 'anio') && U.anio(reg.sep.anio) !== U.anio(M.valor(reg, 'anio'))) {
      M.observar(reg, 'El año del catálogo SEP (' + reg.sep.anio + ') difiere del año de la edición identificada (' + M.valor(reg, 'anio') + ').');
    }
  };

  /* ---------- proceso completo de un registro ---------- */

  X.procesar = function (reg, avisar) {
    function paso(txt) { if (avisar) avisar(txt); }

    reg.estado = 'EN BÚSQUEDA';
    // La revisión se recalcula con los motivos de esta vuelta. Antes la
    // severidad no se limpiaba: un registro que alguna vez tuvo un problema
    // grave lo arrastraba para siempre y volvía a degradarse aunque estuviera
    // resuelto.
    M.reiniciarRevision(reg);

    // 1. Capa SEP primero: es el contexto que manda para Libros del Rincón (§40).
    paso('Buscando en el catálogo histórico SEP');
    var coincidenciasSep = S.buscar(
      M.valor(reg, 'titulo') || reg.crudo.titulo,
      M.valor(reg, 'autor') || reg.crudo.autor,
      M.isbnCanonico(reg), 5);
    reg.candidatosSep = coincidenciasSep.map(function (c) {
      return { id: c.ficha.id, titulo: c.ficha.titulo, ciclo: c.ficha.ciclo, grado: c.ficha.grado, puntos: c.puntos, motivo: c.motivo };
    });
    if (coincidenciasSep.length && coincidenciasSep[0].puntos >= 85) {
      S.aplicar(reg, coincidenciasSep[0]);
    } else if (coincidenciasSep.length && coincidenciasSep[0].puntos >= 70) {
      M.observar(reg, 'Hay una coincidencia probable en el catálogo SEP ("' + coincidenciasSep[0].ficha.titulo +
        '", ' + coincidenciasSep[0].ficha.ciclo + ') que no se aplicó automáticamente.');
      M.aRevision(reg, 'Coincidencia SEP por confirmar', 'media');
    } else {
      M.observar(reg, 'No se encontró correspondencia en el catálogo histórico Libros del Rincón cargado.');
    }

    // 2. Fuentes bibliográficas externas.
    paso('Consultando fuentes bibliográficas');
    return F.consultar(reg).then(function (r) {
      r.notas.forEach(function (n) { M.observar(reg, n); });

      var puntuados = r.candidatos.map(function (c) { return X.puntuar(reg, c); })
        .filter(function (c) { return c.score > 0; })
        .sort(function (a, b) { return b.score - a.score; });
      reg.candidatos = puntuados.slice(0, 12);

      if (!puntuados.length) {
        reg.estado = 'SIN RESULTADO';
        reg.confianza = 0;
        M.observar(reg, 'Ninguna fuente externa devolvió un candidato compatible con la entrada.');
        return reg;
      }

      // 3. Obra -> ediciones -> edición concreta (§11).
      var mejor = puntuados[0];
      var claveObra = mejor.datos.obra;
      var necesitaEdicion = mejor.tipo !== 'isbn_exacto' && mejor.tipo !== 'isbn_equivalente' && claveObra;
      if (!necesitaEdicion) return X._cerrar(reg, mejor, puntuados, paso);

      paso('Comparando ediciones de la obra');
      return F.adaptadores.openlibrary.edicionesDeObra(claveObra).then(function (eds) {
        if (!eds.length) return X._cerrar(reg, mejor, puntuados, paso);
        reg.obra = { titulo_canonico: mejor.datos.titulo, autores: mejor.datos.autores, clave: claveObra, ediciones: eds.length };
        var eleccion = X.elegirEdicion(reg, eds);
        if (eleccion && eleccion.edicion) {
          var candEd = X.puntuar(reg, eleccion.edicion);
          candEd.explicacion = 'Edición seleccionada entre ' + eds.length + ' de la misma obra: ' + eleccion.motivo + '.';
          candEd.score = Math.max(candEd.score, Math.min(94, mejor.score + 4));
          reg.candidatos.unshift(candEd);
          return X._cerrar(reg, candEd, reg.candidatos, paso);
        }
        M.observar(reg, 'La obra tiene ' + eds.length + ' ediciones registradas. ' +
          (eleccion ? eleccion.motivo : 'No hay base para elegir una.') + ' No se elige automáticamente.');
        M.aRevision(reg, 'Varias ediciones posibles', 'alta');
        reg.candidatos = reg.candidatos.concat(eds.slice(0, 8).map(function (e) { return X.puntuar(reg, e); }));
        return X._cerrar(reg, mejor, reg.candidatos, paso);
      });
    }).catch(function (e) {
      reg.estado = 'ERROR';
      M.observar(reg, 'Error durante el proceso: ' + e.message);
      return reg;
    });
  };

  X._cerrar = function (reg, elegido, todos, paso) {
    reg.candidatos.forEach(function (c) { c.seleccionado = false; });
    elegido.seleccionado = true;
    if (reg.candidatos.indexOf(elegido) === -1) reg.candidatos.unshift(elegido);

    var d = elegido.datos;
    var conf = Math.min(95, elegido.score);
    var ref = d.fuente_nombre + (d.id ? ' · ' + d.id : '') + (d.url ? ' · ' + d.url : '');

    [['titulo', d.titulo], ['autor', d.autores.join('; ')], ['editorial', d.editorial],
     ['anio', d.anio], ['isbn', d.isbn13 || d.isbn10 || d.isbn_original],
     ['paginas', d.paginas], ['dimensiones', d.dimensiones], ['idioma', d.idioma]].forEach(function (p) {
      if (p[1]) M.registrarEvidencia(reg, p[0], p[1], d.fuente, conf, ref);
    });
    // La reseña externa solo entra como respaldo; la del catálogo SEP tiene prioridad (§21).
    if (d.resena) M.registrarEvidencia(reg, 'resena', d.resena, d.fuente, Math.min(70, conf), ref);

    // Evidencias del resto de candidatos: se conservan aunque no se elijan.
    todos.forEach(function (c) {
      if (c === elegido) return;
      var dd = c.datos, r2 = dd.fuente_nombre + (dd.id ? ' · ' + dd.id : '');
      [['titulo', dd.titulo], ['autor', dd.autores.join('; ')], ['editorial', dd.editorial],
       ['anio', dd.anio], ['isbn', dd.isbn13 || dd.isbn10]].forEach(function (p) {
        if (p[1]) M.registrarEvidencia(reg, p[0], p[1], dd.fuente, Math.min(70, c.score), r2);
      });
    });

    reg.edicion = {
      isbn_original: d.isbn_original, isbn10: d.isbn10, isbn13: d.isbn13,
      editorial: d.editorial, anio: U.anio(d.anio) || d.anio, idioma: d.idioma,
      paginas: d.paginas, dimensiones: d.dimensiones,
      identificadores: { olid: d.olid, fuente: d.fuente, id: d.id, url: d.url },
      confianza: elegido.score
    };
    if (!reg.obra && d.titulo) {
      reg.obra = { titulo_canonico: d.titulo, titulo_original: d.titulo_original || '', autores: d.autores, clave: d.obra || '' };
    }

    // Decisión de campos. Cuando la edición se identificó por su ISBN, editorial,
    // año e ISBN salen de esa edición y no del catálogo SEP: si el documento
    // llevara el ISBN de una edición y el año de otra, se contradiría a sí mismo.
    // La clasificación SEP (grado, serie, categoría, reseña) no se toca por esto,
    // y la diferencia queda levantada como conflicto, nunca sustituida en silencio.
    var porIsbn = elegido.tipo === 'isbn_exacto' || elegido.tipo === 'isbn_equivalente';
    ['titulo', 'autor'].forEach(function (c) { X.decidirCampo(reg, c); });
    var prioridadEdicion = porIsbn ? { prioridad: [d.fuente].concat(PRIORIDAD_BIBLIO) } : null;
    ['editorial', 'anio', 'isbn'].forEach(function (c) { X.decidirCampo(reg, c, prioridadEdicion); });
    if (porIsbn && reg.sep && (reg.sep.editorial || reg.sep.anio)) {
      var difiere = (reg.sep.editorial && M.valor(reg, 'editorial') && U.similitud(reg.sep.editorial, M.valor(reg, 'editorial')) < 0.6) ||
        (reg.sep.anio && M.valor(reg, 'anio') && U.anio(reg.sep.anio) !== U.anio(M.valor(reg, 'anio')));
      if (difiere) {
        M.observar(reg, 'Editorial y año corresponden a la edición identificada por su ISBN (' + d.fuente_nombre +
          '); el catálogo SEP registra otros valores para el mismo título, que se conservan como evidencia y como conflicto abierto.');
      }
    }
    if (!M.valor(reg, 'resena')) X.decidirCampo(reg, 'resena');
    if (M.tieneEstadoFisico(reg)) M.fijarCampo(reg, 'estado_fisico', reg.fisico.estado_fisico, 'manual', 100, 'Capturado por la persona que revisa el ejemplar (§22)');

    X.detectarConflictos(reg);
    if (paso) paso('Resolviendo portada');

    return X.resolverPortada(reg).then(function () {
      X.redactarObservaciones(reg);
      reg.confianza = elegido.score;
      // Un conflicto abierto impide declarar confirmado (§46); un motivo leve
      // manda el registro a la bandeja sin quitarle lo que ganó por puntuación.
      reg.estado = M.estadoFinal(reg);
      reg.actualizado = U.ahora();
      return reg;
    });
  };

  /* ---------- procesamiento por lotes con reanudación (§26) ---------- */

  X.lote = { activo: false, cancelado: false, indice: 0, total: 0, mensaje: '' };

  X.procesarLote = function (registros, alAvanzar) {
    X.lote = { activo: true, cancelado: false, indice: 0, total: registros.length, mensaje: '' };
    var i = 0;
    function siguiente() {
      if (X.lote.cancelado || i >= registros.length) {
        X.lote.activo = false;
        M.guardar();
        if (alAvanzar) alAvanzar(X.lote);
        return Promise.resolve(X.lote);
      }
      var reg = registros[i];
      X.lote.indice = i + 1;
      X.lote.mensaje = 'Registro ' + (i + 1) + ' de ' + registros.length + ': ' + (M.valor(reg, 'titulo') || reg.crudo.titulo || 'sin título');
      if (alAvanzar) alAvanzar(X.lote);
      return X.procesar(reg, function (t) {
        X.lote.mensaje = (i + 1) + '/' + registros.length + ' — ' + t;
        if (alAvanzar) alAvanzar(X.lote);
      }).then(function () {
        i++;
        // Guardado incremental: si se interrumpe, no se pierde lo hecho.
        if (i % 5 === 0) M.guardar();
        return siguiente();
      }).catch(function () {
        i++;
        return siguiente();
      });
    }
    return siguiente();
  };

  X.cancelarLote = function () { X.lote.cancelado = true; };

  /* ---------- vista comparativa por campo (§31) ---------- */

  X.comparativo = function (reg) {
    var fuentes = ['entrada', 'sep', 'sep_pdf', 'openlibrary', 'googlebooks', 'isbnmexico', 'loc', 'url', 'ocr', 'taxonomia', 'manual'];
    var campos = ['titulo', 'autor', 'editorial', 'anio', 'isbn', 'resena', 'grado', 'subserie', 'categoria_sep', 'tipo_texto', 'color', 'contenidos_saberes'];
    return campos.map(function (c) {
      var fila = { campo: c, valores: {}, decision: reg.campos[c] ? reg.campos[c].valor : '', fuenteDecision: reg.campos[c] ? reg.campos[c].fuente_nombre : '' };
      fuentes.forEach(function (f) {
        var ev = M.evidenciasDe(reg, c).filter(function (e) { return e.fuente === f; });
        fila.valores[f] = ev.map(function (e) { return e.valor; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ');
      });
      var abierto = reg.conflictos.filter(function (cf) { return cf.campo === c && !cf.resolucion; }).length > 0;
      fila.estado = abierto ? 'revisar' : (fila.decision ? 'confirmado' : 'pendiente');
      return fila;
    });
  };

  global.LR.matching = X;
})(window);
