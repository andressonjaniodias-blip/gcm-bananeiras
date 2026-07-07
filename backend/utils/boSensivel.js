// backend/utils/boSensivel.js
//
// Regras de "ocorrência sensível": detecção automática pela natureza/tipificação
// e censura dos dados pessoais para o papel `agente`. Supervisores e admin sempre
// veem o BO completo — a censura só se aplica ao agente.
//
// A censura acontece SEMPRE no servidor (o detalhe do BO no frontend é montado a
// partir do payload de listagem), então nenhum dado pessoal restrito trafega para
// o agente.

// Substitui o valor de um campo pessoal inteiro.
const PLACEHOLDER = '🔒 Restrito ao comando';
// Marca a redação de um trecho de PII dentro do texto livre do relato.
const REDIGIDO = '[RESTRITO]';

// minúsculo, sem acentos, espaços colapsados
function normalizar(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Termos (já normalizados) que caracterizam uma ocorrência sensível. Editável.
const PALAVRAS_SENSIVEIS = [
  'violencia domestica',
  'violencia familiar',
  'maria da penha',
  'violencia contra a mulher',
  'violencia contra mulher',
  'feminicidio',
  'estupro',
  'abuso sexual',
  'importunacao sexual',
  'assedio sexual',
  'crime sexual',
  'violencia sexual',
  'atentado violento ao pudor',
  'pedofilia',
  'pornografia infantil',
  'exploracao sexual',
  'contra menor',
  'contra crianca',
  'crianca',
  'adolescente',
  'ato infracional',
  'estatuto da crianca',
  'maus tratos',
  'maus-tratos',
  'suicidio',
  'automutilacao',
  'trafico de pessoas',
  'violencia contra idoso',
];

// Conectores de nomes próprios que não devem virar termo de redação isolado.
const CONECTORES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von', 'la']);

// Campos pessoais do solicitante (dadosSolicitacao) a censurar.
const CAMPOS_SOLICITANTE = ['nomeSolicitante', 'cpfSolicitante', 'rgSolicitante', 'telefoneSolicitante'];
// Campos de LOCAL da ocorrência (dadosOcorrencia) a censurar. A equipe da viatura
// e a tipificação/data ficam de fora (permanecem visíveis).
const CAMPOS_LOCAL = ['rua', 'numero', 'cidade', 'complemento'];

// Verdadeiro se a natureza/tipificação do BO indica ocorrência sensível.
function ehOcorrenciaSensivel(dados) {
  if (!dados || typeof dados !== 'object') return false;
  const natureza    = dados.dadosSolicitacao?.natureza;
  const tipificacao = dados.dadosOcorrencia?.tipificacao;
  const alvo = normalizar(`${natureza || ''} ${tipificacao || ''}`);
  if (!alvo) return false;
  return PALAVRAS_SENSIVEIS.some(p => alvo.includes(p));
}

function escaparRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Coleta os identificadores conhecidos (nomes, alcunhas, filiação, endereços,
// documentos, telefones) para redigir o relato. Guarda o nome completo E cada
// token relevante, com os acentos originais, para casar com o texto do relato.
function coletarIdentificadores(dados) {
  const ids = [];
  const push = (v) => { if (v && String(v).trim()) ids.push(String(v).trim()); };
  const pushNome = (v) => {
    if (!v) return;
    const full = String(v).trim();
    push(full);
    full.split(/\s+/).forEach(tok => {
      const norm = normalizar(tok);
      if (norm.length >= 3 && !CONECTORES.has(norm)) ids.push(tok);
    });
  };

  const sol = dados.dadosSolicitacao || {};
  pushNome(sol.nomeSolicitante);
  push(sol.cpfSolicitante); push(sol.rgSolicitante); push(sol.telefoneSolicitante);

  const oc = dados.dadosOcorrencia || {};
  push(oc.rua); push(oc.complemento); push(oc.cidade);

  for (const arr of [dados.vitimas, dados.suspeitos]) {
    (arr || []).forEach(p => {
      if (!p) return;
      pushNome(p.nome); pushNome(p.alcunha); pushNome(p.nomePai); pushNome(p.nomeMae);
      push(p.cpf); push(p.rg); push(p.telefone); push(p.endereco);
    });
  }
  return ids;
}

// Mantém o texto do relato, mas redige as informações pessoais: primeiro os
// identificadores conhecidos (do maior para o menor, para cobrir nomes completos
// antes de partes), depois padrões genéricos de PII (CPF, RG, telefone) que
// possam ter sido digitados só no texto.
//
// Limitação conhecida: um nome citado apenas no relato e ausente dos campos
// estruturados não é detectável — a redação é best-effort.
function redigirRelato(relato, identificadores) {
  if (!relato) return relato;
  let texto = String(relato);

  const lista = [...new Set(identificadores.filter(t => t && t.trim().length >= 3))]
    .sort((a, b) => b.length - a.length);
  for (const ident of lista) {
    texto = texto.replace(new RegExp(escaparRegex(ident), 'gi'), REDIGIDO);
  }

  const PADROES = [
    /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,        // CPF
    /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX]\b/g,     // RG
    /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g,      // telefone
  ];
  for (const re of PADROES) texto = texto.replace(re, REDIGIDO);

  return texto;
}

// Devolve uma cópia profunda do BO com os dados pessoais censurados para o agente.
// Não muta o objeto original.
function censurarBOParaAgente(dados) {
  const copia = JSON.parse(JSON.stringify(dados || {}));

  // Identificadores coletados ANTES da censura (para redigir o relato).
  const identificadores = coletarIdentificadores(copia);

  if (copia.dadosSolicitacao) {
    for (const k of CAMPOS_SOLICITANTE) {
      if (copia.dadosSolicitacao[k]) copia.dadosSolicitacao[k] = PLACEHOLDER;
    }
  }

  if (copia.dadosOcorrencia) {
    for (const k of CAMPOS_LOCAL) {
      if (copia.dadosOcorrencia[k]) copia.dadosOcorrencia[k] = PLACEHOLDER;
    }
  }

  // Cada pessoa vira uma entrada única "restrita" — some a qualificação, mas
  // preserva que existia uma vítima/suspeito ali (mantém a contagem).
  const restringir = arr => arr.map(p =>
    (p && Object.values(p).some(v => v)) ? { nome: PLACEHOLDER } : p
  );
  if (Array.isArray(copia.vitimas))   copia.vitimas   = restringir(copia.vitimas);
  if (Array.isArray(copia.suspeitos)) copia.suspeitos = restringir(copia.suspeitos);

  if (copia.relato) copia.relato = redigirRelato(copia.relato, identificadores);

  // objetos e autoridade permanecem visíveis.
  return copia;
}

module.exports = {
  PLACEHOLDER,
  REDIGIDO,
  PALAVRAS_SENSIVEIS,
  normalizar,
  ehOcorrenciaSensivel,
  censurarBOParaAgente,
  redigirRelato,
};
