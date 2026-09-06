/* =========================================================================
   00-util.js — Utilidades base
   Normalización (§8), validación y equivalencia de ISBN, similitud de
   cadenas, helpers de DOM, cola de red con backoff (§25).
   No contiene lógica bibliográfica: solo herramientas reutilizables.
   ========================================================================= */
(function (global) {
  'use strict';

  var U = {};

  /* ---------- texto ---------- */

  U.sinDiacriticos = function (s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  // Forma de búsqueda: minúsculas, sin diacríticos, sin puntuación, espacios simples.
  // Se memoiza porque el mismo título se normaliza cientos de veces al comparar
  // el acervo consigo mismo, y normalizar es lo más caro de esa comparación.
  // La caché tiene tope para no crecer sin límite en lotes grandes.
  var memoNorm = Object.create(null), memoNormN = 0;
  var MEMO_NORM_MAX = 20000;

  U.normSinCache = function (s) {
    return U.sinDiacriticos(s)
      .toLowerCase()
      .replace(/[’'`´]/g, '')
      .replace(/[^a-z0-9ñ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  U.norm = function (s) {
    var clave = String(s == null ? '' : s);
    if (clave.length > 300) return U.normSinCache(clave);   // reseñas: no vale cachearlas
    var v = memoNorm[clave];
    if (v !== undefined) return v;
    v = U.normSinCache(clave);
    if (memoNormN >= MEMO_NORM_MAX) { memoNorm = Object.create(null); memoNormN = 0; }
    memoNorm[clave] = v; memoNormN++;
    return v;
  };

  // Limpieza mínima que conserva el valor humano (no destruye el original).
  U.limpia = function (s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  };

  U.tokens = function (s) {
    var t = U.norm(s).split(' ').filter(Boolean);
    return t.filter(function (w) { return w.length > 2 || /^\d+$/.test(w); });
  };

  var VACIAS = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'o', 'a', 'en', 'que', 'the', 'of'];
  U.tokensSignificativos = function (s) {
    return U.tokens(s).filter(function (w) { return VACIAS.indexOf(w) === -1; });
  };

  // Los bigramas de un título se recalculan una vez por cada comparación en la
  // que participa. Se guardan por cadena ya normalizada, con el mismo tope que
  // la caché de normalización.
  var memoBi = Object.create(null), memoBiN = 0;

  function bigramas(s) {
    var m = memoBi[s];
    if (m !== undefined) return m;
    m = { mapa: Object.create(null), total: 0 };
    for (var i = 0; i < s.length - 1; i++) {
      var g = s.substr(i, 2);
      m.mapa[g] = (m.mapa[g] || 0) + 1;
      m.total++;
    }
    if (s.length <= 300) {
      if (memoBiN >= MEMO_NORM_MAX) { memoBi = Object.create(null); memoBiN = 0; }
      memoBi[s] = m; memoBiN++;
    }
    return m;
  }

  // Similitud de Dice sobre bigramas: 0..1
  U.similitud = function (a, b) {
    a = U.norm(a); b = U.norm(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    var ba = bigramas(a), bb = bigramas(b), inter = 0, k;
    var chico = ba.total <= bb.total ? ba : bb, grande = chico === ba ? bb : ba;
    for (k in chico.mapa) {
      if (grande.mapa[k]) inter += Math.min(chico.mapa[k], grande.mapa[k]);
    }
    return (2 * inter) / (ba.total + bb.total);
  };

  // Comparar 700 títulos contra 700 son medio millón de comparaciones y la
  // pantalla se congelaba varios segundos. La similitud de Dice está acotada
  // por la diferencia de longitud: con na y nb bigramas, nunca puede pasar de
  // 2·min/(na+nb). Si esa cota ya queda por debajo del mínimo pedido, la pareja
  // se descarta sin calcular nada. La poda es exacta: no puede perder ninguna
  // coincidencia que el cálculo completo sí habría encontrado.
  U.LONGITUD_RELATIVA = function (minimo) { return minimo / (2 - minimo); };

  U.similitudAlMenos = function (a, b, minimo) {
    var x = U.norm(a), y = U.norm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    var na = x.length - 1, nb = y.length - 1;
    if (na < 1 || nb < 1) return 0;
    if (2 * Math.min(na, nb) / (na + nb) < minimo) return 0;   // imposible alcanzarlo
    var s = U.similitud(x, y);
    return s >= minimo ? s : 0;
  };

  /* ---------- ISBN (§8.1) ---------- */

  U.isbn = {};

  U.isbn.limpiar = function (s) {
    return String(s == null ? '' : s).toUpperCase().replace(/[^0-9X]/g, '');
  };

  U.isbn.valido10 = function (s) {
    s = U.isbn.limpiar(s);
    if (s.length !== 10) return false;
    var suma = 0;
    for (var i = 0; i < 9; i++) {
      if (!/[0-9]/.test(s[i])) return false;
      suma += (10 - i) * parseInt(s[i], 10);
    }
    var ult = s[9] === 'X' ? 10 : parseInt(s[9], 10);
    if (isNaN(ult)) return false;
    return (suma + ult) % 11 === 0;
  };

  U.isbn.valido13 = function (s) {
    s = U.isbn.limpiar(s);
    if (s.length !== 13 || /X/.test(s)) return false;
    var suma = 0;
    for (var i = 0; i < 12; i++) suma += parseInt(s[i], 10) * (i % 2 === 0 ? 1 : 3);
    var dv = (10 - (suma % 10)) % 10;
    return dv === parseInt(s[12], 10);
  };

  U.isbn.a13 = function (s) {
    s = U.isbn.limpiar(s);
    if (s.length === 13) return s;
    if (s.length !== 10) return '';
    var base = '978' + s.substring(0, 9), suma = 0;
    for (var i = 0; i < 12; i++) suma += parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
    return base + String((10 - (suma % 10)) % 10);
  };

  U.isbn.a10 = function (s) {
    s = U.isbn.limpiar(s);
    if (s.length === 10) return s;
    if (s.length !== 13 || s.substring(0, 3) !== '978') return '';
    var base = s.substring(3, 12), suma = 0;
    for (var i = 0; i < 9; i++) suma += (10 - i) * parseInt(base[i], 10);
    var r = (11 - (suma % 11)) % 11;
    return base + (r === 10 ? 'X' : String(r));
  };

  // Devuelve todo lo que se sabe de un ISBN sin destruir el original (§8.1).
  U.isbn.analizar = function (original) {
    var limpio = U.isbn.limpiar(original);
    var r = {
      original: U.limpia(original), normalizado: limpio,
      isbn10: '', isbn13: '', valido: false, nota: ''
    };
    if (!limpio) return r;
    if (limpio.length === 10) {
      r.valido = U.isbn.valido10(limpio);
      r.isbn10 = limpio;
      r.isbn13 = U.isbn.a13(limpio);
      if (!r.valido) r.nota = 'Dígito de control ISBN-10 no verifica';
    } else if (limpio.length === 13) {
      r.valido = U.isbn.valido13(limpio);
      r.isbn13 = limpio;
      r.isbn10 = U.isbn.a10(limpio);
      if (!r.valido) r.nota = 'Dígito de control ISBN-13 no verifica';
    } else {
      r.nota = 'Longitud no estándar (' + limpio.length + ' caracteres)';
    }
    return r;
  };

  // Dos ISBN son equivalentes si comparten forma de 13 (§5.3: ISBN-10/13 no es contradicción).
  U.isbn.equivalentes = function (a, b) {
    var x = U.isbn.limpiar(a), y = U.isbn.limpiar(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return (U.isbn.a13(x) || x) === (U.isbn.a13(y) || y);
  };

  U.isbn.buscarEnTexto = function (texto) {
    var out = [], re = /(?:ISBN[\s:-]*)?((?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx])/g, m;
    while ((m = re.exec(String(texto || '')))) {
      var c = U.isbn.limpiar(m[1]);
      if ((c.length === 10 && U.isbn.valido10(c)) || (c.length === 13 && U.isbn.valido13(c))) {
        if (out.indexOf(c) === -1) out.push(c);
      }
    }
    return out;
  };

  /* ---------- año ---------- */

  // El tope se calcula, no se escribe: un rango fijo hasta 2049 habría dejado
  // de reconocer años válidos sin avisar. Se admite el año siguiente al actual
  // porque las ediciones se fechan por adelantado.
  U.ANIO_MAX = new Date().getFullYear() + 1;
  U.anio = function (v) {
    var s = String(v == null ? '' : v), re = /\b(1[5-9]\d{2}|2\d{3})\b/g, m;
    while ((m = re.exec(s))) {
      var n = parseInt(m[1], 10);
      if (n >= 1500 && n <= U.ANIO_MAX) return m[1];
    }
    return '';
  };

  /* ---------- identificadores y fechas ---------- */

  var contador = 0;
  U.uid = function (pre) {
    contador++;
    return (pre || 'id') + '-' + Date.now().toString(36) + '-' + contador.toString(36);
  };

  U.ahora = function () { return new Date().toISOString(); };

  U.fecha = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  };

  /* ---------- DOM ---------- */

  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.$ = function (sel, raiz) { return (raiz || document).querySelector(sel); };
  U.$$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); };

  U.el = function (tag, attrs, hijos) {
    var n = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') n.addEventListener(k.substring(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    (hijos || []).forEach(function (h) {
      if (h == null) return;
      n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
    });
    return n;
  };

  U.vaciar = function (n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; };

  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms || 300);
    };
  };

  U.descargar = function (blob, nombre) {
    var url = URL.createObjectURL(blob);
    var a = U.el('a', { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  };

  U.dormir = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---------- carga perezosa de bibliotecas externas ---------- */

  var cargadas = {};
  // Mide una imagen ya descargada para conservar su proporción real al
  // incrustarla en el documento. Si el navegador no puede medirla, devuelve
  // ceros y quien exporta usa una proporción de respaldo.
  U.medirImagen = function (dataUrl) {
    return new Promise(function (res) {
      if (!dataUrl || typeof Image === 'undefined') return res({ ancho: 0, alto: 0 });
      var img = new Image(), listo = false;
      var t = setTimeout(function () { if (!listo) { listo = true; res({ ancho: 0, alto: 0 }); } }, 4000);
      img.onload = function () {
        if (listo) return;
        listo = true; clearTimeout(t);
        res({ ancho: img.naturalWidth || img.width || 0, alto: img.naturalHeight || img.height || 0 });
      };
      img.onerror = function () {
        if (listo) return;
        listo = true; clearTimeout(t);
        res({ ancho: 0, alto: 0 });
      };
      img.src = dataUrl;
    });
  };

  U.cargarScript = function (url, globalEsperado) {
    if (globalEsperado && global[globalEsperado]) return Promise.resolve(global[globalEsperado]);
    if (cargadas[url]) return cargadas[url];
    cargadas[url] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () {
        if (globalEsperado && !global[globalEsperado]) {
          delete cargadas[url];   // permite reintentar en la siguiente exportación
          rej(new Error('Se cargó ' + url + ' pero no expone ' + globalEsperado));
        }
        else res(globalEsperado ? global[globalEsperado] : true);
      };
      s.onerror = function () {
        delete cargadas[url];
        rej(new Error('No se pudo cargar ' + url + '. Revisa la conexión o usa la versión local de la biblioteca.'));
      };
      document.head.appendChild(s);
    });
    return cargadas[url];
  };

  /* ---------- cola de red con límite y backoff (§25) ---------- */

  U.red = {
    concurrencia: 3,
    esperaMin: 220,      // ms entre peticiones a la misma fuente
    reintentos: 2,
    _activos: 0,
    _cola: [],
    _ultimo: {},
    estadisticas: { peticiones: 0, errores: 0, desdeCache: 0 }
  };

  U.red.encolar = function (fuente, tarea) {
    return new Promise(function (res, rej) {
      U.red._cola.push({ fuente: fuente, tarea: tarea, res: res, rej: rej, intento: 0 });
      U.red._bombear();
    });
  };

  U.red._bombear = function () {
    while (U.red._activos < U.red.concurrencia && U.red._cola.length) {
      var t = U.red._cola.shift();
      U.red._ejecutar(t);
    }
  };

  U.red._ejecutar = function (t) {
    U.red._activos++;
    var ultimo = U.red._ultimo[t.fuente] || 0;
    var espera = Math.max(0, U.red.esperaMin - (Date.now() - ultimo));
    U.dormir(espera).then(function () {
      U.red._ultimo[t.fuente] = Date.now();
      U.red.estadisticas.peticiones++;
      return t.tarea();
    }).then(function (v) {
      U.red._activos--;
      t.res(v);
      U.red._bombear();
    }).catch(function (e) {
      U.red._activos--;
      if (t.intento < U.red.reintentos) {
        t.intento++;
        var espera2 = 500 * Math.pow(2, t.intento);
        setTimeout(function () { U.red._cola.unshift(t); U.red._bombear(); }, espera2);
        // El hueco que dejó la tarea que falló se ocupa ya, sin esperar al
        // reintento: si no, dos fallos con la concurrencia llena paraban el
        // lote entero durante segundos aunque hubiera trabajo listo.
        U.red._bombear();
      } else {
        U.red.estadisticas.errores++;
        t.rej(e);
        U.red._bombear();
      }
    });
  };

  U.pendientesRed = function () { return U.red._cola.length + U.red._activos; };

  /* ---------- fetch con tiempo límite ---------- */

  U.traer = function (url, opciones) {
    opciones = opciones || {};
    var ms = opciones.timeout || 20000;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var op = { method: opciones.method || 'GET', headers: opciones.headers || {} };
    if (ctrl) op.signal = ctrl.signal;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    return fetch(url, op).then(function (r) {
      clearTimeout(t);
      if (!r.ok) {
        // El mensaje que se ve va a parar a las observaciones del registro, y
        // ahí acaba en la columna del inventario. Antes llevaba la URL entera
        // —con el título codificado dentro— y una sola incidencia ocupaba
        // doscientos caracteres, repetidos en cada libro. Aquí queda el dato
        // que sirve para entender qué pasó; la URL se guarda aparte, para
        // diagnóstico, sin ensuciar lo que se imprime.
        var err = new Error('HTTP ' + r.status);
        err.status = r.status;
        err.url = url;
        // 429 = se agotó la cuota de consultas de esa fuente. No es un fallo
        // del libro ni de la conexión: es un límite que se levanta con el tiempo.
        err.cuotaAgotada = (r.status === 429);
        var reintentar = r.headers && r.headers.get && r.headers.get('Retry-After');
        if (reintentar) err.reintentarEn = reintentar;
        throw err;
      }
      return opciones.tipo === 'texto' ? r.text() : (opciones.tipo === 'blob' ? r.blob() : r.json());
    }, function (e) {
      clearTimeout(t);
      throw e;
    });
  };

  U.blobADataUrl = function (blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error('No se pudo leer la imagen')); };
      fr.readAsDataURL(blob);
    });
  };

  global.LR = global.LR || {};
  global.LR.util = U;
})(window);
