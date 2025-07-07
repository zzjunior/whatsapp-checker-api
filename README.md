# WhatsApp Checker API

API para verificar se um número possui WhatsApp, usando Baileys.js.

## Como funciona

- Baseada em Node.js + Express
- Conecta via WhatsApp Web (Baileys)
- Não envia mensagens, apenas consulta se o número está registrado

## Deploy no Railway

1. Crie um repositório no GitHub com os arquivos.
2. Vá no [Railway](https://railway.app/), clique em 'New Project' e escolha 'Deploy from GitHub'.
3. Railway detecta e usa o `start.sh` para manter o processo vivo.
4. O QR Code será exibido nos logs na primeira execução. Escaneie com o número que você usará.

## Segurança

- `auth.json` armazena a sessão de login. Railway mantém o filesystem vivo durante a execução.
- Configure Railway para manter o container sempre rodando.
