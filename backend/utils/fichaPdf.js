// backend/utils/fichaPdf.js
// Ficha funcional do agente em PDF, em duas versões:
//   - completa  → todos os blocos
//   - resumida  → sem saúde e sem histórico disciplinar (blocos marcados como
//                 sensíveis em fichaSchema), para uso rotineiro
// O desenho é dirigido pelo schema: campo novo em fichaSchema.js aparece aqui
// sozinho, sem alterar este arquivo.
const PDFDocument = require('pdfkit');
const { cabecalhoPDF, rodapePDF, limiteConteudoY, fmtData, NAVY } = require('./pdfLayout');
const { coletarPdfBuffer } = require('./pdfBuffer');
const { BLOCOS } = require('./fichaSchema');
const { nomeExibicao } = require('./nomeAgente');

const CINZA_FAIXA = '#eef2f7';
const VAZIO = '—';

// Blocos que entram no documento. Na versão resumida os blocos marcados como
// sensíveis (saúde e histórico disciplinar) ficam de fora — é o que separa a
// ficha de uso rotineiro da ficha completa.
function blocosDoPdf(resumida) {
  return resumida ? BLOCOS.filter(b => !b.sensivel) : BLOCOS;
}

// Rótulo de um valor de select: as opções podem ser strings simples ou pares
// { valor, rotulo } (é o caso de sexo).
function rotuloOpcao(campo, valor) {
  const opcoes = Array.isArray(campo.opcoes) ? campo.opcoes : [];
  const achado = opcoes.find(o => (typeof o === 'object' ? o.valor : o) === valor);
  if (!achado) return valor;
  return typeof achado === 'object' ? achado.rotulo : achado;
}

function valorTexto(campo, valor) {
  if (valor == null || valor === '') return VAZIO;
  if (campo.tipo === 'data')   return fmtData(valor);
  if (campo.tipo === 'select') return rotuloOpcao(campo, valor);
  return String(valor);
}

// Abre nova página se o bloco que vem a seguir não couber antes do rodapé.
function garantirEspaco(doc, altura) {
  if (doc.y + altura > limiteConteudoY(doc)) {
    doc.addPage();
    doc.y = doc.page.margins.top;
    return true;
  }
  return false;
}

function tituloBloco(doc, texto, margem, largura) {
  garantirEspaco(doc, 40);
  const y = doc.y + 6;
  doc.rect(margem, y, largura, 18).fill(CINZA_FAIXA);
  doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold')
     .text(String(texto).toUpperCase(), margem + 6, y + 5, { width: largura - 12 });
  doc.y = y + 24;
}

// Par rótulo/valor numa coluna. Devolve a altura ocupada.
function alturaPar(doc, campo, valor, largura) {
  doc.fontSize(9).font('Helvetica');
  return 11 + doc.heightOfString(valorTexto(campo, valor), { width: largura }) + 8;
}

function desenharPar(doc, campo, valor, x, y, largura) {
  doc.fillColor('#6b7280').fontSize(7).font('Helvetica-Bold')
     .text(String(campo.rotulo).toUpperCase(), x, y, { width: largura, lineBreak: false });
  doc.fillColor('#111').fontSize(9).font('Helvetica')
     .text(valorTexto(campo, valor), x, y + 10, { width: largura });
  return doc.y + 6;
}

