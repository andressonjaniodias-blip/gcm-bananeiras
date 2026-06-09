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

    const path = require('path');
    const fs   = require('fs');
    const brasaoGCM        = path.join(__dirname, '../../public/brasao-gcm.png');
    const brasaoPrefeitura = path.join(__dirname, '../../public/brasao-prefeitura.png');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio_${r.numero.replace(/\//g, '-')}.pdf"`);

    const doc = new PDFDocument({ margin: 55, size: 'A4' });
    doc.pipe(res);

    const pageW     = doc.page.width;
    const margem    = 55;
    const conteudoW = pageW - margem * 2;
    const imgSize   = 60;

    // ── Cabeçalho com brasões ─────────────────────────────────────────────────
    const temGCM        = fs.existsSync(brasaoGCM);
    const temPrefeitura = fs.existsSync(brasaoPrefeitura);

    if (temGCM)        doc.image(brasaoGCM,        margem, 30, { width: imgSize });
    if (temPrefeitura) doc.image(brasaoPrefeitura, pageW - margem - imgSize, 30, { width: imgSize });

    doc.fontSize(14).font('Helvetica-Bold')
       .text('PREFEITURA MUNICIPAL DE BANANEIRAS', margem, 33, { width: conteudoW, align: 'center' });
    doc.fontSize(12).font('Helvetica-Bold')
       .text('GUARDA CIVIL MUNICIPAL', { width: conteudoW, align: 'center' });
    doc.fontSize(9).font('Helvetica')
       .text('Secretaria de Segurança Pública Municipal', { width: conteudoW, align: 'center' });

    const posLinha = Math.max(doc.y + 4, 96);
    doc.moveTo(margem, posLinha).lineTo(pageW - margem, posLinha).lineWidth(2).stroke('#000');

    // Título do relatório
    doc.y = posLinha + 8;
    doc.fontSize(13).font('Helvetica-Bold')
       .text('RELATÓRIO INTERNO', { width: conteudoW, align: 'center' });
    doc.fontSize(10).font('Helvetica-Bold')
       .text(r.titulo.toUpperCase(), { width: conteudoW, align: 'center' });
    doc.moveDown(0.6);
    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(0.5).stroke('#555');
    doc.moveDown(0.7);

    // ── Metadados em tabela de duas colunas ───────────────────────────────────
    const campo = (label, valor) => {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333')
         .text(`${label}: `, { continued: true })
         .font('Helvetica').fillColor('#000')
         .text(valor || '—');
    };

    campo('Número',          r.numero);
    campo('Tipo',            r.tipo ? r.tipo.toUpperCase() : '—');
    campo('Data',            new Date(r.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }));
    campo('Relator',         String(r.criado_por).toUpperCase());
    if (r.local)  campo('Local / Área',     r.local);
    if (r.equipe) campo('Viatura / Equipe', r.equipe.toUpperCase());
    campo('Status',          r.status ? r.status.toUpperCase() : '—');

    doc.moveDown(0.5);
    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(0.5).stroke('#555');
    doc.moveDown(0.7);

    // ── Conteúdo ──────────────────────────────────────────────────────────────
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
       .text('CONTEÚDO DO RELATÓRIO');
    doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(0.8).stroke('#222');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#000')
       .text(r.conteudo || '(sem conteúdo)', { align: 'justify', lineGap: 3 });

    if (r.obs) {
      doc.moveDown(0.8);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
         .text('OBSERVAÇÕES');
      doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(0.8).stroke('#222');
      doc.moveDown(0.5);
      doc.font('Helvetica').fillColor('#000')
         .text(r.obs, { align: 'justify', lineGap: 3 });
    }

    // ── Rodapé / Assinatura ───────────────────────────────────────────────────
    doc.moveDown(2.5);
    const centroX = pageW / 2;
    const linhaY  = doc.y;
    doc.moveTo(centroX - 110, linhaY).lineTo(centroX + 110, linhaY).lineWidth(0.8).stroke('#000');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
       .text(String(r.criado_por).toUpperCase(), { align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor('#333')
       .text('Agente GCM — Guarda Civil Municipal de Bananeiras/PB', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(0.3).stroke('#aaa');
    doc.moveDown(0.3);
    doc.fontSize(8).font('Helvetica').fillColor('#666')
       .text(
         `Documento gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} — ${r.numero}`,
         { align: 'center' }
       );

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
