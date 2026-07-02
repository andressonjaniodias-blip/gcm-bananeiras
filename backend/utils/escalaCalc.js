// backend/utils/escalaCalc.js
// Cálculo da rotação 24x72 (4 patrulhas) e utilitários de quinzena.
// Convenção: a escala reinicia sempre no dia 1 do mês, com o dia 1 sendo o
// dia de serviço da Patrulha 1. Patrulha P trabalha nos dias D onde
// (D - P) é múltiplo de 4.

function _norm(n) { return ((n % 4) + 4) % 4; }

// Patrulha (1..4) trabalha no dia-do-mês D?
function trabalhaNoDia(patrulha, dia) {
  const p = parseInt(patrulha, 10);
  if (!(p >= 1 && p <= 4)) return false;
  return _norm(dia - p) === 0;
}

// D é a 2ª folga da patrulha? (trabalhou em D-2, está de folga em D)
function ehSegundaFolga(patrulha, dia) {
  const p = parseInt(patrulha, 10);
  if (!(p >= 1 && p <= 4)) return false;
  return _norm(dia - p - 2) === 0 && !trabalhaNoDia(p, dia);
}

// Retorna o número da folga (1, 2 ou 3) para uma patrulha num dia, ou 0 se é dia de serviço
function numeroFolga(patrulha, dia) {
  const p = parseInt(patrulha, 10);
  if (!(p >= 1 && p <= 4)) return null;
  const delta = _norm(dia - p);
  return delta; // 0 = serviço, 1/2/3 = 1ª/2ª/3ª folga
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

module.exports = { trabalhaNoDia, ehSegundaFolga, numeroFolga, diaDoMes, quinzenaDe };
