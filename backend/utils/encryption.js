const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';

if (!process.env.ENCRYPTION_KEY) {
  throw new Error('Variável de ambiente ENCRYPTION_KEY não definida. Defina-a antes de iniciar a aplicação.');
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function encriptar(texto) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
      iv
    );
    
    let encrypted = cipher.update(texto, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  } catch (err) {
    console.error('Erro ao encriptar:', err);
    return null;
  }
}

function desencriptar(textoCriptografado) {
  try {
    const parts = textoCriptografado.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
      iv
    );
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error('Erro ao desencriptar:', err);
    return null;
  }
}

module.exports = {
  encriptar,
  desencriptar
};
