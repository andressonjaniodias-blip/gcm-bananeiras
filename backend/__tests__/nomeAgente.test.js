const { sqlNomeExibicao, nomeExibicao, casaAgente, acharAgente } = require('../utils/nomeAgente');

describe('nomeAgente — nome que sai nos documentos', () => {
  test('prefere o nome de guerra ao nome completo', () => {
    expect(nomeExibicao({ nome_guerra: 'Manoel', nome: 'Manoel Nascimento da Silva' })).toBe('Manoel');
  });

  test('cai no nome completo quando o nome de guerra está vazio ou só com espaços', () => {
    const completo = 'Jandovi Martiniano do Santos';
    expect(nomeExibicao({ nome_guerra: null, nome: completo })).toBe(completo);
    expect(nomeExibicao({ nome_guerra: '',   nome: completo })).toBe(completo);
    expect(nomeExibicao({ nome_guerra: '   ', nome: completo })).toBe(completo);
  });

  test('aceita item já carregado com nome_exibicao (snapshot do lançamento)', () => {
    expect(nomeExibicao({ nome_exibicao: 'Rocha', nome: 'Rocha Ferreira' })).toBe('Rocha');
    expect(nomeExibicao(null)).toBe('');
  });

  test('o login não entra na cadeia — ele guarda a matrícula desde a migração', () => {
    // Se `usuario` fosse considerado, o documento sairia com o número no lugar do nome.
    expect(nomeExibicao({ usuario: '0009', nome: 'Manoel Nascimento' })).toBe('Manoel Nascimento');
  });

  test('o SQL usa nome_guerra e nunca o login', () => {
    const sql = sqlNomeExibicao('a', 'ei.nome');
    expect(sql).toContain('a.nome_guerra');
    expect(sql).toContain('ei.nome');
    expect(sql).not.toContain('usuario');
  });
});

describe('nomeAgente — casamento do nome digitado no BO', () => {
  const manoel = { nome: 'Manoel Nascimento da Silva', nome_guerra: 'Manoel', matricula: '0009' };
  const jandovi = { nome: 'Jandovi Martiniano do Santos', nome_guerra: null, matricula: '5672' };

  test('casa por nome de guerra, nome completo ou matrícula', () => {
    ['Manoel', 'Manoel Nascimento da Silva', '0009'].forEach(t => expect(casaAgente(t, manoel)).toBe(true));
  });

  test('ignora acento, caixa e espaço extra', () => {
    expect(casaAgente('  JANDOVI   MARTINIANO  DO  SANTOS ', jandovi)).toBe(true);
    expect(casaAgente('abrao azevedo', { nome: 'Abrão Azevedo' })).toBe(true);
  });

  test('não casa nome parecido de outra pessoa', () => {
    expect(casaAgente('Manoel Neto', manoel)).toBe(false);
    expect(casaAgente('', manoel)).toBe(false);
  });

  test('acharAgente prefere o nome de guerra, sem depender da ordem da lista', () => {
    // "Rocha" é nome de guerra de um e sobrenome no nome completo de outro
    const rocha = { nome: 'Carlos Eduardo Lima', nome_guerra: 'Rocha', matricula: '0007' };
    const outro = { nome: 'Rocha', nome_guerra: 'Cardoso', matricula: '7894' };
    expect(acharAgente('Rocha', [outro, rocha])).toBe(rocha);
    expect(acharAgente('Rocha', [rocha, outro])).toBe(rocha);
  });

  test('acharAgente devolve null quando não encontra', () => {
    expect(acharAgente('Fulano de Tal', [manoel, jandovi])).toBeNull();
    expect(acharAgente('', [manoel])).toBeNull();
  });
});
