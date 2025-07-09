require('dotenv').config();
const express = require('express');
const WhatsAppChecker = require('./whatsapp/WhatsAppChecker');

class App {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.whatsapp = new WhatsAppChecker();
    this.routes();
  }

  routes() {
    // Todas as rotas foram movidas para server-admin.js
    // Esta versão não tem rotas públicas por motivos de segurança
    this.app.get('/', (req, res) => {
      res.json({ 
        message: 'WhatsApp Checker API - Use /admin para acessar o painel',
        admin: 'http://localhost:3000/admin'
      });
    });
  }

  async start() {
    await this.whatsapp.connect();
    this.app.listen(this.port, () => {
      console.log(`API rodando em http://localhost:${this.port}`);
    });
  }
}

new App().start();
