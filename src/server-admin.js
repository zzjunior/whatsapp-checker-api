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
      res.sendFile(require('path').join(__dirname, '../public/admin.html'));
    });
  }

  getAdminHTML() {
    return `<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Checker - Admin</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .btn { padding: 10px 20px; margin: 5px; border: none; cursor: pointer; border-radius: 5px; }
        .btn-primary { background: #007bff; color: white; }
        .btn-success { background: #28a745; color: white; }
        .form-group { margin: 15px 0; }
        .form-group label { display: block; margin-bottom: 5px; }
        .form-group input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
        .status { padding: 15px; margin: 10px 0; border-radius: 5px; }
        .status.success { background: #d4edda; color: #155724; }
        .status.error { background: #f8d7da; color: #721c24; }
        .qr-code { background: #f8f9fa; padding: 20px; border-radius: 5px; font-family: monospace; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 WhatsApp Checker - Admin</h1>
        
        <div class="card" id="loginCard">
            <h2>Login</h2>
            <form id="loginForm">
                <div class="form-group">
                    <label>Username:</label>
                    <input type="text" id="username" required>
                </div>
                <div class="form-group">
                    <label>Password:</label>
                    <input type="password" id="password" required>
                </div>
                <button type="submit" class="btn btn-primary">Entrar</button>
            </form>
        </div>

        <div id="adminPanel" style="display: none;">
            <div class="card">
                <h2>WhatsApp Status</h2>
                <div id="whatsappStatus"></div>
                <button onclick="connectWhatsApp()" class="btn btn-success">Conectar</button>
                <button onclick="checkQR()" class="btn btn-primary">Ver QR</button>
                <div id="qrCode" class="qr-code" style="display: none;"></div>
            </div>

            <div class="card">
                <h2>Criar Token</h2>
                <form id="tokenForm">
                    <div class="form-group">
                        <label>Nome:</label>
                        <input type="text" id="tokenName" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Criar</button>
                </form>
            </div>

            <div class="card">
                <h2>Tokens</h2>
                <div id="tokensList"></div>
            </div>

            <div class="card">
                <h2>Alterar Senha</h2>
                <form id="changePasswordForm">
                    <div class="form-group">
                        <label>Senha atual:</label>
                        <input type="password" id="currentPassword" required>
                    </div>
                    <div class="form-group">
                        <label>Nova senha:</label>
                        <input type="password" id="newPassword" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Alterar Senha</button>
                </form>
            </div>

            <div class="card" id="usersCard" style="display:none;">
                <h2>Usuários</h2>
                <form id="addUserForm">
                    <div class="form-group">
                        <label>Usuário:</label>
                        <input type="text" id="newUsername" required>
                    </div>
                    <div class="form-group">
                        <label>Senha:</label>
                        <input type="password" id="newUserPassword" required>
                    </div>
                    <div class="form-group">
                        <label>Tipo:</label>
                        <select id="newUserType">
                            <option value="common">Comum</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>
                    <button type="submit" class="btn btn-primary">Cadastrar Usuário</button>
                </form>
                <div id="usersList"></div>
            </div>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script>
        let authToken = localStorage.getItem('authToken');
        
        if (authToken) {
            showAdmin();
        }

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const response = await fetch('/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value
                })
            });
            
            const result = await response.json();
            if (response.ok) {
                authToken = result.token;
                localStorage.setItem('authToken', authToken);
                showAdmin();
            } else {
                alert('Erro: ' + result.error);
            }
        });

        function showAdmin() {
            document.getElementById('loginCard').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            loadData();
            // Exibe aba de usuários apenas para admin
            fetch('/admin/status', { headers: { 'Authorization': 'Bearer ' + authToken } })
                .then(r => r.json())
                .then(data => {
                    if (data.user_type === 'admin') {
                        document.getElementById('usersCard').style.display = 'block';
                        loadUsers();
                    } else {
                        document.getElementById('usersCard').style.display = 'none';
                    }
                });
        }

        async function loadData() {
            const response = await fetch('/admin/status', {
                headers: { 'Authorization': 'Bearer ' + authToken }
            });
            const data = await response.json();
            
            document.getElementById('whatsappStatus').innerHTML = 
                '<div class="status ' + (data.whatsapp_connected ? 'success' : 'error') + '">' +
                'Status: ' + (data.whatsapp_connected ? 'Conectado' : 'Desconectado') +
                '</div>';
            
            loadTokens();
        }

        async function connectWhatsApp() {
            await fetch('/admin/connect-whatsapp', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + authToken }
            });
            alert('Conectando...');
            setTimeout(loadData, 2000);
        }

        async function checkQR() {
            const response = await fetch('/admin/qr', {
                headers: { 'Authorization': 'Bearer ' + authToken }
            });
            const data = await response.json();
            if (data.qr_code) {
                document.getElementById('qrCode').style.display = 'block';
                // Limpa o conteúdo anterior
                document.getElementById('qrCode').innerHTML = '';
                // Gera o QR code visual
                new QRCode(document.getElementById('qrCode'), {
                    text: data.qr_code,
                    width: 256,
                    height: 256
                });
            } else {
                document.getElementById('qrCode').style.display = 'none';
            }
        }

        document.getElementById('tokenForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const response = await fetch('/admin/tokens', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + authToken 
                },
                body: JSON.stringify({
                    name: document.getElementById('tokenName').value,
                    requests_limit: 1000
                })
            });
            
            const result = await response.json();
            if (response.ok) {
                alert('Token: ' + result.token);
                loadTokens();
            }
        });

        document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const response = await fetch('/admin/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + authToken
                },
                body: JSON.stringify({
                    currentPassword: document.getElementById('currentPassword').value,
                    newPassword: document.getElementById('newPassword').value
                })
            });
            const result = await response.json();
            if (response.ok) {
                alert('Senha alterada com sucesso!');
                document.getElementById('changePasswordForm').reset();
            } else {
                alert('Erro: ' + result.error);
            }
        });

        document.getElementById('addUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const response = await fetch('/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + authToken
                },
                body: JSON.stringify({
                    username: document.getElementById('newUsername').value,
                    password: document.getElementById('newUserPassword').value,
                    user_type: document.getElementById('newUserType').value
                })
            });
            const result = await response.json();
            if (response.ok) {
                alert('Usuário cadastrado!');
                document.getElementById('addUserForm').reset();
                loadUsers();
            } else {
                alert('Erro: ' + result.error);
            }
        });

        async function loadTokens() {
            const response = await fetch('/admin/tokens', {
                headers: { 'Authorization': 'Bearer ' + authToken }
            });
            const tokens = await response.json();
            
            document.getElementById('tokensList').innerHTML = tokens.map(token => 
                '<div style="border: 1px solid #ddd; padding: 10px; margin: 5px 0;">' +
                '<strong>' + token.name + '</strong><br>' +
                'Token: <code>' + token.token + '</code>' +
                '</div>'
            ).join('');
        }

        async function loadUsers() {
            const response = await fetch('/admin/users', {
                headers: { 'Authorization': 'Bearer ' + authToken }
            });
            const users = await response.json();
            document.getElementById('usersList').innerHTML = users.map(function(u) {
                return '<div style="border:1px solid #ddd;padding:10px;margin:5px 0;">' +
                    '<strong>' + u.username + '</strong> (' + u.user_type + ')' +
                    '<button onclick="deleteUser(' + u.id + ')" class="btn btn-danger" style="float:right;">Excluir</button>' +
                '</div>';
            }).join('');
        }

        async function deleteUser(id) {
            if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
            const response = await fetch('/admin/users/' + id, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + authToken }
            });
            if (response.ok) {
                loadUsers();
            } else {
                const result = await response.json();
                alert('Erro: ' + result.error);
            }
        }

        setInterval(checkQR, 10000);
    </script>
</body>
</html>`;
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
    res.json({
      whatsapp_connected: this.whatsappConnected,
      current_qr: this.currentQRCode,
      user_type: req.user.role
    });
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
