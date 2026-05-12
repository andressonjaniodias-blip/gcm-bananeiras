const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function requestLogger(req, res, next) {
  const requestId = uuidv4();
  req.id = requestId;
  
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${requestId} ${req.method} ${req.path}`;
  
  fs.appendFileSync(
    path.join(logsDir, 'app.log'),
    logMsg + '\n'
  );
  
  next();
}

module.exports = requestLogger;
