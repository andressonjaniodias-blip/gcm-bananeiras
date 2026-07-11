const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const erroServidor = require('../utils/erroServidor');
const pool     = require('../config/db');
const { verificarToken, verificarSupervisor, auditar } = require('../middleware/auth');

const UPLOADS_DIR = path.join(__dirname, '../uploads/documentos');

function sanitizarNome(nome) {
  return nome
    .replace(/[^\w\s.\-]/g, '')  // remove chars especiais exceto . - _
    .replace(/\.{2,}/g, '.')     // remove .. consecutivos
    .slice(0, 200);              // limita tamanho
}
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const TIPOS_ACEITOS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

// Arquivo guardado em memória e persistido em base64 no banco (o filesystem do
// Render é efêmero e some a cada redeploy — mesmo padrão da tabela anexos).
const upload = multer({
  storage: multer.memoryStorage(),
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
    erroServidor(res, err);
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
    erroServidor(res, err);
  }
});

// Publicar documento (supervisor e admin apenas)
router.post('/', verificarToken, verificarSupervisor, (req, res) => {
  upload.single('arquivo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório.' });

    const { tipo, titulo, data, numero, descricao, destaqueHome } = req.body;
    if (!tipo || !titulo || !data) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO documentos
           (tipo, titulo, data, numero, descricao, arquivo, arquivo_nome, arquivo_mime, arquivo_dados, publicado_por, destaque_home)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          tipo, titulo, data,
          numero   || null,
          descricao || null,
          null,
          sanitizarNome(req.file.originalname),
          req.file.mimetype,
          req.file.buffer.toString('base64'),
          req.usuario.usuario,
          destaqueHome === 'true' || destaqueHome === true,
        ]
      );
      await auditar(req, 'PUBLICAR_DOCUMENTO', `${tipo}: ${titulo}`);
      res.status(201).json(rows[0]);
    } catch (dbErr) {
      res.status(500).json({ error: dbErr.message });
    }
  });
});

// Alternar destaque_home (supervisor e admin)
router.patch('/:id/destaque', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { destaque_home } = req.body;
    const { rows } = await pool.query(
      `UPDATE documentos SET destaque_home=$1 WHERE id=$2 RETURNING id, titulo, destaque_home`,
      [!!destaque_home, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Documento não encontrado.' });
    await auditar(req, 'DESTAQUE_DOCUMENTO', `${rows[0].destaque_home ? 'Destacado' : 'Removido destaque'}: ${rows[0].titulo}`);
    res.json(rows[0]);
  } catch (err) {
    erroServidor(res, err);
  }
});

// Download do arquivo
router.get('/:id/download', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT arquivo, arquivo_nome, arquivo_mime, arquivo_dados FROM documentos WHERE id=$1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Documento não encontrado.' });

    const { arquivo, arquivo_nome, arquivo_mime, arquivo_dados } = rows[0];

    // Trilha de acesso: documentos institucionais podem conter dados pessoais.
    await auditar(req, 'BAIXAR_DOCUMENTO', arquivo_nome);

    res.setHeader('Content-Type', arquivo_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo_nome}"`);

    // Novo padrão: bytes persistidos no banco (base64).
    if (arquivo_dados) {
      return res.send(Buffer.from(arquivo_dados, 'base64'));
    }

    // Fallback legado: arquivo em disco (dev/local; no Render pode não existir mais).
    const filePath = arquivo ? path.join(UPLOADS_DIR, arquivo) : null;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado no servidor.' });
    }
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    erroServidor(res, err);
  }
});

// Excluir documento (supervisor e admin apenas)
router.delete('/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT arquivo, titulo FROM documentos WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Documento não encontrado.' });

    const { arquivo, titulo } = rows[0];
    await pool.query(`DELETE FROM documentos WHERE id=$1`, [req.params.id]);
    if (arquivo) fs.unlink(path.join(UPLOADS_DIR, arquivo), () => {});

    await auditar(req, 'EXCLUIR_DOCUMENTO', titulo);
    res.json({ ok: true });
  } catch (err) {
    erroServidor(res, err);
  }
});

module.exports = router;
