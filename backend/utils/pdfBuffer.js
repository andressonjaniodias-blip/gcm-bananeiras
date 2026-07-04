const { PassThrough } = require('stream');

// Captura a saída de um PDFDocument (PDFKit) em um Buffer.
// Deve ser chamada ANTES de doc.end(), e o retorno aguardado DEPOIS de doc.end().
function coletarPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = new PassThrough();
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    doc.pipe(stream);
  });
}

module.exports = { coletarPdfBuffer };
