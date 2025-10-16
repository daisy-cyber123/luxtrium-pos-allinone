// ---------------------------
// Enable Tipping & Receipts for WisePOS E
// ---------------------------

// 1️⃣ Load Stripe library
const Stripe = require("stripe");

// 2️⃣ Initialize with your secret key
// ⚠️ Replace with your real live or test key
const stripe = new Stripe("sk_live_yourStripeSecretKeyHere");

async function main() {
  try {
    // 3️⃣ Create a new location with metadata for tipping & receipts
    const location = await stripe.terminal.locations.create({
      display_name: "Luxtrium Main Location",
      address: {
        line1: "123 Main St",
        city: "Houston",
        state: "TX",
        postal_code: "77002",
        country: "US",
      },
      metadata: {
        tipping_enabled: "true",
        receipt_enabled: "true",
      },
    });

    console.log("✅ Location created:");
    console.log(location);

    // 4️⃣ Assign your reader to this new location
    const updatedReader = await stripe.terminal.readers.update(
      "REPLACE_WITH_YOUR_READER_ID",
      { location: location.id }
    );

    console.log("✅ Reader updated:");
    console.log(updatedReader);
    console.log("\nDone! Restart your WisePOS E and test a charge.");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
