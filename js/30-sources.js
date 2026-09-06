/* =========================================================================
   30-sources.js — Adaptadores de fuente (§5, §39, §40)
   Todos exponen la misma interfaz y devuelven candidatos normalizados con
   su procedencia. Ninguno escribe en el registro: solo aporta evidencia.
   Interfaz: porISBN, porTitulo, edicionesDeObra, portada, disponible.
   ========================================================================= */
(function (global) {
  'use strict';

  var U = global.LR.util, M = global.LR.model;
  var F = { adaptadores: {} };

  function candidato(fuente, datos) {
    var a = U.isbn.analizar(datos.isbn || datos.isbn13 || datos.isbn10 || '');
    return {
      fuente: fuente,
      fuente_nombre: M.nombreFuente(fuente),
      id: datos.id || '',
      url: datos.url || '',
      titulo: U.limpia(datos.titulo),
      titulo_original: U.limpia(datos.titulo_original),
      autores: (datos.autores || []).filter(Boolean).map(U.limpia),
      editorial: U.limpia(datos.editorial),
      anio: U.anio(datos.anio) || U.limpia(datos.anio),
      isbn_original: a.original || U.limpia(datos.isbn),
      isbn10: datos.isbn10 || a.isbn10 || '',
      isbn13: datos.isbn13 || a.isbn13 || '',
      idioma: U.limpia(datos.idioma),
      paginas: U.limpia(datos.paginas),
      dimensiones: U.limpia(datos.dimensiones),
      resena: U.limpia(datos.resena),
      portadaUrl: datos.portadaUrl || '',
      olid: datos.olid || '',
      obra: datos.obra || '',
      recuperado: U.ahora(),
      crudo: datos.crudo || null
    };
  }

  // Cuando una fuente falla, se anota. El hueco no se rellena con otra (§40).
  F._notas = [];
  function fallo(fuente, contexto) {
    return function (e) {
      var msg = M.nombreFuente(fuente) + ' no respondió al consultar ' + contexto +
        ' (' + ((e && e.message) || 'error de red') + '). No se sustituye por otra fuente.';
      if (F._notas.indexOf(msg) === -1) F._notas.push(msg);
      return null;
    };
  }

  function conCache(fuente, tipo, valor, fn) {
    var k = M.cache.clave(fuente, tipo, valor);
    return M.cache.obtener(k).then(function (v) {
      if (v !== undefined) return v;
      return U.red.encolar(fuente, fn).then(function (res) {
        // Un fallo no se guarda en caché: se reintenta en la siguiente vuelta.
        if (res !== null && res !== undefined && !res._error) M.cache.guardar(k, res);
        return res;
      });
    });
  }

  /* ================= Open Library (§5.1) ================= */

  var OL = {
    id: 'openlibrary',
    activa: function () { return M.estado.config.usarOpenLibrary; },
    disponible: function () { return { ok: true, nota: 'API pública con CORS abierto.' } },

    porISBN: function (isbn) {
      var i = U.isbn.limpiar(isbn);
      if (!i) return Promise.resolve([]);
      return conCache('openlibrary', 'isbn', i, function () {
        return U.traer('https://openlibrary.org/isbn/' + i + '.json').catch(fallo('openlibrary', 'el ISBN ' + i));
      }).then(function (ed) {
        if (!ed) return [];
        var autores = [];
        var olid = (ed.key || '').replace('/books/', '');
        var c = candidato('openlibrary', {
          id: olid, olid: olid, url: 'https://openlibrary.org' + (ed.key || ''),
          titulo: ed.title + (ed.subtitle ? ': ' + ed.subtitle : ''),
          titulo_original: '',
          autores: autores,
          editorial: (ed.publishers || [])[0] || '',
          anio: ed.publish_date || '',
          isbn: i,
          isbn10: (ed.isbn_10 || [])[0] || '',
          isbn13: (ed.isbn_13 || [])[0] || '',
          idioma: ((ed.languages || [])[0] || {}).key ? (ed.languages[0].key.replace('/languages/', '')) : '',
          paginas: ed.number_of_pages || '',
          dimensiones: ed.physical_dimensions || '',
          portadaUrl: 'https://covers.openlibrary.org/b/isbn/' + i + '-L.jpg',
          obra: ((ed.works || [])[0] || {}).key || '',
          crudo: ed
        });
        // Autores: una consulta adicional por autor, con caché propia.
        var claves = (ed.authors || []).map(function (a) { return a.key; }).filter(Boolean).slice(0, 3);
        if (!claves.length) return [c];
        return Promise.all(claves.map(function (k) {
          return conCache('openlibrary', 'autor', k, function () {
            return U.traer('https://openlibrary.org' + k + '.json').catch(fallo('openlibrary', 'un autor'));
          });
        })).then(function (as) {
          c.autores = as.filter(Boolean).map(function (a) { return U.limpia(a.name); }).filter(Boolean);
          return [c];
        });
      });
    },

    porTitulo: function (titulo, autor) {
      var q = 'title=' + encodeURIComponent(titulo || '');
      if (autor) q += '&author=' + encodeURIComponent(autor);
      var campos = 'key,title,author_name,first_publish_year,publisher,isbn,cover_i,edition_key,language,number_of_pages_median';
      var url = 'https://openlibrary.org/search.json?' + q + '&limit=8&fields=' + campos;
      return conCache('openlibrary', 'busqueda', url, function () {
        return U.traer(url).catch(fallo('openlibrary', 'el título «' + titulo + '»'));
      }).then(function (r) {
        if (!r || !r.docs) return [];
        return r.docs.map(function (d) {
          var isbn = (d.isbn || [])[0] || '';
          return candidato('openlibrary', {
            id: d.key, obra: d.key, url: 'https://openlibrary.org' + d.key,
            titulo: d.title, autores: d.author_name || [],
            editorial: (d.publisher || [])[0] || '',
            anio: d.first_publish_year || '',
            isbn: isbn,
            paginas: d.number_of_pages_median || '',
            portadaUrl: d.cover_i ? ('https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg') : (isbn ? 'https://covers.openlibrary.org/b/isbn/' + U.isbn.limpiar(isbn) + '-L.jpg' : ''),
            crudo: d
          });
        });
      });
    },

    // Ediciones concretas de una obra (§11): esto es lo que evita confundir obra con edición.
    edicionesDeObra: function (claveObra) {
      if (!claveObra) return Promise.resolve([]);
      var url = 'https://openlibrary.org' + claveObra + '/editions.json?limit=50';
      return conCache('openlibrary', 'ediciones', claveObra, function () {
        return U.traer(url).catch(fallo('openlibrary', 'las ediciones de la obra'));
      }).then(function (r) {
        if (!r || !r.entries) return [];
        return r.entries.map(function (ed) {
          var olid = (ed.key || '').replace('/books/', '');
          var i13 = (ed.isbn_13 || [])[0] || '', i10 = (ed.isbn_10 || [])[0] || '';
          return candidato('openlibrary', {
            id: olid, olid: olid, url: 'https://openlibrary.org' + (ed.key || ''),
            titulo: ed.title, editorial: (ed.publishers || [])[0] || '',
            anio: ed.publish_date || '', isbn: i13 || i10, isbn10: i10, isbn13: i13,
            idioma: ((ed.languages || [])[0] || {}).key ? ed.languages[0].key.replace('/languages/', '') : '',
            paginas: ed.number_of_pages || '', dimensiones: ed.physical_dimensions || '',
            obra: claveObra,
            portadaUrl: (ed.covers && ed.covers[0]) ? ('https://covers.openlibrary.org/b/id/' + ed.covers[0] + '-L.jpg') : '',
            crudo: ed
          });
        });
      });
    },

    portada: function (ref) {
      if (ref.isbn13 || ref.isbn10) {
        var i = U.isbn.limpiar(ref.isbn13 || ref.isbn10);
        return Promise.resolve({ url: 'https://covers.openlibrary.org/b/isbn/' + i + '-L.jpg', clave: 'isbn', valor: i });
      }
      if (ref.olid) return Promise.resolve({ url: 'https://covers.openlibrary.org/b/olid/' + ref.olid + '-L.jpg', clave: 'olid', valor: ref.olid });
      return Promise.resolve(null);
    }
  };

  /* ================= Google Books (§5.2) ================= */

  var GB = {
    id: 'googlebooks',
    activa: function () { return M.estado.config.usarGoogleBooks; },
    disponible: function () { return { ok: true, nota: 'API pública; sin clave admite un volumen razonable de consultas.' } },

    _normaliza: function (item) {
      var v = item.volumeInfo || {}, ids = v.industryIdentifiers || [];
      function idPor(t) { var x = ids.filter(function (i) { return i.type === t; })[0]; return x ? x.identifier : ''; }
      var img = (v.imageLinks || {});
      var portada = img.extraLarge || img.large || img.medium || img.thumbnail || '';
      if (portada) portada = portada.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
      return candidato('googlebooks', {
        id: item.id, url: v.infoLink || '',
        titulo: v.title + (v.subtitle ? ': ' + v.subtitle : ''),
        autores: v.authors || [], editorial: v.publisher || '', anio: v.publishedDate || '',
        isbn13: idPor('ISBN_13'), isbn10: idPor('ISBN_10'),
        isbn: idPor('ISBN_13') || idPor('ISBN_10'),
        idioma: v.language || '', paginas: v.pageCount || '',
        dimensiones: v.dimensions ? [v.dimensions.height, v.dimensions.width].filter(Boolean).join(' x ') : '',
        resena: v.description || '', portadaUrl: portada, crudo: v
      });
    },

    porISBN: function (isbn) {
      var i = U.isbn.limpiar(isbn);
      if (!i) return Promise.resolve([]);
      var url = 'https://www.googleapis.com/books/v1/volumes?q=isbn:' + i;
      return conCache('googlebooks', 'isbn', i, function () {
        return U.traer(url).catch(fallo('googlebooks', 'el ISBN ' + i));
      }).then(function (r) {
        if (!r || !r.items) return [];
        return r.items.map(GB._normaliza);
      });
    },

    porTitulo: function (titulo, autor) {
      var q = 'intitle:' + JSON.stringify(String(titulo || ''));
      if (autor) q += '+inauthor:' + JSON.stringify(String(autor));
      var url = 'https://www.googleapis.com/books/v1/volumes?maxResults=8&q=' + encodeURIComponent(q);
      return conCache('googlebooks', 'busqueda', url, function () {
        return U.traer(url).catch(fallo('googlebooks', 'el título «' + titulo + '»'));
      }).then(function (r) {
        if (!r || !r.items) return [];
        return r.items.map(GB._normaliza);
      });
    },

    edicionesDeObra: function () { return Promise.resolve([]); },

    portada: function (ref) {
      if (!ref.isbn13 && !ref.isbn10) return Promise.resolve(null);
      return GB.porISBN(ref.isbn13 || ref.isbn10).then(function (cs) {
        var c = cs.filter(function (x) { return x.portadaUrl; })[0];
        return c ? { url: c.portadaUrl, clave: 'isbn', valor: U.isbn.limpiar(ref.isbn13 || ref.isbn10) } : null;
      });
    }
  };

  /* ================= Library of Congress (§5.4) ================= */

  var LOC = {
    id: 'loc',
    activa: function () { return M.estado.config.usarLOC; },
    disponible: function () {
      return { ok: true, nota: 'Servicio JSON de loc.gov. Si el navegador bloquea la consulta por CORS, se marca como no disponible en el registro, sin sustituirse por otra fuente.' };
    },

    _buscar: function (q) {
      var url = 'https://www.loc.gov/books/?q=' + encodeURIComponent(q) + '&fo=json&c=5';
      return conCache('loc', 'busqueda', q, function () {
        return U.traer(M.estado.config.proxy ? global.LR.importar.urlConProxy(url) : url, { timeout: 25000 })
          .catch(fallo('loc', 'la consulta «' + q + '»'));
      }).then(function (r) {
        if (!r || !r.results) return [];
        return r.results.slice(0, 5).map(function (it) {
          return candidato('loc', {
            id: it.id || '', url: it.url || '',
            titulo: it.title || '',
            autores: it.contributor || [],
            editorial: (it.item && it.item.created_published ? String(it.item.created_published) : ''),
            anio: (it.date || ''),
            isbn: '',
            resena: (it.description || [])[0] || '',
            crudo: it
          });
        });
      });
    },

    porISBN: function (isbn) { return LOC._buscar(U.isbn.limpiar(isbn)); },
    porTitulo: function (titulo, autor) { return LOC._buscar([titulo, autor].filter(Boolean).join(' ')); },
    edicionesDeObra: function () { return Promise.resolve([]); },
    portada: function () { return Promise.resolve(null); }
  };

  /* ================= Agencia ISBN México (§5.3) ================= */

  // El servicio de INDAUTOR no publica API abierta ni cabeceras CORS. Sin un
  // proxy propio configurado, esta fuente no puede consultarse desde el
  // navegador: se declara no disponible en lugar de rellenar con otra fuente.
  var MX = {
    id: 'isbnmexico',
    activa: function () { return M.estado.config.usarIsbnMexico; },
    disponible: function () {
      if (!M.estado.config.proxy) {
        return { ok: false, nota: 'Requiere un proxy propio configurado en Ajustes. Sin él, el navegador no puede consultar isbnmexico.indautor.gob.mx.' };
      }
      return { ok: true, nota: 'Consulta mediante el proxy configurado. El resultado se registra como evidencia por verificar, no como dato confirmado.' };
    },

    porISBN: function (isbn) {
      var i = U.isbn.limpiar(isbn);
      if (!i || !M.estado.config.proxy) return Promise.resolve([]);
      var url = M.estado.config.urlIsbnMexico.replace('{isbn}', i);
      return conCache('isbnmexico', 'isbn', i, function () {
        return U.traer(global.LR.importar.urlConProxy(url), { tipo: 'texto', timeout: 25000 })
          .catch(fallo('isbnmexico', 'el ISBN ' + i));
      }).then(function (html) {
        if (!html) return [];
        var d = global.LR.importar.extraerDeHtml(html, url);
        if (!d.titulo && !d.isbn) return [];
        return [candidato('isbnmexico', {
          id: i, url: url, titulo: d.titulo, autores: d.autor ? [d.autor] : [],
          editorial: d.editorial, anio: d.anio, isbn: d.isbn || i, resena: d.resena,
          crudo: { origen: 'consulta HTML vía proxy' }
        })];
      });
    },

    porTitulo: function () { return Promise.resolve([]); },
    edicionesDeObra: function () { return Promise.resolve([]); },
    portada: function () { return Promise.resolve(null); }
  };

  // Contrato público: cualquier fuente nueva (incluida una tuya, local) debe
  // devolver candidatos con esta forma. También lo usa la prueba automatizada.
  F.candidato = candidato;

  F.adaptadores = { openlibrary: OL, googlebooks: GB, loc: LOC, isbnmexico: MX };

  F.activas = function () {
    return Object.keys(F.adaptadores).filter(function (k) {
      return F.adaptadores[k].activa() && F.adaptadores[k].disponible().ok;
    });
  };

  // Consulta todas las fuentes activas y devuelve candidatos con su origen.
  F.consultar = function (reg) {
    var U2 = global.LR.util;
    var isbn = M.isbnCanonico(reg);
    var titulo = M.valor(reg, 'titulo') || U2.limpia(reg.crudo.titulo);
    var autor = M.valor(reg, 'autor') || U2.limpia(reg.crudo.autor);
    var tareas = [], notas = [];
    F._notas = [];

    F.activas().forEach(function (k) {
      var ad = F.adaptadores[k];
      if (isbn) tareas.push(ad.porISBN(isbn).catch(function (e) { notas.push(k + ': ' + e.message); return []; }));
      if (titulo) tareas.push(ad.porTitulo(titulo, autor).catch(function (e) { notas.push(k + ': ' + e.message); return []; }));
    });

    Object.keys(F.adaptadores).forEach(function (k) {
      var ad = F.adaptadores[k];
      if (ad.activa() && !ad.disponible().ok) notas.push(M.nombreFuente(k) + ' no consultada: ' + ad.disponible().nota);
    });

    return Promise.all(tareas).then(function (listas) {
      var todos = [];
      listas.forEach(function (l) { todos = todos.concat(l || []); });
      var notasFuentes = notas.concat(F._notas);
      F._notas = [];
      return { candidatos: todos, notas: notasFuentes };
    });
  };

  global.LR.fuentes = F;
})(window);
