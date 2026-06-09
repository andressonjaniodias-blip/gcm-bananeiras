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
        id SERIAL PRIMARY KEY,
        usuario TEXT NOT NULL,
        acao TEXT NOT NULL,
        recurso TEXT,
        ip TEXT,
        data TIMESTAMPTZ DEFAULT NOW()
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
        id        SERIAL PRIMARY KEY,
        nome      TEXT NOT NULL,
        matricula TEXT NOT NULL,
        cargo     TEXT DEFAULT 'Guarda Civil Municipal',
        usuario   TEXT,
        ativo     BOOLEAN DEFAULT true,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    client.release();
  })
  .catch(err => console.error('Erro ao conectar ao banco:', err.message));

module.exports = pool;
