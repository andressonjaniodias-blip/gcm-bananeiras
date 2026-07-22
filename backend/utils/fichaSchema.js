// backend/utils/fichaSchema.js
// Estrutura da ficha funcional do agente. É a fonte única que alimenta:
//   - o formulário completo (frontend monta a tela a partir daqui),
//   - a validação e a permissão de gravação da API (agentesRoutes),
//   - o desenho do PDF (fichaPdf).
//
// Cada bloco declara:
//   dono:     'agente'  → o próprio servidor preenche (e o comando também pode)
//             'comando' → só admin preenche; o agente apenas visualiza
//   sensivel: true      → fica fora da ficha resumida (saúde e disciplinar)
//   fonte:    'agentes' → o campo mora na tabela `agentes` (já existia)
//             'ficha'   → o campo mora no bloco JSON cifrado de `agente_ficha`
//
// Tipos de campo: texto | textarea | data | select | lista
// `lista` guarda um array de objetos, com as colunas descritas em `colunas`.

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Separado(a)', 'Viúvo(a)'];

const ESCOLARIDADE = [
  'Ensino Fundamental incompleto', 'Ensino Fundamental completo',
  'Ensino Médio incompleto', 'Ensino Médio completo',
  'Ensino Superior incompleto', 'Ensino Superior completo',
  'Pós-graduação', 'Mestrado', 'Doutorado',
];

const SITUACAO_FUNCIONAL = ['Ativo', 'Férias', 'Licença médica', 'Licença sem vencimento', 'Afastado', 'Cedido', 'Aposentado', 'Exonerado'];

const TIPO_SANGUINEO = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];

const CNH_CATEGORIAS = ['Não possui', 'A', 'B', 'AB', 'C', 'AC', 'D', 'AD', 'E', 'AE'];

const TURNOS = ['Matutino', 'Vespertino', 'Noturno', 'Integral', 'Escala 12x36', 'Escala 24x72'];

const SEXO = [
  { valor: 'M', rotulo: 'Masculino' },
  { valor: 'F', rotulo: 'Feminino' },
  { valor: 'O', rotulo: 'Outro' },
];

const TIPO_HISTORICO   = ['Promoção', 'Transferência', 'Designação de função', 'Reclassificação', 'Outro'];
const TIPO_DISCIPLINAR = ['Advertência', 'Suspensão', 'Elogio', 'Condecoração', 'Operação especial', 'Outro'];

