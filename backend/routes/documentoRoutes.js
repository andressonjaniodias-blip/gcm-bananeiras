const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const pool     = require('../config/db');
const { verificarToken, verificarSupervisor } = require('../middleware/auth');

const UPLOADS_DIR = path.join(__dirname, '../uploads/documentos');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const TIPOS_ACEITOS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `doc-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (TIPOS_ACEITOS.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Tipo de arquivo não suportado: ${file.mimetype}`));
  },
});

// Listar documentos (sem o arquivo)
router.get('/', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, tipo, titulo, data, numero, descricao, arquivo_nome, arquivo_mime,
              publicado_por, criado_em, destaque_home
       FROM documentos ORDER BY criado_em DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Documentos em destaque para a home (autenticado)
router.get('/destaque', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, tipo, titulo, data, numero, descricao, arquivo_nome, arquivo_mime,
              publicado_por, criado_em
       FROM documentos
       WHERE destaque_home = true
       ORDER BY criado_em DESC
       LIMIT 20`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publicar documento (supervisor e admin apenas)
router.post('/', verificarToken, verificarSupervisor, (req, res) => {
  upload.single('arquivo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório.' });

    const { tipo, titulo, data, numero, descricao, destaqueHome } = req.body;
    if (!tipo || !titulo || !data) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO documentos
           (tipo, titulo, data, numero, descricao, arquivo, arquivo_nome, arquivo_mime, publicado_por, destaque_home)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          tipo, titulo, data,
          numero   || null,
          descricao || null,
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
          req.usuario,
          destaqueHome === 'true' || destaqueHome === true,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (dbErr) {
      fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: dbErr.message });
    }
  });
});

// Alternar destaque_home (supervisor e admin)
router.patch('/:id/destaque', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { destaque_home } = req.body;
    const { rows } = await pool.query(
      `UPDATE documentos SET destaque_home=$1 WHERE id=$2 RETURNING id, destaque_home`,
      [!!destaque_home, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Documento não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download do arquivo
router.get('/:id/download', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT arquivo, arquivo_nome, arquivo_mime FROM documentos WHERE id=$1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Documento não encontrado.' });

    const { arquivo, arquivo_nome, arquivo_mime } = rows[0];
    const filePath = path.join(UPLOADS_DIR, arquivo);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado no servidor.' });
    }

    res.setHeader('Content-Type', arquivo_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo_nome}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