// Tabela de uma lista (cursos, histórico funcional, equipamentos, ocorrências).
function desenharLista(doc, campo, linhas, margem, largura) {
  const dados = Array.isArray(linhas) ? linhas : [];
  garantirEspaco(doc, 46);

  doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold')
     .text(String(campo.rotulo).toUpperCase(), margem, doc.y, { width: largura });
  doc.y += 3;

  if (!dados.length) {
    doc.fillColor('#9ca3af').fontSize(9).font('Helvetica-Oblique')
       .text('Nada registrado.', margem, doc.y, { width: largura });
    doc.y += 8;
    return;
  }

  // Colunas curtas (datas, ano, carga) ficam com metade da largura das demais.
  const pesos = campo.colunas.map(c => (c.largura === 'curta' ? 1 : 2));
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  const larguras = pesos.map(p => (largura * p) / somaPesos);
  const xs = [];
  larguras.reduce((x, w) => { xs.push(x); return x + w; }, margem);

  const linhaAltura = (item, negrito) => {
    doc.fontSize(8).font(negrito ? 'Helvetica-Bold' : 'Helvetica');
    return Math.max(...campo.colunas.map((c, i) =>
      doc.heightOfString(String(item[i] ?? VAZIO), { width: larguras[i] - 6 }))) + 7;
  };

  const desenharLinha = (item, { cabecalho = false, zebra = false } = {}) => {
    const h = linhaAltura(item, cabecalho);
    if (garantirEspaco(doc, h + 4)) { /* recomeça no topo da nova página */ }
    const y = doc.y;
    if (cabecalho)   doc.rect(margem, y, largura, h).fill(CINZA_FAIXA);
    else if (zebra)  doc.rect(margem, y, largura, h).fill('#fafafa');
    doc.fillColor(cabecalho ? NAVY : '#111').fontSize(8).font(cabecalho ? 'Helvetica-Bold' : 'Helvetica');
    campo.colunas.forEach((c, i) => {
      doc.text(String(item[i] ?? VAZIO), xs[i] + 3, y + 3.5, { width: larguras[i] - 6 });
    });
    doc.y = y + h;
    doc.moveTo(margem, doc.y).lineTo(margem + largura, doc.y).lineWidth(0.3).stroke('#e5e7eb');
  };

  desenharLinha(campo.colunas.map(c => c.rotulo), { cabecalho: true });
  dados.forEach((item, idx) => {
    desenharLinha(campo.colunas.map(c => valorTexto(c, item[c.id])), { zebra: idx % 2 === 1 });
  });
  doc.y += 8;
}

// Faixa de identificação: foto à esquerda, dados principais à direita.
function faixaIdentificacao(doc, agente, margem, largura) {
  const alturaFoto = 96;
  const larguraFoto = 76;
  const y = doc.y;

  doc.rect(margem, y, larguraFoto, alturaFoto).lineWidth(0.8).stroke('#c8d2e0');
  const base64 = String(agente.foto || '').split(',')[1];
  if (base64) {
    try {
      doc.image(Buffer.from(base64, 'base64'), margem + 1.5, y + 1.5,
        { fit: [larguraFoto - 3, alturaFoto - 3], align: 'center', valign: 'center' });
    } catch { /* foto ilegível — mantém só a moldura */ }
  } else {
    doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
       .text('SEM FOTO', margem, y + alturaFoto / 2 - 4, { width: larguraFoto, align: 'center' });
  }

  const x = margem + larguraFoto + 14;
  const w = largura - larguraFoto - 14;
  doc.fillColor(NAVY).fontSize(15).font('Helvetica-Bold')
     .text(nomeExibicao(agente), x, y + 4, { width: w });
  doc.fillColor('#333').fontSize(10).font('Helvetica')
     .text(agente.cargo || VAZIO, x, doc.y + 1, { width: w });

  const linhas = [
    ['Matrícula', agente.matricula || VAZIO],
    ['Lotação',   agente.lotacao   || VAZIO],
    ['Situação',  agente.ativo ? 'Ativo no efetivo' : 'Inativo'],
  ];
  let ly = doc.y + 6;
  linhas.forEach(([rot, val]) => {
    doc.fillColor('#6b7280').fontSize(8).font('Helvetica-Bold')
       .text(`${rot}: `, x, ly, { continued: true })
       .fillColor('#111').font('Helvetica').text(val);
    ly = doc.y + 1;
  });

  doc.y = y + alturaFoto + 10;
}

