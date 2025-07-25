const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

class AuthService {
  constructor(database) {
    this.db = database;
    this.jwtSecret = process.env.JWT_SECRET || 'seu-jwt-secret-super-seguro-aqui';
  }

  // Criar usuário admin
  async createUser(username, password, role = 'admin') {
    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      const result = await this.db.query(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username, hashedPassword, role]
      );
      return { id: result.insertId, username, role };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Usuário já existe');
      }
      throw error;
    }
  }

  // Login
  async login(username, password) {
    try {
      const users = await this.db.query(
        'SELECT * FROM users WHERE username = ?',
        [username]
      );

      if (users.length === 0) {
        throw new Error('Usuário não encontrado');
      }

      const user = users[0];
      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        throw new Error('Senha incorreta');
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        this.jwtSecret,
        { expiresIn: '24h' }
      );

      return { token, user: { id: user.id, username: user.username, role: user.role } };
    } catch (error) {
      throw error;
    }
  }

  // Verificar token JWT
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Token inválido');
    }
  }

  // Criar token API
  async createApiToken(name, requestsLimit = 1000, whatsappInstanceId = null, userId = null) {
    try {
      const token = uuidv4();
      const result = await this.db.query(
        'INSERT INTO api_tokens (token, name, requests_limit, whatsapp_instance_id, user_id) VALUES (?, ?, ?, ?, ?)',
        [token, name, requestsLimit, whatsappInstanceId, userId]
      );
      
      return {
        id: result.insertId,
        token,
        name,
        requests_limit: requestsLimit,
        whatsapp_instance_id: whatsappInstanceId,
        user_id: userId
      };
    } catch (error) {
      throw error;
    }
  }

  // Verificar token API
  async verifyApiToken(token) {
    try {
      const tokens = await this.db.query(
        'SELECT * FROM api_tokens WHERE token = ? AND active = TRUE',
        [token]
      );

      if (tokens.length === 0) {
        throw new Error('Token inválido');
      }

      const apiToken = tokens[0];

      // Verificar se expirou
      if (apiToken.expires_at && new Date() > new Date(apiToken.expires_at)) {
        throw new Error('Token expirado');
      }

      // Verificar limite de requests
      if (apiToken.requests_used >= apiToken.requests_limit) {
        throw new Error('Limite de requests excedido');
      }

      return apiToken;
    } catch (error) {
      throw error;
    }
  }

  // Incrementar uso do token
  async incrementTokenUsage(tokenId) {
    try {
      await this.db.query(
        'UPDATE api_tokens SET requests_used = requests_used + 1 WHERE id = ?',
        [tokenId]
      );
    } catch (error) {
      console.error('Erro ao incrementar uso do token:', error);
    }
  }

  // Listar tokens API
  async listApiTokens(userId = null) {
    try {
      if (userId) {
        return await this.db.query(`
          SELECT 
            t.id, 
            t.token, 
            t.name, 
            t.requests_limit, 
            t.requests_used, 
            t.active, 
            t.created_at, 
            t.expires_at,
            t.whatsapp_instance_id,
            i.name as instance_name,
            i.status as instance_status
          FROM api_tokens t
          LEFT JOIN whatsapp_instances i ON t.whatsapp_instance_id = i.id
          WHERE t.user_id = ? 
          ORDER BY t.created_at DESC
        `, [userId]);
      }
      // Se não especificar userId, lista todos (para admin)
      return await this.db.query(`
        SELECT 
          t.id, 
          t.token, 
          t.name, 
          t.requests_limit, 
          t.requests_used, 
          t.active, 
          t.created_at, 
          t.expires_at,
          t.whatsapp_instance_id,
          i.name as instance_name,
          i.status as instance_status,
          u.username as user_name
        FROM api_tokens t
        LEFT JOIN whatsapp_instances i ON t.whatsapp_instance_id = i.id
        LEFT JOIN users u ON t.user_id = u.id
        ORDER BY t.created_at DESC
      `);
    } catch (error) {
      throw error;
    }
  }

  // Alias para compatibilidade
  async getUserTokens(userId) {
    return this.listApiTokens(userId);
  }

  // Desativar token API
  async deactivateApiToken(tokenId) {
    try {
      await this.db.query(
        'UPDATE api_tokens SET active = FALSE WHERE id = ?',
        [tokenId]
      );
    } catch (error) {
      throw error;
    }
  }

  // Validar token para WebSocket
  async validateToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      
      // Verificar se usuário ainda existe
      const users = await this.db.query(
        'SELECT id, username, role FROM users WHERE id = ?',
        [decoded.id]
      );

      if (users.length === 0) {
        throw new Error('Usuário não encontrado');
      }

      return users[0];
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  }
}

module.exports = AuthService;
