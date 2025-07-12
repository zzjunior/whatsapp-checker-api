// Dashboard JavaScript
const API_BASE = '';

// Estado da aplicação
let currentUser = null;
let whatsappInstances = [];
let tokens = [];
let wsClient = null;
let currentQRModal = null;

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadUserInfo();
    setupEventListeners();
    loadPage('dashboard');
    checkWhatsAppStatus();
    initWebSocket();
    
    // Atualizar status a cada 30 segundos
    setInterval(checkWhatsAppStatus, 30000);
});

function checkAuth() {
    const token = localStorage.getItem('admin_token');
    if (!token) {
        window.location.href = '/admin';
        return;
    }
}

function loadUserInfo() {
    const userInfo = localStorage.getItem('userInfo');
    if (userInfo) {
        currentUser = JSON.parse(userInfo);
        document.getElementById('userName').textContent = currentUser.username;
        document.getElementById('topUserName').textContent = currentUser.username;
        document.getElementById('userRole').textContent = currentUser.role;
        
        // Mostrar menu de usuários apenas para admin
        if (currentUser.role === 'admin') {
            document.getElementById('usersMenu').style.display = 'block';
        }
    }
}

function setupEventListeners() {
    // Menu navigation
    document.querySelectorAll('.menu-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            if (page) {
                loadPage(page);
                
                // Update active menu item
                document.querySelectorAll('.menu-link').forEach(l => l.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('expanded');
}

function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('userInfo');
    window.location.href = '/admin';
}

async function apiRequest(endpoint, method = 'GET', data = null) {
    const token = localStorage.getItem('admin_token');
    const config = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(endpoint, config);
        if (response.status === 401) {
            logout();
            return;
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

async function checkWhatsAppStatus() {
    try {
        // Buscar status específico do usuário baseado em suas instâncias
        const instances = await apiRequest('/admin/instances');
        
        // Verificar se há instâncias conectadas
        const connectedInstances = instances.filter(i => i.status === 'connected').length;
        const totalInstances = instances.length;
        
        const statusElement = document.getElementById('whatsappStatus');
        
        if (connectedInstances > 0) {
            statusElement.className = 'badge bg-success status-badge me-3';
            statusElement.innerHTML = `<i class="bi bi-circle-fill me-1"></i>WhatsApp: ${connectedInstances}/${totalInstances} Online`;
        } else if (totalInstances > 0) {
            statusElement.className = 'badge bg-warning status-badge me-3';
            statusElement.innerHTML = `<i class="bi bi-circle-fill me-1"></i>WhatsApp: ${totalInstances} Offline`;
        } else {
            statusElement.className = 'badge bg-secondary status-badge me-3';
            statusElement.innerHTML = '<i class="bi bi-circle-fill me-1"></i>WhatsApp: Sem instâncias';
        }
    } catch (error) {
        console.error('Erro ao verificar status:', error);
        // Fallback para status offline em caso de erro
        const statusElement = document.getElementById('whatsappStatus');
        if (statusElement) {
            statusElement.className = 'badge bg-secondary status-badge me-3';
            statusElement.innerHTML = '<i class="bi bi-circle-fill me-1"></i>WhatsApp: Erro';
        }
    }
}

function loadPage(page) {
    document.getElementById('pageTitle').textContent = getPageTitle(page);
    
    switch(page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'instances':
            loadInstances();
            break;
        case 'tokens':
            loadTokens();
            break;
        case 'logs':
            loadLogs();
            break;
        case 'users':
            loadUsers();
            break;
        case 'settings':
            loadSettings();
            break;
        default:
            loadDashboard();
    }
}

function getPageTitle(page) {
    const titles = {
        'dashboard': 'Dashboard',
        'instances': 'WhatsApp Instâncias',
        'tokens': 'Tokens API',
        'logs': 'Logs de Verificação',
        'users': 'Gerenciar Usuários',
        'settings': 'Configurações'
    };
    return titles[page] || 'Dashboard';
}

function loadDashboard() {
    const content = `
        <div class="row">
            <div class="col-md-3 mb-4">
                <div class="card card-stats h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between">
                            <div>
                                <h5 class="card-title">Verificações</h5>
                                <h2 class="mb-0" id="totalVerifications">-</h2>
                                <small>Total hoje</small>
                            </div>
                            <i class="bi bi-check-circle fs-2 opacity-75"></i>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-3 mb-4">
                <div class="card card-whatsapp h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between">
                            <div>
                                <h5 class="card-title">Instâncias</h5>
                                <h2 class="mb-0" id="totalInstances">-</h2>
                                <small>Ativas</small>
                            </div>
                            <i class="bi bi-whatsapp fs-2 opacity-75"></i>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-3 mb-4">
                <div class="card bg-success text-white h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between">
                            <div>
                                <h5 class="card-title">Tokens</h5>
                                <h2 class="mb-0" id="totalTokens">-</h2>
                                <small>Ativos</small>
                            </div>
                            <i class="bi bi-key fs-2 opacity-75"></i>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-3 mb-4">
                <div class="card bg-info text-white h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between">
                            <div>
                                <h5 class="card-title">Cache</h5>
                                <h2 class="mb-0" id="cacheSize">-</h2>
                                <small>Registros</small>
                            </div>
                            <i class="bi bi-database fs-2 opacity-75"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="row">
            <div class="col-md-8 mb-4">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Verificações Recentes</h5>
                    </div>
                    <div class="card-body">
                        <div id="recentVerifications">
                            <div class="text-center">
                                <div class="spinner-border" role="status">
                                    <span class="visually-hidden">Carregando...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-4 mb-4">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Status do Sistema</h5>
                    </div>
                    <div class="card-body">
                        <div id="systemStatus">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <span>Database</span>
                                <span class="badge bg-success">Online</span>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <span>WhatsApp</span>
                                <span class="badge bg-warning" id="dashboardWhatsappStatus">Verificando...</span>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <span>API</span>
                                <span class="badge bg-success">Online</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('pageContent').innerHTML = content;
    loadDashboardData();
}

async function loadDashboardData() {
    try {
        // Carregar estatísticas
        const stats = await apiRequest('/admin/stats');
        
        // Atualizar elementos do dashboard
        document.getElementById('totalVerifications').textContent = stats.today_verifications || 0;
        document.getElementById('totalInstances').textContent = stats.active_instances || 0;
        document.getElementById('totalTokens').textContent = stats.active_tokens || 0;
        document.getElementById('cacheSize').textContent = stats.cache_size || 0;
        
        // Atualizar status do WhatsApp no dashboard
        const whatsappStatus = await fetch('/api/status').then(r => r.json());
        const dashboardStatus = document.getElementById('dashboardWhatsappStatus');
        if (whatsappStatus.connected) {
            dashboardStatus.className = 'badge bg-success';
            dashboardStatus.textContent = 'Online';
        } else {
            dashboardStatus.className = 'badge bg-danger';
            dashboardStatus.textContent = 'Offline';
        }
        
        // Carregar verificações recentes
        await loadRecentVerifications();
        
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        // Definir valores padrão em caso de erro
        document.getElementById('totalVerifications').textContent = '0';
        document.getElementById('totalInstances').textContent = '0';
        document.getElementById('totalTokens').textContent = '0';
        document.getElementById('cacheSize').textContent = '0';
    }
}

async function loadRecentVerifications() {
    try {
        // Por enquanto, vamos mostrar uma mensagem simples
        const container = document.getElementById('recentVerifications');
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="bi bi-clock-history fs-4"></i>
                <p class="mt-2">Verificações recentes aparecerão aqui</p>
                <small>Funcionalidade em desenvolvimento</small>
            </div>
        `;
    } catch (error) {
        console.error('Erro ao carregar verificações recentes:', error);
    }
}

function loadInstances() {
    const content = `
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h4>Suas Instâncias WhatsApp</h4>
            <button class="btn btn-whatsapp" onclick="showCreateInstanceModal()">
                <i class="bi bi-plus-lg me-2"></i>Nova Instância
            </button>
        </div>
        
        <div class="row" id="instances-list">
            <div class="col-12 text-center">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
                <p class="mt-2">Carregando instâncias...</p>
            </div>
        </div>
        
        <!-- Modal para criar instância -->
        <div class="modal fade" id="createInstanceModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Nova Instância WhatsApp</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="createInstanceForm">
                            <div class="mb-3">
                                <label for="instanceName" class="form-label">Nome da Instância</label>
                                <input type="text" class="form-control" id="instanceName" required>
                                <div class="form-text">Ex: WhatsApp Pessoal, WhatsApp Trabalho</div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="createInstance()">Criar</button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Modal para QR Code -->
        <div class="modal fade" id="qrCodeModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-qr-code me-2"></i>
                            Conectar WhatsApp - <span id="qrInstanceName"></span>
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body text-center">
                        <div id="qrCodeContainer">
                            <div class="spinner-border text-primary mb-3" role="status">
                                <span class="visually-hidden">Gerando QR Code...</span>
                            </div>
                            <p class="text-muted">Gerando QR Code...</p>
                        </div>
                        <div class="alert alert-info mt-3">
                            <i class="bi bi-info-circle me-2"></i>
                            <strong>Instruções:</strong><br>
                            1. Abra o WhatsApp no seu celular<br>
                            2. Vá em Configurações > Aparelhos conectados<br>
                            3. Toque em "Conectar um aparelho"<br>
                            4. Escaneie o QR Code acima
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('pageContent').innerHTML = content;
    
    // Verificar se WebSocket está conectado e solicitar instâncias
    if (wsClient && wsClient.connected) {
        // As instâncias serão carregadas automaticamente via WebSocket
        setTimeout(() => {
            if (document.getElementById('instances-list').children.length === 1) {
                // Se ainda só tem o loading, carregar via API tradicional
                loadInstancesData();
            }
        }, 3000);
    } else {
        // Fallback para API tradicional
        loadInstancesData();
    }
}

async function loadInstancesData() {
    try {
        const instances = await apiRequest('/admin/instances');
        const container = document.getElementById('instances-list');
        
        if (instances.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-phone-vibrate fs-1 text-muted"></i>
                    <h5 class="mt-3">Nenhuma instância criada</h5>
                    <p class="text-muted">Clique em "Nova Instância" para começar</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = instances.map(instance => `
            <div class="card mb-3">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-md-6">
                            <h5 class="mb-1">${instance.name}</h5>
                            <small class="text-muted">Criada em: ${new Date(instance.created_at).toLocaleString()}</small>
                        </div>
                        <div class="col-md-3 text-center">
                            <span class="badge bg-${instance.status === 'connected' ? 'success' : instance.status === 'connecting' ? 'warning' : 'secondary'}">
                                ${instance.status === 'connected' ? 'Conectada' : instance.status === 'connecting' ? 'Conectando' : 'Desconectada'}
                            </span>
                        </div>
                        <div class="col-md-3 text-end">
                            ${instance.status === 'disconnected' ? 
                                `<button class="btn btn-success btn-sm me-2" onclick="connectInstance(${instance.id})">
                                    <i class="bi bi-play-fill"></i> Conectar
                                </button>` :
                                `<button class="btn btn-warning btn-sm me-2" onclick="disconnectInstance(${instance.id})">
                                    <i class="bi bi-stop-fill"></i> Desconectar
                                </button>`
                            }
                            <button class="btn btn-danger btn-sm" onclick="deleteInstance(${instance.id})">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Erro ao carregar instâncias:', error);
    }
}

// Funções para modal de criação de instância
function showCreateInstanceModal() {
    const modal = new bootstrap.Modal(document.getElementById('createInstanceModal'));
    modal.show();
}

async function createInstance() {
    const name = document.getElementById('instanceName').value.trim();
    if (!name) {
        alert('Por favor, insira um nome para a instância');
        return;
    }
    
    try {
        await apiRequest('/admin/instances', 'POST', { name });
        
        // Fechar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('createInstanceModal'));
        modal.hide();
        
        // Limpar form
        document.getElementById('createInstanceForm').reset();
        
        // Recarregar instâncias
        setTimeout(() => {
            loadInstancesData();
        }, 1000);
        
        showAlert('Instância criada com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao criar instância:', error);
        showAlert('Erro ao criar instância: ' + error.message, 'danger');
    }
}

async function connectInstance(id) {
    try {
        // Buscar informações da instância
        const instances = await apiRequest('/admin/instances');
        const instance = instances.find(i => i.id === id);
        
        if (!instance) {
            showAlert('Instância não encontrada', 'error');
            return;
        }
        
        // Mostrar modal de QR code
        document.getElementById('qrInstanceName').textContent = instance.name;
        const modal = new bootstrap.Modal(document.getElementById('qrCodeModal'));
        currentQRModal = modal;
        modal.show();
        
        // Resetar conteúdo do modal
        const container = document.getElementById('qrCodeContainer');
        container.innerHTML = `
            <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Gerando QR Code...</span>
            </div>
            <p class="text-muted">Conectando e gerando QR Code...</p>
        `;
        
        // Solicitar conexão via API
        await apiRequest(`/admin/instances/${id}/connect`, 'POST');
        
        // Solicitar QR code via WebSocket
        if (wsClient && wsClient.connected) {
            wsClient.emit('request_qr', id);
        } else {
            container.innerHTML = `
                <div class="alert alert-warning">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Conexão WebSocket não disponível. Tentando reconectar...
                </div>
            `;
            initWebSocket();
        }
        
    } catch (error) {
        console.error('Erro ao conectar instância:', error);
        showAlert('Erro ao conectar instância: ' + error.message, 'danger');
        hideQRModal();
    }
}

async function disconnectInstance(id) {
    try {
        await apiRequest(`/admin/instances/${id}/disconnect`, 'POST');
        showAlert('Instância desconectada', 'warning');
        
        // Recarregar após um tempo
        setTimeout(() => {
            loadInstancesData();
        }, 1000);
    } catch (error) {
        console.error('Erro ao desconectar instância:', error);
        showAlert('Erro ao desconectar instância: ' + error.message, 'danger');
    }
}

async function deleteInstance(id) {
    if (confirm('Tem certeza que deseja excluir esta instância?')) {
        try {
            await apiRequest(`/admin/instances/${id}`, 'DELETE');
            showAlert('Instância excluída com sucesso', 'success');
            
            // Recarregar instâncias
            setTimeout(() => {
                loadInstancesData();
            }, 1000);
        } catch (error) {
            console.error('Erro ao excluir instância:', error);
            showAlert('Erro ao excluir instância: ' + error.message, 'danger');
        }
    }
}

async function loadTokens() {
    document.getElementById('pageContent').innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h4>Seus Tokens API</h4>
            <button class="btn btn-primary" onclick="showCreateTokenModal()">
                <i class="bi bi-plus-lg me-2"></i>Novo Token
            </button>
        </div>
        
        <div class="alert alert-info">
            <i class="bi bi-info-circle me-2"></i>
            Use estes tokens para autenticar suas requisições à API
        </div>
        
        <div id="tokensList">
            <div class="text-center">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">Carregando...</span>
                </div>
            </div>
        </div>
    `;

    try {
        const tokens = await apiRequest('/admin/tokens');
        
        const tokensList = document.getElementById('tokensList');
        
        if (tokens.length === 0) {
            tokensList.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-key fs-1 text-muted"></i>
                    <h5 class="mt-3">Nenhum token criado</h5>
                    <p class="text-muted">Clique em "Novo Token" para começar</p>
                </div>
            `;
            return;
        }

        tokensList.innerHTML = tokens.map(token => `
            <div class="card mb-3">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-md-5">
                            <h5 class="mb-1">${token.name}</h5>
                            <code class="small text-muted">${token.token}</code>
                            ${token.instance_name ? `<br><small class="text-primary"><i class="bi bi-whatsapp me-1"></i>${token.instance_name}</small>` : '<br><small class="text-danger">Sem instância</small>'}
                        </div>
                        <div class="col-md-3">
                            <div class="small text-muted">
                                <div>Limite: ${token.requests_limit}</div>
                                <div>Usado: ${token.requests_used || 0}</div>
                                <div>Criado: ${new Date(token.created_at).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <div class="col-md-4 text-end">
                            <span class="badge bg-${token.active ? 'success' : 'secondary'} me-2">
                                ${token.active ? 'Ativo' : 'Inativo'}
                            </span>
                            ${token.instance_status ? `<span class="badge bg-${token.instance_status === 'connected' ? 'success' : 'warning'} me-2">
                                ${token.instance_status === 'connected' ? 'Online' : 'Offline'}
                            </span>` : ''}
                            <button class="btn btn-outline-primary btn-sm me-2" onclick="copyToken('${token.token}')">
                                <i class="bi bi-clipboard"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="deleteToken(${token.id})">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // Garantir que o modal existe e configurar eventos
        setupTokenModal();
        
    } catch (error) {
        console.error('Erro ao carregar tokens:', error);
        document.getElementById('tokensList').innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle me-2"></i>
                Erro ao carregar tokens: ${error.message}
            </div>
        `;
    }
}

