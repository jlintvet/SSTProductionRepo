// api/get-prices.js
// Returns the monthly and annual price amounts from Stripe so the
// upgrade page always shows the real numbers, not hardcoded strings.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY || "price_1TikyxDWsT9O1EjovwRTZL7S";
const PRICE_ANNUAL  = process.env.STRIPE_PRICE_ANNUAL  || "price_1Til1NDWsT9O1Ejonzrd7hIJ";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).end();

  try {
    const [monthly, annual] = await Promise.all([
      stripe.prices.retrieve(PRICE_MONTHLY),
      stripe.prices.retrieve(PRICE_ANNUAL),
    ]);

    // unit_amount is in cents
    return res.status(200).json({
      monthly: {
        id: monthly.id,
        amount: monthly.unit_amount,          // e.g. 1500 = $15.00
        currency: monthly.currency,           // "usd"
        interval: monthly.recurring?.interval, // "month"
      },
      annual: {
        id: annual.id,
        amount: annual.unit_amount,           // e.g. 12000 = $120.00
        currency: annual.currency,
        interval: annual.recurring?.interval, // "year"
      },
    });
  } catch (err) {
    console.error("get-prices error:", err.message);
    return res.status(500).json({ error: "Failed to load prices" });
  }
}
