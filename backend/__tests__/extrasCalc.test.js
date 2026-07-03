const { horasDoTipo, valorDoTipo, calcularHoraFim } = require('../utils/extrasCalc');

describe('horasDoTipo', () => {
  test('plantão de 24h retorna 24 horas', () => {
    expect(horasDoTipo('24')).toBe(24);
  });

  test('qualquer outro tipo (inclusive 12) retorna 12 horas', () => {
    expect(horasDoTipo('12')).toBe(12);
    expect(horasDoTipo('outro')).toBe(12);
  });
});

describe('valorDoTipo', () => {
  test('plantão de 12h vale R$140', () => {
    expect(valorDoTipo('12')).toBe(140);
  });

  test('plantão de 24h vale R$280 (dobro de 12h)', () => {
    expect(valorDoTipo('24')).toBe(280);
  });
});

describe('calcularHoraFim', () => {
  test('soma horas sem cruzar a meia-noite', () => {
    expect(calcularHoraFim('08:00', 12)).toBe('20:00');
  });

  test('cruza a meia-noite corretamente (mod 24h)', () => {
    expect(calcularHoraFim('20:00', 12)).toBe('08:00');
  });

  test('plantão de 24h termina no mesmo horário de início', () => {
    expect(calcularHoraFim('07:00', 24)).toBe('07:00');
  });

  test('retorna null se não houver horário de início', () => {
    expect(calcularHoraFim(null, 12)).toBeNull();
    expect(calcularHoraFim('', 12)).toBeNull();
  });

  test('retorna null para formato de horário inválido', () => {
    expect(calcularHoraFim('25h', 12)).toBeNull();
  });
});
