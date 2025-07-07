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
    this.app.get('/check', async (req, res) => {
      const number = req.query.number;
      if (!number) {
        return res.status(400).json({ error: 'Informe o número no formato 5588999999999' });
      }

      try {
        const result = await this.whatsapp.checkNumber(number);
        return res.json(result);
      } catch (err) {
        console.error('Erro ao verificar número:', err);
        return res.status(500).json({ error: 'Erro interno ao checar número' });
      }
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
