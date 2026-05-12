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

// Validar CPF (formato básico)
function validarCPF(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');
  return cpfLimpo.length === 11;
}

// Validar RG (formato básico)
function validarRG(rg) {
  const rgLimpo = rg.replace(/\D/g, '');
  return rgLimpo.length >= 7 && rgLimpo.length <= 9;
}

module.exports = {
  validarBO,
  validarCPF,
  validarRG
};
