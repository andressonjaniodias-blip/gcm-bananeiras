// backend/config/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.connect()
  .then(client => {
    console.log('Conectado ao banco PostgreSQL.');
    return client
      .query(`
        CREATE TABLE IF NOT EXISTS boletins (
          id SERIAL PRIMARY KEY,
          numero TEXT NOT NULL,
          dados TEXT NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS usuarios (
          id SERIAL PRIMARY KEY,
          usuario TEXT UNIQUE,
          senha TEXT
        );
      `)
      .finally(() => client.release());
  })
  .catch(err => console.error('Erro ao conectar ao banco:', err.message));

module.exports = pool;
