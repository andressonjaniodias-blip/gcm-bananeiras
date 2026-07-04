const express = require('express');
const router = express.Router();
const erroServidor = require('../utils/erroServidor');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../config/db');
const { enviarEmail } = require('../utils/email');
const {
  verificarToken, verificarAdmin, registrarAuditoria, extraFromReq, ipFromReq, ROLES
} = require('../middleware/auth');
const { gerarCsrfToken } = require('../middleware/csrf');
const { validarSenha } = require('../utils/validation');

const INATIVIDADE_MINUTOS = parseInt(process.env.INATIVIDADE_MINUTOS || '30');

// Login
router.post('/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    const ipTentativa = ipFromReq(req);
    const extraTentativa = extraFromReq({ headers: req.headers, usuario: {} });

    const { rows } = await db.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
    const row = rows[0];
    if (!row) {
      await registrarAuditoria(usuario, 'LOGIN_FALHA', 'Usuário inexistente', ipTentativa, extraTentativa);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const senhaValida = await bcrypt.compare(senha, row.senha);
    if (!senhaValida) {
      await registrarAuditoria(row.usuario, 'LOGIN_FALHA', 'Senha incorreta', ipTentativa, extraTentativa);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const sessao_id = uuidv4();
    const token = jwt.sign(
      { usuario: row.usuario, role: row.role, sessao_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Registra sessão ativa — invalida qualquer sessão anterior do mesmo usuário
    await db.query('UPDATE usuarios SET sessao_ativa = $1 WHERE usuario = $2', [sessao_id, row.usuario]);

    const ip = ipFromReq(req);
    const extra = extraFromReq({ headers: req.headers, usuario: { sessao_id } });
    await registrarAuditoria(row.usuario, 'LOGIN', null, ip, extra);

    const isProducao = process.env.NODE_ENV === 'production';
    const csrfToken = gerarCsrfToken();

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: isProducao,
      sameSite: isProducao ? 'strict' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });

    // Cookie não-httpOnly para que o JS possa lê-lo e enviá-lo como header
    res.cookie('csrfToken', csrfToken, {
      httpOnly: false,
      secure: isProducao,
      sameSite: isProducao ? 'strict' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Login realizado com sucesso',
      role: row.role,
      usuario: row.usuario,
      sessao_id,
      lgpd_aceito: !!row.lgpd_aceito,
    });
  } catch (error) {
    erroServidor(res, error);
  }
});

// Logout
router.post('/logout', verificarToken, async (req, res) => {
  const ip = ipFromReq(req);
  await registrarAuditoria(req.usuario.usuario, 'LOGOUT', null, ip, extraFromReq(req));
  await db.query('UPDATE usuarios SET sessao_ativa = NULL WHERE usuario = $1', [req.usuario.usuario]);
  res.clearCookie('authToken');
  res.clearCookie('csrfToken');
  res.json({ message: 'Logout realizado com sucesso' });
});

// Logout por inatividade (chamado pelo frontend antes de redirecionar)
router.post('/logout-inatividade', verificarToken, async (req, res) => {
  const ip = ipFromReq(req);
  await registrarAuditoria(req.usuario.usuario, 'SESSAO_EXPIRADA', 'Inatividade', ip, extraFromReq(req));
  res.clearCookie('authToken');
  res.clearCookie('csrfToken');
  res.json({ message: 'Sessão encerrada por inatividade' });
});

