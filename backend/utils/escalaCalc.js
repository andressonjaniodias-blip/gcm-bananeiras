// backend/utils/escalaCalc.js
// Cálculo da rotação 24x72 (4 patrulhas) e utilitários de quinzena.
// Convenção: a escala reinicia sempre no dia 1 do mês, mas a patrulha que
// trabalha nesse dia 1 é configurável por escala (campo `patrulha_dia1`,
// padrão '1'). Patrulha P trabalha no dia D quando
// (D - 1 - P + patrulhaDia1) é múltiplo de 4.

function _norm(n) { return ((n % 4) + 4) % 4; }

// Delta que define o "estado" da patrulha no dia: 0 = serviço, 1/2/3 = 1ª/2ª/3ª folga
function _delta(patrulha, dia, patrulhaDia1) {
  const p = parseInt(patrulha, 10);
  const x = parseInt(patrulhaDia1 || 1, 10) || 1;
  return _norm(dia - 1 - p + x);
}

// Patrulha (1..4) trabalha no dia-do-mês D?
function trabalhaNoDia(patrulha, dia, patrulhaDia1 = '1') {
  const p = parseInt(patrulha, 10);
  if (!(p >= 1 && p <= 4)) return false;
  return _delta(patrulha, dia, patrulhaDia1) === 0;
}

// D é a 2ª folga da patrulha? (trabalhou 2 dias antes, está de folga em D)
function ehSegundaFolga(patrulha, dia, patrulhaDia1 = '1') {
  const p = parseInt(patrulha, 10);
  if (!(p >= 1 && p <= 4)) return false;
  return _delta(patrulha, dia, patrulhaDia1) === 2;
}

// Retorna o número da folga (1, 2 ou 3) para uma patrulha num dia, ou 0 se é dia de serviço
function numeroFolga(patrulha, dia, patrulhaDia1 = '1') {
  const p = parseInt(patrulha, 10);
  if (!(p >= 1 && p <= 4)) return null;
  return _delta(patrulha, dia, patrulhaDia1); // 0 = serviço, 1/2/3 = 1ª/2ª/3ª folga
}

// A partir de uma data 'YYYY-MM-DD', retorna o dia do mês (número)
function diaDoMes(dataStr) {
  return parseInt(String(dataStr).slice(8, 10), 10);
}

