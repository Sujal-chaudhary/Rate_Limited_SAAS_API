import pool from '../config/db.js';

const createResources = async(req , res) => {
    const tenantId = req.user.tenant_id;
    const { name } = req.body;
    if(!name){
         return res.status(400).json({
            message: "name is required"
        })
    };
    try {
        const result = await pool.query('INSERT INTO resources (tenant_id, name) VALUES ($1, $2) RETURNING *',
            [tenantId, name]);

        res.status(201).json({ data: result.rows[0] })
    } catch (error) {
         console.error(error)
        return res.status(500).json({
            message: 'internal server error'
        });
    }
};

const getResources = async(req , res) => {
     const tenantId = req.user.tenant_id;
     try {
        const result = await pool.query('SELECT * FROM resources WHERE tenant_id = $1',[tenantId])
        res.status(200).json({ data: result.rows })
     } catch (error) {
         console.error(error)
        return res.status(500).json({
            message: 'internal server error'
        });
     }
};

export {createResources,
    getResources
};

