const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const db       = require('../config/db');
const { verificarToken } = require('../middleware/auth');

const UPLOADS_BASE = path.join(__dirname, '../uploads');

const TIPOS_ACEITOS = new Set([
  'image/jpeg','image/png','image/gif','image/webp','image/bmp','image/tiff',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
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
    if (TIPOS_ACEITOS.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Tipo de arquivo não suportado: ${file.mimetype}`));
  },
});

// POST /api/anexos/:tipo/:id   — fazer upload de um ou mais arquivos
router.post('/:tipo/:id', verificarToken, (req, res) => {
  const { tipo, id } = req.params;
  if (!['bo', 'relatorio'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo_ref inválido.' });
  }

  upload.array('arquivos', 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files?.length) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    try {
      const inseridos = [];
      for (const f of req.files) {
        const { rows } = await db.query(
          `INSERT INTO anexos (tipo_ref, ref_id, nome_arquivo, nome_original, mime_type, tamanho, criado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [tipo, id, f.filename, f.originalname, f.mimetype, f.size, req.usuario?.usuario]
        );
        inseridos.push(rows[0]);
      }
      res.status(201).json(inseridos);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// GET /api/anexos/:tipo/:id    — listar anexos de um BO/relatorio
router.get('/:tipo/:id', verificarToken, async (req, res) => {
  const { tipo, id } = req.params;
  try {
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