const BLOCOS = [
  {
    id: 'pessoal',
    titulo: 'Identificação pessoal',
    icone: '🪪',
    dono: 'agente',
    campos: [
      { id: 'nome',            rotulo: 'Nome completo',      tipo: 'texto',  fonte: 'agentes', dono: 'comando', obrigatorio: true, max: 150 },
      { id: 'nome_social',     rotulo: 'Nome social',        tipo: 'texto',  fonte: 'ficha',   max: 150 },
      { id: 'nome_guerra',     rotulo: 'Nome de guerra',     tipo: 'texto',  fonte: 'agentes', max: 60,
        ajuda: 'Apelido pelo qual o agente é conhecido. Ajuda na busca; não é o login nem o nome que sai nos documentos.' },
      { id: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'data',   fonte: 'agentes' },
      { id: 'sexo',            rotulo: 'Sexo',               tipo: 'select', fonte: 'agentes', opcoes: SEXO },
      { id: 'estado_civil',    rotulo: 'Estado civil',       tipo: 'select', fonte: 'ficha',   opcoes: ESTADO_CIVIL },
      { id: 'cpf',             rotulo: 'CPF',                tipo: 'texto',  fonte: 'agentes', mascara: 'cpf', max: 14 },
      { id: 'rg',              rotulo: 'RG',                 tipo: 'texto',  fonte: 'agentes', max: 20 },
      { id: 'orgao_expedidor', rotulo: 'Órgão expedidor',    tipo: 'texto',  fonte: 'ficha',   max: 20, placeholder: 'SSP/PB' },
      { id: 'naturalidade',    rotulo: 'Naturalidade',       tipo: 'texto',  fonte: 'ficha',   max: 100 },
      { id: 'uf_naturalidade', rotulo: 'UF de nascimento',   tipo: 'select', fonte: 'ficha',   opcoes: UFS },
      { id: 'nacionalidade',   rotulo: 'Nacionalidade',      tipo: 'texto',  fonte: 'ficha',   max: 50, placeholder: 'Brasileira' },
    ],
  },
  {
    id: 'contato',
    titulo: 'Contato e endereço',
    icone: '📞',
    dono: 'agente',
    // Todos os campos deste bloco já existem em `agentes` (mesmos que o perfil
    // sempre editou); o bloco só os reúne no formulário completo.
    campos: [
      { id: 'email',         rotulo: 'E-mail',              tipo: 'texto', fonte: 'agentes', max: 150, placeholder: 'servidor@bananeiras.pb.gov.br' },
      { id: 'telefone',      rotulo: 'Telefone / WhatsApp', tipo: 'texto', fonte: 'agentes', mascara: 'telefone', max: 20 },
      { id: 'telefone_alt',  rotulo: 'Telefone alternativo',tipo: 'texto', fonte: 'ficha',   mascara: 'telefone', max: 20 },
      { id: 'cep',           rotulo: 'CEP',                 tipo: 'texto', fonte: 'agentes', mascara: 'cep', max: 9 },
      { id: 'logradouro',    rotulo: 'Logradouro',          tipo: 'texto', fonte: 'agentes', max: 200, largura: 2 },
      { id: 'numero_end',    rotulo: 'Número',              tipo: 'texto', fonte: 'agentes', max: 20 },
      { id: 'complemento',   rotulo: 'Complemento',         tipo: 'texto', fonte: 'agentes', max: 100 },
      { id: 'bairro',        rotulo: 'Bairro',              tipo: 'texto', fonte: 'agentes', max: 100 },
      { id: 'cidade',        rotulo: 'Cidade',              tipo: 'texto', fonte: 'agentes', max: 100 },
      { id: 'uf',            rotulo: 'UF',                  tipo: 'select',fonte: 'agentes', opcoes: UFS },
    ],
  },
  {
    id: 'emergencia',
    titulo: 'Contato de emergência',
    icone: '🚨',
    dono: 'agente',
    campos: [
      { id: 'nome',       rotulo: 'Nome',        tipo: 'texto', fonte: 'ficha', max: 150 },
      { id: 'parentesco', rotulo: 'Parentesco',  tipo: 'texto', fonte: 'ficha', max: 50 },
      { id: 'telefone',   rotulo: 'Telefone',    tipo: 'texto', fonte: 'ficha', mascara: 'telefone', max: 20 },
      { id: 'endereco',   rotulo: 'Endereço',    tipo: 'texto', fonte: 'ficha', max: 200, largura: 2 },
    ],
  },
  {
    id: 'saude',
    titulo: 'Saúde',
    icone: '🩺',
    dono: 'agente',
    sensivel: true,
    aviso: 'Dado pessoal sensível (LGPD art. 11). Visível apenas para você e para o comando, e não sai na ficha resumida.',
    campos: [
      { id: 'tipo_sanguineo',     rotulo: 'Tipo sanguíneo',            tipo: 'select',   fonte: 'ficha', opcoes: TIPO_SANGUINEO },
      { id: 'alergias',           rotulo: 'Alergias',                  tipo: 'textarea', fonte: 'ficha', max: 500 },
      { id: 'restricoes',         rotulo: 'Restrições médicas',        tipo: 'textarea', fonte: 'ficha', max: 500 },
      { id: 'condicoes',          rotulo: 'Condições de saúde',        tipo: 'textarea', fonte: 'ficha', max: 500 },
      { id: 'exame_aptidao',      rotulo: 'Último exame de aptidão',   tipo: 'data',     fonte: 'ficha' },
    ],
  },
  {
    id: 'formacao',
    titulo: 'Formação e qualificação',
    icone: '🎓',
    dono: 'agente',
    campos: [
      { id: 'escolaridade', rotulo: 'Escolaridade',            tipo: 'select', fonte: 'ficha', opcoes: ESCOLARIDADE },
      { id: 'curso',        rotulo: 'Curso / formação',        tipo: 'texto',  fonte: 'ficha', max: 150 },
      { id: 'instituicao',  rotulo: 'Instituição',             tipo: 'texto',  fonte: 'ficha', max: 150 },
      { id: 'idiomas',      rotulo: 'Idiomas',                 tipo: 'texto',  fonte: 'ficha', max: 150, largura: 2 },
      { id: 'cursos',       rotulo: 'Cursos e certificações',  tipo: 'lista',  fonte: 'ficha',
        colunas: [
          { id: 'curso',       rotulo: 'Curso',        tipo: 'texto' },
          { id: 'instituicao', rotulo: 'Instituição',  tipo: 'texto' },
          { id: 'ano',         rotulo: 'Ano',          tipo: 'texto', largura: 'curta' },
          { id: 'carga',       rotulo: 'Carga horária',tipo: 'texto', largura: 'curta' },
        ] },
    ],
  },
  {
    id: 'funcional',
    titulo: 'Dados funcionais',
    icone: '🏛️',
    dono: 'comando',
    campos: [
      { id: 'matricula',     rotulo: 'Matrícula',             tipo: 'texto',  fonte: 'agentes', obrigatorio: true, max: 30 },
      { id: 'cargo',         rotulo: 'Cargo',                 tipo: 'select', fonte: 'agentes', obrigatorio: true, opcoes: 'CARGOS' },
      { id: 'data_admissao', rotulo: 'Data de ingresso',      tipo: 'data',   fonte: 'agentes' },
      { id: 'lotacao',       rotulo: 'Lotação / setor',       tipo: 'texto',  fonte: 'agentes', max: 100 },
      { id: 'turno',         rotulo: 'Turno / regime',        tipo: 'select', fonte: 'agentes', opcoes: TURNOS },
      { id: 'situacao',      rotulo: 'Situação funcional',    tipo: 'select', fonte: 'ficha',   opcoes: SITUACAO_FUNCIONAL },
      { id: 'historico',     rotulo: 'Histórico funcional',   tipo: 'lista',  fonte: 'ficha',
        ajuda: 'Promoções, transferências e funções exercidas.',
        colunas: [
          { id: 'data',      rotulo: 'Data',      tipo: 'data',   largura: 'curta' },
          { id: 'tipo',      rotulo: 'Tipo',      tipo: 'select', opcoes: TIPO_HISTORICO },
          { id: 'descricao', rotulo: 'Descrição', tipo: 'texto' },
        ] },
    ],
  },
  {
    id: 'operacional',
    titulo: 'Informações operacionais',
    icone: '🛡️',
    dono: 'comando',
    campos: [
      { id: 'arma_funcional', rotulo: 'Nº da arma funcional',  tipo: 'texto',  fonte: 'ficha', max: 50 },
      { id: 'cnh_categoria',  rotulo: 'CNH — categoria',       tipo: 'select', fonte: 'ficha', opcoes: CNH_CATEGORIAS },
      { id: 'cnh_validade',   rotulo: 'CNH — validade',        tipo: 'data',   fonte: 'ficha' },
      { id: 'areas_atuacao',  rotulo: 'Áreas de atuação',      tipo: 'texto',  fonte: 'ficha', max: 200, largura: 2,
        placeholder: 'Patrulhamento escolar, trânsito, segurança comunitária...' },
      { id: 'disponibilidade',rotulo: 'Disponibilidade para cursos e missões', tipo: 'textarea', fonte: 'ficha', max: 500 },
      { id: 'equipamentos',   rotulo: 'Equipamentos sob responsabilidade', tipo: 'lista', fonte: 'ficha',
        colunas: [
          { id: 'item',          rotulo: 'Item',          tipo: 'texto' },
          { id: 'identificador', rotulo: 'Identificação', tipo: 'texto' },
          { id: 'entrega',       rotulo: 'Entrega',       tipo: 'data', largura: 'curta' },
          { id: 'devolucao',     rotulo: 'Devolução',     tipo: 'data', largura: 'curta' },
        ] },
    ],
  },
  {
    id: 'disciplinar',
    titulo: 'Histórico disciplinar e mérito',
    icone: '⚖️',
    dono: 'comando',
    sensivel: true,
    aviso: 'Registro restrito ao comando e ao próprio agente. Não sai na ficha resumida.',
    campos: [
      { id: 'ocorrencias', rotulo: 'Ocorrências', tipo: 'lista', fonte: 'ficha',
        colunas: [
          { id: 'data',      rotulo: 'Data',      tipo: 'data',   largura: 'curta' },
          { id: 'tipo',      rotulo: 'Tipo',      tipo: 'select', opcoes: TIPO_DISCIPLINAR },
          { id: 'documento', rotulo: 'Documento', tipo: 'texto',  largura: 'curta' },
          { id: 'descricao', rotulo: 'Descrição', tipo: 'texto' },
        ] },
      { id: 'observacoes_superior', rotulo: 'Observações do superior imediato', tipo: 'textarea', fonte: 'ficha', max: 1000, largura: 2 },
      { id: 'projetos',             rotulo: 'Projetos e atividades comunitárias', tipo: 'textarea', fonte: 'ficha', max: 1000, largura: 2 },
    ],
  },
];

