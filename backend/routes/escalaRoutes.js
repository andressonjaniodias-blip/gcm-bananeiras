const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, verificarSupervisor, auditar } = require('../middleware/auth');
const erroServidor = require('../utils/erroServidor');
const { numeroFolga, trabalhaNoDia, escalaTrabalhaHoje, montarCalendarioMes, montarResumoEscala, rankSetor, compararItensEscala } = require('../utils/escalaCalc');
const { desenharPdfEscala, desenharPdfResumo, nomeMes } = require('../utils/escalaPdf');
const { sqlNomeExibicao } = require('../utils/nomeAgente');
const { enviarPdfNotificacao } = require('../utils/email');

const PATRULHAS = ['1', '2', '3', '4'];

// ── Postos (lista configurável) ──────────────────────────────────────────────
router.get('/postos', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM postos WHERE ativo = true ORDER BY ordem, nome`);
    res.json(rows);
  } catch (err) { erroServidor(res, err); }
});

router.post('/postos', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { nome, seg_sex } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome do posto é obrigatório.' });
    const { rows: [{ mx }] } = await pool.query(`SELECT COALESCE(MAX(ordem),0)+1 AS mx FROM postos`);
    const { rows } = await pool.query(
      `INSERT INTO postos (nome, seg_sex, ordem) VALUES ($1,$2,$3)
       ON CONFLICT (nome) DO UPDATE SET ativo = true RETURNING *`,
      [nome.trim(), seg_sex === true, mx]
    );
    await auditar(req, 'CRIAR_POSTO', `Posto de escala: ${rows[0].nome}`);
    res.status(201).json(rows[0]);
  } catch (err) { erroServidor(res, err); }
});

router.delete('/postos/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE postos SET ativo = false WHERE id = $1 RETURNING nome`, [req.params.id]);
    await auditar(req, 'REMOVER_POSTO', `Posto de escala: ${rows[0]?.nome || req.params.id}`);
    res.json({ ok: true });
  } catch (err) { erroServidor(res, err); }
});

// ── Escalas ──────────────────────────────────────────────────────────────────
// Listar escalas (cabeçalhos) — leitura aberta a todos; montagem/edição continua restrita
router.get('/', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, numero, mes_referencia, titulo, criado_por, criado_em, atualizado_em
       FROM escalas ORDER BY mes_referencia DESC`
    );
    res.json(rows);
  } catch (err) { erroServidor(res, err); }
});

// Escala de hoje (resumo p/ quadro de avisos): agentes de serviço no dia, com o
// horário decidindo a distribuição (Seg–Sex, Sáb/Dom ou rodízio da patrulha).
router.get('/hoje', verificarToken, async (req, res) => {
  try {
    const dataRef = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '')
      ? req.query.data
      : new Date().toISOString().slice(0, 10);
    const mes = dataRef.slice(0, 7);
    const dia = parseInt(dataRef.slice(8, 10), 10);
    const diaSemana = new Date(dataRef + 'T12:00:00').getDay();

    const { rows: escalas } = await pool.query(`SELECT * FROM escalas WHERE mes_referencia = $1`, [mes]);
    if (!escalas.length) return res.json({ publicado: false });
    const escala = escalas[0];

    const patrulhaHoje = PATRULHAS.find(p => trabalhaNoDia(p, dia, escala.patrulha_dia1));

    const { rows: itens } = await pool.query(
      `SELECT posto, nome, matricula, patrulha, horario FROM escala_itens
       WHERE escala_id = $1 ORDER BY nome`,
      [escala.id]
    );
    const equipe = itens
      .filter(i => escalaTrabalhaHoje(i.horario, i.patrulha, dia, diaSemana, escala.patrulha_dia1))
      .map(({ posto, nome, matricula, horario }) => ({ posto, nome, matricula, horario }))
      // Ordem operacional dos setores (não alfabética); sem coluna de patrulha aqui.
      .sort((a, b) =>
        (rankSetor(a.posto, a.horario) - rankSetor(b.posto, b.horario)) ||
        String(a.posto || '').localeCompare(String(b.posto || ''), 'pt-BR') ||
        String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

    res.json({
      publicado: true,
      mes_referencia: escala.mes_referencia,
      numero: escala.numero,
      patrulha_hoje: patrulhaHoje || null,
      equipe,
    });
  } catch (err) { erroServidor(res, err); }
});

// Buscar escala por mês (YYYY-MM) com itens
router.get('/mes/:mes', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM escalas WHERE mes_referencia = $1`, [req.params.mes]);
    if (!rows.length) return res.json({ escala: null, itens: [] });
    const escala = rows[0];
    const { rows: itens } = await pool.query(
      `SELECT * FROM escala_itens WHERE escala_id = $1 ORDER BY patrulha, nome`,
      [escala.id]
    );
    itens.sort(compararItensEscala);
    res.json({ escala, itens });
  } catch (err) { erroServidor(res, err); }
});

