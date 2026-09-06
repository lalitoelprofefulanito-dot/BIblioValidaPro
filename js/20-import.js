/* =========================================================================
   20-import.js — Entradas admitidas (§2, §13, §14, §29)
   Todo tipo de entrada se convierte al mismo esquema interno y conserva
   su procedencia. La imagen y el texto original quedan como evidencia.
   ========================================================================= */
(function (global) {
  'use strict';

  var U = global.LR.util, M = global.LR.model;
  var I = {};

  I.CDN = {
    xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js',
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js'
  };

  /* ---------- mapeo de encabezados de tabla ---------- */

  I.ALIAS = {
    titulo: ['titulo', 'title', 'nombre del libro', 'nombre', 'obra', 'titulo del libro'],
    autor: ['autor', 'autores', 'author', 'authors', 'escritor'],
    editorial: ['editorial', 'publisher', 'casa editorial', 'sello'],
    anio: ['anio', 'ano', 'año', 'year', 'fecha', 'ano de publicacion', 'anio de publicacion', 'fecha de publicacion'],
    // Tres campos distintos: "ISBN-10" e "ISBN-13" son columnas separadas en la
    // hoja Inventario, y meterlas en un solo alias hacía que una pisara a la
    // otra al importar. El genérico queda para las hojas de una sola columna.
    isbn10: ['isbn10', 'isbn 10', 'isbn-10'],
    isbn13: ['isbn13', 'isbn 13', 'isbn-13'],
    isbn: ['isbn', 'codigo isbn', 'isbn del libro'],
    estado_fisico: ['estado fisico', 'estado', 'condicion', 'estado del libro'],
    resena: ['resena', 'reseña', 'sinopsis', 'descripcion', 'resumen', 'resena del libro'],
    grado: ['grado', 'grado escolar', 'nivel'],
    tipo_texto: ['tipo de texto', 'tipo texto', 'genero', 'género'],
    categoria_sep: ['categoria sep', 'categoria', 'clasificacion sep', 'clasificacion'],
    color: ['color'],
    subserie: ['subserie', 'serie', 'serie lectora', 'coleccion'],
    contenidos_saberes: ['contenidos y saberes', 'contenidos', 'saberes'],
    // Columnas de la hoja Inventario que no tenían alias: se importaban como
    // nada y había que recapturarlas a mano después de cada vuelta.
    ubicacion: ['ubicacion', 'ubicación', 'ubicacion fisica', 'estante', 'lugar'],
    codigo_bv: ['codigo bv', 'codigo biblioteca viva', 'codigo', 'clave bv'],
    procedencia: ['procedencia', 'origen del ejemplar', 'acervo'],
    observaciones: ['observaciones', 'observaciones generales', 'notas', 'comentarios'],
    codigo: ['codigo', 'clave', 'clave sep', 'n', 'no', 'num', 'numero', 'id']
  };

  // Alias demasiado generales para buscarlos dentro de un encabezado largo.
  // «Nombre» dentro de «Nombre del alumno» convertía una lista de grupo en un
  // catálogo de libros, y como los DOCX y las tablas pegadas se mapean sin
  // pasar por la pantalla de revisión, el error entraba sin que nadie lo viera.
  // Siguen valiendo cuando el encabezado dice exactamente eso y nada más.
  I.SOLO_EXACTOS = ['nombre', 'estado', 'nivel', 'obra', 'serie', 'fecha',
    'clave', 'id', 'n', 'no', 'num', 'numero', 'codigo', 'genero', 'género',
    'contenidos', 'saberes', 'notas', 'color', 'grado', 'categoria'];

  I.detectarMapeo = function (encabezados) {
    var mapeo = {};
    encabezados.forEach(function (h, i) {
      var n = U.norm(h);
      if (!n) return;
      Object.keys(I.ALIAS).forEach(function (campo) {
        if (mapeo[campo] != null) return;
        if (I.ALIAS[campo].some(function (a) { return U.norm(a) === n; })) mapeo[campo] = i;
      });
    });
    // Segunda pasada, coincidencia parcial para encabezados largos.
    // Solo con alias de cuatro letras o más: buscar "n" o "id" dentro de
    // cualquier encabezado emparejaba columnas que no tenían nada que ver.
    var yaTomadas = {};
    Object.keys(mapeo).forEach(function (c) { yaTomadas[mapeo[c]] = true; });
    encabezados.forEach(function (h, i) {
      var n = U.norm(h);
      if (!n || yaTomadas[i]) return;
      Object.keys(I.ALIAS).forEach(function (campo) {
        if (mapeo[campo] != null) return;
        var pega = I.ALIAS[campo].some(function (a) {
          var na = U.norm(a);
          if (na.length < 4) return false;
          if (I.SOLO_EXACTOS.indexOf(na) > -1) return false;   // solo cuenta si el encabezado es ese y nada más
          return n.indexOf(na) > -1;
        });
        if (pega) { mapeo[campo] = i; yaTomadas[i] = true; }
      });
    });
    return mapeo;
  };

  // Deja siempre un `isbn` canónico para que el motor —búsqueda, conflictos,
  // duplicados, control de calidad— siga teniendo un solo campo que consultar,
  // sin perder cuál era de 10 y cuál de 13. Se prefiere el de 13 por ser el
  // vigente. Si solo vino el genérico, se reparte según su longitud.
  I.canonizarIsbn = function (crudo) {
    var d10 = crudo.isbn10 ? U.isbn.limpiar(crudo.isbn10) : '';
    var d13 = crudo.isbn13 ? U.isbn.limpiar(crudo.isbn13) : '';
    var suelto = crudo.isbn ? U.isbn.limpiar(crudo.isbn) : '';
    if (suelto && !d10 && !d13) {
      if (suelto.length === 10) d10 = suelto; else if (suelto.length === 13) d13 = suelto;
    }
    // Una hoja puede traer el de 10 escrito en la columna de 13 y al revés.
    if (d10.length === 13 && d13.length !== 13) { var t = d13; d13 = d10; d10 = t; }
    if (d10) crudo.isbn10 = d10; else delete crudo.isbn10;
    if (d13) crudo.isbn13 = d13; else delete crudo.isbn13;
    crudo.isbn = d13 || d10 || suelto || '';
    if (!crudo.isbn) delete crudo.isbn;
    return crudo;
  };

  I.filasAMateriales = function (filas, mapeo, entradaBase) {
    var out = [];
    filas.forEach(function (fila, idx) {
      var crudo = {};
      Object.keys(mapeo).forEach(function (campo) {
        var v = fila[mapeo[campo]];
        if (v != null && String(v).trim() !== '') crudo[campo] = U.limpia(v);
      });
      I.canonizarIsbn(crudo);
      if (!crudo.titulo && !crudo.isbn) return; // sin identificador no hay registro
      out.push({
        crudo: crudo,
        entrada: {
          tipo: entradaBase.tipo, origen: entradaBase.origen, fecha: U.ahora(),
          detalle: 'fila ' + (idx + 2), textoOriginal: fila.join(' | ')
        }
      });
    });
    return out;
  };

  /* ---------- texto plano y texto pegado (§2.1) ---------- */

  // Un registro por línea. Reconoce separadores tabulares y patrones
  // "Título / Autor / Editorial, Año. ISBN".
  I.desdeTexto = function (texto, origen) {
    var lineas = String(texto || '').split(/\r?\n/);
    var materiales = [];

    // ¿Es una tabla pegada? (§2.1 tablas como texto)
    var conTab = lineas.filter(function (l) { return l.indexOf('\t') > -1; }).length;
    if (conTab >= Math.max(2, lineas.filter(function (l) { return l.trim(); }).length * 0.6)) {
      var filas = lineas.filter(function (l) { return l.trim(); }).map(function (l) { return l.split('\t'); });
      var enc = filas[0];
      var mapeo = I.detectarMapeo(enc);
      if (Object.keys(mapeo).length >= 2) {
        return I.filasAMateriales(filas.slice(1), mapeo, { tipo: 'texto-tabla', origen: origen || 'texto pegado' });
      }
    }

    lineas.forEach(function (linea, i) {
      var l = U.limpia(linea);
      if (!l || l.length < 3) return;
      if (/^[-=_*#\s]+$/.test(l)) return;
      var crudo = I.desglosarLinea(l);
      I.canonizarIsbn(crudo);
      if (!crudo.titulo && !crudo.isbn) return;
      var debil = crudo._divisionDebil === true;
      delete crudo._divisionDebil;
      materiales.push({
        crudo: crudo,
        entrada: {
          tipo: 'texto', origen: origen || 'texto pegado', fecha: U.ahora(),
          detalle: 'línea ' + (i + 1), textoOriginal: l, divisionDebil: debil
        }
      });
    });
    return materiales;
  };

  // Devuelve además si la división se hizo con un guion suelto, que en los
  // títulos del acervo aparece dentro del propio título ("Delfín, el - ¡vaya
  // fauna!"). Cuando pasa, el registro lo declara en vez de dar por bueno el corte.
  I.desglosarLinea = function (linea) {
    var crudo = {}, resto = linea;

    var isbns = U.isbn.buscarEnTexto(resto);
    if (isbns.length) {
      crudo.isbn = isbns[0];
      resto = resto.replace(/ISBN[\s:-]*[0-9Xx\s-]{10,20}/gi, ' ');
      isbns.forEach(function (c) {
        resto = resto.replace(new RegExp(c.split('').join('[\\s-]*'), 'g'), ' ');
      });
    }

    var separadorFuerte = /\s*[|;]\s*|\s+[–—]\s+|\t/;
    var conFuerte = resto.split(separadorFuerte).map(U.limpia).filter(Boolean);
    var partes = conFuerte;
    if (conFuerte.length < 2) {
      var conGuion = resto.split(/\s+-\s+/).map(U.limpia).filter(Boolean);
      if (conGuion.length >= 2) { partes = conGuion; crudo._divisionDebil = true; }
    }
    if (partes.length >= 2) {
      crudo.titulo = partes[0];
      if (partes[1]) crudo.autor = partes[1];
      if (partes[2]) crudo.editorial = partes[2];
      if (partes[3]) crudo.anio = U.anio(partes[3]) || partes[3];
    } else {
      crudo.titulo = U.limpia(resto);
    }

    // Año suelto al final del título o de la editorial
    ['titulo', 'autor', 'editorial'].forEach(function (c) {
      if (!crudo[c] || crudo.anio) return;
      var a = U.anio(crudo[c]);
      if (a) {
        crudo.anio = a;
        crudo[c] = U.limpia(crudo[c].replace(/[(,]?\s*\b(1[5-9]\d{2}|20[0-4]\d)\b\s*[).]?/, ' '));
      }
    });

    if (crudo.titulo) crudo.titulo = U.limpia(crudo.titulo.replace(/[.,;:]+$/, ''));
    return crudo;
  };

  /* ---------- CSV / XLSX (§2.4) ---------- */

  I.leerHoja = function (archivo) {
    return U.cargarScript(I.CDN.xlsx, 'XLSX').then(function (XLSX) {
      return archivo.arrayBuffer().then(function (buf) {
        var wb = XLSX.read(buf, { type: 'array' });
        return {
          hojas: wb.SheetNames,
          filasDe: function (nombre) {
            var hoja = wb.Sheets[nombre];
            return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' })
              .filter(function (f) { return f.some(function (c) { return String(c).trim(); }); });
          }
        };
      });
    });
  };

  /* ---------- DOCX (§2.2) ---------- */

  I.leerDocx = function (archivo) {
    return U.cargarScript(I.CDN.mammoth, 'mammoth').then(function (mammoth) {
      return archivo.arrayBuffer().then(function (buf) {
        return mammoth.convertToHtml({ arrayBuffer: buf });
      });
    }).then(function (res) {
      var doc = new DOMParser().parseFromString(res.value, 'text/html');
      var tablas = Array.prototype.slice.call(doc.querySelectorAll('table')).map(function (t) {
        return Array.prototype.slice.call(t.querySelectorAll('tr')).map(function (tr) {
          return Array.prototype.slice.call(tr.querySelectorAll('td,th')).map(function (td) {
            return U.limpia(td.textContent);
          });
        });
      });
      var parrafos = Array.prototype.slice.call(doc.querySelectorAll('p,li,h1,h2,h3,h4'))
        .map(function (p) { return U.limpia(p.textContent); })
        .filter(Boolean);
      return { tablas: tablas, texto: parrafos.join('\n') };
    });
  };

  /* ---------- imagen y OCR (§2.3, §13) ---------- */

  I.leerImagen = function (archivo, alProgreso) {
    var dataUrl;
    return U.blobADataUrl(archivo).then(function (d) {
      dataUrl = d;
      return U.cargarScript(I.CDN.tesseract, 'Tesseract');
    }).then(function (Tesseract) {
      return Tesseract.recognize(dataUrl, 'spa', {
        logger: function (m) {
          if (alProgreso && m.status === 'recognizing text') alProgreso(Math.round(m.progress * 100));
        }
      });
    }).then(function (res) {
      return {
        dataUrl: dataUrl,
        texto: res.data.text || '',
        confianzaOCR: Math.round(res.data.confidence || 0)
      };
    }).catch(function (e) {
      // Sin OCR la imagen sigue siendo evidencia: se conserva y se transcribe a mano.
      return { dataUrl: dataUrl, texto: '', confianzaOCR: 0, error: e.message };
    });
  };

  /* ---------- URLs (§2.5, §14, §45) ---------- */

  I.urlConProxy = function (url) {
    var p = M.estado.config.proxy;
    if (!p) return url;
    return p.indexOf('{url}') > -1
      ? p.replace('{url}', encodeURIComponent(url))
      : p + url;
  };

  I.leerUrl = function (url) {
    return U.red.encolar('url', function () {
      return U.traer(I.urlConProxy(url), { tipo: 'texto', timeout: 25000 });
    }).then(function (html) {
      var datos = I.extraerDeHtml(html, url);
      datos.url = url;
      datos.consultada = U.ahora();
      return datos;
    });
  };

  I.extraerDeHtml = function (html, url) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var d = { titulo: '', autor: '', editorial: '', anio: '', isbn: '', resena: '', portada: '' };

    function meta(sel) {
      var n = doc.querySelector(sel);
      return n ? U.limpia(n.getAttribute('content') || n.textContent) : '';
    }

    d.titulo = meta('meta[name="citation_title"]') || meta('meta[property="og:title"]') ||
      meta('meta[name="DC.title"]') || U.limpia(doc.title);
    d.autor = meta('meta[name="citation_author"]') || meta('meta[name="author"]') || meta('meta[name="DC.creator"]');
    d.editorial = meta('meta[name="citation_publisher"]') || meta('meta[name="DC.publisher"]') || meta('meta[property="og:site_name"]');
    d.anio = U.anio(meta('meta[name="citation_publication_date"]') || meta('meta[name="DC.date"]') || meta('meta[property="book:release_date"]'));
    d.isbn = U.isbn.limpiar(meta('meta[name="citation_isbn"]') || meta('meta[property="book:isbn"]'));
    d.resena = meta('meta[property="og:description"]') || meta('meta[name="description"]');
    d.portada = meta('meta[property="og:image"]') || meta('meta[name="citation_cover_image_url"]');

    // JSON-LD tipo Book
    Array.prototype.slice.call(doc.querySelectorAll('script[type="application/ld+json"]')).forEach(function (s) {
      try {
        var j = JSON.parse(s.textContent);
        var arr = Array.isArray(j) ? j : [j];
        arr.forEach(function (o) {
          if (!o || (o['@type'] !== 'Book' && o['@type'] !== 'Product')) return;
          d.titulo = d.titulo || U.limpia(o.name);
          if (o.author) d.autor = d.autor || U.limpia(typeof o.author === 'string' ? o.author : (o.author.name || (o.author[0] && o.author[0].name)));
          if (o.publisher) d.editorial = d.editorial || U.limpia(typeof o.publisher === 'string' ? o.publisher : o.publisher.name);
          d.anio = d.anio || U.anio(o.datePublished);
          d.isbn = d.isbn || U.isbn.limpiar(o.isbn);
          d.resena = d.resena || U.limpia(o.description);
          if (o.image) d.portada = d.portada || (typeof o.image === 'string' ? o.image : o.image.url);
        });
      } catch (e) { /* JSON-LD inválido: se ignora sin romper la extracción */ }
    });

    if (!d.isbn) {
      var enTexto = U.isbn.buscarEnTexto(doc.body ? doc.body.textContent : html);
      if (enTexto.length) d.isbn = enTexto[0];
    }
    if (d.portada && d.portada.indexOf('http') !== 0 && url) {
      try { d.portada = new URL(d.portada, url).href; } catch (e) { d.portada = ''; }
    }
    return d;
  };

  /* ---------- fusión de entradas (§15) ---------- */

  I.UMBRAL_FUSION = 0.92;

  // Índice para no recorrer el acervo entero por cada entrada que llega.
  // Los ISBN se resuelven por tabla; los títulos se agrupan por longitud, que
  // es lo único que la cota de similitud necesita para descartar en bloque.
  I.indiceRegistros = function (registros, umbral) {
    umbral = umbral || I.UMBRAL_FUSION;
    var porIsbn = Object.create(null), porLongitud = Object.create(null), i, r;
    for (i = 0; i < registros.length; i++) {
      r = registros[i];
      var isbnR = M.isbnCanonico(r);
      if (isbnR) {
        var k13 = U.isbn.a13(isbnR) || U.isbn.limpiar(isbnR);
        if (k13 && !porIsbn[k13]) porIsbn[k13] = r;
      }
      var t = U.norm(M.valor(r, 'titulo') || (r.crudo && r.crudo.titulo) || '');
      if (!t) continue;
      (porLongitud[t.length] = porLongitud[t.length] || []).push(r);
    }
    return {
      umbral: umbral,
      relativa: U.LONGITUD_RELATIVA(umbral),
      porIsbn: porIsbn,
      porLongitud: porLongitud,
      // Solo las longitudes que la cota permite alcanzar el umbral.
      candidatosPorTitulo: function (titulo) {
        var n = U.norm(titulo);
        if (!n) return [];
        var lo = Math.floor(n.length * this.relativa), hi = Math.ceil(n.length / this.relativa);
        var out = [];
        for (var L = Math.max(1, lo); L <= hi; L++) {
          if (porLongitud[L]) out = out.concat(porLongitud[L]);
        }
        return out;
      }
    };
  };

  // Busca un registro ya existente que describa el mismo libro.
  // `indice` es opcional: sin él se construye al vuelo, para no romper a quien
  // llame con la firma de antes.
  I.buscarSimilar = function (crudo, registros, indice) {
    var idx = indice || I.indiceRegistros(registros || [], I.UMBRAL_FUSION);
    var isbn = crudo.isbn ? U.isbn.limpiar(crudo.isbn) : '';
    if (isbn) {
      var k = U.isbn.a13(isbn) || isbn;
      if (idx.porIsbn[k]) return { reg: idx.porIsbn[k], motivo: 'ISBN equivalente' };
    }
    if (!crudo.titulo) return null;
    var posibles = idx.candidatosPorTitulo(crudo.titulo);
    for (var j = 0; j < posibles.length; j++) {
      var r2 = posibles[j];
      var t2 = M.valor(r2, 'titulo') || (r2.crudo && r2.crudo.titulo) || '';
      var sim = U.similitudAlMenos(crudo.titulo, t2, idx.umbral);
      if (!sim) continue;
      var a1 = U.norm(crudo.autor || ''), a2 = U.norm(M.valor(r2, 'autor') || (r2.crudo && r2.crudo.autor) || '');
      if (!a1 || !a2 || U.similitud(a1, a2) >= 0.7) {
        return { reg: r2, motivo: 'Título prácticamente idéntico (' + Math.round(sim * 100) + '%)' };
      }
    }
    return null;
  };

  // Integra materiales al proyecto: crea registros o fusiona con los existentes.
  I.integrar = function (materiales, opciones) {
    opciones = opciones || {};
    var res = { creados: 0, fusionados: 0, descartados: 0, registros: [] };
    // Un solo índice para todo el lote, que se va alimentando con lo que se
    // crea: así una lista con el mismo libro repetido sigue fusionándose.
    var idx = I.indiceRegistros(M.estado.registros, I.UMBRAL_FUSION);
    function indexar(r) {
      var isbnR = M.isbnCanonico(r);
      if (isbnR) {
        var k13 = U.isbn.a13(isbnR) || U.isbn.limpiar(isbnR);
        if (k13 && !idx.porIsbn[k13]) idx.porIsbn[k13] = r;
      }
      var t = U.norm(M.valor(r, 'titulo') || (r.crudo && r.crudo.titulo) || '');
      if (t) (idx.porLongitud[t.length] = idx.porLongitud[t.length] || []).push(r);
    }
    materiales.forEach(function (m) {
      var similar = opciones.fusionar === false ? null : I.buscarSimilar(m.crudo, M.estado.registros, idx);
      if (similar) {
        var r = similar.reg;
        r.entradas.push(m.entrada);
        Object.keys(m.crudo).forEach(function (c) {
          M.registrarEvidencia(r, c, m.crudo[c], 'entrada', 60, m.entrada.origen + ' · ' + (m.entrada.detalle || ''));
          if (!r.crudo[c]) r.crudo[c] = m.crudo[c];
        });
        M.observar(r, 'Entrada adicional fusionada (' + similar.motivo + ') desde ' + m.entrada.origen + '.');
        res.fusionados++;
        res.registros.push(r);
      } else {
        var nr = M.nuevoRegistro(m.crudo, m.entrada);
        if (m.entrada.imagen) nr.entradas[0].imagen = m.entrada.imagen;
        if (m.entrada.divisionDebil) {
          M.observar(nr, 'La línea se dividió por un guion: "' + (m.crudo.titulo || '') + '" se tomó como título y "' +
            (m.crudo.autor || '') + '" como autor. Si el guion era parte del título, corrígelo antes de procesar.');
          M.aRevision(nr, 'División de línea por guion', 'baja');
        }
        M.estado.registros.push(nr);
        indexar(nr);
        res.creados++;
        res.registros.push(nr);
      }
    });
    I.renumerar();
    M.guardarDiferido();
    return res;
  };

  I.renumerar = function () {
    M.estado.registros.forEach(function (r, i) { r.n = i + 1; });
  };

  global.LR.importar = I;
})(window);
