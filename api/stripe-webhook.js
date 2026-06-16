// api/stripe-webhook.js
// Receives Stripe events and updates user_profiles in Supabase.
// Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) in Vercel env vars.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Service role key required to write to user_profiles bypassing RLS
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("Stripe event:", event.type);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (!userId) {
        console.error("No client_reference_id on session", session.id);
        break;
      }

      const { error } = await supabase.from("user_profiles").update({
        tier: "pro",
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status: "active",
      }).eq("id", userId);

      if (error) console.error("Supabase update error (checkout.completed):", error);
      else console.log("Upgraded user to Pro:", userId);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      // status: active | past_due | canceled | unpaid | trialing | paused
      const isActive = sub.status === "active" || sub.status === "trialing";
      const tier = isActive ? "pro" : "standard";

      const { error } = await supabase.from("user_profiles").update({
        tier,
        subscription_status: sub.status,
      }).eq("stripe_subscription_id", sub.id);

      if (error) console.error("Supabase update error (sub.updated):", error);
      else console.log("Updated subscription status:", sub.id, sub.status);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;

      const { error } = await supabase.from("user_profiles").update({
        tier: "standard",
        subscription_status: "cancelled",
        stripe_subscription_id: null,
      }).eq("stripe_subscription_id", sub.id);

      if (error) console.error("Supabase update error (sub.deleted):", error);
      else console.log("Downgraded user to standard:", sub.id);
      break;
    }

    default:
      console.log("Unhandled event type:", event.type);
  }

  return res.status(200).json({ received: true });
}
