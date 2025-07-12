class VerificationService {
  constructor(database, whatsappManager) {
    this.db = database;
    this.whatsappManager = whatsappManager;
    this.cacheExpiration = 24 * 60 * 60 * 1000; // 24 horas em ms
  }

  // Verificar número com cache
  async checkNumber(phoneNumber, tokenId = null, ipAddress = null, userAgent = null, forceCheck = false) {
    try {
      // Normalizar número
      const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
      
      if (cleanNumber.length < 10 || cleanNumber.length > 15) {
        throw new Error('Número inválido');
      }

      // Buscar informações do token para identificar a instância
      let instanceId = null;
      if (tokenId) {
        console.log(`🔍 Verificando token ${tokenId} para buscar instância...`);
        const tokenInfo = await this.db.query(
          'SELECT whatsapp_instance_id FROM api_tokens WHERE id = ?',
          [tokenId]
        );
        if (tokenInfo.length > 0) {
          instanceId = tokenInfo[0].whatsapp_instance_id;
          console.log(`📱 Token ${tokenId} associado à instância ${instanceId}`);
        } else {
          console.log(`⚠️  Token ${tokenId} não encontrado no banco`);
        }
      }

      if (!instanceId) {
        throw new Error('Token não possui instância WhatsApp associada');
      }

      // Verificar no cache primeiro (apenas se não for forçado)
      if (!forceCheck) {
        const cached = await this.getCachedResult(cleanNumber);
        if (cached) {
          const isValid = cached.result === 'valid';
          await this.logVerification(tokenId, cleanNumber, isValid, ipAddress, userAgent);
          return {
            phone: cleanNumber,
            input: phoneNumber,
            has_whatsapp: isValid,
            from_cache: true,
            checked_at: cached.cached_at
          };
        }
      }

      // Verificar se a instância está conectada
      console.log(`🔍 Buscando instância ${instanceId}...`);
      const instance = await this.whatsappManager.getInstance(instanceId);
      if (!instance) {
        console.log(`❌ Instância ${instanceId} não encontrada no manager`);
        throw new Error('Instância WhatsApp não encontrada. Verifique se ela foi criada corretamente.');
      }
      
      console.log(`📱 Instância ${instanceId} encontrada, verificando conexão...`);
      if (!instance.isConnected()) {
        console.log(`❌ Instância ${instanceId} não está conectada`);
        throw new Error('Instância WhatsApp não está conectada. Tente novamente em alguns minutos.');
      }
      
      console.log(`✅ Instância ${instanceId} está conectada, prosseguindo com verificação...`);

      // Se não estiver no cache ou for forçado, verificar via WhatsApp
      let result;
      try {
        result = await instance.checkNumber(cleanNumber);
      } catch (error) {
        console.error('Erro ao verificar no WhatsApp:', error);
        throw new Error('Erro ao verificar número no WhatsApp. Tente novamente.');
      }

      // Salvar/atualizar no cache
      await this.saveToCache(cleanNumber, result.exists, result.jid);
      
      // Log da verificação
      await this.logVerification(tokenId, cleanNumber, result.exists, ipAddress, userAgent);

      return {
        phone: cleanNumber,
        input: phoneNumber,
        has_whatsapp: result.exists,
        whatsapp_jid: result.jid,
        from_cache: false,
        forced_check: forceCheck,
        checked_at: new Date().toISOString()
      };

    } catch (error) {
      throw error;
    }
  }

  // Buscar resultado no cache
  async getCachedResult(phoneNumber) {
    try {
      const results = await this.db.query(
        'SELECT * FROM verification_cache WHERE phone = ? AND expires_at > NOW()',
        [phoneNumber]
      );

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Erro ao buscar cache:', error);
      return null;
    }
  }

  // Salvar no cache
  async saveToCache(phoneNumber, isValid, whatsappJid) {
    try {
      const expiresAt = new Date(Date.now() + this.cacheExpiration);
      const result = isValid ? 'valid' : 'invalid';
      
      await this.db.query(
        `INSERT INTO verification_cache (phone, result, expires_at) 
         VALUES (?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
         result = VALUES(result), 
         cached_at = CURRENT_TIMESTAMP, 
         expires_at = VALUES(expires_at)`,
        [phoneNumber, result, expiresAt]
      );
    } catch (error) {
      console.error('Erro ao salvar cache:', error);
    }
  }

  // Log da verificação
  async logVerification(tokenId, phoneNumber, isValid, ipAddress, userAgent) {
    try {
      const result = isValid ? 'valid' : 'invalid';
      await this.db.query(
        'INSERT INTO verification_logs (token_id, phone, result, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
        [tokenId, phoneNumber, result, ipAddress, userAgent]
      );
    } catch (error) {
      console.error('Erro ao fazer log:', error);
    }
  }

  // Limpar cache expirado
  async cleanExpiredCache() {
    try {
      const result = await this.db.query('DELETE FROM phone_cache WHERE expires_at < NOW()');
      console.log(`🧹 Limpeza de cache: ${result.affectedRows} registros removidos`);
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
    }
  }

  // Estatísticas
  async getStats(userId = null) {
    try {
      // Definir condições baseadas no userId
      const userCondition = userId ? 'WHERE vl.token_id IN (SELECT id FROM api_tokens WHERE user_id = ?)' : '';
      const params = userId ? [userId] : [];

      // Total de verificações
      const totalVerifications = await this.db.query(
        `SELECT COUNT(*) as total FROM verification_logs vl ${userCondition}`,
        params
      );

      // Números válidos
      const validNumbers = await this.db.query(
        `SELECT COUNT(*) as total FROM verification_logs vl ${userCondition} ${userCondition ? 'AND' : 'WHERE'} vl.result = 'valid'`,
        params
      );

      // Números inválidos
      const invalidNumbers = await this.db.query(
        `SELECT COUNT(*) as total FROM verification_logs vl ${userCondition} ${userCondition ? 'AND' : 'WHERE'} vl.result = 'invalid'`,
        params
      );

      // Verificações hoje
      const todayVerifications = await this.db.query(
        `SELECT COUNT(*) as total FROM verification_logs vl ${userCondition} ${userCondition ? 'AND' : 'WHERE'} DATE(vl.created_at) = CURDATE()`,
        params
      );

      // Cache não é específico por usuário, então contamos tudo
      let cacheSize = 0;
      try {
        const cacheResult = await this.db.query(
          'SELECT COUNT(*) as total FROM verification_cache WHERE expires_at > NOW()'
        );
        cacheSize = cacheResult[0]?.total || 0;
      } catch (error) {
        // Se a tabela não existir, cache size é 0
        console.log('⚠️  Tabela verification_cache não existe');
        cacheSize = 0;
      }

      // Instâncias ativas (só para admin ou específicas do usuário)
      let activeInstances = 0;
      try {
        const instanceCondition = userId ? 'WHERE user_id = ? AND status = "connected"' : 'WHERE status = "connected"';
        const instanceParams = userId ? [userId] : [];
        
        const instanceResult = await this.db.query(
          `SELECT COUNT(*) as total FROM whatsapp_instances ${instanceCondition}`,
          instanceParams
        );
        activeInstances = instanceResult[0]?.total || 0;
      } catch (error) {
        console.log('⚠️  Erro ao contar instâncias:', error.message);
        activeInstances = 0;
      }

      return {
        total_verifications: totalVerifications[0]?.total || 0,
        today_verifications: todayVerifications[0]?.total || 0,
        valid_numbers: validNumbers[0]?.total || 0,
        invalid_numbers: invalidNumbers[0]?.total || 0,
        cache_size: cacheSize,
        active_instances: activeInstances,
        cache_hit_rate: totalVerifications[0]?.total > 0 
          ? (((totalVerifications[0]?.total - (validNumbers[0]?.total + invalidNumbers[0]?.total)) / totalVerifications[0]?.total) * 100).toFixed(2) 
          : 0
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      throw error;
    }
  }
}

module.exports = VerificationService;
