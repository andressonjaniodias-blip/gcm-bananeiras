const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, verificarSupervisor, auditar } = require('../middleware/auth');
const erroServidor = require('../utils/erroServidor');
const PDFDocument  = require('pdfkit');
const { cabecalhoPDF, rodapePDF, fmtData, NAVY } = require('../utils/pdfLayout');
const { quinzenaDe, numeroFolga, diaDoMes } = require('../utils/escalaCalc');
const { horasDoTipo, valorDoTipo, calcularHoraFim } = require('../utils/extrasCalc');
const { coletarPdfBuffer } = require('../utils/pdfBuffer');
const { enviarPdfNotificacao } = require('../utils/email');

const VAGAS_DIA_PADRAO = 4; // padrão de vagas por dia (ajustável por admin/supervisor)
const LIMITE_HORAS = 96;   // 4 plantões de 24h por quinzena

function ehComando(req)      { return ['admin', 'supervisor'].includes(req.usuario?.role); }

// Normaliza uma coluna DATE do Postgres (pode vir como Date ou string) para 'YYYY-MM-DD'
function ymd(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

async function vagasDoDia(dataStr) {
  const { rows } = await pool.query(`SELECT vagas_total FROM extras_config_dia WHERE data = $1`, [dataStr]);
  return rows.length ? rows[0].vagas_total : VAGAS_DIA_PADRAO;
}

async function diaFechado(dataStr) {
  const { rows } = await pool.query(`SELECT fechado FROM extras_config_dia WHERE data = $1`, [dataStr]);
  return rows.length ? !!rows[0].fechado : false;
}

// Reenvia por e-mail o PDF atualizado da lista do dia, mas somente se a lista já
// tiver sido fechada anteriormente (fire-and-forget; nunca deve quebrar a rota chamadora).
async function reenviarPdfSeFechado(dataStr, motivo, usuarioReq) {
  if (!(await diaFechado(dataStr))) return;
  const { rows: vagas } = await pool.query(
    `SELECT * FROM extras_vagas WHERE data = $1 ORDER BY criado_em`, [dataStr]
  );
  const pdfBuffer = await construirPdfDia(dataStr, vagas);
  enviarPdfNotificacao({
    subject: `Lista de extras atualizada — ${fmtData(dataStr)}`,
    html: `<p>A lista de plantões extras de <b>${fmtData(dataStr)}</b>, já fechada, foi atualizada por <b>${usuarioReq}</b> (${motivo}).</p>`,
    pdfBuffer,
    filename: `extras-${dataStr}.pdf`,
  });
}

// Soma de horas já lançadas para um agente na quinzena de uma data (exclui uma vaga opcional)
async function horasNaQuinzena(agenteId, dataStr, excluirId = null) {
  if (!agenteId) return 0;
  const q = quinzenaDe(dataStr);
  const { rows } = await pool.query(
    `SELECT tipo FROM extras_vagas
     WHERE agente_id = $1 AND data BETWEEN $2 AND $3 AND ($4::int IS NULL OR id <> $4)`,
    [agenteId, q.inicio, q.fim, excluirId]
  );
  return rows.reduce((acc, r) => acc + horasDoTipo(r.tipo), 0);
}

// Patrulha do agente e patrulha_dia1 da escala do mês da data (ou null)
async function patrulhaDoAgente(agenteId, dataStr) {
  if (!agenteId) return null;
  const mes = String(dataStr).slice(0, 7);
  const { rows } = await pool.query(
    `SELECT ei.patrulha, e.patrulha_dia1 FROM escala_itens ei
     JOIN escalas e ON e.id = ei.escala_id
     WHERE e.mes_referencia = $1 AND ei.agente_id = $2
     LIMIT 1`,
    [mes, agenteId]
  );
  return rows.length ? rows[0] : null;
}

async function avisoFolga(agenteId, dataStr) {
  const info = await patrulhaDoAgente(agenteId, dataStr);
  const patrulha = info?.patrulha;
  if (!patrulha || !['1', '2', '3', '4'].includes(String(patrulha))) return null;
  const nf = numeroFolga(patrulha, diaDoMes(dataStr), info.patrulha_dia1 || '1');
  if (nf === 2) return null; // é a 2ª folga: preferência atendida
  if (nf === 0) return `Atenção: neste dia a Patrulha ${patrulha} está de SERVIÇO (não é dia de folga).`;
  const ord = { 1: '1ª', 3: '3ª' }[nf] || `${nf}ª`;
  return `Atenção: este dia é a ${ord} folga da Patrulha ${patrulha}. A preferência é trabalhar na 2ª folga.`;
}

// ── Vagas de um dia ──────────────────────────────────────────────────────────
router.get('/dia/:data', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM extras_vagas WHERE data = $1 ORDER BY criado_em`, [req.params.data]
    );
    const totalVagas = await vagasDoDia(req.params.data);
    const fechado = await diaFechado(req.params.data);
    res.json({ data: req.params.data, vagas: rows, total_vagas: totalVagas, livres: Math.max(0, totalVagas - rows.length), fechado });
  } catch (err) { erroServidor(res, err); }
});

// Alterar o número de vagas do dia (somente admin/supervisor)
router.put('/dia/:data/vagas', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const vagasTotal = parseInt(req.body.vagas_total, 10);
    if (!Number.isInteger(vagasTotal) || vagasTotal < 1) {
      return res.status(400).json({ error: 'Informe um número válido de vagas (mínimo 1).' });
    }
    await pool.query(
      `INSERT INTO extras_config_dia (data, vagas_total, atualizado_por, atualizado_em)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (data) DO UPDATE SET vagas_total = $2, atualizado_por = $3, atualizado_em = NOW()`,
      [req.params.data, vagasTotal, req.usuario.usuario]
    );
    await auditar(req, 'ALTERAR_VAGAS_EXTRA', `${req.params.data}: ${vagasTotal} vaga(s)/dia`);
    res.json({ data: req.params.data, total_vagas: vagasTotal });
  } catch (err) { erroServidor(res, err); }
});

// Dias que possuem lançamentos (histórico)
router.get('/dias', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT data::text AS data, COUNT(*)::int AS qtd,
              COALESCE(SUM(valor),0)::numeric AS total
       FROM extras_vagas GROUP BY data ORDER BY data DESC`
    );
    res.json(rows);
  } catch (err) { erroServidor(res, err); }
});

