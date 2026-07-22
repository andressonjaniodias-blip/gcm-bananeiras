const express  = require('express');
const router   = express.Router();
const db       = require('../config/db');
const { verificarToken, verificarAdmin, auditar } = require('../middleware/auth');
const exigirAdmin = verificarAdmin;
const erroServidor = require('../utils/erroServidor');
const { encriptar, desencriptarComFallback } = require('../utils/encryption');
const { validarEmail } = require('../utils/validation');
const { CARGOS, CARGO_PADRAO, normalizarCargo } = require('../utils/cargos');
const { nomeExibicao, slugAgente } = require('../utils/nomeAgente');
const {
  BLOCOS, BLOCOS_FICHA, blocosEditaveis,
  camposDeAgentes, camposDaFicha, sanitizarBloco,
} = require('../utils/fichaSchema');
const { construirFichaPdf } = require('../utils/fichaPdf');

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
      [nome.trim(), matricula.trim(), normalizarCargo(cargo) || CARGO_PADRAO, usuario,
       lotacao?.trim() || null, turno || null]
    );
    await auditar(req, 'CRIAR_AGENTE', `${rows[0].nome} (mat. ${rows[0].matricula}) — auto-cadastro`);
    res.status(201).json(decifrarAgente(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Matrícula já cadastrada para outro agente.' });
    erroServidor(res, err);
  }
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

// ── Ficha funcional ─────────────────────────────────────────────────────────
// O formulário completo é montado pela tela a partir deste schema — assim campo
// novo entra num lugar só (utils/fichaSchema.js) e aparece na tela, na API e no PDF.
router.get('/ficha/schema', verificarToken, (req, res) => {
  const blocos = BLOCOS.map(b => ({
    ...b,
    campos: b.campos.map(c => (c.opcoes === 'CARGOS' ? { ...c, opcoes: CARGOS } : c)),
  }));
  res.json({ blocos, cargos: CARGOS, editaveis: blocosEditaveis(req.usuario?.role) });
});

// A ficha é do agente e do comando: admin vê a de qualquer um, e cada servidor
// vê a sua. Ninguém mais.
async function carregarAgenteAutorizado(req, id) {
  // Id não numérico não chega ao banco: a coluna é integer e o driver responderia
  // com erro de sintaxe (500) para algo que é, na verdade, um 404.
  if (!/^\d+$/.test(String(id))) return { erro: 404, mensagem: 'Agente não encontrado.' };
  const { rows } = await db.query(`SELECT ${CAMPOS_AGENTE} FROM agentes WHERE id = $1`, [id]);
  if (!rows.length) return { erro: 404, mensagem: 'Agente não encontrado.' };
  const agente = decifrarAgente(rows[0]);
  const proprio = agente.usuario && agente.usuario === req.usuario?.usuario;
  if (req.usuario?.role !== 'admin' && !proprio) {
    return { erro: 403, mensagem: 'Você só pode acessar a sua própria ficha.' };
  }
  return { agente, proprio };
}

// Lê os blocos JSON cifrados; bloco ausente ou ilegível volta como objeto vazio.
async function lerFicha(agenteId) {
  const { rows } = await db.query('SELECT * FROM agente_ficha WHERE agente_id = $1', [agenteId]);
  const linha = rows[0] || {};
  const ficha = {};
  for (const id of BLOCOS_FICHA) {
    try {
      ficha[id] = linha[id] ? JSON.parse(desencriptarComFallback(linha[id])) : {};
    } catch { ficha[id] = {}; }
  }
  return { ficha, atualizado_em: linha.atualizado_em || null, atualizado_por: linha.atualizado_por || null };
}

// Junta, por bloco, os campos que moram em `agentes` com os que moram na ficha —
// a tela e o PDF recebem tudo já no formato do schema.
function montarBlocos(agente, ficha) {
  const out = {};
  for (const b of BLOCOS) {
    const valores = { ...(ficha[b.id] || {}) };
    for (const campo of camposDeAgentes(b.id)) valores[campo.id] = agente[campo.id] ?? '';
    out[b.id] = valores;
  }
  return out;
}

router.get('/:id/ficha', verificarToken, async (req, res) => {
  try {
    const { erro, mensagem, agente } = await carregarAgenteAutorizado(req, req.params.id);
    if (erro) return res.status(erro).json({ error: mensagem });
    const { ficha, atualizado_em, atualizado_por } = await lerFicha(agente.id);
    await auditar(req, 'VER_FICHA', `${agente.nome} (mat. ${agente.matricula})`);
    res.json({
      agente: { id: agente.id, nome: agente.nome, matricula: agente.matricula, cargo: agente.cargo,
                usuario: agente.usuario, ativo: agente.ativo, foto: agente.foto,
                nome_exibicao: nomeExibicao(agente) },
      blocos: montarBlocos(agente, ficha),
      editaveis: blocosEditaveis(req.usuario?.role),
      atualizado_em, atualizado_por,
    });
  } catch (err) { erroServidor(res, err); }
});

// Grava só os blocos que o papel do solicitante pode editar; bloco de outro dono
// que chegue no corpo da requisição é ignorado em silêncio (a tela já os mostra
// como somente leitura — recusar tudo só atrapalharia quem salva a ficha inteira).
router.put('/:id/ficha', verificarToken, async (req, res) => {
  try {
    const { erro, mensagem, agente } = await carregarAgenteAutorizado(req, req.params.id);
    if (erro) return res.status(erro).json({ error: mensagem });

    const role = req.usuario?.role;
    const permitidos = blocosEditaveis(role);
    const enviados = req.body?.blocos || {};

    const colunasAgente = {};   // coluna da tabela agentes → valor
    const blocosJson    = {};   // bloco → objeto a cifrar

    for (const blocoId of Object.keys(enviados)) {
      if (!permitidos.includes(blocoId)) continue;
      const limpo = sanitizarBloco(blocoId, enviados[blocoId], role);
      const idsFicha = camposDaFicha(blocoId).map(c => c.id);
      const doBloco = {};
      for (const [campoId, valor] of Object.entries(limpo)) {
        if (idsFicha.includes(campoId)) {
          // Campo vazio sai do JSON — o bloco é regravado inteiro, então some mesmo.
          if (Array.isArray(valor) ? valor.length : String(valor).length) doBloco[campoId] = valor;
        } else {
          colunasAgente[campoId] = valor;
        }
      }
      blocosJson[blocoId] = doBloco;
    }

    if (colunasAgente.email && !validarEmail(colunasAgente.email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    // Nome, matrícula e cargo são obrigatórios no cadastro: não existe intenção
    // legítima de deixá-los em branco. Campo vazio aqui significa "não mexi
    // neste campo" (o formulário da ficha pode ser aberto sem eles preenchidos),
    // então o valor atual é mantido em vez de virar NULL.
    for (const obrigatorio of ['nome', 'matricula', 'cargo']) {
      if (colunasAgente[obrigatorio] === '') delete colunasAgente[obrigatorio];
    }
    if (colunasAgente.cargo != null) {
      const oficial = normalizarCargo(colunasAgente.cargo);
      if (!oficial) return res.status(400).json({ error: `Cargo inválido. Valores aceitos: ${CARGOS.join('; ')}` });
      colunasAgente.cargo = oficial;
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const cols = Object.keys(colunasAgente);
      if (cols.length) {
        // Nomes de coluna vêm do schema (whitelist), nunca do corpo da requisição.
        const sets = cols.map((c, i) => `${c}=$${i + 1}`);
        const vals = cols.map(c => {
          const v = colunasAgente[c];
          return CAMPOS_CIFRADOS.includes(c) ? cifrar(v) : (v === '' ? null : v);
        });
        await client.query(
          `UPDATE agentes SET ${sets.join(', ')}, atualizado_em=NOW() WHERE id=$${cols.length + 1}`,
          [...vals, agente.id]
        );
      }

      const idsBloco = Object.keys(blocosJson);
      if (idsBloco.length) {
        const colsFicha = idsBloco.map((id, i) => `${id}=$${i + 2}`);
        const valsFicha = idsBloco.map(id => encriptar(JSON.stringify(blocosJson[id])));
        await client.query(
          `INSERT INTO agente_ficha (agente_id, ${idsBloco.join(', ')}, atualizado_em, atualizado_por)
           VALUES ($1, ${idsBloco.map((_, i) => `$${i + 2}`).join(', ')}, NOW(), $${idsBloco.length + 2})
           ON CONFLICT (agente_id) DO UPDATE SET ${colsFicha.join(', ')},
             atualizado_em = NOW(), atualizado_por = $${idsBloco.length + 2}`,
          [agente.id, ...valsFicha, req.usuario.usuario]
        );
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await auditar(req, 'ALTERAR_FICHA', `${agente.nome} (mat. ${agente.matricula}) — blocos: ${Object.keys(blocosJson).join(', ') || '—'}`);
    const { rows } = await db.query(`SELECT ${CAMPOS_AGENTE} FROM agentes WHERE id = $1`, [agente.id]);
    const atualizado = decifrarAgente(rows[0]);
    const { ficha } = await lerFicha(agente.id);
    res.json({ ok: true, blocos: montarBlocos(atualizado, ficha) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Matrícula já cadastrada para outro agente.' });
    erroServidor(res, err);
  }
});

// Ficha em PDF. `resumida` deixa de fora saúde e histórico disciplinar — é a
// versão para uso rotineiro; a completa fica com o próprio agente e o comando.
router.get('/:id/ficha.pdf', verificarToken, async (req, res) => {
  try {
    const { erro, mensagem, agente } = await carregarAgenteAutorizado(req, req.params.id);
    if (erro) return res.status(erro).json({ error: mensagem });

    const resumida = req.query.formato === 'resumida';
    const { ficha, atualizado_em } = await lerFicha(agente.id);
    const pdf = await construirFichaPdf({
      agente,
      blocos: montarBlocos(agente, ficha),
      resumida,
      emitidoPor: req.usuario.usuario,
      atualizadoEm: atualizado_em,
    });

    await auditar(req, 'BAIXAR_FICHA', `${agente.nome} (mat. ${agente.matricula}) — ${resumida ? 'resumida' : 'completa'}`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="ficha${resumida ? '-resumida' : ''}-${slugAgente(agente)}.pdf"`);
    res.end(pdf);
  } catch (err) { erroServidor(res, err); }
});

// Remover agente do efetivo, apagando também a ficha (ON DELETE CASCADE).
// O fluxo normal de desligamento é remover o usuário (DELETE /api/auth/usuarios/:id),
// que inativa o agente e preserva o histórico; esta rota existe para o
// atendimento a pedido de eliminação de dados (LGPD art. 18, VI).
router.delete('/:id', verificarToken, exigirAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`DELETE FROM agentes WHERE id=$1 RETURNING id, nome, matricula`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Agente não encontrado.' });
    await auditar(req, 'REMOVER_AGENTE', `${rows[0].nome} (mat. ${rows[0].matricula})`);
    res.json({ ok: true });
  } catch (err) { erroServidor(res, err); }
});

module.exports = router;
