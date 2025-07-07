const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ 
    message: 'WhatsApp Checker API está funcionando!',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

app.get('/check', (req, res) => {
  const number = req.query.number;
  if (!number) {
    return res.status(400).json({ error: 'Informe o número no formato 5588999999999' });
  }

  // Resposta simulada por enquanto
  res.json({
    number,
    exists: true,
    jid: `${number}@s.whatsapp.net`,
    note: 'API funcionando - WhatsApp connection será implementada após deploy'
  });
});

app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