// Buscar escala por id com itens
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM escalas WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Escala não encontrada.' });
    const { rows: itens } = await pool.query(
      `SELECT ei.*, ${sqlNomeExibicao('a', 'ei.nome')}
         FROM escala_itens ei
         LEFT JOIN agentes a ON a.id = ei.agente_id
        WHERE ei.escala_id = $1
        ORDER BY ei.patrulha, ei.nome`,
      [req.params.id]
    );
    itens.sort(compararItensEscala);
    res.json({ escala: rows[0], itens });
  } catch (err) { erroServidor(res, err); }
});

// Criar / substituir escala do mês (upsert + replace de itens)
router.post('/', verificarToken, verificarSupervisor, async (req, res) => {
  const client = await pool.connect();
  try {
    const { mes_referencia, titulo, obs, itens } = req.body;
    let { patrulha_dia1 } = req.body;
    if (!mes_referencia || !/^\d{4}-\d{2}$/.test(mes_referencia)) {
      return res.status(400).json({ error: 'Mês de referência inválido (use YYYY-MM).' });
    }
    if (!PATRULHAS.includes(String(patrulha_dia1))) patrulha_dia1 = '1';
    await client.query('BEGIN');

    // Escala já existe para o mês?
    const { rows: existente } = await client.query(
      `SELECT id, numero FROM escalas WHERE mes_referencia = $1`, [mes_referencia]
    );

    let escalaId, numero;
    if (existente.length) {
      escalaId = existente[0].id;
      numero   = existente[0].numero;
      await client.query(
        `UPDATE escalas SET titulo = $1, obs = $2, patrulha_dia1 = $3, atualizado_em = NOW() WHERE id = $4`,
        [titulo || null, obs || null, patrulha_dia1, escalaId]
      );
      await client.query(`DELETE FROM escala_itens WHERE escala_id = $1`, [escalaId]);
    } else {
      const ano = mes_referencia.slice(0, 4);
      const { rows: [{ seq }] } = await client.query(`SELECT nextval('esc_seq') AS seq`);
      numero = `ESC-GCM-${String(seq).padStart(4, '0')}/${ano}`;
      const { rows: novo } = await client.query(
        `INSERT INTO escalas (numero, mes_referencia, titulo, obs, patrulha_dia1, criado_por)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [numero, mes_referencia, titulo || null, obs || null, patrulha_dia1, req.usuario.usuario]
      );
      escalaId = novo[0].id;
    }

    for (const it of (itens || [])) {
      if (!it.patrulha || !it.posto || !it.nome) continue;
      await client.query(
        `INSERT INTO escala_itens (escala_id, patrulha, posto, agente_id, nome, matricula, regime, turno, horario, obs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [escalaId, String(it.patrulha), it.posto, it.agente_id || null, it.nome,
         it.matricula || null, it.regime || '24x72', it.turno || null, it.horario || null, it.obs || null]
      );
    }

    await client.query('COMMIT');
    const acaoEscala = existente.length ? 'ALTERAR_ESCALA' : 'CRIAR_ESCALA';
    const qtdItens = (itens || []).filter(it => it.patrulha && it.posto && it.nome).length;
    await auditar(req, acaoEscala, `${numero} — ${mes_referencia} (${qtdItens} lançamentos)`);
    res.status(201).json({ id: escalaId, numero });

    construirPdfEscala({ id: escalaId, numero, mes_referencia, titulo: titulo || null, obs: obs || null })
      .then(pdfBuffer => enviarPdfNotificacao({
        subject: `Escala ${existente.length ? 'atualizada' : 'publicada'} — ${nomeMes(mes_referencia)}`,
        html: `<p>A escala de serviço de <b>${nomeMes(mes_referencia)}</b> (${numero}) foi ${existente.length ? 'atualizada' : 'publicada'} por <b>${req.usuario.usuario}</b>.</p>`,
        pdfBuffer,
        filename: `escala-${mes_referencia}.pdf`,
      }))
      .catch(err => console.error('[Email-PDF] Falha ao gerar PDF da escala para envio:', err.message));
  } catch (err) {
    await client.query('ROLLBACK');
    erroServidor(res, err);
  } finally {
    client.release();
  }
});

// Excluir escala
router.delete('/:id', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, numero, mes_referencia FROM escalas WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Escala não encontrada.' });
    await pool.query(`DELETE FROM escalas WHERE id = $1`, [req.params.id]);
    await auditar(req, 'EXCLUIR_ESCALA', `${rows[0].numero || ''} — ${rows[0].mes_referencia}`);
    res.json({ ok: true });
  } catch (err) { erroServidor(res, err); }
});