function setupTokenModal() {
    // Verificar se o modal já existe
    if (document.getElementById('createTokenModal')) {
        return;
    }
    
    // Criar modal uma única vez
    const modalHtml = `
        <div class="modal fade" id="createTokenModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Novo Token API</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="createTokenForm">
                            <div class="mb-3">
                                <label for="tokenName" class="form-label">Nome do Token</label>
                                <input type="text" class="form-control" id="tokenName" required>
                            </div>
                            <div class="mb-3">
                                <label for="tokenInstance" class="form-label">Instância WhatsApp</label>
                                <select class="form-select" id="tokenInstance" required>
                                    <option value="">Selecione uma instância...</option>
                                </select>
                                <div class="form-text">O token usará esta instância para verificações</div>
                            </div>
                            <div class="mb-3">
                                <label for="tokenLimit" class="form-label">Limite de Requisições</label>
                                <input type="number" class="form-control" id="tokenLimit" value="1000" min="1">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="createTokenBtn">Criar Token</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Configurar evento do botão criar (apenas uma vez)
    document.getElementById('createTokenBtn').addEventListener('click', createToken);
    
    // Configurar evento de submit do formulário (apenas uma vez)
    document.getElementById('createTokenForm').addEventListener('submit', function(e) {
        e.preventDefault();
        createToken();
    });
}

function showCreateTokenModal() {
    // Garantir que o modal existe antes de tentar usar
    setupTokenModal();
    
    // Carregar instâncias disponíveis antes de mostrar o modal
    loadInstancesForToken();
    
    const modal = new bootstrap.Modal(document.getElementById('createTokenModal'));
    modal.show();
}

async function loadInstancesForToken() {
    try {
        const instances = await apiRequest('/admin/instances');
        const select = document.getElementById('tokenInstance');
        
        if (!select) {
            console.error('Elemento tokenInstance não encontrado');
            return;
        }
        
        // Limpar opções existentes
        select.innerHTML = '<option value="">Selecione uma instância...</option>';
        
        // Adicionar instâncias disponíveis
        instances.forEach(instance => {
            const option = document.createElement('option');
            option.value = instance.id;
            option.textContent = `${instance.name} (${instance.status === 'connected' ? 'Online' : 'Offline'})`;
            option.disabled = instance.status !== 'connected';
            select.appendChild(option);
        });
        
        if (instances.length === 0) {
            select.innerHTML = '<option value="">Nenhuma instância disponível</option>';
            
            // Mostrar alerta sobre necessidade de criar instância
            const alertHtml = `
                <div class="alert alert-warning mt-3">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    <strong>Nenhuma instância WhatsApp disponível!</strong><br>
                    Você precisa criar e conectar uma instância WhatsApp antes de criar tokens.
                    <br><br>
                    <button class="btn btn-sm btn-primary" onclick="createInstanceFirst()">
                        <i class="bi bi-whatsapp me-1"></i>Criar Instância Primeiro
                    </button>
                </div>
            `;
            
            const modalBody = document.querySelector('#createTokenModal .modal-body');
            if (modalBody && !modalBody.querySelector('.alert-warning')) {
                modalBody.insertAdjacentHTML('afterbegin', alertHtml);
            }
        } else {
            // Remover alerta se existir
            const existingAlert = document.querySelector('#createTokenModal .alert-warning');
            if (existingAlert) {
                existingAlert.remove();
            }
        }
    } catch (error) {
        console.error('Erro ao carregar instâncias:', error);
    }
}

async function createToken() {
    try {
        const name = document.getElementById('tokenName').value.trim();
        const whatsapp_instance_id = document.getElementById('tokenInstance').value;
        const requests_limit = parseInt(document.getElementById('tokenLimit').value);
        
        if (!name) {
            alert('Nome do token é obrigatório');
            return;
        }
        
        if (!whatsapp_instance_id) {
            alert('Selecione uma instância WhatsApp');
            return;
        }
        
        const response = await apiRequest('/admin/tokens', 'POST', {
            name, 
            whatsapp_instance_id: parseInt(whatsapp_instance_id),
            requests_limit
        });
        
        // Fechar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('createTokenModal'));
        modal.hide();
        
        // Limpar formulário
        document.getElementById('createTokenForm').reset();
        
        // Recarregar lista
        loadTokens();
        
        // Mostrar o token criado
        showTokenCreated(response.token);
        
    } catch (error) {
        console.error('Erro ao criar token:', error);
        alert('Erro ao criar token: ' + error.message);
    }
}

function showTokenCreated(token) {
    const alertHtml = `
        <div class="alert alert-success alert-dismissible fade show" role="alert">
            <h5 class="alert-heading">Token criado com sucesso!</h5>
            <p>Seu novo token API:</p>
            <code class="user-select-all">${token}</code>
            <hr>
            <p class="mb-0">
                <i class="bi bi-exclamation-triangle me-2"></i>
                <strong>Importante:</strong> Copie este token agora. Você não poderá vê-lo novamente.
            </p>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    document.getElementById('pageContent').insertAdjacentHTML('afterbegin', alertHtml);
}

