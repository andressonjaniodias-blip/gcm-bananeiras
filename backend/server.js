require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { csrfMiddleware } = require('./middleware/csrf');
const boRoutes        = require('./routes/boRoutes');
const authRoutes      = require('./routes/authRoutes');
const relatorioRoutes = require('./routes/relatorioRoutes');
const viaturaRoutes   = require('./routes/viaturaRoutes');
const documentoRoutes = require('./routes/documentoRoutes');
const agentesRoutes   = require('./routes/agentesRoutes');
const anexosRoutes    = require('./routes/anexosRoutes');
const frotaRoutes     = require('./routes/frotaRoutes');
const escalaRoutes    = require('./routes/escalaRoutes');
const extrasRoutes    = require('./routes/extrasRoutes');
const feriasRoutes    = require('./routes/feriasRoutes');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter para criação de usuários e operações admin sensíveis
const adminWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 30,
  message: { error: 'Muitas requisições. Tente novamente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter para upload de arquivos e geração de PDF
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50,
  message: { error: 'Muitos uploads. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const app = express();

// Necessário para rate limiting funcionar corretamente atrás do proxy do Render
app.set('trust proxy', 1);

// ✅ CORS Configurado Corretamente
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// ✅ Cabeçalhos de segurança (helmet) — medida técnica LGPD art. 46.
// CSP compatível com o frontend atual: scripts/estilos inline nas páginas,
// Google Fonts (googleapis/gstatic), imagens em data: URI (fotos base64 / brasões)
// e chamadas à API na mesma origem (ver frontend/assets/js/config.js).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'base-uri': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      // As páginas usam handlers de evento inline (onclick=, onsubmit=, ...). O helmet,
      // com useDefaults, define script-src-attr 'none', que os bloquearia; liberamos
      // aqui de forma coerente com o 'unsafe-inline' já adotado no script-src.
      'script-src-attr': ["'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
      // Reverse-geocoding do botão "Usar localização atual" (frontend/assets/js/geolocalizacao.js).
      'connect-src': ["'self'", 'https://nominatim.openstreetmap.org'],
      'object-src': ["'none'"],
      'frame-ancestors': ["'self'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': [],
    },
  },
  // HSTS ativo em produção (HTTPS). includeSubDomains + 180 dias (padrão helmet).
  hsts: { maxAge: 15552000, includeSubDomains: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Evita quebrar o carregamento de recursos same-origin/data: no frontend atual.
  crossOriginEmbedderPolicy: false,
}));

// Middlewares
app.use(cookieParser());
app.use(csrfMiddleware);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// ✅ Servir arquivos estáticos do frontend
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// ✅ Servir imagens da pasta public
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Rotas da API
app.use('/api/auth/login',            loginLimiter);
app.use('/api/auth/setup',            adminWriteLimiter);
app.use('/api/auth/usuarios',         adminWriteLimiter);
app.use('/api/auth/trocar-senha',     adminWriteLimiter);
app.use('/api/auth/esqueci-senha',    loginLimiter);
app.use('/api/auth/redefinir-senha',  loginLimiter);
app.use('/api/documentos',            uploadLimiter);
app.use('/api/anexos',                uploadLimiter);
app.use('/api/auth',      authRoutes);
app.use('/api/bo',        boRoutes);
app.use('/api/relatorio', relatorioRoutes);
app.use('/api/viatura',   viaturaRoutes);
app.use('/api/documentos', documentoRoutes);
app.use('/api/agentes',   agentesRoutes);
app.use('/api/anexos',    anexosRoutes);
app.use('/api/frota',     frotaRoutes);
app.use('/api/escala',    escalaRoutes);
app.use('/api/extras',    extrasRoutes);
app.use('/api/ferias',    feriasRoutes);

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
  // Em produção loga só a mensagem: o objeto de erro pode carregar a query e os
  // valores de parâmetros (dados pessoais) para o stdout do provedor (LGPD).
  console.error('❌ Erro:', process.env.NODE_ENV === 'production' ? err.message : err);
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