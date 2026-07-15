// api/create-checkout-session.js
// Creates a Stripe Checkout session for Pro subscriptions.
// Called by PricingPage with { priceId } in the body and
// the Supabase JWT in the Authorization header.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Service-role client -- only used to verify a just-signed-up account for
// the "pay before confirming email" path below (see pendingUserId).
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ORIGINS = new Set(["https://riploc.com", "https://www.riploc.com"]);

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const token = req.headers.authorization?.replace("Bearer ", "");

  let body;
  try {
    const raw = await getRawBody(req);
    body = JSON.parse(raw.toString());
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  let user = null;

  if (token) {
    const { data, error: authError } = await supabase.auth.getUser(token);
    if (!authError && data.user) user = data.user;
  }

  // Fallback: a brand-new signup, email confirmation still pending, so no
  // session/JWT exists yet. Email confirmation stays required to actually
  // log in -- this path only lets payment happen without waiting for it.
  // Verified via the admin API: the account must be real, the email must
  // match, it must still be unconfirmed, and it must be recent (<30 min),
  // so this can't be used as a general auth bypass after the fact.
  if (!user && body.pendingUserId && body.pendingEmail) {
    const { data, error: adminErr } = await supabaseAdmin.auth.admin.getUserById(body.pendingUserId);
    const candidate = data?.user;
    const recentEnough = candidate?.created_at &&
      (Date.now() - new Date(candidate.created_at).getTime()) < 30 * 60 * 1000;
    if (
      !adminErr && candidate &&
      !candidate.email_confirmed_at &&
      candidate.email?.toLowerCase() === String(body.pendingEmail).toLowerCase() &&
      recentEnough
    ) {
      user = candidate;
    }
  }

  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { priceId } = body;
  if (!priceId) return res.status(400).json({ error: "Missing priceId" });

  // Only allow known Stripe price IDs — prevents price manipulation attacks
  const ALLOWED_PRICES = new Set([
    process.env.STRIPE_PRICE_ANNUAL,
    process.env.STRIPE_PRICE_MONTHLY,
  ].filter(Boolean));

  if (!ALLOWED_PRICES.has(priceId)) {
    return res.status(400).json({ error: "Invalid price" });
  }

  const APP_URL = process.env.APP_URL || "https://riploc.com";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      success_url: `${APP_URL}/?upgraded=1`,
      cancel_url: `${APP_URL}/upgrade`,
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}
