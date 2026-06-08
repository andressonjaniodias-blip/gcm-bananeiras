const db = require('../config/db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const pdfsDir = path.join(__dirname, '../pdfs');
if (!fs.existsSync(pdfsDir)) {
  fs.mkdirSync(pdfsDir, { recursive: true });
}

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

    res.status(201).json({
      message: 'BO criado com sucesso',
      id: result.rows[0].id,
      numero,
    });
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
    const doc = new PDFDocument();
    const filePath = path.join(pdfsDir, `bo_${row.numero}.pdf`);
    const stream = fs.createWriteStream(filePath);

    doc.on('error', (err) => {
      console.error('Erro ao gerar PDF:', err);
      return res.status(500).json({ error: 'Erro ao gerar PDF' });
    });

    doc.pipe(stream);

    doc.fontSize(18).text('Boletim de Ocorrência', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Número: ${row.numero}`);
    doc.text(`Data: ${new Date(row.data).toLocaleDateString('pt-BR')}`);
    doc.moveDown();

    let dados = {};
    try { dados = JSON.parse(row.dados); } catch (e) { dados = row.dados; }

    if (dados.dadosSolicitacao) {
      doc.fontSize(14).text('Dados da Solicitação:', { underline: true });
      Object.entries(dados.dadosSolicitacao).forEach(([campo, valor]) => {
        doc.fontSize(12).text(`${campo}: ${valor}`);
      });
      doc.moveDown();
    }

    if (dados.dadosOcorrencia) {
      doc.fontSize(14).text('Dados da Ocorrência:', { underline: true });
      Object.entries(dados.dadosOcorrencia).forEach(([campo, valor]) => {
        doc.fontSize(12).text(`${campo}: ${valor}`);
      });
      doc.moveDown();
    }

    if (dados.vitimas?.length > 0) {
      doc.fontSize(14).text('Vítimas:', { underline: true });
      dados.vitimas.forEach((v, i) => {
        doc.fontSize(12).text(`Vítima ${i + 1}:`);
        Object.entries(v).forEach(([campo, valor]) => doc.text(`${campo}: ${valor}`));
        doc.moveDown();
      });
    }

    if (dados.suspeitos?.length > 0) {
      doc.fontSize(14).text('Suspeitos:', { underline: true });
      dados.suspeitos.forEach((s, i) => {
        doc.fontSize(12).text(`Suspeito ${i + 1}:`);
        Object.entries(s).forEach(([campo, valor]) => doc.text(`${campo}: ${valor}`));
        doc.moveDown();
      });
    }

    if (dados.objetos?.length > 0) {
      doc.fontSize(14).text('Objetos Apreendidos:', { underline: true });
      dados.objetos.forEach((o, i) => {
        doc.fontSize(12).text(`Objeto ${i + 1}:`);
        Object.entries(o).forEach(([campo, valor]) => doc.text(`${campo}: ${valor}`));
        doc.moveDown();
      });
    }

    if (dados.relato) {
      doc.fontSize(14).text('Relato da Ocorrência:', { underline: true });
      doc.fontSize(12).text(dados.relato);
      doc.moveDown();
    }

    if (dados.autoridade) {
      doc.fontSize(14).text('Autoridade Policial:', { underline: true });
      Object.entries(dados.autoridade).forEach(([campo, valor]) => {
        doc.fontSize(12).text(`${campo}: ${valor}`);
      });
      doc.moveDown();
    }

    doc.fontSize(14).text('Recibo da Autoridade:', { underline: true });
    doc.text('Declaro que recebi a presente ocorrência, bem como as informações das pessoas e objetos envolvidos.');
    doc.moveDown();
    doc.text('Assinatura: __________________________');

    doc.end();

    stream.on('finish', () => res.download(filePath, `bo_${row.numero}.pdf`));
    stream.on('error', (err) => {
      console.error('Erro ao escrever PDF:', err);
      return res.status(500).json({ error: 'Erro ao gerar arquivo' });
    });
  } catch (err) {
    console.error('Erro:', err);
    return res.status(500).json({ error: err.message });
  }
};
