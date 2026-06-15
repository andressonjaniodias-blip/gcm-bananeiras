const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken } = require('../middleware/auth');
const erroServidor = require('../utils/erroServidor');

// Listar registros
router.get('/', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, tipo, codigo, data_hora, km, responsavel, dados, obs
       FROM controle_viatura ORDER BY data_hora DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    erroServidor(res, err);
  }
});

// Criar registro
router.post('/', verificarToken, async (req, res) => {
  try {
    const { tipo, codigo, dataHora, km, responsavel, dados, obs } = req.body;
    if (!tipo || !codigo || !dataHora || km === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO controle_viatura (tipo, codigo, data_hora, km, responsavel, dados, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [tipo, codigo, dataHora, km, responsavel || req.usuario, JSON.stringify(dados || {}), obs || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    erroServidor(res, err);
  }
});

module.exports = router;
