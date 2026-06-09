const db = require('../config/db');
const { registrarAuditoria } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs   = require('fs');

const brasaoGCM        = path.join(__dirname, '../../public/brasao-gcm.png');
const brasaoPrefeitura = path.join(__dirname, '../../public/brasao-prefeitura.png');

// ── Mapeamento de chaves → rótulos em português ──────────────────────────────
const LABELS = {
  // Solicitação
  canal:                'Canal da Solicitação',
  dataHoraSolicitacao:  'Data e Hora da Solicitação',
  natureza:             'Natureza da Solicitação',
  nomeSolicitante:      'Nome do Solicitante',
  documentoSolicitante: 'RG / CPF / CNH',
  telefoneSolicitante:  'Telefone',
  // Ocorrência
  tipificacao:     'Tipificação',
  dataHoraOcorrencia: 'Data e Hora da Ocorrência',
  rua:             'Rua / Logradouro',
  numero:          'Número',
  cidade:          'Cidade',
  complemento:     'Complemento / Bairro',
  viatura:         'Código da Viatura',
  comandante:      'Comandante',
  motorista:       'Motorista',
  patrulheiroI:    'Patrulheiro I',
  patrulheiroII:   'Patrulheiro II',
  // Pessoa (vítima / suspeito)
  nome:            'Nome',
  alcunha:         'Alcunha',
  documento:       'CPF / RG / CNH',
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
const CAMPOS_DATA = new Set([
  'dataHoraSolicitacao', 'dataHoraOcorrencia',
  'dataHoraAutoridade', 'nascimento',
]);

function formatarData(valor) {
  try {
    const d = new Date(valor);
    if (isNaN(d.getTime())) return valor;
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return valor; }
}

function prepararValor(chave, valor) {
  if (!valor) return '';
  if (CAMPOS_DATA.has(chave)) return formatarData(valor);
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
    const { rows: countRows } = await db.query('SELECT COUNT(*) AS total FROM boletins');
    const numeroSequencial = parseInt(countRows[0].total) + 1;
    const numero = `BO-GCM-${String(numeroSequencial).padStart(4, '0')}`;
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
    res.status(500).json({ error: err.message });
  }
};

