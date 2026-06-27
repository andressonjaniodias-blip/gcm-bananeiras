const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const db       = require('../config/db');
const { verificarToken } = require('../middleware/auth');

const UPLOADS_BASE = path.join(__dirname, '../uploads');

function sanitizarNome(nome) {
  return nome
    .replace(/[^\w\s.\-]/g, '')  // remove chars especiais exceto . - _
    .replace(/\.{2,}/g, '.')     // remove .. consecutivos
    .slice(0, 200);              // limita tamanho
}

const TIPOS_ACEITOS = new Set([
  'image/jpeg','image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const EXTENSOES_ACEITAS = new Set([
  '.jpg','.jpeg','.png',
  '.pdf','.doc','.docx','.txt',
]);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const tipo = req.params.tipo; // 'bo' ou 'relatorio'
    const dir  = path.join(UPLOADS_BASE, tipo);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const tipo = req.params.tipo;
    const id   = req.params.id;
    const ext  = path.extname(file.originalname);
    cb(null, `${tipo}-${id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSOES_ACEITAS.has(ext) || !TIPOS_ACEITOS.has(file.mimetype)) {
      return cb(new Error(
        `"${file.originalname}" não é permitido. ` +
        `Envie imagens em JPG ou PNG, ou documentos em PDF, DOC, DOCX ou TXT.`
      ));
    }
    cb(null, true);
  },
});

// POST /api/anexos/:tipo/:id   — fazer upload de um ou mais arquivos
router.post('/:tipo/:id', verificarToken, (req, res) => {
  const { tipo, id } = req.params;
  if (!['bo', 'relatorio', 'viatura'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo_ref inválido.' });
  }

  upload.array('arquivos', 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files?.length) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    try {
      // titulos[] e legendas[] vêm em FormData na mesma ordem dos arquivos
      const titulos  = [].concat(req.body?.titulos  || []);
      const legendas = [].concat(req.body?.legendas || []);

      const inseridos = [];
      for (let idx = 0; idx < req.files.length; idx++) {
        const f = req.files[idx];
        const filePath = path.join(UPLOADS_BASE, tipo, f.filename);
        let dadosBase64 = null;
        try { dadosBase64 = fs.readFileSync(filePath).toString('base64'); } catch {}
        const titulo  = (titulos[idx]  || '').trim() || null;
        const legenda = (legendas[idx] || '').trim() || null;
        const { rows } = await db.query(
          `INSERT INTO anexos (tipo_ref, ref_id, nome_arquivo, nome_original, mime_type, tamanho, dados, criado_por, titulo, legenda)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [tipo, id, f.filename, sanitizarNome(f.originalname), f.mimetype, f.size, dadosBase64, req.usuario?.usuario, titulo, legenda]
        );
        inseridos.push(rows[0]);
      }
      res.status(201).json(inseridos);
    } catch (e) {
      // Remover todos os arquivos já salvos no disco para evitar arquivos órfãos
      for (const f of req.files) {
        const filePath = path.join(UPLOADS_BASE, tipo, f.filename);
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
      }
      res.status(500).json({ error: 'Erro ao registrar anexos. Arquivos removidos.' });
    }
  });
});

// GET /api/anexos/:tipo/:id    — listar anexos de um BO/relatorio
router.get('/:tipo/:id', verificarToken, async (req, res) => {
  const { tipo, id } = req.params;
  try {
    // Agentes só podem ver anexos de registros que eles criaram
    if (req.usuario?.role === 'agente') {
      const tabela = tipo === 'bo' ? 'boletins' : tipo === 'viatura' ? 'controle_viatura' : 'relatorios';
      const { rows: dono } = await db.query(
        `SELECT criado_por FROM ${tabela} WHERE id = $1`,
        [id]
      );
      if (!dono.length || dono[0].criado_por !== req.usuario.usuario) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
    }

    const { rows } = await db.query(
      `SELECT * FROM anexos WHERE tipo_ref=$1 AND ref_id=$2 ORDER BY criado_em ASC`,
      [tipo, id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/anexos/:tipo/:id/:anexoId  — remover um anexo
router.delete('/:tipo/:id/:anexoId', verificarToken, async (req, res) => {
  const { tipo, id, anexoId } = req.params;
  try {
    // Agentes só podem deletar anexos de registros que eles criaram
    if (req.usuario?.role === 'agente') {
      const tabela = tipo === 'bo' ? 'boletins' : tipo === 'viatura' ? 'controle_viatura' : 'relatorios';
      const { rows: dono } = await db.query(
        `SELECT criado_por FROM ${tabela} WHERE id = $1`,
        [id]
      );
      if (!dono.length || dono[0].criado_por !== req.usuario.usuario) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
    }

    const { rows } = await db.query(
      `DELETE FROM anexos WHERE id=$1 AND tipo_ref=$2 AND ref_id=$3 RETURNING nome_arquivo`,
      [anexoId, tipo, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Anexo não encontrado.' });

    const filePath = path.join(UPLOADS_BASE, tipo, rows[0].nome_arquivo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
