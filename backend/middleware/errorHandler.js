function errorHandler(err, req, res, next) {
  const timestamp = new Date().toISOString();
  const requestId = req.id || 'unknown';
  
  console.error(`[${timestamp}] ERROR [${requestId}]:`, err);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';

  res.status(statusCode).json({
    error: message,
    requestId: requestId,
    timestamp: timestamp
  });
}

module.exports = errorHandler;
