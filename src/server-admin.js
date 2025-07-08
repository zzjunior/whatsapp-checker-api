const express = require('express');
const rateLimit = require('express-rate-limit');
const Database = require('./database/Database');
const AuthService = require('./services/AuthService');
const VerificationService = require('./services/VerificationService');
const WhatsAppChecker = require('./whatsapp/WhatsAppChecker');

class WhatsAppCheckerAPI {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    
    // Inicializar serviços
    this.database = new Database();
    this.authService = new AuthService(this.database);
    this.whatsappChecker = new WhatsAppChecker();
    this.verificationService = new VerificationService(this.database, this.whatsappChecker);
    
    // Estado do WhatsApp
    this.whatsappConnected = false;
    this.currentQRCode = null;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Rate limiting
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: { error: 'Muitas requisições' }
    });

    this.app.use('/api/', apiLimiter);

    this.app.use(express.static(require('path').join(__dirname, '../public')));
    this.app.use('/assets', express.static(require('path').join(__dirname, '../public/assets')));
  }

  setupRoutes() {
    // API routes
    this.app.get('/', (req, res) => {
      res.json({
        message: 'WhatsApp Checker API',
        version: '1.0.0',
        status: 'online',
        whatsapp_connected: this.whatsappConnected
      });
    });

    this.app.post('/api/check', this.middlewareAuth.bind(this), this.checkNumber.bind(this));
    this.app.post('/admin/login', this.adminLogin.bind(this));
    this.app.get('/admin/status', this.middlewareAdminAuth.bind(this), this.getAdminStatus.bind(this));
    this.app.post('/admin/connect-whatsapp', this.middlewareAdminAuth.bind(this), this.connectWhatsApp.bind(this));
    this.app.get('/admin/qr', this.middlewareAdminAuth.bind(this), this.getQRCode.bind(this));
    this.app.post('/admin/tokens', this.middlewareAdminAuth.bind(this), this.createToken.bind(this));
    this.app.get('/admin/tokens', this.middlewareAdminAuth.bind(this), this.listTokens.bind(this));
    this.app.post('/admin/change-password', this.middlewareAdminAuth.bind(this), this.changePassword.bind(this));
    this.app.post('/admin/users', this.middlewareAdminAuth.bind(this), this.onlyAdmin.bind(this), this.addUser.bind(this));
    this.app.get('/admin/users', this.middlewareAdminAuth.bind(this), this.onlyAdmin.bind(this), this.listUsers.bind(this));
    this.app.delete('/admin/users/:id', this.middlewareAdminAuth.bind(this), this.onlyAdmin.bind(this), this.deleteUser.bind(this));

    // Admin page
    this.app.get('/admin', (req, res) => {
      res.send(this.getAdminHTML());
    });
  }

  // Middlewares
  async middlewareAuth(req, res, next) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token necessário' });
      const apiToken = await this.authService.verifyApiToken(token);
      req.apiToken = apiToken;
      next();
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  }

  async middlewareAdminAuth(req, res, next) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Token necessário' });
      const user = this.authService.verifyToken(token);
      req.user = user;
      next();
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  }

  // Handlers
  async checkNumber(req, res) {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'Número obrigatório' });

      const result = await this.verificationService.checkNumber(phone, req.apiToken.id);
      await this.authService.incrementTokenUsage(req.apiToken.id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async adminLogin(req, res) {
    try {
      const { username, password } = req.body;
      const result = await this.authService.login(username, password);
      res.json(result);
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  }

  async getAdminStatus(req, res) {
    try {
      // Garante que user_type, whatsapp_connected e username sempre sejam retornados
      res.json({
        whatsapp_connected: this.whatsappConnected,
        current_qr: this.currentQRCode,
        user_type: req.user?.role || 'common', // fallback para common
        username: req.user?.username || null
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async connectWhatsApp(req, res) {
    try {
      await this.whatsappChecker.connect();
      res.json({ message: 'Conectando...' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getQRCode(req, res) {
    res.json({ 
      qr_code: this.currentQRCode,
      connected: this.whatsappConnected 
    });
  }

  async createToken(req, res) {
    try {
      const { name, requests_limit = 1000 } = req.body;
      const token = await this.authService.createApiToken(name, requests_limit);
      res.json(token);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async listTokens(req, res) {
    try {
      const tokens = await this.authService.listApiTokens();
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;
      // Busca usuário
      const users = await this.database.query('SELECT * FROM users WHERE id = ?', [userId]);
      if (!users.length) return res.status(404).json({ error: 'Usuário não encontrado' });
      const user = users[0];
      // Verifica senha atual
      const bcrypt = require('bcryptjs');
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) return res.status(401).json({ error: 'Senha atual incorreta' });
      // Atualiza senha
      const hashed = await bcrypt.hash(newPassword, 12);
      await this.database.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
      res.json({ message: 'Senha alterada com sucesso' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async onlyAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
    next();
  }
  async addUser(req, res) {
    try {
      const { username, password, user_type } = req.body;
      if (!username || !password || !user_type) return res.status(400).json({ error: 'Dados obrigatórios' });
      const role = user_type === 'admin' ? 'admin' : 'common';
      const bcrypt = require('bcryptjs');
      const hashed = await bcrypt.hash(password, 12);
      await this.database.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashed, role]);
      res.json({ message: 'Usuário cadastrado' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  async listUsers(req, res) {
    try {
      const users = await this.database.query('SELECT id, username, role as user_type FROM users');
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  async deleteUser(req, res) {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'ID obrigatório' });
      await this.database.query('DELETE FROM users WHERE id = ?', [id]);
      res.json({ message: 'Usuário excluído' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async start() {
    try {
      await this.database.connect();
      
      // Criar admin padrão
      try {
        await this.authService.createUser('admin', 'admin123');
        console.log('👤 Admin: admin/admin123');
      } catch (error) {
        console.log('👤 Admin existe');
      }

      // WhatsApp events
      this.whatsappChecker.on('qr', (qr) => {
        this.currentQRCode = qr;
        console.log('📱 QR disponível');
      });

      this.whatsappChecker.on('ready', () => {
        this.whatsappConnected = true;
        console.log('✅ WhatsApp OK');
      });

      this.whatsappChecker.on('disconnected', () => {
        this.whatsappConnected = false;
        console.log('❌ WhatsApp OFF');
      });

      this.app.listen(this.port, () => {
        console.log(`🚀 http://localhost:${this.port}`);
        console.log(`🔧 http://localhost:${this.port}/admin`);
      });

    } catch (error) {
      console.error('❌', error);
      process.exit(1);
    }
  }
}

module.exports = WhatsAppCheckerAPI;
