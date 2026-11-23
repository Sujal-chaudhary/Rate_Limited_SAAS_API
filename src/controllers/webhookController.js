import stripe from "../config/stripe.js";
import { processStripeEvent } from "../services/stripeEventHandler.js";

export const handleStripeWebhook = async(req, res) => {
       const sig = req.headers['stripe-signature'];
       const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

       let event;

       try {
         //req.body is a raw buffer bcz of express.raw()
         event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);//checks the cryptographic HMAC signature.
         //calling stripe eventHandeler:
         await processStripeEvent(event);

         console.log("webhook verified");
       
       //return 200 immediatley to acknowledge reciept to stripe
       return res.status(200).json({received: true});

       } catch (error) {
           console.error(`webhook signature verification failed: " ${error.message}`);
           return res.status(400).send(`webhook error: ${error.message}`);
       };

       
       
};