// src/pages/LandingPage.jsx
import React, { useState } from "react";
import { supabase } from "@/lib/supabase";

const TEAL = "#0e7490";
const DARK = "#0f172a";

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function PasswordInput({ placeholder, value, onChange, required, autoFocus, style }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        autoFocus={autoFocus}
        style={{ ...style, marginBottom: 0, paddingRight: "2.5rem" }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer",
          color: "#94a3b8", padding: 2, display: "flex", alignItems: "center",
        }}
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
      >
        <EyeIcon visible={show} />
      </button>
    </div>
  );
}

const STANDARD_FEATURES = [
  "Sea Surface Temperature (SST) maps",
  "Chlorophyll, sea color & wind map",
  "NOAA weather forecast",
  "Bathymetry contours",
  "Community pins — post & view",
  "Saved locations",
  "Departure port planning",
  "No ads, ever",
];

const PRO_FEATURES = [
  "Everything in Standard, plus:",
  "Share locations & routes with other anglers",
  "Trip planning — multi-waypoint with ETA",
  "Real-time GPS tracking",
  "Fishing hotspot scoring & map",
  "Isotherm (temp break) overlay",
  "Color gain control",
  "Ocean current overlay",
  "Wind overlay on map",
  "Sea level anomaly (altimetry) overlay",
  "Wreck & bottom structure locations",
  "Community pins — 90-day visibility window",
];

function AuthForm() {
  const [mode, setMode]         = useState("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [sent, setSent]         = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const inp = {
    width: "100%", padding: "0.65rem 0.9rem", border: "1px solid #cbd5e1",
    borderRadius: 8, fontSize: 15, marginBottom: 12, boxSizing: "border-box",
    outline: "none", fontFamily: "inherit",
  };
  const btn = {
    width: "100%", padding: "0.75rem", background: TEAL, color: "#fff",
    border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600,
    cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
    marginTop: 4, fontFamily: "inherit",
  };
  const lnk = {
    background: "none", border: "none", color: TEAL, cursor: "pointer",
    fontSize: 14, textDecoration: "underline", padding: 0, fontFamily: "inherit",
  };

  async function handleLogin(e) {
    e.preventDefault(); setError(null); setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) setError(err.message);
  }

  async function handleRegister(e) {
    e.preventDefault(); setError(null);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) setError(err.message); else setSent(true);
  }

  async function handleReset(e) {
    e.preventDefault(); setError(null);
    if (!resetEmail.trim()) { setError("Enter your email address."); return; }
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: window.location.origin + "/reset-password",
    });
    setLoading(false);
    setResetSent(true);
  }

  if (sent) return (
    <div style={{ textAlign: "center", padding: "1rem 0" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F4E7;</div>
      <h3 style={{ margin: "0 0 8px", color: DARK }}>Check your email</h3>
      <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 16px" }}>
        We sent a confirmation link to <strong>{email}</strong>.<br/>
        Click it to activate your account and start your 30-day Pro trial.
      </p>
      <button style={{ ...btn, background: "#64748b" }} onClick={() => { setSent(false); setMode("login"); }}>
        Back to sign in
      </button>
    </div>
  );

  if (resetSent) return (
    <div style={{ textAlign: "center", padding: "1rem 0" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F4E7;</div>
      <h3 style={{ margin: "0 0 8px", color: DARK }}>Check your email</h3>
      <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 16px" }}>
        If <strong>{resetEmail}</strong> is a registered account, a password reset link has been sent.
      </p>
      <button style={{ ...btn, background: "#64748b" }}
        onClick={() => { setResetSent(false); setMode("login"); setResetEmail(""); }}>
        Back to sign in
      </button>
    </div>
  );

  if (mode === "reset") return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, color: DARK }}>Reset your password</h3>
      <p style={{ margin: "0 0 18px", fontSize: 14, color: "#64748b" }}>
        Enter the email address for your account and we will send a reset link.
      </p>
      <form onSubmit={handleReset}>
        <input style={inp} type="email" placeholder="Email address" value={resetEmail}
          onChange={e => setResetEmail(e.target.value)} required autoFocus />
        {error && (
          <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px", padding: "8px 12px", background: "#fef2f2", borderRadius: 6 }}>
            {error}
          </p>
        )}
        <button style={btn} type="submit" disabled={loading}>
          {loading ? "..." : "Send reset link"}
        </button>
      </form>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button type="button" style={lnk} onClick={() => { setMode("login"); setError(null); }}>
          Back to sign in
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["login", "register"].map(m => (
          <button key={m} onClick={() => { setMode(m); setError(null); }} style={{
            flex: 1, padding: "0.55rem", borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            background: mode === m ? TEAL : "#f1f5f9",
            color: mode === m ? "#fff" : "#64748b",
            border: mode === m ? "2px solid " + TEAL : "2px solid #e2e8f0",
          }}>
            {m === "login" ? "Sign in" : "Start free trial"}
          </button>
        ))}
      </div>

      {mode === "register" && (
        <p style={{ fontSize: 13, color: "#0e7490", background: "#f0f9ff", borderRadius: 8, padding: "8px 12px", margin: "0 0 14px", textAlign: "center" }}>
          30-day free Pro trial - no credit card required
        </p>
      )}

      <form onSubmit={mode === "login" ? handleLogin : handleRegister}>
        <input style={inp} type="email" placeholder="Email address" value={email}
          onChange={e => setEmail(e.target.value)} required autoFocus />
        <PasswordInput style={inp} placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)} required />
        {mode === "login" && (
          <div style={{ textAlign: "right", marginTop: -8, marginBottom: 10 }}>
            <button type="button" style={lnk} onClick={() => { setMode("reset"); setError(null); }}>
              Forgot password?
            </button>
          </div>
        )}
        {mode === "register" && (
          <PasswordInput style={inp} placeholder="Confirm password" value={confirm}
            onChange={e => setConfirm(e.target.value)} required />
        )}
        {error && (
          <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px", padding: "8px 12px", background: "#fef2f2", borderRadius: 6 }}>
            {error}
          </p>
        )}
        <button style={btn} type="submit" disabled={loading}>
          {loading ? "..." : mode === "login" ? "Sign in" : "Create account & start trial"}
        </button>
      </form>
    </div>
  );
}

