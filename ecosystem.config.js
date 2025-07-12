module.exports = {
  apps: [{
    name: 'whatsapp-checker-api',
    script: 'src/start-admin.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    // Configurações para preservar sessões durante restart
    kill_timeout: 10000,     // 10 segundos para graceful shutdown
    wait_ready: true,        // Aguarda aplicação estar pronta
    listen_timeout: 10000,   // Timeout para listen
    
    // Logs
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Restart strategies para evitar perda de sessão
    max_restarts: 5,
    min_uptime: '10s',
    
    // Evitar restart em horários de pico
    cron_restart: '0 4 * * *', // Restart diário às 4:00 AM
    
    // Health check
    health_check_url: 'http://localhost:3000/health',
    health_check_grace_period: 30000
  }]
};
