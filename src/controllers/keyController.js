import pool from '../config/db.js';
import crypto from 'crypto'

const createKey = async(req, res) => {
    
    const { tenantId, label } = req.body;
     if(!tenantId || !label){
        return res.status(400).json({
            message: "tenantId and label are required"
        })
     };
    try {
        const rawKey = crypto.randomBytes(32).toString('hex');
        const hashKey = crypto.createHash('sha256').update(rawKey).digest('hex');

        const result = await pool.query('INSERT INTO api_keys (tenant_id, key_hash, label) VALUES ($1 , $2, $3) RETURNING id, tenant_id, label, created_at',
            [tenantId, hashKey, label]);

         return res.status(201).json(
            {
               message: 'key generated successfully',
               apiKey: rawKey,
               keyDetails: result.rows[0]
            });
    } catch (error) {
        console.error(error)
        return res.status(500).json({
            message: 'internal server error'
        });

    }
};

const revokeKey = async(req, res) =>{
    const keyId = req.params.id;
    const tenantId = req.user.tenant_id;
  
    try {
       
    const result = await pool.query(
            'UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING id, label, revoked_at',
            [keyId, tenantId]
        );

         if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'API key not found or not owned by this tenant'
            });
        }
     return res.status(200).json({
            message: 'API key revoked successfully',
            key: result.rows[0]
        });

    } catch (error) {
         console.error(error);
        return res.status(500).json({
            message: 'internal server error'
        });
    }
}

export { createKey, revokeKey };