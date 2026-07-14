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
// montagem decide a distribuição: 'Segunda a Sexta' → dias úteis; 'Sábado e Domingo'
// → fim de semana; os demais (24x72, 12x36, vazio) seguem o rodízio da patrulha.
// diaSemana: 0=domingo … 6=sábado (Date.getDay()).
function escalaTrabalhaHoje(horario, patrulha, dia, diaSemana, patrulhaDia1 = '1') {
  const h = (horario || '').toLowerCase();
  if (h.includes('segunda a sexta')) return diaSemana >= 1 && diaSemana <= 5;
  if (h.includes('sábado') || h.includes('sabado') || h.includes('domingo')) {
    return diaSemana === 0 || diaSemana === 6;
  }
  return trabalhaNoDia(patrulha, dia, patrulhaDia1);
}

module.exports = { trabalhaNoDia, ehSegundaFolga, numeroFolga, diaDoMes, quinzenaDe, escalaTrabalhaHoje };
