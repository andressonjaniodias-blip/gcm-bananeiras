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

// Patrulha normalizada para 1..4. Fora da faixa (ex.: 'ADM' legado) cai em 1.
function _patrulhaValida(patrulha) {
  const p = parseInt(patrulha, 10);
  return (p >= 1 && p <= 4) ? p : 1;
}

// Um lançamento (agente/posto) está de serviço no dia? O horário selecionado na
// montagem decide a distribuição:
//   'Segunda a Sexta'          → dias úteis (independe da patrulha);
//   'Sábado e Domingo (12x36)' → fim de semana (independe da patrulha);
//   '12x36 Diurno/Noturno'     → dia sim, dia não, ancorado no rodízio da patrulha em
//                                que o agente foi lançado: trabalha quando a patrulha
//                                está de serviço (delta 0) e na 2ª folga dela (delta 2),
//                                ou seja todo dia de delta par. Assim o 12x36 sempre cai
//                                junto da própria patrulha. Diurno e Noturno são turnos
//                                distintos (itens/horários separados) e seguem o mesmo
//                                critério, então convivem no dia com pessoas diferentes;
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
    return numeroFolga(_patrulhaValida(patrulha), dia, patrulhaDia1) % 2 === 0;
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

// Equipe "irmã" no rodízio: a que trabalha nos mesmos dias pares/ímpares. Patrulhas
// separadas por 2 posições têm delta de mesma paridade, então 1↔3 e 2↔4 — sempre,
// independente de patrulha_dia1.
function _equipeIrma(p) { return p <= 2 ? p + 2 : p - 2; }

// Peso do horário dentro de um mesmo posto: 24x72 primeiro, depois diurno, depois
// noturno (dá "Patrulha 24x72" antes de "Patrulha 12x36 Noturno").
function _rankHorario(horario) {
  const h = _semAcento(horario);
  if (h.includes('noturno')) return 2;
  if (h.includes('12x36')) return 1;
  return 0;
}

// Monta o "resumo" da escala: uma tabela só, com as 4 equipes do rodízio, contendo
// todo mundo que está de serviço no dia daquela equipe. Retorna
//   equipes['1'..'4'] → [{ posto, horario, itens: [...] }, ...]
//   segSex / fimDeSemana → listas soltas (não dependem de equipe)
// Um lançamento 24x72 entra só na coluna da sua patrulha. Um 12x36 trabalha dia sim,
// dia não, então cobre os dias de duas equipes: entra na coluna dele e na da equipe
// irmã (ver _equipeIrma). 'Segunda a Sexta' e 'Sábado e Domingo' independem do
// rodízio e ficam fora da tabela, em blocos próprios.
// Dentro da coluna os agentes vêm agrupados por posto + horário, na ordem operacional
// dos setores (rankSetor → posto → horário), e por nome dentro de cada grupo.
function montarResumoEscala(itens) {
  const resumo = {
    equipes: { '1': [], '2': [], '3': [], '4': [] },
    segSex: [],
    fimDeSemana: [],
  };
  // Acumula por equipe numa chave "posto|horario" antes de virar lista de grupos.
  const buckets = { '1': new Map(), '2': new Map(), '3': new Map(), '4': new Map() };
  const juntar = (p, i) => {
    const chave = `${i.posto || ''}|${i.horario || ''}`;
    const m = buckets[String(p)];
    if (!m.has(chave)) m.set(chave, { posto: i.posto || '', horario: i.horario || '', itens: [] });
    m.get(chave).itens.push(i);
  };

  (itens || []).forEach(i => {
    const h = (i.horario || '').toLowerCase();
    if (h.includes('segunda a sexta')) { resumo.segSex.push(i); return; }
    if (h.includes('sábado') || h.includes('sabado') || h.includes('domingo')) { resumo.fimDeSemana.push(i); return; }
    if (h.includes('12x36')) {
      const p = _patrulhaValida(i.patrulha);
      juntar(p, i);
      juntar(_equipeIrma(p), i);
      return;
    }
    const p = parseInt(i.patrulha, 10);
    if (p >= 1 && p <= 4) juntar(p, i);
    else resumo.segSex.push(i); // 24x72 sem patrulha válida (ex.: 'ADM' legado) → administrativo
  });

  const porNome = (a, b) =>
    String(a.nome_exibicao || a.nome || '').localeCompare(String(b.nome_exibicao || b.nome || ''), 'pt-BR');
  ['1', '2', '3', '4'].forEach(p => {
    resumo.equipes[p] = [...buckets[p].values()]
      .sort((a, b) =>
        (rankSetor(a.posto, a.horario) - rankSetor(b.posto, b.horario)) ||
        String(a.posto).localeCompare(String(b.posto), 'pt-BR') ||
        (_rankHorario(a.horario) - _rankHorario(b.horario)))
      .map(g => ({ ...g, itens: g.itens.sort(porNome) }));
  });
  [resumo.segSex, resumo.fimDeSemana].forEach(a => a.sort(_compararItensDoDia));
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
  n => n.includes('ronda') || n.includes('viatura') || n.includes('patrulha'), // 0 — Ronda / Viatura / Patrulha
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
