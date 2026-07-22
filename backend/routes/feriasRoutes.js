const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, verificarSupervisor, auditar } = require('../middleware/auth');
const erroServidor = require('../utils/erroServidor');
const PDFDocument  = require('pdfkit');
const { cabecalhoPDF, rodapePDF, fmtData, NAVY } = require('../utils/pdfLayout');
const { coletarPdfBuffer } = require('../utils/pdfBuffer');
const { enviarPdfNotificacao } = require('../utils/email');
const { sqlNomeExibicao, nomeCurto } = require('../utils/nomeAgente');

// Toda leitura de férias sai com o nome do agente vinculado, caindo no nome gravado
// no registro quando não há vínculo (agente removido do efetivo). A redução para
// dois nomes acontece na exibição — ver utils/nomeAgente.js.
const SELECT_FERIAS = `SELECT f.*, ${sqlNomeExibicao('a', 'f.nome')}
    FROM ferias f LEFT JOIN agentes a ON a.id = f.agente_id`;

function nomeMes(mesRef) {
  const [ano, mes] = String(mesRef).split('-');
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[parseInt(mes, 10) - 1] || mes}/${ano}`;
}

async function feriasDoMes(mes) {
  const inicioMes = `${mes}-01`;
  const [ano, m] = mes.split('-');
  const fimMes = `${mes}-${String(new Date(parseInt(ano), parseInt(m), 0).getDate()).padStart(2, '0')}`;
  const { rows } = await pool.query(
    `${SELECT_FERIAS} WHERE f.data_inicio <= $2 AND f.data_fim >= $1 ORDER BY f.data_inicio, nome_exibicao`,
    [inicioMes, fimMes]
  );
  return rows;
}

// Listar férias (opcional ?mes=YYYY-MM = períodos que tocam o mês)
router.get('/', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { mes } = req.query;
    let rows;
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const inicioMes = `${mes}-01`;
      const [ano, m] = mes.split('-');
      const fimMes = `${mes}-${String(new Date(parseInt(ano), parseInt(m), 0).getDate()).padStart(2, '0')}`;
      ({ rows } = await pool.query(
        `${SELECT_FERIAS} WHERE f.data_inicio <= $2 AND f.data_fim >= $1 ORDER BY f.data_inicio, nome_exibicao`,
        [inicioMes, fimMes]
      ));
    } else {
      ({ rows } = await pool.query(`${SELECT_FERIAS} ORDER BY f.data_inicio DESC, nome_exibicao`));
    }
    res.json(rows);
  } catch (err) { erroServidor(res, err); }
});

// Criar
router.post('/', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { agente_id, nome, matricula, data_inicio, data_fim, obs } = req.body;
    if (!nome || !data_inicio || !data_fim) return res.status(400).json({ error: 'Nome, início e fim são obrigatórios.' });
    if (data_fim < data_inicio) return res.status(400).json({ error: 'Data final anterior à inicial.' });
    const { rows } = await pool.query(
      `INSERT INTO ferias (agente_id, nome, matricula, data_inicio, data_fim, obs, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [agente_id || null, nome, matricula || null, data_inicio, data_fim, obs || null, req.usuario.usuario]
    );
    await auditar(req, 'CRIAR_FERIAS', `${nome} — ${data_inicio} a ${data_fim}`);
    res.status(201).json(rows[0]);

    const mesRef = String(data_inicio).slice(0, 7);
    feriasDoMes(mesRef)
      .then(rowsDoMes => construirPdfFerias(rowsDoMes, `Referência: ${nomeMes(mesRef)}`))
      .then(pdfBuffer => enviarPdfNotificacao({
        subject: `Férias cadastradas — ${nome} (${nomeMes(mesRef)})`,
        html: `<p>Férias de <b>${nome}</b> cadastradas por <b>${req.usuario.usuario}</b>: ${fmtData(data_inicio)} a ${fmtData(data_fim)}.</p>`,
        pdfBuffer,
        filename: `ferias-${mesRef}.pdf`,
      }))
      .catch(err => console.error('[Email-PDF] Falha ao gerar PDF de férias para envio:', err.message));
  } catch (err) { erroServidor(res, err); }
});

