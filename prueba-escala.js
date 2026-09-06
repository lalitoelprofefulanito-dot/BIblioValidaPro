const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const raiz=__dirname;
const dom=new JSDOM(fs.readFileSync(path.join(raiz,'index.html'),'utf8'),{runScripts:'outside-only',url:'https://e.test/',pretendToBeVisual:true});
const w=dom.window; w.fetch=async()=>{throw new Error('x')}; w.FileReader=w.FileReader||class{};
['data/taxonomia-curricular.js', 'data/clasificador-sep.js','data/sep-catalogo-pdf-1986-2006.js','data/sep-catalogo-primaria.js','js/00-util.js','js/10-model.js','js/20-import.js','js/30-sources.js','js/50-sep.js','js/40-matching.js','js/60-review.js','js/70-export.js','js/80-ui.js'].forEach(f=>w.eval(fs.readFileSync(path.join(raiz,f),'utf8')));
const LR=w.LR,M=LR.model,I=LR.importar,R=LR.revision,S=LR.sep;

// Acervo realista: 704 registros tomados del catálogo histórico real
const fichas = w.SEP_CATALOGO_PRIMARIA.slice(0, 704);
M.estado.registros = fichas.map((f,i)=>{
  const r = M.nuevoRegistro({titulo:f.titulo, autor:f.autor||'', isbn:f.isbn||''}, {tipo:'tabla',origen:'inventario'});
  r.n=i+1; M.fijarCampo(r,'titulo',f.titulo,'sep',90,''); 
  if(f.isbn) M.fijarCampo(r,'isbn',f.isbn,'sep',90,'');
  return r;
});
console.log('Acervo de prueba:', M.estado.registros.length, 'registros\n');

let t=Date.now();
const dup = R.detectarDuplicados();
console.log('  detectarDuplicados() ..............', (Date.now()-t)+' ms', '('+dup.length+' pares)');
console.log('  → se ejecuta en CADA pintado de la pantalla Revisión');

// importar otro lote de 300 sobre el acervo existente
const nuevos = w.SEP_CATALOGO_PRIMARIA.slice(704,1004).map(f=>({
  crudo:{titulo:f.titulo,autor:f.autor||'',isbn:f.isbn||''},
  entrada:{tipo:'tabla',origen:'lote nuevo',fecha:'',detalle:''}
}));
t=Date.now();
let n=0; nuevos.forEach(m=>{ if(I.buscarSimilar(m.crudo,M.estado.registros)) n++; });
console.log('  buscarSimilar × 300 sobre 704 .....', (Date.now()-t)+' ms', '('+n+' coincidencias)');
console.log('  → la pantalla Importar lo corre una vez para contar, y otra al integrar\n');

t=Date.now(); S.buscar('El delfín','','',5); 
const uno=Date.now()-t;
t=Date.now(); for(let i=0;i<100;i++) S.buscar(w.SEP_CATALOGO_PRIMARIA[i].titulo,'','',5);
console.log('  S.buscar × 100 en 3213 fichas .....', (Date.now()-t)+' ms');
