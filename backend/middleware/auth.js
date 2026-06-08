const jwt = require('jsonwebtoken');
const db = require('../config/db');

const ROLES = ['admin', 'supervisor', 'agente'];

function verificarToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Token ausente. Faça login primeiro.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Formato de token inválido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    res.status(403).json({ error: 'Token inválido' });
  }
}

function verificarAdmin(req, res, next) {
  if (req.usuario?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}

// Permite acesso para admin e supervisor
function verificarSupervisor(req, res, next) {
  const role = req.usuario?.role;
  if (role !== 'admin' && role !== 'supervisor') {
    return res.status(403).json({ error: 'Acesso restrito a supervisores e administradores' });
  }
  next();
}

async function registrarAuditoria(usuario, acao, recurso, ip) {
  try {
    await db.query(
      'INSERT INTO audit_logs (usuario, acao, recurso, ip) VALUES ($1, $2, $3, $4)',
      [usuario, acao, recurso, ip]
    );
  } catch { /* não bloqueia a requisição por falha de auditoria */ }
}

module.exports = { verificarToken, verificarAdmin, verificarSupervisor, registrarAuditoria, ROLES };
