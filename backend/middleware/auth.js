const jwt = require('jsonwebtoken');
const db = require('../config/db');

const ROLES = ['admin', 'supervisor', 'agente'];

// ── Parser de User-Agent (sem dependências externas) ─────────────────────────
function parseUserAgent(ua = '') {
  let dispositivo = 'Desktop';
  let so          = 'Desconhecido';
  let navegador   = 'Desconhecido';

  // Dispositivo
  if (/Mobile|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/.test(ua)) {
    dispositivo = 'Mobile';
  } else if (/Tablet|iPad|Android(?!.*Mobile)/.test(ua)) {
    dispositivo = 'Tablet';
  }

  // Sistema Operacional
  if (/Windows NT 10/.test(ua))        so = 'Windows 10/11';
  else if (/Windows NT 6\.3/.test(ua)) so = 'Windows 8.1';
  else if (/Windows NT 6\.1/.test(ua)) so = 'Windows 7';
  else if (/Windows/.test(ua))         so = 'Windows';
  else if (/iPhone|iPad/.test(ua))     so = /iPhone/.test(ua) ? 'iOS (iPhone)' : 'iOS (iPad)';
  else if (/Android/.test(ua)) {
    const v = ua.match(/Android ([\d.]+)/);
    so = `Android${v ? ' ' + v[1] : ''}`;
  } else if (/Mac OS X/.test(ua))      so = 'macOS';
  else if (/Linux/.test(ua))           so = 'Linux';
  else if (/CrOS/.test(ua))            so = 'ChromeOS';

  // Navegador (ordem importa: Edge > Opera > Chrome > Firefox > Safari > IE)
  const ver = (re) => { const m = ua.match(re); return m ? m[1].split('.')[0] : ''; };
  if (/Edg\//.test(ua))           navegador = `Edge ${ver(/Edg\/([\d.]+)/)}`;
  else if (/OPR\//.test(ua))      navegador = `Opera ${ver(/OPR\/([\d.]+)/)}`;
  else if (/Chrome\//.test(ua))   navegador = `Chrome ${ver(/Chrome\/([\d.]+)/)}`;
  else if (/Firefox\//.test(ua))  navegador = `Firefox ${ver(/Firefox\/([\d.]+)/)}`;
  else if (/Version\/.*Safari/.test(ua)) navegador = `Safari ${ver(/Version\/([\d.]+)/)}`;
  else if (/Trident\//.test(ua))  navegador = 'Internet Explorer';

  return { dispositivo, so, navegador };
}
// ─────────────────────────────────────────────────────────────────────────────

function verificarToken(req, res, next) {
  try {
    const token = req.cookies?.authToken || req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token ausente. Faça login primeiro.' });
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

function verificarSupervisor(req, res, next) {
  const role = req.usuario?.role;
  if (role !== 'admin' && role !== 'supervisor') {
    return res.status(403).json({ error: 'Acesso restrito a supervisores e administradores' });
  }
  next();
}

// extra: { user_agent, dispositivo, navegador, so, sessao_id }
async function registrarAuditoria(usuario, acao, recurso, ip, extra = {}) {
  try {
    const { user_agent, dispositivo, navegador, so, sessao_id } = extra;
    await db.query(
      `INSERT INTO audit_logs
         (usuario, acao, recurso, ip, user_agent, dispositivo, navegador, so, sessao_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [usuario, acao, recurso, ip || null,
       user_agent || null, dispositivo || null, navegador || null, so || null, sessao_id || null]
    );
  } catch { /* não bloqueia a requisição por falha de auditoria */ }
}

// Monta o objeto extra a partir de um request Express
function extraFromReq(req) {
  const ua = req.headers['user-agent'] || '';
  const { dispositivo, so, navegador } = parseUserAgent(ua);
  return {
    user_agent:  ua,
    dispositivo,
    so,
    navegador,
    sessao_id: req.usuario?.sessao_id || null,
  };
}

module.exports = {
  verificarToken, verificarAdmin, verificarSupervisor,
  registrarAuditoria, extraFromReq, parseUserAgent, ROLES
};
