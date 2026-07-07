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

async function verificarToken(req, res, next) {
  try {
    const token = req.cookies?.authToken || req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token ausente. Faça login primeiro.' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Admin pode ter múltiplas sessões simultâneas; demais roles: apenas uma
    if (decoded.role !== 'admin') {
      const { rows } = await db.query(
        'SELECT sessao_ativa FROM usuarios WHERE usuario = $1',
        [decoded.usuario]
      );
      if (!rows[0] || rows[0].sessao_ativa !== decoded.sessao_id) {
        return res.status(401).json({ error: 'Sessão encerrada. Sua conta foi acessada em outro dispositivo.', codigo: 'SESSAO_SUBSTITUIDA' });
      }
    }

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
  } catch (e) {
    // Não bloqueia a requisição, mas registra a falha — a trilha tem peso legal.
    console.error('[auditoria] Falha ao gravar log de auditoria:', e.message);
  }
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

// Extrai o IP do cliente de forma consistente (respeita proxy reverso)
function ipFromReq(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'desconhecido';
}

// Auditoria a partir de um request autenticado — captura usuário, IP e dispositivo
// automaticamente. Uso: await auditar(req, 'ALTERAR_AGENTE', `${nome} (${matricula})`);
async function auditar(req, acao, recurso = null, usuarioOverride = null) {
  const usuario = usuarioOverride || req.usuario?.usuario || 'desconhecido';
  return registrarAuditoria(usuario, acao, recurso, ipFromReq(req), extraFromReq(req));
}

module.exports = {
  verificarToken, verificarAdmin, verificarSupervisor,
  registrarAuditoria, extraFromReq, ipFromReq, auditar, parseUserAgent, ROLES
};
