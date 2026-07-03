const express  = require('express');
const router   = express.Router();
const db       = require('../config/db');
const { verificarToken, verificarAdmin, auditar } = require('../middleware/auth');
const exigirAdmin = verificarAdmin;
const erroServidor = require('../utils/erroServidor');
const { encriptar, desencriptarComFallback } = require('../utils/encryption');

function decifrarAgente(a) {
  return { ...a, cpf: desencriptarComFallback(a.cpf), rg: desencriptarComFallback(a.rg) };
}

const CAMPOS_AGENTE = `
  id, nome, matricula, cargo, usuario, ativo, criado_em, atualizado_em,
  cpf, rg, data_nascimento, sexo, lotacao, turno, data_admissao,
  email, telefone, cep, logradouro, numero_end, complemento, bairro, cidade, uf, foto
`;

// Listar agentes
router.get('/', verificarToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${CAMPOS_AGENTE} FROM agentes ORDER BY nome ASC`
    );
    res.json(rows.map(decifrarAgente));
  } catch (err) { erroServidor(res, err); }
});

// Criar agente
router.post('/', verificarToken, exigirAdmin, async (req, res) => {
  try {
    const {
      nome, matricula, cargo, usuario, ativo,
      cpf, rg, data_nascimento, sexo, lotacao, turno, data_admissao,
      email, telefone, cep, logradouro, numero_end, complemento, bairro, cidade, uf
    } = req.body;
    if (!nome || !matricula) return res.status(400).json({ error: 'Nome e matrícula são obrigatórios.' });
    const { rows } = await db.query(
      `INSERT INTO agentes
        (nome, matricula, cargo, usuario, ativo,
         cpf, rg, data_nascimento, sexo, lotacao, turno, data_admissao,
         email, telefone, cep, logradouro, numero_end, complemento, bairro, cidade, uf,
         atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
       RETURNING ${CAMPOS_AGENTE}`,
      [
        nome.trim(), matricula.trim(), cargo?.trim() || 'Guarda Civil Municipal',
        usuario?.trim() || null, ativo !== false,
        cpf?.trim() ? encriptar(cpf.trim()) : null,
        rg?.trim() ? encriptar(rg.trim()) : null,
        data_nascimento || null, sexo || null,
        lotacao?.trim() || null, turno || null, data_admissao || null,
        email?.trim() || null, telefone?.trim() || null,
        cep?.trim() || null, logradouro?.trim() || null,
        numero_end?.trim() || null, complemento?.trim() || null,
        bairro?.trim() || null, cidade?.trim() || null, uf?.trim() || null,
      ]
    );
    await auditar(req, 'CRIAR_AGENTE', `${rows[0].nome} (mat. ${rows[0].matricula})`);
    res.status(201).json(decifrarAgente(rows[0]));
  } catch (err) { erroServidor(res, err); }
});

// Atualizar agente (admin)
router.put('/:id', verificarToken, exigirAdmin, async (req, res) => {
  try {
    const {
      nome, matricula, cargo, usuario, ativo,
      cpf, rg, data_nascimento, sexo, lotacao, turno, data_admissao,
      email, telefone, cep, logradouro, numero_end, complemento, bairro, cidade, uf
    } = req.body;
    if (!nome || !matricula) return res.status(400).json({ error: 'Nome e matrícula são obrigatórios.' });
    const { rows } = await db.query(
      `UPDATE agentes SET
        nome=$1, matricula=$2, cargo=$3, usuario=$4, ativo=$5,
        cpf=$6, rg=$7, data_nascimento=$8, sexo=$9,
        lotacao=$10, turno=$11, data_admissao=$12,
        email=$13, telefone=$14, cep=$15, logradouro=$16,
        numero_end=$17, complemento=$18, bairro=$19, cidade=$20, uf=$21,
        atualizado_em=NOW()
       WHERE id=$22 RETURNING ${CAMPOS_AGENTE}`,
      [
        nome.trim(), matricula.trim(), cargo?.trim() || 'Guarda Civil Municipal',
        usuario?.trim() || null, ativo !== false,
        cpf?.trim() ? encriptar(cpf.trim()) : null,
        rg?.trim() ? encriptar(rg.trim()) : null,
        data_nascimento || null, sexo || null,
        lotacao?.trim() || null, turno || null, data_admissao || null,
        email?.trim() || null, telefone?.trim() || null,
        cep?.trim() || null, logradouro?.trim() || null,
        numero_end?.trim() || null, complemento?.trim() || null,
        bairro?.trim() || null, cidade?.trim() || null, uf?.trim() || null,
        req.params.id
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Agente não encontrado.' });
    await auditar(req, 'ALTERAR_AGENTE', `${rows[0].nome} (mat. ${rows[0].matricula})`);
    res.json(decifrarAgente(rows[0]));
  } catch (err) { erroServidor(res, err); }
});

// Auto-edição de contato — qualquer usuário autenticado atualiza os próprios dados mutáveis
router.patch('/meu-contato', verificarToken, async (req, res) => {
  try {
    const usuario = req.usuario?.usuario;
    const { telefone, email, cep, logradouro, numero_end, complemento, bairro, cidade, uf } = req.body;
    const { rows } = await db.query(
      `UPDATE agentes
       SET telefone=$1, email=$2, cep=$3, logradouro=$4,
           numero_end=$5, complemento=$6, bairro=$7, cidade=$8, uf=$9,
           atualizado_em=NOW()
       WHERE usuario=$10 RETURNING ${CAMPOS_AGENTE}`,
      [
        telefone?.trim() || null, email?.trim() || null,
        cep?.trim() || null, logradouro?.trim() || null,
        numero_end?.trim() || null, complemento?.trim() || null,
        bairro?.trim() || null, cidade?.trim() || null, uf?.trim() || null,
        usuario
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Agente vinculado ao usuário não encontrado.' });
    await auditar(req, 'ATUALIZAR_CONTATO', `Dados de contato — ${rows[0].nome}`);
    res.json(rows[0]);
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
