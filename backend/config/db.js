// backend/config/db.js
const sqlite3 = require('sqlite3').verbose();

// Cria ou abre o banco local
const db = new sqlite3.Database('./bo.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco:', err.message);
  } else {
    console.log('Conectado ao banco SQLite.');
  }
});

// Criação da tabela de BOs
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS boletins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    dados TEXT NOT NULL,
    data TEXT NOT NULL
  )`);
});

module.exports = db;
