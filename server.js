// --------------------
// Load env + deps
// --------------------
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const Stripe = require('stripe');

// --------------------
// Stripe + app setup
// --------------------
const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PORT = process.env.PORT || 4242;
const READER_ID = process.env.READER_ID; // WisePOS E ID (tmr_...)

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve your POS UI from /public/pos.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pos.html'));
});

// --------------------
// Create PaymentIntent
// --------------------
app.post('/create-payment', async (req, res) => {
  try {
    const { amount, description, receipt_email } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Missing amount' });
    }

    const params = {
      amount,
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      description: description || 'Luxtrium POS Sale',
    };

    // Only send receipt_email if you actually collected one
    if (receipt_email) {
      params.receipt_email = receipt_email;
    }

    const paymentIntent = await stripe.paymentIntents.create(params);

    // Frontend will call /process-on-reader with this ID
    res.json({ payment_intent: paymentIntent.id });
  } catch (err) {
    console.error('Error creating payment intent:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Process on reader
// --------------------
app.post('/process-on-reader', async (req, res) => {
  try {
    const { payment_intent } = req.body;
    if (!payment_intent) {
      return res.status(400).json({ error: 'Missing payment_intent' });
    }

    // Tell the WisePOS to charge this PaymentIntent
    await stripe.terminal.readers.processPaymentIntent(READER_ID, {
      payment_intent,
    });

    // Poll until Stripe says we're done (success OR failure)
    const poll = async () => {
      const pi = await stripe.paymentIntents.retrieve(payment_intent);

      // ✅ Success
      if (pi.status === 'succeeded') {
        return { ok: true, pi };
      }

      // ❌ Final failure / cancelled
      if (['requires_payment_method', 'canceled'].includes(pi.status)) {
        return { ok: false, status: pi.status, pi };
      }

      // Still in progress: wait and check again
      await new Promise((r) => setTimeout(r, 1500));
      return poll();
    };

    const result = await poll();

    if (!result.ok) {
      // Friendly error message instead of throwing
      let msg =
        result.status === 'requires_payment_method'
          ? 'Payment cancelled on reader or card failed.'
          : `Payment ${result.status}`;
      return res.status(400).json({ error: msg });
    }

    // All good 🎉
    res.json({ success: true, payment_intent: result.pi.id });
  } catch (err) {
    console.error('Error creating/processing payment:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Cancel payment
// --------------------
app.post('/cancel-payment', async (req, res) => {
  try {
    const { payment_intent } = req.body || {};

    // Best-effort: cancel any active action on the reader
    try {
      await stripe.terminal.readers.cancelAction(READER_ID);
    } catch (e) {
      // It's okay if there was nothing to cancel
    }

    // If we know which PaymentIntent it was, cancel that too (optional)
    if (payment_intent) {
      try {
        await stripe.paymentIntents.cancel(payment_intent);
      } catch (e) {
        // Ignore if it's already succeeded/canceled
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling payment:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
  console.log(`✅ Luxtrium POS All-in-One server running on port ${PORT}`);
});
