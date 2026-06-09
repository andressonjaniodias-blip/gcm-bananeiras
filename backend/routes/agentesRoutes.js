const express  = require('express');
const router   = express.Router();
const db       = require('../config/db');
const { verificarToken, verificarAdmin } = require('../middleware/auth');
const exigirAdmin = verificarAdmin;

// Listar agentes
router.get('/', verificarToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, nome, matricula, cargo, usuario, ativo, criado_em
       FROM agentes ORDER BY nome ASC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Criar agente
router.post('/', verificarToken, exigirAdmin, async (req, res) => {
  try {
    const { nome, matricula, cargo, usuario, ativo } = req.body;
    if (!nome || !matricula) return res.status(400).json({ error: 'Nome e matrícula são obrigatórios.' });
    const { rows } = await db.query(
      `INSERT INTO agentes (nome, matricula, cargo, usuario, ativo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nome.trim(), matricula.trim(), cargo?.trim() || 'Guarda Civil Municipal', usuario?.trim() || null, ativo !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualizar agente
router.put('/:id', verificarToken, exigirAdmin, async (req, res) => {
  try {
    const { nome, matricula, cargo, usuario, ativo } = req.body;
    if (!nome || !matricula) return res.status(400).json({ error: 'Nome e matrícula são obrigatórios.' });
    const { rows } = await db.query(
      `UPDATE agentes SET nome=$1, matricula=$2, cargo=$3, usuario=$4, ativo=$5
       WHERE id=$6 RETURNING *`,
      [nome.trim(), matricula.trim(), cargo?.trim() || 'Guarda Civil Municipal', usuario?.trim() || null, ativo !== false, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Agente não encontrado.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Remover agente
router.delete('/:id', verificarToken, exigirAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`DELETE FROM agentes WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Agente não encontrado.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
