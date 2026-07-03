const VALOR_12H = 140; // R$ por 12h (24h = 280)

function horasDoTipo(tipo) { return String(tipo) === '24' ? 24 : 12; }
function valorDoTipo(tipo) { return (horasDoTipo(tipo) / 12) * VALOR_12H; }

// Calcula o horário de término a partir do início + duração em horas (mod 24h)
function calcularHoraFim(horaInicio, horas) {
  if (!horaInicio) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(horaInicio);
  if (!m) return null;
  const inicioMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const fimMin = (inicioMin + horas * 60) % (24 * 60);
  const hh = String(Math.floor(fimMin / 60)).padStart(2, '0');
  const mm = String(fimMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

module.exports = { VALOR_12H, horasDoTipo, valorDoTipo, calcularHoraFim };
