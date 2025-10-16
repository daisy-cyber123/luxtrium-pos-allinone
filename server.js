// --------------------
// Load environment variables
// --------------------
require('dotenv').config();

// --------------------
// Import dependencies
// --------------------
const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const path = require('path');
const cors = require('cors');

// --------------------
// Initialize app and Stripe
// --------------------
const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// --------------------
// Config
// --------------------
const PORT = process.env.PORT || 4242;
const READER_ID = process.env.READER_ID;

// --------------------
// Middleware
// --------------------
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));

// --------------------
// Root route
// --------------------
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pos.html'));
});

// --------------------
// Create a payment intent and process on reader
// --------------------
app.post('/create-payment', async (req, res) => {
  try {
    const { amount, description } = req.body;

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      description,
      automatic_payment_methods: { enabled: true },
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
    });

    // Process payment on reader with tipping and receipt
    const action = await stripe.terminal.readers.processPaymentIntent(READER_ID, {
      payment_intent: paymentIntent.id,
      tipping: {
        type: 'fixed_percentage',
        percentages: [15, 18, 20],
      },
      receipt: {
        type: 'email_or_sms',
      },
    });

    res.json({ client_secret: paymentIntent.client_secret, action });
  } catch (error) {
    console.error('❌ Error creating payment:', error);
    res.status(400).json({ error: error.message });
  }
});

// --------------------
// Cancel payment action on reader
// --------------------
app.post('/cancel-payment', async (req, res) => {
  try {
    await stripe.terminal.readers.cancelAction(READER_ID);
    res.json({ message: 'Payment canceled successfully.' });
  } catch (error) {
    console.error('❌ Error canceling payment:', error);
    res.status(400).json({ error: error.message });
  }
});

// --------------------
// Webhook for payment status logging
// --------------------
app.post('/webhook', async (req, res) => {
  const event = req.body;
  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('✅ Payment succeeded:', event.data.object.id);
      break;
    case 'payment_intent.payment_failed':
      console.log('❌ Payment failed:', event.data.object.id);
      break;
    default:
      console.log(`ℹ️ Event received: ${event.type}`);
  }
  res.json({ received: true });
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
