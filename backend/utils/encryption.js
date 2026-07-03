const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recomendado para GCM (96 bits)
// Salt fixo: deriva a chave de cifragem a partir do segredo ENCRYPTION_KEY.
// Não é um salt de senha de usuário — serve só para fortalecer a derivação
// de uma chave de 32 bytes a partir de um segredo de tamanho arbitrário.
const SALT = 'gcm-bananeiras-encryption-salt-v1';

if (!process.env.ENCRYPTION_KEY) {
  throw new Error('Variável de ambiente ENCRYPTION_KEY não definida. Defina-a antes de iniciar a aplicação.');
}

const KEY = crypto.scryptSync(process.env.ENCRYPTION_KEY, SALT, 32);

// Formato do valor criptografado: iv:authTag:ciphertext (tudo em hex)
function encriptar(texto) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function desencriptar(textoCriptografado) {
  const [ivHex, authTagHex, encryptedHex] = String(textoCriptografado).split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Formato de dado criptografado inválido.');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// Descriptografa com fallback para dados legados (gravados em texto puro
// antes desta cifragem entrar em uso). Nunca lança — usar apenas em leitura.
function desencriptarComFallback(valor) {
  if (!valor) return valor;
  try {
    return desencriptar(valor);
  } catch {
    return valor;
  }
}

module.exports = {
  encriptar,
  desencriptar,
  desencriptarComFallback,
};