// Consulta de cota do agente para a quinzena de uma data
router.get('/cota/:agenteId/:data', verificarToken, async (req, res) => {
  try {
    const usadas = await horasNaQuinzena(parseInt(req.params.agenteId, 10), req.params.data);
    const q = quinzenaDe(req.params.data);
    res.json({
      quinzena: q.label, horas_usadas: usadas, limite_horas: LIMITE_HORAS,
      horas_restantes: Math.max(0, LIMITE_HORAS - usadas),
      cotas_usadas: usadas / 24, limite_cotas: LIMITE_HORAS / 24,
    });
  } catch (err) { erroServidor(res, err); }
});

// Criar vaga
router.post('/', verificarToken, async (req, res) => {
  try {
    const { data, agente_id, nome, matricula, funcao, tipo, hora_inicio, telefone, override } = req.body;
    if (!data || !nome) return res.status(400).json({ error: 'Data e nome são obrigatórios.' });
    if (!['12', '24'].includes(String(tipo))) return res.status(400).json({ error: 'Tipo deve ser 12 ou 24 horas.' });

    if (!ehComando(req) && await diaFechado(data)) {
      return res.status(403).json({ error: 'A lista deste dia já foi fechada; apenas o comando pode alterá-la.' });
    }

    // Limite de vagas por dia (configurável por admin/supervisor)
    const vagasTotal = await vagasDoDia(data);
    const { rows: [{ n }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM extras_vagas WHERE data = $1`, [data]);
    if (n >= vagasTotal) return res.status(409).json({ error: `As ${vagasTotal} vagas deste dia já foram preenchidas.` });

    // Agente não pode se lançar duas vezes no mesmo dia
    if (agente_id) {
      const { rows: dup } = await pool.query(
        `SELECT 1 FROM extras_vagas WHERE data = $1 AND agente_id = $2`, [data, agente_id]
      );
      if (dup.length) return res.status(409).json({ error: 'Este agente já está lançado neste dia.' });
    }

    // Controle de cota quinzenal
    const usadas = await horasNaQuinzena(agente_id, data);
    const novas  = horasDoTipo(tipo);
    let liberado_por = null;
    if (agente_id && usadas + novas > LIMITE_HORAS) {
      if (!ehComando(req)) {
        return res.status(403).json({
          error: 'Limite de plantões extras da quinzena atingido.',
          codigo: 'COTA_EXCEDIDA',
          detalhe: `Já lançadas ${usadas}h de ${LIMITE_HORAS}h. A liberação só pode ser feita pelo comando.`,
        });
      }
      if (!override) {
        return res.status(409).json({
          error: 'Limite de cota excedido. Confirme a liberação pelo comando.',
          codigo: 'CONFIRMAR_LIBERACAO',
          detalhe: `Já lançadas ${usadas}h de ${LIMITE_HORAS}h nesta quinzena.`,
        });
      }
      liberado_por = req.usuario.usuario;
    }

    const valor = valorDoTipo(tipo);
    const horaFim = calcularHoraFim(hora_inicio, horasDoTipo(tipo));
    const { rows } = await pool.query(
      `INSERT INTO extras_vagas (data, agente_id, nome, matricula, funcao, tipo, hora_inicio, hora_fim, telefone, valor, liberado_por, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [data, agente_id || null, nome, matricula || null, funcao || null, String(tipo),
       hora_inicio || null, horaFim, telefone || null, valor, liberado_por, req.usuario.usuario]
    );

    const acaoExtra = liberado_por
      ? `Plantão extra ${tipo}h — ${nome} em ${data} (R$ ${valor.toFixed(2)}) — COTA LIBERADA por ${liberado_por}`
      : `Plantão extra ${tipo}h — ${nome} em ${data} (R$ ${valor.toFixed(2)})`;
    await auditar(req, 'CRIAR_EXTRA', acaoExtra);

    const aviso = await avisoFolga(agente_id, data);
    res.status(201).json({ vaga: rows[0], aviso_folga: aviso, liberado: !!liberado_por });

    reenviarPdfSeFechado(data, `inclusão de ${nome}`, req.usuario.usuario)
      .catch(err => console.error('[Email-PDF] Falha ao reenviar PDF de extras após inclusão:', err.message));
  } catch (err) { erroServidor(res, err); }
});

// Editar vaga (comando)
router.put('/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { nome, matricula, funcao, tipo, hora_inicio, telefone } = req.body;
    const { rows: atual } = await pool.query(`SELECT * FROM extras_vagas WHERE id = $1`, [req.params.id]);
    if (!atual.length) return res.status(404).json({ error: 'Vaga não encontrada.' });
    const t = ['12', '24'].includes(String(tipo)) ? String(tipo) : atual[0].tipo;
    const valor = valorDoTipo(t);
    const horaInicioFinal = hora_inicio ?? atual[0].hora_inicio;
    const horaFim = calcularHoraFim(horaInicioFinal, horasDoTipo(t));
    const { rows } = await pool.query(
      `UPDATE extras_vagas SET nome=$1, matricula=$2, funcao=$3, tipo=$4, hora_inicio=$5,
              hora_fim=$6, telefone=$7, valor=$8, atualizado_em=NOW()
       WHERE id=$9 RETURNING *`,
      [nome ?? atual[0].nome, matricula ?? atual[0].matricula, funcao ?? atual[0].funcao,
       t, horaInicioFinal, horaFim,
       telefone ?? atual[0].telefone, valor, req.params.id]
    );
    await auditar(req, 'ALTERAR_EXTRA', `Plantão extra — ${rows[0].nome} em ${rows[0].data} (${rows[0].tipo}h, R$ ${Number(rows[0].valor).toFixed(2)})`);
    res.json(rows[0]);

    reenviarPdfSeFechado(ymd(rows[0].data), `edição de ${rows[0].nome}`, req.usuario.usuario)
      .catch(err => console.error('[Email-PDF] Falha ao reenviar PDF de extras após edição:', err.message));
  } catch (err) { erroServidor(res, err); }
});

