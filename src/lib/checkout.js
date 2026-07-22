// src/lib/checkout.js
// Shared "go straight to Stripe checkout" action used by every Pro-gated
// lock popup (ProGate, MapControlPanel's local ProGate, MobileProGate).
// These popups intentionally don't show a price or a monthly/annual choice
// (see 2026-07-22 fix -- pricing details live on /upgrade for logged-out
// visitors); clicking "Upgrade to Pro" here defaults straight to the
// annual plan and redirects to Stripe Checkout in one step, mirroring the
// working pattern already used by TrialExpiredWall.jsx's handleUpgrade().
import { supabase } from "@/lib/supabase";

const PRICE_ANNUAL_ID = "price_1Til1NDWsT9O1Ejonzrd7hIJ";

export async function startProCheckout() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      // Shouldn't happen -- these gates only render inside the logged-in
      // app -- but fall back to the upgrade page rather than dead-ending.
      window.location.href = "/upgrade";
      return;
    }

    const res = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ priceId: PRICE_ANNUAL_ID }),
    });
    const body = await res.json();
    if (!res.ok || !body.url) throw new Error(body.error || "Checkout failed");
    window.location.href = body.url;
  } catch (err) {
    console.warn("[startProCheckout] falling back to /upgrade:", err);
    window.location.href = "/upgrade";
  }
}
