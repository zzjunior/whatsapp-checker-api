const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { EventEmitter } = require('events');
const path = require('path');

class WhatsAppChecker extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.authDir = path.join(__dirname, '../../auth');
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    
    this.socket = makeWASocket({
      auth: state,
    });

    this.socket.ev.on('creds.update', saveCreds);
    
    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('📱 QR Code gerado');
        this.emit('qr', qr);
      }
      
      if (connection === 'close') {
        console.log('❌ Conexão fechada');
        this.emit('disconnected', lastDisconnect?.error);
      } else if (connection === 'open') {
        console.log('✅ WhatsApp conectado!');
        this.emit('ready');
      }
    });
  }

  async checkNumber(number) {
    if (!this.socket) {
      throw new Error('WhatsApp não conectado');
    }
    
    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
    const [result] = await this.socket.onWhatsApp(jid);
    return {
      number,
      exists: result?.exists || false,
      jid: result?.jid || null,
    };
  }
}

module.exports = WhatsAppChecker;
