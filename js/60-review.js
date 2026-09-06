/* =========================================================================
   60-review.js — Bandeja de revisión (§17, §27, §46)
   Aquí decide la persona, no el sistema. Cada acción queda registrada con
   fecha y motivo para que el documento final sea auditable.
   ========================================================================= */
(function (global) {
  'use strict';

  var U = global.LR.util, M = global.LR.model, X = global.LR.matching;
  var R = {};

  R.cola = function (filtro) {
    var regs = M.estado.registros.filter(function (r) {
      if (!r.revision.enCola && r.estado !== 'REVISIÓN' && r.estado !== 'SIN RESULTADO') return false;
      if (filtro && filtro.motivo && r.revision.motivos.indexOf(filtro.motivo) === -1) return false;
      if (filtro && filtro.severidad && (r.revision.severidad || 'media') !== filtro.severidad) return false;
      return true;
    });
    var orden = { alta: 0, media: 1, baja: 2 };
    return regs.sort(function (a, b) {
      var sa = orden[a.revision.severidad || 'media'], sb = orden[b.revision.severidad || 'media'];
      if (sa !== sb) return sa - sb;
      return a.confianza - b.confianza;
    });
  };

  R.resumenMotivos = function () {
    var m = {};
    M.estado.registros.forEach(function (r) {
      if (!r.revision.enCola) return;
      r.revision.motivos.forEach(function (x) { m[x] = (m[x] || 0) + 1; });
    });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).map(function (k) { return { motivo: k, total: m[k] }; });
  };

  function anotar(reg, texto) {
    M.observar(reg, texto, false);
    reg.revision.resuelto_en = U.ahora();
    reg.actualizado = U.ahora();
    M.guardarDiferido();
  }

  /* ---------- acciones (§17) ---------- */

  R.confirmarCandidato = function (reg, candidatoId) {
    var c = reg.candidatos.filter(function (x) { return x.id === candidatoId; })[0];
    if (!c) return false;
    return X._cerrar(reg, c, reg.candidatos).then(function () {
      anotar(reg, 'Edición seleccionada manualmente: ' + (c.datos.editorial || 'editorial no declarada') +
        ', ' + (c.datos.anio || 'año no declarado') + ' (' + c.fuente_nombre + ').');
      reg.estado = 'IDENTIFICADO';
      return true;
    });
  };

  R.conservarValor = function (reg, campo, fuente) {
    var ev = M.evidenciasDe(reg, campo).filter(function (e) { return e.fuente === fuente; })[0];
    if (!ev) return false;
    M.fijarCampo(reg, campo, ev.valor, fuente, ev.confianza, 'Elegido en revisión: se conserva el valor de ' + ev.fuente_nombre + '.', true);
    anotar(reg, 'En "' + campo + '" se conserva el valor de ' + ev.fuente_nombre + '.');
    return true;
  };

  R.capturaManual = function (reg, campo, valor) {
    M.fijarCampo(reg, campo, valor, 'manual', 100, 'Capturado manualmente durante la revisión.');
    M.registrarEvidencia(reg, campo, valor, 'manual', 100, 'Revisión manual');
    anotar(reg, 'Campo "' + campo + '" capturado manualmente.');
    return true;
  };

  R.resolverConflicto = function (reg, conflictoId, valorElegido, nota) {
    var c = reg.conflictos.filter(function (x) { return x.id === conflictoId; })[0];
    if (!c) return false;
    c.resolucion = nota || ('Se optó por: ' + valorElegido);
    c.resuelto_en = U.ahora();
    if (valorElegido) {
      var ev = M.evidenciasDe(reg, c.campo).filter(function (e) { return e.valor === valorElegido; })[0];
      M.fijarCampo(reg, c.campo, valorElegido, ev ? ev.fuente : 'manual', ev ? ev.confianza : 100,
        'Conflicto resuelto en revisión. ' + (nota || ''), true);
    }
    anotar(reg, 'Conflicto en "' + c.campo + '" resuelto: ' + c.resolucion);
    R.recalcularEstado(reg);
    return true;
  };

  R.dejarPendiente = function (reg, nota) {
    reg.revision.enCola = true;
    reg.estado = 'REVISIÓN';
    anotar(reg, 'Se deja pendiente: ' + (nota || 'requiere el ejemplar físico o la página legal.'));
    return true;
  };

  R.marcarNoIdentificado = function (reg, nota) {
    reg.estado = 'SIN RESULTADO';
    reg.revision.enCola = false;
    anotar(reg, 'Marcado como no identificado. ' + (nota || ''));
    return true;
  };

  R.marcarCompletado = function (reg) {
    var chk = M.checklist(reg);
    if (chk.conflictoAbierto) return { ok: false, motivo: 'Hay un conflicto sin resolver: no puede marcarse como completado.' };
    reg.estado = 'COMPLETADO';
    reg.revision.enCola = false;
    anotar(reg, 'Registro cerrado. Campos pendientes al cerrar: ' + (chk.pendientes.length ? chk.pendientes.join(', ') : 'ninguno') + '.');
    return { ok: true, pendientes: chk.pendientes };
  };

  R.quitarDeCola = function (reg, motivo) {
    reg.revision.motivos = reg.revision.motivos.filter(function (m) { return m !== motivo; });
    if (!reg.revision.motivos.length) reg.revision.enCola = false;
    R.recalcularEstado(reg);
    M.guardarDiferido();
  };

  R.recalcularEstado = function (reg) {
    reg.estado = M.estadoFinal(reg);
    return reg.estado;
  };

  /* ---------- duplicados (§17) ---------- */

  R.UMBRAL_DUPLICADO = 0.93;
  R.TOPE_PANTALLA = 60;   // lo que la pantalla llega a mostrar de una vez

  // La pantalla de Revisión se repinta cada vez que se toca un filtro, y volver
  // a cruzar el acervo entero en cada repintado es trabajo tirado: los pares no
  // cambian si no cambió ningún registro. La firma se calcula recorriendo la
  // lista una vez, que es despreciable al lado del cruce.
  var memoDup = { firma: '', limite: 0, pares: null };

  function firmaAcervo(regs) {
    var ultima = '';
    for (var i = 0; i < regs.length; i++) {
      if (regs[i].actualizado > ultima) ultima = regs[i].actualizado;
    }
    return regs.length + '|' + ultima;
  }

  R.olvidarDuplicados = function () { memoDup = { firma: '', limite: 0, pares: null }; };

  R.detectarDuplicados = function (limite) {
    var regs = M.estado.registros;
    var tope = limite || Infinity;
    var firma = firmaAcervo(regs);
    if (memoDup.pares && memoDup.firma === firma && memoDup.limite >= tope) {
      return tope === Infinity ? memoDup.pares : memoDup.pares.slice(0, tope);
    }
    var pares = R._cruzarDuplicados(regs, tope);
    memoDup = { firma: firma, limite: tope, pares: pares };
    return pares;
  };

  // Antes comparaba cada registro contra todos los demás: con 704 libros eran
  // casi un cuarto de millón de comparaciones y la pantalla de Revisión se
  // quedaba congelada más de tres segundos cada vez que se pintaba. Ahora los
  // ISBN se resuelven por tabla y los títulos solo se comparan dentro de la
  // franja de longitud donde la similitud puede alcanzar el umbral. La poda es
  // exacta: no se pierde ningún par que el recorrido completo habría hallado.
  R._cruzarDuplicados = function (regs, tope) {
    var pares = [];
    var porIsbn = Object.create(null), porLongitud = Object.create(null);
    var relativa = U.LONGITUD_RELATIVA(R.UMBRAL_DUPLICADO);
    var i, r, t;

    for (i = 0; i < regs.length; i++) {
      r = regs[i];
      var isbn = M.isbnCanonico(r);
      if (isbn) {
        var k = U.isbn.a13(isbn) || U.isbn.limpiar(isbn);
        if (k) (porIsbn[k] = porIsbn[k] || []).push(r);
      }
      t = U.norm(M.valor(r, 'titulo') || (r.crudo && r.crudo.titulo) || '');
      if (t) (porLongitud[t.length] = porLongitud[t.length] || []).push({ reg: r, n: t.length, orden: i });
    }

    var yaPar = Object.create(null);
    function anotarPar(a, b, motivo) {
      if (a.id === b.id) return;
      var clave = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
      if (yaPar[clave]) return;
      yaPar[clave] = true;
      pares.push({ a: a, b: b, motivo: motivo });
    }

    Object.keys(porIsbn).forEach(function (k) {
      var grupo = porIsbn[k];
      for (var x = 0; x < grupo.length; x++) {
        for (var y = x + 1; y < grupo.length; y++) anotarPar(grupo[x], grupo[y], 'Mismo ISBN');
      }
    });

    var todos = [];
    Object.keys(porLongitud).forEach(function (L) { todos = todos.concat(porLongitud[L]); });
    todos.sort(function (a, b) { return a.orden - b.orden; });

    for (i = 0; i < todos.length && pares.length < tope; i++) {
      var base = todos[i];
      var lo = Math.max(1, Math.floor(base.n * relativa)), hi = Math.ceil(base.n / relativa);
      for (var L = lo; L <= hi; L++) {
        var cubo = porLongitud[L];
        if (!cubo) continue;
        for (var j = 0; j < cubo.length; j++) {
          if (pares.length >= tope) return pares;
          var otro = cubo[j];
          if (otro.orden <= base.orden) continue;          // cada par una sola vez
          var ia = M.isbnCanonico(base.reg), ib = M.isbnCanonico(otro.reg);
          if (ia && ib && U.isbn.equivalentes(ia, ib)) continue;   // ya salió por ISBN
          var sim = U.similitudAlMenos(
            M.valor(base.reg, 'titulo') || base.reg.crudo.titulo,
            M.valor(otro.reg, 'titulo') || otro.reg.crudo.titulo,
            R.UMBRAL_DUPLICADO);
          if (sim) anotarPar(base.reg, otro.reg, 'Título casi idéntico (' + Math.round(sim * 100) + '%)');
        }
      }
    }
    return pares;
  };

  // Fusiona dos registros conservando ambas procedencias: los ejemplares
  // repetidos siguen contando, pero la ficha bibliográfica es una sola.
  R.fusionar = function (regDestino, regOrigen) {
    regOrigen.entradas.forEach(function (e) { regDestino.entradas.push(e); });
    regOrigen.evidencias.forEach(function (e) {
      M.registrarEvidencia(regDestino, e.campo, e.valor, e.fuente, e.confianza, e.referencia);
    });
    if (regOrigen.fisico.estado_fisico && !regDestino.fisico.notas) {
      regDestino.fisico.notas = 'Segundo ejemplar: ' + regOrigen.fisico.estado_fisico;
    }
    M.observar(regDestino, 'Se fusionó con otro registro del mismo libro (ejemplares: ' + regDestino.entradas.length + ').');
    M.estado.registros = M.estado.registros.filter(function (r) { return r.id !== regOrigen.id; });
    global.LR.importar.renumerar();
    M.guardarDiferido();
    return regDestino;
  };

  global.LR.revision = R;
})(window);
