module.exports = {
  // Configurações de conexão
  connectTimeoutMs: 60000, // 60 segundos
  defaultQueryTimeoutMs: 0, // Sem timeout para queries
  keepAliveIntervalMs: 10000, // 10 segundos
  
  // Configurações de reconexão
  maxReconnectAttempts: 10,
  reconnectDelay: 5000, // 5 segundos
  maxReconnectCooldown: 5 * 60 * 1000, // 5 minutos
  
  // Configurações do socket
  printQRInTerminal: false,
  generateHighQualityLinkPreview: false,
  syncFullHistory: false,
  markOnlineOnConnect: false,
  
  // Configurações do browser
  browser: ['WhatsApp Checker', 'Chrome', '1.0.0'],
  
  // Configurações de log
  logLevel: 'warn', // 'trace', 'debug', 'info', 'warn', 'error', 'fatal'
  
  // Configurações de cache
  cacheExpiration: 24 * 60 * 60 * 1000, // 24 horas
  
  // Rate limiting
  maxRequestsPerMinute: 60,
  
  // Timeouts específicos
  checkNumberTimeout: 30000, // 30 segundos para verificar número
  
  // Configurações de retry para operações específicas
  maxRetryAttempts: 3,
  retryDelay: 2000, // 2 segundos
};
