// Dashboard WebSocket Client
class WebSocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.instances = new Map();
    this.qrCodeIntervals = new Map(); // Para controlar polling de QR codes
  }

  connect(token) {
    console.log('Conectando WebSocket...');
    
    this.socket = io({
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('WebSocket conectado');
      this.socket.emit('authenticate', token);
    });

    this.socket.on('authenticated', (data) => {
      console.log('WebSocket autenticado:', data);
      this.connected = true;
      this.showNotification('Conectado ao servidor em tempo real', 'success');
    });

    this.socket.on('authentication_failed', () => {
      console.error('Falha na autenticação WebSocket');
      this.showNotification('Erro de autenticação', 'error');
    });

    this.socket.on('instances_status', (instances) => {
      console.log('Status das instâncias recebido:', instances);
      this.updateInstancesList(instances);
    });

    this.socket.on('qr_code', (data) => {
      console.log('QR Code recebido para instância:', data.instanceId);
      this.displayQRCode(data.instanceId, data.qr);
    });

    this.socket.on('instance_connected', (data) => {
      console.log('Instância conectada:', data.instanceId);
      this.updateInstanceStatus(data.instanceId, 'connected');
      this.hideQRCode(data.instanceId);
      this.showNotification(`Instância ${data.instanceId} conectada!`, 'success');
    });

    this.socket.on('instance_disconnected', (data) => {
      console.log('Instância desconectada:', data.instanceId);
      this.updateInstanceStatus(data.instanceId, 'disconnected');
      this.showNotification(`Instância ${data.instanceId} desconectada`, 'warning');
    });

    this.socket.on('instance_status_changed', (data) => {
      console.log('Status da instância alterado:', data);
      this.updateInstanceStatus(data.instanceId, data.status);
    });

    this.socket.on('error', (data) => {
      console.error('Erro WebSocket:', data);
      this.showNotification(data.message || 'Erro no servidor', 'error');
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket desconectado');
      this.connected = false;
      this.showNotification('Conexão perdida', 'warning');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }

  requestQRCode(instanceId) {
    if (this.connected && this.socket) {
      console.log('Solicitando QR Code para instância:', instanceId);
      this.socket.emit('request_qr', instanceId);
      
      // Mostrar loading
      this.showQRLoading(instanceId);
    } else {
      console.error('WebSocket não conectado');
      this.showNotification('Não conectado ao servidor', 'error');
    }
  }

  updateInstancesList(instances) {
    const container = document.getElementById('instances-list');
    if (!container) return;

    container.innerHTML = '';
    
    if (instances.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted p-4">
          <i class="fas fa-mobile-alt fa-3x mb-3"></i>
          <p>Nenhuma instância criada ainda</p>
          <button class="btn btn-primary" onclick="showCreateInstanceModal()">
            <i class="fas fa-plus"></i> Criar primeira instância
          </button>
        </div>
      `;
      return;
    }

    instances.forEach(instance => {
      this.instances.set(instance.id, instance);
      const instanceCard = this.createInstanceCard(instance);
      container.appendChild(instanceCard);
    });
  }

  createInstanceCard(instance) {
    const card = document.createElement('div');
    card.className = 'col-md-6 col-lg-4 mb-4';
    card.id = `instance-${instance.id}`;
    
    const statusClass = this.getStatusClass(instance.status);
    const statusIcon = this.getStatusIcon(instance.status);
    
    card.innerHTML = `
      <div class="card h-100">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h6 class="mb-0">
            <i class="fas fa-mobile-alt"></i> ${instance.name}
          </h6>
          <span class="badge ${statusClass}">
            <i class="${statusIcon}"></i> ${this.getStatusText(instance.status)}
          </span>
        </div>
        <div class="card-body">
          <div class="mb-3">
            <small class="text-muted">ID: ${instance.id}</small><br>
            <small class="text-muted">Criado: ${new Date(instance.created_at).toLocaleDateString()}</small>
          </div>
          
          <div id="qr-container-${instance.id}" class="qr-container mb-3" style="display: none;">
            <div class="text-center">
              <div id="qr-loading-${instance.id}" class="qr-loading">
                <div class="spinner-border text-primary" role="status">
                  <span class="sr-only">Carregando...</span>
                </div>
                <p class="mt-2">Gerando QR Code...</p>
              </div>
              <div id="qr-code-${instance.id}" class="qr-code" style="display: none;"></div>
            </div>
          </div>
          
          <div class="btn-group w-100" role="group">
            ${this.getInstanceActions(instance)}
          </div>
        </div>
      </div>
    `;
    
    return card;
  }

  getInstanceActions(instance) {
    if (instance.status === 'connected') {
      return `
        <button class="btn btn-success btn-sm flex-fill" disabled>
          <i class="fas fa-check"></i> Conectado
        </button>
        <button class="btn btn-warning btn-sm" onclick="disconnectInstance(${instance.id})">
          <i class="fas fa-unlink"></i>
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteInstance(${instance.id})">
          <i class="fas fa-trash"></i>
        </button>
      `;
    } else {
      return `
        <button class="btn btn-primary btn-sm flex-fill" onclick="wsClient.requestQRCode(${instance.id})">
          <i class="fas fa-qrcode"></i> Conectar
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteInstance(${instance.id})">
          <i class="fas fa-trash"></i>
        </button>
      `;
    }
  }

  updateInstanceStatus(instanceId, status) {
    const card = document.getElementById(`instance-${instanceId}`);
    if (!card) return;

    const badge = card.querySelector('.badge');
    const actionsContainer = card.querySelector('.btn-group');
    
    if (badge) {
      const statusClass = this.getStatusClass(status);
      const statusIcon = this.getStatusIcon(status);
      
      badge.className = `badge ${statusClass}`;
      badge.innerHTML = `<i class="${statusIcon}"></i> ${this.getStatusText(status)}`;
    }
    
    if (actionsContainer) {
      const instance = this.instances.get(instanceId);
      if (instance) {
        instance.status = status;
        actionsContainer.innerHTML = this.getInstanceActions(instance);
      }
    }
  }

  showQRLoading(instanceId) {
    const container = document.getElementById(`qr-container-${instanceId}`);
    const loading = document.getElementById(`qr-loading-${instanceId}`);
    const qrCode = document.getElementById(`qr-code-${instanceId}`);
    
    if (container && loading && qrCode) {
      container.style.display = 'block';
      loading.style.display = 'block';
      qrCode.style.display = 'none';
    }
  }

  displayQRCode(instanceId, qrData) {
    const container = document.getElementById(`qr-container-${instanceId}`);
    const loading = document.getElementById(`qr-loading-${instanceId}`);
    const qrCode = document.getElementById(`qr-code-${instanceId}`);
    
    if (container && loading && qrCode) {
      // Gerar QR Code usando qrcode.js
      qrCode.innerHTML = '';
      QRCode.toCanvas(qrCode, qrData, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }, (error) => {
        if (error) {
          console.error('Erro ao gerar QR Code:', error);
          qrCode.innerHTML = '<p class="text-danger">Erro ao gerar QR Code</p>';
        } else {
          console.log('QR Code gerado com sucesso');
        }
      });
      
      loading.style.display = 'none';
      qrCode.style.display = 'block';
    }
  }

  hideQRCode(instanceId) {
    const container = document.getElementById(`qr-container-${instanceId}`);
    if (container) {
      container.style.display = 'none';
    }
  }

  getStatusClass(status) {
    switch (status) {
      case 'connected': return 'badge-success';
      case 'connecting': return 'badge-warning';
      case 'disconnected': return 'badge-secondary';
      default: return 'badge-secondary';
    }
  }

  getStatusIcon(status) {
    switch (status) {
      case 'connected': return 'fas fa-check-circle';
      case 'connecting': return 'fas fa-sync fa-spin';
      case 'disconnected': return 'fas fa-times-circle';
      default: return 'fas fa-question-circle';
    }
  }

  getStatusText(status) {
    switch (status) {
      case 'connected': return 'Conectado';
      case 'connecting': return 'Conectando';
      case 'disconnected': return 'Desconectado';
      default: return 'Desconhecido';
    }
  }

  showNotification(message, type = 'info') {
    const alertClass = {
      'success': 'alert-success',
      'error': 'alert-danger',
      'warning': 'alert-warning',
      'info': 'alert-info'
    }[type] || 'alert-info';

    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
      ${message}
      <button type="button" class="close" data-dismiss="alert">
        <span>&times;</span>
      </button>
    `;

    document.body.appendChild(notification);

    // Auto remove após 5 segundos
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }
}

// Instância global do WebSocket client
const wsClient = new WebSocketClient();

// Conectar WebSocket quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
  const token = localStorage.getItem('admin_token');
  if (token && window.location.pathname.includes('dashboard')) {
    wsClient.connect(token);
  }
});

// Cleanup ao sair da página
window.addEventListener('beforeunload', function() {
  wsClient.disconnect();
});
