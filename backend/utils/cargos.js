// backend/utils/cargos.js
// Cargos da GCM de Bananeiras, em ordem hierárquica. É a lista fechada oferecida
// no cadastro de servidor; valores legados gravados antes desta lista (ex.:
// 'Guarda Civil Municipal') continuam sendo lidos e exibidos normalmente — só a
// gravação de um cargo novo é restrita à lista.
const CARGOS = [
  'Guarda Municipal – III Classe',
  'Guarda Municipal – II Classe',
  'Guarda Municipal – I Classe',
  'Subinspetor',
  'Inspetor',
  'Subcomandante',
  'Comandante',
  'Ouvidor',
  'Corregedor',
];

const CARGO_PADRAO = CARGOS[0];

// Normaliza para comparar sem depender de acento, caixa ou do tipo de traço
// (o hífen comum é aceito no lugar do travessão).
function _norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[–—-]/g, '-')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

// Devolve o cargo na grafia oficial, ou null se não estiver na lista.
function normalizarCargo(valor) {
  const q = _norm(valor);
  if (!q) return null;
  return CARGOS.find(c => _norm(c) === q) || null;
}

module.exports = { CARGOS, CARGO_PADRAO, normalizarCargo };
