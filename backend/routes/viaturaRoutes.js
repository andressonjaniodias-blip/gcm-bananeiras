const express      = require('express');
const router       = express.Router();
const pool         = require('../config/db');
const { verificarToken } = require('../middleware/auth');
const erroServidor = require('../utils/erroServidor');
const PDFDocument  = require('pdfkit');
const path         = require('path');
const fs           = require('fs');

const brasaoGCM        = path.join(__dirname, '../../public/brasao-gcm.png');
const brasaoPrefeitura = path.join(__dirname, '../../public/brasao-prefeitura.png');
const NAVY = '#0e2a52';
const TIPO_LABEL = { abastecimento: 'Abastecimento', revisao: 'Revisão', manutencao: 'Manutenção' };

const VTR_MAX_SQL = `
  SELECT COALESCE(MAX(
    CASE
      WHEN numero ~ '^VTR-GCM-[0-9]+/[0-9]{4}$'
      THEN CAST(REGEXP_REPLACE(numero, '^VTR-GCM-([0-9]+)/[0-9]{4}$', '\\1') AS INTEGER)
      ELSE 0
    END
  ), 0) AS max_seq FROM controle_viatura
`;

// Listar registros
router.get('/', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, tipo, codigo, data_hora, km, responsavel, dados, obs, numero
       FROM controle_viatura ORDER BY data_hora DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    erroServidor(res, err);
  }
});

