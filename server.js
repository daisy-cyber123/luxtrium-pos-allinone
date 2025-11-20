// --------------------
// Load env vars
// --------------------
require('dotenv').config();

// --------------------
// Imports
// --------------------
const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const path = require('path');
const cors = require('cors');

// --------------------
// Init
// --------------------
const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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
// Routes: pages
// --------------------
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pos', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pos.html'));
});

// --------------------
// Create PaymentIntent
// (used by your bar POS with tabs)
// --------------------
app.post('/create-payment', async (req, res) => {
  try {
    const { amount, description, receipt_email } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Missing amount' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      description: description || 'Luxtrium POS Sale',

      // ✅ Correct way to add an optional receipt email
      ...(receipt_email ? { receipt_email } : {})
    });

    res.json({ payment_intent: paymentIntent.id });
  } catch (err) {
    console.error('Stripe error creating payment intent:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Process Payment on Reader
// --------------------
app.post('/process-on-reader', async (req, res) => {
  try {
    const { payment_intent } = req.body;
    if (!payment_intent) {
      return res.status(400).json({ error: 'Missing payment_intent' });
    }

    // ❗ No "receipt" or other extra fields here
    await stripe.terminal.readers.processPaymentIntent(READER_ID, {
      payment_intent,
    });

    // Poll until the PaymentIntent finishes
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function poll() {
      const pi = await stripe.paymentIntents.retrieve(payment_intent);

      if (pi.status === 'succeeded') return pi;

      // You can adjust which statuses you keep waiting on
      if (
        pi.status === 'requires_payment_method' ||
        pi.status === 'requires_confirmation' ||
        pi.status === 'requires_presentment'
      ) {
        await wait(1500);
        return poll();
      }

      // Anything else is treated as failure
      throw new Error(`PaymentIntent ended in status: ${pi.status}`);
    }

    const finalPI = await poll();
    res.json({ success: true, payment_intent: finalPI });
  } catch (err) {
    console.error('Error processing payment on reader:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Cancel Payment (clears reader action)
// --------------------
app.post('/cancel-payment', async (req, res) => {
  try {
    // Best effort: cancel the current action on the reader
    await stripe.terminal.readers.cancelAction(READER_ID);
    res.json({ success: true });
  } catch (err) {
    console.error('Error canceling payment:', err);
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
// Start server
// --------------------
app.listen(PORT, () => {
  console.log(`✅ Luxtrium POS server running on port ${PORT}`);
});
