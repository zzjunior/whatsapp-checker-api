const mysql = require('mysql2/promise');

class Database {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      console.log('🔄 Tentando conectar ao MySQL...');
      console.log(`📍 Host: ${process.env.DB_HOST}`);
      console.log(`📍 Port: ${process.env.DB_PORT}`);
      console.log(`📍 Database: ${process.env.DB_DATABASE}`);
      console.log(`📍 User: ${process.env.DB_USERNAME}`);
      
      this.connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || 'whatsapp_checker',
        port: parseInt(process.env.DB_PORT) || 3306,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        connectTimeout: 60000
      });
      
      console.log('✅ Conectado ao MySQL');
      await this.createTables();
    } catch (error) {
      console.error('❌ Erro ao conectar ao MySQL:', error.message);
      if (error.code === 'ECONNREFUSED') {
        console.error('💡 Verifique se:');
        console.error('   - O servidor MySQL está rodando');
        console.error('   - O host e porta estão corretos');
        console.error('   - Não há firewall bloqueando a conexão');
      } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('💡 Erro de autenticação - verifique usuário/senha');
      } else if (error.code === 'ER_BAD_DB_ERROR') {
        console.error('💡 Database não existe - verifique o nome do banco');
      }
      throw error;
    }
  }

  async createTables() {
    try {
      // Tabela de usuários admin
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(20) DEFAULT 'admin',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      // Tabela de tokens API
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS api_tokens (
          id INT AUTO_INCREMENT PRIMARY KEY,
          token VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(100) NOT NULL,
          requests_limit INT DEFAULT 1000,
          requests_used INT DEFAULT 0,
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NULL
        )
      `);

      // Tabela de logs de verificação
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS verification_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          token_id INT,
          phone_number VARCHAR(20) NOT NULL,
          is_valid BOOLEAN,
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (token_id) REFERENCES api_tokens(id)
        )
      `);

      // Tabela de cache de números válidos
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS phone_cache (
          id INT AUTO_INCREMENT PRIMARY KEY,
          phone_number VARCHAR(20) UNIQUE NOT NULL,
          is_valid BOOLEAN NOT NULL,
          whatsapp_jid VARCHAR(50),
          last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          INDEX idx_phone (phone_number),
          INDEX idx_expires (expires_at)
        )
      `);

      console.log('✅ Tabelas criadas/verificadas');
    } catch (error) {
      console.error('❌ Erro ao criar tabelas:', error);
      throw error;
    }
  }

  async query(sql, params = []) {
    try {
      const [results] = await this.connection.execute(sql, params);
      return results;
    } catch (error) {
      console.error('❌ Erro na query:', error);
      throw error;
    }
  }

  async close() {
    if (this.connection) {
      await this.connection.end();
      console.log('✅ Conexão MySQL fechada');
    }
  }
}

module.exports = Database;
