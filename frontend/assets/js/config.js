// Detectar se está em desenvolvimento ou produção
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : `https://${window.location.hostname}`;

console.log('📡 API Base URL:', API_BASE_URL);

// ── Google Maps API Key (Geocoding API) ──────────────────────────────────────
// Obtenha em: console.cloud.google.com → APIs e Serviços → Geocoding API
// Restrinja a chave por "Referenciadores HTTP" no console para evitar uso indevido
const GOOGLE_MAPS_KEY = 'AIzaSyAnBrJLKo0hkx0UjgT2nj_aazuUz1-QDsU';

// ── CSRF: injeta X-CSRF-Token automaticamente em requisições mutantes ─────────
const _CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function _getCsrfToken() {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith('csrfToken='))
    ?.split('=')[1] || '';
}

const _originalFetch = window.fetch.bind(window);
window.fetch = function (input, init = {}) {
  const method = (init.method || 'GET').toUpperCase();
  if (!_CSRF_SAFE_METHODS.has(method)) {
    init.headers = Object.assign({}, init.headers, {
      'X-CSRF-Token': _getCsrfToken(),
    });
  }
  return _originalFetch(input, init);
};