// Assinatura do agente com a declaração de veracidade (como na ficha em papel).
function declaracaoEAssinatura(doc, margem, largura) {
  garantirEspaco(doc, 96);
  doc.moveDown(1);
  doc.fillColor('#333').fontSize(8.5).font('Helvetica')
     .text('Declaro, para os devidos fins, que as informações constantes nesta ficha são verdadeiras, '
         + 'e comprometo-me a comunicar ao comando qualquer alteração.',
       margem, doc.y, { width: largura, align: 'justify' });

  const linhaY = doc.y + 42;
  const colW = (largura - 40) / 2;
  doc.moveTo(margem, linhaY).lineTo(margem + colW, linhaY).lineWidth(0.8).stroke('#333');
  doc.moveTo(margem + colW + 40, linhaY).lineTo(margem + largura, linhaY).lineWidth(0.8).stroke('#333');
  doc.fillColor('#222').fontSize(9).font('Helvetica-Bold')
     .text('Assinatura do Agente', margem, linhaY + 4, { width: colW, align: 'center' });
  doc.fillColor('#222').fontSize(9).font('Helvetica-Bold')
     .text('Comando da GCM', margem + colW + 40, linhaY + 4, { width: colW, align: 'center' });
  doc.y = linhaY + 20;
}

async function construirFichaPdf({ agente, blocos, resumida = false, emitidoPor, atualizadoEm }) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 50, left: 40, right: 40 }, bufferPages: true });
  const pronto = coletarPdfBuffer(doc);

  const margem = cabecalhoPDF(doc, {
    titulo: 'Ficha Funcional do Agente',
    subtitulo: resumida ? 'Versão resumida — sem dados de saúde e histórico disciplinar' : null,
  });
  const largura = doc.page.width - margem * 2;

  faixaIdentificacao(doc, agente, margem, largura);

  for (const b of blocosDoPdf(resumida)) {
    const valores = blocos[b.id] || {};
    tituloBloco(doc, b.titulo, margem, largura);

    // Campos simples em duas colunas; listas ocupam a largura toda, depois deles.
    const simples = b.campos.filter(c => c.tipo !== 'lista');
    const listas  = b.campos.filter(c => c.tipo === 'lista');

    const colW = (largura - 20) / 2;
    let coluna = 0;                       // 0 = esquerda, 1 = direita
    let yEsq = doc.y, yDir = doc.y;       // cada coluna tem o seu cursor vertical
    for (const campo of simples) {
      const cheio = campo.largura === 2;
      const w = cheio ? largura : colW;
      const h = alturaPar(doc, campo, valores[campo.id], w);
      let y = cheio ? Math.max(yEsq, yDir) : (coluna === 0 ? yEsq : yDir);
      if (y + h > limiteConteudoY(doc)) {
        doc.addPage();
        y = yEsq = yDir = doc.page.margins.top;
        coluna = 0;
      }
      const x = (cheio || coluna === 0) ? margem : margem + colW + 20;
      const fim = desenharPar(doc, campo, valores[campo.id], x, y, w);
      if (cheio)            { yEsq = yDir = fim; coluna = 0; }
      else if (coluna === 0) { yEsq = fim; coluna = 1; }
      else                   { yDir = fim; coluna = 0; }
    }
    doc.y = Math.max(yEsq, yDir) + 2;

    for (const campo of listas) desenharLista(doc, campo, valores[campo.id], margem, largura);
  }

  declaracaoEAssinatura(doc, margem, largura);

  const emissao = new Date().toLocaleString('pt-BR');
  const atualizacao = atualizadoEm ? ` · Ficha atualizada em ${new Date(atualizadoEm).toLocaleDateString('pt-BR')}` : '';
  rodapePDF(doc, { info: `Emitida em ${emissao} por ${emitidoPor || '—'}${atualizacao}` });

  doc.end();
  return pronto;
}

module.exports = { construirFichaPdf, blocosDoPdf };
