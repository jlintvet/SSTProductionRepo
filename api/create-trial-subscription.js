// api/create-trial-subscription.js
// Creates a Stripe Customer + a 30-day-trial Subscription immediately after
// signup, with no payment method required. Stripe becomes the source of
// truth for trial state: if no card is added by the time the trial ends,
// Stripe auto-cancels the subscription (trial_settings.end_behavior), and
// the existing webhook (api/stripe-webhook.js) flips tier to "standard".
// If a card is added and the trial converts, the webhook flips tier to "pro".
//
// Called by LandingPage.jsx right after supabase.auth.signUp() succeeds,
// with the Supabase JWT in the Authorization header.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Anon-key client — used only to verify the caller's identity from their JWT
const supabaseAuth = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Service-role client — bypasses RLS and the protected-columns trigger so we
// can write stripe_customer_id / stripe_subscription_id right after signup
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ORIGINS = new Set(["https://riploc.com", "https://www.riploc.com"]);
const TRIAL_DAYS = 30;

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
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Invalid session" });

  try {
    // Idempotency — never create a second Stripe subscription for the same user.
    // Covers retries from flaky networks or the user refreshing right after signup.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("create-trial-subscription: profile lookup error:", profileError.message);
      return res.status(500).json({ error: "Could not load profile" });
    }

    if (profile?.stripe_subscription_id) {
      return res.status(200).json({ ok: true, alreadyExists: true });
    }

    const priceId = process.env.STRIPE_PRICE_MONTHLY;
    if (!priceId) {
      console.error("create-trial-subscription: STRIPE_PRICE_MONTHLY not set");
      return res.status(500).json({ error: "Server misconfigured" });
    }

    // Reuse an existing Stripe customer if one was already created for this user
    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: TRIAL_DAYS,
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
      metadata: { supabase_user_id: user.id },
    });

    const { error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("create-trial-subscription: profile update error:", updateError.message);
      return res.status(500).json({ error: "Failed to save subscription" });
    }

    return res.status(200).json({ ok: true, subscriptionId: subscription.id });
  } catch (err) {
    console.error("create-trial-subscription error:", err.message);
    return res.status(500).json({ error: "Failed to create trial subscription" });
  }
}
