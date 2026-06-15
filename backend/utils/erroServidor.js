/**
 * Envia resposta 500 ocultando detalhes internos em produção.
 */
function erroServidor(res, err) {
  console.error('❌ Erro interno:', err);
  const mensagem = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor.'
    : (err?.message || String(err));
  res.status(500).json({ error: mensagem });
}

module.exports = erroServidor;
