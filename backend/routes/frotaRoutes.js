const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, verificarAdmin, auditar } = require('../middleware/auth');
const erroServidor = require('../utils/erroServidor');

// Listar frota — disponível a todos autenticados (autocomplete)
router.get('/', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, codigo, modelo, ano, placa, cor, tipo, status, obs
       FROM frota ORDER BY codigo ASC`
    );
    res.json(rows);
  } catch (err) {
    erroServidor(res, err);
  }
});

// Cadastrar viatura — admin
router.post('/', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { codigo, modelo, ano, placa, cor, tipo, status, obs } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código obrigatório.' });
    const { rows } = await pool.query(
      `INSERT INTO frota (codigo, modelo, ano, placa, cor, tipo, status, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [codigo.toUpperCase(), modelo || null, ano || null, placa || null,
       cor || null, tipo || 'carro-patrulha', status || 'ativa', obs || null]
    );
    await auditar(req, 'CADASTRAR_VIATURA', `Viatura ${rows[0].codigo}${rows[0].placa ? ' — ' + rows[0].placa : ''}`);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Código já cadastrado.' });
    erroServidor(res, err);
  }
});

// Atualizar viatura — admin
router.put('/:id', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { codigo, modelo, ano, placa, cor, tipo, status, obs } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código obrigatório.' });
    const { rows } = await pool.query(
      `UPDATE frota SET codigo=$1, modelo=$2, ano=$3, placa=$4, cor=$5, tipo=$6, status=$7, obs=$8
       WHERE id=$9 RETURNING *`,
      [codigo.toUpperCase(), modelo || null, ano || null, placa || null,
       cor || null, tipo || 'carro-patrulha', status || 'ativa', obs || null,
       req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Viatura não encontrada.' });
    await auditar(req, 'ALTERAR_VIATURA', `Viatura ${rows[0].codigo} — status: ${rows[0].status}`);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Código já cadastrado.' });
    erroServidor(res, err);
  }
});

// Excluir viatura — admin
router.delete('/:id', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM frota WHERE id=$1 RETURNING id, codigo`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Viatura não encontrada.' });
    await auditar(req, 'REMOVER_VIATURA', `Viatura ${rows[0].codigo}`);
    res.json({ ok: true });
  } catch (err) {
    erroServidor(res, err);
  }
});

module.exports = router;
