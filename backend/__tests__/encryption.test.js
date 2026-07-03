process.env.ENCRYPTION_KEY = 'chave-de-teste-nao-usar-em-producao';
const { encriptar, desencriptar, desencriptarComFallback } = require('../utils/encryption');

describe('encryption (AES-256-GCM)', () => {
  test('encripta e desencripta mantendo o texto original', () => {
    const original = JSON.stringify({ cpf: '529.982.247-25', nome: 'Fulano' });
    const cifrado = encriptar(original);
    expect(cifrado).not.toBe(original);
    expect(desencriptar(cifrado)).toBe(original);
  });

  test('gera IV diferente a cada chamada (mesmo texto cifra diferente)', () => {
    const a = encriptar('mesmo-texto');
    const b = encriptar('mesmo-texto');
    expect(a).not.toBe(b);
  });

  test('rejeita valor cifrado adulterado (autenticação do GCM)', () => {
    const cifrado = encriptar('dado sensível');
    const partes = cifrado.split(':');
    partes[2] = partes[2].slice(0, -2) + (partes[2].slice(-2) === '00' ? '11' : '00');
    expect(() => desencriptar(partes.join(':'))).toThrow();
  });

  test('desencriptarComFallback retorna texto legado (não cifrado) sem lançar erro', () => {
    const textoLegado = '{"nome":"dado gravado antes da cifragem"}';
    expect(desencriptarComFallback(textoLegado)).toBe(textoLegado);
  });

  test('desencriptarComFallback funciona normalmente com dado cifrado', () => {
    const cifrado = encriptar('valor');
    expect(desencriptarComFallback(cifrado)).toBe('valor');
  });
});