// Monta o PDF da escala mensal no formato pedido ('calendario' dia a dia ou
// 'resumo' por blocos). Busca os dados no banco e delega o desenho ao escalaPdf
// (separado para permitir teste sem banco).
async function construirPdfEscala(escala, formato = 'calendario') {
  const { rows: itens } = await pool.query(
    `SELECT ei.*, ${sqlNomeExibicao('a', 'ei.nome')}
       FROM escala_itens ei
       LEFT JOIN agentes a ON a.id = ei.agente_id
      WHERE ei.escala_id = $1
      ORDER BY ei.patrulha, ei.nome`,
    [escala.id]
  );

  const mes = escala.mes_referencia;
  const inicioMes = `${mes}-01`;
  const [anoFer, mesFer] = mes.split('-');
  const fimMes = `${mes}-${String(new Date(parseInt(anoFer, 10), parseInt(mesFer, 10), 0).getDate()).padStart(2, '0')}`;
  const { rows: ferias } = await pool.query(
    `SELECT f.*, ${sqlNomeExibicao('a', 'f.nome')}
       FROM ferias f LEFT JOIN agentes a ON a.id = f.agente_id
      WHERE f.data_inicio <= $2 AND f.data_fim >= $1
      ORDER BY f.data_inicio, nome_exibicao`,
    [inicioMes, fimMes]
  );

  return formato === 'resumo'
    ? desenharPdfResumo(escala, montarResumoEscala(itens), ferias)
    : desenharPdfEscala(escala, itens, ferias);
}

// ── Visualização da escala (calendário dia a dia + resumo, para a tela) ───────
router.get('/:id/visualizacao', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM escalas WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Escala não encontrada.' });
    const escala = rows[0];

    const { rows: itens } = await pool.query(
      `SELECT ei.posto, ei.patrulha, ei.horario, ei.matricula,
              ${sqlNomeExibicao('a', 'ei.nome', 'nome')}
         FROM escala_itens ei
         LEFT JOIN agentes a ON a.id = ei.agente_id
        WHERE ei.escala_id = $1`,
      [escala.id]
    );

    const mes = escala.mes_referencia;
    const inicioMes = `${mes}-01`;
    const [anoFim, mesFim] = mes.split('-');
    const fimMes = `${mes}-${String(new Date(parseInt(anoFim, 10), parseInt(mesFim, 10), 0).getDate()).padStart(2, '0')}`;
    const { rows: ferias } = await pool.query(
      `SELECT ${sqlNomeExibicao('a', 'f.nome', 'nome')}, f.matricula, f.data_inicio, f.data_fim
         FROM ferias f LEFT JOIN agentes a ON a.id = f.agente_id
        WHERE f.data_inicio <= $2 AND f.data_fim >= $1
        ORDER BY f.data_inicio, nome`,
      [inicioMes, fimMes]
    );

    res.json({
      escala: { id: escala.id, numero: escala.numero, mes_referencia: escala.mes_referencia, titulo: escala.titulo, patrulha_dia1: escala.patrulha_dia1, criado_por: escala.criado_por },
      dias: montarCalendarioMes(itens, mes, escala.patrulha_dia1),
      resumo: montarResumoEscala(itens),
      ferias,
      obs: escala.obs || null,
    });
  } catch (err) { erroServidor(res, err); }
});

// ── PDF da escala (formato=calendario padrão | resumo) ───────────────────────
router.get('/:id/pdf', verificarToken, verificarSupervisor, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM escalas WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Escala não encontrada.' });
    const escala = rows[0];

    const formato = req.query.formato === 'resumo' ? 'resumo' : 'calendario';
    const pdfBuffer = await construirPdfEscala(escala, formato);
    const sufixo = formato === 'resumo' ? '-resumo' : '';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="escala-${escala.mes_referencia}${sufixo}.pdf"`);
    res.end(pdfBuffer);
  } catch (err) { erroServidor(res, err); }
});

module.exports = router;
