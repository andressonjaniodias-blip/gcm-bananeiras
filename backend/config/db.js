// backend/config/db.js
const { Pool } = require('pg');
const { encriptar, desencriptar, desencriptarComFallback } = require('../utils/encryption');
const { ehOcorrenciaSensivel } = require('../utils/boSensivel');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Erros em clientes ociosos do pool (ex.: conexão derrubada pelo banco) emitem
// 'error' de forma assíncrona; sem este listener o processo Node encerra.
pool.on('error', err => console.error('Erro inesperado no pool do banco:', err.message));

pool.connect()
  .then(async client => {
    console.log('Conectado ao banco PostgreSQL.');
    await client.query(`
      CREATE TABLE IF NOT EXISTS boletins (
        id SERIAL PRIMARY KEY,
        numero TEXT NOT NULL,
        dados TEXT NOT NULL,
        data TEXT NOT NULL,
        criado_por TEXT
      );
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        usuario TEXT UNIQUE,
        senha TEXT,
        role TEXT DEFAULT 'agente'
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          SERIAL PRIMARY KEY,
        usuario     TEXT NOT NULL,
        acao        TEXT NOT NULL,
        recurso     TEXT,
        ip          TEXT,
        data        TIMESTAMPTZ DEFAULT NOW(),
        user_agent  TEXT,
        dispositivo TEXT,
        navegador   TEXT,
        so          TEXT,
        sessao_id   TEXT
      );
    `);
    await client.query(`
      ALTER TABLE boletins ADD COLUMN IF NOT EXISTS criado_por TEXT;
    `);
    // Marca ocorrências sensíveis: dados pessoais restritos ao comando (o agente
    // vê o BO, mas com os dados pessoais censurados). Ver backend/utils/boSensivel.js.
    await client.query(`
      ALTER TABLE boletins ADD COLUMN IF NOT EXISTS sensivel BOOLEAN DEFAULT false;
    `);
    // Marca BOs anonimizados pela política de retenção: os dados pessoais foram
    // removidos, preservando apenas natureza/tipificação/data para estatística.
    await client.query(`
      ALTER TABLE boletins ADD COLUMN IF NOT EXISTS anonimizado BOOLEAN DEFAULT false;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS relatorios (
        id          SERIAL PRIMARY KEY,
        numero      TEXT NOT NULL,
        tipo        TEXT NOT NULL,
        titulo      TEXT NOT NULL,
        data        TEXT NOT NULL,
        local       TEXT,
        equipe      TEXT,
        conteudo    TEXT,
        obs         TEXT,
        status      TEXT DEFAULT 'rascunho',
        criado_por  TEXT,
        criado_em   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS controle_viatura (
        id          SERIAL PRIMARY KEY,
        tipo        TEXT NOT NULL,
        codigo      TEXT NOT NULL,
        data_hora   TIMESTAMPTZ NOT NULL,
        km          INTEGER NOT NULL,
        responsavel TEXT,
        dados       TEXT,
        obs         TEXT,
        criado_em   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS documentos (
        id            SERIAL PRIMARY KEY,
        tipo          TEXT NOT NULL,
        titulo        TEXT NOT NULL,
        data          TEXT NOT NULL,
        numero        TEXT,
        descricao     TEXT,
        arquivo       TEXT,
        arquivo_nome  TEXT,
        arquivo_mime  TEXT,
        publicado_por TEXT,
        criado_em     TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS agentes (
        id             SERIAL PRIMARY KEY,
        nome           TEXT NOT NULL,
        matricula      TEXT NOT NULL,
        cargo          TEXT DEFAULT 'Guarda Civil Municipal',
        usuario        TEXT,
        ativo          BOOLEAN DEFAULT true,
        criado_em      TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Colunas adicionais de dados funcionais e contato
    // Tabela de anexos (BO e Relatório)
    await client.query(`
      CREATE TABLE IF NOT EXISTS anexos (
        id            SERIAL PRIMARY KEY,
        tipo_ref      TEXT NOT NULL,        -- 'bo' ou 'relatorio'
        ref_id        INTEGER NOT NULL,
        nome_arquivo  TEXT NOT NULL,        -- nome no disco
        nome_original TEXT NOT NULL,        -- nome original do usuário
        mime_type     TEXT,
        tamanho       INTEGER,
        criado_por    TEXT,
        criado_em     TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Conteúdo binário dos anexos em base64 (garante persistência no Render.com)
    await client.query(`
      ALTER TABLE anexos ADD COLUMN IF NOT EXISTS dados TEXT;
    `);

    // Título e legenda opcionais (formatação ABNT)
    await client.query(`ALTER TABLE anexos ADD COLUMN IF NOT EXISTS titulo  TEXT;`);
    await client.query(`ALTER TABLE anexos ADD COLUMN IF NOT EXISTS legenda TEXT;`);

    // Colunas adicionais de log (para bancos existentes)
    const colunasLog = [
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent  TEXT`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS dispositivo TEXT`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS navegador   TEXT`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS so          TEXT`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS sessao_id   TEXT`,
    ];
    for (const sql of colunasLog) await client.query(sql);

    const colunasAgentes = [
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS cpf           TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS rg            TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS data_nascimento TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS sexo          TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS lotacao       TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS turno         TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS data_admissao TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS email         TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS telefone      TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS cep           TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS logradouro    TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS numero_end    TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS complemento   TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS bairro        TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS cidade        TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS uf            TEXT`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT NOW()`,
      `ALTER TABLE agentes ADD COLUMN IF NOT EXISTS foto          TEXT`,
    ];
    for (const sql of colunasAgentes) await client.query(sql);

    await client.query(`
      ALTER TABLE documentos ADD COLUMN IF NOT EXISTS destaque_home BOOLEAN DEFAULT false;
    `);

    // Conteúdo binário do documento em base64 (garante persistência no Render.com,
    // onde o filesystem é efêmero — mesmo padrão já usado na tabela anexos).
    await client.query(`
      ALTER TABLE documentos ADD COLUMN IF NOT EXISTS arquivo_dados TEXT;
    `);

    // Migração: colunas de data gravadas como TEXT -> TIMESTAMPTZ (evita comparações
    // frágeis por ordenação lexicográfica). Só reescreve a coluna se ainda não migrada.
    async function migrarParaTimestamptz(tabela, coluna) {
      const { rows } = await client.query(
        `SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [tabela, coluna]
      );
      if (rows[0] && rows[0].data_type !== 'timestamp with time zone') {
        await client.query(
          `ALTER TABLE ${tabela} ALTER COLUMN ${coluna} TYPE TIMESTAMPTZ USING ${coluna}::timestamptz`
        );
      }
    }
    await migrarParaTimestamptz('boletins', 'data');
    await migrarParaTimestamptz('relatorios', 'data');
    await migrarParaTimestamptz('documentos', 'data');

    await client.query(`
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS lgpd_aceito BOOLEAN DEFAULT false;
    `);
    await client.query(`
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email TEXT;
    `);
    await client.query(`
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token_expira TIMESTAMPTZ;
    `);
    await client.query(`
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sessao_ativa TEXT;
    `);
    await client.query(`
      ALTER TABLE controle_viatura ADD COLUMN IF NOT EXISTS criado_por TEXT;
    `);
    await client.query(`
      ALTER TABLE controle_viatura ADD COLUMN IF NOT EXISTS numero TEXT;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS frota (
        id        SERIAL PRIMARY KEY,
        codigo    TEXT NOT NULL UNIQUE,
        modelo    TEXT,
        ano       INTEGER,
        placa     TEXT,
        cor       TEXT,
        tipo      TEXT DEFAULT 'carro-patrulha',
        status    TEXT DEFAULT 'ativa',
        obs       TEXT,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Módulos de Escala, Plantões Extras e Férias ──────────────────────────
    // Lista configurável de postos/setores (seed inicial mais abaixo)
    await client.query(`
      CREATE TABLE IF NOT EXISTS postos (
        id        SERIAL PRIMARY KEY,
        nome      TEXT NOT NULL UNIQUE,
        seg_sex   BOOLEAN DEFAULT false,   -- posto administrativo Seg–Sex (sem rotação)
        ordem     INTEGER DEFAULT 0,
        ativo     BOOLEAN DEFAULT true,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Cabeçalho da escala mensal
    await client.query(`
      CREATE TABLE IF NOT EXISTS escalas (
        id             SERIAL PRIMARY KEY,
        numero         TEXT,
        mes_referencia TEXT NOT NULL,           -- 'YYYY-MM'
        titulo         TEXT,
        obs            TEXT,
        patrulha_dia1  TEXT DEFAULT '1',       -- qual patrulha (1..4) trabalha no dia 1 do mês
        criado_por     TEXT,
        criado_em      TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (mes_referencia)
      );
    `);
    await client.query(`ALTER TABLE escalas ADD COLUMN IF NOT EXISTS patrulha_dia1 TEXT DEFAULT '1';`);

    // Itens da escala: cada linha = 1 agente em 1 posto de 1 patrulha
    await client.query(`
      CREATE TABLE IF NOT EXISTS escala_itens (
        id        SERIAL PRIMARY KEY,
        escala_id INTEGER NOT NULL REFERENCES escalas(id) ON DELETE CASCADE,
        patrulha  TEXT NOT NULL,               -- '1'..'4' ou 'ADM' (Seg–Sex)
        posto     TEXT NOT NULL,
        agente_id INTEGER,
        nome      TEXT,                         -- snapshot do nome
        matricula TEXT,
        regime    TEXT DEFAULT '24x72',         -- '24x72' | '12x36' | 'seg-sex' (legado)
        turno     TEXT,                         -- 'diurno' | 'noturno' (12x36) (legado)
        obs       TEXT
      );
    `);
    // Horário único selecionável na montagem (substitui regime/turno na UI; estes
    // ficam para compatibilidade). Ex.: '24x72', '12x36', 'Diurno', 'Noturno',
    // 'Segunda a Sexta', 'Sábado', 'Domingo'.
    await client.query(`ALTER TABLE escala_itens ADD COLUMN IF NOT EXISTS horario TEXT;`);

    // Plantões extras: uma linha por vaga preenchida (máx. 4 por dia)
    await client.query(`
      CREATE TABLE IF NOT EXISTS extras_vagas (
        id           SERIAL PRIMARY KEY,
        data         DATE NOT NULL,
        agente_id    INTEGER,
        nome         TEXT NOT NULL,
        matricula    TEXT,
        funcao       TEXT,                      -- função no plantão
        tipo         TEXT NOT NULL DEFAULT '12',-- '12' | '24' (horas)
        hora_inicio  TEXT,
        hora_fim     TEXT,
        telefone     TEXT,
        valor        NUMERIC(10,2) DEFAULT 0,   -- calculado: 140 por 12h
        liberado_por TEXT,                      -- quem autorizou estouro de cota
        criado_por   TEXT,
        criado_em    TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_extras_data ON extras_vagas(data)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_extras_agente ON extras_vagas(agente_id)`);

    // Configuração do número de vagas de extras por dia (padrão 4, ajustável por admin/supervisor)
    await client.query(`
      CREATE TABLE IF NOT EXISTS extras_config_dia (
        data          DATE PRIMARY KEY,
        vagas_total   INTEGER NOT NULL DEFAULT 4,
        atualizado_por TEXT,
        atualizado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Fechamento da lista diária de extras: uma vez fechada, só comando (admin/supervisor)
    // pode alterá-la, e cada alteração reenvia o PDF atualizado por e-mail.
    await client.query(`ALTER TABLE extras_config_dia ADD COLUMN IF NOT EXISTS fechado     BOOLEAN DEFAULT false;`);
    await client.query(`ALTER TABLE extras_config_dia ADD COLUMN IF NOT EXISTS fechado_por TEXT;`);
    await client.query(`ALTER TABLE extras_config_dia ADD COLUMN IF NOT EXISTS fechado_em  TIMESTAMPTZ;`);

    // Férias
    await client.query(`
      CREATE TABLE IF NOT EXISTS ferias (
        id          SERIAL PRIMARY KEY,
        agente_id   INTEGER,
        nome        TEXT NOT NULL,
        matricula   TEXT,
        data_inicio DATE NOT NULL,
        data_fim    DATE NOT NULL,
        obs         TEXT,
        criado_por  TEXT,
        criado_em   TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed inicial de postos (só se a tabela estiver vazia)
    const { rows: [{ n_postos }] } = await client.query(`SELECT COUNT(*)::int AS n_postos FROM postos`);
    if (n_postos === 0) {
      const postosSeed = [
        ['Ronda / Viatura',        false],
        ['Hospital',               false],
        ['Monitoramento',          false],
        ['Garagem Municipal',      false],
        ['Creche Tia Glauce',      false],
        ['Escola Dionísio Maia',   false],
        ['Escola João Paulo II',   false],
        ['Secretaria de Saúde',    false],
        ['Trânsito',               true],
        ['Ação Social',            true],
      ];
      for (let i = 0; i < postosSeed.length; i++) {
        await client.query(
          `INSERT INTO postos (nome, seg_sex, ordem) VALUES ($1,$2,$3) ON CONFLICT (nome) DO NOTHING`,
          [postosSeed[i][0], postosSeed[i][1], i]
        );
      }
    }

    // ── Sequences para numeração atômica (elimina race condition) ────────────
    await client.query(`CREATE SEQUENCE IF NOT EXISTS bo_seq  START 1`);
    await client.query(`CREATE SEQUENCE IF NOT EXISTS rel_seq START 1`);
    await client.query(`CREATE SEQUENCE IF NOT EXISTS vtr_seq START 1`);
    await client.query(`CREATE SEQUENCE IF NOT EXISTS esc_seq START 1`);
    await client.query(`CREATE SEQUENCE IF NOT EXISTS fer_seq START 1`);

    // Avança cada sequence para o maior número já registrado (migração segura)
    const { rows: [{ max_bo }] } = await client.query(`
      SELECT COALESCE(MAX(
        CASE WHEN numero ~ '^BO-GCM-[0-9]+'
        THEN CAST(REGEXP_REPLACE(numero, '^BO-GCM-([0-9]+).*$', '\\1') AS INTEGER)
        ELSE 0 END
      ), 0) AS max_bo FROM boletins
    `);
    if (parseInt(max_bo) > 0) await client.query(`SELECT setval('bo_seq', $1)`, [max_bo]);

    const { rows: [{ max_rel }] } = await client.query(`
      SELECT COALESCE(MAX(
        CASE WHEN numero ~ '^REL-GCM-[A-Z]+-[0-9]+'
        THEN CAST(REGEXP_REPLACE(numero, '^REL-GCM-[A-Z]+-([0-9]+).*$', '\\1') AS INTEGER)
        WHEN numero ~ '^REL-GCM-[0-9]+'
        THEN CAST(REGEXP_REPLACE(numero, '^REL-GCM-([0-9]+).*$', '\\1') AS INTEGER)
        ELSE 0 END
      ), 0) AS max_rel FROM relatorios
    `);
    if (parseInt(max_rel) > 0) await client.query(`SELECT setval('rel_seq', $1)`, [max_rel]);

    const { rows: [{ max_vtr }] } = await client.query(`
      SELECT COALESCE(MAX(
        CASE WHEN numero ~ '^VTR-GCM-[0-9]+'
        THEN CAST(REGEXP_REPLACE(numero, '^VTR-GCM-([0-9]+).*$', '\\1') AS INTEGER)
        ELSE 0 END
      ), 0) AS max_vtr FROM controle_viatura
    `);
    if (parseInt(max_vtr) > 0) await client.query(`SELECT setval('vtr_seq', $1)`, [max_vtr]);

    // ── Índices para colunas muito consultadas ───────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_boletins_data ON boletins(data)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_data     ON audit_logs(data)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_anexos_ref     ON anexos(tipo_ref, ref_id)`);

    // ── Unicidade de matrícula do agente (chave natural usada no reset de senha) ──
    // Guardado: se houver matrículas duplicadas legadas, o ALTER falha; nesse caso
    // apenas registra aviso e segue — a constraint entra depois que as duplicatas
    // forem resolvidas manualmente.
    try {
      const { rows: temUk } = await client.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'agentes_matricula_uk'`
      );
      if (!temUk.length) {
        await client.query(`ALTER TABLE agentes ADD CONSTRAINT agentes_matricula_uk UNIQUE (matricula)`);
      }
    } catch (e) {
      console.warn('[schema] UNIQUE em agentes.matricula não aplicado (verifique matrículas duplicadas):', e.message);
    }

    // ── Nome de guerra ───────────────────────────────────────────────────────
    // O login é estritamente o que o admin digita no campo "usuário" (a sugestão
    // é usar o nome de guerra, mas nada é imposto). O nome de guerra tem coluna
    // própria e serve como apelido de busca — ele NÃO define o login nem o nome
    // que sai nos documentos, que segue o padrão "João Carlos, 1234"
    // (ver backend/utils/nomeAgente.js).
    await client.query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS nome_guerra TEXT;`);

    // ── Ficha funcional do agente (1:1 com agentes) ──────────────────────────
    // Cada bloco é um JSON cifrado (LGPD art. 46) gravado e lido por inteiro; a
    // permissão de edição é por bloco (agente x comando) — ver utils/fichaSchema.js.
    // Os campos básicos (nome, matrícula, cargo, contato, endereço) continuam em
    // `agentes`; aqui fica só o que a ficha completa acrescenta.
    await client.query(`
      CREATE TABLE IF NOT EXISTS agente_ficha (
        agente_id      INTEGER PRIMARY KEY REFERENCES agentes(id) ON DELETE CASCADE,
        pessoal        TEXT,
        contato        TEXT,
        emergencia     TEXT,
        saude          TEXT,
        formacao       TEXT,
        funcional      TEXT,
        operacional    TEXT,
        disciplinar    TEXT,
        atualizado_em  TIMESTAMPTZ DEFAULT NOW(),
        atualizado_por TEXT
      );
    `);

    // ── Salvaguarda da chave de criptografia (canário) ───────────────────────
    // Detecta troca acidental da ENCRYPTION_KEY, que tornaria todos os BOs e o
    // CPF/RG dos agentes ilegíveis de forma permanente e silenciosa. Se a chave
    // mudou, aborta o start (a menos que ALLOW_ENCRYPTION_KEY_MISMATCH=true) para
    // não gravar dado novo cifrado com uma chave incompatível com o dado antigo.
    await client.query(`CREATE TABLE IF NOT EXISTS sys_meta (chave TEXT PRIMARY KEY, valor TEXT)`);
    try {
      const CANARY_PLAIN = 'gcm-encryption-canary-v1';
      const { rows: canRows } = await client.query(`SELECT valor FROM sys_meta WHERE chave = 'enc_canary'`);
      if (!canRows.length) {
        await client.query(
          `INSERT INTO sys_meta (chave, valor) VALUES ('enc_canary', $1)
           ON CONFLICT (chave) DO NOTHING`,
          [encriptar(CANARY_PLAIN)]
        );
      } else {
        let ok = false;
        try { ok = desencriptar(canRows[0].valor) === CANARY_PLAIN; } catch { ok = false; }
        if (!ok) {
          console.error('==================================================================');
          console.error('CRÍTICO: ENCRYPTION_KEY não confere com a chave usada nos dados');
          console.error('existentes. Iniciar assim corromperia dados (BOs e CPF/RG).');
          console.error('Restaure a ENCRYPTION_KEY correta. Para ignorar (perigoso), defina');
          console.error('ALLOW_ENCRYPTION_KEY_MISMATCH=true.');
          console.error('==================================================================');
          if (process.env.ALLOW_ENCRYPTION_KEY_MISMATCH !== 'true') {
            client.release();
            process.exit(1);
          }
        }
      }
    } catch (e) {
      console.error('[schema] Falha ao verificar canário de criptografia:', e.message);
    }

    // ── Backfill único: marca BOs sensíveis já existentes ────────────────────
    // A detecção de sensibilidade passou a existir depois que BOs já haviam sido
    // criados. Roda uma única vez (guardado por sys_meta) para proteger também o
    // acervo antigo. Falha por linha é tolerada (não bloqueia o start).
    try {
      const { rows: doneRows } = await client.query(
        `SELECT valor FROM sys_meta WHERE chave = 'bo_sensivel_backfill'`
      );
      if (!doneRows.length) {
        const { rows: todosBOs } = await client.query('SELECT id, dados FROM boletins');
        let marcados = 0;
        for (const bo of todosBOs) {
          try {
            const dados = JSON.parse(desencriptarComFallback(bo.dados));
            if (ehOcorrenciaSensivel(dados)) {
              await client.query('UPDATE boletins SET sensivel = true WHERE id = $1', [bo.id]);
              marcados++;
            }
          } catch { /* linha ilegível — ignora */ }
        }
        await client.query(
          `INSERT INTO sys_meta (chave, valor) VALUES ('bo_sensivel_backfill', $1)
           ON CONFLICT (chave) DO NOTHING`,
          [new Date().toISOString()]
        );
        if (marcados) console.log(`[schema] Backfill de BOs sensíveis: ${marcados} marcado(s).`);
      }
    } catch (e) {
      console.error('[schema] Falha no backfill de BOs sensíveis:', e.message);
    }

    client.release();
  })
  .catch(err => console.error('Erro ao conectar ao banco:', err.message));

module.exports = pool;
