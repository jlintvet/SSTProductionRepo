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
import WreckReviewAdmin from "@/pages/WreckReviewAdmin";
import UpgradePage from "@/pages/UpgradePage";

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

        const pendingCode = sessionStorage.getItem("pendingReferralCode");
        if (pendingCode) {
          sessionStorage.removeItem("pendingReferralCode");
          supabase.rpc("redeem_referral_code", { p_code: pendingCode })
            .then(({ error: redeemError }) => {
              if (redeemError) console.warn("[REFERRAL] redeem failed:", redeemError.message);
              else console.log("[REFERRAL] code redeemed:", pendingCode);
            });
        }

        const pendingRegion = sessionStorage.getItem("pendingRegion");
        if (pendingRegion) {
          sessionStorage.removeItem("pendingRegion");
          supabase.from("user_profiles")
            .upsert({ id: session.user.id, region: pendingRegion }, { onConflict: "id" })
            .then(({ error: regErr }) => {
              if (regErr) console.warn("[REGION] set failed:", regErr.message);
              else console.log("[REGION] set on signup:", pendingRegion);
            });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <Routes>
        {/* Public routes -- no auth required */}
        <Route path="/upgrade" element={<UpgradePage />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/share" element={<SharedLocationLanding />} />
        <Route path="/share/route" element={<SharedRouteLanding />} />
        <Route path="/maptest" element={<MapTest />} />

        {/* Protected routes */}
        <Route path="/wreck-review" element={
          <ProtectedRoute authed={authed}><WreckReviewAdmin /></ProtectedRoute>
        } />
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
  );
}

export default function App() {
  return <AppRoot />;
}
