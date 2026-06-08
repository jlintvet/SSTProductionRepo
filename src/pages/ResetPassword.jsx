// src/pages/ResetPassword.jsx
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const TEAL = "#0e7490";
const DARK = "#0f172a";

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
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

export default function ResetPassword() {
  const [status, setStatus]     = useState("waiting");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [done, setDone]         = useState(false);

  useEffect(() => {
    let cancelled = false;
    function markReady() { if (!cancelled) setStatus("ready"); }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") markReady();
    });

    const hash = window.location.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    if (hashParams.get("type") === "recovery") {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) markReady();
      });
    }

    const timeout = setTimeout(() => {
      if (!cancelled) setStatus(s => s === "waiting" ? "expired" : s);
    }, 6000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    await supabase.auth.signOut();
    setDone(true);
  }

  const wrap = {
    minHeight: "100vh", display: "flex", alignItems: "center",
    justifyContent: "center", background: "#f0f9ff",
    fontFamily: "'Inter', system-ui, sans-serif",
  };
  const card = {
    background: "#fff", borderRadius: 16, padding: "2rem",
    maxWidth: 380, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
  };
  const inp = {
    width: "100%", padding: "0.65rem 0.9rem", border: "1px solid #cbd5e1",
    borderRadius: 8, fontSize: 15, boxSizing: "border-box",
    outline: "none", fontFamily: "inherit",
  };
  const btn = {
    width: "100%", padding: "0.75rem", background: TEAL, color: "#fff",
    border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600,
    cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
    fontFamily: "inherit",
  };

  if (done) return (
    <div style={wrap}>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
        <h2 style={{ margin: "0 0 8px", color: DARK }}>Password updated</h2>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>
          Your password has been changed. Sign in with your new password.
        </p>
        <button style={btn} onClick={() => window.location.href = "/"}>Go to sign in</button>
      </div>
    </div>
  );

  if (status === "waiting") return (
    <div style={wrap}>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: "3px solid #e0f2fe", borderTopColor: TEAL,
          animation: "spin 0.7s linear infinite", margin: "0 auto 16px",
        }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: "#64748b", fontSize: 14 }}>Verifying reset link...</p>
      </div>
    </div>
  );

  if (status === "expired") return (
    <div style={wrap}>
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>&#x26A0;&#xFE0F;</div>
        <h2 style={{ margin: "0 0 8px", color: DARK }}>Link expired or invalid</h2>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>
          This password reset link has expired or is no longer valid.
          Please request a new one from the sign-in page.
        </p>
        <button style={btn} onClick={() => window.location.href = "/"}>Back to sign in</button>
      </div>
    </div>
  );

  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={{ margin: "0 0 4px", color: DARK, textAlign: "center" }}>Set new password</h2>
        <p style={{ color: "#64748b", fontSize: 14, textAlign: "center", marginBottom: 20 }}>
          Choose a strong password for your account.
        </p>
        <form onSubmit={handleSubmit}>
          <PasswordInput style={inp} placeholder="New password" value={password}
            onChange={e => setPassword(e.target.value)} required autoFocus />
          <PasswordInput style={inp} placeholder="Confirm new password" value={confirm}
            onChange={e => setConfirm(e.target.value)} required />
          {error && (
            <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px", padding: "8px 12px", background: "#fef2f2", borderRadius: 6 }}>
              {error}
            </p>
          )}
          <button style={btn} type="submit" disabled={loading}>
            {loading ? "..." : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
