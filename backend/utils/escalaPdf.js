// backend/utils/escalaPdf.js
// Desenho dos PDFs da escala mensal, em dois formatos:
//   - Calendário dia a dia (desenharPdfEscala)
//   - Resumo por tipo de escala / blocos (desenharPdfResumo)
// Sem acesso ao banco — recebem a escala, os itens já carregados (com nome_exibicao)
// e as férias do mês. Isolado de escalaRoutes para permitir teste/render sem Postgres.
const PDFDocument = require('pdfkit');
const { cabecalhoPDF, rodapePDF, assinaturasPDF, limiteConteudoY, fmtData, NAVY } = require('./pdfLayout');
const { nomeExibicao } = require('./nomeAgente');
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
const AGENTE_GAP = 5;

function entradaAgente(i) {
  const linha1 = nomeExibicao(i);   // "João Carlos, 1234"
  const ht = horarioTexto(i);
  const linha2 = `${i.posto || ''}${ht ? ' · ' + ht : ''}`.trim();
  return { linha1, linha2 };
}

// `soNome` omite a 2ª linha: usado na tabela de equipes, onde o setor já é o título
// do grupo. Os blocos Seg-Sex / fim de semana continuam com as duas linhas.
function medirAgente(doc, i, w, soNome) {
  const e = entradaAgente(i);
  doc.fontSize(12).font('Helvetica-Bold');
  let h = doc.heightOfString(e.linha1, { width: w });
  if (e.linha2 && !soNome) { doc.fontSize(11).font('Helvetica-Oblique'); h += doc.heightOfString(e.linha2, { width: w }); }
  return h + AGENTE_GAP;
}

function desenharAgente(doc, i, x, y, w, soNome) {
  const e = entradaAgente(i);
  doc.fillColor('#1a1a1a').fontSize(12).font('Helvetica-Bold').text(e.linha1, x, y, { width: w });
  let yy = doc.y;
  if (e.linha2 && !soNome) {
    doc.fillColor('#666').fontSize(11).font('Helvetica-Oblique').text(e.linha2, x, yy, { width: w });
    yy = doc.y;
  }
  return yy + AGENTE_GAP;
}

// Título do grupo dentro da coluna da equipe: "POSTO · horário". O turno vai
// abreviado (12x36 D / 12x36 N) porque a coluna é estreita e nomes de posto longos
// já fazem o título quebrar em duas linhas.
const GRUPO_GAP = 3;

function horarioCurto(horario) {
  const h = (horario || '').toLowerCase();
  if (h.includes('noturno')) return '12x36 N';
  if (h.includes('12x36')) return '12x36 D';
  return horario || '';
}

function tituloGrupo(g) {
  const h = horarioCurto(g.horario);
  return `${(g.posto || '').toUpperCase()}${h ? ` · ${h}` : ''}`;
}

function medirTituloGrupo(doc, g, w) {
  doc.fontSize(10).font('Helvetica-Bold');
  return doc.heightOfString(tituloGrupo(g), { width: w }) + GRUPO_GAP;
}

function desenharTituloGrupo(doc, g, x, y, w) {
  doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text(tituloGrupo(g), x, y, { width: w });
  return doc.y + GRUPO_GAP;
}

// Bloco de OBSERVAÇÕES (férias + observações gerais). Compartilhado pelos dois PDFs.
function desenharObservacoes(doc, { escala, ferias, margem, conteudoW, pageW }) {
  if (!(ferias.length || escala.obs)) return;
  if (doc.y > doc.page.height - doc.page.margins.bottom - 85) { doc.addPage(); doc.y = doc.page.margins.top; }
  doc.moveDown(0.9);
  doc.fillColor(NAVY).fontSize(16).font('Helvetica-Bold')
     .text('OBSERVAÇÕES', margem, doc.y, { width: conteudoW });
  doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(0.8).stroke(NAVY);
  doc.moveDown(0.4);

  if (ferias.length) {
    doc.fillColor(NAVY).fontSize(13).font('Helvetica-Bold').text('Férias no mês: ', { continued: true })
       .fillColor('#222').font('Helvetica')
       .text(ferias.map(f => `${nomeExibicao(f)} — ${fmtData(f.data_inicio)} a ${fmtData(f.data_fim)}`).join('; '));
  }
  if (escala.obs) {
    if (ferias.length) doc.moveDown(0.4);
    doc.fillColor(NAVY).fontSize(13).font('Helvetica-Bold').text('Observações gerais: ', { continued: true })
       .fillColor('#222').font('Helvetica').text(escala.obs);
  }
}

// A margem inferior fica logo abaixo de limiteConteudoY (pageH - 50): quem decide a
// quebra aqui é o nosso cálculo de coluna, não a quebra automática do pdfkit dentro
// de doc.text() — se a margem fosse maior, um nome no pé da coluna criaria página fantasma.
function novoDoc() {
  return new PDFDocument({ margins: { top: 55, bottom: 48, left: 40, right: 40 }, size: 'A4', layout: 'landscape', bufferPages: true });
}

