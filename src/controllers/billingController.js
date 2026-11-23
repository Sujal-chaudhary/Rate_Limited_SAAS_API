import stripe from '../config/stripe.js';

const PLAN_PRICES = {
  pro: 2000, // $20.00 / month in cents
  enterprise: 10000, // $100.00 / month in cents
};

export const createCheckoutSession = async (req, res) => {
  try {
    const { plan } = req.body;
    const tenantId = req.user.tenant_id;

    // 1. Validation
    if (!plan || !PLAN_PRICES[plan.toLowerCase()]) {
      return res.status(400).json({
        error: "Invalid plan. Must be 'pro' or 'enterprise'",
      });
    }

    const selectedPlan = plan.toLowerCase();

    // 2. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${selectedPlan.toUpperCase()} Plan Subscription`,
            },
            unit_amount: PLAN_PRICES[selectedPlan],
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      client_reference_id: tenantId,
      metadata: {
        tenant_id: tenantId,
        plan: selectedPlan,
      },
      success_url: 'http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'http://localhost:3000/cancel',
    });

    // 3. Return the hosted checkout session URL
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};