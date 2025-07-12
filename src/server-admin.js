const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const rateLimit = require('express-rate-limit');
const Database = require('./database/Database');
const AuthService = require('./services/AuthService');
const VerificationService = require('./services/VerificationService');
const WhatsAppChecker = require('./whatsapp/WhatsAppChecker');
const WhatsAppManager = require('./whatsapp/WhatsAppManager');

class WhatsAppCheckerAPI {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    this.port = process.env.PORT || 3000;
    
    // Inicializar serviços
    this.database = new Database();
    this.authService = new AuthService(this.database);
    this.whatsappChecker = new WhatsAppChecker();
    this.whatsappManager = new WhatsAppManager(this.database);
    this.verificationService = new VerificationService(this.database, this.whatsappManager);
    
    // Estado do WhatsApp (mantido para compatibilidade com admin-panel.js antigo)
    this.whatsappConnected = false;
    this.currentQRCode = null;
    
    this.setupWebSocket();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Configurar trust proxy para Railway (mais específico)
    this.app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
    
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Rate limiting configurado para funcionar com proxy
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: { error: 'Muitas requisições' },
      standardHeaders: true,
      legacyHeaders: false,
      // Removido trustProxy pois já está configurado no app.set
      skip: (req) => {
        // Pular rate limiting para health check
        return req.path === '/health';
      }
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
        whatsapp_connected: false // Deprecated - use /api/status for real status
      });
    });

    this.app.post('/api/check', this.middlewareAuth.bind(this), this.checkNumber.bind(this));
    this.app.get('/api/status', this.getWhatsAppStatus.bind(this));
    this.app.post('/admin/login', this.adminLogin.bind(this));
    this.app.get('/admin/status', this.middlewareAdminAuth.bind(this), this.getAdminStatus.bind(this));
    this.app.get('/admin/stats', this.middlewareAdminAuth.bind(this), this.getStats.bind(this));
    
    // WhatsApp Instances
    this.app.get('/admin/instances', this.middlewareAdminAuth.bind(this), this.getUserInstances.bind(this));
    this.app.post('/admin/instances', this.middlewareAdminAuth.bind(this), this.createUserInstance.bind(this));
    this.app.delete('/admin/instances/:id', this.middlewareAdminAuth.bind(this), this.deleteUserInstance.bind(this));
    this.app.post('/admin/instances/:id/connect', this.middlewareAdminAuth.bind(this), this.connectUserInstance.bind(this));
    this.app.post('/admin/instances/:id/disconnect', this.middlewareAdminAuth.bind(this), this.disconnectUserInstance.bind(this));
    
    // Legacy WhatsApp (backward compatibility)
    this.app.post('/admin/connect-whatsapp', this.middlewareAdminAuth.bind(this), this.connectWhatsApp.bind(this));
    this.app.get('/admin/qr', this.middlewareAdminAuth.bind(this), this.getQRCode.bind(this));
    
    // Tokens
    this.app.post('/admin/tokens', this.middlewareAdminAuth.bind(this), this.createToken.bind(this));
    this.app.get('/admin/tokens', this.middlewareAdminAuth.bind(this), this.listTokens.bind(this));
    this.app.delete('/admin/tokens/:id', this.middlewareAdminAuth.bind(this), this.deleteToken.bind(this));
    
    // User management
    this.app.post('/admin/change-password', this.middlewareAdminAuth.bind(this), this.changePassword.bind(this));
    this.app.post('/admin/users', this.middlewareAdminAuth.bind(this), this.onlyAdmin.bind(this), this.addUser.bind(this));
    this.app.get('/admin/users', this.middlewareAdminAuth.bind(this), this.onlyAdmin.bind(this), this.listUsers.bind(this));
    this.app.put('/admin/users/:id', this.middlewareAdminAuth.bind(this), this.onlyAdmin.bind(this), this.updateUser.bind(this));
    this.app.delete('/admin/users/:id', this.middlewareAdminAuth.bind(this), this.onlyAdmin.bind(this), this.deleteUser.bind(this));

    // Static files and pages
    this.app.use('/admin/assets', express.static('public/assets'));
    this.app.get('/admin/dashboard', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/dashboard.html'));
    });
    this.app.get('/admin', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/login.html'));
    });
    
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const stats = this.whatsappManager.getInstancesStats();
        const dbStatus = await this.database.query('SELECT 1 as alive');
        
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          instances: stats,
          database: dbStatus.length > 0 ? 'connected' : 'disconnected',
          whatsapp_legacy: false // Deprecated - use instances array for real status
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Debug endpoint para Railway
    this.app.get('/debug', (req, res) => {
      res.json({
        headers: req.headers,
        ip: req.ip,
        ips: req.ips,
        protocol: req.protocol,
        secure: req.secure,
        originalUrl: req.originalUrl,
        baseUrl: req.baseUrl,
        path: req.path,
        trust_proxy: this.app.get('trust proxy'),
        env: {
          NODE_ENV: process.env.NODE_ENV,
          RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT
        }
      });
    });
    
    // Debug endpoint para verificar estado das instâncias (com token API)
    this.app.get('/api/debug/instances', this.middlewareAuth.bind(this), this.debugInstancesAPI.bind(this));
    
    // Debug endpoint para verificar estado das instâncias (admin)
    this.app.get('/debug/instances', this.middlewareAdminAuth.bind(this), this.debugInstances.bind(this));
    
    // Endpoint para forçar reconexão de instância
    this.app.post('/api/reconnect', this.middlewareAuth.bind(this), this.forceReconnect.bind(this));
    
    // Endpoint para verificar arquivos de auth
    this.app.get('/api/check-auth', this.middlewareAuth.bind(this), this.checkAuthFiles.bind(this));
    
    // Endpoint para restaurar arquivos de auth do backup
    this.app.post('/api/restore-auth', this.middlewareAuth.bind(this), this.restoreAuthFiles.bind(this));
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
      const { phone, force_check } = req.body;
      if (!phone) return res.status(400).json({ error: 'Número obrigatório' });

      const result = await this.verificationService.checkNumber(
        phone, 
        req.apiToken.id, 
        req.ip, 
        req.get('User-Agent'),
        force_check || false
      );
      await this.authService.incrementTokenUsage(req.apiToken.id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getWhatsAppStatus(req, res) {
    // Se tiver token API, verificar status da instância específica
    if (req.apiToken && req.apiToken.id) {
      try {
        const instance = await this.whatsappManager.getInstanceByToken(req.apiToken.id);
        if (instance) {
          const connected = instance.isConnected();
          return res.json({
            connected,
            status: connected ? 'online' : 'offline',
            message: connected ? 'WhatsApp conectado' : 'WhatsApp desconectado',
            instance_id: instance.id,
            mode: 'token_specific'
          });
        } else {
          return res.json({
            connected: false,
            status: 'offline',
            message: 'Token não possui instância associada ou instância não encontrada',
            instance_id: null,
            mode: 'token_specific'
          });
        }
      } catch (error) {
        console.error('Erro ao verificar status da instância:', error);
        return res.json({
          connected: false,
          status: 'error',
          message: 'Erro ao verificar status da instância: ' + error.message,
          instance_id: null,
          mode: 'token_specific'
        });
      }
    }

    // Status geral (para casos sem token ou admin)
    try {
      const instances = this.whatsappManager.getAllInstances();
      const connectedInstances = instances.filter(i => i.isConnected()).length;
      const totalInstances = instances.length;

      res.json({
        connected: connectedInstances > 0,
        status: connectedInstances > 0 ? 'online' : 'offline',
        message: `${connectedInstances}/${totalInstances} instâncias conectadas`,
        total_instances: totalInstances,
        connected_instances: connectedInstances,
        mode: 'general'
      });
    } catch (error) {
      res.json({
        connected: false,
        status: 'error',
        message: 'Erro ao verificar status geral: ' + error.message,
        total_instances: 0,
        connected_instances: 0,
        mode: 'general'
      });
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
      // Verificar status das instâncias do usuário
      const userInstances = await this.whatsappManager.getUserInstances(req.user.id);
      const connectedInstances = userInstances.filter(i => i.status === 'connected').length;
      const hasConnectedInstances = connectedInstances > 0;
      
      res.json({
        whatsapp_connected: hasConnectedInstances,
        current_qr: this.currentQRCode, // Manter por compatibilidade
        user_type: req.user?.role || 'common',
        username: req.user?.username || null,
        instances_status: {
          total: userInstances.length,
          connected: connectedInstances,
          disconnected: userInstances.length - connectedInstances
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async connectWhatsApp(req, res) {
    try {
      // Este endpoint é mantido para compatibilidade com admin-panel.js antigo
      // Para novos projetos, use o endpoint /admin/instances/connect
      res.json({ 
        message: 'Este endpoint está obsoleto. Use /admin/instances/connect para conectar instâncias específicas.',
        deprecated: true 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getQRCode(req, res) {
    try {
      // Este endpoint é mantido para compatibilidade com admin-panel.js antigo
      // Para novos projetos, use o endpoint /admin/instances/{id}/qr
      res.json({ 
        qr_code: null,
        connected: false,
        message: 'Este endpoint está obsoleto. Use /admin/instances/{id}/qr para obter QR de instâncias específicas.',
        deprecated: true 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async createToken(req, res) {
    try {
      const { name, requests_limit = 1000, whatsapp_instance_id } = req.body;
      
      // Verificar se a instância pertence ao usuário
      if (whatsapp_instance_id) {
        const instances = await this.database.query(
          'SELECT id FROM whatsapp_instances WHERE id = ? AND user_id = ?',
          [whatsapp_instance_id, req.user.id]
        );
        if (instances.length === 0) {
          return res.status(400).json({ error: 'Instância não encontrada ou não pertence ao usuário' });
        }
      }
      
      const token = await this.authService.createApiToken(name, requests_limit, whatsapp_instance_id, req.user.id);
      res.json(token);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async listTokens(req, res) {
    try {
      const tokens = await this.authService.listApiTokens(req.user.id);
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteToken(req, res) {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'ID obrigatório' });
      
      // Verificar se o token pertence ao usuário
      const tokens = await this.database.query('SELECT * FROM api_tokens WHERE id = ? AND user_id = ?', [id, req.user.id]);
      if (tokens.length === 0) {
        return res.status(404).json({ error: 'Token não encontrado' });
      }
      
      await this.database.query('DELETE FROM api_tokens WHERE id = ?', [id]);
      res.json({ message: 'Token excluído com sucesso' });
    } catch (error) {
      console.error('❌ Erro ao excluir token:', error);
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
      res.json({ message: 'Usuário criado com sucesso' });
    } catch (error) {
      console.error('❌ Erro ao criar usuário:', error);
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
      
      // Não permitir deletar o próprio usuário
      if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
      }
      
      await this.database.query('DELETE FROM users WHERE id = ?', [id]);
      res.json({ message: 'Usuário excluído com sucesso' });
    } catch (error) {
      console.error('❌ Erro ao excluir usuário:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { username, user_type, password } = req.body;
      
      if (!id) return res.status(400).json({ error: 'ID obrigatório' });
      if (!username || !user_type) return res.status(400).json({ error: 'Username e tipo são obrigatórios' });
      
      const role = user_type === 'admin' ? 'admin' : 'common';
      
      if (password && password.trim() !== '') {
        // Se senha foi fornecida, atualizar com senha
        const bcrypt = require('bcryptjs');
        const hashed = await bcrypt.hash(password, 12);
        await this.database.query(
          'UPDATE users SET username = ?, role = ?, password = ? WHERE id = ?',
          [username, role, hashed, id]
        );
      } else {
        // Se senha não foi fornecida, atualizar apenas username e role
        await this.database.query(
          'UPDATE users SET username = ?, role = ? WHERE id = ?',
          [username, role, id]
        );
      }
      
      res.json({ message: 'Usuário atualizado com sucesso' });
    } catch (error) {
      console.error('❌ Erro ao atualizar usuário:', error);
      res.status(500).json({ error: error.message });
    }
  }

  getAdminHTML() {
    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>WhatsApp Checker - Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>body { background: #f5f5f5; }</style>
</head>
<body>
  <div id="root"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  <script src="/assets/admin-panel.js"></script>
</body>
</html>`;
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

      // WhatsApp events (mantido para compatibilidade com admin-panel.js antigo)
      this.whatsappChecker.on('qr', (qr) => {
        this.currentQRCode = qr;
        console.log('📱 QR disponível (legado)');
      });

      this.whatsappChecker.on('ready', () => {
        this.whatsappConnected = true;
        console.log('✅ WhatsApp OK (legado)');
      });

      this.whatsappChecker.on('disconnected', () => {
        this.whatsappConnected = false;
        console.log('❌ WhatsApp OFF (legado)');
      });

      this.whatsappChecker.on('max_reconnect_attempts', () => {
        console.log('❌ Máximo de tentativas de reconexão atingido. Aguardando nova tentativa...');
        // Aguardar 5 minutos antes de tentar novamente (código legado)
        setTimeout(() => {
          console.log('🔄 Reiniciando tentativas de conexão legado...');
          this.whatsappChecker.reconnectAttempts = 0;
          // Não conectar automaticamente o checker legado
          console.log('⚠️ Conexão automática desabilitada - use instâncias específicas');
        }, 5 * 60 * 1000);
      });

      // Inicializar instâncias salvas automaticamente
      console.log('🔄 Inicializando instâncias WhatsApp salvas...');
      await this.whatsappManager.initializeAllInstances();

      // Configurar graceful shutdown
      this.setupGracefulShutdown();

      this.server.listen(this.port, () => {
        console.log(`🚀 http://localhost:${this.port}`);
        console.log(`🔧 http://localhost:${this.port}/admin`);
        console.log(`📡 WebSocket server ativo`);
        console.log(`✅ Sistema iniciado com persistência de sessão`);
      });

    } catch (error) {
      console.error('❌', error);
      process.exit(1);
    }
  }

  // Novos métodos para o sistema multi-usuário

  async getStats(req, res) {
    try {
      const userId = req.user.role === 'admin' ? null : req.user.id;
      const stats = await this.verificationService.getStats(userId);
      
      // Adicionar estatísticas de tokens
      const tokenStats = await this.database.query(
        req.user.role === 'admin' 
          ? 'SELECT COUNT(*) as total FROM api_tokens WHERE active = TRUE'
          : 'SELECT COUNT(*) as total FROM api_tokens WHERE user_id = ? AND active = TRUE',
        req.user.role === 'admin' ? [] : [req.user.id]
      );
      
      stats.active_tokens = tokenStats[0]?.total || 0;
      
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getUserInstances(req, res) {
    try {
      console.log(`🔍 Buscando instâncias para usuário ${req.user.id} (${req.user.username})`);
      const instances = await this.whatsappManager.getUserInstances(req.user.id);
      console.log(`📱 Encontradas ${instances.length} instâncias`);
      res.json(instances);
    } catch (error) {
      console.error('❌ Erro ao buscar instâncias:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async createUserInstance(req, res) {
    try {
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Nome da instância é obrigatório' });
      }

      const { instanceId } = await this.whatsappManager.createInstance(req.user.id, name);
      
      res.json({ 
        message: 'Instância criada com sucesso',
        instanceId 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteUserInstance(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      await this.whatsappManager.deleteInstance(instanceId, req.user.id);
      
      res.json({ message: 'Instância removida com sucesso' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async connectUserInstance(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      await this.whatsappManager.connectInstance(instanceId);
      
      res.json({ message: 'Conectando instância...' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async disconnectUserInstance(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      await this.whatsappManager.disconnectInstance(instanceId);
      
      res.json({ message: 'Instância desconectada' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async debugInstances(req, res) {
    try {
      // Verificar instâncias no banco
      const dbInstances = await this.database.query('SELECT * FROM whatsapp_instances ORDER BY id');
      
      // Verificar instâncias no manager
      const managerInstances = [];
      for (const [id, instance] of this.whatsappManager.instances) {
        managerInstances.push({
          id: id,
          connected: instance.isConnected(),
          authPath: instance.authPath || 'N/A'
        });
      }
      
      // Verificar tokens
      const tokens = await this.database.query(`
        SELECT t.id, t.name, t.whatsapp_instance_id, i.status 
        FROM api_tokens t 
        LEFT JOIN whatsapp_instances i ON t.whatsapp_instance_id = i.id
      `);
      
      res.json({
        database_instances: dbInstances,
        manager_instances: managerInstances,
        tokens: tokens,
        manager_size: this.whatsappManager.instances.size
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async debugInstancesAPI(req, res) {
    try {
      const tokenId = req.apiToken.id;
      const instanceId = req.apiToken.whatsapp_instance_id;
      
      // Verificar instâncias no banco
      const dbInstances = await this.database.query('SELECT * FROM whatsapp_instances ORDER BY id');
      
      // Verificar instâncias no manager
      const managerInstances = [];
      for (const [id, instance] of this.whatsappManager.instances) {
        managerInstances.push({
          id: id,
          connected: instance.isConnected(),
          authPath: instance.authPath || instance.authDir || 'N/A',
          hasClient: !!instance.client,
          clientState: instance.client ? instance.client.state : 'no client'
        });
      }
      
      // Verificar token atual
      const currentToken = await this.database.query(`
        SELECT t.id, t.name, t.whatsapp_instance_id, i.status, i.name as instance_name
        FROM api_tokens t 
        LEFT JOIN whatsapp_instances i ON t.whatsapp_instance_id = i.id
        WHERE t.id = ?
      `, [tokenId]);
      
      // Verificar se instância do token existe no manager
      const tokenInstance = instanceId ? this.whatsappManager.getInstance(instanceId) : null;
      
      res.json({
        token_info: {
          id: tokenId,
          instance_id: instanceId,
          token_data: currentToken[0] || null,
          instance_in_manager: tokenInstance ? {
            connected: tokenInstance.isConnected(),
            authPath: tokenInstance.authPath || 'N/A'
          } : null
        },
        database_instances: dbInstances,
        manager_instances: managerInstances,
        manager_size: this.whatsappManager.instances.size
      });
    } catch (error) {
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  }

  async forceReconnect(req, res) {
    try {
      const tokenId = req.apiToken.id;
      const instanceId = req.apiToken.whatsapp_instance_id;
      
      if (!instanceId) {
        return res.status(400).json({ error: 'Token não possui instância associada' });
      }
      
      console.log(`🔄 Forçando reconexão da instância ${instanceId}...`);
      
      // Buscar dados da instância no banco
      const instances = await this.database.query(
        'SELECT * FROM whatsapp_instances WHERE id = ?',
        [instanceId]
      );
      
      if (instances.length === 0) {
        return res.status(404).json({ error: 'Instância não encontrada' });
      }
      
      const instanceData = instances[0];
      
      // Remover instância existente do manager
      if (this.whatsappManager.instances.has(instanceId)) {
        const oldInstance = this.whatsappManager.instances.get(instanceId);
        try {
          await oldInstance.disconnect();
        } catch (e) {
          console.log('Erro ao desconectar instância antiga:', e.message);
        }
        this.whatsappManager.instances.delete(instanceId);
      }
      
      // Reinicializar instância
      await this.whatsappManager.initializeInstance(instanceData);
      
      res.json({ 
        success: true, 
        message: 'Reconexão iniciada',
        instance_id: instanceId 
      });
      
    } catch (error) {
      console.error('Erro ao forçar reconexão:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async checkAuthFiles(req, res) {
    try {
      const instanceId = req.apiToken.whatsapp_instance_id;
      
      if (!instanceId) {
        return res.status(400).json({ error: 'Token não possui instância associada' });
      }
      
      // Buscar dados da instância
      const instances = await this.database.query(
        'SELECT * FROM whatsapp_instances WHERE id = ?',
        [instanceId]
      );
      
      if (instances.length === 0) {
        return res.status(404).json({ error: 'Instância não encontrada' });
      }
      
      const instance = instances[0];
      const authPath = instance.auth_path;
      
      // Verificar se arquivos existem
      const fs = require('fs');
      const path = require('path');
      
      const authDir = path.resolve(authPath);
      const credsPath = path.join(authDir, 'creds.json');
      
      res.json({
        instance_id: instanceId,
        auth_path: authPath,
        auth_dir_resolved: authDir,
        creds_path: credsPath,
        auth_dir_exists: fs.existsSync(authDir),
        creds_exists: fs.existsSync(credsPath),
        working_directory: process.cwd(),
        files_in_auth: fs.existsSync(authDir) ? fs.readdirSync(authDir) : 'DIR_NOT_EXISTS'
      });
      
    } catch (error) {
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  }

  // Endpoint para restaurar arquivos de autenticação do backup do banco de dados
  async restoreAuthFiles(req, res) {
    try {
      const instanceId = req.apiToken.whatsapp_instance_id;
      
      if (!instanceId) {
        return res.status(400).json({ error: 'Token não possui instância associada' });
      }
      
      console.log(`📂 Restaurando arquivos de auth para instância ${instanceId}...`);
      
      // Buscar dados da instância
      const instances = await this.database.query(
        'SELECT * FROM whatsapp_instances WHERE id = ?',
        [instanceId]
      );
      
      if (instances.length === 0) {
        return res.status(404).json({ error: 'Instância não encontrada' });
      }
      
      const instance = instances[0];
      const authPath = instance.auth_path;
      
      // Verificar se existe backup no banco
      const backups = await this.database.query(
        'SELECT session_data FROM whatsapp_instances WHERE id = ? AND session_data IS NOT NULL',
        [instanceId]
      );
      
      if (backups.length === 0 || !backups[0].session_data) {
        return res.status(404).json({ 
          error: 'Backup de sessão não encontrado',
          message: 'Você precisa conectar o WhatsApp primeiro para criar um backup'
        });
      }
      
      const sessionData = JSON.parse(backups[0].session_data);
      
      // Criar diretório de auth se não existir
      const fs = require('fs');
      const path = require('path');
      
      const authDir = path.resolve(authPath);
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
        console.log(`📁 Diretório criado: ${authDir}`);
      }
      
      // Restaurar arquivos baseado na estrutura do Baileys
      let filesRestored = 0;
      
      // Arquivo principal de credenciais
      if (sessionData.creds) {
        const credsPath = path.join(authDir, 'creds.json');
        fs.writeFileSync(credsPath, JSON.stringify(sessionData.creds, null, 2));
        console.log(`✅ Restaurado: creds.json`);
        filesRestored++;
      }
      
      // Chaves de sincronização
      if (sessionData.keys) {
        const keysPath = path.join(authDir, 'app-state-sync-version-regular.json');
        fs.writeFileSync(keysPath, JSON.stringify(sessionData.keys, null, 2));
        console.log(`✅ Restaurado: app-state-sync-version-regular.json`);
        filesRestored++;
      }
      
      // Se não houver dados específicos, tentar restaurar estrutura básica
      if (filesRestored === 0) {
        // Criar estrutura mínima necessária
        const credsPath = path.join(authDir, 'creds.json');
        const minimalCreds = {
          noiseKey: sessionData.noiseKey || null,
          pairingEphemeralKeyPair: sessionData.pairingEphemeralKeyPair || null,
          pairingCode: sessionData.pairingCode || null,
          lastAccountSyncTimestamp: sessionData.lastAccountSyncTimestamp || null
        };
        
        fs.writeFileSync(credsPath, JSON.stringify(minimalCreds, null, 2));
        console.log(`✅ Criado: creds.json (estrutura mínima)`);
        filesRestored++;
      }
      
      res.json({
        success: true,
        message: `Arquivos de autenticação restaurados com sucesso`,
        files_restored: filesRestored,
        auth_dir: authDir,
        backup_date: instance.session_backup_at,
        note: 'Você pode precisar escanear o QR code novamente'
      });
      
    } catch (error) {
      console.error('Erro ao restaurar arquivos de auth:', error);
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  }

  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log('Cliente WebSocket conectado:', socket.id);
      
      // Autenticação do socket
      socket.on('authenticate', async (token) => {
        try {
          const user = await this.authService.validateToken(token);
          if (user) {
            socket.userId = user.id;
            socket.userRole = user.role;
            socket.join(`user_${user.id}`);
            
            console.log(`Socket autenticado para usuário ${user.id} (${user.role})`);
            socket.emit('authenticated', { success: true });
            
            // Enviar status atual das instâncias do usuário
            const instances = await this.whatsappManager.getUserInstances(user.id);
            socket.emit('instances_status', instances);
          } else {
            socket.emit('authentication_failed');
            socket.disconnect();
          }
        } catch (error) {
          console.error('Erro na autenticação do socket:', error);
          socket.emit('authentication_failed');
          socket.disconnect();
        }
      });
      
      // Requisição de QR code para uma instância específica
      socket.on('request_qr', async (instanceId) => {
        try {
          if (!socket.userId) {
            socket.emit('error', { message: 'Não autenticado' });
            return;
          }
          
          const instance = await this.whatsappManager.getUserInstance(socket.userId, instanceId);
          if (!instance) {
            socket.emit('error', { message: 'Instância não encontrada' });
            return;
          }
          
          // Conectar a instância e emitir QR code quando disponível
          await this.whatsappManager.connectInstance(instanceId, {
            onQRCode: (qr) => {
              socket.emit('qr_code', { instanceId, qr });
            },
            onConnected: () => {
              socket.emit('instance_connected', { instanceId });
              this.io.to(`user_${socket.userId}`).emit('instance_status_changed', {
                instanceId,
                status: 'connected'
              });
            },
            onDisconnected: () => {
              socket.emit('instance_disconnected', { instanceId });
              this.io.to(`user_${socket.userId}`).emit('instance_status_changed', {
                instanceId,
                status: 'disconnected'
              });
            }
          });
        } catch (error) {
          console.error('Erro ao solicitar QR code:', error);
          socket.emit('error', { message: 'Erro ao conectar instância' });
        }
      });
      
      socket.on('disconnect', () => {
        console.log('Cliente WebSocket desconectado:', socket.id);
      });
    });
  }

  // Método para emitir eventos para usuários específicos
  emitToUser(userId, event, data) {
    this.io.to(`user_${userId}`).emit(event, data);
  }

  // Método para emitir eventos para todos os usuários
  emitToAll(event, data) {
    this.io.emit(event, data);
  }

  // Configurar shutdown graceful para preservar sessões
  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Recebido sinal ${signal}, iniciando shutdown graceful...`);
      
      try {
        // Fechar servidor HTTP
        this.server.close(() => {
          console.log('🛑 Servidor HTTP fechado');
        });
        
        // Desconectar instâncias gracefully (mantém auth files)
        console.log('🛑 Salvando sessões WhatsApp...');
        await this.whatsappManager.disconnectAllInstances();
        
        // Fechar conexão com banco
        await this.database.disconnect();
        console.log('🛑 Banco de dados desconectado');
        
        console.log('✅ Shutdown graceful concluído');
        process.exit(0);
      } catch (error) {
        console.error('❌ Erro durante shutdown:', error);
        process.exit(1);
      }
    };

    // Capturar sinais de sistema
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Capturar uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });
  }
}

/*
=== RATE LIMITING - POR QUE É NECESSÁRIO? ===

1. PROTEÇÃO CONTRA ATAQUES:
   - DDoS (Distributed Denial of Service)
   - Brute force em logins
   - Spam de requisições

2. PROTEÇÃO DA INFRAESTRUTURA:
   - Evita sobrecarga do servidor
   - Protege o banco de dados
   - Mantém a API responsiva

3. CONTROLE DE CUSTOS:
   - WhatsApp Web tem limites não oficiais
   - Evita bloqueios temporários
   - Preserva recursos do servidor

4. FAIR USE:
   - Garante que todos os usuários tenham acesso
   - Evita que um usuário monopolize recursos
   - Distribui carga de forma equilibrada

5. CONFORMIDADE:
   - Segue boas práticas de API
   - Atende requisitos de segurança
   - Facilita auditoria

CONFIGURAÇÃO ATUAL:
- 100 requisições por 15 minutos por IP
- Aplicado apenas em rotas /api/
- Pode ser personalizado por usuário
*/

module.exports = WhatsAppCheckerAPI;
