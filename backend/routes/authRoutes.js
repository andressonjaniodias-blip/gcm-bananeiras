const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const {
  verificarToken, verificarAdmin, registrarAuditoria, extraFromReq, ROLES
} = require('../middleware/auth');

const INATIVIDADE_MINUTOS = parseInt(process.env.INATIVIDADE_MINUTOS || '30');

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

    const sessao_id = uuidv4();
    const token = jwt.sign(
      { usuario: row.usuario, role: row.role, sessao_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'desconhecido';
    const extra = extraFromReq({ headers: req.headers, usuario: { sessao_id } });
    await registrarAuditoria(row.usuario, 'LOGIN', null, ip, extra);

    const isProducao = process.env.NODE_ENV === 'production';
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: isProducao,
      sameSite: isProducao ? 'strict' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Login realizado com sucesso',
      role: row.role,
      usuario: row.usuario,
      sessao_id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
router.post('/logout', verificarToken, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'desconhecido';
  await registrarAuditoria(req.usuario.usuario, 'LOGOUT', null, ip, extraFromReq(req));
  res.clearCookie('authToken');
  res.json({ message: 'Logout realizado com sucesso' });
});

// Logout por inatividade (chamado pelo frontend antes de redirecionar)
router.post('/logout-inatividade', verificarToken, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'desconhecido';
  await registrarAuditoria(req.usuario.usuario, 'SESSAO_EXPIRADA', 'Inatividade', ip, extraFromReq(req));
  res.clearCookie('authToken');
  res.json({ message: 'Sessão encerrada por inatividade' });
});

// Perfil do usuário logado
router.get('/me', verificarToken, (req, res) => {
  res.json({
    usuario: req.usuario.usuario,
    role: req.usuario.role,
    sessao_id: req.usuario.sessao_id,
    inatividade_minutos: INATIVIDADE_MINUTOS,
  });
});

// Setup — cria o primeiro admin
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
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'desconhecido';
    await registrarAuditoria(req.usuario.usuario, 'CRIAR_USUARIO', usuario, ip, extraFromReq(req));
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
    const { rows } = await db.query('SELECT role, usuario FROM usuarios WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (rows[0].role === 'admin') {
      const { rows: admins } = await db.query("SELECT COUNT(*) AS total FROM usuarios WHERE role = 'admin'");
      if (parseInt(admins[0].total) <= 1) {
        return res.status(400).json({ error: 'Não é possível remover o único administrador' });
      }
    }

    await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'desconhecido';
    await registrarAuditoria(req.usuario.usuario, 'REMOVER_USUARIO', rows[0].usuario, ip, extraFromReq(req));
    res.json({ message: 'Usuário removido com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Alterar role de usuário (admin)
router.put('/usuarios/:id', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `Role inválido. Valores aceitos: ${ROLES.join(', ')}` });
    }

    const { rows } = await db.query('SELECT usuario, role FROM usuarios WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (rows[0].role === 'admin' && role !== 'admin') {
      const { rows: admins } = await db.query("SELECT COUNT(*) AS total FROM usuarios WHERE role = 'admin'");
      if (parseInt(admins[0].total) <= 1) {
        return res.status(400).json({ error: 'Não é possível rebaixar o único administrador' });
      }
    }

    await db.query('UPDATE usuarios SET role = $1 WHERE id = $2', [role, id]);
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'desconhecido';
    await registrarAuditoria(req.usuario.usuario, 'ALTERAR_ROLE', `${rows[0].usuario} → ${role}`, ip, extraFromReq(req));
    res.json({ message: 'Perfil atualizado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Estatísticas de retenção (admin)
router.get('/retencao', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const anos = parseInt(process.env.RETENCAO_ANOS || '5');
    const { rows: total } = await db.query('SELECT COUNT(*) AS total FROM boletins');
    const { rows: antigos } = await db.query(
      `SELECT COUNT(*) AS total FROM boletins WHERE data::timestamptz < NOW() - INTERVAL '${anos} years'`
    );
    res.json({
      retencao_anos: anos,
      total_bos: parseInt(total[0].total),
      bos_para_arquivar: parseInt(antigos[0].total),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Arquivar BOs antigos (admin)
router.delete('/retencao/arquivar', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const anos = parseInt(process.env.RETENCAO_ANOS || '5');
    const { rows, rowCount } = await db.query(
      `DELETE FROM boletins WHERE data::timestamptz < NOW() - INTERVAL '${anos} years' RETURNING numero`
    );
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'desconhecido';
    await registrarAuditoria(req.usuario.usuario, 'ARQUIVAR_BOs', `${rowCount} registros removidos`, ip, extraFromReq(req));
    res.json({ message: `${rowCount} BO(s) arquivado(s)`, arquivados: rows.map(r => r.numero) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logs de auditoria (admin + supervisor)
router.get('/auditoria', verificarToken, async (req, res) => {
  try {
    const role = req.usuario?.role;
    if (role !== 'admin' && role !== 'supervisor') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const { rows } = await db.query(
      `SELECT id, usuario, acao, recurso, ip, data,
              dispositivo, navegador, so, sessao_id
       FROM audit_logs ORDER BY data DESC LIMIT 1000`
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

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'desconhecido';
    await registrarAuditoria(req.usuario.usuario, 'TROCAR_SENHA', null, ip, extraFromReq(req));
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
