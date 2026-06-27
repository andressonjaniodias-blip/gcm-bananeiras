const db = require('../config/db');
const { registrarAuditoria } = require('../middleware/auth');
const erroServidor = require('../utils/erroServidor');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs   = require('fs');

const brasaoGCM        = path.join(__dirname, '../../public/brasao-gcm.png');
const brasaoPrefeitura = path.join(__dirname, '../../public/brasao-prefeitura.png');

// Azul institucional GCM Bananeiras — usado em títulos e linhas do BO em PDF
const NAVY = '#0e2a52';

// ── Mapeamento de chaves → rótulos em português ──────────────────────────────
const LABELS = {
  // Solicitação
  canal:                'Canal da Solicitação',
  dataHoraSolicitacao:  'Data e Hora da Solicitação',
  natureza:             'Natureza da Solicitação',
  nomeSolicitante:      'Nome do Solicitante',
  cpfSolicitante:       'CPF do Solicitante',
  rgSolicitante:        'RG do Solicitante',
  telefoneSolicitante:  'Telefone',
  // Ocorrência
  tipificacao:     'Tipificação',
  dataHoraOcorrencia: 'Data e Hora da Ocorrência',
  rua:             'Rua / Logradouro',
  numero:          'Número',
  cidade:          'Cidade',
  complemento:     'Complemento / Bairro',
  viatura:               'Código da Viatura',
  comandante:            'Comandante',
  matriculaComandante:   'Matrícula do Comandante',
  motorista:             'Motorista',
  matriculaMotorista:    'Matrícula do Motorista',
  patrulheiroI:          'Patrulheiro I',
  matriculaPatrulheiroI: 'Matrícula do Patrulheiro I',
  patrulheiroII:         'Patrulheiro II',
  matriculaPatrulheiroII:'Matrícula do Patrulheiro II',
  // Pessoa (vítima / suspeito)
  nome:            'Nome',
  alcunha:         'Alcunha',
  cpf:             'CPF',
  rg:              'RG',
  nascimento:      'Data de Nascimento',
  idade:           'Idade',
  genero:          'Gênero',
  nacionalidade:   'Nacionalidade',
  naturalidade:    'Naturalidade',
  estadoCivil:     'Estado Civil',
  ocupacao:        'Ocupação',
  escolaridade:    'Escolaridade',
  nomePai:         'Nome do Pai',
  nomeMae:         'Nome da Mãe',
  endereco:        'Endereço',
  telefone:        'Telefone',
  // Objetos
  tipoObjeto:      'Tipo de Objeto',
  quantidade:      'Quantidade',
  descricaoObjeto: 'Descrição',
  // Autoridade
  dataHoraAutoridade: 'Data e Hora do Recebimento',
  nomeAutoridade:     'Nome da Autoridade',
  cargo:              'Cargo',
  matricula:          'Matrícula',
  localAutoridade:    'Local',
};

// Campos cujo valor deve ser exibido em CAIXA ALTA
const MAIUSCULO = new Set([
  'nomeSolicitante', 'comandante', 'motorista',
  'patrulheiroI', 'patrulheiroII',
  'nome', 'nomePai', 'nomeMae', 'nomeAutoridade',
]);

// Campos de data/hora para formatar
const CAMPOS_DATA_HORA = new Set([
  'dataHoraSolicitacao', 'dataHoraOcorrencia', 'dataHoraAutoridade',
]);
const CAMPOS_DATA = new Set([
  'nascimento',
]);

function formatarData(valor, soData = false) {
  try {
    const d = new Date(valor);
    if (isNaN(d.getTime())) return valor;
    if (soData) return d.toLocaleDateString('pt-BR', { dateStyle: 'short' });
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return valor; }
}

function prepararValor(chave, valor) {
  if (!valor) return '';
  if (CAMPOS_DATA_HORA.has(chave)) return formatarData(valor, false);
  if (CAMPOS_DATA.has(chave))      return formatarData(valor, true);
  if (MAIUSCULO.has(chave))   return String(valor).toUpperCase();
  return String(valor);
}

function rotulo(chave) {
  return LABELS[chave] || chave;
}

// ── Exports ──────────────────────────────────────────────────────────────────

