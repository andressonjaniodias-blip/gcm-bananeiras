const db = require('../config/db');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const brasaoGCM        = path.join(__dirname, '../../public/brasao-gcm.png');
const brasaoPrefeitura = path.join(__dirname, '../../public/brasao-prefeitura.png');

exports.criarBO = async (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Corpo da requisição vazio' });
  }

  try {
    const { rows: countRows } = await db.query('SELECT COUNT(*) AS total FROM boletins');
    const numeroSequencial = parseInt(countRows[0].total) + 1;
    const numero = `BO-GCM-${String(numeroSequencial).padStart(4, '0')}`;
    const dados = JSON.stringify(req.body);
    const data = new Date().toISOString();

    const result = await db.query(
      'INSERT INTO boletins (numero, dados, data) VALUES ($1, $2, $3) RETURNING id',
      [numero, dados, data]
    );

    res.status(201).json({ message: 'BO criado com sucesso', id: result.rows[0].id, numero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listarBOs = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM boletins ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.consultarBO = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'ID do BO é obrigatório' });

  try {
    const { rows } = await db.query('SELECT * FROM boletins WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'BO não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.exportarPDF = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'ID do BO é obrigatório' });

  try {
    const { rows } = await db.query('SELECT * FROM boletins WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'BO não encontrado' });

    const row = rows[0];
    let dados = {};
    try { dados = JSON.parse(row.dados); } catch (e) { dados = {}; }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bo_${row.numero}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // Cabeçalho com brasões
    const temGCM        = fs.existsSync(brasaoGCM);
    const temPrefeitura = fs.existsSync(brasaoPrefeitura);
    const imgSize = 60;
    const pageWidth = doc.page.width - 100; // descontando margens

    if (temGCM)        doc.image(brasaoGCM,        50,  30, { width: imgSize });
    if (temPrefeitura) doc.image(brasaoPrefeitura, doc.page.width - 50 - imgSize, 30, { width: imgSize });

    const topoY = temGCM || temPrefeitura ? 35 : doc.y;
    doc.fontSize(16).font('Helvetica-Bold')
       .text('GUARDA CIVIL MUNICIPAL', 50, topoY, { width: pageWidth, align: 'center' });
    doc.fontSize(13).font('Helvetica')
       .text('Boletim de Ocorrência', { width: pageWidth, align: 'center' });
    doc.fontSize(11)
       .text(`Número: ${row.numero}   |   Data: ${new Date(row.data).toLocaleDateString('pt-BR')}`, { width: pageWidth, align: 'center' });

    doc.moveDown(temGCM || temPrefeitura ? 3 : 1);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(1.5).stroke();
    doc.moveDown();

    function secao(titulo, obj) {
      if (!obj || Object.keys(obj).length === 0) return;
      doc.fontSize(13).font('Helvetica-Bold').text(titulo);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica');
      Object.entries(obj).forEach(([campo, valor]) => {
        if (valor) doc.text(`${campo}: ${valor}`);
      });
      doc.moveDown();
    }

    function secaoArray(titulo, arr) {
      if (!arr || arr.length === 0) return;
      doc.fontSize(13).font('Helvetica-Bold').text(titulo);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.3);
      arr.forEach((item, i) => {
        doc.fontSize(11).font('Helvetica-Bold').text(`${titulo.replace('s', '')} ${i + 1}:`);
        doc.font('Helvetica');
        Object.entries(item).forEach(([campo, valor]) => {
          if (valor) doc.fontSize(11).text(`${campo}: ${valor}`);
        });
        doc.moveDown(0.5);
      });
      doc.moveDown();
    }

    secao('Dados da Solicitação', dados.dadosSolicitacao);
    secao('Dados da Ocorrência', dados.dadosOcorrencia);
    secaoArray('Vítimas', dados.vitimas);
    secaoArray('Suspeitos', dados.suspeitos);
    secaoArray('Objetos Apreendidos', dados.objetos);

    if (dados.relato) {
      doc.fontSize(13).font('Helvetica-Bold').text('Relato da Ocorrência');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').text(dados.relato, { align: 'justify' });
      doc.moveDown();
    }

    secao('Autoridade Policial', dados.autoridade);

    // Assinatura
    doc.moveDown();
    doc.fontSize(11).font('Helvetica').text(
      'Declaro que recebi a presente ocorrência, bem como as informações das pessoas e objetos envolvidos.',
      { align: 'justify' }
    );
    doc.moveDown(2);
    doc.text('Assinatura: ___________________________________', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};
