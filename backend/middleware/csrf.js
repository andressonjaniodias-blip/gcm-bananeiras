const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Rotas que não exigem CSRF token (usuário ainda não autenticado)
const SKIP_EXACT = new Set(['/api/auth/login', '/api/auth/setup', '/api/auth/esqueci-senha', '/api/auth/redefinir-senha']);

function csrfMiddleware(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (SKIP_EXACT.has(req.path)) return next();

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF token inválido ou ausente' });
  }
  next();
}

function gerarCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { csrfMiddleware, gerarCsrfToken };
