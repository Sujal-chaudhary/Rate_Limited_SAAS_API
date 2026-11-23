import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_dev';
const stripe = new Stripe(apiKey);

export default stripe;