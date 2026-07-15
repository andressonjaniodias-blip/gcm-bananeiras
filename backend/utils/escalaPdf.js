// backend/utils/escalaPdf.js
// Desenho do PDF da escala mensal em formato calendário dia a dia. Sem acesso ao
// banco — recebe a escala, os itens já carregados (com nome_exibicao) e as férias
// do mês. Isolado de escalaRoutes para permitir teste/render sem Postgres.
const PDFDocument = require('pdfkit');
const { cabecalhoPDF, rodapePDF, assinaturasPDF, fmtData, NAVY } = require('./pdfLayout');
const { montarCalendarioMes, rankSetor } = require('./escalaCalc');
const { coletarPdfBuffer } = require('./pdfBuffer');

// Sufixo de horário exibido após o nome do agente. Usa o campo `horario` (seletor
// único). Para itens antigos sem `horario`, cai no sufixo legado derivado de
// `regime`/`turno`. Retorna '' quando não há nada a exibir.
function sufixoHorario(i) {
  if (i.horario) return ` (${i.horario})`;
  if (i.regime === '12x36') return ` (12x36${i.turno ? '/' + i.turno[0].toUpperCase() : ''})`;
  return '';
}

function nomeMes(mesRef) {
  const [ano, mes] = String(mesRef).split('-');
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[parseInt(mes, 10) - 1] || mes}/${ano}`;
}

function desenharPdfEscala(escala, itens, ferias) {
  const doc = new PDFDocument({ margins: { top: 55, bottom: 65, left: 40, right: 40 }, size: 'A4', layout: 'landscape', bufferPages: true });
  const bufferPromise = coletarPdfBuffer(doc);

  {
    const margem = cabecalhoPDF(doc, { titulo: `Escala de Serviço — ${nomeMes(escala.mes_referencia)}`, subtitulo: escala.titulo || 'Guarda Civil Municipal de Bananeiras/PB' });
    const pageW  = doc.page.width;
    const conteudoW = pageW - margem * 2;

    // Calendário dia a dia: cada agente aparece automaticamente em todos os dias
    // em que trabalha, conforme o horário (Seg–Sex, fim de semana, 12x36 ou rodízio
    // 24x72). Cada dia é um "card" atômico, nunca partido entre colunas/páginas.
    const dias = montarCalendarioMes(itens, escala.mes_referencia, escala.patrulha_dia1);
    const DIAS_SEM = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

    const colGap = 16;
    const colW   = (conteudoW - colGap) / 2;
    const colX   = [margem, margem + colW + colGap];
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 6;
    let topY  = doc.y + 2;
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

    // Agrupa os itens de um dia por posto, na ordem operacional dos setores
    // (rankSetor → posto → nome), independente da patrulha.
    function agruparPorPosto(itensDia) {
      const ordenados = [...itensDia].sort((a, b) =>
        (rankSetor(a.posto, a.horario) - rankSetor(b.posto, b.horario)) ||
        String(a.posto || '').localeCompare(String(b.posto || ''), 'pt-BR') ||
        String(a.nome_exibicao || a.nome || '').localeCompare(String(b.nome_exibicao || b.nome || ''), 'pt-BR'));
      const grupos = [];
      const idx = {};
      ordenados.forEach(i => {
        if (idx[i.posto] === undefined) { idx[i.posto] = grupos.length; grupos.push({ posto: i.posto, nomes: [] }); }
        grupos[idx[i.posto]].nomes.push(`${i.nome_exibicao || i.nome}${sufixoHorario(i)}`);
      });
      return grupos.map(g => ({ posto: g.posto, nomes: g.nomes.join(', ') }));
    }

    const TITULO_H = 16, PAD_TOP = 3, POSTO_GAP = 3, CARD_BOTTOM = 7;

    // Altura estimada do card (só para decidir quebra de coluna/página).
    function medirCard(grupos) {
      let h = TITULO_H + PAD_TOP;
      if (!grupos.length) {
        doc.fontSize(8).font('Helvetica-Oblique');
        h += doc.heightOfString('(sem serviço)', { width: colW - 8 });
      }
      grupos.forEach(g => {
        doc.fontSize(8.5).font('Helvetica-Bold');
        h += doc.heightOfString(g.posto, { width: colW - 6 }) + 1;
        doc.fontSize(8).font('Helvetica');
        h += doc.heightOfString(g.nomes, { width: colW - 10 }) + POSTO_GAP;
      });
      return h + CARD_BOTTOM;
    }

    // Desenha o card e retorna o y do fim (base para o próximo card da coluna).
    function desenharCard(d, grupos, x, y) {
      const cor = d.fimDeSemana ? '#8b1e3f' : NAVY;
      doc.rect(x, y, colW, TITULO_H).fill(cor);
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
         .text(`DIA ${String(d.dia).padStart(2, '0')} — ${DIAS_SEM[d.diaSemana]}`, x + 5, y + 4, { width: colW - 10 });
      let yy = y + TITULO_H + PAD_TOP;
      if (!grupos.length) {
        doc.fillColor('#999').fontSize(8).font('Helvetica-Oblique')
           .text('(sem serviço)', x + 5, yy, { width: colW - 8 });
        yy = doc.y;
      }
      grupos.forEach(g => {
        doc.fillColor(NAVY).fontSize(8.5).font('Helvetica-Bold')
           .text(g.posto, x + 3, yy, { width: colW - 6 });
        yy = doc.y + 1;
        doc.fillColor('#222').fontSize(8).font('Helvetica')
           .text(g.nomes, x + 5, yy, { width: colW - 10 });
        yy = doc.y + POSTO_GAP;
      });
      return yy + CARD_BOTTOM - POSTO_GAP;
    }

    dias.forEach(d => {
      const grupos = agruparPorPosto(d.itens);
      const h = medirCard(grupos);
      if (colY[col] + h > bottomLimit) {
        if (col === 0) {
          col = 1;
          if (colY[1] + h > bottomLimit) quebrarPagina();
        } else {
          quebrarPagina();
        }
      }
      colY[col] = desenharCard(d, grupos, colX[col], colY[col]);
    });

    doc.y = Math.max(colY[0], colY[1]);

    // Bloco de observações (férias + observações gerais), abaixo do calendário.
    if (ferias.length || escala.obs) {
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

    assinaturasPDF(doc);

    rodapePDF(doc, { info: `Escala ${escala.numero || ''} — ${nomeMes(escala.mes_referencia)} — Bananeiras/PB` });
    doc.end();
  }

  return bufferPromise;
}

module.exports = { desenharPdfEscala, nomeMes, sufixoHorario };
