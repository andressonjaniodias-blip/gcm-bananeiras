const { body, validationResult } = require('express-validator');

const validarBO = [
  body('dadosSolicitacao').notEmpty().withMessage('Dados da solicitação são obrigatórios'),
  body('dadosOcorrencia').notEmpty().withMessage('Dados da ocorrência são obrigatórios'),
  body('vitimas').isArray().withMessage('Vítimas deve ser um array'),
  body('suspeitos').isArray().withMessage('Suspeitos deve ser um array'),
  body('relato').notEmpty().withMessage('Relato é obrigatório'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

// Validar CPF com dígito verificador
function validarCPF(cpf) {
  const n = cpf.replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(n[i]) * (10 - i);
  let r = (soma * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(n[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(n[i]) * (11 - i);
  r = (soma * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(n[10]);
}

// Validar RG (formato básico)
function validarRG(rg) {
  const rgLimpo = rg.replace(/\D/g, '');
  return rgLimpo.length >= 7 && rgLimpo.length <= 9;
}

// Validar política de senha forte; retorna mensagem de erro ou null se válida
function validarSenha(senha) {
  if (!senha || senha.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (!/[A-Z]/.test(senha))       return 'A senha deve conter pelo menos uma letra maiúscula.';
  if (!/[0-9]/.test(senha))       return 'A senha deve conter pelo menos um número.';
  if (!/[^A-Za-z0-9]/.test(senha)) return 'A senha deve conter pelo menos um caractere especial (!@#$%...).';
  return null;
}

module.exports = {
  validarBO,
  validarCPF,
  validarRG,
  validarSenha
};
