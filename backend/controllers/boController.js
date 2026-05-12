const db = require('../config/db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Garantir que os diretórios existem
const pdfsDir = path.join(__dirname, '../pdfs');
const dataDir = path.join(__dirname, '../data');

if (!fs.existsSync(pdfsDir)) {
  fs.mkdirSync(pdfsDir, { recursive: true });
}

// Criar novo BO (apenas quando finalizar)
exports.criarBO = (req, res) => {
  // Validar dados obrigatórios
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Corpo da requisição vazio' });
  }

  // Gerar número sequencial no formato BO-GCM-0001
  db.get("SELECT COUNT(*) as total FROM boletins", [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    const numeroSequencial = row.total + 1;
    const numero = `BO-GCM-${String(numeroSequencial).padStart(4, '0')}`;
    const dados = JSON.stringify(req.body);
    const data = new Date().toISOString();

    db.run(
      `INSERT INTO boletins (numero, dados, data) VALUES (?, ?, ?)`,
      [numero, dados, data],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ 
          message: 'BO criado com sucesso',
          id: this.lastID, 
          numero 
        });
      }
    );
  });
};

// Listar todos os BOs
exports.listarBOs = (req, res) => {
  db.all(`SELECT * FROM boletins`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
};

// Consultar BO por ID
exports.consultarBO = (req, res) => {
  const id = req.params.id;
  
  if (!id) {
    return res.status(400).json({ error: 'ID do BO é obrigatório' });
  }

  db.get(`SELECT * FROM boletins WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'BO não encontrado' });
    res.json(row);
  });
};

// Exportar BO para PDF (completo)
exports.exportarPDF = (req, res) => {
  const id = req.params.id;
  
  if (!id) {
    return res.status(400).json({ error: 'ID do BO é obrigatório' });
  }

  db.get(`SELECT * FROM boletins WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'BO não encontrado' });

    try {
      const doc = new PDFDocument();
      const filePath = path.join(pdfsDir, `bo_${row.numero}.pdf`);
      const stream = fs.createWriteStream(filePath);
      
      doc.on('error', (err) => {
        console.error('Erro ao gerar PDF:', err);
        return res.status(500).json({ error: 'Erro ao gerar PDF' });
      });

      doc.pipe(stream);

      // Cabeçalho
      doc.fontSize(18).text('Boletim de Ocorrência', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Número: ${row.numero}`);
      doc.text(`Data: ${new Date(row.data).toLocaleDateString('pt-BR')}`);
      doc.moveDown();

      let dados = {};
      try {
        dados = JSON.parse(row.dados);
      } catch (e) {
        dados = row.dados;
      }

      // Dados da Solicitação
      if (dados.dadosSolicitacao) {
        doc.fontSize(14).text('Dados da Solicitação:', { underline: true });
        Object.entries(dados.dadosSolicitacao).forEach(([campo, valor]) => {
          doc.fontSize(12).text(`${campo}: ${valor}`);
        });
        doc.moveDown();
      }

      // Dados da Ocorrência
      if (dados.dadosOcorrencia) {
        doc.fontSize(14).text('Dados da Ocorrência:', { underline: true });
        Object.entries(dados.dadosOcorrencia).forEach(([campo, valor]) => {
          doc.fontSize(12).text(`${campo}: ${valor}`);
        });
        doc.moveDown();
      }

      // Vítimas
      if (dados.vitimas && Array.isArray(dados.vitimas) && dados.vitimas.length > 0) {
        doc.fontSize(14).text('Vítimas:', { underline: true });
        dados.vitimas.forEach((v, i) => {
          doc.fontSize(12).text(`Vítima ${i+1}:`);
          Object.entries(v).forEach(([campo, valor]) => {
            doc.text(`${campo}: ${valor}`);
          });
          doc.moveDown();
        });
      }

      // Suspeitos
      if (dados.suspeitos && Array.isArray(dados.suspeitos) && dados.suspeitos.length > 0) {
        doc.fontSize(14).text('Suspeitos:', { underline: true });
        dados.suspeitos.forEach((s, i) => {
          doc.fontSize(12).text(`Suspeito ${i+1}:`);
          Object.entries(s).forEach(([campo, valor]) => {
            doc.text(`${campo}: ${valor}`);
          });
          doc.moveDown();
        });
      }

      // Objetos
      if (dados.objetos && Array.isArray(dados.objetos) && dados.objetos.length > 0) {
        doc.fontSize(14).text('Objetos Apreendidos:', { underline: true });
        dados.objetos.forEach((o, i) => {
          doc.fontSize(12).text(`Objeto ${i+1}:`);
          Object.entries(o).forEach(([campo, valor]) => {
            doc.text(`${campo}: ${valor}`);
          });
          doc.moveDown();
        });
      }

      // Relato
      if (dados.relato) {
        doc.fontSize(14).text('Relato da Ocorrência:', { underline: true });
        doc.fontSize(12).text(dados.relato);
        doc.moveDown();
      }

      // Autoridade
      if (dados.autoridade) {
        doc.fontSize(14).text('Autoridade Policial:', { underline: true });
        Object.entries(dados.autoridade).forEach(([campo, valor]) => {
          doc.fontSize(12).text(`${campo}: ${valor}`);
        });
        doc.moveDown();
      }

      // Recibo
      doc.fontSize(14).text('Recibo da Autoridade:', { underline: true });
      doc.text('Declaro que recebi a presente ocorrência, bem como as informações das pessoas e objetos envolvidos.');
      doc.moveDown();
      doc.text('Assinatura: __________________________');

      doc.end();
      
      stream.on('finish', () => {
        res.download(filePath, `bo_${row.numero}.pdf`);
      });
      
      stream.on('error', (err) => {
        console.error('Erro ao escrever PDF:', err);
        return res.status(500).json({ error: 'Erro ao gerar arquivo' });
      });
    } catch (err) {
      console.error('Erro:', err);
      return res.status(500).json({ error: err.message });
    }
  });
};