// Remover vaga (dono ou comando; se a lista do dia já estiver fechada, só o comando pode remover)
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM extras_vagas WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Vaga não encontrada.' });
    const v = rows[0];
    const dataStr = ymd(v.data);
    const dono = v.criado_por === req.usuario.usuario;
    const fechado = await diaFechado(dataStr);
    if (fechado && !ehComando(req)) {
      return res.status(403).json({ error: 'A lista deste dia já foi fechada; apenas o comando pode alterá-la.' });
    }
    if (!fechado && !ehComando(req) && !dono) return res.status(403).json({ error: 'Sem permissão para remover esta vaga.' });
    await pool.query(`DELETE FROM extras_vagas WHERE id = $1`, [req.params.id]);
    await auditar(req, 'REMOVER_EXTRA', `Plantão extra — ${v.nome} em ${v.data} (${v.tipo}h, R$ ${Number(v.valor).toFixed(2)})`);
    res.json({ ok: true });

    reenviarPdfSeFechado(dataStr, `remoção de ${v.nome}`, req.usuario.usuario)
      .catch(err => console.error('[Email-PDF] Falha ao reenviar PDF de extras após remoção:', err.message));
  } catch (err) { erroServidor(res, err); }
});

// Monta o PDF da lista de plantões extras de um dia
async function construirPdfDia(dataStr, vagas) {
  const doc = new PDFDocument({ margins: { top: 55, bottom: 65, left: 40, right: 40 }, size: 'A4', layout: 'landscape', bufferPages: true });
  const bufferPromise = coletarPdfBuffer(doc);

  {
    const margem = cabecalhoPDF(doc, { titulo: 'Lista de Plantões Extras', subtitulo: `Data: ${fmtData(dataStr)}` });
    const pageW  = doc.page.width;
    const conteudoW = pageW - margem * 2;

    // Tabela
    const cols = [
      { t: 'Nome',      w: 0.24 },
      { t: 'Matrícula', w: 0.11 },
      { t: 'Função',    w: 0.17 },
      { t: 'Turno',     w: 0.09 },
      { t: 'Início',    w: 0.09 },
      { t: 'Término',   w: 0.09 },
      { t: 'Telefone',  w: 0.11 },
      { t: 'Valor',     w: 0.10 },
    ].map(c => ({ ...c, px: c.w * conteudoW }));

    let y = doc.y + 4;
    const rowH = 20;
    const drawRow = (vals, opts = {}) => {
      let x = margem;
      if (opts.header) { doc.rect(margem, y, conteudoW, rowH).fill(NAVY); }
      else if (opts.zebra) { doc.rect(margem, y, conteudoW, rowH).fill('#f2f5fa'); }
      cols.forEach((c, i) => {
        doc.fillColor(opts.header ? '#fff' : '#222')
           .font(opts.header ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
           .text(String(vals[i] ?? ''), x + 3, y + 6, { width: c.px - 6, align: c.num ? 'right' : 'left', lineBreak: false });
        x += c.px;
      });
      y += rowH;
    };

    drawRow(cols.map(c => c.t), { header: true });
    if (!vagas.length) {
      doc.fillColor('#999').font('Helvetica-Oblique').fontSize(10)
         .text('Nenhum plantão extra lançado para este dia.', margem, y + 8, { width: conteudoW, align: 'center' });
    } else {
      vagas.forEach((v, idx) => {
        drawRow([
          v.nome, v.matricula || '—', v.funcao || '—', `${v.tipo}h`,
          v.hora_inicio || '—', v.hora_fim || '—', v.telefone || '—',
          `R$ ${Number(v.valor).toFixed(2)}`,
        ], { zebra: idx % 2 === 1 });
      });
      const total = vagas.reduce((a, v) => a + Number(v.valor), 0);
      doc.moveDown(0.5);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10)
         .text(`Total do dia: ${vagas.length} plantão(ões) — R$ ${total.toFixed(2)}`, margem, y + 8, { width: conteudoW, align: 'right' });
    }

    rodapePDF(doc, { info: `Plantões Extras — ${fmtData(dataStr)} — Bananeiras/PB` });
    doc.end();
  }

  return bufferPromise;
}