// Colunas da tabela agente_ficha que guardam JSON cifrado — uma por bloco, na
// mesma ordem em que os blocos aparecem no formulário e no PDF.
const BLOCOS_FICHA = BLOCOS.map(b => b.id);

const bloco = id => BLOCOS.find(b => b.id === id) || null;

// Blocos que o papel informado pode gravar.
function blocosEditaveis(role) {
  return role === 'admin' ? BLOCOS.map(b => b.id) : BLOCOS.filter(b => b.dono === 'agente').map(b => b.id);
}

// Campos de um bloco cuja fonte é a tabela `agentes` (os demais vão para o JSON).
function camposDeAgentes(blocoId) {
  return (bloco(blocoId)?.campos || []).filter(c => c.fonte === 'agentes');
}

function camposDaFicha(blocoId) {
  return (bloco(blocoId)?.campos || []).filter(c => c.fonte !== 'agentes');
}

// Remove do payload tudo que não está declarado no bloco (whitelist) e corta
// strings no tamanho máximo. Listas viram array de objetos com as colunas
// declaradas, no máximo LIMITE_LISTA linhas.
//
// `role` filtra também no nível do campo: dentro de um bloco do agente pode
// haver campo que só o comando altera (o nome completo, por exemplo).
// Campo enviado em branco é preservado como '' — é assim que se limpa um dado.
const LIMITE_LISTA = 50;

function sanitizarBloco(blocoId, dados, role) {
  const def = bloco(blocoId);
  if (!def || !dados || typeof dados !== 'object') return {};
  const out = {};
  for (const campo of def.campos) {
    if (campo.dono === 'comando' && role !== 'admin') continue;
    const v = dados[campo.id];
    if (v == null) continue;
    if (campo.tipo === 'lista') {
      if (!Array.isArray(v)) continue;
      out[campo.id] = v.slice(0, LIMITE_LISTA).map(linha => {
        const item = {};
        for (const col of campo.colunas) {
          const cv = linha?.[col.id];
          if (cv != null && String(cv).trim()) item[col.id] = String(cv).trim().slice(0, 300);
        }
        return item;
      }).filter(item => Object.keys(item).length);
    } else {
      out[campo.id] = String(v).trim().slice(0, campo.max || 1000);
    }
  }
  return out;
}

module.exports = {
  BLOCOS, BLOCOS_FICHA, bloco, blocosEditaveis,
  camposDeAgentes, camposDaFicha, sanitizarBloco,
  UFS, ESTADO_CIVIL, ESCOLARIDADE, SITUACAO_FUNCIONAL, TIPO_SANGUINEO, CNH_CATEGORIAS, TURNOS,
};
