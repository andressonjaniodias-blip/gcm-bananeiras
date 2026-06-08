// backend/config/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

pool.getConnection()
  .then(async conn => {
    console.log('Conectado ao banco MySQL.');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS boletins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        numero VARCHAR(20) NOT NULL,
        dados LONGTEXT NOT NULL,
        data VARCHAR(30) NOT NULL
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario VARCHAR(100) UNIQUE,
        senha VARCHAR(255)
      )
    `);
    conn.release();
  })
  .catch(err => console.error('Erro ao conectar ao banco:', err.message));

module.exports = pool;