// ── PDF calendário dia a dia ──────────────────────────────────────────────────
const TITULO_H = 24, PAD_TOP = 5, CARD_BOTTOM = 9;

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
  const bottomLimit = limiteConteudoY(doc);
  let topY = doc.y + 2;
  const colY = [topY, topY];
  let col = 0;

  function quebrarPagina() {
    doc.addPage();
    doc.fillColor(NAVY).fontSize(16).font('Helvetica-Bold')
       .text(`Escala de Serviço — ${nomeMes(escala.mes_referencia)} (continuação)`,
             margem, doc.page.margins.top, { width: conteudoW, align: 'center' });
    topY = doc.y + 6;
    colY[0] = colY[1] = topY;
    col = 0;
  }

  const txtW = colW - 10;

  // Altura do card que contém exatamente `itens` (lista já fatiada).
  function medirCard(itens) {
    let h = TITULO_H + PAD_TOP;
    if (!itens.length) {
      doc.fontSize(12).font('Helvetica-Oblique');
      return h + doc.heightOfString('(sem serviço)', { width: txtW }) + CARD_BOTTOM;
    }
    itens.forEach(i => { h += medirAgente(doc, i, txtW); });
    return h + CARD_BOTTOM - AGENTE_GAP;
  }

  // Quantos dos `itens` cabem num card que começa em `y` — a mesma conta de medirCard,
  // parando no primeiro nome que estoura o pé da coluna.
  function cabemEm(itens, y) {
    let h = y + TITULO_H + PAD_TOP, n = 0;
    for (const i of itens) {
      const a = medirAgente(doc, i, txtW);
      if (h + a + CARD_BOTTOM - AGENTE_GAP > bottomLimit) break;
      h += a; n++;
    }
    return n;
  }

  function desenharCard(d, x, y, itens, cont) {
    const cor = d.fimDeSemana ? '#8b1e3f' : NAVY;
    doc.rect(x, y, colW, TITULO_H).fill(cor);
    doc.fillColor('#fff').fontSize(13).font('Helvetica-Bold')
       .text(`DIA ${String(d.dia).padStart(2, '0')} — ${DIAS_SEM[d.diaSemana]}${cont ? ' (cont.)' : ''}`,
             x + 5, y + 6, { width: txtW });
    let yy = y + TITULO_H + PAD_TOP;
    if (!itens.length) {
      doc.fillColor('#999').fontSize(12).font('Helvetica-Oblique')
         .text('(sem serviço)', x + 5, yy, { width: txtW });
      return doc.y + CARD_BOTTOM;
    }
    itens.forEach(i => { yy = desenharAgente(doc, i, x + 5, yy, txtW); });
    return yy + CARD_BOTTOM - AGENTE_GAP;
  }

  // Cada dia procura uma coluna onde caiba inteiro. Um dia longo demais para caber
  // até numa coluna vazia é dividido em "DIA xx — SEG (cont.)", em vez de empurrar a
  // página toda: é o que deixava a 1ª página em branco, já que o cabeçalho
  // institucional come ~60pt a mais de altura que o título de continuação.
  const MIN_QUEBRA = 2; // dividir por causa de um nome só não compensa
  dias.forEach(d => {
    let resto = d.itens;
    let cont = false;
    for (;;) {
      const h = medirCard(resto);
      if (colY[col] + h <= bottomLimit) {
        colY[col] = desenharCard(d, colX[col], colY[col], resto, cont);
        return;
      }
      if (h > bottomLimit - topY) {
        const noTopo = colY[col] === topY;
        const n = cabemEm(resto, colY[col]);
        // no topo de uma coluna vazia desenha pelo menos um nome, senão o laço não anda
        const usar = n >= MIN_QUEBRA ? n : (noTopo ? Math.max(n, 1) : 0);
        if (usar) {
          colY[col] = desenharCard(d, colX[col], colY[col], resto.slice(0, usar), cont);
          resto = resto.slice(usar);
          cont = true;
        }
      }
      if (col === 0) col = 1; else quebrarPagina();
    }
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
  const bottomLimit = limiteConteudoY(doc);
  const dia1 = String(escala.patrulha_dia1 || '1');

  // Título de bloco (largura total), com quebra de página se necessário.
  function tituloBloco(texto) {
    if (doc.y > bottomLimit - 54) { doc.addPage(); doc.y = doc.page.margins.top; }
    doc.moveDown(0.7);
    doc.fillColor(NAVY).fontSize(16).font('Helvetica-Bold').text(texto, margem, doc.y, { width: conteudoW });
    doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(0.8).stroke(NAVY);
    doc.moveDown(0.3);
  }

  // Tabela única das 4 equipes do rodízio: cada coluna é quem está de serviço no dia
  // daquela equipe — 24x72 e 12x36 juntos, agrupados por posto + horário. O 12x36
  // aparece em duas colunas (ver _equipeIrma em escalaCalc).
  const GRADE_GAP = 10, GRADE_HEAD_H = 42;

  function gradeEquipes(colunas) {
    const colW = (conteudoW - GRADE_GAP * 3) / colunas.length;
    const colX = k => margem + k * (colW + GRADE_GAP);
    const txtW = colW - 6;

    // Desenha a faixa de cabeçalhos e devolve o y onde começa o conteúdo.
    function cabecalhos(y, cont) {
      colunas.forEach((c, k) => {
        const x = colX(k);
        doc.rect(x, y, colW, GRADE_HEAD_H).fill(NAVY);
        doc.fillColor('#fff').fontSize(15).font('Helvetica-Bold')
           .text(c.titulo, x, y + 6, { width: colW, align: 'center' });
        const sub = [c.subtitulo, cont ? '(cont.)' : ''].filter(Boolean).join(' · ');
        if (sub) {
          doc.fillColor('#dfe6f2').fontSize(11).font('Helvetica-Oblique')
             .text(sub, x, y + 25, { width: colW, align: 'center' });
        }
      });
      return y + GRADE_HEAD_H + 4;
    }

    // Achata cada coluna em unidades desenháveis (título de grupo ou nome), para a
    // fatia por página valer para as duas coisas.
    const achatar = grupos => grupos.flatMap(g => [
      { tipo: 'titulo', g },
      ...g.itens.map(i => ({ tipo: 'nome', i })),
    ]);
    const medir = (u, k) => u.tipo === 'titulo'
      ? medirTituloGrupo(doc, u.g, txtW) + (k ? 4 : 0)   // respiro antes do 2º grupo em diante
      : medirAgente(doc, u.i, txtW, true);

    // Fatia por página: o que não couber numa coluna transborda para a página
    // seguinte, que redesenha os cabeçalhos marcados com "(cont.)".
    let restos = colunas.map(c => achatar(c.grupos));
    let cont = false;
    for (;;) {
      if (doc.y + GRADE_HEAD_H + 40 > bottomLimit) { doc.addPage(); doc.y = doc.page.margins.top; }
      const yTop = cabecalhos(doc.y, cont);
      const colY = restos.map(() => yTop);
      const sobra = restos.map(() => []);
      restos.forEach((us, k) => {
        if (!us.length) {
          if (!cont) {
            doc.fillColor('#999').fontSize(11).font('Helvetica-Oblique')
               .text('(sem lançamentos)', colX(k), yTop + 2, { width: colW, align: 'center' });
            colY[k] = doc.y;
          }
          return;
        }
        us.forEach((u, idx) => {
          if (sobra[k].length) { sobra[k].push(u); return; } // já transbordou: mantém a ordem
          let h = medir(u, idx);
          // não deixa título de grupo órfão no pé da coluna: exige o 1º nome junto
          if (u.tipo === 'titulo' && us[idx + 1]) h += medir(us[idx + 1], idx + 1);
          if (colY[k] + h > bottomLimit) { sobra[k].push(u); return; }
          if (u.tipo === 'titulo') {
            if (idx) colY[k] += 4;
            colY[k] = desenharTituloGrupo(doc, u.g, colX(k) + 3, colY[k], txtW);
          } else {
            colY[k] = desenharAgente(doc, u.i, colX(k) + 3, colY[k], txtW, true);
          }
        });
      });
      doc.y = Math.max(...colY);
      if (!sobra.some(s => s.length)) break;
      restos = sobra;
      cont = true;
      doc.addPage();
      doc.y = doc.page.margins.top;
    }
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

  // Corpo do documento: a tabela das 4 equipes. Segunda a Sexta e fim de semana não
  // seguem o rodízio, então vêm depois em blocos de largura total (com o setor embaixo
  // de cada nome, já que ali não há agrupamento por posto).
  gradeEquipes(['1', '2', '3', '4'].map(p => ({
    titulo: `EQUIPE ${p}`,
    subtitulo: p === dia1 ? 'Dia 1' : '',
    grupos: resumo.equipes[p] || [],
  })));

  if (resumo.segSex.length) { tituloBloco('SEGUNDA A SEXTA'); fluxoAgentes(resumo.segSex, 3); }
  if (resumo.fimDeSemana.length) { tituloBloco('FIM DE SEMANA'); fluxoAgentes(resumo.fimDeSemana, 3); }

  desenharObservacoes(doc, { escala, ferias, margem, conteudoW, pageW });
  assinaturasPDF(doc);
  rodapePDF(doc, { info: `Escala ${escala.numero || ''} — ${nomeMes(escala.mes_referencia)} — Bananeiras/PB` });
  doc.end();

  return bufferPromise;
}

module.exports = { desenharPdfEscala, desenharPdfResumo, nomeMes, sufixoHorario };
