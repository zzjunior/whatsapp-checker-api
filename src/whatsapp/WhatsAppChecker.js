const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { EventEmitter } = require('events');
const path = require('path');
const config = require('../config/whatsapp');

class WhatsAppChecker extends EventEmitter {
  constructor(customAuthDir = null) {
    super();
    this.socket = null;
    this.authDir = customAuthDir 
      ? path.join(__dirname, '../../', customAuthDir)
      : path.join(__dirname, '../../auth');
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.maxReconnectAttempts;
    this.reconnectDelay = config.reconnectDelay;
    this.isConnecting = false;
  }

  async connect() {
    if (this.isConnecting) {
      console.log('🔄 Conexão já em andamento...');
      return;
    }

    this.isConnecting = true;
    
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      
      // Criar um logger apropriado
      const logger = {
        level: config.logLevel,
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        child: () => logger
      };
      
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: config.printQRInTerminal,
        logger: logger,
        browser: config.browser,
        connectTimeoutMs: config.connectTimeoutMs,
        defaultQueryTimeoutMs: config.defaultQueryTimeoutMs,
        keepAliveIntervalMs: config.keepAliveIntervalMs,
        generateHighQualityLinkPreview: config.generateHighQualityLinkPreview,
        syncFullHistory: config.syncFullHistory,
        markOnlineOnConnect: config.markOnlineOnConnect,
      });

      this.socket.ev.on('creds.update', saveCreds);
      
      this.socket.ev.on('connection.update', (update) => {
        this.handleConnectionUpdate(update);
      });

      this.socket.ev.on('messages.upsert', () => {
        // Ignorar mensagens para reduzir overhead
      });

    } catch (error) {
      console.error('❌ Erro ao conectar:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('📱 QR Code gerado');
      this.emit('qr', qr);
    }
    
    if (connection === 'close') {
      this.isConnecting = false;
      const shouldReconnect = this.handleDisconnection(lastDisconnect);
      
      if (shouldReconnect) {
        this.scheduleReconnect();
      } else {
        console.log('❌ WhatsApp OFF - Não tentando reconectar');
        this.emit('disconnected', lastDisconnect?.error);
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp conectado!');
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.emit('ready');
    } else if (connection === 'connecting') {
      console.log('🔄 Conectando ao WhatsApp...');
    }
  }

  handleDisconnection(lastDisconnect) {
    const reason = lastDisconnect?.error?.output?.statusCode;
    console.log('❌ Conexão fechada. Motivo:', reason);

    switch (reason) {
      case DisconnectReason.badSession:
        console.log('❌ Sessão inválida, deletando e reconectando...');
        this.clearAuth();
        return true;
      
      case DisconnectReason.connectionClosed:
        console.log('🔄 Conexão fechada, tentando reconectar...');
        return true;
      
      case DisconnectReason.connectionLost:
        console.log('🔄 Conexão perdida, tentando reconectar...');
        return true;
      
      case DisconnectReason.connectionReplaced:
        console.log('❌ Conexão substituída por outra sessão');
        return false;
      
      case DisconnectReason.loggedOut:
        console.log('❌ Deslogado, deletando sessão...');
        this.clearAuth();
        return true;
      
      case DisconnectReason.restartRequired:
        console.log('🔄 Restart necessário, reconectando...');
        return true;
      
      case DisconnectReason.timedOut:
        console.log('⏱️ Timeout, tentando reconectar...');
        return true;
      
      default:
        console.log('🔄 Motivo desconhecido, tentando reconectar...');
        return true;
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`❌ Máximo de ${this.maxReconnectAttempts} tentativas de reconexão atingido`);
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`🔄 Tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${delay/1000}s...`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  clearAuth() {
    try {
      const fs = require('fs');
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        console.log('🗑️ Autenticação removida');
      }
    } catch (error) {
      console.error('❌ Erro ao remover autenticação:', error);
    }
  }

  async checkNumber(number) {
    if (!this.socket) {
      throw new Error('WhatsApp não conectado');
    }
    
    try {
      const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
      
      // Implementar timeout e retry
      return await this.withRetry(async () => {
        return await Promise.race([
          this.socket.onWhatsApp(jid),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout na verificação')), config.checkNumberTimeout)
          )
        ]);
      }).then(([result]) => ({
        number,
        exists: result?.exists || false,
        jid: result?.jid || null,
      }));
      
    } catch (error) {
      console.error('❌ Erro ao verificar número:', error);
      throw error;
    }
  }

  async withRetry(operation, maxAttempts = config.maxRetryAttempts) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        
        console.log(`🔄 Tentativa ${attempt}/${maxAttempts} falhou, tentando novamente em ${config.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
      }
    }
  }

  // Verificar se está conectado
  isConnected() {
    return this.socket && this.socket.user && !this.isConnecting;
  }

  // Obter status da conexão
  getConnectionStatus() {
    if (!this.socket) return 'disconnected';
    if (this.isConnecting) return 'connecting';
    if (this.socket.user) return 'connected';
    return 'disconnected';
  }

  // Desconectar gracefully
  async disconnect() {
    try {
      if (this.socket) {
        console.log('🛑 Desconectando WhatsApp...');
        await this.socket.logout();
        this.socket = null;
      }
      this.isConnecting = false;
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('❌ Erro ao desconectar:', error);
    }
  }
}

module.exports = WhatsAppChecker;
