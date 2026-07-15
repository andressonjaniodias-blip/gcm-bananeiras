// backend/utils/escalaPdf.js
// Desenho dos PDFs da escala mensal, em dois formatos:
//   - Calendário dia a dia (desenharPdfEscala)
//   - Resumo por tipo de escala / blocos (desenharPdfResumo)
// Sem acesso ao banco — recebem a escala, os itens já carregados (com nome_exibicao)
// e as férias do mês. Isolado de escalaRoutes para permitir teste/render sem Postgres.
const PDFDocument = require('pdfkit');
const { cabecalhoPDF, rodapePDF, assinaturasPDF, fmtData, NAVY } = require('./pdfLayout');
const { montarCalendarioMes, montarResumoEscala } = require('./escalaCalc');
const { coletarPdfBuffer } = require('./pdfBuffer');

// Sufixo de horário exibido após o nome (formato legado " (x)"). Mantido por
// compatibilidade; a exibição atual usa horarioTexto (sem parênteses).
function sufixoHorario(i) {
  const t = horarioTexto(i);
  return t ? ` (${t})` : '';
}
function horarioTexto(i) {
  if (i.horario) return i.horario;
  if (i.regime === '12x36') return '12x36' + (i.turno ? '/' + i.turno[0].toUpperCase() : '');
  return '';
}

