// --------------------
// Load environment variables
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
// Initialize
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
// Routes to serve the POS page
// --------------------

// Root URL -> show the POS screen
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pos.html'));
});

// Also keep /pos working (both URLs will show the same page)
app.get('/pos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pos.html'));
});

// --------------------
// Create + Process Payment (used by your POS)
// --------------------
app.post('/create-payment', async (req, res) => {
  try {
    const { amount, description, receipt_email } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Missing amount' });
    }

    // Build base PaymentIntent payload
    const intentData = {
      amount,
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      description: description || 'Luxtrium POS Sale',
    };

    // Optional email for receipts – ONLY receipt_email is valid,
    // NOT "receipt" (that caused your earlier error)
    if (receipt_email) {
      intentData.receipt_email = receipt_email;
    }

    // 1) Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create(intentData);

    // 2) Send to the WisePOS E reader
    await stripe.terminal.readers.processPaymentIntent(READER_ID, {
      payment_intent: paymentIntent.id,
    });

    // 3) Poll until Stripe says it succeeded (or failed)
    const poll = async () => {
      const pi = await stripe.paymentIntents.retrieve(paymentIntent.id);

      if (pi.status === 'succeeded') {
        return pi;
      }

      // If it failed or was canceled, stop polling and throw
      if (
        pi.status === 'canceled' ||
        pi.status === 'requires_payment_method'
      ) {
        throw new Error(`Payment status: ${pi.status}`);
      }

      // Otherwise wait a bit & check again
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return poll();
    };

    const finalPI = await poll();

    res.json({
      success: true,
      payment_intent: finalPI.id,
      status: finalPI.status,
    });
  } catch (err) {
    console.error('Error creating/processing payment:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Cancel current action on reader (Cancel Payment button)
// --------------------
app.post('/cancel-payment', async (req, res) => {
  try {
    await stripe.terminal.readers.cancelAction(READER_ID);
    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling reader action:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Webhook stub (optional)
// --------------------
app.post('/webhook', (req, res) => {
  res.json({ received: true });
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
  console.log(`✅ Luxtrium POS All-in-One server running on port ${PORT}`);
});
