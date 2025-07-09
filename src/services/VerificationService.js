class VerificationService {
  constructor(database, whatsappChecker) {
    this.db = database;
    this.whatsapp = whatsappChecker;
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

      // Verificar no cache primeiro (apenas se não for forçado)
      if (!forceCheck) {
        const cached = await this.getCachedResult(cleanNumber);
        if (cached) {
          await this.logVerification(tokenId, cleanNumber, cached.is_valid, ipAddress, userAgent);
          return {
            phone: cleanNumber,
            input: phoneNumber,
            has_whatsapp: cached.is_valid,
            whatsapp_jid: cached.whatsapp_jid,
            from_cache: true,
            checked_at: cached.last_checked
          };
        }
      }

      // Verificar se WhatsApp está conectado
      if (!this.whatsapp || !this.whatsapp.isConnected()) {
        throw new Error('WhatsApp não está conectado. Tente novamente em alguns minutos.');
      }

      // Se não estiver no cache ou for forçado, verificar via WhatsApp
      let result;
      try {
        result = await this.whatsapp.checkNumber(cleanNumber);
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
        'SELECT * FROM phone_cache WHERE phone_number = ? AND expires_at > NOW()',
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
      
      await this.db.query(
        `INSERT INTO phone_cache (phone_number, is_valid, whatsapp_jid, expires_at) 
         VALUES (?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
         is_valid = VALUES(is_valid), 
         whatsapp_jid = VALUES(whatsapp_jid), 
         last_checked = CURRENT_TIMESTAMP, 
         expires_at = VALUES(expires_at)`,
        [phoneNumber, isValid, whatsappJid, expiresAt]
      );
    } catch (error) {
      console.error('Erro ao salvar cache:', error);
    }
  }

  // Log da verificação
  async logVerification(tokenId, phoneNumber, isValid, ipAddress, userAgent) {
    try {
      await this.db.query(
        'INSERT INTO verification_logs (token_id, phone_number, is_valid, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
        [tokenId, phoneNumber, isValid, ipAddress, userAgent]
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
  async getStats(tokenId = null) {
    try {
      const where = tokenId ? 'WHERE token_id = ?' : '';
      const params = tokenId ? [tokenId] : [];

      const [totalVerifications] = await this.db.query(
        `SELECT COUNT(*) as total FROM verification_logs ${where}`,
        params
      );

      const [validNumbers] = await this.db.query(
        `SELECT COUNT(*) as total FROM verification_logs ${where} AND is_valid = TRUE`,
        params
      );

      const [invalidNumbers] = await this.db.query(
        `SELECT COUNT(*) as total FROM verification_logs ${where} AND is_valid = FALSE`,
        params
      );

      const [cacheSize] = await this.db.query(
        'SELECT COUNT(*) as total FROM phone_cache WHERE expires_at > NOW()'
      );

      return {
        total_verifications: totalVerifications.total,
        valid_numbers: validNumbers.total,
        invalid_numbers: invalidNumbers.total,
        cache_size: cacheSize.total,
        cache_hit_rate: totalVerifications.total > 0 
          ? ((totalVerifications.total - (validNumbers.total + invalidNumbers.total)) / totalVerifications.total * 100).toFixed(2) 
          : 0
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = VerificationService;
