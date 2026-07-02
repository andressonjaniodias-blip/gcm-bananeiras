// backend/utils/pdfLayout.js
// Helpers de layout PDF (cabeçalho institucional + rodapé) compartilhados
// pelos módulos de Escala, Plantões Extras e Férias.
const path = require('path');
const fs   = require('fs');

const NAVY = '#0e2a52';
const brasaoGCM        = path.join(__dirname, '../../public/brasao-gcm.png');
const brasaoPrefeitura = path.join(__dirname, '../../public/brasao-prefeitura.png');

/**
 * Desenha o cabeçalho institucional (brasões + títulos) e posiciona doc.y
 * logo abaixo da linha divisória. Retorna a margem lateral usada.
 */
function cabecalhoPDF(doc, { titulo, subtitulo } = {}) {
  const margem  = doc.page.margins.left;
  const pageW   = doc.page.width;
  const conteudoW = pageW - margem * 2;
  const imgSize = 60;

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
  if (titulo) {
    doc.fontSize(15).font('Helvetica-Bold').fillColor(NAVY)
       .text(titulo.toUpperCase(), margem, doc.y, { width: conteudoW, align: 'center' });
  }
  if (subtitulo) {
    doc.fontSize(11).font('Helvetica').fillColor('#333')
       .text(subtitulo, { width: conteudoW, align: 'center' });
  }
  doc.moveDown(0.6);
  return margem;
}

/**
 * Escreve o rodapé (linha + info + paginação) em todas as páginas já
 * bufferizadas. Requer que o documento tenha sido criado com bufferPages:true.
 */
function rodapePDF(doc, { info } = {}) {
  const margem = doc.page.margins.left;
  const pageW  = doc.page.width;
  const conteudoW = pageW - margem * 2;
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const baseY = doc.page.height - 42;
    doc.moveTo(margem, baseY).lineTo(pageW - margem, baseY).lineWidth(0.5).strokeColor('#aaa').stroke();
    if (info) {
      doc.fontSize(8).font('Helvetica').fillColor('#555')
         .text(info, margem, baseY + 6, { width: conteudoW - 70, align: 'left', lineBreak: false });
    }
    doc.fontSize(8).font('Helvetica').fillColor('#555')
       .text(`Página ${i + 1} de ${total}`, margem, baseY + 6, { width: conteudoW, align: 'right', lineBreak: false });
  }
  doc.flushPages();
}

module.exports = { cabecalhoPDF, rodapePDF, NAVY };
