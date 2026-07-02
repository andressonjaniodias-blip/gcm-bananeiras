const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, verificarSupervisor } = require('../middleware/auth');
const erroServidor = require('../utils/erroServidor');
const PDFDocument  = require('pdfkit');
const { cabecalhoPDF, rodapePDF, fmtData, NAVY } = require('../utils/pdfLayout');

function nomeMes(mesRef) {
  const [ano, mes] = String(mesRef).split('-');
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[parseInt(mes, 10) - 1] || mes}/${ano}`;
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
        `SELECT * FROM ferias WHERE data_inicio <= $2 AND data_fim >= $1 ORDER BY data_inicio, nome`,
        [inicioMes, fimMes]
      ));
    } else {
      ({ rows } = await pool.query(`SELECT * FROM ferias ORDER BY data_inicio DESC, nome`));
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
    res.status(201).json(rows[0]);
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
    res.json(rows[0]);
  } catch (err) { erroServidor(res, err); }
});

// Excluir
router.delete('/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    await pool.query(`DELETE FROM ferias WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { erroServidor(res, err); }
});

// PDF (por mês, ou período)
router.get('/pdf', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { mes, inicio, fim } = req.query;
    let rows, subtitulo, arq;
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const inicioMes = `${mes}-01`;
      const [ano, m] = mes.split('-');
      const fimMes = `${mes}-${String(new Date(parseInt(ano), parseInt(m), 0).getDate()).padStart(2, '0')}`;
      ({ rows } = await pool.query(
        `SELECT * FROM ferias WHERE data_inicio <= $2 AND data_fim >= $1 ORDER BY data_inicio, nome`,
        [inicioMes, fimMes]
      ));
      subtitulo = `Referência: ${nomeMes(mes)}`;
      arq = `ferias-${mes}.pdf`;
    } else if (inicio && fim) {
      ({ rows } = await pool.query(
        `SELECT * FROM ferias WHERE data_inicio <= $2 AND data_fim >= $1 ORDER BY data_inicio, nome`,
        [inicio, fim]
      ));
      subtitulo = `Período: ${fmtData(inicio)} a ${fmtData(fim)}`;
      arq = `ferias-${inicio}_a_${fim}.pdf`;
    } else {
      ({ rows } = await pool.query(`SELECT * FROM ferias ORDER BY data_inicio DESC, nome`));
      subtitulo = 'Todos os registros';
      arq = 'ferias.pdf';
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${arq}"`);
    const doc = new PDFDocument({ margins: { top: 55, bottom: 65, left: 45, right: 45 }, size: 'A4', bufferPages: true });
    doc.pipe(res);
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
    const rowH = 20;
    const row = (vals, opts = {}) => {
      let x = margem;
      if (opts.header) doc.rect(margem, y, conteudoW, rowH).fill(NAVY);
      else if (opts.zebra) doc.rect(margem, y, conteudoW, rowH).fill('#f2f5fa');
      cols.forEach((c, i) => {
        doc.fillColor(opts.header ? '#fff' : '#222')
           .font(opts.header ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(String(vals[i] ?? ''), x + 4, y + 6, { width: c.px - 8, align: c.num ? 'right' : 'left', lineBreak: false });
        x += c.px;
      });
      y += rowH;
    };

    row(cols.map(c => c.t), { header: true });
    if (!rows.length) {
      doc.fillColor('#999').font('Helvetica-Oblique').fontSize(10)
         .text('Nenhuma férias registrada.', margem, y + 8, { width: conteudoW, align: 'center' });
    } else {
      rows.forEach((r, idx) => {
        const dias = Math.round((new Date(r.data_fim) - new Date(r.data_inicio)) / 86400000) + 1;
        row([r.nome, r.matricula || '—', fmtData(r.data_inicio), fmtData(r.data_fim), dias], { zebra: idx % 2 === 1 });
      });
    }

    rodapePDF(doc, { info: `Escala de Férias — Bananeiras/PB` });
    doc.end();
  } catch (err) { erroServidor(res, err); }
});

module.exports = router;
