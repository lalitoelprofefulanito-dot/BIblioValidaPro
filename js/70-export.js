/* =========================================================================
   70-export.js — Exportación (§32, §33, §34, §35)
   El documento lleva la portada incrustada cuando se pudo descargar y
   declara su estado cuando no. La numeración de páginas empieza después
   de la portada del documento.
   ========================================================================= */
(function (global) {
  'use strict';

  var U = global.LR.util, M = global.LR.model;
  var E = {};

  E.CDN = {
    docx: 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',
    xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
  };

  /* ---------- ficha lista para exportar ---------- */

  E.ficha = function (reg) {
    var chk = M.checklist(reg);
    return {
      n: reg.n,
      titulo: M.valor(reg, 'titulo') || U.limpia(reg.crudo.titulo) || 'Sin título legible',
      autor: M.valor(reg, 'autor'),
      editorial: M.valor(reg, 'editorial'),
      anio: M.valor(reg, 'anio'),
      isbn: M.isbnCanonico(reg),
      isbn10: M.valor(reg, 'isbn10') || U.limpia(reg.crudo.isbn10),
      ubicacion: M.valor(reg, 'ubicacion') || U.limpia(reg.crudo.ubicacion),
      codigo_bv: M.valor(reg, 'codigo_bv') || U.limpia(reg.crudo.codigo_bv),
      procedencia: M.procedencia(reg),
      isbn13: M.valor(reg, 'isbn13') || U.limpia(reg.crudo.isbn13),
      estado_fisico: reg.fisico.estado_fisico || 'Pendiente',
      resena: M.valor(reg, 'resena'),
      grado: M.valor(reg, 'grado'),
      tipo_texto: M.valor(reg, 'tipo_texto'),
      categoria_sep: M.valor(reg, 'categoria_sep'),
      color: M.valor(reg, 'color'),
      observaciones: M.observacionesTexto(reg),
      subserie: M.valor(reg, 'subserie'),
      contenidos_saberes: M.valor(reg, 'contenidos_saberes'),
      portadaUrl: reg.portada.url,
      portadaDataUrl: reg.portada.dataUrl,
      portadaAncho: reg.portada.ancho || 0,
      portadaAlto: reg.portada.alto || 0,
      portadaEstado: reg.portada.url
        ? (reg.portada.verificada ? 'Portada verificada · ' + M.nombreFuente(reg.portada.fuente) : 'Portada no verificada · ' + M.nombreFuente(reg.portada.fuente))
        : 'Sin portada localizada',
      estado: reg.estado,
      confianza: reg.confianza,
      pendientes: chk.pendientes,
      conflictoAbierto: chk.conflictoAbierto
    };
  };

  E.seleccion = function (criterio) {
    var regs = M.estado.registros;
    if (criterio === 'confirmados') {
      // Un conflicto abierto descalifica al registro aunque su estado diga
      // confirmado: el documento no debe presentar como cierto lo que está en disputa.
      return regs.filter(function (r) {
        return ['CONFIRMADO', 'COMPLETADO'].indexOf(r.estado) > -1 &&
          !r.conflictos.some(function (c) { return !c.resolucion; });
      });
    }
    if (criterio === 'sin-conflicto') {
      return regs.filter(function (r) { return !r.conflictos.some(function (c) { return !c.resolucion; }); });
    }
    return regs;
  };

  E.descargarPortadas = function (registros, alAvanzar) {
    var i = 0;
    function sig() {
      if (i >= registros.length) return Promise.resolve(true);
      var r = registros[i];
      if (alAvanzar) alAvanzar(i + 1, registros.length, M.valor(r, 'titulo'));
      return global.LR.matching.descargarPortada(r).catch(function () { return null; }).then(function () {
        i++;
        return sig();
      });
    }
    return sig();
  };

  function dataUrlABytes(dataUrl) {
    var base64 = String(dataUrl).split(',')[1] || '';
    var bin = atob(base64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  // Las portadas no son todas del mismo formato: un álbum apaisado deformado
  // a proporción de novela es un dato falso sobre el libro. Se respeta la
  // proporción real y se limita el alto para que quepa la ficha completa.
  var ALTO_MAX = 265, ANCHO_MAX = 200;
  function medidaPortada(ancho, alto) {
    if (!ancho || !alto) return { width: 190, height: ALTO_MAX };
    var escala = Math.min(ANCHO_MAX / ancho, ALTO_MAX / alto);
    return { width: Math.round(ancho * escala), height: Math.round(alto * escala) };
  }

  /* ---------- Word (§32, §33) ---------- */

  E.aDocx = function (registros, opciones) {
    opciones = opciones || {};
    return U.cargarScript(E.CDN.docx, 'docx').then(function (docx) {
      var P = docx.Paragraph, T = docx.TextRun;

      function titulo(texto, nivel) {
        return new P({ text: texto, heading: nivel || docx.HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });
      }
      function campo(etiqueta, valor) {
        return new P({
          spacing: { after: 60 },
          children: [new T({ text: etiqueta + ': ', bold: true }), new T({ text: String(valor || '—') })]
        });
      }

      // Portada del documento: sin numeración (la numeración empieza después).
      var portadaDoc = [
        new P({ text: '', spacing: { after: 1400 } }),
        new P({
          alignment: docx.AlignmentType.CENTER,
          children: [new T({ text: opciones.titulo || 'Catálogo bibliográfico del acervo', bold: true, size: 40 })]
        }),
        new P({
          alignment: docx.AlignmentType.CENTER, spacing: { before: 200 },
          children: [new T({ text: M.estado.config.escuela || '', size: 26 })]
        }),
        new P({
          alignment: docx.AlignmentType.CENTER, spacing: { before: 120 },
          children: [new T({ text: 'Libros del Rincón · Ciclo ' + (M.estado.config.cicloTrabajo || ''), size: 24 })]
        }),
        new P({
          alignment: docx.AlignmentType.CENTER, spacing: { before: 800 },
          children: [new T({ text: (M.estado.config.responsable ? M.estado.config.responsable + ' · ' : '') + new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }), size: 22 })]
        }),
        new P({
          alignment: docx.AlignmentType.CENTER, spacing: { before: 200 },
          children: [new T({ text: registros.length + ' fichas', size: 22, italics: true })]
        })
      ];

      var cuerpo = [];
      registros.forEach(function (reg, idx) {
        var f = E.ficha(reg);
        if (idx > 0) cuerpo.push(new P({ children: [new docx.PageBreak()] }));

        if (f.portadaDataUrl) {
          try {
            var med = medidaPortada(f.portadaAncho, f.portadaAlto);
            cuerpo.push(new P({
              alignment: docx.AlignmentType.CENTER,
              children: [new docx.ImageRun({ data: dataUrlABytes(f.portadaDataUrl), transformation: med })]
            }));
          } catch (e) {
            cuerpo.push(new P({ children: [new T({ text: 'La imagen de portada no pudo incrustarse.', italics: true })] }));
          }
        } else {
          cuerpo.push(new P({
            alignment: docx.AlignmentType.CENTER,
            children: [new T({ text: '[ ' + f.portadaEstado + ' ]', italics: true, color: '767676' })]
          }));
          if (f.portadaUrl) {
            cuerpo.push(new P({
              alignment: docx.AlignmentType.CENTER,
              children: [new T({ text: 'Imagen disponible en: ' + f.portadaUrl, size: 16, color: '767676' })]
            }));
          }
        }
        cuerpo.push(new P({
          alignment: docx.AlignmentType.CENTER, spacing: { after: 200 },
          children: [new T({ text: f.portadaEstado, size: 16, color: '767676' })]
        }));

        cuerpo.push(titulo(f.n + '. ' + f.titulo, docx.HeadingLevel.HEADING_2));
        cuerpo.push(campo('Autor', f.autor));
        cuerpo.push(campo('Editorial', f.editorial));
        cuerpo.push(campo('Año', f.anio));
        if (f.isbn10) cuerpo.push(campo('ISBN-10', f.isbn10));
        if (f.isbn13) cuerpo.push(campo('ISBN-13', f.isbn13));
        if (!f.isbn10 && !f.isbn13 && f.isbn) cuerpo.push(campo('ISBN', f.isbn));
        cuerpo.push(campo('Estado físico', f.estado_fisico));
        cuerpo.push(campo('Reseña del libro', f.resena));
        cuerpo.push(campo('Grado', f.grado));
        cuerpo.push(campo('Tipo de texto', f.tipo_texto));
        cuerpo.push(campo('Categoría SEP', f.categoria_sep));
        cuerpo.push(campo('Color', f.color));
        cuerpo.push(campo('Subserie (SEP – Libros del Rincón)', f.subserie));
        cuerpo.push(campo('Contenidos y Saberes', f.contenidos_saberes));
        cuerpo.push(campo('Observaciones', f.observaciones));
      });

      // Anexo de auditoría (§35)
      if (opciones.auditoria !== false) {
        cuerpo.push(new P({ children: [new docx.PageBreak()] }));
        cuerpo.push(titulo('Anexo de auditoría', docx.HeadingLevel.HEADING_1));
        cuerpo.push(new P({
          text: 'Para cada ficha se registra el estado, la confianza calculada, las fuentes consultadas y los campos que quedaron pendientes.',
          spacing: { after: 200 }
        }));
        registros.forEach(function (reg) {
          var f = E.ficha(reg);
          var fuentes = {};
          reg.evidencias.forEach(function (e) { fuentes[e.fuente_nombre] = true; });
          cuerpo.push(new P({ spacing: { before: 160 }, children: [new T({ text: f.n + '. ' + f.titulo, bold: true })] }));
          cuerpo.push(new P({ children: [new T({ text: 'Estado: ' + f.estado + ' · Confianza: ' + f.confianza + '/100', size: 18 })] }));
          cuerpo.push(new P({ children: [new T({ text: 'Fuentes: ' + Object.keys(fuentes).join(', '), size: 18 })] }));
          cuerpo.push(new P({ children: [new T({ text: 'Portada: ' + f.portadaEstado + (f.portadaUrl ? ' · ' + f.portadaUrl : ''), size: 18 })] }));
          if (f.pendientes.length) cuerpo.push(new P({ children: [new T({ text: 'Pendientes: ' + f.pendientes.join(', '), size: 18 })] }));
          reg.conflictos.forEach(function (c) {
            cuerpo.push(new P({
              children: [new T({
                text: 'Conflicto (' + c.tipo + ') en ' + c.campo + ': ' +
                  c.valores.map(function (v) { return v.valor + ' [' + v.fuentes.map(function (x) { return x.fuente; }).join(', ') + ']'; }).join(' vs ') +
                  (c.resolucion ? ' — resuelto: ' + c.resolucion : ' — sin resolver'),
                size: 18, italics: true
              })]
            }));
          });
        });
      }

      var doc = new docx.Document({
        creator: M.estado.config.responsable || 'Aplicación Libros del Rincón',
        title: opciones.titulo || 'Catálogo bibliográfico del acervo',
        sections: [
          { properties: {}, children: portadaDoc },
          {
            properties: { page: { pageNumbers: { start: 1 } } },
            footers: {
              default: new docx.Footer({
                children: [new P({
                  alignment: docx.AlignmentType.CENTER,
                  children: [new T({ children: [docx.PageNumber.CURRENT], size: 18 })]
                })]
              })
            },
            children: cuerpo
          }
        ]
      });

      return docx.Packer.toBlob(doc);
    });
  };

  /* ---------- HTML imprimible (siempre disponible, sin depender de CDN) ---------- */

  E.aHtml = function (registros, opciones) {
    opciones = opciones || {};
    var partes = [];
    partes.push('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">');
    partes.push('<title>' + U.esc(opciones.titulo || 'Catálogo bibliográfico') + '</title>');
    partes.push('<style>' +
      'body{font-family:Georgia,"Times New Roman",serif;color:#1c1d21;margin:0;padding:0}' +
      '.portada{height:95vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;page-break-after:always}' +
      '.portada h1{font-size:2.2rem;margin:0 0 .6rem}.portada p{margin:.2rem;color:#4a4d55}' +
      '.ficha{page-break-after:always;padding:2.2rem 3rem;max-width:46rem;margin:0 auto}' +
      '.ficha img{display:block;margin:0 auto 0.4rem;max-height:280px;border:1px solid #d8d6cf}' +
      '.estado-portada{text-align:center;font-size:.78rem;color:#6d7079;margin-bottom:1.2rem;font-family:system-ui,sans-serif}' +
      'h2{font-size:1.3rem;margin:0 0 1rem;border-bottom:2px solid #1c1d21;padding-bottom:.35rem}' +
      'dl{margin:0}dt{font-weight:700;font-size:.82rem;font-family:system-ui,sans-serif;margin-top:.7rem}' +
      'dd{margin:.15rem 0 0;line-height:1.5}' +
      '.anexo{padding:2rem 3rem;max-width:46rem;margin:0 auto;font-size:.85rem}' +
      '.anexo h3{margin:1.2rem 0 .2rem;font-size:1rem}' +
      '@media print{.ficha,.portada{padding:1.5rem}}' +
      '</style></head><body>');

    partes.push('<div class="portada"><h1>' + U.esc(opciones.titulo || 'Catálogo bibliográfico del acervo') + '</h1>' +
      '<p>' + U.esc(M.estado.config.escuela || '') + '</p>' +
      '<p>Libros del Rincón · Ciclo ' + U.esc(M.estado.config.cicloTrabajo || '') + '</p>' +
      '<p>' + U.esc(M.estado.config.responsable || '') + '</p>' +
      '<p>' + registros.length + ' fichas · ' + new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) + '</p></div>');

    registros.forEach(function (reg) {
      var f = E.ficha(reg);
      partes.push('<section class="ficha">');
      var src = f.portadaDataUrl || f.portadaUrl;
      if (src) partes.push('<img src="' + U.esc(src) + '" alt="Portada de ' + U.esc(f.titulo) + '">');
      partes.push('<p class="estado-portada">' + U.esc(f.portadaEstado) + '</p>');
      partes.push('<h2>' + f.n + '. ' + U.esc(f.titulo) + '</h2><dl>');
      [['Autor', f.autor], ['Editorial', f.editorial], ['Año', f.anio], ['ISBN-10', f.isbn10], ['ISBN-13', f.isbn13],
       ['Estado físico', f.estado_fisico], ['Reseña del libro', f.resena], ['Grado', f.grado],
       ['Tipo de texto', f.tipo_texto], ['Categoría SEP', f.categoria_sep], ['Color', f.color],
       ['Subserie (SEP – Libros del Rincón)', f.subserie], ['Contenidos y Saberes', f.contenidos_saberes],
       ['Observaciones', f.observaciones]].forEach(function (p) {
        partes.push('<dt>' + U.esc(p[0]) + '</dt><dd>' + U.esc(p[1] || '—') + '</dd>');
      });
      partes.push('</dl></section>');
    });

    if (opciones.auditoria !== false) {
      partes.push('<section class="anexo"><h2>Anexo de auditoría</h2>');
      registros.forEach(function (reg) {
        var f = E.ficha(reg), fuentes = {};
        reg.evidencias.forEach(function (e) { fuentes[e.fuente_nombre] = true; });
        partes.push('<h3>' + f.n + '. ' + U.esc(f.titulo) + '</h3>');
        partes.push('<p>Estado: ' + U.esc(f.estado) + ' · Confianza: ' + f.confianza + '/100<br>' +
          'Fuentes: ' + U.esc(Object.keys(fuentes).join(', ')) + '<br>' +
          'Portada: ' + U.esc(f.portadaEstado) + (f.portadaUrl ? ' · ' + U.esc(f.portadaUrl) : '') +
          (f.pendientes.length ? '<br>Pendientes: ' + U.esc(f.pendientes.join(', ')) : '') + '</p>');
        reg.conflictos.forEach(function (c) {
          partes.push('<p><em>Conflicto (' + U.esc(c.tipo) + ') en ' + U.esc(c.campo) + ': ' +
            U.esc(c.valores.map(function (v) { return v.valor + ' [' + v.fuentes.map(function (x) { return x.fuente; }).join(', ') + ']'; }).join(' vs ')) +
            (c.resolucion ? ' — resuelto: ' + U.esc(c.resolucion) : ' — sin resolver') + '</em></p>');
        });
      });
      partes.push('</section>');
    }

    partes.push('</body></html>');
    return new Blob([partes.join('\n')], { type: 'text/html;charset=utf-8' });
  };

  /* ---------- Excel y CSV ---------- */

  E.tabla = function (registros) {
    var enc = M.CAMPOS_SALIDA.map(function (c) { return c.etiqueta; })
      .concat(['Estado del registro', 'Confianza', 'Estado de portada', 'URL de portada', 'Campos pendientes']);
    var filas = registros.map(function (reg) {
      var f = E.ficha(reg);
      return [f.portadaUrl ? 'Sí' : 'No', f.n, f.titulo, f.autor, f.editorial, f.anio, f.isbn10, f.isbn13,
        f.estado_fisico, f.resena, f.grado, f.tipo_texto, f.categoria_sep,
        f.contenidos_saberes, f.color, f.subserie, f.observaciones,
        f.ubicacion, f.codigo_bv, f.procedencia,
        f.estado, f.confianza, f.portadaEstado, f.portadaUrl, f.pendientes.join('; ')];
    });
    return [enc].concat(filas);
  };

  E.aXlsx = function (registros) {
    return U.cargarScript(E.CDN.xlsx, 'XLSX').then(function (XLSX) {
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(E.tabla(registros)), 'Catálogo');

      var aud = [['N°', 'Título', 'Campo', 'Valor elegido', 'Fuente', 'Confianza', 'Decisión', 'Otras fuentes']];
      registros.forEach(function (reg) {
        var t = M.valor(reg, 'titulo');
        Object.keys(reg.campos).forEach(function (c) {
          var d = reg.campos[c];
          var otras = M.evidenciasDe(reg, c).filter(function (e) { return e.valor !== d.valor; })
            .map(function (e) { return e.fuente_nombre + ': ' + e.valor; }).join(' | ');
          aud.push([reg.n, t, c, d.valor, d.fuente_nombre, d.confianza, d.decision, otras]);
        });
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aud), 'Trazabilidad');

      var conf = [['N°', 'Título', 'Tipo', 'Campo', 'Valores en conflicto', 'Impacto', 'Resolución']];
      registros.forEach(function (reg) {
        reg.conflictos.forEach(function (c) {
          conf.push([reg.n, M.valor(reg, 'titulo'), c.tipo, c.campo,
            c.valores.map(function (v) { return v.valor + ' [' + v.fuentes.map(function (x) { return x.fuente; }).join(', ') + ']'; }).join(' vs '),
            c.impacto, c.resolucion || 'sin resolver']);
        });
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(conf), 'Conflictos');

      var buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    });
  };

  // Excel interpreta como fórmula toda celda que empieza con = + @ - o tabulador.
  // En este acervo eso no es hipotético: "El delfín -¡vaya fauna!" o cualquier
  // título que arranque con guion llegaba a la hoja como #NAME? y el título se
  // perdía. Se antepone un apóstrofo, que Excel entiende como "esto es texto";
  // el valor queda íntegro y visible. Solo afecta al CSV: el XLSX ya escribe
  // estas celdas con tipo de texto y no necesita la marca.
  E.PELIGRO_FORMULA = /^[=+@\t\r]|^-(?![\d\s])/;

  E.celdaCsv = function (valor) {
    var s = String(valor == null ? '' : valor);
    if (E.PELIGRO_FORMULA.test(s)) s = "'" + s;
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  // Qué campos del acervo llevarían apóstrofo en el CSV. Sirve para avisarlo
  // con un número real en vez de una advertencia genérica. No usa E.tabla
  // porque esa construye la ficha completa de cada registro, que es caro.
  E.CAMPOS_TEXTO_LIBRE = ['titulo', 'autor', 'editorial', 'resena',
    'grado', 'tipo_texto', 'categoria_sep', 'color', 'subserie', 'contenidos_saberes'];

  E.conRiesgoDeFormula = function (registros) {
    var out = [];
    (registros || []).forEach(function (reg) {
      E.CAMPOS_TEXTO_LIBRE.forEach(function (c) {
        var v = M.valor(reg, c);
        if (v && E.PELIGRO_FORMULA.test(v)) out.push({ reg: reg, campo: c, valor: v });
      });
      var obs = M.observacionesTexto(reg);
      if (obs && E.PELIGRO_FORMULA.test(obs)) out.push({ reg: reg, campo: 'observaciones', valor: obs });
    });
    return out;
  };

  E.aCsv = function (registros) {
    var filas = E.tabla(registros).map(function (fila) {
      return fila.map(E.celdaCsv).join(',');
    });
    return new Blob(['\ufeff' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  };

  // El respaldo lleva también el puente manual: los vínculos de categoría que
  // se asignan a mano son trabajo de criterio que ninguna fuente puede
  // reconstruir, y quedaban fuera del archivo. Restaurar en otro equipo
  // significaba volver a asignarlos uno por uno.
  E.aJson = function (registros) {
    return new Blob([JSON.stringify({
      generado: U.ahora(),
      version: M.estado.meta.version,
      configuracion: M.estado.config,
      taxonomia: M.estado.taxonomia,
      puenteManual: M.estado.puenteManual,
      registros: registros
    }, null, 2)], { type: 'application/json' });
  };

  global.LR.exportar = E;
})(window);