// Editar
router.put('/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows: atual } = await pool.query(`SELECT * FROM ferias WHERE id = $1`, [req.params.id]);
    if (!atual.length) return res.status(404).json({ error: 'Registro não encontrado.' });
    const a = atual[0];
    const { nome, matricula, data_inicio, data_fim, obs } = req.body;
    const ini = data_inicio ?? a.data_inicio;
    const fim = data_fim ?? a.data_fim;
    if (String(fim) < String(ini)) return res.status(400).json({ error: 'Data final anterior à inicial.' });
    const { rows } = await pool.query(
      `UPDATE ferias SET nome=$1, matricula=$2, data_inicio=$3, data_fim=$4, obs=$5 WHERE id=$6 RETURNING *`,
      [nome ?? a.nome, matricula ?? a.matricula, ini, fim, obs ?? a.obs, req.params.id]
    );
    await auditar(req, 'ALTERAR_FERIAS', `${rows[0].nome} — ${rows[0].data_inicio} a ${rows[0].data_fim}`);
    res.json(rows[0]);
  } catch (err) { erroServidor(res, err); }
});

// Excluir
router.delete('/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM ferias WHERE id = $1 RETURNING nome, data_inicio, data_fim`, [req.params.id]);
    if (rows.length) await auditar(req, 'REMOVER_FERIAS', `${rows[0].nome} — ${rows[0].data_inicio} a ${rows[0].data_fim}`);
    res.json({ ok: true });
  } catch (err) { erroServidor(res, err); }
});

async function construirPdfFerias(rows, subtitulo) {
  const doc = new PDFDocument({ margins: { top: 55, bottom: 65, left: 45, right: 45 }, size: 'A4', bufferPages: true });
  const bufferPromise = coletarPdfBuffer(doc);

  {
    const margem = cabecalhoPDF(doc, { titulo: 'Escala de Férias', subtitulo });
    const pageW = doc.page.width;
    const conteudoW = pageW - margem * 2;

    const cols = [
      { t: 'Agente',    w: 0.40 },
      { t: 'Matrícula', w: 0.16 },
      { t: 'Início',    w: 0.16 },
      { t: 'Término',   w: 0.16 },
      { t: 'Dias',      w: 0.12, num: true },
    ].map(c => ({ ...c, px: c.w * conteudoW }));

    let y = doc.y + 4;
    const rowH = 24;
    const row = (vals, opts = {}) => {
      let x = margem;
      if (opts.header) doc.rect(margem, y, conteudoW, rowH).fill(NAVY);
      else if (opts.zebra) doc.rect(margem, y, conteudoW, rowH).fill('#f2f5fa');
      cols.forEach((c, i) => {
        doc.fillColor(opts.header ? '#fff' : '#222')
           .font(opts.header ? 'Helvetica-Bold' : 'Helvetica').fontSize(12)
           .text(String(vals[i] ?? ''), x + 4, y + 7, { width: c.px - 8, align: c.num ? 'right' : 'left', lineBreak: false });
        x += c.px;
      });
      y += rowH;
    };

    row(cols.map(c => c.t), { header: true });
    if (!rows.length) {
      doc.fillColor('#999').font('Helvetica-Oblique').fontSize(12)
         .text('Nenhuma férias registrada.', margem, y + 8, { width: conteudoW, align: 'center' });
    } else {
      rows.forEach((r, idx) => {
        const dias = Math.round((new Date(r.data_fim) - new Date(r.data_inicio)) / 86400000) + 1;
        row([nomeCurto(r.nome_exibicao || r.nome), r.matricula || '—', fmtData(r.data_inicio), fmtData(r.data_fim), dias], { zebra: idx % 2 === 1 });
      });
    }

    rodapePDF(doc, { info: `Escala de Férias — Bananeiras/PB` });
    doc.end();
  }

  return bufferPromise;
}

// PDF (por mês, ou período)
router.get('/pdf', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { mes, inicio, fim } = req.query;
    let rows, subtitulo, arq;
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      rows = await feriasDoMes(mes);
      subtitulo = `Referência: ${nomeMes(mes)}`;
      arq = `ferias-${mes}.pdf`;
    } else if (inicio && fim) {
      ({ rows } = await pool.query(
        `${SELECT_FERIAS} WHERE f.data_inicio <= $2 AND f.data_fim >= $1 ORDER BY f.data_inicio, nome_exibicao`,
        [inicio, fim]
      ));
      subtitulo = `Período: ${fmtData(inicio)} a ${fmtData(fim)}`;
      arq = `ferias-${inicio}_a_${fim}.pdf`;
    } else {
      ({ rows } = await pool.query(`${SELECT_FERIAS} ORDER BY f.data_inicio DESC, nome_exibicao`));
      subtitulo = 'Todos os registros';
      arq = 'ferias.pdf';
    }

    const pdfBuffer = await construirPdfFerias(rows, subtitulo);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${arq}"`);
    res.end(pdfBuffer);
  } catch (err) { erroServidor(res, err); }
});

module.exports = router;
