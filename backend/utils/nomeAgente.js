// backend/utils/nomeAgente.js
// Nome do agente como ele deve sair nos documentos: o nome de guerra, com o nome
// completo como reserva.
//
// O login (agentes.usuario) NÃO entra nessa cadeia. Até a migração do nome de
// guerra ele guardava o próprio nome de guerra e era usado nos COALESCE do módulo
// de escala; hoje ele guarda a MATRÍCULA, então usá-lo imprimiria número no lugar
// de nome. Ver a migração em config/db.js.

// Trecho SQL padrão para as consultas que já fazem LEFT JOIN em `agentes`.
//   aliasAgente: alias da tabela agentes na consulta (ex.: 'a')
//   snapshot:    coluna com a cópia do nome gravada no registro (ex.: 'ei.nome'),
//                usada quando o lançamento não está mais vinculado a um agente.
function sqlNomeExibicao(aliasAgente, snapshot, apelido = 'nome_exibicao') {
  return `COALESCE(NULLIF(TRIM(${aliasAgente}.nome_guerra), ''), ${snapshot}) AS ${apelido}`;
}

// Mesma regra, para registros já carregados (agente do banco ou item com snapshot).
function nomeExibicao(a) {
  if (!a) return '';
  const guerra = String(a.nome_guerra || '').trim();
  if (guerra) return guerra;
  return String(a.nome_exibicao || a.nome || '').trim();
}

function _norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ');
}

// O BO tem os nomes do efetivo em campo de texto livre, e a matrícula é buscada a
// partir do que foi digitado. Aceita nome de guerra, nome completo ou matrícula,
// para o operador poder digitar do jeito que conhece o agente.
function casaAgente(texto, agente) {
  const q = _norm(texto);
  if (!q || !agente) return false;
  return q === _norm(agente.nome_guerra)
      || q === _norm(agente.nome)
      || q === _norm(agente.matricula);
}

// Acha o agente correspondente ao texto digitado numa lista já carregada.
// Prefere o casamento por nome de guerra, para não depender da ordem da lista.
function acharAgente(texto, agentes) {
  const q = _norm(texto);
  if (!q) return null;
  const lista = agentes || [];
  return lista.find(a => _norm(a.nome_guerra) === q)
      || lista.find(a => _norm(a.nome) === q)
      || lista.find(a => _norm(a.matricula) === q)
      || null;
}

module.exports = { sqlNomeExibicao, nomeExibicao, casaAgente, acharAgente };
