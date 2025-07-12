const WhatsAppChecker = require('./WhatsAppChecker');
const path = require('path');

class WhatsAppManager {
  constructor(database) {
    this.db = database;
    this.instances = new Map(); // instanceId -> WhatsAppChecker
  }

  async createInstance(userId, instanceName) {
    try {
      const authPath = `auth/user_${userId}_${Date.now()}`;
      
      // Salvar no banco
      const result = await this.db.query(
        'INSERT INTO whatsapp_instances (user_id, name, auth_path, status) VALUES (?, ?, ?, ?)',
        [userId, instanceName, authPath, 'disconnected']
      );
      
      const instanceId = result.insertId;
      
      // Criar checker
      const checker = new WhatsAppChecker(authPath);
      this.instances.set(instanceId, checker);
      
      // Configurar eventos
      this.setupInstanceEvents(instanceId, checker);
      
      return { instanceId, checker };
    } catch (error) {
      console.error('❌ Erro ao criar instância:', error);
      throw error;
    }
  }

  setupInstanceEvents(instanceId, checker, callbacks = {}) {
    checker.on('ready', async () => {
      await this.updateInstanceStatus(instanceId, 'connected');
      if (callbacks.onConnected) {
        callbacks.onConnected();
      }
    });

    checker.on('disconnected', async () => {
      await this.updateInstanceStatus(instanceId, 'disconnected');
      if (callbacks.onDisconnected) {
        callbacks.onDisconnected();
      }
    });

    checker.on('qr', (qr) => {
      console.log(`📱 QR Code gerado para instância ${instanceId}`);
      if (callbacks.onQRCode) {
        callbacks.onQRCode(qr);
      }
    });
  }

  async updateInstanceStatus(instanceId, status) {
    try {
      await this.db.query(
        'UPDATE whatsapp_instances SET status = ? WHERE id = ?',
        [status, instanceId]
      );
    } catch (error) {
      console.error('❌ Erro ao atualizar status:', error);
    }
  }

  async getInstance(instanceId) {
    if (this.instances.has(instanceId)) {
      return this.instances.get(instanceId);
    }

    // Carregar do banco se não estiver em memória
    const results = await this.db.query(
      'SELECT * FROM whatsapp_instances WHERE id = ?',
      [instanceId]
    );

    if (results.length === 0) {
      throw new Error('Instância não encontrada');
    }

    const instance = results[0];
    const checker = new WhatsAppChecker(instance.auth_path);
    this.instances.set(instanceId, checker);
    this.setupInstanceEvents(instanceId, checker);

    return checker;
  }

  async getUserInstances(userId) {
    const results = await this.db.query(
      'SELECT * FROM whatsapp_instances WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    
    // Log para debug
    console.log(`📱 Instâncias encontradas para usuário ${userId}:`, results.length);
    results.forEach(instance => {
      console.log(`  - ID: ${instance.id}, Nome: ${instance.name}, Status: ${instance.status}`);
    });
    
    return results;
  }

  async deleteInstance(instanceId, userId) {
    try {
      // Verificar se pertence ao usuário
      const results = await this.db.query(
        'SELECT * FROM whatsapp_instances WHERE id = ? AND user_id = ?',
        [instanceId, userId]
      );

      if (results.length === 0) {
        throw new Error('Instância não encontrada ou não autorizada');
      }

      // Desconectar se estiver ativo
      if (this.instances.has(instanceId)) {
        const checker = this.instances.get(instanceId);
        checker.disconnect();
        this.instances.delete(instanceId);
      }

      // Remover do banco
      await this.db.query('DELETE FROM whatsapp_instances WHERE id = ?', [instanceId]);

      // Remover pasta de autenticação
      const fs = require('fs');
      const authPath = path.join(__dirname, '../../', results[0].auth_path);
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
      }

      return true;
    } catch (error) {
      console.error('❌ Erro ao deletar instância:', error);
      throw error;
    }
  }

  async connectInstance(instanceId, callbacks = {}) {
    try {
      const checker = await this.getInstance(instanceId);
      
      // Reconfigurar eventos com os callbacks
      this.setupInstanceEvents(instanceId, checker, callbacks);
      
      await checker.connect();
      
      return checker;
    } catch (error) {
      console.error('❌ Erro ao conectar instância:', error);
      throw error;
    }
  }

  async disconnectInstance(instanceId) {
    if (this.instances.has(instanceId)) {
      const checker = this.instances.get(instanceId);
      checker.disconnect();
      await this.updateInstanceStatus(instanceId, 'disconnected');
    }
  }

