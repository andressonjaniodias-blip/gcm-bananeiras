const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, verificarSupervisor } = require('../middleware/auth');
const erroServidor = require('../utils/erroServidor');
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
    erroServidor(res, err);
  }
});

// Listar relatórios
router.get('/', verificarToken, async (req, res) => {
  try {
    const { usuario, role } = req.usuario;
    let rows;
    if (role === 'agente') {
      ({ rows } = await pool.query(
        `SELECT id, numero, tipo, titulo, data, status, criado_por, criado_em
         FROM relatorios WHERE criado_por = $1 ORDER BY criado_em DESC`,
        [usuario]
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT id, numero, tipo, titulo, data, status, criado_por, criado_em
         FROM relatorios ORDER BY criado_em DESC`
      ));
    }
    res.json(rows);
  } catch (err) {
    erroServidor(res, err);
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
      [numero, tipo, titulo, data, local || null, equipe || null, conteudo || null, obs || null, status || 'rascunho', req.usuario.usuario]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    erroServidor(res, err);
  }
});

// Exportar PDF
router.get('/:id/pdf', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM relatorios WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Relatório não encontrado.' });
    const r = rows[0];

    const { usuario, role } = req.usuario;
    if (role === 'agente' && r.criado_por !== usuario) {
      return res.status(403).json({ error: 'Acesso negado a este relatório.' });
    }

    const path = require('path');
    const fs   = require('fs');
    const brasaoGCM        = path.join(__dirname, '../../public/brasao-gcm.png');
    const brasaoPrefeitura = path.join(__dirname, '../../public/brasao-prefeitura.png');
    const NAVY = '#0e2a52';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio_${r.numero.replace(/\//g, '-')}.pdf"`);

    const doc = new PDFDocument({ margins: { top: 55, bottom: 65, left: 55, right: 55 }, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const pageW     = doc.page.width;
    const margem    = 55;
    const conteudoW = pageW - margem * 2;
    const imgSize   = 60;

    const dataRodape  = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const localRodape = r.local ? `${r.local}, ` : 'Bananeiras/PB, ';
    const rodapeInfo  = `Relatório Nº ${r.numero}  —  ${localRodape}${dataRodape}`;

    // ── Cabeçalho com brasões ─────────────────────────────────────────────────
    const temGCM        = fs.existsSync(brasaoGCM);
    const temPrefeitura = fs.existsSync(brasaoPrefeitura);

    if (temGCM)        doc.image(brasaoGCM,        margem, 30, { width: imgSize });
    if (temPrefeitura) doc.image(brasaoPrefeitura, pageW - margem - imgSize, 30, { width: imgSize });

    doc.fontSize(17).font('Helvetica-Bold').fillColor(NAVY)
       .text('PREFEITURA MUNICIPAL DE BANANEIRAS', margem, 33, { width: conteudoW, align: 'center' });
    doc.fontSize(14).font('Helvetica-Bold')
       .text('GUARDA CIVIL MUNICIPAL', { width: conteudoW, align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#444')
       .text('Secretaria de Administração Pública Municipal', { width: conteudoW, align: 'center' });

    const posLinha = Math.max(doc.y + 4, 96);
    doc.moveTo(margem, posLinha).lineTo(pageW - margem, posLinha).lineWidth(2).stroke(NAVY);

    // Título do relatório
    doc.y = posLinha + 8;
    doc.fontSize(16).font('Helvetica-Bold').fillColor(NAVY)
       .text(`RELATÓRIO INTERNO  Nº ${r.numero}`, { width: conteudoW, align: 'center' });
    doc.fontSize(12).font('Helvetica-Bold')
       .text(r.titulo.toUpperCase(), { width: conteudoW, align: 'center' });
    doc.moveDown(0.6);
    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(0.5).stroke('#555');
    doc.moveDown(0.7);

    // ── Metadados em tabela de duas colunas ───────────────────────────────────
    const campo = (label, valor) => {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#333')
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
    doc.fontSize(12).font('Helvetica-Bold').fillColor(NAVY)
       .text('CONTEÚDO DO RELATÓRIO');
    doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(0.8).stroke(NAVY);
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').fillColor('#000')
       .text(r.conteudo || '(sem conteúdo)', { align: 'justify', lineGap: 3 });

    if (r.obs) {
      doc.moveDown(0.8);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(NAVY)
         .text('OBSERVAÇÕES');
      doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(0.8).stroke(NAVY);
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica').fillColor('#000')
         .text(r.obs, { align: 'justify', lineGap: 3 });
    }

    // ── Anexos (imagens) no final do PDF — sempre incluídos ──────────────────
    const { rows: anexos } = await pool.query(
      `SELECT * FROM anexos WHERE tipo_ref='relatorio' AND ref_id=$1 ORDER BY criado_em ASC`,
      [req.params.id]
    );
    // PDFKit suporta apenas JPEG e PNG nativamente; outros formatos vão para seção de listagem
    const PDF_IMG_MIMES = new Set(['image/jpeg', 'image/png']);
    const ALL_IMG_MIMES = new Set(['image/jpeg','image/png','image/gif','image/webp','image/bmp','image/tiff']);
    const imgs   = anexos.filter(a => PDF_IMG_MIMES.has(a.mime_type));
    const outros = anexos.filter(a => !PDF_IMG_MIMES.has(a.mime_type));

    if (anexos.length) {
      const tituloSec = (txt) => {
        doc.fontSize(12).font('Helvetica-Bold').fillColor(NAVY).text(txt.toUpperCase());
        doc.moveTo(margem, doc.y+1).lineTo(pageW-margem, doc.y+1).lineWidth(0.8).stroke(NAVY);
        doc.moveDown(0.5);
      };

      doc.addPage();
      tituloSec('Anexos');
      let numAnexo = 0;

      for (const img of imgs) {
        numAnexo++;
        const filePath = path.join(__dirname, '../uploads/relatorio', img.nome_arquivo);
        if (!fs.existsSync(filePath)) continue;
        doc.addPage();
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#333')
           .text(`Anexo ${numAnexo}: ${img.nome_original}`, { align: 'center' });
        doc.moveDown(0.4);
        const maxW = conteudoW;
        const maxH = doc.page.height - doc.y - 80;
        try {
          const imgObj  = doc.openImage(filePath);
          const scale   = Math.min(maxW / imgObj.width, maxH / imgObj.height);
          const scaledW = imgObj.width  * scale;
          const scaledH = imgObj.height * scale;
          const xCentro = margem + (maxW - scaledW) / 2;
          doc.image(filePath, xCentro, doc.y, { width: scaledW, height: scaledH });
        } catch (imgErr) {
          console.error(`[PDF-Rel] Erro ao incorporar ${img.nome_original}:`, imgErr.message);
          doc.fontSize(10).font('Helvetica-Oblique').fillColor('#888')
             .text('(Falha ao renderizar imagem — arquivo pode estar corrompido)', { align: 'center' });
        }
      }

      if (outros.length) {
        if (imgs.length) doc.addPage();
        tituloSec('Outros Anexos (não incorporados ao PDF)');
        outros.forEach((a, i) => {
          const tipoInfo = ALL_IMG_MIMES.has(a.mime_type)
            ? `${a.mime_type} — formato de imagem não suportado (use JPG ou PNG)`
            : (a.mime_type || 'desconhecido');
          doc.fontSize(11).font('Helvetica').fillColor('#444')
             .text(`${imgs.length + i + 1}. ${a.nome_original} — ${tipoInfo}`);
        });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica-Oblique').fillColor('#888')
           .text('Consulte o sistema para acessar os arquivos não incorporados ao PDF.');
      }
    }

    // ── Rodapé / Assinatura ───────────────────────────────────────────────────
    doc.moveDown(2.5);
    const centroX = pageW / 2;
    const linhaY  = doc.y;
    doc.moveTo(centroX - 110, linhaY).lineTo(centroX + 110, linhaY).lineWidth(0.8).stroke('#000');
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000')
       .text(String(r.criado_por).toUpperCase(), { align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#333')
       .text('Agente GCM — Guarda Civil Municipal de Bananeiras/PB', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(0.3).stroke('#aaa');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
       .text(
         `Documento gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} — ${r.numero}`,
         { align: 'center' }
       );

    // ── Rodapé em todas as páginas ────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(i);
      // Zera margem inferior para evitar que o PDFKit crie páginas extras
      doc.page.margins.bottom = 0;
      const pageH = doc.page.height;
      const baseY = pageH - 42;
      doc.moveTo(margem, baseY).lineTo(pageW - margem, baseY).lineWidth(0.5).strokeColor('#aaa').stroke();
      doc.fontSize(8).font('Helvetica').fillColor('#555')
         .text(rodapeInfo, margem, baseY + 6, { width: conteudoW - 70, align: 'left', lineBreak: false });
      doc.text(`Página ${i + 1} de ${total}`, margem, baseY + 6, { width: conteudoW, align: 'right', lineBreak: false });
    }

    doc.flushPages();
    doc.end();
  } catch (err) {
    erroServidor(res, err);
  }
});

// Excluir relatório (admin/supervisor apenas)
router.delete('/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id FROM relatorios WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Relatório não encontrado.' });

    await pool.query(`DELETE FROM anexos WHERE tipo_ref='relatorio' AND ref_id=$1`, [req.params.id]);
    await pool.query(`DELETE FROM relatorios WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    erroServidor(res, err);
  }
});

module.exports = router;
