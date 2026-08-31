import pool from '../config/db.js'

const createTenant = async(req ,res)=> {
  const{name, plan} = req.body;
  if(!name || !plan){
    return res.status(401).json({
        message: "name and plan both are required"
    })
  };
    try {
        const result = await pool.query('INSERT INTO tenants (name, plan) VALUES ($1, $2)RETURNING *',[name, plan]);

        return res.status(201).json({
            message: "tenant created successfully",
            data: result.rows[0]
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            error: 'internal server error'
        })
    };
};

export {createTenant};