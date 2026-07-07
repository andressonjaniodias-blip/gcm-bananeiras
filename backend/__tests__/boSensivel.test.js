const {
  PLACEHOLDER,
  REDIGIDO,
  ehOcorrenciaSensivel,
  censurarBOParaAgente,
  redigirRelato,
} = require('../utils/boSensivel');

function boExemplo() {
  return {
    dadosSolicitacao: {
      canal: 'Telefone',
      dataHoraSolicitacao: '2026-07-06T10:00',
      natureza: 'Violência Doméstica',
      nomeSolicitante: 'Maria Silva',
      cpfSolicitante: '529.982.247-25',
      telefoneSolicitante: '(83) 99999-8888',
    },
    dadosOcorrencia: {
      tipificacao: 'Violência doméstica',
      dataHoraOcorrencia: '2026-07-06T09:00',
      rua: 'Rua das Flores',
      numero: '12',
      cidade: 'Bananeiras',
      complemento: 'Centro',
      viatura: 'GCM-01',
      comandante: 'Joao Comandante',
      matriculaComandante: 'GCM-001',
    },
    vitimas: [{ nome: 'Maria Silva', cpf: '529.982.247-25' }],
    suspeitos: [{ nome: 'Pedro Souza', alcunha: 'PP' }],
    relato: 'A vítima Maria Silva relatou que Pedro Souza a agrediu na Rua das Flores.',
    objetos: [{ tipoObjeto: 'Faca', quantidade: '1' }],
    autoridade: { nomeAutoridade: 'Delegado X', cargo: 'Delegado' },
  };
}

describe('ehOcorrenciaSensivel', () => {
  test('detecta natureza sensível com acento', () => {
    expect(ehOcorrenciaSensivel({ dadosSolicitacao: { natureza: 'Violência Doméstica' } })).toBe(true);
  });

  test('detecta pela tipificação sem acento', () => {
    expect(ehOcorrenciaSensivel({ dadosOcorrencia: { tipificacao: 'ESTUPRO de vulneravel' } })).toBe(true);
  });

  test('ignora ocorrência comum', () => {
    expect(ehOcorrenciaSensivel({ dadosSolicitacao: { natureza: 'Furto' } })).toBe(false);
  });

  test('robusto a entrada vazia/indefinida', () => {
    expect(ehOcorrenciaSensivel(null)).toBe(false);
    expect(ehOcorrenciaSensivel({})).toBe(false);
  });
});

describe('censurarBOParaAgente', () => {
  const censurado = censurarBOParaAgente(boExemplo());

  test('mantém tipo, data e equipe visíveis', () => {
    expect(censurado.dadosSolicitacao.natureza).toBe('Violência Doméstica');
    expect(censurado.dadosOcorrencia.tipificacao).toBe('Violência doméstica');
    expect(censurado.dadosOcorrencia.dataHoraOcorrencia).toBe('2026-07-06T09:00');
    expect(censurado.dadosOcorrencia.viatura).toBe('GCM-01');
    expect(censurado.dadosOcorrencia.comandante).toBe('Joao Comandante');
    expect(censurado.dadosOcorrencia.matriculaComandante).toBe('GCM-001');
  });

  test('censura dados pessoais do solicitante', () => {
    expect(censurado.dadosSolicitacao.nomeSolicitante).toBe(PLACEHOLDER);
    expect(censurado.dadosSolicitacao.cpfSolicitante).toBe(PLACEHOLDER);
    expect(censurado.dadosSolicitacao.telefoneSolicitante).toBe(PLACEHOLDER);
  });

  test('censura o local da ocorrência', () => {
    expect(censurado.dadosOcorrencia.rua).toBe(PLACEHOLDER);
    expect(censurado.dadosOcorrencia.numero).toBe(PLACEHOLDER);
    expect(censurado.dadosOcorrencia.cidade).toBe(PLACEHOLDER);
    expect(censurado.dadosOcorrencia.complemento).toBe(PLACEHOLDER);
  });

  test('colapsa vítimas e suspeitos em entrada restrita, preservando a contagem', () => {
    expect(censurado.vitimas).toHaveLength(1);
    expect(censurado.vitimas[0]).toEqual({ nome: PLACEHOLDER });
    expect(censurado.suspeitos).toHaveLength(1);
    expect(censurado.suspeitos[0]).toEqual({ nome: PLACEHOLDER });
  });

  test('mantém o relato aberto, mas redige nomes e documentos conhecidos', () => {
    expect(censurado.relato).toContain('A vítima');
    expect(censurado.relato).toContain('relatou que');
    expect(censurado.relato).not.toMatch(/Maria Silva/);
    expect(censurado.relato).not.toMatch(/Pedro Souza/);
    expect(censurado.relato).not.toMatch(/Rua das Flores/);
    expect(censurado.relato).toContain(REDIGIDO);
  });

  test('mantém objetos e autoridade intactos', () => {
    expect(censurado.objetos).toEqual([{ tipoObjeto: 'Faca', quantidade: '1' }]);
    expect(censurado.autoridade).toEqual({ nomeAutoridade: 'Delegado X', cargo: 'Delegado' });
  });

  test('não muta o objeto original', () => {
    const original = boExemplo();
    censurarBOParaAgente(original);
    expect(original.dadosSolicitacao.nomeSolicitante).toBe('Maria Silva');
    expect(original.relato).toContain('Maria Silva');
  });
});

describe('redigirRelato', () => {
  test('redige CPF e telefone digitados só no texto (padrões de PII)', () => {
    const texto = 'Contato 529.982.247-25 e telefone (83) 98888-7777 informados.';
    const out = redigirRelato(texto, []);
    expect(out).not.toMatch(/529\.982\.247-25/);
    expect(out).not.toMatch(/98888-7777/);
    expect(out).toContain(REDIGIDO);
  });

  test('sem identificadores e sem PII, mantém o texto', () => {
    const texto = 'Ocorrência sem dados pessoais no relato.';
    expect(redigirRelato(texto, [])).toBe(texto);
  });
});
