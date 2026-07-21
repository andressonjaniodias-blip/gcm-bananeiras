const express  = require('express');
const router   = express.Router();
const db       = require('../config/db');
const { verificarToken, verificarAdmin, auditar } = require('../middleware/auth');
const exigirAdmin = verificarAdmin;
const erroServidor = require('../utils/erroServidor');
const { encriptar, desencriptarComFallback } = require('../utils/encryption');
const { validarEmail } = require('../utils/validation');

// Campos pessoais cifrados em repouso (art. 46 LGPD). E-mail fica em texto puro por
// ser usado no fluxo de recuperação de senha (authRoutes); cidade/UF são de baixa
// granularidade. O fallback tolera linhas legadas gravadas em texto puro.
const CAMPOS_CIFRADOS = ['cpf', 'rg', 'data_nascimento', 'telefone', 'cep', 'logradouro', 'numero_end', 'complemento', 'bairro'];

const cifrar = v => (v != null && String(v).trim()) ? encriptar(String(v).trim()) : null;

function decifrarAgente(a) {
  const out = { ...a };
  for (const k of CAMPOS_CIFRADOS) {
    if (out[k] != null) out[k] = desencriptarComFallback(out[k]);
  }
  return out;
}

const CAMPOS_AGENTE = `
  id, nome, nome_guerra, matricula, cargo, usuario, ativo, criado_em, atualizado_em,
  cpf, rg, data_nascimento, sexo, lotacao, turno, data_admissao,
  email, telefone, cep, logradouro, numero_end, complemento, bairro, cidade, uf, foto
`;

// Campos operacionais, sem dados pessoais sensíveis (CPF, RG, endereço, contato, foto) —
// usados nas telas de autocomplete/seleção de agente, abertas a qualquer autenticado.
// nome_guerra vem junto porque é o nome que as telas gravam nos lançamentos.
const CAMPOS_AGENTE_RESUMO = `id, nome, nome_guerra, matricula, cargo, lotacao, turno, ativo, usuario`;

// Listar agentes — versão resumida (sem PII), aberta a qualquer autenticado
router.get('/', verificarToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${CAMPOS_AGENTE_RESUMO} FROM agentes ORDER BY nome ASC`
    );
    res.json(rows);
  } catch (err) { erroServidor(res, err); }
});

// Listar agentes — versão completa (com CPF/RG/endereço/contato/foto), só admin
router.get('/completo', verificarToken, exigirAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${CAMPOS_AGENTE} FROM agentes ORDER BY nome ASC`
    );
    res.json(rows.map(decifrarAgente));
  } catch (err) { erroServidor(res, err); }
});