  async getUserInstance(userId, instanceId) {
    const results = await this.db.query(
      'SELECT * FROM whatsapp_instances WHERE id = ? AND user_id = ?',
      [instanceId, userId]
    );
    
    return results.length > 0 ? results[0] : null;
  }

  async getInstanceByToken(tokenId) {
    try {
      const result = await this.db.query(
        'SELECT whatsapp_instance_id FROM api_tokens WHERE id = ?',
        [tokenId]
      );
      
      if (result.length === 0) {
        return null;
      }
      
      const instanceId = result[0].whatsapp_instance_id;
      return this.getInstance(instanceId);
    } catch (error) {
      console.error('❌ Erro ao buscar instância por token:', error);
      return null;
    }
  }
  
  getAllInstances() {
    return Array.from(this.instances.values());
  }

  // Inicializar todas as instâncias salvas (para uso no startup)
  async initializeAllInstances() {
    try {
      console.log('🔄 Inicializando instâncias salvas...');
      
      // Buscar todas as instâncias do banco
      const instances = await this.db.query(
        'SELECT * FROM whatsapp_instances ORDER BY created_at DESC'
      );
      
      console.log(`📱 Encontradas ${instances.length} instâncias para inicializar`);
      
      for (const instance of instances) {
        try {
          await this.initializeInstance(instance);
        } catch (error) {
          console.error(`❌ Erro ao inicializar instância ${instance.id}:`, error.message);
        }
      }
      
      console.log('✅ Inicialização de instâncias concluída');
    } catch (error) {
      console.error('❌ Erro ao inicializar instâncias:', error);
    }
  }

  // Inicializar uma instância específica
  async initializeInstance(instanceData) {
    const { id, auth_path, name, user_id } = instanceData;
    
    console.log(`🔄 Inicializando instância ${id} (${name}) para usuário ${user_id}`);
    
    // Verificar se auth files existem
    const fs = require('fs');
    const authExists = fs.existsSync(auth_path) && 
                      fs.existsSync(`${auth_path}/creds.json`);
    
    if (!authExists) {
      console.log(`⚠️  Instância ${id}: Auth files não encontrados, status: disconnected`);
      await this.updateInstanceStatus(id, 'disconnected');
      return;
    }
    
    // Criar WhatsAppChecker
    const checker = new WhatsAppChecker(auth_path);
    this.instances.set(id, checker);
    
    // Configurar eventos
    this.setupInstanceEvents(id, checker, {
      onConnected: () => {
        console.log(`✅ Instância ${id} reconectada automaticamente`);
      },
      onDisconnected: () => {
        console.log(`❌ Instância ${id} desconectada`);
      }
    });
    
    // Tentar conectar automaticamente
    try {
      console.log(`🔄 Tentando reconectar instância ${id}...`);
      await checker.connect();
      
      // Se conectou sem erro, marcar como connecting (vai para connected quando ready)
      await this.updateInstanceStatus(id, 'connecting');
    } catch (error) {
      console.log(`⚠️  Instância ${id}: Falha na reconexão automática - ${error.message}`);
      await this.updateInstanceStatus(id, 'disconnected');
    }
  }

  // Reconectar todas as instâncias (útil para restart graceful)
  async reconnectAllInstances() {
    console.log('🔄 Reconectando todas as instâncias...');
    
    for (const [instanceId, checker] of this.instances) {
      try {
        if (checker && !checker.isConnected()) {
          console.log(`🔄 Reconectando instância ${instanceId}...`);
          await checker.connect();
        }
      } catch (error) {
        console.error(`❌ Erro ao reconectar instância ${instanceId}:`, error.message);
      }
    }
  }

  // Parar todas as instâncias gracefully (para shutdown)
  async disconnectAllInstances() {
    console.log('🛑 Desconectando todas as instâncias...');
    
    for (const [instanceId, checker] of this.instances) {
      try {
        if (checker && checker.isConnected()) {
          console.log(`🛑 Desconectando instância ${instanceId}...`);
          await checker.disconnect();
        }
      } catch (error) {
        console.error(`❌ Erro ao desconectar instância ${instanceId}:`, error.message);
      }
    }
    
    this.instances.clear();
  }

  // Verificar status de uma instância
  isInstanceConnected(instanceId) {
    const checker = this.instances.get(instanceId);
    return checker ? checker.isConnected() : false;
  }

  // Obter estatísticas das instâncias
  getInstancesStats() {
    const total = this.instances.size;
    let connected = 0;
    let disconnected = 0;
    
    for (const [instanceId, checker] of this.instances) {
      if (checker.isConnected()) {
        connected++;
      } else {
        disconnected++;
      }
    }
    
    return { total, connected, disconnected };
  }
}

module.exports = WhatsAppManager;
