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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --------------------
// POS route
// --------------------
app.get('/pos', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pos.html'));
});

// --------------------
// Create Payment Intent (email optional)
// --------------------
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', receipt_email } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Missing amount' });
    }

    // Create the payment intent with or without email
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      description: 'Luxtrium POS Sale',
      ...(receipt_email ? { receipt_email } : {}), // ✅ only include if provided
    });

    res.json({ payment_intent: paymentIntent.id });
  } catch (err) {
    console.error('Stripe error creating payment intent:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Process Payment on Reader
// --------------------
app.post('/process-on-reader', async (req, res) => {
  try {
    const { payment_intent } = req.body;
    if (!payment_intent)
      return res.status(400).json({ error: 'Missing payment_intent' });

    await stripe.terminal.readers.processPaymentIntent(READER_ID, {
      payment_intent,
    });

    // Poll until payment completes
    const poll = async () => {
      const pi = await stripe.paymentIntents.retrieve(payment_intent);
      if (pi.status === 'succeeded' || pi.status === 'canceled') return pi;
      await new Promise((r) => setTimeout(r, 1500));
      return poll();
    };

    const result = await poll();
    res.json({ success: true, payment_intent: result });
  } catch (err) {
    console.error('Error processing payment on reader:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Cancel Payment Intent and clear reader
// --------------------
app.post('/cancel-payment', async (req, res) => {
  try {
    const { payment_intent } = req.body;

    // Cancel on the reader
    await stripe.terminal.readers.cancelAction(READER_ID);

    // Cancel the PaymentIntent if one exists
    if (payment_intent) {
      await stripe.paymentIntents.cancel(payment_intent);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error canceling payment:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Webhook (optional)
// --------------------
app.post('/webhook', (req, res) => {
  res.json({ received: true });
});

// --------------------
// Start Server
// --------------------
app.listen(PORT, () =>
  console.log(`✅ Luxtrium POS server running on port ${PORT}`)
);
