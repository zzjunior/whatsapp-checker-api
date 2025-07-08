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
  async createApiToken(name, requestsLimit = 1000, expiresAt = null) {
    try {
      const token = uuidv4();
      const result = await this.db.query(
        'INSERT INTO api_tokens (token, name, requests_limit, expires_at) VALUES (?, ?, ?, ?)',
        [token, name, requestsLimit, expiresAt]
      );
      
      return {
        id: result.insertId,
        token,
        name,
        requests_limit: requestsLimit,
        expires_at: expiresAt
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
  async listApiTokens() {
    try {
      return await this.db.query(
        'SELECT id, token, name, requests_limit, requests_used, active, created_at, expires_at FROM api_tokens ORDER BY created_at DESC'
      );
    } catch (error) {
      throw error;
    }
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
}

module.exports = AuthService;
