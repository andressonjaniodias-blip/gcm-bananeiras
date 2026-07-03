const { validarCPF, validarRG, validarSenha } = require('../utils/validation');

describe('validarCPF', () => {
  test('aceita CPF válido com dígitos verificadores corretos', () => {
    expect(validarCPF('529.982.247-25')).toBe(true);
    expect(validarCPF('52998224725')).toBe(true);
  });

  test('rejeita CPF com dígito verificador incorreto', () => {
    expect(validarCPF('529.982.247-26')).toBe(false);
  });

  test('rejeita CPF com todos os dígitos iguais', () => {
    expect(validarCPF('111.111.111-11')).toBe(false);
  });

  test('rejeita CPF com tamanho incorreto', () => {
    expect(validarCPF('123')).toBe(false);
  });
});

describe('validarRG', () => {
  test('aceita RG com 7 a 9 dígitos', () => {
    expect(validarRG('1234567')).toBe(true);
    expect(validarRG('123456789')).toBe(true);
  });

  test('rejeita RG curto ou longo demais', () => {
    expect(validarRG('123')).toBe(false);
    expect(validarRG('1234567890')).toBe(false);
  });
});

describe('validarSenha (política de senha forte)', () => {
  test('aceita senha que cumpre todos os requisitos', () => {
    expect(validarSenha('Senha123!')).toBeNull();
  });

  test('rejeita senha curta', () => {
    expect(validarSenha('Ab1!')).toMatch(/8 caracteres/);
  });

  test('rejeita senha sem maiúscula', () => {
    expect(validarSenha('senha123!')).toMatch(/maiúscula/);
  });

  test('rejeita senha sem número', () => {
    expect(validarSenha('Senhaaaa!')).toMatch(/número/);
  });

  test('rejeita senha sem caractere especial', () => {
    expect(validarSenha('Senha1234')).toMatch(/especial/);
  });
});
