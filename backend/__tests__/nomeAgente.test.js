const { sqlNomeExibicao, nomeExibicao, nomeCurto, slugAgente, casaAgente, acharAgente } = require('../utils/nomeAgente');

describe('nomeAgente — nome que sai na tela e nos documentos', () => {
  test('reduz aos dois primeiros nomes', () => {
    expect(nomeCurto('João Carlos Silva Souza')).toBe('João Carlos');
    expect(nomeCurto('Jandovi Martiniano do Santos')).toBe('Jandovi Martiniano');
  });

  test('nome de uma palavra só volta inteiro', () => {
    expect(nomeCurto('Manoel')).toBe('Manoel');
    expect(nomeCurto('  Manoel  ')).toBe('Manoel');
    expect(nomeCurto('')).toBe('');
    expect(nomeCurto(null)).toBe('');
  });

  test('exibe no padrão "Nome Sobrenome, matrícula"', () => {
    expect(nomeExibicao({ nome: 'Manoel Nascimento da Silva', matricula: '0009' }))
      .toBe('Manoel Nascimento, 0009');
  });

  test('sem matrícula, sai só o nome; sem nome, sai só a matrícula', () => {
    expect(nomeExibicao({ nome: 'Manoel Nascimento da Silva' })).toBe('Manoel Nascimento');
    expect(nomeExibicao({ nome: '', matricula: '0009' })).toBe('0009');
    expect(nomeExibicao(null)).toBe('');
  });

  test('o nome de guerra não entra mais na cadeia de exibição', () => {
    expect(nomeExibicao({ nome_guerra: 'Rocha', nome: 'Carlos Eduardo Lima', matricula: '0007' }))
      .toBe('Carlos Eduardo, 0007');
  });

  test('aceita lançamento já carregado com nome_exibicao (snapshot legado)', () => {
    // Lançamento antigo cujo snapshot guardava só o nome de guerra
    expect(nomeExibicao({ nome_exibicao: 'Rocha', matricula: '0007' })).toBe('Rocha, 0007');
  });

  test('o login nunca é usado como nome', () => {
    expect(nomeExibicao({ usuario: 'rocha', nome: 'Manoel Nascimento', matricula: '0009' }))
      .toBe('Manoel Nascimento, 0009');
  });

  test('o SQL devolve o nome completo, com o snapshot como reserva', () => {
    const sql = sqlNomeExibicao('a', 'ei.nome');
    expect(sql).toContain('a.nome');
    expect(sql).toContain('ei.nome');
    expect(sql).not.toContain('usuario');
    expect(sql).not.toContain('nome_guerra');
  });
});

describe('nomeAgente — nome de arquivo', () => {
  test('gera slug com dois nomes + matrícula, sem acento', () => {
    expect(slugAgente({ nome: 'João Carlos Silva Souza', matricula: '1234' })).toBe('joao-carlos-1234');
    expect(slugAgente({ nome: 'Abrão Azevedo', matricula: 'GCM-01' })).toBe('abrao-azevedo-gcm-01');
  });

  test('tolera dados faltando', () => {
    expect(slugAgente({ nome: 'Manoel' })).toBe('manoel');
    expect(slugAgente({ matricula: '0009' })).toBe('0009');
    expect(slugAgente(null)).toBe('agente');
    expect(slugAgente({})).toBe('agente');
  });
});

describe('nomeAgente — casamento do nome digitado no BO', () => {
  const manoel = { nome: 'Manoel Nascimento da Silva', nome_guerra: 'Manoel', matricula: '0009' };
  const jandovi = { nome: 'Jandovi Martiniano do Santos', nome_guerra: null, matricula: '5672' };

  test('casa por nome completo, dois primeiros nomes, nome de guerra ou matrícula', () => {
    ['Manoel Nascimento da Silva', 'Manoel Nascimento', 'Manoel', '0009']
      .forEach(t => expect(casaAgente(t, manoel)).toBe(true));
  });

  test('ignora acento, caixa e espaço extra', () => {
    expect(casaAgente('  JANDOVI   MARTINIANO  DO  SANTOS ', jandovi)).toBe(true);
    expect(casaAgente('abrao azevedo', { nome: 'Abrão Azevedo' })).toBe(true);
  });

  test('não casa nome parecido de outra pessoa', () => {
    expect(casaAgente('Manoel Neto', manoel)).toBe(false);
    expect(casaAgente('', manoel)).toBe(false);
  });

  test('acharAgente prefere o nome completo, sem depender da ordem da lista', () => {
    const carlos = { nome: 'Carlos Eduardo Lima', nome_guerra: 'Rocha', matricula: '0007' };
    const rocha  = { nome: 'Rocha', nome_guerra: 'Cardoso', matricula: '7894' };
    expect(acharAgente('Rocha', [carlos, rocha])).toBe(rocha);
    expect(acharAgente('Rocha', [rocha, carlos])).toBe(rocha);
    expect(acharAgente('Carlos Eduardo', [rocha, carlos])).toBe(carlos);
  });

  test('acharAgente devolve null quando não encontra', () => {
    expect(acharAgente('Fulano de Tal', [manoel, jandovi])).toBeNull();
    expect(acharAgente('', [manoel])).toBeNull();
  });
});