// Criar registro
router.post('/', verificarToken, async (req, res) => {
  try {
    const { tipo, codigo, dataHora, km, responsavel, dados, obs } = req.body;
    if (!tipo || !codigo || !dataHora || km === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }
    const { rows: maxRows } = await pool.query(VTR_MAX_SQL);
    const seq    = parseInt(maxRows[0].max_seq) + 1;
    const ano    = new Date(dataHora).getFullYear();
    const numero = `VTR-GCM-${String(seq).padStart(4, '0')}/${ano}`;
    const { rows } = await pool.query(
      `INSERT INTO controle_viatura (tipo, codigo, data_hora, km, responsavel, dados, obs, criado_por, numero)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, numero`,
      [tipo, codigo, dataHora, km, responsavel || req.usuario?.usuario, JSON.stringify(dados || {}), obs || null, req.usuario?.usuario, numero]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    erroServidor(res, err);
  }
});

// Exportar PDF de um registro de viatura
router.get('/:id/pdf', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`SELECT * FROM controle_viatura WHERE id=$1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Registro não encontrado.' });
    const r = rows[0];

    const dados = typeof r.dados === 'string' ? JSON.parse(r.dados) : (r.dados || {});
    const nomeRegistro = r.numero || `VTR-GCM-${String(r.id).padStart(4, '0')}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeRegistro.replace(/\//g, '-')}.pdf"`);

    const doc = new PDFDocument({ margins: { top: 55, bottom: 65, left: 55, right: 55 }, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const pageW     = doc.page.width;
    const margem    = 55;
    const conteudoW = pageW - margem * 2;
    const imgSize   = 60;

    const dataRodape = new Date(r.data_hora).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const rodapeInfo = `Viatura ${r.codigo} — ${nomeRegistro} — Bananeiras/PB, ${dataRodape}`;

    // ── Cabeçalho com brasões ─────────────────────────────────────────────────
    if (fs.existsSync(brasaoGCM))        doc.image(brasaoGCM,        margem, 30, { width: imgSize });
    if (fs.existsSync(brasaoPrefeitura)) doc.image(brasaoPrefeitura, pageW - margem - imgSize, 30, { width: imgSize });

    doc.fontSize(17).font('Helvetica-Bold').fillColor(NAVY)
       .text('PREFEITURA MUNICIPAL DE BANANEIRAS', margem, 33, { width: conteudoW, align: 'center' });
    doc.fontSize(14).font('Helvetica-Bold')
       .text('GUARDA CIVIL MUNICIPAL', { width: conteudoW, align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#444')
       .text('Secretaria de Administração Pública Municipal', { width: conteudoW, align: 'center' });

    const posLinha = Math.max(doc.y + 4, 96);
    doc.moveTo(margem, posLinha).lineTo(pageW - margem, posLinha).lineWidth(2).stroke(NAVY);

    doc.y = posLinha + 8;
    doc.fontSize(16).font('Helvetica-Bold').fillColor(NAVY)
       .text('CONTROLE DE VIATURA', { width: conteudoW, align: 'center' });
    doc.fontSize(13).font('Helvetica-Bold')
       .text(`${r.codigo.toUpperCase()} — ${TIPO_LABEL[r.tipo] || r.tipo.toUpperCase()}`, { width: conteudoW, align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#444')
       .text(
         `Registrado em: ${new Date(r.data_hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}     |     Por: ${String(r.criado_por || r.responsavel || '').toUpperCase()}`,
         { width: conteudoW, align: 'center' }
       );
    doc.moveDown(0.5);
    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(0.5).stroke('#9CA3AF');
    doc.moveDown(0.8);

    // ── Funções auxiliares ────────────────────────────────────────────────────
    const tituloSecao = (txt) => {
      doc.fontSize(12).font('Helvetica-Bold').fillColor(NAVY).text(txt.toUpperCase());
      doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(0.8).stroke(NAVY);
      doc.moveDown(0.5);
    };

    const campo = (label, valor) => {
      if (valor === null || valor === undefined || valor === '') return;
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#333')
         .text(`${label}: `, { continued: true })
         .font('Helvetica').fillColor('#000')
         .text(String(valor));
    };

    // ── Dados principais ──────────────────────────────────────────────────────
    tituloSecao('Dados do Registro');
    campo('Registro',       nomeRegistro);
    campo('Viatura',        r.codigo.toUpperCase());
    campo('Tipo',           TIPO_LABEL[r.tipo] || r.tipo);
    campo('Data / Hora',    new Date(r.data_hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
    campo('KM Atual',       `${Number(r.km).toLocaleString('pt-BR')} km`);
    campo('Responsável',    String(r.responsavel || r.criado_por || '').toUpperCase());
    doc.moveDown(0.8);

    // ── Dados específicos por tipo ────────────────────────────────────────────
    if (r.tipo === 'abastecimento') {
      tituloSecao('Dados do Abastecimento');
      campo('Litros Abastecidos',   dados.litros   ? `${dados.litros} L`    : null);
      campo('Tipo de Combustível',  dados.combustivel);
      campo('Valor por Litro',      dados.valorLitro ? `R$ ${dados.valorLitro}` : null);
      campo('Posto de Combustível', dados.posto);
      doc.moveDown(0.8);
    } else if (r.tipo === 'revisao') {
      tituloSecao('Dados da Revisão');
      campo('Tipo de Revisão',         dados.tipoRevisao);
      campo('Oficina / Local',         dados.oficina);
      campo('Próxima Revisão (KM)',    dados.proximaKm ? `${Number(dados.proximaKm).toLocaleString('pt-BR')} km` : null);
      campo('Valor Total',             dados.valor ? `R$ ${dados.valor}` : null);
      if (dados.itens) {
        doc.moveDown(0.3);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text('Itens Revisados:');
        doc.font('Helvetica').fillColor('#000').text(dados.itens, { lineGap: 2 });
      }
      doc.moveDown(0.8);
    } else if (r.tipo === 'manutencao') {
      tituloSecao('Dados da Manutenção');
      campo('Problema Relatado', dados.problema);
      campo('Oficina / Local',   dados.oficina);
      campo('Peças Utilizadas',  dados.pecas);
      campo('Valor Total',       dados.valor ? `R$ ${dados.valor}` : null);
      if (dados.descricao) {
        doc.moveDown(0.3);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text('Descrição do Serviço:');
        doc.font('Helvetica').fillColor('#000').text(dados.descricao, { align: 'justify', lineGap: 2 });
      }
      doc.moveDown(0.8);
    }

    // ── Observações ───────────────────────────────────────────────────────────
    if (r.obs) {
      tituloSecao('Observações');
      doc.fontSize(12).font('Helvetica').fillColor('#000')
         .text(r.obs, { align: 'justify', lineGap: 3 });
      doc.moveDown(0.8);
    }

    // ── Anexos ────────────────────────────────────────────────────────────────
    const { rows: anexos } = await pool.query(
      `SELECT * FROM anexos WHERE tipo_ref='viatura' AND ref_id=$1 ORDER BY criado_em ASC`,
      [id]
    );
    const PDF_IMG_MIMES = new Set(['image/jpeg', 'image/png']);
    const ALL_IMG_MIMES = new Set(['image/jpeg','image/png','image/gif','image/webp','image/bmp','image/tiff']);
    const imgs   = anexos.filter(a => PDF_IMG_MIMES.has(a.mime_type));
    const outros = anexos.filter(a => !PDF_IMG_MIMES.has(a.mime_type));

    if (anexos.length) {
      doc.addPage();
      tituloSecao('Comprovantes / Anexos');
      let numAnexo = 0;

      for (const img of imgs) {
        numAnexo++;
        const filePath = path.join(__dirname, '../uploads/viatura', img.nome_arquivo);
        const fonteImg = img.dados
          ? Buffer.from(img.dados, 'base64')
          : (fs.existsSync(filePath) ? filePath : null);
        if (!fonteImg) continue;
        if (numAnexo > 1) doc.addPage();
        else doc.moveDown(0.8);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#333')
           .text(`Anexo ${numAnexo}: ${img.nome_original}`, { align: 'center' });
        doc.moveDown(0.4);
        const maxW = Math.min(conteudoW, 260);
        const maxH = Math.min(doc.page.height - doc.y - 100, 300);
        try {
          const imgObj  = doc.openImage(fonteImg);
          const scale   = Math.min(maxW / imgObj.width, maxH / imgObj.height);
          const scaledW = imgObj.width  * scale;
          const scaledH = imgObj.height * scale;
          const xCentro  = margem + (conteudoW - scaledW) / 2;
          const espacoV  = doc.page.height - doc.y - 80;
          const yCentro  = doc.y + Math.max(0, (espacoV - scaledH) / 2);
          doc.image(imgObj, xCentro, yCentro, { width: scaledW, height: scaledH });
        } catch (imgErr) {
          console.error(`[PDF-Viatura] Erro ao incorporar ${img.nome_original}:`, imgErr.message);
          doc.fontSize(10).font('Helvetica-Oblique').fillColor('#888')
             .text('(Falha ao renderizar imagem — arquivo pode estar corrompido)', { align: 'center' });
        }
      }

      if (outros.length) {
        if (imgs.length) doc.addPage();
        tituloSecao('Outros Anexos (não incorporados ao PDF)');
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

    // ── Rodapé em todas as páginas ────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(i);
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

module.exports = router;
