const { trabalhaNoDia, ehSegundaFolga, numeroFolga, diaDoMes, quinzenaDe, escalaTrabalhaHoje, montarCalendarioMes, rankSetor, compararItensEscala } = require('../utils/escalaCalc');

describe('escalaCalc — rotação 24x72', () => {
  test('cada dia tem exatamente uma patrulha em serviço', () => {
    for (let dia = 1; dia <= 30; dia++) {
      const emServico = ['1', '2', '3', '4'].filter(p => trabalhaNoDia(p, dia));
      expect(emServico).toHaveLength(1);
    }
  });

  test('patrulha 1 trabalha no dia 1 (patrulhaDia1 padrão) e folga nos 3 dias seguintes', () => {
    expect(trabalhaNoDia('1', 1)).toBe(true);
    expect(trabalhaNoDia('1', 2)).toBe(false);
    expect(trabalhaNoDia('1', 3)).toBe(false);
    expect(trabalhaNoDia('1', 4)).toBe(false);
    expect(trabalhaNoDia('1', 5)).toBe(true);
  });

  test('respeita patrulha_dia1 configurável', () => {
    expect(trabalhaNoDia('3', 1, '3')).toBe(true);
    expect(trabalhaNoDia('1', 1, '3')).toBe(false);
  });

  test('patrulha inválida nunca trabalha', () => {
    expect(trabalhaNoDia('5', 10)).toBe(false);
    expect(trabalhaNoDia('0', 10)).toBe(false);
  });

  test('ehSegundaFolga identifica a 2ª folga (preferência de plantão extra)', () => {
    // Patrulha 1: serviço dia 1, folgas 2/3/4 -> 2ª folga é dia 3
    expect(ehSegundaFolga('1', 3)).toBe(true);
    expect(ehSegundaFolga('1', 2)).toBe(false);
    expect(ehSegundaFolga('1', 4)).toBe(false);
  });

  test('numeroFolga retorna 0 em dia de serviço e 1/2/3 nas folgas', () => {
    expect(numeroFolga('1', 1)).toBe(0);
    expect(numeroFolga('1', 2)).toBe(1);
    expect(numeroFolga('1', 3)).toBe(2);
    expect(numeroFolga('1', 4)).toBe(3);
  });

  test('diaDoMes extrai o dia de uma data YYYY-MM-DD', () => {
    expect(diaDoMes('2026-07-03')).toBe(3);
    expect(diaDoMes('2026-07-31')).toBe(31);
  });

  test('quinzenaDe separa 1ª (1-15) e 2ª quinzena (16-fim do mês)', () => {
    expect(quinzenaDe('2026-07-01')).toMatchObject({ quinzena: 1, inicio: '2026-07-01', fim: '2026-07-15' });
    expect(quinzenaDe('2026-07-15')).toMatchObject({ quinzena: 1 });
    const q2 = quinzenaDe('2026-07-16');
    expect(q2).toMatchObject({ quinzena: 2, inicio: '2026-07-16', fim: '2026-07-31' });

    // Fevereiro deve respeitar o último dia real do mês
    const fevQ2 = quinzenaDe('2026-02-20');
    expect(fevQ2.fim).toBe('2026-02-28');
  });
});

