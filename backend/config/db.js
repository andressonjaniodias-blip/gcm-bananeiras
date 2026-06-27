// backend/config/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

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
    client.release();
  })
  .catch(err => console.error('Erro ao conectar ao banco:', err.message));

module.exports = pool;