exports.criarBO = async (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Corpo da requisição vazio' });
  }

  try {
    const { rows: [{ seq }] } = await db.query(`SELECT nextval('bo_seq') AS seq`);
    const ano    = new Date().getFullYear();
    const numero = `BO-GCM-${String(seq).padStart(4, '0')}/${ano}`;
    const dados = JSON.stringify(req.body);
    const data = new Date().toISOString();
    const criado_por = req.usuario.usuario;

    const result = await db.query(
      'INSERT INTO boletins (numero, dados, data, criado_por) VALUES ($1, $2, $3, $4) RETURNING id',
      [numero, dados, data, criado_por]
    );

    const ip = req.ip || req.headers['x-forwarded-for'] || 'desconhecido';
    await registrarAuditoria(criado_por, 'CRIAR_BO', numero, ip);

    res.status(201).json({ message: 'BO criado com sucesso', id: result.rows[0].id, numero });
  } catch (err) {
    erroServidor(res, err);
  }
};

exports.statsGlobais = async (req, res) => {
  try {
    const hoje      = new Date().toISOString().slice(0, 10);
    const mesAtual  = hoje.slice(0, 7);
    const seteDias  = new Date(); seteDias.setDate(seteDias.getDate() - 6);
    const seteDiasStr = seteDias.toISOString().slice(0, 10);
    const limite30  = new Date(); limite30.setDate(limite30.getDate() - 30);
    const lim30Str  = limite30.toISOString().slice(0, 10);

    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
    const amanhaStr = amanha.toISOString().slice(0, 10);

    const [{ rows: [{ total }] }, { rows: [{ hoje: qtdHoje }] }, { rows: [{ semana }] }, { rows: [{ mes }] }, { rows: bos30 }] =
      await Promise.all([
        db.query('SELECT COUNT(*) AS total FROM boletins'),
        db.query('SELECT COUNT(*) AS hoje FROM boletins WHERE data >= $1 AND data < $2', [hoje, amanhaStr]),
        db.query('SELECT COUNT(*) AS semana FROM boletins WHERE data >= $1', [seteDiasStr]),
        db.query('SELECT COUNT(*) AS mes FROM boletins WHERE data >= $1', [mesAtual + '-01']),
        db.query('SELECT dados FROM boletins WHERE data >= $1', [lim30Str]),
      ]);

    const contagem = {};
    bos30.forEach(({ dados }) => {
      try {
        const d = JSON.parse(dados);
        const tip = d.dadosOcorrencia?.tipificacao || d.dadosSolicitacao?.natureza;
        if (tip) contagem[tip] = (contagem[tip] || 0) + 1;
      } catch {}
    });
    const ranking = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 7);

    res.json({ total: parseInt(total), hoje: parseInt(qtdHoje), semana: parseInt(semana), mes: parseInt(mes), ranking });
  } catch (err) {
    erroServidor(res, err);
  }
};

exports.listarBOs = async (req, res) => {
  const { role } = req.usuario;
  if (role === 'agente') {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    let rows, totalRows;
    ({ rows } = await db.query(
      'SELECT * FROM boletins ORDER BY id DESC LIMIT $1 OFFSET $2', [limit, offset]
    ));
    ({ rows: [{ count: totalRows }] } = await db.query(
      'SELECT COUNT(*) AS count FROM boletins'
    ));

    res.json({
      data: rows,
      total: parseInt(totalRows),
      page,
      limit,
      pages: Math.ceil(parseInt(totalRows) / limit),
    });
  } catch (err) {
    erroServidor(res, err);
  }
};

exports.consultarBO = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'ID do BO é obrigatório' });

  try {
    const { rows } = await db.query('SELECT * FROM boletins WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'BO não encontrado' });

    const { usuario, role } = req.usuario;
    if (role === 'agente') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'desconhecido';
    await registrarAuditoria(usuario, 'ACESSAR_BO', rows[0].numero, ip);

    res.json(rows[0]);
  } catch (err) {
    erroServidor(res, err);
  }
};

exports.excluirBO = async (req, res) => {
  const { id } = req.params;
  const { usuario, role } = req.usuario;

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem excluir BOs.' });
  }

  try {
    const { rows } = await db.query('SELECT numero FROM boletins WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'BO não encontrado' });

    await db.query('DELETE FROM boletins WHERE id = $1', [id]);

    const ip = req.ip || req.headers['x-forwarded-for'] || 'desconhecido';
    await registrarAuditoria(usuario, 'EXCLUIR_BO', rows[0].numero, ip);

    res.json({ message: 'BO excluído com sucesso', numero: rows[0].numero });
  } catch (err) {
    erroServidor(res, err);
  }
};