// ── PDF: lista de extras de um dia ───────────────────────────────────────────
router.get('/dia/:data/pdf', verificarToken, async (req, res) => {
  try {
    const { rows: vagas } = await pool.query(
      `SELECT * FROM extras_vagas WHERE data = $1 ORDER BY criado_em`, [req.params.data]
    );
    const pdfBuffer = await construirPdfDia(req.params.data, vagas);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="extras-${req.params.data}.pdf"`);
    res.end(pdfBuffer);
  } catch (err) { erroServidor(res, err); }
});

// Fechar a lista do dia (comando): trava novas remoções por não-comando e envia o PDF por e-mail
router.post('/dia/:data/fechar', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { data } = req.params;
    await pool.query(
      `INSERT INTO extras_config_dia (data, vagas_total, fechado, fechado_por, fechado_em)
       VALUES ($1, $2, true, $3, NOW())
       ON CONFLICT (data) DO UPDATE SET fechado = true, fechado_por = $3, fechado_em = NOW()`,
      [data, VAGAS_DIA_PADRAO, req.usuario.usuario]
    );
    const { rows: vagas } = await pool.query(
      `SELECT * FROM extras_vagas WHERE data = $1 ORDER BY criado_em`, [data]
    );
    await auditar(req, 'FECHAR_LISTA_EXTRA', `Lista de extras de ${fmtData(data)} fechada (${vagas.length} lançamento(s))`);
    res.json({ ok: true, data, total_vagas: vagas.length });

    construirPdfDia(data, vagas)
      .then(pdfBuffer => enviarPdfNotificacao({
        subject: `Lista de plantões extras fechada — ${fmtData(data)}`,
        html: `<p>A lista de plantões extras de <b>${fmtData(data)}</b> foi fechada por <b>${req.usuario.usuario}</b>, com ${vagas.length} lançamento(s).</p>`,
        pdfBuffer,
        filename: `extras-${data}.pdf`,
      }))
      .catch(err => console.error('[Email-PDF] Falha ao gerar PDF de fechamento de extras:', err.message));
  } catch (err) { erroServidor(res, err); }
});

// ── Relatório de pagamento por período (comando) ─────────────────────────────
router.get('/relatorio', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'Informe início e fim.' });
    const { rows } = await pool.query(
      `SELECT nome, matricula,
              SUM(CASE WHEN tipo='12' THEN 1 ELSE 0 END)::int AS qtd_12,
              SUM(CASE WHEN tipo='24' THEN 1 ELSE 0 END)::int AS qtd_24,
              SUM(CASE WHEN tipo='24' THEN 24 ELSE 12 END)::int AS total_horas,
              COALESCE(SUM(valor),0)::numeric AS total_valor
       FROM extras_vagas WHERE data BETWEEN $1 AND $2
       GROUP BY nome, matricula ORDER BY nome`,
      [inicio, fim]
    );
    const totalGeral = rows.reduce((a, r) => a + Number(r.total_valor), 0);
    res.json({ inicio, fim, linhas: rows, total_geral: totalGeral });
  } catch (err) { erroServidor(res, err); }
});

router.get('/relatorio/pdf', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'Informe início e fim.' });
    const { rows } = await pool.query(
      `SELECT nome, matricula,
              SUM(CASE WHEN tipo='12' THEN 1 ELSE 0 END)::int AS qtd_12,
              SUM(CASE WHEN tipo='24' THEN 1 ELSE 0 END)::int AS qtd_24,
              SUM(CASE WHEN tipo='24' THEN 24 ELSE 12 END)::int AS total_horas,
              COALESCE(SUM(valor),0)::numeric AS total_valor
       FROM extras_vagas WHERE data BETWEEN $1 AND $2
       GROUP BY nome, matricula ORDER BY nome`,
      [inicio, fim]
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="extras-pagamento-${inicio}_a_${fim}.pdf"`);
    const doc = new PDFDocument({ margins: { top: 55, bottom: 65, left: 45, right: 45 }, size: 'A4', bufferPages: true });
    doc.pipe(res);
    const margem = cabecalhoPDF(doc, { titulo: 'Relatório de Pagamento — Plantões Extras', subtitulo: `Período: ${fmtData(inicio)} a ${fmtData(fim)}` });
    const pageW = doc.page.width;
    const conteudoW = pageW - margem * 2;

    const cols = [
      { t: 'Nome',      w: 0.34 },
      { t: 'Matrícula', w: 0.16 },
      { t: '12h',       w: 0.09, num: true },
      { t: '24h',       w: 0.09, num: true },
      { t: 'Horas',     w: 0.12, num: true },
      { t: 'Valor (R$)',w: 0.20, num: true },
    ].map(c => ({ ...c, px: c.w * conteudoW }));

    let y = doc.y + 4;
    const rowH = 20;
    const row = (vals, opts = {}) => {
      let x = margem;
      if (opts.header) doc.rect(margem, y, conteudoW, rowH).fill(NAVY);
      else if (opts.zebra) doc.rect(margem, y, conteudoW, rowH).fill('#f2f5fa');
      cols.forEach((c, i) => {
        doc.fillColor(opts.header ? '#fff' : '#222')
           .font(opts.header || opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(String(vals[i] ?? ''), x + 4, y + 6, { width: c.px - 8, align: c.num ? 'right' : 'left', lineBreak: false });
        x += c.px;
      });
      y += rowH;
    };

    row(cols.map(c => c.t), { header: true });
    if (!rows.length) {
      doc.fillColor('#999').font('Helvetica-Oblique').fontSize(10)
         .text('Nenhum plantão no período.', margem, y + 8, { width: conteudoW, align: 'center' });
    } else {
      rows.forEach((r, idx) => {
        row([r.nome, r.matricula || '—', r.qtd_12, r.qtd_24, `${r.total_horas}h`, Number(r.total_valor).toFixed(2)], { zebra: idx % 2 === 1 });
      });
      const totalGeral = rows.reduce((a, r) => a + Number(r.total_valor), 0);
      const totalHoras = rows.reduce((a, r) => a + Number(r.total_horas), 0);
      row(['TOTAL GERAL', '', '', '', `${totalHoras}h`, totalGeral.toFixed(2)], { bold: true, zebra: true });
    }

    rodapePDF(doc, { info: `Pagamento Extras — ${fmtData(inicio)} a ${fmtData(fim)} — Bananeiras/PB` });
    doc.end();
  } catch (err) { erroServidor(res, err); }
});

module.exports = router;
