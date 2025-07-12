-- Debug script para verificar dados do banco após as mudanças

-- 1. Verificar structure das tabelas
DESCRIBE api_tokens;
DESCRIBE whatsapp_instances;

-- 2. Verificar tokens e suas instâncias
SELECT 
    t.id as token_id,
    t.name as token_name,
    t.whatsapp_instance_id,
    i.id as instance_id,
    i.name as instance_name,
    i.status as instance_status,
    i.auth_path,
    t.user_id,
    u.username
FROM api_tokens t
LEFT JOIN whatsapp_instances i ON t.whatsapp_instance_id = i.id
LEFT JOIN users u ON t.user_id = u.id
ORDER BY t.id;

-- 3. Verificar instâncias sem tokens
SELECT 
    i.id,
    i.name,
    i.status,
    i.auth_path,
    i.user_id,
    u.username,
    (SELECT COUNT(*) FROM api_tokens WHERE whatsapp_instance_id = i.id) as token_count
FROM whatsapp_instances i
LEFT JOIN users u ON i.user_id = u.id
ORDER BY i.id;

-- 4. Verificar tokens sem instância (problema)
SELECT 
    t.id,
    t.name,
    t.whatsapp_instance_id,
    t.user_id,
    u.username
FROM api_tokens t
LEFT JOIN users u ON t.user_id = u.id
WHERE t.whatsapp_instance_id IS NULL
ORDER BY t.id;
