require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const boRoutes = require('./routes/boRoutes');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/logger');
 
const app = express();
 
// ✅ CORS CONFIGURADO CORRETAMENTE
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
}));
 
// ✅ Middlewares
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(requestLogger); // Log todas as requisições
 
// ✅ Rotas de Autenticação (SEM proteção JWT, pois é login)
app.use('/api/auth', authRoutes);
 
// ✅ Rotas de BO (COM proteção JWT)
app.use('/api/bo', boRoutes);
 
// Rota inicial para teste
app.get('/', (req, res) => {
  res.json({ 
    message: 'API do Sistema de Registro de BO está rodando...',
    version: '1.0.0'
  });
});
 
// ✅ Tratamento de erros centralizado
app.use(errorHandler);
 
// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Servidor rodando na porta ${PORT}`);
});