function copyToken(token) {
    navigator.clipboard.writeText(token).then(() => {
        showSuccess('Token copiado para a área de transferência');
    }).catch(err => {
        console.error('Erro ao copiar token:', err);
        alert('Erro ao copiar token');
    });
}

async function deleteToken(tokenId) {
    if (!confirm('Tem certeza que deseja excluir este token?')) {
        return;
    }
    
    try {
        await apiRequest(`/admin/tokens/${tokenId}`, 'DELETE');
        loadTokens();
        showSuccess('Token excluído com sucesso');
    } catch (error) {
        console.error('Erro ao excluir token:', error);
        alert('Erro ao excluir token: ' + error.message);
    }
}

function loadLogs() {
    document.getElementById('pageContent').innerHTML = `
        <h4>Logs de Verificação</h4>
        <p class="text-muted">Histórico das verificações realizadas</p>
        
        <div class="card">
            <div class="card-body">
                <div class="text-center py-5">
                    <i class="bi bi-list-check fs-1 text-muted"></i>
                    <h5 class="mt-3">Em desenvolvimento</h5>
                    <p class="text-muted">Logs serão exibidos aqui</p>
                </div>
            </div>
        </div>
    `;
}

async function loadUsers() {
    if (currentUser.role !== 'admin') {
        document.getElementById('pageContent').innerHTML = `
            <div class="alert alert-warning">
                <i class="bi bi-exclamation-triangle me-2"></i>
                Acesso negado. Apenas administradores podem gerenciar usuários.
            </div>
        `;
        return;
    }
    
    try {
        const users = await apiRequest('/admin/users');
        
        document.getElementById('pageContent').innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h4>Gerenciar Usuários</h4>
                <button class="btn btn-primary" onclick="showCreateUserModal()">
                    <i class="bi bi-person-plus me-2"></i>Novo Usuário
                </button>
            </div>
            
            <div class="card">
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Usuário</th>
                                    <th>Tipo</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody id="usersTableBody">
                                ${users.map(user => `
                                    <tr>
                                        <td>${user.id}</td>
                                        <td>${user.username}</td>
                                        <td>
                                            <span class="badge bg-${user.user_type === 'admin' ? 'danger' : 'primary'}">
                                                ${user.user_type === 'admin' ? 'Administrador' : 'Comum'}
                                            </span>
                                        </td>
                                        <td>
                                            ${user.id !== currentUser.id ? `
                                                <button class="btn btn-primary btn-sm me-2" onclick="editUser(${user.id}, '${user.username}', '${user.user_type}')">
                                                    <i class="bi bi-pencil"></i> Editar
                                                </button>
                                                <button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id}, '${user.username}')">
                                                    <i class="bi bi-trash"></i> Excluir
                                                </button>
                                            ` : `
                                                <button class="btn btn-outline-primary btn-sm me-2" onclick="changeOwnPassword()">
                                                    <i class="bi bi-key"></i> Alterar Senha
                                                </button>
                                                <span class="text-muted">Você</span>
                                            `}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- Modal para criar usuário -->
            <div class="modal fade" id="createUserModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Novo Usuário</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="createUserForm">
                                <div class="mb-3">
                                    <label for="newUsername" class="form-label">Nome de Usuário</label>
                                    <input type="text" class="form-control" id="newUsername" required>
                                </div>
                                <div class="mb-3">
                                    <label for="newPassword" class="form-label">Senha</label>
                                    <input type="password" class="form-control" id="newPassword" required>
                                </div>
                                <div class="mb-3">
                                    <label for="userType" class="form-label">Tipo de Usuário</label>
                                    <select class="form-select" id="userType" required>
                                        <option value="common">Comum</option>
                                        <option value="admin">Administrador</option>
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button type="button" class="btn btn-primary" onclick="createUser()">Criar Usuário</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Modal para editar usuário -->
            <div class="modal fade" id="editUserModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Editar Usuário</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editUserForm">
                                <input type="hidden" id="editUserId">
                                <div class="mb-3">
                                    <label for="editUsername" class="form-label">Nome de Usuário</label>
                                    <input type="text" class="form-control" id="editUsername" required>
                                </div>
                                <div class="mb-3">
                                    <label for="editPassword" class="form-label">Nova Senha (deixe vazio para não alterar)</label>
                                    <input type="password" class="form-control" id="editPassword">
                                </div>
                                <div class="mb-3">
                                    <label for="editUserType" class="form-label">Tipo de Usuário</label>
                                    <select class="form-select" id="editUserType" required>
                                        <option value="common">Comum</option>
                                        <option value="admin">Administrador</option>
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button type="button" class="btn btn-primary" onclick="updateUser()">Atualizar Usuário</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Modal para mudança de senha -->
            <div class="modal fade" id="changePasswordModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Alterar Senha</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="changePasswordForm">
                                <div class="mb-3">
                                    <label for="currentPassword" class="form-label">Senha Atual</label>
                                    <input type="password" class="form-control" id="currentPassword" required>
                                </div>
                                <div class="mb-3">
                                    <label for="newPasswordChange" class="form-label">Nova Senha</label>
                                    <input type="password" class="form-control" id="newPasswordChange" required>
                                </div>
                                <div class="mb-3">
                                    <label for="confirmPassword" class="form-label">Confirmar Nova Senha</label>
                                    <input type="password" class="form-control" id="confirmPassword" required>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button type="button" class="btn btn-primary" onclick="changePassword()">Alterar Senha</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        if (users.length === 0) {
            document.getElementById('usersTableBody').innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-5">
                        <i class="bi bi-people fs-1 text-muted"></i>
                        <h5 class="mt-3">Nenhum usuário encontrado</h5>
                        <p class="text-muted">Clique em "Novo Usuário" para começar</p>
                    </td>
                </tr>
            `;
        }
        
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        document.getElementById('pageContent').innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle me-2"></i>
                Erro ao carregar usuários: ${error.message}
            </div>
        `;
    }
}

function showCreateUserModal() {
    const modal = new bootstrap.Modal(document.getElementById('createUserModal'));
    modal.show();
}

async function createUser() {
    try {
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value;
        const user_type = document.getElementById('userType').value;
        
        if (!username || !password) {
            alert('Todos os campos são obrigatórios');
            return;
        }
        
        await apiRequest('/admin/users', 'POST', { username, password, user_type });
        
        // Fechar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('createUserModal'));
        modal.hide();
        
        // Limpar formulário
        document.getElementById('createUserForm').reset();
        
        // Recarregar lista
        loadUsers();
        
        showSuccess('Usuário criado com sucesso');
        
    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        alert('Erro ao criar usuário: ' + error.message);
    }
}

function editUser(userId, username, userType) {
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUsername').value = username;
    document.getElementById('editUserType').value = userType;
    document.getElementById('editPassword').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
    modal.show();
}

async function updateUser() {
    try {
        const userId = document.getElementById('editUserId').value;
        const username = document.getElementById('editUsername').value.trim();
        const password = document.getElementById('editPassword').value;
        const user_type = document.getElementById('editUserType').value;
        
        if (!username) {
            alert('Nome de usuário é obrigatório');
            return;
        }
        
        const payload = { username, user_type };
        if (password.trim() !== '') {
            payload.password = password;
        }
        
        await apiRequest(`/admin/users/${userId}`, 'PUT', payload);
        
        // Fechar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
        modal.hide();
        
        // Limpar formulário
        document.getElementById('editUserForm').reset();
        
        // Recarregar lista
        loadUsers();
        
        showSuccess('Usuário atualizado com sucesso');
        
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        alert('Erro ao atualizar usuário: ' + error.message);
    }
}

function changeOwnPassword() {
    const modal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
    modal.show();
}

async function changePassword() {
    try {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPasswordChange').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            alert('Todos os campos são obrigatórios');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            alert('Nova senha e confirmação não coincidem');
            return;
        }
        
        if (newPassword.length < 6) {
            alert('Nova senha deve ter pelo menos 6 caracteres');
            return;
        }
        
        await apiRequest('/admin/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                currentPassword: currentPassword,
                newPassword: newPassword 
            })
        });
        
        // Fechar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('changePasswordModal'));
        modal.hide();
        
        // Limpar formulário
        document.getElementById('changePasswordForm').reset();
        
        showSuccess('Senha alterada com sucesso');
        
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        alert('Erro ao alterar senha: ' + error.message);
    }
}

function loadSettings() {
    document.getElementById('pageContent').innerHTML = `
        <h4>Configurações</h4>
        
        <div class="row">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Configurações da API</h5>
                    </div>
                    <div class="card-body">
                        <div class="mb-3">
                            <label class="form-label">Rate Limit (req/min)</label>
                            <input type="number" class="form-control" value="60">
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Cache TTL (horas)</label>
                            <input type="number" class="form-control" value="24">
                        </div>
                        <button class="btn btn-primary">Salvar</button>
                    </div>
                </div>
            </div>
            
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Manutenção</h5>
                    </div>
                    <div class="card-body">
                        <button class="btn btn-warning mb-2 w-100">
                            <i class="bi bi-trash me-2"></i>Limpar Cache Expirado
                        </button>
                        <button class="btn btn-danger mb-2 w-100">
                            <i class="bi bi-arrow-clockwise me-2"></i>Reiniciar WhatsApp
                        </button>
                        <button class="btn btn-outline-danger w-100">
                            <i class="bi bi-download me-2"></i>Exportar Logs
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// WebSocket para QR codes e atualizações em tempo real
function initWebSocket() {
    const token = localStorage.getItem('admin_token');
    if (!token) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    wsClient = io(wsUrl);
    
    wsClient.on('connect', () => {
        console.log('WebSocket conectado');
        wsClient.emit('authenticate', token);
    });
    
    wsClient.on('authenticated', (data) => {
        console.log('WebSocket autenticado');
        wsClient.connected = true;
    });
    
    wsClient.on('qr_code', (data) => {
        console.log('QR Code recebido para instância', data.instanceId);
        console.log('QR Data:', data.qr);
        
        // Verificar se o modal QR está aberto
        const qrModal = document.getElementById('qrCodeModal');
        if (qrModal && qrModal.classList.contains('show')) {
            console.log('Modal QR está aberto, exibindo QR Code');
            showQRCode(data.instanceId, data.qr);
        } else {
            console.log('Modal QR não está aberto, abrindo modal e exibindo QR Code');
            // Abrir modal e mostrar QR Code
            const modal = new bootstrap.Modal(qrModal);
            modal.show();
            setTimeout(() => {
                showQRCode(data.instanceId, data.qr);
            }, 500);
        }
    });
    
    wsClient.on('instance_connected', (data) => {
        console.log('Instância conectada:', data.instanceId);
        hideQRModal();
        showAlert('WhatsApp conectado com sucesso!', 'success');
        setTimeout(() => loadInstancesData(), 1000);
    });
    
    wsClient.on('instance_disconnected', (data) => {
        console.log('Instância desconectada:', data.instanceId);
        hideQRModal();
        showAlert('WhatsApp desconectado', 'warning');
        setTimeout(() => loadInstancesData(), 1000);
    });
    
    wsClient.on('instance_status_changed', (data) => {
        console.log('Status da instância alterado:', data);
        setTimeout(() => loadInstancesData(), 500);
    });
    
    wsClient.on('instances_status', (instances) => {
        console.log('Status das instâncias recebido:', instances);
        // Atualizar interface se necessário
    });
    
    wsClient.on('authentication_failed', () => {
        console.error('Falha na autenticação WebSocket');
        logout();
    });
    
    wsClient.on('error', (error) => {
        console.error('Erro WebSocket:', error);
    });
    
    wsClient.on('disconnect', () => {
        console.log('WebSocket desconectado');
        wsClient.connected = false;
    });
}

// Funções para QR Code
function showQRCode(instanceId, qrData) {
    console.log('Mostrando QR Code para instância', instanceId);
    const container = document.getElementById('qrCodeContainer');
    
    if (!container) {
        console.error('Container qrCodeContainer não encontrado');
        return;
    }
    
    container.innerHTML = '<div id="qrcode"></div>';
    
    // Verificar se QRCode está disponível
    if (typeof QRCode === 'undefined') {
        console.error('QRCode.js não está carregado');
        container.innerHTML = '<div class="alert alert-danger">Erro: QRCode.js não carregado</div>';
        return;
    }
    
    try {
        // Gerar QR Code usando QRCode.js
        new QRCode(document.getElementById("qrcode"), {
            text: qrData,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
        
        console.log('QR Code gerado com sucesso');
    } catch (error) {
        console.error('Erro ao gerar QR Code:', error);
        container.innerHTML = '<div class="alert alert-danger">Erro ao gerar QR Code</div>';
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${username}"?`)) {
        return;
    }
    
    try {
        await apiRequest(`/admin/users/${userId}`, 'DELETE');
        loadUsers();
        showSuccess('Usuário excluído com sucesso');
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        alert('Erro ao excluir usuário: ' + error.message);
    }
}

function showSuccess(message) {
    showAlert(message, 'success');
}

function hideQRModal() {
    if (currentQRModal) {
        currentQRModal.hide();
        currentQRModal = null;
    }
}

function showAlert(message, type = 'info') {
    // Criar alerta Bootstrap
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show position-fixed" 
             style="top: 20px; right: 20px; z-index: 9999; max-width: 400px;" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Adicionar ao body
    document.body.insertAdjacentHTML('beforeend', alertHtml);
    
    // Remover automaticamente após 5 segundos
    setTimeout(() => {
        const alerts = document.querySelectorAll('.alert');
        if (alerts.length > 0) {
            alerts[alerts.length - 1].remove();
        }
    }, 5000);
}

function createInstanceFirst() {
    // Fechar modal de token
    const tokenModal = bootstrap.Modal.getInstance(document.getElementById('createTokenModal'));
    tokenModal.hide();
    
    // Ir para página de instâncias
    loadPage('instances');
    
    // Mostrar modal de criar instância após um tempo
    setTimeout(() => {
        showCreateInstanceModal();
    }, 500);
}
