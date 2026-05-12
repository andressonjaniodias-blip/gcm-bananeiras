const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Simulando um banco de usuários (em produção, usar banco de dados)
const usuariosValidos = [
  { usuario: 'admin', senha: 'super_senha_segura_123' }
];

router.post('/login', (req, res) => {
  try {
    const { usuario, senha } = req.body;

    // Validação básica
    if (!usuario || !senha) {
      return res.status(400).json({ 
        error: 'Usuário e senha são obrigatórios' 
      });
    }

    // Validar credenciais (em produção, validar contra bcrypt do BD)
    const usuarioEncontrado = usuariosValidos.find(
      u => u.usuario === usuario && u.senha === senha
    );

    if (!usuarioEncontrado) {
      // ✅ Não informar qual campo está errado (segurança)
      return res.status(401).json({ 
        error: 'Usuário ou senha inválidos' 
      });
    }

    // Gerar JWT
    const token = jwt.sign(
      { 
        usuario: usuarioEncontrado.usuario,
        iat: Date.now()
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ 
      message: 'Login realizado com sucesso',
      token: token,
      expiresIn: '8h'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
