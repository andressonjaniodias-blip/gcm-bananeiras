const express = require('express');
const router = express.Router();
const boController = require('../controllers/boController');
const verificarToken = require('../middleware/auth');
const { validarBO } = require('../utils/validation');

// ✅ TODAS as rotas de BO requerem autenticação
router.post('/', verificarToken, validarBO, boController.criarBO);
router.get('/', verificarToken, boController.listarBOs);
router.get('/:id', verificarToken, boController.consultarBO);
router.get('/:id/pdf', verificarToken, boController.exportarPDF);

module.exports = router;
