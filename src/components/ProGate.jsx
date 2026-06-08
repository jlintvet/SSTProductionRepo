// src/components/ProGate.jsx
// Wraps any UI control. When isPro is false, renders children greyed out.
// Clicking the locked area shows an "Available in Pro" popup.
//
// Usage:
//   <ProGate isPro={isPro}>
//     <MyControl />
//   </ProGate>

import React, { useState, useRef, useEffect } from "react";

export default function ProGate({ isPro, children, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close popup on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (isPro) return <>{children}</>;

  return (
    <div ref={ref} style={{ position: "relative", display: "contents" }}>
      {/* Greyed-out children */}
      <div
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ opacity: 0.4, pointerEvents: "auto", cursor: "pointer", userSelect: "none" }}
        title="Available in Pro"
      >
        {children}
      </div>

      {/* Lock badge */}
      <span
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          position: "absolute", top: 2, right: 2,
          background: "#f59e0b", color: "#fff",
          borderRadius: 10, fontSize: 9, fontWeight: 700,
          padding: "1px 5px", cursor: "pointer", zIndex: 10,
          letterSpacing: 0.5, whiteSpace: "nowrap",
        }}
      >
        PRO
      </span>

      {/* Popup */}
      {open && (
        <div style={{
          position: "absolute", zIndex: 1000,
          top: "50%", left: "50%", transform: "translate(-50%, -110%)",
          background: "#fff", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          padding: "1.1rem 1.25rem", minWidth: 220, textAlign: "center",
          border: "1px solid #e2e8f0",
        }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>
            Pro Feature
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
            {label || "This feature is available on the Pro plan."}
          </div>
          <a
            href="/"
            style={{
              display: "inline-block", background: "#0e7490", color: "#fff",
              borderRadius: 8, padding: "6px 16px", fontSize: 13, fontWeight: 600,
              textDecoration: "none",
            }}
            onClick={() => setOpen(false)}
          >
            Upgrade to Pro — $69/yr
          </a>
          <button
            onClick={() => setOpen(false)}
            style={{
              display: "block", margin: "8px auto 0", background: "none",
              border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