function PricingCard({ name, price, promoPrice, promoLabel, features, highlight, badge, free }) {
  return (
    <div style={{
      background: highlight ? TEAL : "#fff",
      color: highlight ? "#fff" : DARK,
      borderRadius: 16,
      padding: "2rem 1.75rem",
      flex: 1,
      minWidth: 240,
      maxWidth: 320,
      boxShadow: highlight ? "0 8px 32px rgba(14,116,144,0.25)" : "0 2px 12px rgba(0,0,0,0.08)",
      border: highlight ? "none" : "1px solid #e2e8f0",
      position: "relative",
    }}>
      {badge && (
        <div style={{
          position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
          background: "#f59e0b", color: "#fff", borderRadius: 20, padding: "4px 14px",
          fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
        }}>
          {badge}
        </div>
      )}
      <h3 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>{name}</h3>
      <div style={{ marginBottom: 20 }}>
        {free ? (
          <span style={{ fontSize: 38, fontWeight: 800 }}>Free</span>
        ) : promoPrice ? (
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 38, fontWeight: 800 }}>${promoPrice}</span>
              <span style={{ fontSize: 14, opacity: 0.8 }}>/year</span>
              <span style={{ fontSize: 13, textDecoration: "line-through", opacity: 0.5 }}>${price}</span>
            </div>
            {promoLabel && (
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2,
                color: highlight ? "#fde68a" : "#d97706" }}>
                {promoLabel}
              </div>
            )}
          </div>
        ) : (
          <div>
            <span style={{ fontSize: 38, fontWeight: 800 }}>${price}</span>
            <span style={{ fontSize: 14, opacity: 0.7 }}>/year</span>
          </div>
        )}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {features.map((f, i) => (
          <li key={i} style={{
            padding: "6px 0", fontSize: 14,
            color: highlight ? "rgba(255,255,255,0.9)" : "#475569",
            fontWeight: i === 0 && f.includes("Everything") ? 600 : 400,
          }}>
            {!f.includes("Everything") && (
              <span style={{ marginRight: 8, color: highlight ? "#7dd3fc" : TEAL }}>&#x2713;</span>
            )}
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MarketingLanding({ onAuthSuccess }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f0f9ff", fontFamily: "'Inter', system-ui, sans-serif" }}>

      <div style={{
        background: "linear-gradient(135deg, " + DARK + " 0%, #0c4a6e 60%, #0e7490 100%)",
        padding: "4rem 2rem 3rem",
        textAlign: "center",
        color: "#fff",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: 2, color: "#7dd3fc", marginBottom: 12, textTransform: "uppercase" }}>
          RipLoc
        </div>
        <h1 style={{ margin: "0 0 16px", fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 800, lineHeight: 1.15 }}>
          Find Fish.<br/>Not Guesswork.
        </h1>
        <p style={{ margin: "0 auto", maxWidth: 560, fontSize: 18, color: "#bae6fd", lineHeight: 1.6 }}>
          Real-time sea surface temperature, chlorophyll, bathymetry, and wind data -
          built for offshore anglers who need to know where the bite is before they leave the dock.
        </p>
      </div>

      <div style={{
        maxWidth: 1100, margin: "0 auto", padding: "3rem 1.5rem",
        display: "flex", flexWrap: "wrap", gap: "3rem", alignItems: "flex-start",
      }}>
        <div style={{
          background: "#fff", borderRadius: 16, padding: "2rem",
          boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
          minWidth: 300, flex: "1 1 300px", maxWidth: 400,
        }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 20, color: DARK }}>Get started free</h2>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b" }}>
            Free accounts include SST data, NOAA weather, and full community access. New accounts get a 30-day Pro trial.
          </p>
          <AuthForm />
        </div>

        <div style={{ flex: "2 1 500px" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 24, color: DARK, fontWeight: 700 }}>Pricing</h2>
          <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: 15 }}>
            No ads. No clickbait. Just data.
          </p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <PricingCard name="Standard" free features={STANDARD_FEATURES} />
            <PricingCard
              name="Pro"
              price={99}
              promoPrice={49}
              promoLabel="50% off — 2026 promo pricing"
              features={PRO_FEATURES}
              highlight
              badge="Best Value"
            />
          </div>
          <p style={{ margin: "20px 0 0", fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
            New accounts get a 30-day Pro trial. No credit card required.
          </p>
        </div>
      </div>

      <div style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: "2.5rem 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "2rem", justifyContent: "center" }}>
          {[
            { icon: "&#x1F30A;", label: "Live SST data updated daily" },
            { icon: "&#x1F41F;", label: "Fishing hotspots" },
            { icon: "&#x1F5FA;&#xFE0F;", label: "Chlorophyll, bathy & sea color" },
            { icon: "&#x1F4A8;", label: "Wind & NOAA weather" },
            { icon: "&#x1F4CD;", label: "Save & share locations" },
            { icon: "&#x1F3AF;", label: "Departure port planning" },
          ].map(({ icon, label }) => (
            <div key={label} style={{ textAlign: "center", minWidth: 140 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: icon }} />
              <div style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
