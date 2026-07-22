// backend/utils/nomeAgente.js
// Como o agente é identificado na tela e em todo documento gerado:
//
//     "João Carlos, 1234"   →  dois primeiros nomes + vírgula + matrícula
//
// O padrão é único e formal: não depende de nome de guerra (que virou apenas
// sugestão de login e apelido de busca) nem do login em si. Onde a matrícula já
// tem coluna/campo próprio — tabelas de extras e férias, campos do BO — use
// nomeCurto(), para o número não sair repetido.

// Dois primeiros nomes: 'João Carlos Silva Souza' → 'João Carlos'.
// Nome de uma palavra só volta inteiro.
function nomeCurto(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return partes.slice(0, 2).join(' ');
}

// Nome de exibição completo: 'João Carlos, 1234'. Sem matrícula, sai só o nome.
// Aceita tanto um agente do banco quanto um lançamento já carregado (que traz o
// nome resolvido em nome_exibicao pelo sqlNomeExibicao).
function nomeExibicao(a) {
  if (!a) return '';
  const curto = nomeCurto(a.nome_exibicao || a.nome);
  const mat = String(a.matricula || '').trim();
  if (!curto) return mat;
  return mat ? `${curto}, ${mat}` : curto;
}

// Nome de arquivo padronizado: 'joao-carlos-1234'.
function slugAgente(a) {
  if (!a) return 'agente';
  const base = _norm(nomeCurto(a.nome_exibicao || a.nome)).replace(/[^a-z0-9]+/g, '-');
  const mat = _norm(a.matricula).replace(/[^a-z0-9]+/g, '-');
  return [base, mat].filter(Boolean).join('-').replace(/^-+|-+$/g, '') || 'agente';
}

// Trecho SQL padrão para as consultas que já fazem LEFT JOIN em `agentes`.
// Devolve o nome COMPLETO — a redução para dois nomes acontece em JS, para a
// mesma regra valer na API, no PDF e na tela.
//   aliasAgente: alias da tabela agentes na consulta (ex.: 'a')
//   snapshot:    coluna com a cópia do nome gravada no registro (ex.: 'ei.nome'),
//                usada quando o lançamento não está mais vinculado a um agente.
function sqlNomeExibicao(aliasAgente, snapshot, apelido = 'nome_exibicao') {
  return `COALESCE(NULLIF(TRIM(${aliasAgente}.nome), ''), ${snapshot}) AS ${apelido}`;
}

function _norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ');
}

// O BO tem os nomes do efetivo em campo de texto livre, e a matrícula é buscada a
// partir do que foi digitado. Aceita nome completo, dois primeiros nomes, nome de
// guerra ou matrícula, para o operador poder digitar do jeito que conhece o agente.
function casaAgente(texto, agente) {
  const q = _norm(texto);
  if (!q || !agente) return false;
  return q === _norm(agente.nome)
      || q === _norm(nomeCurto(agente.nome))
      || q === _norm(agente.nome_guerra)
      || q === _norm(agente.matricula);
}

// Acha o agente correspondente ao texto digitado numa lista já carregada.
// Prefere o casamento pelo nome completo, para não depender da ordem da lista.
function acharAgente(texto, agentes) {
  const q = _norm(texto);
  if (!q) return null;
  const lista = agentes || [];
  return lista.find(a => _norm(a.nome) === q)
      || lista.find(a => _norm(nomeCurto(a.nome)) === q)
      || lista.find(a => _norm(a.nome_guerra) === q)
      || lista.find(a => _norm(a.matricula) === q)
      || null;
}

module.exports = { sqlNomeExibicao, nomeExibicao, nomeCurto, slugAgente, casaAgente, acharAgente };