// Dados completos do próprio agente vinculado ao usuário logado
router.get('/meu', verificarToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${CAMPOS_AGENTE} FROM agentes WHERE usuario = $1`, [req.usuario?.usuario]
    );
    if (!rows.length) return res.status(404).json({ error: 'Agente vinculado ao usuário não encontrado.' });
    res.json(decifrarAgente(rows[0]));
  } catch (err) { erroServidor(res, err); }
});

// Auto-cadastro do próprio agente — para logins que ainda não têm registro no
// efetivo (ex.: admin criado no setup). Qualquer autenticado cria o SEU registro,
// vinculado ao próprio usuário; uma linha por usuário (trava de duplicidade).
router.post('/meu', verificarToken, async (req, res) => {
  try {
    const usuario = req.usuario?.usuario;
    if (!usuario) return res.status(401).json({ error: 'Sessão inválida.' });
    const { nome, matricula, cargo, lotacao, turno } = req.body;
    if (!nome || !nome.trim() || !matricula || !matricula.trim()) {
      return res.status(400).json({ error: 'Nome e matrícula são obrigatórios.' });
    }
    const { rows: existe } = await db.query('SELECT 1 FROM agentes WHERE usuario = $1', [usuario]);
    if (existe.length) return res.status(409).json({ error: 'Você já tem cadastro de agente.' });
    const { rows } = await db.query(
      `INSERT INTO agentes (nome, matricula, cargo, usuario, ativo, lotacao, turno, atualizado_em)
       VALUES ($1,$2,$3,$4,true,$5,$6,NOW())
       RETURNING ${CAMPOS_AGENTE}`,
      [nome.trim(), matricula.trim(), cargo?.trim() || 'Guarda Civil Municipal', usuario,
       lotacao?.trim() || null, turno || null]
    );
    await auditar(req, 'CRIAR_AGENTE', `${rows[0].nome} (mat. ${rows[0].matricula}) — auto-cadastro`);
    res.status(201).json(decifrarAgente(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Matrícula já cadastrada para outro agente.' });
    erroServidor(res, err);
  }
});

// Criar agente
router.post('/', verificarToken, exigirAdmin, async (req, res) => {
  try {
    const {
      nome, nome_guerra, matricula, cargo, usuario, ativo,
      cpf, rg, data_nascimento, sexo, lotacao, turno, data_admissao,
      email, telefone, cep, logradouro, numero_end, complemento, bairro, cidade, uf
    } = req.body;
    if (!nome || !matricula) return res.status(400).json({ error: 'Nome e matrícula são obrigatórios.' });
    if (email?.trim() && !validarEmail(email.trim())) return res.status(400).json({ error: 'E-mail inválido.' });
    const { rows } = await db.query(
      `INSERT INTO agentes
        (nome, nome_guerra, matricula, cargo, usuario, ativo,
         cpf, rg, data_nascimento, sexo, lotacao, turno, data_admissao,
         email, telefone, cep, logradouro, numero_end, complemento, bairro, cidade, uf,
         atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
       RETURNING ${CAMPOS_AGENTE}`,
      [
        nome.trim(), nome_guerra?.trim() || null,
        matricula.trim(), cargo?.trim() || 'Guarda Civil Municipal',
        usuario?.trim() || matricula.trim(), ativo !== false,
        cifrar(cpf), cifrar(rg),
        cifrar(data_nascimento), sexo || null,
        lotacao?.trim() || null, turno || null, data_admissao || null,
        email?.trim() || null, cifrar(telefone),
        cifrar(cep), cifrar(logradouro),
        cifrar(numero_end), cifrar(complemento),
        cifrar(bairro), cidade?.trim() || null, uf?.trim() || null,
      ]
    );
    await auditar(req, 'CRIAR_AGENTE', `${rows[0].nome} (mat. ${rows[0].matricula})`);
    res.status(201).json(decifrarAgente(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Matrícula já cadastrada para outro agente.' });
    erroServidor(res, err);
  }
});

// Atualizar agente (admin)
router.put('/:id', verificarToken, exigirAdmin, async (req, res) => {
  try {
    const {
      nome, nome_guerra, matricula, cargo, usuario, ativo,
      cpf, rg, data_nascimento, sexo, lotacao, turno, data_admissao,
      email, telefone, cep, logradouro, numero_end, complemento, bairro, cidade, uf
    } = req.body;
    if (!nome || !matricula) return res.status(400).json({ error: 'Nome e matrícula são obrigatórios.' });
    if (email?.trim() && !validarEmail(email.trim())) return res.status(400).json({ error: 'E-mail inválido.' });
    const { rows } = await db.query(
      `UPDATE agentes SET
        nome=$1, nome_guerra=$2, matricula=$3, cargo=$4, usuario=$5, ativo=$6,
        cpf=$7, rg=$8, data_nascimento=$9, sexo=$10,
        lotacao=$11, turno=$12, data_admissao=$13,
        email=$14, telefone=$15, cep=$16, logradouro=$17,
        numero_end=$18, complemento=$19, bairro=$20, cidade=$21, uf=$22,
        atualizado_em=NOW()
       WHERE id=$23 RETURNING ${CAMPOS_AGENTE}`,
      [
        nome.trim(), nome_guerra?.trim() || null,
        matricula.trim(), cargo?.trim() || 'Guarda Civil Municipal',
        usuario?.trim() || matricula.trim(), ativo !== false,
        cifrar(cpf), cifrar(rg),
        cifrar(data_nascimento), sexo || null,
        lotacao?.trim() || null, turno || null, data_admissao || null,
        email?.trim() || null, cifrar(telefone),
        cifrar(cep), cifrar(logradouro),
        cifrar(numero_end), cifrar(complemento),
        cifrar(bairro), cidade?.trim() || null, uf?.trim() || null,
        req.params.id
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Agente não encontrado.' });
    await auditar(req, 'ALTERAR_AGENTE', `${rows[0].nome} (mat. ${rows[0].matricula})`);
    res.json(decifrarAgente(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Matrícula já cadastrada para outro agente.' });
    erroServidor(res, err);
  }
});

// Auto-edição de contato — qualquer usuário autenticado atualiza os próprios dados mutáveis
router.patch('/meu-contato', verificarToken, async (req, res) => {
  try {
    const usuario = req.usuario?.usuario;
    const { telefone, email, cep, logradouro, numero_end, complemento, bairro, cidade, uf } = req.body;
    if (email?.trim() && !validarEmail(email.trim())) return res.status(400).json({ error: 'E-mail inválido.' });
    const { rows } = await db.query(
      `UPDATE agentes
       SET telefone=$1, email=$2, cep=$3, logradouro=$4,
           numero_end=$5, complemento=$6, bairro=$7, cidade=$8, uf=$9,
           atualizado_em=NOW()
       WHERE usuario=$10 RETURNING ${CAMPOS_AGENTE}`,
      [
        cifrar(telefone), email?.trim() || null,
        cifrar(cep), cifrar(logradouro),
        cifrar(numero_end), cifrar(complemento),
        cifrar(bairro), cidade?.trim() || null, uf?.trim() || null,
        usuario
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Agente vinculado ao usuário não encontrado.' });
    await auditar(req, 'ATUALIZAR_CONTATO', `Dados de contato — ${rows[0].nome}`);
    res.json(decifrarAgente(rows[0]));
  } catch (err) { erroServidor(res, err); }
});

// Salvar foto de perfil (próprio usuário)
router.patch('/minha-foto', verificarToken, async (req, res) => {
  try {
    const usuario = req.usuario?.usuario;
    const { foto } = req.body;
    if (!foto) return res.status(400).json({ error: 'Foto não enviada.' });
    if (foto.length > 500_000) return res.status(413).json({ error: 'Imagem muito grande. Máx. 500 KB.' });
    const { rows } = await db.query(
      `UPDATE agentes SET foto=$1, atualizado_em=NOW() WHERE usuario=$2 RETURNING id`,
      [foto, usuario]
    );
    if (!rows.length) return res.status(404).json({ error: 'Agente não encontrado.' });
    res.json({ ok: true });
  } catch (err) { erroServidor(res, err); }
});

// Remover agente
router.delete('/:id', verificarToken, exigirAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`DELETE FROM agentes WHERE id=$1 RETURNING id, nome, matricula`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Agente não encontrado.' });
    await auditar(req, 'REMOVER_AGENTE', `${rows[0].nome} (mat. ${rows[0].matricula})`);
    res.json({ ok: true });
  } catch (err) { erroServidor(res, err); }
});

module.exports = router;
