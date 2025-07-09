require('dotenv').config();
const WhatsAppCheckerAPI = require('./server-admin');

// Inicializar aplicação
const app = new WhatsAppCheckerAPI();
app.start();