function nomeMes(mesRef) {
  const [ano, mes] = String(mesRef).split('-');
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[parseInt(mes, 10) - 1] || mes}/${ano}`;
}

// ── Entrada por agente (2 linhas): "Nome — matrícula" / "Setor · horário" ──────
const AGENTE_GAP = 3;

function entradaAgente(i) {
  const nome = i.nome_exibicao || i.nome || '';
  const linha1 = nome + (i.matricula ? ` — ${i.matricula}` : '');
  const ht = horarioTexto(i);
  const linha2 = `${i.posto || ''}${ht ? ' · ' + ht : ''}`.trim();
  return { linha1, linha2 };
}

function medirAgente(doc, i, w) {
  const e = entradaAgente(i);
  doc.fontSize(8).font('Helvetica-Bold');
  let h = doc.heightOfString(e.linha1, { width: w });
  if (e.linha2) { doc.fontSize(7).font('Helvetica-Oblique'); h += doc.heightOfString(e.linha2, { width: w }); }
  return h + AGENTE_GAP;
}

function desenharAgente(doc, i, x, y, w) {
  const e = entradaAgente(i);
  doc.fillColor('#1a1a1a').fontSize(8).font('Helvetica-Bold').text(e.linha1, x, y, { width: w });
  let yy = doc.y;
  if (e.linha2) {
    doc.fillColor('#666').fontSize(7).font('Helvetica-Oblique').text(e.linha2, x, yy, { width: w });
    yy = doc.y;
  }
  return yy + AGENTE_GAP;
}

// Bloco de OBSERVAÇÕES (férias + observações gerais). Compartilhado pelos dois PDFs.
function desenharObservacoes(doc, { escala, ferias, margem, conteudoW, pageW }) {
  if (!(ferias.length || escala.obs)) return;
  if (doc.y > doc.page.height - doc.page.margins.bottom - 70) { doc.addPage(); doc.y = doc.page.margins.top; }
  doc.moveDown(0.9);
  doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold')
     .text('OBSERVAÇÕES', margem, doc.y, { width: conteudoW });
  doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(0.8).stroke(NAVY);
  doc.moveDown(0.4);

  if (ferias.length) {
    doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text('Férias no mês: ', { continued: true })
       .fillColor('#222').font('Helvetica')
       .text(ferias.map(f => `${f.nome}${f.matricula ? ' (' + f.matricula + ')' : ''} — ${fmtData(f.data_inicio)} a ${fmtData(f.data_fim)}`).join('; '));
  }
  if (escala.obs) {
    if (ferias.length) doc.moveDown(0.4);
    doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text('Observações gerais: ', { continued: true })
       .fillColor('#222').font('Helvetica').text(escala.obs);
  }
}

function novoDoc() {
  return new PDFDocument({ margins: { top: 55, bottom: 65, left: 40, right: 40 }, size: 'A4', layout: 'landscape', bufferPages: true });
}

// ── PDF calendário dia a dia ──────────────────────────────────────────────────
const TITULO_H = 16, PAD_TOP = 3, CARD_BOTTOM = 6;

function desenharPdfEscala(escala, itens, ferias) {
  const doc = novoDoc();
  const bufferPromise = coletarPdfBuffer(doc);

  const margem = cabecalhoPDF(doc, { titulo: `Escala de Serviço — ${nomeMes(escala.mes_referencia)}`, subtitulo: escala.titulo || 'Guarda Civil Municipal de Bananeiras/PB' });
  const pageW  = doc.page.width;
  const conteudoW = pageW - margem * 2;

  // Cada agente aparece automaticamente em todos os dias em que trabalha (Seg–Sex,
  // fim de semana, 12x36 ou rodízio 24x72). Cada dia é um card atômico.
  const dias = montarCalendarioMes(itens, escala.mes_referencia, escala.patrulha_dia1);
  const DIAS_SEM = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  const colGap = 16;
  const colW   = (conteudoW - colGap) / 2;
  const colX   = [margem, margem + colW + colGap];
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 6;
  let topY = doc.y + 2;
  const colY = [topY, topY];
  let col = 0;

  function quebrarPagina() {
    doc.addPage();
    doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold')
       .text(`Escala de Serviço — ${nomeMes(escala.mes_referencia)} (continuação)`,
             margem, doc.page.margins.top, { width: conteudoW, align: 'center' });
    topY = doc.y + 6;
    colY[0] = colY[1] = topY;
    col = 0;
  }

  function medirCard(d) {
    let h = TITULO_H + PAD_TOP;
    if (!d.itens.length) {
      doc.fontSize(8).font('Helvetica-Oblique');
      h += doc.heightOfString('(sem serviço)', { width: colW - 10 });
    }
    d.itens.forEach(i => { h += medirAgente(doc, i, colW - 10); });
    return h + CARD_BOTTOM;
  }

  function desenharCard(d, x, y) {
    const cor = d.fimDeSemana ? '#8b1e3f' : NAVY;
    doc.rect(x, y, colW, TITULO_H).fill(cor);
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
       .text(`DIA ${String(d.dia).padStart(2, '0')} — ${DIAS_SEM[d.diaSemana]}`, x + 5, y + 4, { width: colW - 10 });
    let yy = y + TITULO_H + PAD_TOP;
    if (!d.itens.length) {
      doc.fillColor('#999').fontSize(8).font('Helvetica-Oblique')
         .text('(sem serviço)', x + 5, yy, { width: colW - 10 });
      return doc.y + CARD_BOTTOM;
    }
    d.itens.forEach(i => { yy = desenharAgente(doc, i, x + 5, yy, colW - 10); });
    return yy + CARD_BOTTOM - AGENTE_GAP;
  }

  dias.forEach(d => {
    const h = medirCard(d);
    if (colY[col] + h > bottomLimit) {
      if (col === 0) {
        col = 1;
        if (colY[1] + h > bottomLimit) quebrarPagina();
      } else {
        quebrarPagina();
      }
    }
    colY[col] = desenharCard(d, colX[col], colY[col]);
  });

  doc.y = Math.max(colY[0], colY[1]);
  desenharObservacoes(doc, { escala, ferias, margem, conteudoW, pageW });
  assinaturasPDF(doc);
  rodapePDF(doc, { info: `Escala ${escala.numero || ''} — ${nomeMes(escala.mes_referencia)} — Bananeiras/PB` });
  doc.end();

  return bufferPromise;
}

// ── PDF resumo (blocos por tipo de escala) ────────────────────────────────────
function desenharPdfResumo(escala, resumo, ferias) {
  const doc = novoDoc();
  const bufferPromise = coletarPdfBuffer(doc);

  const margem = cabecalhoPDF(doc, { titulo: `Escala de Serviço (Resumo) — ${nomeMes(escala.mes_referencia)}`, subtitulo: escala.titulo || 'Guarda Civil Municipal de Bananeiras/PB' });
  const pageW  = doc.page.width;
  const conteudoW = pageW - margem * 2;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 6;
  const dia1 = String(escala.patrulha_dia1 || '1');

  // 4 colunas de patrulha (rodízio 24x72)
  const gap4 = 10;
  const colW4 = (conteudoW - gap4 * 3) / 4;
  const topY = doc.y + 2;
  let maxY = topY;
  ['1', '2', '3', '4'].forEach((p, idx) => {
    const x = margem + idx * (colW4 + gap4);
    let y = topY;
    doc.rect(x, y, colW4, 20).fill(NAVY);
    doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold')
       .text(`PATRULHA ${p}${p === dia1 ? ' (dia 1)' : ''}`, x, y + 5, { width: colW4, align: 'center' });
    y += 24;
    const its = resumo.patrulhas[p];
    if (!its.length) {
      doc.fillColor('#999').fontSize(8).font('Helvetica-Oblique')
         .text('(sem lançamentos)', x, y + 2, { width: colW4, align: 'center' });
      y = doc.y;
    }
    its.forEach(i => { y = desenharAgente(doc, i, x + 3, y, colW4 - 6); });
    maxY = Math.max(maxY, y);
  });
  doc.y = maxY;

  // Título de bloco (largura total), com quebra de página se necessário.
  function tituloBloco(texto) {
    if (doc.y > bottomLimit - 46) { doc.addPage(); doc.y = doc.page.margins.top; }
    doc.moveDown(0.7);
    doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text(texto, margem, doc.y, { width: conteudoW });
    doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(0.8).stroke(NAVY);
    doc.moveDown(0.3);
  }

  function subRotulo(texto) {
    if (doc.y > bottomLimit - 20) { doc.addPage(); doc.y = doc.page.margins.top; }
    doc.fillColor('#555').fontSize(9).font('Helvetica-BoldOblique').text(texto, margem, doc.y, { width: conteudoW });
    doc.y = doc.y + 2;
  }

  // Distribui os agentes de um bloco em `ncols` colunas (preenche coluna por coluna),
  // com quebra de página. Retorna nada; atualiza doc.y para o fim.
  function fluxoAgentes(itens, ncols) {
    if (!itens.length) return;
    const gap = 12;
    const colW = (conteudoW - gap * (ncols - 1)) / ncols;
    const colX = Array.from({ length: ncols }, (_, k) => margem + k * (colW + gap));
    let yStart = doc.y;
    const colY = new Array(ncols).fill(yStart);
    let c = 0;
    itens.forEach(i => {
      const h = medirAgente(doc, i, colW);
      if (colY[c] + h > bottomLimit) {
        if (c < ncols - 1) { c++; }
        else { doc.addPage(); yStart = doc.page.margins.top; colY.fill(yStart); c = 0; }
      }
      colY[c] = desenharAgente(doc, i, colX[c], colY[c], colW);
    });
    doc.y = Math.max(...colY);
  }

  if (resumo.segSex.length) { tituloBloco('SEGUNDA A SEXTA'); fluxoAgentes(resumo.segSex, 3); }
  if (resumo.diurno[1].length || resumo.diurno[2].length) {
    tituloBloco('12X36 DIURNO');
    if (resumo.diurno[1].length) { subRotulo('Equipe 1 — dias ímpares'); fluxoAgentes(resumo.diurno[1], 3); }
    if (resumo.diurno[2].length) { subRotulo('Equipe 2 — dias pares');  fluxoAgentes(resumo.diurno[2], 3); }
  }
  if (resumo.noturno[1].length || resumo.noturno[2].length) {
    tituloBloco('12X36 NOTURNO');
    if (resumo.noturno[1].length) { subRotulo('Equipe 1 — dias ímpares'); fluxoAgentes(resumo.noturno[1], 3); }
    if (resumo.noturno[2].length) { subRotulo('Equipe 2 — dias pares');  fluxoAgentes(resumo.noturno[2], 3); }
  }
  if (resumo.fimDeSemana.length) { tituloBloco('FIM DE SEMANA'); fluxoAgentes(resumo.fimDeSemana, 3); }

  desenharObservacoes(doc, { escala, ferias, margem, conteudoW, pageW });
  assinaturasPDF(doc);
  rodapePDF(doc, { info: `Escala ${escala.numero || ''} — ${nomeMes(escala.mes_referencia)} — Bananeiras/PB` });
  doc.end();

  return bufferPromise;
}

module.exports = { desenharPdfEscala, desenharPdfResumo, nomeMes, sufixoHorario };
