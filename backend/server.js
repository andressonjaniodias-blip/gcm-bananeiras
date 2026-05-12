// backend/server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const boRoutes = require('./routes/boRoutes');

const app = express();

// Middlewares
app.use(cors()); // Permite requisições de diferentes origens
app.use(bodyParser.json()); // Interpreta JSON no corpo das requisições
app.post('/api/bo/finalizar', boController.finalizarBO);

// Rotas principais
app.use('/api/bo', boRoutes);

// Rota inicial para teste
app.get('/', (req, res) => {
  res.send('API do Sistema de Registro de BO está rodando...');
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
