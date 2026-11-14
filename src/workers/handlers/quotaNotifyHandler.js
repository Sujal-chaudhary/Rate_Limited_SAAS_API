import pool from "../../config/db.js";

const quotaNotifyHandler = async(job) => {
     const { tenantId, threshold } = job.data;
     console.log(`[quota-notify] Processing alert for tenant: ${tenantId}, threshold: ${threshold}%`);
     
     //consumer side dedup:
     const result = await pool.query(
        `INSERT INTO sent_notification (tenant_id, threshold)
         VALUES($1, $2)
         ON CONFLICT (tenant_id, threshold, sent_date) DO NOTHING
         RETURNING id
        `, [tenantId, threshold]
     );

     //check: on retry, it skips spamming mail
     if(result.rows.length === 0){
        console.log("notificatication has already been sended");
        return{
            skipped: true,
            reason: "already_notified_today"
        }
        
     }

     //as we reached here , this is for the first time and send the main to tenant
     console.log(`📧 [EMAIL SENT] To tenant ${tenantId}: You have reached ${threshold}% of your rate limit!`);
     return {
        success: true,
        notified: true
     };
     
};

export default quotaNotifyHandler;