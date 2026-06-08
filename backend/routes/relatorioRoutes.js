const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken } = require('../middleware/auth');
const PDFDocument = require('pdfkit');

// Próximo número disponível
router.get('/proximo-numero', verificarToken, async (req, res) => {
  try {
    const ano = new Date().getFullYear();
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM relatorios WHERE numero LIKE $1`,
      [`REL-GCM-%/${ano}`]
    );
    const seq = String(Number(rows[0].count) + 1).padStart(4, '0');
    res.json({ numero: `REL-GCM-${seq}/${ano}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar relatórios
router.get('/', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, numero, tipo, titulo, data, status, criado_por, criado_em
       FROM relatorios ORDER BY criado_em DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar relatório
router.post('/', verificarToken, async (req, res) => {
  try {
    const { tipo, titulo, data, local, equipe, conteudo, obs, status } = req.body;
    if (!tipo || !titulo || !data) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });

    const ano = new Date().getFullYear();
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM relatorios WHERE numero LIKE $1`,
      [`REL-GCM-%/${ano}`]
    );
    const seq    = String(Number(countRows[0].count) + 1).padStart(4, '0');
    const numero = `REL-GCM-${seq}/${ano}`;

    const { rows } = await pool.query(
      `INSERT INTO relatorios (numero, tipo, titulo, data, local, equipe, conteudo, obs, status, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, numero`,
      [numero, tipo, titulo, data, local || null, equipe || null, conteudo || null, obs || null, status || 'rascunho', req.usuario]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar relatório
router.put('/:id', verificarToken, async (req, res) => {
  try {
    const { tipo, titulo, data, local, equipe, conteudo, obs, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE relatorios SET tipo=$1, titulo=$2, data=$3, local=$4, equipe=$5,
       conteudo=$6, obs=$7, status=$8 WHERE id=$9 AND criado_por=$10 RETURNING id, numero`,
      [tipo, titulo, data, local || null, equipe || null, conteudo || null, obs || null, status || 'rascunho', req.params.id, req.usuario]
    );
    if (!rows.length) return res.status(404).json({ error: 'Relatório não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exportar PDF
router.get('/:id/pdf', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM relatorios WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Relatório não encontrado.' });
    const r = rows[0];

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio_${r.numero.replace(/\//g, '-')}.pdf"`);

    const doc = new PDFDocument({ margin: 60, size: 'A4' });
    doc.pipe(res);

    // Cabeçalho
    doc.fontSize(14).font('Helvetica-Bold')
       .text('GUARDA CIVIL MUNICIPAL — BANANEIRAS/PB', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica')
       .text('RELATÓRIO INTERNO', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke();
    doc.moveDown(0.5);

    // Metadados
    const campo = (label, valor) => {
      doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true })
         .font('Helvetica').text(valor || '—');
    };
    campo('Número',    r.numero);
    campo('Tipo',      r.tipo);
    campo('Título',    r.titulo);
    campo('Data',      new Date(r.data).toLocaleDateString('pt-BR'));
    campo('Relator',   r.criado_por);
    if (r.local)  campo('Local / Área', r.local);
    if (r.equipe) campo('Viatura / Equipe', r.equipe);
    doc.moveDown(0.5);
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke();
    doc.moveDown(0.5);

    // Conteúdo
    doc.fontSize(10).font('Helvetica-Bold').text('CONTEÚDO DO RELATÓRIO');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').text(r.conteudo || '', { align: 'justify', lineGap: 4 });

    if (r.obs) {
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica-Bold').text('OBSERVAÇÕES');
      doc.moveDown(0.3);
      doc.font('Helvetica').text(r.obs, { align: 'justify', lineGap: 4 });
    }

    // Rodapé com assinatura
    doc.moveDown(2);
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke();
    doc.moveDown(0.4);
    doc.fontSize(9).font('Helvetica')
       .text(`${r.criado_por} — Agente GCM`, { align: 'center' });
    doc.text(`Bananeiras/PB, ${new Date().toLocaleDateString('pt-BR')}`, { align: 'center' });
    doc.text(`Status: ${r.status}`, { align: 'center' });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
