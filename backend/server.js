require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const boRoutes = require('./routes/boRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// ✅ CORS Configurado Corretamente
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middlewares
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// ✅ Servir arquivos estáticos do frontend
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/bo', boRoutes);

// ✅ Health check endpoint (Render verifica isso)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rota raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ✅ SPA: redirecionar 404 para index.html
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'Rota não encontrada' });
  }
});

// ✅ Tratamento de erros global
app.use((err, req, res, next) => {
  console.error('❌ Erro:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message
  });
});

// Inicialização
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 CORS Origins: ${allowedOrigins.join(', ')}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`${'='.repeat(50)}\n`);
});

module.exports = app;