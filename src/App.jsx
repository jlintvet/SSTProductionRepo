// src/App.jsx
// Uses getUser() (server-validated) instead of getSession() (localStorage cache).
// getSession() can return stale tokens; getUser() confirms with Supabase server.
//
// Router wraps everything so /reset-password is a public route — the Supabase
// recovery link lands there before any auth state is established.
// PASSWORD_RECOVERY events are intentionally ignored in the main auth handler
// so the app doesn't set authed=true and redirect away from the reset page.

import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import SSTLive from "@/pages/SSTLive";
import LandingPage from "@/pages/LandingPage";
import ResetPassword from "@/pages/ResetPassword";
import SharedLocationLanding from "@/pages/SharedLocationLanding";
import SharedRouteLanding from "@/pages/SharedRouteLanding";
import MapTest from "@/pages/MapTest";
import UpgradePage from "@/pages/UpgradePage";
import TermsPage from "@/pages/TermsPage";
import CookieConsentBanner from "@/components/CookieConsentBanner";

// Loading spinner
function Spinner() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "#f0f9ff",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        border: "3px solid #e0f2fe",
        borderTopColor: "#0e7490",
        animation: "spin 0.7s linear infinite",
      }}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Gate for routes that require auth
function ProtectedRoute({ authed, children }) {
  if (authed === undefined) return <Spinner />;
  if (!authed) return <LandingPage onAuthSuccess={() => {}} />;
  return children;
}

function AppRoot() {
  // undefined = still checking, false = not authed, true = authed
  const [authed, setAuthed] = useState(undefined);

  useEffect(() => {
    // getUser() validates server-side — no stale localStorage tokens
    supabase.auth.getUser()
      .then(({ data, error }) => {
        const ok = !error && !!data?.user?.email;
        console.log("[APP:AUTH] getUser ->", { email: data?.user?.email ?? null, error: error?.message ?? null, ok });
        setAuthed(ok);
      })
      .catch(err => {
        console.log("[APP:AUTH] getUser threw ->", err?.message);
        setAuthed(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY: Supabase auto-signs in the user to validate the token,
      // but we do not want that to count as "authenticated" -- let ResetPassword
      // handle it via its own onAuthStateChange listener.
      if (event === "PASSWORD_RECOVERY") return;

      const ok = !!session?.user?.email;
      console.log("[APP:AUTH] change ->", event, session?.user?.email ?? null, ok);
      setAuthed(ok);

      // First real sign-in (covers: signup -> email confirm -> auto sign-in,
      // and plain login). This is the first point a usable access token exists,
      // since supabase.auth.signUp() returns no session until confirmation.
      if (event === "SIGNED_IN" && session?.access_token) {
        fetch("/api/create-trial-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        }).catch(e => console.error("create-trial-subscription failed:", e));

        const pendingCode = localStorage.getItem("pendingReferralCode");
        if (pendingCode) {
          localStorage.removeItem("pendingReferralCode");
          supabase.rpc("redeem_referral_code", { p_code: pendingCode })
            .then(({ error: redeemError }) => {
              if (redeemError) console.warn("[REFERRAL] redeem failed:", redeemError.message);
              else console.log("[REFERRAL] code redeemed:", pendingCode);
            });
        }

        // user_metadata.region is set at signUp() time (LandingPage.jsx's
        // region step) and travels with the account itself, so it's present
        // here even if this confirmation is happening on a different
        // device/browser than the one used to sign up -- e.g. signing up on
        // desktop and confirming from a phone notification. localStorage is
        // only a fallback for the rare path where region couldn't be
        // embedded at signUp() time (see LandingPage.jsx's accountCreated
        // branch), and only works same-browser.
        const pendingRegion = session.user.user_metadata?.region || localStorage.getItem("pendingRegion");
        if (pendingRegion) {
          localStorage.removeItem("pendingRegion");
          // email is required here -- user_profiles.email is NOT NULL with no
          // default, and Postgres validates NOT NULL on the INSERT branch of
          // "ON CONFLICT DO UPDATE" even when the row already exists and the
          // statement will end up just updating it. Omitting email made this
          // upsert 400 on every single call (confirmed via Supabase API logs),
          // silently no-opping the region write regardless of what the user
          // picked -- this was the actual root cause of region never sticking,
          // not just the storage-scoping issues fixed earlier. The
          // handle_new_user() DB trigger now also reads region from signup
          // metadata directly, so this upsert is now mainly a backstop for the
          // checkout-fallback path, which can't embed region in metadata.
          //
          // IMPORTANT: only do this for a profile that doesn't already have a
          // live region. user_metadata.region is frozen at signUp() time and
          // is NEVER updated when the user later changes region in Settings
          // (Settings only ever writes user_profiles.region). SIGNED_IN fires
          // on every re-login, not just the first one -- so unconditionally
          // upserting pendingRegion here was silently clobbering any later
          // Settings region change back to the original signup value on the
          // user's next real sign-in. That was the actual cause of "region
          // changes in Settings aren't saving": they saved fine in the
          // moment, the next sign-in just reverted them. Checking for an
          // existing region first makes this upsert fire-once, like the
          // tos_accepted_at pattern in useAuth.js.
          supabase.from("user_profiles")
            .select("region")
            .eq("id", session.user.id)
            .maybeSingle()
            .then(({ data: existing }) => {
              if (existing?.region) return; // already has a live region -- Settings owns it now, don't clobber
              return supabase.from("user_profiles")
                .upsert({ id: session.user.id, email: session.user.email, region: pendingRegion }, { onConflict: "id" })
                .then(({ error: regErr }) => {
                  if (regErr) console.warn("[REGION] set failed:", regErr.message);
                  else console.log("[REGION] set on signup:", pendingRegion);
                });
            });
        }

        // Resume checkout after a brand-new signup confirms their email.
        // UpgradePage.jsx stashes the chosen price here when signUp() returns
        // no session (confirmation required) -- this is the first point a
        // real access token exists for that user, so send them to Stripe now.
        const pendingUpgradePriceId = localStorage.getItem("pendingUpgradePriceId");
        if (pendingUpgradePriceId) {
          localStorage.removeItem("pendingUpgradePriceId");
          fetch("/api/create-checkout-session", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
            body: JSON.stringify({ priceId: pendingUpgradePriceId }),
          })
            .then(r => r.json())
            .then(data => {
              if (data.url) window.location.href = data.url;
              else console.warn("[UPGRADE] resume checkout failed:", data.error);
            })
            .catch(e => console.error("[UPGRADE] resume checkout failed:", e));
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <CookieConsentBanner />
      <Router>
      <Routes>
        {/* Public routes -- no auth required */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/upgrade" element={<UpgradePage />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/share" element={<SharedLocationLanding />} />
        <Route path="/share/route" element={<SharedRouteLanding />} />
        <Route path="/maptest" element={<MapTest />} />

        {/* Protected routes */}
        <Route path="/app" element={
          <ProtectedRoute authed={authed}><SSTLive /></ProtectedRoute>
        } />

        {/* Landing page — always shown at root regardless of auth */}
        <Route path="/*" element={
          <LandingPage
            authed={authed}
            onAuthSuccess={() => { window.location.href = "/app"; }}
          />
        } />
      </Routes>
    </Router>
    </>
  );
}

export default function App() {
  return <AppRoot />;
}