// Perfil do usuário logado
router.get('/me', verificarToken, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.lgpd_aceito, a.id AS agente_id, a.foto
     FROM usuarios u
     LEFT JOIN agentes a ON a.usuario = u.usuario
     WHERE u.usuario = $1`,
    [req.usuario.usuario]
  );
  res.json({
    usuario: req.usuario.usuario,
    role: req.usuario.role,
    sessao_id: req.usuario.sessao_id,
    inatividade_minutos: INATIVIDADE_MINUTOS,
    lgpd_aceito: !!(rows[0]?.lgpd_aceito),
    agente_id: rows[0]?.agente_id || null,
    foto: rows[0]?.foto || null,
  });
});

// Registrar aceite da LGPD
router.post('/lgpd-aceite', verificarToken, async (req, res) => {
  try {
    await db.query('UPDATE usuarios SET lgpd_aceito = true WHERE usuario = $1', [req.usuario.usuario]);
    res.json({ message: 'Aceite registrado' });
  } catch (error) {
    erroServidor(res, error);
  }
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
    const erroSenha = validarSenha(senha);
    if (erroSenha) return res.status(400).json({ error: erroSenha });
    const hash = await bcrypt.hash(senha, 10);
    await db.query(
      "INSERT INTO usuarios (usuario, senha, role) VALUES ($1, $2, 'admin')",
      [usuario, hash]
    );
    res.json({ message: 'Administrador criado com sucesso' });
  } catch (error) {
    erroServidor(res, error);
  }
});

// Listar usuários (admin)
router.get('/usuarios', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, usuario, role, email FROM usuarios ORDER BY id');
    res.json(rows);
  } catch (error) {
    erroServidor(res, error);
  }
});

// Criar usuário (admin)
router.post('/usuarios', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { usuario, senha, role = 'agente', email } = req.body;
    if (!usuario || !senha) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `Role inválido. Valores aceitos: ${ROLES.join(', ')}` });
    }
    const erroSenha = validarSenha(senha);
    if (erroSenha) return res.status(400).json({ error: erroSenha });
    const hash = await bcrypt.hash(senha, 10);
    const result = await db.query(
      'INSERT INTO usuarios (usuario, senha, role, email) VALUES ($1, $2, $3, $4) RETURNING id',
      [usuario, hash, role, email || null]
    );
    const ip = ipFromReq(req);
    await registrarAuditoria(req.usuario.usuario, 'CRIAR_USUARIO', usuario, ip, extraFromReq(req));
    res.status(201).json({ message: 'Usuário criado com sucesso', id: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Usuário já existe' });
    }
    erroServidor(res, error);
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
    const ip = ipFromReq(req);
    await registrarAuditoria(req.usuario.usuario, 'REMOVER_USUARIO', rows[0].usuario, ip, extraFromReq(req));
    res.json({ message: 'Usuário removido com sucesso' });
  } catch (error) {
    erroServidor(res, error);
  }
});

// Alterar senha de usuário pelo admin
router.patch('/usuarios/:id/senha', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { senha } = req.body;
    if (!senha) return res.status(400).json({ error: 'Nova senha é obrigatória.' });
    const erroSenha = validarSenha(senha);
    if (erroSenha) return res.status(400).json({ error: erroSenha });

    const { rows } = await db.query('SELECT usuario FROM usuarios WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    const hash = await bcrypt.hash(senha, 10);
    await db.query('UPDATE usuarios SET senha = $1 WHERE id = $2', [hash, id]);

    const ip = ipFromReq(req);
    await registrarAuditoria(req.usuario.usuario, 'ADMIN_RESET_SENHA', rows[0].usuario, ip, extraFromReq(req));
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    erroServidor(res, error);
  }
});

// Alterar e-mail de usuário pelo admin
router.patch('/usuarios/:id/email', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const { rows } = await db.query('SELECT usuario FROM usuarios WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    await db.query('UPDATE usuarios SET email = $1 WHERE id = $2', [email || null, id]);
    res.json({ message: 'E-mail atualizado com sucesso' });
  } catch (error) {
    erroServidor(res, error);
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
    const ip = ipFromReq(req);
    await registrarAuditoria(req.usuario.usuario, 'ALTERAR_ROLE', `${rows[0].usuario} → ${role}`, ip, extraFromReq(req));
    res.json({ message: 'Perfil atualizado com sucesso' });
  } catch (error) {
    erroServidor(res, error);
  }
});

// Estatísticas de retenção (admin)
router.get('/retencao', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const anos = parseInt(process.env.RETENCAO_ANOS || '5');
    const { rows: total } = await db.query('SELECT COUNT(*) AS total FROM boletins');
    const { rows: antigos } = await db.query(
      `SELECT COUNT(*) AS total FROM boletins WHERE data::timestamptz < NOW() - make_interval(years => $1)`,
      [anos]
    );
    res.json({
      retencao_anos: anos,
      total_bos: parseInt(total[0].total),
      bos_para_arquivar: parseInt(antigos[0].total),
    });
  } catch (error) {
    erroServidor(res, error);
  }
});

// Arquivar BOs antigos (admin)
router.delete('/retencao/arquivar', verificarToken, verificarAdmin, async (req, res) => {
  try {
    const anos = parseInt(process.env.RETENCAO_ANOS || '5');
    const { rows, rowCount } = await db.query(
      `DELETE FROM boletins WHERE data::timestamptz < NOW() - make_interval(years => $1) RETURNING numero`,
      [anos]
    );
    const ip = ipFromReq(req);
    await registrarAuditoria(req.usuario.usuario, 'ARQUIVAR_BOs', `${rowCount} registros removidos`, ip, extraFromReq(req));
    res.json({ message: `${rowCount} BO(s) arquivado(s)`, arquivados: rows.map(r => r.numero) });
  } catch (error) {
    erroServidor(res, error);
  }
});

// Logs de auditoria (admin + supervisor)
router.get('/auditoria', verificarToken, async (req, res) => {
  try {
    const role = req.usuario?.role;
    if (role !== 'admin' && role !== 'supervisor') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      db.query(
        `SELECT id, usuario, acao, recurso, ip, data,
                dispositivo, navegador, so, sessao_id
         FROM audit_logs ORDER BY data DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      db.query(`SELECT COUNT(*) AS total FROM audit_logs`),
    ]);

    const total = parseInt(countRows[0].total);
    res.json({ data: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    erroServidor(res, error);
  }
});

