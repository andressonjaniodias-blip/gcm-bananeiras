const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { verificarToken, verificarAdmin, registrarAuditoria, ROLES } = require('../middleware/auth');

// Login
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

    const token = jwt.sign(
      { usuario: row.usuario, role: row.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const ip = req.ip || req.headers['x-forwarded-for'] || 'desconhecido';
    await registrarAuditoria(row.usuario, 'LOGIN', null, ip);

    res.json({ message: 'Login realizado com sucesso', token, role: row.role, expiresIn: '8h' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Setup — cria o primeiro admin (só funciona se não houver usuários)
router.post('/setup', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT COUNT(*) AS total FROM usuarios');
    if (parseInt(rows[0].total) > 0) {
      return res.status(403).json({ error: 'Setup já realizado' });
    }

    const { usuario, senha } = req.body;
    if (!usuario || !senha) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    const hash = await bcrypt.hash(senha, 10);
    await db.query(
      "INSERT INTO usuarios (usuario, senha, role) VALUES ($1, $2, 'admin')",
      [usuario, hash]
    );

    res.json({ message: 'Administrador criado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar usuários (admin)
router.get('/usuarios', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, usuario, role FROM usuarios ORDER BY id');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar usuário (admin)
router.post('/usuarios', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { usuario, senha, role = 'agente' } = req.body;
    if (!usuario || !senha) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `Role inválido. Valores aceitos: ${ROLES.join(', ')}` });
    }

    const hash = await bcrypt.hash(senha, 10);
    const result = await db.query(
      'INSERT INTO usuarios (usuario, senha, role) VALUES ($1, $2, $3) RETURNING id',
      [usuario, hash, role]
    );

    res.status(201).json({ message: 'Usuário criado com sucesso', id: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Usuário já existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Deletar usuário (admin)
router.delete('/usuarios/:id', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query('SELECT role FROM usuarios WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (rows[0].role === 'admin') {
      const { rows: admins } = await db.query("SELECT COUNT(*) AS total FROM usuarios WHERE role = 'admin'");
      if (parseInt(admins[0].total) <= 1) {
        return res.status(400).json({ error: 'Não é possível remover o único administrador' });
      }
    }

    await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ message: 'Usuário removido com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logs de auditoria (admin)
router.get('/auditoria', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM audit_logs ORDER BY data DESC LIMIT 500'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trocar própria senha
router.post('/trocar-senha', verificarToken, async (req, res) => {
  try {
    const { senhaAtual, senhaNova } = req.body;
    if (!senhaAtual || !senhaNova) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }
    if (senhaNova.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres' });
    }

    const { rows } = await db.query('SELECT * FROM usuarios WHERE usuario = $1', [req.usuario.usuario]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });

    const senhaValida = await bcrypt.compare(senhaAtual, row.senha);
    if (!senhaValida) return res.status(401).json({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(senhaNova, 10);
    await db.query('UPDATE usuarios SET senha = $1 WHERE usuario = $2', [hash, req.usuario.usuario]);

    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