exports.listarBOs = async (req, res) => {
  try {
    const { usuario, role } = req.usuario;
    let rows;
    if (role === 'agente') {
      ({ rows } = await db.query(
        'SELECT * FROM boletins WHERE criado_por = $1 ORDER BY id DESC', [usuario]
      ));
    } else {
      ({ rows } = await db.query('SELECT * FROM boletins ORDER BY id DESC'));
    }
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

    const { usuario, role } = req.usuario;
    if (role === 'agente' && rows[0].criado_por !== usuario) {
      return res.status(403).json({ error: 'Acesso negado a este BO' });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'desconhecido';
    await registrarAuditoria(usuario, 'ACESSAR_BO', rows[0].numero, ip);

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

    const { usuario, role } = req.usuario;
    if (role === 'agente' && rows[0].criado_por !== usuario) {
      return res.status(403).json({ error: 'Acesso negado a este BO' });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'desconhecido';
    await registrarAuditoria(usuario, 'EXPORTAR_PDF', rows[0].numero, ip);

    const row  = rows[0];
    let dados  = {};
    try { dados = JSON.parse(row.dados); } catch { dados = {}; }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bo_${row.numero}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    const pageW  = doc.page.width;
    const margem = 50;
    const conteudoW = pageW - margem * 2;
    const imgSize   = 62;

    // ── Cabeçalho com brasões ─────────────────────────────────────────────────
    const temGCM        = fs.existsSync(brasaoGCM);
    const temPrefeitura = fs.existsSync(brasaoPrefeitura);

    if (temGCM)        doc.image(brasaoGCM,        margem, 30, { width: imgSize });
    if (temPrefeitura) doc.image(brasaoPrefeitura, pageW - margem - imgSize, 30, { width: imgSize });

    const topoTextoY = 32;
    doc.fontSize(15).font('Helvetica-Bold')
       .text('PREFEITURA MUNICIPAL DE BANANEIRAS', margem, topoTextoY, { width: conteudoW, align: 'center' });
    doc.fontSize(13).font('Helvetica-Bold')
       .text('GUARDA CIVIL MUNICIPAL', { width: conteudoW, align: 'center' });
    doc.fontSize(10).font('Helvetica')
       .text('Secretaria de Segurança Pública Municipal', { width: conteudoW, align: 'center' });

    // Linha separadora após brasões
    const posAposBrasao = Math.max(doc.y + 4, 98);
    doc.moveTo(margem, posAposBrasao).lineTo(pageW - margem, posAposBrasao).lineWidth(2).stroke('#000');

    // Título do documento
    doc.y = posAposBrasao + 8;
    doc.fontSize(14).font('Helvetica-Bold')
       .text('BOLETIM DE OCORRÊNCIA', { width: conteudoW, align: 'center' });
    doc.fontSize(10).font('Helvetica')
       .text(
         `Nº ${row.numero}     |     Registrado em: ${new Date(row.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}     |     Por: ${String(row.criado_por).toUpperCase()}`,
         { width: conteudoW, align: 'center' }
       );
    doc.moveDown(0.5);
    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(0.5).stroke('#444');
    doc.moveDown(0.8);

    // ── Funções auxiliares de renderização ───────────────────────────────────
    function tituloSecao(texto) {
      doc.fontSize(11).font('Helvetica-Bold')
         .fillColor('#000')
         .text(texto.toUpperCase(), { width: conteudoW });
      doc.moveTo(margem, doc.y + 1).lineTo(pageW - margem, doc.y + 1).lineWidth(1).stroke('#222');
      doc.moveDown(0.5);
    }

    function campoLinha(chave, valor) {
      if (!valor) return;
      const label = rotulo(chave);
      const val   = prepararValor(chave, valor);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333')
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
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
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
      tituloSecao('Relato da Ocorrência');
      doc.fontSize(10).font('Helvetica').fillColor('#000')
         .text(dados.relato, { align: 'justify', lineGap: 3 });
      doc.moveDown(0.8);
    }

    secao('Autoridade Policial', dados.autoridade);

    // ── Declaração ────────────────────────────────────────────────────────────
    doc.moveTo(margem, doc.y).lineTo(pageW - margem, doc.y).lineWidth(0.5).stroke('#444');
    doc.moveDown(0.6);
    doc.fontSize(9).font('Helvetica').fillColor('#333')
       .text(
         'Declaro que recebi a presente ocorrência, bem como as informações das pessoas e objetos envolvidos.',
         { align: 'justify' }
       );
    doc.moveDown(2);

    // ── Assinaturas (dois blocos lado a lado, no corpo do documento) ──────────
    const autoridade = dados.autoridade || {};
    const nomeAut    = autoridade.nomeAutoridade
                       ? String(autoridade.nomeAutoridade).toUpperCase()
                       : null;
    const cargoAut   = autoridade.cargo            ? String(autoridade.cargo).toUpperCase()   : 'AUTORIDADE POLICIAL';
    const matricAut  = autoridade.matricula         || null;
    const localAut   = autoridade.localAutoridade   || null;
    const nomeAgente = String(row.criado_por || req.usuario.usuario || 'Agente GCM').toUpperCase();

    const largAssin   = 180;
    const xEsq        = margem;
    const xDir        = pageW - margem - largAssin;
    const yLinha      = doc.y;

    // Linha de assinatura esquerda (Agente GCM)
    doc.moveTo(xEsq, yLinha).lineTo(xEsq + largAssin, yLinha).lineWidth(0.8).stroke('#000');
    // Linha de assinatura direita (Autoridade)
    doc.moveTo(xDir, yLinha).lineTo(xDir + largAssin, yLinha).lineWidth(0.8).stroke('#000');

    const yTexto = yLinha + 5;

    // Bloco esquerdo — Agente GCM
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
       .text(nomeAgente, xEsq, yTexto, { width: largAssin, align: 'center', lineBreak: false });
    doc.fontSize(8).font('Helvetica').fillColor('#444')
       .text('Agente GCM — Guarda Civil Municipal', xEsq, yTexto + 13, { width: largAssin, align: 'center', lineBreak: false });

    // Bloco direito — Autoridade Policial
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
       .text(nomeAut || '________________________________', xDir, yTexto, { width: largAssin, align: 'center', lineBreak: false });
    doc.fontSize(8).font('Helvetica').fillColor('#444')
       .text(cargoAut, xDir, yTexto + 13, { width: largAssin, align: 'center', lineBreak: false });

    let extraY = yTexto + 26;
    if (matricAut) {
      doc.fontSize(8).font('Helvetica').fillColor('#555')
         .text(`Matrícula: ${matricAut}`, xDir, extraY, { width: largAssin, align: 'center', lineBreak: false });
      extraY += 11;
    }
    if (localAut) {
      doc.fontSize(8).font('Helvetica').fillColor('#555')
         .text(localAut.toUpperCase(), xDir, extraY, { width: largAssin, align: 'center', lineBreak: false });
      extraY += 11;
    }

    // ── Local e data — apenas no final ───────────────────────────────────────
    const dataDoc = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.y = Math.max(extraY, yTexto + 40) + 18;
    doc.fontSize(9).font('Helvetica').fillColor('#444')
       .text(`Bananeiras/PB, ${dataDoc}`, margem, doc.y, { width: conteudoW, align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF do BO:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};
