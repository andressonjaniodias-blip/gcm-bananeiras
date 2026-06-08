const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../config/db');

router.post('/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    const { rows } = await db.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'Usuário ou senha inválidos' });

    const senhaValida = await bcrypt.compare(senha, row.senha);
    if (!senhaValida) return res.status(401).json({ error: 'Usuário ou senha inválidos' });

    const token = jwt.sign({ usuario: row.usuario }, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.json({ message: 'Login realizado com sucesso', token, expiresIn: '8h' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    const hash = await bcrypt.hash(senha, 10);
    const result = await db.query(
      'INSERT INTO usuarios (usuario, senha) VALUES ($1, $2) RETURNING id',
      [usuario, hash]
    );

    res.json({ message: 'Usuário registrado com sucesso', id: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Usuário já existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
