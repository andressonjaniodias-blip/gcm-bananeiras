const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();

// Conexão com SQLite (DB_PATH definido no .env)
const db = new sqlite3.Database(process.env.DB_PATH);

// Criar tabela de usuários se não existir
db.run(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT UNIQUE,
    senha TEXT
  )
`);

// Rota de login
router.post('/login', (req, res) => {
  try {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    // Buscar usuário no banco
    db.get('SELECT * FROM usuarios WHERE usuario = ?', [usuario], async (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(401).json({ error: 'Usuário ou senha inválidos' });

      // Comparar senha com hash
      const senhaValida = await bcrypt.compare(senha, row.senha);
      if (!senhaValida) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos' });
      }

      // Gerar JWT
      const token = jwt.sign(
        { usuario: row.usuario },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.json({
        message: 'Login realizado com sucesso',
        token,
        expiresIn: '8h'
      });
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para registrar novo usuário (exemplo)
router.post('/register', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    // Gerar hash da senha
    const hash = await bcrypt.hash(senha, 10);

    db.run('INSERT INTO usuarios (usuario, senha) VALUES (?, ?)', [usuario, hash], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erro ao registrar usuário: ' + err.message });
      }
      res.json({ message: 'Usuário registrado com sucesso', id: this.lastID });
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