// Solicitar recuperação de senha por e-mail
router.post('/esqueci-senha', async (req, res) => {
  try {
    const { matricula } = req.body;
    if (!matricula) return res.status(400).json({ error: 'Informe o número de matrícula.' });

    const { rows } = await db.query(
      `SELECT u.id, u.usuario, COALESCE(u.email, a.email) AS email
       FROM usuarios u
       JOIN agentes a ON a.usuario = u.usuario
       WHERE a.matricula = $1`,
      [matricula.trim()]
    );
    // Resposta genérica para evitar enumeração de usuários
    if (!rows[0] || !rows[0].email) {
      return res.json({ message: 'Se o usuário existir e tiver e-mail cadastrado, um link de recuperação será enviado.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await db.query(
      'UPDATE usuarios SET reset_token = $1, reset_token_expira = $2 WHERE id = $3',
      [tokenHash, expira, rows[0].id]
    );

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const link = `${baseUrl}/pages/recuperar-senha.html?token=${token}`;

    await enviarEmail({
      to: rows[0].email,
      toName: rows[0].usuario,
      subject: 'Recuperação de Senha — GCM Bananeiras',
      html: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Senha</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Cabeçalho -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#0e1f3d 0%,#2171B5 100%);border-radius:10px 10px 0 0;padding:32px 24px;">
              <p style="margin:0 0 4px 0;color:#a8c8f0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Prefeitura Municipal de Bananeiras</p>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Guarda Civil Municipal</h1>
              <p style="margin:8px 0 0 0;color:#a8c8f0;font-size:13px;">Sistema de Registro de BO</p>
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td style="background:#ffffff;padding:36px 32px;">
              <h2 style="margin:0 0 8px 0;color:#0e1f3d;font-size:20px;">Redefinição de Senha</h2>
              <p style="margin:0 0 20px 0;color:#555;font-size:15px;line-height:1.6;">
                Olá, <strong style="color:#0e1f3d;">${rows[0].usuario}</strong>.
              </p>
              <p style="margin:0 0 28px 0;color:#555;font-size:15px;line-height:1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:
              </p>

              <!-- Botão -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px 0;">
                    <a href="${link}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:6px;letter-spacing:0.5px;">
                      Redefinir minha senha
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Aviso de expiração -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e1;border-left:4px solid #f59e0b;border-radius:4px;margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;color:#92400e;font-size:13px;line-height:1.5;">
                    ⏱️ <strong>Este link expira em 1 hora.</strong> Após esse prazo será necessário solicitar um novo link.
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#888;font-size:13px;line-height:1.6;">
                Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha permanecerá a mesma.
              </p>

              <!-- Link alternativo -->
              <p style="margin:20px 0 0 0;color:#aaa;font-size:11px;line-height:1.6;word-break:break-all;">
                Se o botão não funcionar, copie e cole este link no navegador:<br>
                <a href="${link}" style="color:#1d4ed8;">${link}</a>
              </p>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td align="center" style="background:#e8edf2;border-radius:0 0 10px 10px;padding:20px 24px;">
              <p style="margin:0;color:#888;font-size:12px;line-height:1.6;">
                Este é um e-mail automático. Por favor, não responda.<br>
                © ${new Date().getFullYear()} Guarda Civil Municipal de Bananeiras — PB
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });

    res.json({ message: 'Se o usuário existir e tiver e-mail cadastrado, um link de recuperação será enviado.' });
  } catch (error) {
    erroServidor(res, error);
  }
});

// Redefinir senha com token
router.post('/redefinir-senha', async (req, res) => {
  try {
    const { token, novaSenha } = req.body;
    if (!token || !novaSenha) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
    }

    const erroSenha = validarSenha(novaSenha);
    if (erroSenha) return res.status(400).json({ error: erroSenha });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await db.query(
      'SELECT id, usuario, reset_token_expira FROM usuarios WHERE reset_token = $1',
      [tokenHash]
    );

    if (!rows[0] || new Date() > new Date(rows[0].reset_token_expira)) {
      return res.status(400).json({ error: 'Link de recuperação inválido ou expirado.' });
    }

    const hash = await bcrypt.hash(novaSenha, 10);
    await db.query(
      'UPDATE usuarios SET senha = $1, reset_token = NULL, reset_token_expira = NULL WHERE id = $2',
      [hash, rows[0].id]
    );

    await registrarAuditoria(rows[0].usuario, 'RESET_SENHA', 'via token de e-mail', ipFromReq(req), extraFromReq({ headers: req.headers, usuario: { sessao_id: null } }));

    res.json({ message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (error) {
    erroServidor(res, error);
  }
});

// Trocar própria senha
router.post('/trocar-senha', verificarToken, async (req, res) => {
  try {
    const { senhaAtual, senhaNova } = req.body;
    if (!senhaAtual || !senhaNova) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }
    const erroSenha = validarSenha(senhaNova);
    if (erroSenha) return res.status(400).json({ error: erroSenha });

    const { rows } = await db.query('SELECT * FROM usuarios WHERE usuario = $1', [req.usuario.usuario]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });

    const senhaValida = await bcrypt.compare(senhaAtual, row.senha);
    if (!senhaValida) return res.status(401).json({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(senhaNova, 10);
    await db.query('UPDATE usuarios SET senha = $1 WHERE usuario = $2', [hash, req.usuario.usuario]);

    const ip = ipFromReq(req);
    await registrarAuditoria(req.usuario.usuario, 'TROCAR_SENHA', null, ip, extraFromReq(req));
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    erroServidor(res, error);
  }
});

module.exports = router;