describe('escalaCalc — distribuição por horário (escalaTrabalhaHoje)', () => {
  // diaSemana: 0=domingo … 6=sábado
  test('"Segunda a Sexta" só aparece em dia útil', () => {
    expect(escalaTrabalhaHoje('Segunda a Sexta', '1', 10, 3)).toBe(true);  // quarta
    expect(escalaTrabalhaHoje('Segunda a Sexta', '1', 10, 1)).toBe(true);  // segunda
    expect(escalaTrabalhaHoje('Segunda a Sexta', '1', 10, 5)).toBe(true);  // sexta
    expect(escalaTrabalhaHoje('Segunda a Sexta', '1', 10, 6)).toBe(false); // sábado
    expect(escalaTrabalhaHoje('Segunda a Sexta', '1', 10, 0)).toBe(false); // domingo
  });

  test('"Sábado e Domingo (12x36)" só aparece no fim de semana', () => {
    expect(escalaTrabalhaHoje('Sábado e Domingo (12x36)', '1', 10, 6)).toBe(true);  // sábado
    expect(escalaTrabalhaHoje('Sábado e Domingo (12x36)', '1', 10, 0)).toBe(true);  // domingo
    expect(escalaTrabalhaHoje('Sábado e Domingo (12x36)', '1', 10, 3)).toBe(false); // quarta
  });

  test('24x72 / vazio seguem o rodízio da patrulha (independe do dia da semana)', () => {
    // Patrulha 1 trabalha no dia 1 e folga 2/3/4 (patrulhaDia1 padrão)
    expect(escalaTrabalhaHoje('24x72', '1', 1, 4)).toBe(true);
    expect(escalaTrabalhaHoje('24x72', '1', 2, 5)).toBe(false);
    expect(escalaTrabalhaHoje('', '1', 1, 0)).toBe(true);   // vazio → rodízio
  });

  test('12x36 alterna por paridade da patrulha (patrulha ímpar → dias ímpares)', () => {
    // Patrulha 1 (ímpar) trabalha dias ímpares; independe do dia da semana
    expect(escalaTrabalhaHoje('12x36 Diurno', '1', 1, 3)).toBe(true);
    expect(escalaTrabalhaHoje('12x36 Diurno', '1', 2, 4)).toBe(false);
    expect(escalaTrabalhaHoje('12x36 Diurno', '1', 3, 5)).toBe(true);
    expect(escalaTrabalhaHoje('12x36 Noturno', '3', 1, 0)).toBe(true);  // patrulha 3 = ímpar
    // Patrulha 2 (par) trabalha dias pares
    expect(escalaTrabalhaHoje('12x36 Diurno', '2', 1, 3)).toBe(false);
    expect(escalaTrabalhaHoje('12x36 Diurno', '2', 2, 4)).toBe(true);
    expect(escalaTrabalhaHoje('12x36 Noturno', '4', 2, 6)).toBe(true);  // patrulha 4 = par
  });

  test('"Sábado e Domingo (12x36)" cai no ramo de fim de semana, não no de 12x36', () => {
    // Contém "12x36" mas o ramo sábado/domingo vem antes: paridade da patrulha é ignorada
    expect(escalaTrabalhaHoje('Sábado e Domingo (12x36)', '1', 4, 6)).toBe(true);  // sábado, dia par
    expect(escalaTrabalhaHoje('Sábado e Domingo (12x36)', '2', 5, 0)).toBe(true);  // domingo, dia ímpar
    expect(escalaTrabalhaHoje('Sábado e Domingo (12x36)', '1', 1, 3)).toBe(false); // quarta
  });
});

describe('escalaCalc — expansão mensal (montarCalendarioMes)', () => {
  // Julho/2026: dia 1 = quarta-feira (diaSemana 3). 31 dias.
  const itens = [
    { posto: 'Ronda / Viatura', nome: 'Ana',   patrulha: '1', horario: '24x72' },
    { posto: 'Ação Social',     nome: 'Bruno', patrulha: 'ADM', horario: 'Segunda a Sexta' },
    { posto: 'Ronda / Viatura', nome: 'Caio',  patrulha: '1', horario: '12x36 Diurno' },
    { posto: 'Praça',           nome: 'Duda',  patrulha: '4', horario: 'Sábado e Domingo (12x36)' },
  ];

  test('tem uma entrada por dia do mês', () => {
    expect(montarCalendarioMes(itens, '2026-07', '1')).toHaveLength(31);
    expect(montarCalendarioMes(itens, '2026-02', '1')).toHaveLength(28);
  });

  test('cada dia traz diaSemana e fimDeSemana corretos', () => {
    const dias = montarCalendarioMes(itens, '2026-07', '1');
    expect(dias[0]).toMatchObject({ dia: 1, diaSemana: 3, fimDeSemana: false }); // qua
    expect(dias[3]).toMatchObject({ dia: 4, diaSemana: 6, fimDeSemana: true });  // sáb
    expect(dias[4]).toMatchObject({ dia: 5, diaSemana: 0, fimDeSemana: true });  // dom
  });

  test('distribui cada horário nos dias certos', () => {
    const dias = montarCalendarioMes(itens, '2026-07', '1');
    const nomesDoDia = d => dias[d - 1].itens.map(i => i.nome);

    // Dia 1 (qua, ímpar): Ana (24x72 patrulha 1 trabalha dia 1), Bruno (seg-sex), Caio (12x36 ímpar)
    expect(nomesDoDia(1).sort()).toEqual(['Ana', 'Bruno', 'Caio']);
    // Dia 2 (qui, par): Bruno (seg-sex). Ana folga (24x72), Caio folga (12x36 ímpar)
    expect(nomesDoDia(2)).toEqual(['Bruno']);
    // Dia 4 (sáb): só Duda (fim de semana); Bruno não trabalha sábado
    expect(nomesDoDia(4)).toEqual(['Duda']);
    // Dia 5 (dom, ímpar): Ana (24x72 patrulha 1 volta no dia 5), Caio (12x36 ímpar) e Duda (fim de semana)
    expect(nomesDoDia(5).sort()).toEqual(['Ana', 'Caio', 'Duda']);
  });

  test('itens de cada dia vêm ordenados por setor (rankSetor → posto → nome)', () => {
    const dias = montarCalendarioMes(itens, '2026-07', '1');
    // Dia 1: Ronda/Viatura (rank 0: Ana e Caio, desempate por nome) antes de Ação Social (rank 4: Bruno)
    expect(dias[0].itens.map(i => i.nome)).toEqual(['Ana', 'Caio', 'Bruno']);
  });
});

