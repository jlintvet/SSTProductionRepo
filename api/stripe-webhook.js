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

// Admin-granted access (comped Pro, ambassador, referral) must never be
// changed by Stripe. Those users can still hold a leftover Stripe trial
// subscription from signup, and when it lapses Stripe sends
// customer.subscription.deleted. Before this guard that event silently
// demoted them to "standard".
const PROTECTED_TIERS = new Set(["ambassador", "referral"]);
function isProtected(profile) {
  return !!profile && (profile.comped === true || PROTECTED_TIERS.has(profile.tier));
}

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

      const { data: profile } = await supabase.from("user_profiles")
        .select("tier, comped").eq("id", userId).maybeSingle();

      const updates = {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status: "active",
      };
      if (!isProtected(profile)) updates.tier = "pro";

      const { error } = await supabase.from("user_profiles").update(updates).eq("id", userId);

      if (error) console.error("Supabase update error (checkout.completed):", error);
      else console.log("Upgraded user to Pro:", userId);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      // status: active | past_due | canceled | unpaid | trialing | paused
      const isActive = sub.status === "active" || sub.status === "trialing";
      const tier = isActive ? "pro" : "standard";

      const { data: profile } = await supabase.from("user_profiles")
        .select("tier, comped").eq("stripe_subscription_id", sub.id).maybeSingle();

      const updates = { subscription_status: sub.status };
      if (!isProtected(profile)) updates.tier = tier;
      else console.log("Protected tier, not changing:", sub.id, profile.tier, profile.comped ? "(comped)" : "");

      const { error } = await supabase.from("user_profiles").update(updates)
        .eq("stripe_subscription_id", sub.id);

      if (error) console.error("Supabase update error (sub.updated):", error);
      else console.log("Updated subscription status:", sub.id, sub.status);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;

      const { data: profile } = await supabase.from("user_profiles")
        .select("tier, comped").eq("stripe_subscription_id", sub.id).maybeSingle();

      const updates = { subscription_status: "cancelled", stripe_subscription_id: null };
      if (!isProtected(profile)) updates.tier = "standard";
      else console.log("Protected tier, not downgrading:", sub.id, profile.tier, profile.comped ? "(comped)" : "");

      const { error } = await supabase.from("user_profiles").update(updates)
        .eq("stripe_subscription_id", sub.id);

      if (error) console.error("Supabase update error (sub.deleted):", error);
      else console.log("Downgraded user to standard:", sub.id);
      break;
    }

    default:
      console.log("Unhandled event type:", event.type);
  }

  return res.status(200).json({ received: true });
}
