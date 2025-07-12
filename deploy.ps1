# Script de Deploy para Windows com Preservação de Sessão WhatsApp
# Este script realiza deploy sem perder as conexões WhatsApp

Write-Host "🚀 Iniciando deploy com preservação de sessão..." -ForegroundColor Green

# Verificar se PM2 está instalado
try {
    pm2 --version | Out-Null
    Write-Host "✅ PM2 encontrado" -ForegroundColor Green
} catch {
    Write-Host "❌ PM2 não está instalado. Instalando..." -ForegroundColor Red
    npm install -g pm2
}

# Criar diretório de logs se não existir
if (!(Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs"
    Write-Host "📁 Diretório de logs criado" -ForegroundColor Yellow
}

# Fazer backup das sessões (opcional, para segurança)
Write-Host "💾 Criando backup das sessões..." -ForegroundColor Yellow
if (Test-Path "auth") {
    $backupName = "auth-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -Path "auth" -Destination $backupName -Recurse
    Write-Host "✅ Backup criado: $backupName" -ForegroundColor Green
} else {
    Write-Host "⚠️  Diretório auth não encontrado" -ForegroundColor Yellow
}

# Verificar se o processo já está rodando
try {
    $processInfo = pm2 describe whatsapp-checker-api 2>$null
    if ($processInfo) {
        Write-Host "🔄 Aplicação já está rodando, fazendo reload..." -ForegroundColor Blue
        
        # Reload sem perder conexões (graceful restart)
        pm2 reload ecosystem.config.js --update-env
        
        Write-Host "⏳ Aguardando aplicação estabilizar..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        
        # Verificar se reload foi bem-sucedido
        $status = pm2 describe whatsapp-checker-api | Select-String "online"
        if ($status) {
            Write-Host "✅ Reload concluído com sucesso!" -ForegroundColor Green
            Write-Host "📊 Status das aplicações:" -ForegroundColor Cyan
            pm2 status
        } else {
            Write-Host "❌ Erro no reload, tentando restart..." -ForegroundColor Red
            pm2 restart whatsapp-checker-api
        }
    }
} catch {
    Write-Host "🚀 Primeira execução, iniciando aplicação..." -ForegroundColor Blue
    pm2 start ecosystem.config.js
}

# Verificar health check
Write-Host "🔍 Verificando health check..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

try {
    $healthCheck = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 10
    if ($healthCheck.StatusCode -eq 200) {
        Write-Host "✅ Aplicação está saudável!" -ForegroundColor Green
        Write-Host "🌐 Acesse: http://localhost:3000" -ForegroundColor Cyan
        Write-Host "🔧 Admin: http://localhost:3000/admin" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  Health check retornou: $($healthCheck.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Health check falhou: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "📋 Logs recentes:" -ForegroundColor Cyan
    pm2 logs whatsapp-checker-api --lines 20
}

# Mostrar status final
Write-Host "📊 Status final:" -ForegroundColor Cyan
pm2 status

Write-Host "🎉 Deploy concluído!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Comandos úteis:" -ForegroundColor Cyan
Write-Host "  pm2 status                    - Ver status"
Write-Host "  pm2 logs whatsapp-checker-api - Ver logs"
Write-Host "  pm2 restart whatsapp-checker-api - Restart"
Write-Host "  pm2 stop whatsapp-checker-api - Parar"
Write-Host "  pm2 delete whatsapp-checker-api - Remover"
Write-Host "  pm2 monit                     - Monitor em tempo real"
