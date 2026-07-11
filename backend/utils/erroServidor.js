/**
 * Envia resposta 500 ocultando detalhes internos em produção.
 */
function erroServidor(res, err) {
  const producao = process.env.NODE_ENV === 'production';
  // Em produção loga só a mensagem: o objeto de erro (ex.: erro do Postgres) pode
  // carregar a query e os valores de parâmetros — dados pessoais — para o stdout
  // do provedor de nuvem, criando cópia de PII não cifrada fora da auditoria (LGPD).
  console.error('❌ Erro interno:', producao ? (err?.message || String(err)) : err);
  res.status(500).json({ error: producao ? 'Erro interno do servidor.' : (err?.message || String(err)) });
}

module.exports = erroServidor;
