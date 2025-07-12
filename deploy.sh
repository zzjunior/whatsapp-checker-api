#!/bin/bash

# Script de Deploy com Preservação de Sessão WhatsApp
# Este script realiza deploy sem perder as conexões WhatsApp

echo "🚀 Iniciando deploy com preservação de sessão..."

# Verificar se PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 não está instalado. Instalando..."
    npm install -g pm2
fi

# Criar diretório de logs se não existir
mkdir -p logs

# Fazer backup das sessões (opcional, para segurança)
echo "💾 Criando backup das sessões..."
if [ -d "auth" ]; then
    cp -r auth "auth-backup-$(date +%Y%m%d-%H%M%S)"
    echo "✅ Backup criado"
else
    echo "⚠️  Diretório auth não encontrado"
fi

# Verificar se o processo já está rodando
if pm2 describe whatsapp-checker-api > /dev/null 2>&1; then
    echo "🔄 Aplicação já está rodando, fazendo reload..."
    
    # Reload sem perder conexões (graceful restart)
    pm2 reload ecosystem.config.js --update-env
    
    echo "⏳ Aguardando aplicação estabilizar..."
    sleep 10
    
    # Verificar se reload foi bem-sucedido
    if pm2 describe whatsapp-checker-api | grep -q "online"; then
        echo "✅ Reload concluído com sucesso!"
        echo "📊 Status das aplicações:"
        pm2 status
    else
        echo "❌ Erro no reload, tentando restart..."
        pm2 restart whatsapp-checker-api
    fi
else
    echo "🚀 Primeira execução, iniciando aplicação..."
    pm2 start ecosystem.config.js
fi

# Verificar health check
echo "🔍 Verificando health check..."
sleep 5

HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)

if [ "$HEALTH_CHECK" = "200" ]; then
    echo "✅ Aplicação está saudável!"
    echo "🌐 Acesse: http://localhost:3000"
    echo "🔧 Admin: http://localhost:3000/admin"
else
    echo "⚠️  Health check falhou (HTTP $HEALTH_CHECK)"
    echo "📋 Logs recentes:"
    pm2 logs whatsapp-checker-api --lines 20
fi

# Mostrar status final
echo "📊 Status final:"
pm2 status
pm2 monit

echo "🎉 Deploy concluído!"
echo ""
echo "📋 Comandos úteis:"
echo "  pm2 status                    - Ver status"
echo "  pm2 logs whatsapp-checker-api - Ver logs"
echo "  pm2 restart whatsapp-checker-api - Restart"
echo "  pm2 stop whatsapp-checker-api - Parar"
echo "  pm2 delete whatsapp-checker-api - Remover"
