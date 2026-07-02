const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, verificarSupervisor } = require('../middleware/auth');
const erroServidor = require('../utils/erroServidor');
const PDFDocument  = require('pdfkit');
const { cabecalhoPDF, rodapePDF, NAVY } = require('../utils/pdfLayout');
const { numeroFolga } = require('../utils/escalaCalc');

const PATRULHAS = ['1', '2', '3', '4'];

function nomeMes(mesRef) {
  const [ano, mes] = String(mesRef).split('-');
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[parseInt(mes, 10) - 1] || mes}/${ano}`;
}

// ── Postos (lista configurável) ──────────────────────────────────────────────
router.get('/postos', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM postos WHERE ativo = true ORDER BY ordem, nome`);
    res.json(rows);
  } catch (err) { erroServidor(res, err); }
});

router.post('/postos', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { nome, seg_sex } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome do posto é obrigatório.' });
    const { rows: [{ mx }] } = await pool.query(`SELECT COALESCE(MAX(ordem),0)+1 AS mx FROM postos`);
    const { rows } = await pool.query(
      `INSERT INTO postos (nome, seg_sex, ordem) VALUES ($1,$2,$3)
       ON CONFLICT (nome) DO UPDATE SET ativo = true RETURNING *`,
      [nome.trim(), seg_sex === true, mx]
    );
    res.status(201).json(rows[0]);
  } catch (err) { erroServidor(res, err); }
});

router.delete('/postos/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    await pool.query(`UPDATE postos SET ativo = false WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { erroServidor(res, err); }
});

// ── Escalas ──────────────────────────────────────────────────────────────────
// Listar escalas (cabeçalhos)
router.get('/', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, numero, mes_referencia, titulo, criado_por, criado_em, atualizado_em
       FROM escalas ORDER BY mes_referencia DESC`
    );
    res.json(rows);
  } catch (err) { erroServidor(res, err); }
});

// Buscar escala por mês (YYYY-MM) com itens
router.get('/mes/:mes', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM escalas WHERE mes_referencia = $1`, [req.params.mes]);
    if (!rows.length) return res.json({ escala: null, itens: [] });
    const escala = rows[0];
    const { rows: itens } = await pool.query(
      `SELECT * FROM escala_itens WHERE escala_id = $1 ORDER BY patrulha, posto, nome`,
      [escala.id]
    );
    res.json({ escala, itens });
  } catch (err) { erroServidor(res, err); }
});

// Buscar escala por id com itens
router.get('/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM escalas WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Escala não encontrada.' });
    const { rows: itens } = await pool.query(
      `SELECT * FROM escala_itens WHERE escala_id = $1 ORDER BY patrulha, posto, nome`,
      [req.params.id]
    );
    res.json({ escala: rows[0], itens });
  } catch (err) { erroServidor(res, err); }
});

