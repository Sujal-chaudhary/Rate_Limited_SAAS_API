import pool from "../config/db.js";

export const processStripeEvent = async(event) => {
    const client = await pool.connect()

    try {
        await client.query('BEGIN');
     
    //1. Idempoetncy check: atomic insertion
    const eventInsert = await client.query(
     `INSERT INTO stripe_events(event_id, type)
     VALUES($1, $2)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
     [event.id, event.type]
    );

    //if conflict arise it means duplicate event , rollback adn exit cleanly
    if(eventInsert.rows.length === 0){
         console.log("dupliate event so skipped it");
         await client.query('ROLLBACK');
         return {duplicate: true}; // skips business logic!
    }

    //2. handle the specific stripe event
     switch(event.type){
        case 'checkout.session.completed':{
                const session = event.data.object;
                const tenantId = session.client_reference_id || session.metadata?.tenant_id;
                const customerId = session.customer;
                const subscriptionId = session.subscription;
                const plan = session.metadata?.plan || 'pro'; // default upgraded tier

               if(tenantId){
                 //upgrade tenant's plan in tenant table as he pays for his upgradation only
                 await client.query(
                    `UPDATE tenants SET plan = $1 WHERE id = $2`,
                    [plan, tenantId]
                 );

                 //if tenant pay for subscription
                 if(subscriptionId){
                    await client.query(
                        `INSERT INTO subscriptions
                        (tenant_id, stripe_customer_id, stripe_subscription_id, status, plan, last_event_created)
                         VALUES ($1, $2, $3, 'active', $4, $5)
                         ON CONFLICT (stripe_subscription_id)
                         DO UPDATE SET
                            status ='active',
                            plan = EXCLUDED.plan,
                           last_event_created = EXCLUDED.last_event_created,
                           updated_at = CURRENT_TIMESTAMP`,
                           [tenantId, customerId, subscriptionId, plan, event.created]
                    );

                }
                   console.log(`tenant ${tenantId} upgraded to plan: ${plan}`);
                    
               } 

               break;
        }

        case 'customer.subscription.updated':{
                const subscription = event.data.object;
                const subscriptionId = subscription.id;
                const status = subscription.status;
                const newPlan = subscription.metadata?.plan || 'pro'; 

                //check for out-of-order delivery
                const existing = await client.query(
                      `SELECT last_event_created, tenant_id FROM subscriptions WHERE stripe_subscription_id = $1`,
                    [subscriptionId]
                );

                if(existing.rows.length > 0){
                    const { last_event_created, tenant_id } = existing.rows[0];

                    //if incoming event is older than what we already processed, ignore! as it is already processed order
                      if(event.created <= Number(last_event_created)){
                        console.log("Ignore out of order event");

                        break;
                        
                      }

                      await client.query(
                        `UPDATE subscriptions
                        SET status = $1, plan = $2,
                        last_event_created = $3, updated_at = CURRENT_TIMESTAMP
                        WHERE stripe_subscription_id = $4`,
                        [status, newPlan, event.created, subscriptionId]
                      )

                       // Update tenant plan if subscription is active
                    const activePlan = status === 'active' ? newPlan : 'free';
                    await client.query(
                        `UPDATE tenants SET plan = $1 WHERE id = $2`,
                        [activePlan, tenantId]
                    );

                    console.log(`[Stripe Webhook] 🔄 Subscription ${subscriptionId} updated. Status: ${status}, Plan: ${activePlan}`);
                    
                }

                break;
        }

        case 'customer.subscription.deleted':{
            const subscription = event.data.object;
            const subscriptionId = subscription.id;

             const subRes = await client.query(
                    `SELECT tenant_id FROM subscriptions WHERE stripe_subscription_id = $1`,
                    [subscriptionId]
                );

                if(subRes.rows.length > 0) {
                     const tenantId = subRes.rows[0].tenant_id;

                     //now downgrade the tenant to free
                     await client.query(
                        `UPDATE tenants SET plan = 'free' WHERE id = $1`, [tenantId]
                     );

                     //upgrade subs status to cancel
                     await client.query(
                        `UPDATE subscriptions
                        SET status = 'cancelled',plan ='free',last_event_created = $1,
                        updated_at = CURRENT_TIMESTAMP
                        WHERE stripe_subscription_id = $2`,
                        [event.created, subscriptionId]
                     );

                     console.log('tenant downgraded to free plan(subscription cancelled)');
                     
                }
                break;
        }

        case 'invoice.payment_failed':{
            const invoice = event.data.object;
            const subscriptionId = invoice.subscription;

            if(subscriptionId) {
                await client.query(
                    `UPDATE subscriptions
                    SET status = 'past_due', updated_at = CURRENT_TIMESTAMP
                    WHERE stripe_subscription_id = $1`,
                    [subscriptionId]
                );

                console.log('Invoice payment failed for subscription');
                
            }

            break;
        }

        default:
            console.log(`unhandled event type: ${event.type}`);
            
     }

     // Mark event as processed in stripe_events audit trail
        await client.query(
            `UPDATE stripe_events SET processed_at = CURRENT_TIMESTAMP WHERE event_id = $1`,
            [event.id]
        );

          // 3. Commit the transaction
        await client.query('COMMIT');
        return { success: true };
    } catch (error) {
        //ROLLBACK if any failure comes 
        await client.query('ROLLBACK');
        console.error('Transaction failed', error);
        throw error;
    }finally{
         // Always release client back to pool
        client.release();
    }
};