describe('escalaCalc — ordem dos setores (rankSetor / compararItensEscala)', () => {
  test('setores nomeados têm a ordem fixa, mesmo com grafia/acento variados', () => {
    expect(rankSetor('Ronda / Viatura', '24x72')).toBe(0);
    expect(rankSetor('ronda/viatura', '')).toBe(0);
    expect(rankSetor('Hospital', '24x72')).toBe(1);
    expect(rankSetor('Monitoramento', '24x72')).toBe(2);
    expect(rankSetor('Trânsito', 'Segunda a Sexta')).toBe(3);   // acentuado
    expect(rankSetor('transito', '')).toBe(3);                  // sem acento
    expect(rankSetor('Ação Social', 'Segunda a Sexta')).toBe(4);
    expect(rankSetor('ACAO SOCIAL', '')).toBe(4);
  });

  test('setor nomeado vence o horário (Ação Social seg-sex ainda vem antes dos demais)', () => {
    expect(rankSetor('Ação Social', 'Segunda a Sexta')).toBeLessThan(rankSetor('Portaria', 'Segunda a Sexta'));
  });

  test('setores não nomeados agrupam por horário: seg-sex < diurno < noturno < fim de semana', () => {
    const segSex   = rankSetor('Portaria', 'Segunda a Sexta');
    const diurno   = rankSetor('Apoio', '24x72');
    const noturno  = rankSetor('Base Noturna', '12x36 Noturno');
    const fimDeSem = rankSetor('Praça', 'Sábado e Domingo (12x36)');
    expect(segSex).toBeLessThan(diurno);
    expect(diurno).toBeLessThan(noturno);
    expect(noturno).toBeLessThan(fimDeSem);
  });

  test('compararItensEscala: patrulha (1..4, ADM por último) → setor → nome', () => {
    const itens = [
      { patrulha: 'ADM', posto: 'Ação Social', horario: 'Segunda a Sexta', nome: 'Zulmira' },
      { patrulha: '2',   posto: 'Hospital',     horario: '24x72',          nome: 'Bruno'  },
      { patrulha: '1',   posto: 'Monitoramento',horario: '24x72',          nome: 'Ana'    },
      { patrulha: '1',   posto: 'Ronda / Viatura', horario: '24x72',       nome: 'Yara'   },
      { patrulha: '1',   posto: 'Ronda / Viatura', horario: '24x72',       nome: 'Bento'  },
    ];
    const ordenados = [...itens].sort(compararItensEscala)
      .map(i => `${i.patrulha}|${i.posto}|${i.nome}`);
    expect(ordenados).toEqual([
      '1|Ronda / Viatura|Bento',   // patrulha 1, setor rank 0, nome A→Z
      '1|Ronda / Viatura|Yara',
      '1|Monitoramento|Ana',       // patrulha 1, setor rank 2
      '2|Hospital|Bruno',          // patrulha 2
      'ADM|Ação Social|Zulmira',   // ADM por último
    ]);
  });

  test('desempate alfabético dentro do mesmo grupo de horário', () => {
    const itens = [
      { patrulha: '1', posto: 'Praça Central', horario: '12x36 Noturno', nome: 'X' },
      { patrulha: '1', posto: 'Base Norte',    horario: '12x36 Noturno', nome: 'Y' },
    ];
    const ordenados = [...itens].sort(compararItensEscala).map(i => i.posto);
    expect(ordenados).toEqual(['Base Norte', 'Praça Central']);
  });
});
