const mysql = require('mysql2/promise');

class Database {
  constructor() {
    this.connection = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
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

      // Configurar eventos de erro
      this.connection.on('error', (error) => {
        console.error('❌ Erro na conexão MySQL:', error);
        if (error.code === 'PROTOCOL_CONNECTION_LOST') {
          console.log('🔄 Conexão perdida, tentando reconectar...');
          this.handleDisconnection();
        }
      });
      
      console.log('✅ Conectado ao MySQL');
      this.reconnectAttempts = 0;
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
      
      this.handleDisconnection();
      throw error;
    }
  }

  async handleDisconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Máximo de ${this.maxReconnectAttempts} tentativas de reconexão MySQL atingido`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`🔄 Tentativa MySQL ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${delay/1000}s...`);
    
    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  async ensureConnection() {
    if (!this.connection) {
      await this.connect();
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
          role VARCHAR(20) DEFAULT 'user',
          whatsapp_instance_id INT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      // Tabela de instâncias WhatsApp
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS whatsapp_instances (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          name VARCHAR(100) NOT NULL,
          status ENUM('disconnected', 'connecting', 'connected') DEFAULT 'disconnected',
          auth_path VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Tabela de tokens API
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS api_tokens (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          whatsapp_instance_id INT NULL,
          token VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(100) NOT NULL,
          requests_limit INT DEFAULT 1000,
          requests_used INT DEFAULT 0,
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (whatsapp_instance_id) REFERENCES whatsapp_instances(id) ON DELETE SET NULL
        )
      `);

      // Tabela de logs de verificação
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS verification_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          token_id INT,
          user_id INT,
          phone_number VARCHAR(20) NOT NULL,
          is_valid BOOLEAN,
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (token_id) REFERENCES api_tokens(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
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
      await this.ensureConnection();
      const [results] = await this.connection.execute(sql, params);
      return results;
    } catch (error) {
      console.error('❌ Erro na query:', error);
      
      // Se for erro de conexão, tentar reconectar
      if (error.code === 'PROTOCOL_CONNECTION_LOST' || 
          error.code === 'ECONNRESET' || 
          error.message.includes('closed state')) {
        console.log('🔄 Tentando reconectar MySQL...');
        this.connection = null;
        await this.connect();
        
        // Tentar novamente
        const [results] = await this.connection.execute(sql, params);
        return results;
      }
      
      throw error;
    }
  }

  async close() {
    if (this.connection) {
      await this.connection.end();
      console.log('✅ Conexão MySQL fechada');
    }
  }

  // Alias para close
  async disconnect() {
    return this.close();
  }
}

module.exports = Database;
