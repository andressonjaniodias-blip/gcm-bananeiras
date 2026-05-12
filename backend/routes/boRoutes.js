// backend/routes/boRoutes.js
const express = require('express');
const router = express.Router();
const boController = require('../controllers/boController');

// Criar novo BO
router.post('/', boController.criarBO);

// Listar todos os BOs
router.get('/', boController.listarBOs);

// Consultar BO por ID
router.get('/:id', boController.consultarBO);

// Exportar BO para PDF
router.get('/:id/pdf', boController.exportarPDF);

module.exports = router;
