const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');

class WhatsAppChecker {
  constructor() {
    this.socket = null;
    this.authDir = path.join(__dirname, '../../auth');
    this.onQR = null;
    this.onConnected = null;
    this.onDisconnected = null;
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
        console.log('QR Code gerado');
        // Para terminal (desenvolvimento)
        qrcode.generate(qr, { small: true });
        // Para interface web (produção)
        if (this.onQR) this.onQR(qr);
      }
      
      if (connection === 'close') {
        console.log('Conexão fechada:', lastDisconnect?.error);
        if (this.onDisconnected) this.onDisconnected();
      } else if (connection === 'open') {
        console.log('Conectado ao WhatsApp com sucesso!');
        if (this.onConnected) this.onConnected();
      }
    });
  }

  async checkNumber(number) {
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