// Criar / substituir escala do mês (upsert + replace de itens)
router.post('/', verificarToken, verificarSupervisor, async (req, res) => {
  const client = await pool.connect();
  try {
    const { mes_referencia, titulo, obs, itens } = req.body;
    if (!mes_referencia || !/^\d{4}-\d{2}$/.test(mes_referencia)) {
      return res.status(400).json({ error: 'Mês de referência inválido (use YYYY-MM).' });
    }
    await client.query('BEGIN');

    // Escala já existe para o mês?
    const { rows: existente } = await client.query(
      `SELECT id, numero FROM escalas WHERE mes_referencia = $1`, [mes_referencia]
    );

    let escalaId, numero;
    if (existente.length) {
      escalaId = existente[0].id;
      numero   = existente[0].numero;
      await client.query(
        `UPDATE escalas SET titulo = $1, obs = $2, atualizado_em = NOW() WHERE id = $3`,
        [titulo || null, obs || null, escalaId]
      );
      await client.query(`DELETE FROM escala_itens WHERE escala_id = $1`, [escalaId]);
    } else {
      const ano = mes_referencia.slice(0, 4);
      const { rows: [{ seq }] } = await client.query(`SELECT nextval('esc_seq') AS seq`);
      numero = `ESC-GCM-${String(seq).padStart(4, '0')}/${ano}`;
      const { rows: novo } = await client.query(
        `INSERT INTO escalas (numero, mes_referencia, titulo, obs, criado_por)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [numero, mes_referencia, titulo || null, obs || null, req.usuario.usuario]
      );
      escalaId = novo[0].id;
    }

    for (const it of (itens || [])) {
      if (!it.patrulha || !it.posto || !it.nome) continue;
      await client.query(
        `INSERT INTO escala_itens (escala_id, patrulha, posto, agente_id, nome, matricula, regime, turno, obs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [escalaId, String(it.patrulha), it.posto, it.agente_id || null, it.nome,
         it.matricula || null, it.regime || '24x72', it.turno || null, it.obs || null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: escalaId, numero });
  } catch (err) {
    await client.query('ROLLBACK');
    erroServidor(res, err);
  } finally {
    client.release();
  }
});

// Excluir escala
router.delete('/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id FROM escalas WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Escala não encontrada.' });
    await pool.query(`DELETE FROM escalas WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { erroServidor(res, err); }
});

// ── PDF da escala (colunas = Patrulhas 1..4 + bloco Seg–Sex) ─────────────────
router.get('/:id/pdf', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM escalas WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Escala não encontrada.' });
    const escala = rows[0];
    const { rows: itens } = await pool.query(
      `SELECT * FROM escala_itens WHERE escala_id = $1 ORDER BY patrulha, posto, nome`,
      [escala.id]
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="escala-${escala.mes_referencia}.pdf"`);

    const doc = new PDFDocument({ margins: { top: 55, bottom: 65, left: 40, right: 40 }, size: 'A4', layout: 'landscape', bufferPages: true });
    doc.pipe(res);

    const margem = cabecalhoPDF(doc, { titulo: `Escala de Serviço — ${nomeMes(escala.mes_referencia)}`, subtitulo: escala.titulo || 'Guarda Civil Municipal de Bananeiras/PB' });
    const pageW  = doc.page.width;
    const conteudoW = pageW - margem * 2;

    // 4 colunas para as patrulhas
    const colGap = 10;
    const colW   = (conteudoW - colGap * 3) / 4;
    const topY   = doc.y + 4;

    PATRULHAS.forEach((p, idx) => {
      const x = margem + idx * (colW + colGap);
      let y = topY;
      // Cabeçalho da coluna
      doc.rect(x, y, colW, 22).fill(NAVY);
      doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold')
         .text(`PATRULHA ${p}`, x, y + 6, { width: colW, align: 'center' });
      y += 26;

      const itensP = itens.filter(i => i.patrulha === p);
      // Agrupa por posto
      const porPosto = {};
      itensP.forEach(i => { (porPosto[i.posto] = porPosto[i.posto] || []).push(i); });
      const postos = Object.keys(porPosto);
      if (!postos.length) {
        doc.fillColor('#999').fontSize(8).font('Helvetica-Oblique')
           .text('(sem lançamentos)', x, y + 2, { width: colW, align: 'center' });
      }
      postos.forEach(posto => {
        doc.fillColor(NAVY).fontSize(8.5).font('Helvetica-Bold')
           .text(posto.toUpperCase(), x + 2, y, { width: colW - 4 });
        y = doc.y + 1;
        porPosto[posto].forEach(i => {
          const reg = i.regime === '12x36' ? ` (12x36${i.turno ? '/' + i.turno[0].toUpperCase() : ''})` : '';
          doc.fillColor('#222').fontSize(8).font('Helvetica')
             .text(`• ${i.nome}${i.matricula ? ' — ' + i.matricula : ''}${reg}`, x + 4, y, { width: colW - 6 });
          y = doc.y + 0.5;
        });
        y += 2;
      });
    });

    // Bloco administrativo Seg–Sex (patrulha = 'ADM')
    const adm = itens.filter(i => i.patrulha === 'ADM');
    if (adm.length) {
      doc.y = Math.max(doc.y, topY + 260);
      doc.moveDown(0.5);
      doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold')
         .text('ADMINISTRATIVO — SEGUNDA A SEXTA', margem, doc.y, { width: conteudoW });
      doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(0.8).stroke(NAVY);
      doc.moveDown(0.4);
      const porPosto = {};
      adm.forEach(i => { (porPosto[i.posto] = porPosto[i.posto] || []).push(i); });
      Object.keys(porPosto).forEach(posto => {
        const nomes = porPosto[posto].map(i => `${i.nome}${i.matricula ? ' (' + i.matricula + ')' : ''}`).join(', ');
        doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text(`${posto}: `, { continued: true })
           .fillColor('#222').font('Helvetica').text(nomes);
      });
    }

    if (escala.obs) {
      doc.moveDown(0.8);
      doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text('Observações: ', { continued: true })
         .fillColor('#222').font('Helvetica').text(escala.obs);
    }

    rodapePDF(doc, { info: `Escala ${escala.numero || ''} — ${nomeMes(escala.mes_referencia)} — Bananeiras/PB` });
    doc.end();
  } catch (err) { erroServidor(res, err); }
});

module.exports = router;
