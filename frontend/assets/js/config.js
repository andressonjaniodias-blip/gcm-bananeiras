// Detectar se está em desenvolvimento ou produção
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : `https://${window.location.hostname}`;

console.log('📡 API Base URL:', API_BASE_URL);