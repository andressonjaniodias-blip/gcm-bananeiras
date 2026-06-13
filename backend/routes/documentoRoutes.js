const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, verificarSupervisor } = require('../middleware/auth');

// Listar documentos (sem o blob do arquivo)
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
router.post('/', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { tipo, titulo, data, numero, descricao, arquivo, arquivoNome, arquivoMime, destaqueHome } = req.body;
    if (!tipo || !titulo || !data || !arquivo) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }
    if (Buffer.byteLength(arquivo, 'base64') > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Arquivo excede o limite de 10 MB.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO documentos
         (tipo, titulo, data, numero, descricao, arquivo, arquivo_nome, arquivo_mime, publicado_por, destaque_home)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        tipo, titulo, data, numero || null, descricao || null,
        arquivo, arquivoNome || 'documento', arquivoMime || 'application/octet-stream',
        req.usuario, destaqueHome === true,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    const buf = Buffer.from(arquivo, 'base64');
    res.setHeader('Content-Type', arquivo_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo_nome}"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
