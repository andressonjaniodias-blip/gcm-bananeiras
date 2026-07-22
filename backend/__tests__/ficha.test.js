const { blocosEditaveis, sanitizarBloco, camposDeAgentes, camposDaFicha, BLOCOS } = require('../utils/fichaSchema');
const { construirFichaPdf, blocosDoPdf } = require('../utils/fichaPdf');

describe('fichaSchema — quem pode editar o quê', () => {
  test('agente e supervisor só editam os blocos do agente', () => {
    const doAgente = blocosEditaveis('agente');
    expect(doAgente).toContain('pessoal');
    expect(doAgente).toContain('saude');
    expect(doAgente).not.toContain('funcional');
    expect(doAgente).not.toContain('disciplinar');
    expect(blocosEditaveis('supervisor')).toEqual(doAgente);
  });

  test('admin edita todos os blocos', () => {
    expect(blocosEditaveis('admin')).toEqual(BLOCOS.map(b => b.id));
  });

  test('campo restrito ao comando não passa quando quem salva é o agente', () => {
    const payload = { nome: 'Nome Trocado Pelo Agente', nome_social: 'Zé', naturalidade: 'Bananeiras' };
    const doAgente = sanitizarBloco('pessoal', payload, 'agente');
    expect(doAgente.nome).toBeUndefined();
    expect(doAgente.nome_social).toBe('Zé');

    const doAdmin = sanitizarBloco('pessoal', payload, 'admin');
    expect(doAdmin.nome).toBe('Nome Trocado Pelo Agente');
  });

  test('descarta campo que não existe no bloco', () => {
    const limpo = sanitizarBloco('saude', { tipo_sanguineo: 'O+', role: 'admin', senha: '123' }, 'agente');
    expect(limpo).toEqual({ tipo_sanguineo: 'O+' });
  });

  test('campo enviado em branco é preservado — é assim que se limpa um dado', () => {
    expect(sanitizarBloco('saude', { alergias: '' }, 'agente')).toEqual({ alergias: '' });
  });

  test('lista aceita só as colunas declaradas e no máximo 50 linhas', () => {
    const cursos = Array.from({ length: 60 }, (_, i) => ({ curso: `Curso ${i}`, lixo: 'x' }));
    const limpo = sanitizarBloco('formacao', { cursos }, 'agente');
    expect(limpo.cursos).toHaveLength(50);
    expect(limpo.cursos[0]).toEqual({ curso: 'Curso 0' });
  });

  test('cada campo declara onde mora — agentes ou ficha', () => {
    const ids = camposDeAgentes('funcional').map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining(['matricula', 'cargo', 'lotacao']));
    expect(camposDaFicha('funcional').map(c => c.id)).toEqual(expect.arrayContaining(['situacao', 'historico']));
  });
});

// Cada PDF embute os dois brasões (~1 MB de PNG). Fora do Jest isso leva ~1s,
// mas dentro dele o mesmo trabalho passa de 25s — por isso só um smoke test
// renderiza de fato; o que separa a ficha resumida da completa é verificado na
// função pura blocosDoPdf, que é instantânea.
const TIMEOUT_PDF = 120000;

describe('fichaPdf — geração do documento', () => {
  const agente = {
    id: 1, nome: 'João Carlos Silva Souza', matricula: '1234',
    cargo: 'Inspetor', lotacao: 'Ronda / Viatura', ativo: true, foto: null,
  };
  const blocos = {
    pessoal:     { nome: agente.nome, cpf: '000.000.000-00', estado_civil: 'Solteiro(a)', sexo: 'M' },
    contato:     { email: 'joao@bananeiras.pb.gov.br', telefone: '(83) 99999-9999' },
    emergencia:  { nome: 'Maria Souza', parentesco: 'Mãe' },
    saude:       { tipo_sanguineo: 'O+', alergias: 'Dipirona' },
    formacao:    { escolaridade: 'Ensino Médio completo', cursos: [{ curso: 'Armamento e Tiro', ano: '2024' }] },
    funcional:   { matricula: '1234', cargo: 'Inspetor', historico: [{ data: '2024-03-01', tipo: 'Promoção', descricao: 'Promovido a Inspetor' }] },
    operacional: { cnh_categoria: 'AB', equipamentos: [{ item: 'Rádio HT', identificador: 'R-07' }] },
    disciplinar: { ocorrencias: [{ data: '2025-01-10', tipo: 'Elogio', descricao: 'Ação comunitária' }] },
  };

  test('a versão resumida não leva saúde nem histórico disciplinar', () => {
    const resumida = blocosDoPdf(true).map(b => b.id);
    expect(resumida).not.toContain('saude');
    expect(resumida).not.toContain('disciplinar');
    expect(resumida).toContain('funcional');

    const completa = blocosDoPdf(false).map(b => b.id);
    expect(completa).toContain('saude');
    expect(completa).toContain('disciplinar');
  });

  test('a ficha completa sai como PDF válido', async () => {
    const pdf = await construirFichaPdf({ agente, blocos, emitidoPor: 'admin' });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.slice(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  }, TIMEOUT_PDF);
});