exports.exportarPDF = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'ID do BO é obrigatório' });

  try {
    const { rows } = await db.query('SELECT * FROM boletins WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'BO não encontrado' });

    const { usuario, role } = req.usuario;
    if (role === 'agente') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'desconhecido';
    await registrarAuditoria(usuario, 'EXPORTAR_PDF', rows[0].numero, ip);

    const row  = rows[0];
    let dados  = {};
    try { dados = JSON.parse(row.dados); } catch { dados = {}; }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${row.numero.replace(/\//g, '-')}.pdf"`);

    const doc = new PDFDocument({ margins: { top: 50, bottom: 65, left: 50, right: 50 }, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const pageW  = doc.page.width;
    const margem = 50;
    const conteudoW = pageW - margem * 2;
    const imgSize   = 62;

    const dataDocRodape = new Date(row.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const rodapeInfo = `BO Nº ${row.numero}  —  Bananeiras/PB, ${dataDocRodape}`;

    // ── Cabeçalho com brasões ─────────────────────────────────────────────────
    const temGCM        = fs.existsSync(brasaoGCM);
    const temPrefeitura = fs.existsSync(brasaoPrefeitura);

    if (temGCM)        doc.image(brasaoGCM,        margem, 30, { width: imgSize });
    if (temPrefeitura) doc.image(brasaoPrefeitura, pageW - margem - imgSize, 30, { width: imgSize });

    const topoTextoY = 32;
    doc.fontSize(18).font('Helvetica-Bold').fillColor(NAVY)
       .text('PREFEITURA MUNICIPAL DE BANANEIRAS', margem, topoTextoY, { width: conteudoW, align: 'center' });
    doc.fontSize(16).font('Helvetica-Bold')
       .text('GUARDA CIVIL MUNICIPAL', { width: conteudoW, align: 'center' });
    doc.fontSize(12).font('Helvetica').fillColor('#444')
       .text('Secretaria de Administração Pública Municipal', { width: conteudoW, align: 'center' });

    // Linha separadora após brasões
    const posAposBrasao = Math.max(doc.y + 4, 98);
    doc.moveTo(margem, posAposBrasao).lineTo(pageW - margem, posAposBrasao).lineWidth(2).stroke(NAVY);

    // Título do documento
    doc.y = posAposBrasao + 8;
    doc.fontSize(17).font('Helvetica-Bold').fillColor(NAVY)
       .text(`BOLETIM DE OCORRÊNCIA  Nº ${row.numero}`, { width: conteudoW, align: 'center' });
    doc.fontSize(12).font('Helvetica').fillColor('#444')
       .text(
         `Registrado em: ${new Date(row.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}     |     Por: ${String(row.criado_por).toUpperCase()}`,
         { width: conteudoW, align: 'center' }
       );
    doc.moveDown(0.5);
    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(0.5).stroke('#9CA3AF');
    doc.moveDown(0.8);

    // ── Funções auxiliares de renderização ───────────────────────────────────
    function tituloSecao(texto) {
      doc.fontSize(13).font('Helvetica-Bold')
         .fillColor(NAVY)
         .text(texto.toUpperCase(), { width: conteudoW });
      doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(1).stroke(NAVY);
      doc.moveDown(0.5);
    }

    function campoLinha(chave, valor) {
      if (!valor) return;
      const label = rotulo(chave);
      const val   = prepararValor(chave, valor);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#333')
         .text(`${label}: `, { continued: true })
         .font('Helvetica').fillColor('#000')
         .text(val);
    }

    function secao(titulo, obj) {
      if (!obj || Object.keys(obj).length === 0) return;
      tituloSecao(titulo);
      Object.entries(obj).forEach(([k, v]) => campoLinha(k, v));
      doc.moveDown(0.8);
    }

    function secaoArray(tituloPlural, tituloSingular, arr) {
      if (!arr || arr.length === 0) return;
      tituloSecao(tituloPlural);
      arr.forEach((item, i) => {
        if (!Object.values(item).some(v => v)) return;
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000')
           .text(`${tituloSingular} ${i + 1}:`);
        doc.font('Helvetica');
        Object.entries(item).forEach(([k, v]) => campoLinha(k, v));
        if (i < arr.length - 1) doc.moveDown(0.3);
      });
      doc.moveDown(0.8);
    }

    // ── Seções do BO ──────────────────────────────────────────────────────────
    secao('Dados da Solicitação', dados.dadosSolicitacao);
    secao('Dados da Ocorrência',  dados.dadosOcorrencia);
    secaoArray('Vítimas',              'Vítima',   dados.vitimas);
    secaoArray('Suspeitos',            'Suspeito', dados.suspeitos);
    secaoArray('Objetos Apreendidos',  'Objeto',   dados.objetos);

    if (dados.relato) {
      doc.moveDown(0.5);
      tituloSecao('Relato da Ocorrência');
      doc.fontSize(12).font('Helvetica').fillColor('#000')
         .text(dados.relato, { align: 'justify', lineGap: 3 });
      doc.moveDown(0.8);
    }

    // ── Autoridade Policial + Recibo ──────────────────────────────────────────
    doc.moveDown(0.5);
    secao('Autoridade Policial', dados.autoridade);

    // Nome e matrícula do comandante vêm do form; cargo buscado na tabela agentes
    const nomeComandante = dados.dadosOcorrencia?.comandante || null;
    let matricCmd = dados.dadosOcorrencia?.matriculaComandante || null;
    let cargoCmd  = null;
    if (nomeComandante) {
      const { rows: agRows } = await db.query(
        `SELECT matricula, cargo FROM agentes WHERE ativo = true AND LOWER(nome) = LOWER($1) LIMIT 1`,
        [nomeComandante.trim()]
      );
      if (agRows.length) {
        if (!matricCmd) matricCmd = agRows[0].matricula;
        cargoCmd = agRows[0].cargo;
      }
    }

    const nomeCmd  = nomeComandante ? String(nomeComandante).toUpperCase() : null;

    const autoridade = dados.autoridade || {};
    const nomeAut    = autoridade.nomeAutoridade ? String(autoridade.nomeAutoridade).toUpperCase() : null;
    const cargoAut   = autoridade.cargo           || null;
    const matricAut  = autoridade.matricula        || null;
    const dataDoc    = new Date(row.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    // ── Recibo de Entrega de Ocorrência ───────────────────────────────────────
    doc.moveDown(1);
    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(1).stroke(NAVY);
    doc.moveDown(0.8);

    doc.fontSize(13).font('Helvetica-Bold').fillColor(NAVY)
       .text('RECIBO DE ENTREGA DE OCORRÊNCIA', { align: 'center' });
    doc.moveDown(0.8);

    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(0.5).stroke('#444');
    doc.moveDown(0.8);

    const textoRecibo =
      `Aos ${dataDoc}, na cidade de Bananeiras/PB, a Guarda Civil Municipal de Bananeiras, ` +
      `através do Comandante da Patrulha abaixo identificado, procede à entrega formal do presente ` +
      `Boletim de Ocorrência nº ${row.numero} ao solicitante ou responsável, referente ao registro de ` +
      `ocorrência lavrado nesta data, contendo todas as informações prestadas, qualificação das partes ` +
      `envolvidas e demais providências adotadas pela Guarda Civil Municipal.\n\n` +
      `O solicitante declara ter recebido cópia do presente documento, estando ciente de seu conteúdo ` +
      `e das medidas tomadas pela corporação, ficando sob sua responsabilidade o acompanhamento de ` +
      `eventuais desdobramentos junto às autoridades competentes.`;

    doc.fontSize(11).font('Helvetica').fillColor('#222')
       .text(textoRecibo, { align: 'justify', lineGap: 4 });

    doc.moveDown(2.5);

    // ── Local e data ──────────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica').fillColor('#444')
       .text(`Bananeiras/PB, ${dataDoc}`, { align: 'center' });
    doc.moveDown(2.5);

    // ── Assinaturas ───────────────────────────────────────────────────────────
    const largAssin = 190;
    const xEsq      = margem;
    const xDir      = pageW - margem - largAssin;
    const yLinha    = doc.y;

    // Linhas
    doc.moveTo(xEsq,      yLinha).lineTo(xEsq + largAssin, yLinha).lineWidth(0.8).stroke('#000');
    doc.moveTo(xDir,      yLinha).lineTo(xDir + largAssin, yLinha).lineWidth(0.8).stroke('#000');

    const yTexto = yLinha + 6;

    // Bloco esquerdo — Comandante da Patrulha (condutor da ocorrência)
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000')
       .text(nomeCmd || '_________________________________', xEsq, yTexto, { width: largAssin, align: 'center', lineBreak: false });
    doc.fontSize(10).font('Helvetica').fillColor('#444')
       .text(cargoCmd || 'Guarda Civil Municipal', xEsq, yTexto + 16, { width: largAssin, align: 'center', lineBreak: false });
    if (matricCmd) {
      doc.fontSize(10).font('Helvetica').fillColor('#555')
         .text(`Matrícula: ${matricCmd}`, xEsq, yTexto + 30, { width: largAssin, align: 'center', lineBreak: false });
    }
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#666')
       .text('Condutor da Ocorrência', xEsq, yTexto + (matricCmd ? 43 : 30), { width: largAssin, align: 'center', lineBreak: false });

    // Bloco direito — Autoridade Policial
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000')
       .text(nomeAut || '_________________________________', xDir, yTexto, { width: largAssin, align: 'center', lineBreak: false });
    doc.fontSize(10).font('Helvetica').fillColor('#444')
       .text(cargoAut || 'Autoridade Policial', xDir, yTexto + 16, { width: largAssin, align: 'center', lineBreak: false });
    if (matricAut) {
      doc.fontSize(10).font('Helvetica').fillColor('#555')
         .text(`Matrícula: ${matricAut}`, xDir, yTexto + 30, { width: largAssin, align: 'center', lineBreak: false });
    }

    // ── Anexos (imagens) no final do PDF — sempre incluídos ──────────────────
    const { rows: anexos } = await db.query(
      `SELECT * FROM anexos WHERE tipo_ref='bo' AND ref_id=$1 ORDER BY criado_em ASC`,
      [id]
    );
    // PDFKit suporta apenas JPEG e PNG nativamente; outros formatos vão para seção de listagem
    const PDF_IMG_MIMES = new Set(['image/jpeg', 'image/png']);
    const ALL_IMG_MIMES = new Set(['image/jpeg','image/png','image/gif','image/webp','image/bmp','image/tiff']);
    const imgs   = anexos.filter(a => PDF_IMG_MIMES.has(a.mime_type));
    const outros = anexos.filter(a => !PDF_IMG_MIMES.has(a.mime_type));

    if (anexos.length) {
      doc.addPage();
      tituloSecao('Anexos');
      let numAnexo = 0;

      for (const img of imgs) {
        numAnexo++;
        const filePath = path.join(__dirname, '../uploads/bo', img.nome_arquivo);
        const fonteImg = img.dados
          ? Buffer.from(img.dados, 'base64')
          : (fs.existsSync(filePath) ? filePath : null);
        if (!fonteImg) continue;
        if (numAnexo > 1) doc.addPage();
        else doc.moveDown(0.8);

        // ABNT NBR 14724: identificação acima — "Figura N — Título"
        const rotulFig = img.titulo
          ? `Figura ${numAnexo} — ${img.titulo}`
          : `Figura ${numAnexo} — ${img.nome_original}`;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#333')
           .text(rotulFig, { align: 'center' });
        doc.moveDown(0.4);

        const maxW = Math.min(conteudoW, 260);
        const maxH = Math.min(doc.page.height - doc.y - 100, 300);
        try {
          const imgObj  = doc.openImage(fonteImg);
          const scale   = Math.min(maxW / imgObj.width, maxH / imgObj.height);
          const scaledW = imgObj.width  * scale;
          const scaledH = imgObj.height * scale;
          const xCentro = margem + (conteudoW - scaledW) / 2;
          doc.image(imgObj, xCentro, doc.y, { width: scaledW, height: scaledH });
          doc.y += scaledH + 6;
          // ABNT: legenda/fonte abaixo da figura
          if (img.legenda) {
            doc.fontSize(9).font('Helvetica-Oblique').fillColor('#555')
               .text(img.legenda, { align: 'center', width: conteudoW });
          }
        } catch (imgErr) {
          console.error(`[PDF-BO] Erro ao incorporar ${img.nome_original}:`, imgErr.message);
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
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica-Oblique').fillColor('#888')
           .text('Consulte o sistema para acessar os arquivos não incorporados ao PDF.');
      }
    }

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
    console.error('Erro ao gerar PDF do BO:', err);
    if (!res.headersSent) erroServidor(res, err);
  }
};
