// src/components/CookieConsentBanner.jsx
//
// Shown once per browser on first visit. Choice (accepted | essential) is
// stored in localStorage and, if the user is authenticated, written to
// user_profiles (cookie_consent_at, cookie_consent_ip, cookie_consent_decision).
//
// The banner is intentionally non-dismissable without making a choice —
// this satisfies CCPA and broad U.S. state consent requirements.

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const CONSENT_KEY     = "riploc.cookieConsent";
const CONSENT_VERSION = "1.0";

async function fetchIp() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const d = await r.json();
    return d.ip || null;
  } catch (_) { return null; }
}

async function persistConsent(decision, at, ip) {
  // Always write to localStorage first (works for anonymous visitors too)
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ decision, at, ip, version: CONSENT_VERSION }));
  } catch (_) {}

  // If authenticated, also write to user_profiles for compliance record
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("user_profiles").update({
        cookie_consent_at:       at,
        cookie_consent_ip:       ip,
        cookie_consent_decision: decision,
      }).eq("id", user.id);
    }
  } catch (_) {}
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
    } catch (_) {
      setVisible(true); // If localStorage is blocked, show the banner anyway
    }
  }, []);

  async function handleChoice(decision) {
    setLoading(true);
    const at = new Date().toISOString();
    const ip = await fetchIp();
    await persistConsent(decision, at, ip);
    setLoading(false);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      background: "#ffffff",
      borderTop: "1px solid #e2e8f0",
      boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
      padding: "16px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "16px",
      flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
          Cookie Notice
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
          RipLoc uses essential cookies for authentication and secure payment processing.
          We do not use advertising or tracking cookies. By continuing, you agree to our{" "}
          <a
            href="/terms.pdf"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#0e7490", textDecoration: "underline" }}
          >
            Terms and Conditions
          </a>
          .
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => handleChoice("essential")}
          disabled={loading}
          style={{
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 500,
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            background: "#f8fafc",
            color: "#475569",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          Essential Only
        </button>
        <button
          onClick={() => handleChoice("accepted")}
          disabled={loading}
          style={{
            padding: "8px 20px",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            borderRadius: 8,
            background: "#0e7490",
            color: "#ffffff",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Saving…" : "Accept All"}
        </button>
      </div>
    </div>
  );
}