// Quinzena de uma data: 1 (dias 1–15) ou 2 (dia 16–fim). Retorna {quinzena, inicio, fim, label}
function quinzenaDe(dataStr) {
  const ano = parseInt(String(dataStr).slice(0, 4), 10);
  const mes = parseInt(String(dataStr).slice(5, 7), 10);
  const dia = diaDoMes(dataStr);
  const mm  = String(mes).padStart(2, '0');
  const ultimoDia = new Date(ano, mes, 0).getDate();
  if (dia <= 15) {
    return { quinzena: 1, inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-15`, label: `1ª quinzena de ${mm}/${ano}` };
  }
  return {
    quinzena: 2,
    inicio: `${ano}-${mm}-16`,
    fim: `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}`,
    label: `2ª quinzena de ${mm}/${ano}`,
  };
}

// Um lançamento (agente/posto) está de serviço no dia? O horário selecionado na
// montagem decide a distribuição:
//   'Segunda a Sexta'          → dias úteis (independe da patrulha);
//   'Sábado e Domingo (12x36)' → fim de semana (independe da patrulha);
//   '12x36 Diurno/Noturno'     → alterna por paridade do dia ancorada na patrulha:
//                                patrulha ímpar (1,3) trabalha dias ímpares; par (2,4)
//                                dias pares. Diurno e Noturno são turnos distintos
//                                (itens/horários separados) e seguem a mesma paridade,
//                                então convivem no mesmo dia com pessoas diferentes;
//   24x72 (ou vazio)           → segue o rodízio de 4 patrulhas (trabalhaNoDia).
// A ordem dos ifs importa: 'Sábado e Domingo (12x36)' contém '12x36' mas deve cair no
// ramo de fim de semana, que vem antes.
// diaSemana: 0=domingo … 6=sábado (Date.getDay()).
function escalaTrabalhaHoje(horario, patrulha, dia, diaSemana, patrulhaDia1 = '1') {
  const h = (horario || '').toLowerCase();
  if (h.includes('segunda a sexta')) return diaSemana >= 1 && diaSemana <= 5;
  if (h.includes('sábado') || h.includes('sabado') || h.includes('domingo')) {
    return diaSemana === 0 || diaSemana === 6;
  }
  if (h.includes('12x36')) {
    const p = parseInt(patrulha, 10) || 1;
    return (dia + p) % 2 === 0; // patrulha ímpar → dias ímpares; par → dias pares
  }
  return trabalhaNoDia(patrulha, dia, patrulhaDia1);
}

// Ordena os itens de serviço de um dia na ordem operacional dos setores
// (rankSetor → posto → nome), sem coluna de patrulha — mesma lógica do quadro /hoje.
function _compararItensDoDia(a, b) {
  return (rankSetor(a.posto, a.horario) - rankSetor(b.posto, b.horario)) ||
    String(a.posto || '').localeCompare(String(b.posto || ''), 'pt-BR') ||
    String(a.nome_exibicao || a.nome || '').localeCompare(String(b.nome_exibicao || b.nome || ''), 'pt-BR');
}

// Expande a escala mensal (template por patrulha) em dias. Para cada dia do mês
// retorna { dia, diaSemana, fimDeSemana, itens } com os lançamentos de serviço já
// ordenados por setor. Reusada pelo PDF e pelo endpoint de calendário.
// mesRef: 'YYYY-MM'.
function montarCalendarioMes(itens, mesRef, patrulhaDia1 = '1') {
  const ano = parseInt(String(mesRef).slice(0, 4), 10);
  const mes = parseInt(String(mesRef).slice(5, 7), 10);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dias = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const dd = String(dia).padStart(2, '0');
    const diaSemana = new Date(`${mesRef}-${dd}T12:00:00`).getDay(); // TZ-safe, igual a /hoje
    const doDia = (itens || [])
      .filter(i => escalaTrabalhaHoje(i.horario, i.patrulha, dia, diaSemana, patrulhaDia1))
      .sort(_compararItensDoDia);
    dias.push({ dia, diaSemana, fimDeSemana: diaSemana === 0 || diaSemana === 6, itens: doDia });
  }
  return dias;
}

// Equipe de um lançamento 12x36 pela paridade da patrulha: patrulha ímpar (1,3)
// cobre os dias ímpares (Equipe 1); par (2,4) cobre os pares (Equipe 2).
function _equipe12x36(patrulha) {
  const p = parseInt(patrulha, 10) || 1;
  return (p % 2 === 1) ? 1 : 2;
}

// Monta o "resumo" da escala (template compacto, sem expandir por dia): classifica
// cada lançamento pelo horário — mesma leitura de escalaTrabalhaHoje — em blocos:
//   patrulhas['1'..'4'] → rodízio 24x72 (por patrulha)
//   segSex              → 'Segunda a Sexta'
//   diurno {1,2}        → '12x36 Diurno', por equipe (paridade da patrulha)
//   noturno {1,2}       → '12x36 Noturno', por equipe
//   fimDeSemana         → 'Sábado e Domingo'
// Cada lista já vem ordenada por setor (rankSetor → posto → nome).
function montarResumoEscala(itens) {
  const resumo = {
    patrulhas: { '1': [], '2': [], '3': [], '4': [] },
    segSex: [],
    diurno: { 1: [], 2: [] },
    noturno: { 1: [], 2: [] },
    fimDeSemana: [],
  };
  (itens || []).forEach(i => {
    const h = (i.horario || '').toLowerCase();
    if (h.includes('segunda a sexta')) { resumo.segSex.push(i); return; }
    if (h.includes('sábado') || h.includes('sabado') || h.includes('domingo')) { resumo.fimDeSemana.push(i); return; }
    if (h.includes('12x36')) {
      const turno = h.includes('noturno') ? 'noturno' : 'diurno';
      resumo[turno][_equipe12x36(i.patrulha)].push(i);
      return;
    }
    const p = String(parseInt(i.patrulha, 10));
    if (resumo.patrulhas[p]) resumo.patrulhas[p].push(i);
    else resumo.segSex.push(i); // 24x72 sem patrulha válida (ex.: 'ADM' legado) → administrativo
  });
  const ord = a => a.sort(_compararItensDoDia);
  ['1', '2', '3', '4'].forEach(p => ord(resumo.patrulhas[p]));
  [resumo.segSex, resumo.fimDeSemana, resumo.diurno[1], resumo.diurno[2], resumo.noturno[1], resumo.noturno[2]].forEach(ord);
  return resumo;
}

// ── Ordenação dos setores (posto) na escala ──────────────────────────────────
// Ordem operacional fixa (não alfabética): setores nomeados primeiro, depois os
// demais agrupados pelo horário do lançamento. Ver rankSetor().
function _semAcento(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

// Lista fixa de setores nomeados (ranks 0..4). Cada entrada casa por palavra-chave
// no nome normalizado, tolerando variações de grafia/acento.
const _SETORES_NOMEADOS = [
  n => n.includes('ronda') || n.includes('viatura'),   // 0 — Ronda / Viatura
  n => n.includes('hospital'),                          // 1 — Hospital
  n => n.includes('monitoramento'),                     // 2 — Monitoramento
  n => n.includes('transito'),                          // 3 — Trânsito
  n => n.includes('acao social') || (n.includes('acao') && n.includes('social')), // 4 — Ação Social
];

// Rank de ordenação de um setor. Menor = aparece antes.
// 0..4  setores nomeados (ordem fixa)
// 10    demais de "Segunda a Sexta"
// 20    demais diurnos / rodízio (24x72, 12x36 Diurno, sem horário)
// 30    noturnos ("12x36 Noturno")
// 40    fim de semana ("Sábado e Domingo")
function rankSetor(posto, horario) {
  const n = _semAcento(posto);
  for (let i = 0; i < _SETORES_NOMEADOS.length; i++) {
    if (_SETORES_NOMEADOS[i](n)) return i;
  }
  const h = _semAcento(horario);
  if (h.includes('noturno')) return 30;
  if (h.includes('sabado') || h.includes('domingo')) return 40;
  if (h.includes('segunda a sexta')) return 10;
  return 20; // 24x72, 12x36 Diurno, vazio ou desconhecido
}

// Peso da patrulha para ordenação: 1..4 na ordem numérica, 'ADM' (e demais) por último.
function _pesoPatrulha(p) {
  const s = String(p || '');
  const num = parseInt(s, 10);
  return (num >= 1 && num <= 4) ? num : 99;
}

// Comparador de itens da escala: patrulha (1..4, ADM por último) → rank do setor
// → nome do setor (alfabético) → nome do agente. Usado no PDF e nas telas.
function compararItensEscala(a, b) {
  const dp = _pesoPatrulha(a.patrulha) - _pesoPatrulha(b.patrulha);
  if (dp) return dp;
  const dr = rankSetor(a.posto, a.horario) - rankSetor(b.posto, b.horario);
  if (dr) return dr;
  const ds = String(a.posto || '').localeCompare(String(b.posto || ''), 'pt-BR');
  if (ds) return ds;
  return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
}

module.exports = { trabalhaNoDia, ehSegundaFolga, numeroFolga, diaDoMes, quinzenaDe, escalaTrabalhaHoje, montarCalendarioMes, montarResumoEscala, rankSetor, compararItensEscala };
