// Regressão da correção A1: o PDF de BO sensível enviado por e-mail deve sair
// CENSURADO (o e-mail é canal menos controlado que o sistema). Antes da correção,
// criarBO gerava o PDF sem { censurar }, vazando dados pessoais de vítimas.
//
// A correção de PII em si (censurarBOParaAgente) é validada em boSensivel.test.js;
// aqui garantimos o ELO que faltava: construirPdfBO honra o flag { censurar }.
process.env.ENCRYPTION_KEY = 'chave-de-teste-nao-usar-em-producao';

// construirPdfBO consulta o banco (comandante e anexos); mock resolve vazio.
jest.mock('../config/db', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));

// Espia a censura preservando dados válidos para o PDFKit renderizar sem erro.
jest.mock('../utils/boSensivel', () => ({
  ehOcorrenciaSensivel: jest.fn(() => true),
  censurarBOParaAgente: jest.fn((dados) => ({ ...dados, __censurado: true })),
}));

const boSensivel = require('../utils/boSensivel');
const { encriptar } = require('../utils/encryption');
const { construirPdfBO } = require('../controllers/boController');

function rowDe(dados) {
  return {
    id: 1,
    numero: 'BO-GCM-0001/2026',
    data: '2026-07-06T10:00:00.000Z',
    criado_por: 'agente1',
    dados: encriptar(JSON.stringify(dados)),
  };
}

const boExemplo = {
  dadosSolicitacao: { natureza: 'Violência Doméstica', nomeSolicitante: 'Maria Silva' },
  dadosOcorrencia: { tipificacao: 'Violência doméstica', rua: 'Rua das Flores' },
  vitimas: [{ nome: 'Maria Silva' }],
  suspeitos: [{ nome: 'Pedro Souza' }],
  relato: 'A vítima Maria Silva relatou que Pedro Souza a agrediu na Rua das Flores.',
};

describe('construirPdfBO — censura no e-mail de BO sensível', () => {
  beforeEach(() => boSensivel.censurarBOParaAgente.mockClear());

  test('com censurar:true, aplica a censura antes de gerar o PDF', async () => {
    const buf = await construirPdfBO(rowDe(boExemplo), { censurar: true });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(boSensivel.censurarBOParaAgente).toHaveBeenCalledTimes(1);
    // recebe os dados decifrados do BO (com o nome da vítima) para então redigir.
    expect(boSensivel.censurarBOParaAgente).toHaveBeenCalledWith(
      expect.objectContaining({ vitimas: [{ nome: 'Maria Silva' }] })
    );
  });

  test('com censurar:false (BO comum), não aplica censura', async () => {
    const buf = await construirPdfBO(rowDe(boExemplo), { censurar: false });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(boSensivel.censurarBOParaAgente).not.toHaveBeenCalled();
  });
});
