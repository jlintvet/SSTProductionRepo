// src/pages/LandingPage.jsx
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { injectRlGlobalCss } from "@/styles/riplocBrandCss";
import { StandardPricingCard, ProPricingCard } from "@/components/PricingCards";

import altimetryImg   from "../public/altimetry_ref.png";
import tripDetailImg  from "../public/trip_detail_ref.png";
import tripPlanImg    from "../public/trip_plan_ref.png";
import heroBoatImg    from "../public/hero_boat.jpg";
import riplocMarkImg  from "../public/brand/riploc-mark.png";
import riplocLockupImg from "../public/brand/riploc-lockup-horizontal.png";
import riplocOfiImg    from "../public/brand/riploc-ofi-icon.png";
import riplocBTextImg  from "../public/brand/riploc-b-text-icon.png";
import featureMahiImg from "../public/feature_mahi.jpg";
import ctaBillfishImg from "../public/cta_billfish.jpg";
import appUiImg       from "../public/screenshots/app_ui.jpg";
import commPinImg     from "../public/screenshots/community_pin.jpg";
import routeMapImg    from "../public/screenshots/route_map.jpg";
import hotspotImg     from "../public/screenshots/hotspot_zone.jpg";
import weatherImg     from "../public/screenshots/weather.jpg";
import sharingImg     from "../public/screenshots/sharing.jpg";
import commLbImg      from "../public/screenshots/community_leaderboard.jpg";
import commPhoto0  from "../public/community/img_0766.jpg";
import commPhoto1  from "../public/community/img_1092.jpg";
import commPhoto2  from "../public/community/img_1676.jpg";
import commPhoto3  from "../public/community/img_2641.jpg";
import commPhoto4  from "../public/community/img_2674.jpg";
import commPhoto5  from "../public/community/img_2697.jpg";
import commPhoto6  from "../public/community/img_5849.jpg";
import commPhoto7  from "../public/community/img_7142.jpg";
import commPhoto8  from "../public/community/img_7404.jpg";
import commPhoto9  from "../public/community/img_9568.jpg";
import commPhoto10 from "../public/community/img_1109.jpg";
import commPhoto11 from "../public/community/img_1162.jpg";
import commPhoto12 from "../public/community/img_1598.jpg";
import commPhoto13 from "../public/community/img_1963.jpg";
import commPhoto14 from "../public/community/img_2613.jpg";
import commPhoto15 from "../public/community/img_2776.jpg";
import commPhoto16 from "../public/community/img_2804.jpg";
import commPhoto17 from "../public/community/img_2925.jpg";
import commPhoto18 from "../public/community/img_2947.jpg";
import commPhoto19 from "../public/community/img_3034.jpg";
import commPhoto20 from "../public/community/img_5564.jpg";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  navy:    "#08101e",
  navyMid: "#0d1a2e",
  navyLt:  "#0f2244",
  teal:    "#00c8e8",
  blue:    "#1a5fd8",
  amber:   "#f59e0b",
  textOn:  "#e8f0f7",
  mutedOn: "#7a9ab5",
  white:   "#ffffff",
  slate:   "#f8fafc",
  dark:    "#0f172a",
  mid:     "#475569",
};

// Shared "rl-" design-system CSS lives in src/styles/riplocBrandCss.js now
// (used by both LandingPage.jsx and UpgradePage.jsx) -- inject it here,
// before React renders, same as before.
injectRlGlobalCss();

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function CamIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24">
      <polygon points="5,3 19,12 5,21" fill="#00c8e8"/>
    </svg>
  );
}

function PhotoPH({ label, style = {} }) {
  return (
    <div className="rl-photo-ph" style={style}>
      <CamIcon />
      <div>PHOTO: {label}</div>
    </div>
  );
}

function RipLocLogo({ h = 34, lockup = false }) {
  if (lockup) {
    // Full horizontal lockup PNG (RIPLOC + OFFSHORE FISHING INTELLIGENCE + tagline)
    const aspect = 600 / 130; // approx aspect ratio of the lockup image
    return (
      <img
        src={riplocLockupImg}
        alt="RipLoc: Offshore Fishing Intelligence"
        style={{ height: h, width: Math.round(h * aspect), objectFit:"contain", display:"block" }}
      />
    );
  }
  // Mark-only: iR lettermark + wave
  return (
    <div style={{ display:"flex", alignItems:"center", gap: Math.round(h * 0.28) }}>
      <img
        src={riplocMarkImg}
        alt="RipLoc"
        style={{ height: h, width: h, objectFit:"contain", display:"block", borderRadius: Math.round(h * 0.15) }}
      />
      <div style={{ display:"flex", flexDirection:"column", justifyContent:"center", lineHeight:1 }}>
        <span style={{
          fontFamily:"'Arial Black','Impact',sans-serif", fontWeight:900, fontStyle:"italic",
          fontSize: Math.round(h * 0.52), color:"#ffffff", letterSpacing:"-0.5px", lineHeight:1,
        }}>RIPLOC</span>
        <span style={{
          fontFamily:"Arial,sans-serif", fontWeight:700, fontSize: Math.round(h * 0.17),
          color:"#00c8e8", letterSpacing:"2px", textTransform:"uppercase", lineHeight:1.4,
        }}>OFFSHORE FISHING INTELLIGENCE</span>
      </div>
    </div>
  );
}

function AuthForm({ onSuccess, initialMode, checkoutPriceId }) {
  const [mode, setMode]         = useState(initialMode ?? "register");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [showCf, setShowCf]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [sent, setSent]         = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [regionStep, setRegionStep]         = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("mid_atlantic");
  // True once signUp() has already run for this attempt (checkout-fallback
  // path below creates the account before the region step exists). Governs
  // whether handleRegionContinue can still embed region in signUp()'s
  // user_metadata, or has to fall back to the old localStorage-only path.
  const [accountCreated, setAccountCreated] = useState(false);

  async function handleLogin(e) {
    e.preventDefault(); setError(null); setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) setError(err.message); else onSuccess?.();
  }
  async function handleRegister(e) {
    e.preventDefault(); setError(null);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }

    // Checkout path: create the account immediately so we have a user id to
    // hand Stripe -- there's no region step first, so region can't be
    // embedded in signUp() here. Falls through to the ordinary region step
    // (with accountCreated=true) only if the immediate-checkout attempt
    // itself fails.
    if (checkoutPriceId) {
      if (referralCode.trim()) {
        // localStorage (not sessionStorage) -- the email confirmation link
        // opens in a new tab, which has fresh sessionStorage. localStorage
        // persists across tabs in the same browser so App.jsx's SIGNED_IN
        // handler can still read it after confirmation.
        localStorage.setItem("pendingReferralCode", referralCode.trim());
      }
      setLoading(true);
      const { data, error: err } = await supabase.auth.signUp({ email, password });
      if (err) { setLoading(false); setError(err.message); return; }
      setAccountCreated(true);

      if (data?.user?.id) {
        // Email confirmation is still required to log in later (Supabase
        // just sent it via signUp above) -- but it doesn't need to block
        // payment. The just-created user's id/email is enough to open
        // Stripe checkout right now; see create-checkout-session.js's
        // pendingUserId path.
        try {
          const res = await fetch("/api/create-checkout-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              priceId: checkoutPriceId,
              pendingUserId: data.user.id,
              pendingEmail: email,
            }),
          });
          const checkoutData = await res.json();
          if (!res.ok) throw new Error(checkoutData.error || "Checkout failed");
          window.location.href = checkoutData.url;
          return; // leaving the page
        } catch (checkoutErr) {
          console.error("Immediate checkout failed, falling back:", checkoutErr);
          // Fall back to the confirm-then-resume path (App.jsx's SIGNED_IN
          // handler) so the user isn't stuck if this happened to fail.
          localStorage.setItem("pendingUpgradePriceId", checkoutPriceId);
        }
      }

      setLoading(false);
      setRegionStep(true);
      return;
    }

    // Ordinary path: don't create the account yet. handleRegionContinue()
    // does that once region is picked, embedding it in signUp()'s
    // user_metadata -- see that function for why.
    setRegionStep(true);
    // Note: for the ordinary (non-checkout) signup path, the Stripe trial
    // subscription is NOT created here — signUp() returns no session until
    // the user confirms their email, so there's no access token yet. It's
    // created in App.jsx's onAuthStateChange handler on first SIGNED_IN,
    // which fires once the user actually completes confirmation and logs in.
  }
  async function handleRegionContinue() {
    setError(null);

    if (accountCreated) {
      // Checkout-fallback path: signUp() already ran before this step
      // existed for this attempt, so there's no way left to embed region in
      // user_metadata. Same-browser-only localStorage handoff, as before.
      localStorage.setItem("pendingRegion", selectedRegion);
      setRegionStep(false);
      setSent(true);
      return;
    }

    // Ordinary path: create the account now, with region embedded in
    // user_metadata. Region metadata is stored on the Supabase auth user at
    // creation time and travels with the session regardless of which
    // device/browser the user confirms their email on -- unlike
    // localStorage/sessionStorage, which only exist on the browser that set
    // them. This mirrors how tos_accepted_at already survives confirmation
    // (see AuthGate.jsx + useAuth.js's SIGNED_IN sync).
    if (referralCode.trim()) {
      localStorage.setItem("pendingReferralCode", referralCode.trim());
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email, password,
      options: { data: { region: selectedRegion } },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }

    // Also stash in localStorage as a defense-in-depth fallback (covers e.g.
    // a signUp() response that -- for whatever Supabase-side reason -- omits
    // the metadata from the confirmed session). App.jsx's SIGNED_IN handler
    // checks user_metadata.region first and only falls back to this.
    localStorage.setItem("pendingRegion", selectedRegion);
    setRegionStep(false);
    setSent(true);
  }
  async function handleReset(e) {
    e.preventDefault(); setError(null);
    if (!resetEmail.trim()) { setError("Enter your email address."); return; }
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: window.location.origin + "/reset-password",
    });
    setLoading(false); setResetSent(true);
  }

  if (regionStep) {
    const tok = import.meta.env.VITE_MAPBOX_TOKEN;
    const REGIONS = [
      {
        key: "mid_atlantic",
        label: "Mid-Atlantic",
        mapUrl: `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/[-78.84,33.7,-72.21,39.5]/560x260@2x?access_token=${tok}&logo=false&attribution=false&padding=20`,
        desc: "Maryland, Virginia & North Carolina offshore - Chesapeake Bay, Outer Banks, Gulf Stream access",
        bounds: "N 39.5°  ·  S 33.7°  ·  W 78.8°  ·  E 72.2°",
        ports: ["Bay Bridge Tunnel","Beaufort Inlet","Cape Charles","Hatteras Inlet","Horn Harbor","Ocean City Inlet","Oregon Inlet","Poquoson","Virginia Beach"],
      },
      {
        key: "ga_sc",
        label: "Georgia & South Carolina",
        mapUrl: `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/[-82.0,29.8,-75.2,35.2]/560x260@2x?access_token=${tok}&logo=false&attribution=false&padding=20`,
        desc: "Southern NC, SC, Georgia & NE Florida offshore - year-round Gulf Stream, sea islands, deep inlets",
        bounds: "N 35.2°  ·  S 29.8°  ·  W 82.0°  ·  E 75.2°",
        ports: ["Beaufort SC","Carolina Beach","Charleston","Darien","Fernandina Beach","Georgetown SC","Hilton Head","Jekyll Island","Little River Inlet","Mayport","Murrells Inlet","Myrtle Beach","Southport","St. Augustine","St. Simons Island","Tybee Island","Wrightsville Beach"],
      },
      {
        key: "ne_fl",
        label: "Northeast Florida",
        mapUrl: `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/[-81.97,26.0,-76.14,30.5]/560x260@2x?access_token=${tok}&logo=false&attribution=false&padding=20`,
        desc: "Jacksonville to Fort Lauderdale offshore - Gulf Stream close to shore, reef structure, deep inlets",
        bounds: "N 30.5°  ·  S 26.0°  ·  W 81.97°  ·  E 76.14°",
        ports: ["Mayport","St. Augustine","Ponce Inlet","Port Canaveral","Sebastian Inlet","Fort Pierce","Stuart","Lake Worth Inlet","Fort Lauderdale"],
      },
      {
        key: "s_fl",
        label: "Southern Florida",
        mapUrl: `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/[-83.16,22.15,-76.14,27.47]/560x260@2x?access_token=${tok}&logo=false&attribution=false&padding=20`,
        desc: "Fort Pierce to the Florida Keys and Gulf coast offshore - Florida Straits, Gulf Stream against the reef, Keys backcountry",
        bounds: "N 27.47°  ·  S 22.15°  ·  W 83.16°  ·  E 76.14°",
        ports: ["Fort Pierce","Stuart","Lake Worth Inlet","Fort Lauderdale","Miami","Islamorada","Marathon","Key West","Naples","Marco Island","Fort Myers Beach"],
      },
      {
        key: "va_ri",
        label: "Virginia to Rhode Island",
        mapUrl: `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/[-77.46,37.26,-68.97,41.51]/560x260@2x?access_token=${tok}&logo=false&attribution=false&padding=20`,
        desc: "Chesapeake Bay mouth to Rhode Island Sound offshore - Delmarva, Jersey Shore, Long Island, Block Island Sound",
        bounds: "N 41.51°  ·  S 37.26°  ·  W 77.46°  ·  E 68.97°",
        ports: ["Virginia Beach","Wachapreague","Chincoteague","Ocean City Inlet","Indian River Inlet","Cape May","Atlantic City","Barnegat Light","Manasquan","Sandy Hook","Freeport","Captree","Moriches Inlet","Shinnecock Inlet","Montauk","Stonington","Point Judith","Newport"],
      },
    ];
    return (
      <div>
        <h3 style={{ margin: "0 0 6px", fontSize: 17, color: "#0f172a" }}>Choose your fishing region</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#475569" }}>You can change this any time in Settings.</p>
        {REGIONS.map(r => (
          <div key={r.key}
            onClick={() => setSelectedRegion(r.key)}
            style={{
              border: `2px solid ${selectedRegion === r.key ? "#1a5fd8" : "#e2e8f0"}`,
              borderRadius: 10, overflow: "hidden", cursor: "pointer",
              marginBottom: 10, transition: "border-color .15s",
            }}>
            <img src={r.mapUrl} alt={r.label}
              style={{ width: "100%", height: 130, display: "block", objectFit: "cover" }} />
            <div style={{ padding: "10px 12px 12px", background: "#fff" }}>
              {selectedRegion === r.key && (
                <span style={{
                  display: "inline-block", background: "#1a5fd8", color: "#fff",
                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, marginBottom: 5,
                }}>Selected</span>
              )}
              <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 3 }}>{r.label}</div>
              <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5, marginBottom: 6 }}>{r.desc}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6 }}>{r.bounds}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4, paddingTop: 6, borderTop: "1px solid #f1f5f9" }}>
                Departure ports
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1px 4px", fontSize: 10, color: "#64748b" }}>
                {r.ports.map(p => <span key={p}>{p}</span>)}
              </div>
            </div>
          </div>
        ))}
        {error && <div className="rl-err">{error}</div>}
        <button className="rl-fmbtn" style={{ marginTop: 6 }} onClick={handleRegionContinue} disabled={loading}>
          {loading ? "…" : "Continue"}
        </button>
      </div>
    );
  }

  if (sent) return (
    <div style={{ textAlign: "center", padding: "1rem 0" }}>
      <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Check your email</h3>
      <p style={{ color: "#475569", fontSize: 14, margin: "0 0 16px", lineHeight: 1.6 }}>
        Confirmation link sent to <strong>{email}</strong>.<br/>
        {checkoutPriceId
          ? "Click it to activate your account - we'll take you straight to checkout."
          : "Click it to activate your account and start your 30-day Pro trial."}
      </p>
      <button className="rl-fmbtn" style={{ background: "#64748b" }}
        onClick={() => { setSent(false); setMode("login"); }}>Back to sign in</button>
    </div>
  );
  if (resetSent) return (
    <div style={{ textAlign: "center", padding: "1rem 0" }}>
      <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Reset link sent</h3>
      <p style={{ color: "#475569", fontSize: 14, margin: "0 0 16px", lineHeight: 1.6 }}>
        If <strong>{resetEmail}</strong> is registered, a reset link is on its way.
      </p>
      <button className="rl-fmbtn" style={{ background: "#64748b" }}
        onClick={() => { setResetSent(false); setMode("login"); setResetEmail(""); }}>
        Back to sign in</button>
    </div>
  );
  if (mode === "reset") return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 17, color: "#0f172a" }}>Reset your password</h3>
      <p style={{ margin: "0 0 18px", fontSize: 14, color: "#475569" }}>
        Enter your email and we will send a reset link.
      </p>
      <form onSubmit={handleReset}>
        <input className="rl-inp" type="email" placeholder="Email address"
          value={resetEmail} onChange={e => setResetEmail(e.target.value)} required autoFocus />
        {error && <div className="rl-err">{error}</div>}
        <button className="rl-fmbtn" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}</button>
      </form>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button className="rl-lnk" onClick={() => { setMode("login"); setError(null); }}>
          Back to sign in</button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="rl-tabs">
        {[["register","Start Free Trial"],["login","Sign In"]].map(([m, lbl]) => (
          <button key={m} className={`rl-tab ${mode===m?"on":"off"}`}
            onClick={() => { setMode(m); setError(null); }}>{lbl}</button>
        ))}
      </div>
      {mode === "register" && (
        <div className="rl-trial">30-day free Pro trial. No credit card required.</div>
      )}
      <form onSubmit={mode === "login" ? handleLogin : handleRegister}>
        <input className="rl-inp" type="email" placeholder="Email address"
          value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        <div className="rl-pw">
          <input className="rl-inp" type={showPw?"text":"password"} placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)} required />
          <button type="button" className="rl-eye" onClick={() => setShowPw(s=>!s)}>
            <EyeIcon visible={showPw} /></button>
        </div>
        {mode === "login" && (
          <div className="rl-forgot">
            <button type="button" className="rl-lnk"
              onClick={() => { setMode("reset"); setError(null); }}>Forgot password?</button>
          </div>
        )}
        {mode === "register" && (
          <div className="rl-pw">
            <input className="rl-inp" type={showCf?"text":"password"} placeholder="Confirm password"
              value={confirm} onChange={e => setConfirm(e.target.value)} required />
            <button type="button" className="rl-eye" onClick={() => setShowCf(s=>!s)}>
              <EyeIcon visible={showCf} /></button>
          </div>
        )}
        {mode === "register" && (
          <input className="rl-inp" type="text" placeholder="Referral code (optional)"
            value={referralCode} onChange={e => setReferralCode(e.target.value)} />
        )}
        {error && <div className="rl-err">{error}</div>}
        <button className="rl-fmbtn" type="submit" disabled={loading}>
          {loading ? "…" : mode==="login" ? "Sign In" : "Create Account. Start Trial."}
        </button>
      </form>
    </div>
  );
}

function AuthModal({ open, onClose, onSuccess, initialMode, checkoutPriceId }) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="rl-modal-ov" onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div className="rl-modal">
        <div className="rl-modal-accent" />
        <button className="rl-modal-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="rl-modal-inner">
          <div className="rl-modal-logo">
            <img src={riplocBTextImg} alt="Riploc" style={{ height: 56, width: Math.round(56 * 5.295), objectFit: "contain", display: "block" }} />
          </div>
          <div className="rl-modal-title">Lock In.</div>
          <div className="rl-modal-sub">30-day Pro trial. No credit card. No BS.</div>
          <AuthForm onSuccess={() => { onClose(); onSuccess?.(); }} initialMode={initialMode} checkoutPriceId={checkoutPriceId} />
        </div>
      </div>
    </div>
  );
}

const DATA_LAYERS = [
  { title: "Sea Surface Temperature",
    body: "VIIRS daily, 36h composite, MUR 1km, and GOES. The same satellite feeds charter captains pay to access.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> },
  { title: "Chlorophyll Concentration",
    body: "Track productivity zones and baitfish concentrations. Find the green water where pelagics are stacking.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg> },
  { title: "Sea Level Anomaly",
    body: "Altimetry-derived eddy detection. Warm-core rings and upwelling zones. Where the big fish hold.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg> },
  { title: "Ocean Current Vectors",
    body: "OSCAR / HYCOM current direction and speed. Know where the water is moving before you leave the inlet.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg> },
  { title: "Bathymetry + Structure",
    body: "Depth contours, canyon labels, LORAN grid. Wrecks and hard bottom (Pro). Know the bottom before you drop.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><polygon points="3,11 22,2 13,21 11,13 3,11"/></svg> },
  { title: "Wind & Marine Weather",
    body: "Animated GFS wind raster plus NOAA port-specific forecast. Seven-day marine weather at your departure inlet.",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg> },
];


const TRUST_ITEMS = [
  "30-Day Pro Trial Free",
  "No Credit Card",
  "Marine Weather",
  "Oceanographic Data",
  "HD Satellite Imagery",
  "Live Fishing Reports",
  "100% of Tips Go to Anglers",
  "Detailed Bathymetry",
  "High Definition Shaded Relief",
  "Adjustable Color Mapping",
  "Access to All Regions",
  "Trip Planning",
  "Distance and Heading Detail",
  "Location, Route, Catch & Weather Sharing",
  "Live GPS",
];

const HERO_SLIDES = [
  {
    imgKey: "boat",
    imgPos: "55% center",
    eyebrow: "Offshore Fishing Intelligence",
    h1line1: "Stop Guessing.",
    h1span: "Lock In.",
    sub: "Professional-grade oceanographic data combined with real-time weather and a community of active offshore fishermen. SST, chlorophyll, altimetry, sea color, currents, bathymetry and more. Free. No ads. No BS.",
  },
  {
    imgKey: "mahi",
    imgPos: "center 40%",
    eyebrow: "Find the Fish",
    h1line1: "Know Where",
    h1span: "They're Biting.",
    sub: "RipLoc layers real satellite data over the exact temperature breaks, current edges, and depth changes where gamefish stack up. Stop running blind.",
  },
  {
    imgKey: "billfish",
    imgPos: "center 30%",
    eyebrow: "Contribute to Play",
    h1line1: "Share the Intel.",
    h1span: "Win Together.",
    sub: "Post a catch report. Drop a live pin. Tip a fellow angler. Every contribution earns points and opens the full community map to you.",
  },
];

function HeroCarousel({ open, heroBoatImg, featureMahiImg, ctaBillfishImg }) {
  const IMGS = { boat: heroBoatImg, mahi: featureMahiImg, billfish: ctaBillfishImg };
  const [idx, setIdx]       = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef            = useRef(null);

  function goTo(next) {
    if (fading) return;
    clearInterval(timerRef.current);
    setFading(true);
    setTimeout(() => { setIdx(next); setFading(false); }, 600);
    timerRef.current = setInterval(advance, 5500);
  }

  function advance() {
    setFading(true);
    setTimeout(() => {
      setIdx(i => (i + 1) % HERO_SLIDES.length);
      setFading(false);
    }, 600);
  }

  useEffect(() => {
    timerRef.current = setInterval(advance, 5500);
    return () => clearInterval(timerRef.current);
  }, []);

  const slide = HERO_SLIDES[idx];

  return (
    <section className="rl-hero">
      <div className={"rl-hero-photobg" + (fading ? " fading" : "")}>
        <img
          src={IMGS[slide.imgKey]}
          alt="RipLoc offshore fishing"
          style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition: slide.imgPos }}
        />
      </div>
      <div className="rl-hero-glow" />
      <div className="rl-hero-overlay" />
      <div className={"rl-hero-content" + (fading ? " fading" : "")}>
        <div className="rl-eyebrow">{slide.eyebrow}</div>
        <h1 className="rl-hero-h1">
          {slide.h1line1}<br/><span>{slide.h1span}</span>
        </h1>
        <p className="rl-hero-sub">{slide.sub}</p>
        <div className="rl-hero-ctas">
          <button className="rl-btn-hero" onClick={open}>
            Start Free. 30-Day Pro Trial.
          </button>
          <button className="rl-btn-outline"
            onClick={() => document.getElementById("video")?.scrollIntoView({ behavior: "smooth" })}>
            <PlayIcon /> Watch How It Works
          </button>
        </div>
        <p className="rl-hero-note">No credit card required &middot; Mid-Atlantic &middot; Georgia &amp; South Carolina &middot; Northeast Florida &middot; Southern Florida &middot; Virginia to Rhode Island &middot; More regions coming</p>
      </div>
      <div className="rl-carousel-dots">
        {HERO_SLIDES.map((_, i) => (
          <button
            key={i}
            className={"rl-cdot" + (i === idx ? " on" : "")}
            onClick={() => goTo(i)}
            aria-label={"Slide " + (i + 1)}
          />
        ))}
      </div>
    </section>
  );
}

// ── Community photo carousel ──────────────────────────────────────────────────
// To add photos: import the file at the top, then add { src: myImg, caption: "..." }
// Use src: null to keep a placeholder slot while curating.
const ALL_COMMUNITY_PHOTOS = [
  { src: commPhoto0  },
  { src: commPhoto1  },
  { src: commPhoto2  },
  { src: commPhoto3  },
  { src: commPhoto4  },
  { src: commPhoto5  },
  { src: commPhoto6  },
  { src: commPhoto7  },
  { src: commPhoto8  },
  { src: commPhoto9  },
  { src: commPhoto10 },
  { src: commPhoto11 },
  { src: commPhoto12 },
  { src: commPhoto13 },
  { src: commPhoto14 },
  { src: commPhoto15 },
  { src: commPhoto16 },
  { src: commPhoto17 },
  { src: commPhoto18 },
  { src: commPhoto19 },
  { src: commPhoto20 },
];
const PHOTOS_VISIBLE = 3;
function shufflePhotos(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MarketingLanding({ onAuthSuccess, authed }) {
  const [modal, setModal]     = useState(false);
  const [modalMode, setModalMode] = useState("register");
  const [checkoutIntent, setCheckoutIntent] = useState(null); // Stripe priceId, or null
  const [proLoading, setProLoading] = useState(false);
  const [upgradedBanner, setUpgradedBanner] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [photos, setPhotos] = useState(() => shufflePhotos(ALL_COMMUNITY_PHOTOS));
  // Auto-cycle carousel every 4 seconds; reset on manual nav
  const photoTimerRef = React.useRef(null);
  const startPhotoTimer = React.useCallback(() => {
    clearInterval(photoTimerRef.current);
    photoTimerRef.current = setInterval(() => {
      setPhotoIdx(i => {
        const next = i + 1;
        return next > photos.length - PHOTOS_VISIBLE ? 0 : next;
      });
    }, 4000);
  }, [photos.length]);
  React.useEffect(() => { startPhotoTimer(); return () => clearInterval(photoTimerRef.current); }, [startPhotoTimer]);
  const [ambForm, setAmbForm]             = useState({ name:"", boatName:"", location:"", email:"", phone:"", comments:"" });
  const [ambSubmitting, setAmbSubmitting] = useState(false);
  const [ambSubmitted,  setAmbSubmitted]  = useState(false);
  const [ambError,      setAmbError]      = useState("");
  const navigate = useNavigate();

  // Re-inject CSS if missing (e.g. after sign-out remount); no cleanup — global style persists
  useEffect(() => {
    injectRlGlobalCss();
  }, []);

  // Stripe redirects here on successful checkout (?upgraded=1). Show a
  // banner and strip the param so it doesn't linger on refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      setUpgradedBanner(true);
      params.delete("upgraded");
      const rest = params.toString();
      window.history.replaceState(
        null, "",
        window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash
      );
    }
  }, []);

  async function submitAmbassador() {
    if (!ambForm.name.trim() || !ambForm.email.trim()) {
      setAmbError("Name and email are required."); return;
    }
    setAmbSubmitting(true); setAmbError("");
    try {
      const { error } = await supabase.from("ambassador_applications").insert([{
        name:      ambForm.name.trim(),
        boat_name: ambForm.boatName.trim(),
        location:  ambForm.location.trim(),
        email:     ambForm.email.trim(),
        phone:     ambForm.phone.trim(),
        comments:  ambForm.comments.trim(),
      }]);
      if (error) throw error;
      // Fire-and-forget email notification (non-blocking)
      supabase.functions.invoke("notify-ambassador", {
        body: {
          name:     ambForm.name.trim(),
          email:    ambForm.email.trim(),
          boatName: ambForm.boatName.trim(),
          location: ambForm.location.trim(),
          phone:    ambForm.phone.trim(),
          comments: ambForm.comments.trim(),
        },
      }).catch(() => {}); // don't block submission on email failure
      setAmbSubmitted(true);
    } catch(e) {
      setAmbError("Something went wrong. Please email us directly.");
    } finally { setAmbSubmitting(false); }
  }

  const openRegister = () => { setModalMode("register"); setModal(true); };
  const openLogin    = () => {
    if (authed) { window.location.href = "/app"; return; }
    setModalMode("login"); setModal(true);
  };
  const done = () => {
    setModal(false);
    if (checkoutIntent) {
      // Login path -- signUp() has no session until email confirm, so this
      // only fires for an existing user signing in, which does have a
      // session immediately.
      const priceId = checkoutIntent;
      setCheckoutIntent(null);
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) startCheckoutRedirect(data.session, priceId);
      });
      return;
    }
    onAuthSuccess?.();
  };

  // Pricing card CTA: skip the second /upgrade page entirely. Logged-in
  // visitors go straight to Stripe. Logged-out visitors get the auth modal
  // inline, then go straight to Stripe from there too (see `done` above and
  // AuthForm's checkoutPriceId handling for the register path).
  async function resolveAnnualPriceId() {
    try {
      const res = await fetch("/api/get-prices");
      const data = await res.json();
      if (data?.annual?.id) return data.annual.id;
    } catch (e) {
      console.error("Failed to load prices:", e);
    }
    return "price_1Til1NDWsT9O1Ejonzrd7hIJ"; // fallback: known annual price ID
  }

  async function startCheckoutRedirect(session, priceId) {
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      console.error("Checkout failed:", err);
      // Fallback so the user isn't stuck -- lets them retry from /upgrade.
      navigate("/upgrade");
    } finally {
      setProLoading(false);
    }
  }

  async function handleGoPro() {
    setProLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const priceId = await resolveAnnualPriceId();
    if (session) {
      startCheckoutRedirect(session, priceId);
      return;
    }
    setProLoading(false);
    setCheckoutIntent(priceId);
    setModalMode("register");
    setModal(true);
  }

  return (
    <div className="rl">

      {upgradedBanner && (
        <div style={{
          background: "#0ea5e9", color: "#fff", textAlign: "center",
          padding: "12px 16px", fontSize: 14, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 12, flexWrap: "wrap",
        }}>
          <span>
            {authed
              ? "Payment received - you're Pro now."
              : "Payment received. Check your email to confirm your account, then sign in to start using Pro."}
          </span>
          <button onClick={() => setUpgradedBanner(false)} style={{
            background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
            borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 13,
          }}>Dismiss</button>
        </div>
      )}

      {/* NAV */}
      <nav className="rl-nav">
        <img src={riplocOfiImg} alt="Riploc" style={{ height: 34, width: Math.round(34 * 5.295), objectFit:"contain", display:"block" }} />
        <div className="rl-nav-links">
          <a href="#data"      className="rl-nav-link">Data</a>
          <a href="#features"  className="rl-nav-link">Features</a>
          <a href="#community" className="rl-nav-link">Community</a>
          <a href="#pricing"   className="rl-nav-link">Pricing</a>
          <a href="#ambassador" className="rl-nav-link">Ambassador</a>
        </div>
        <div className="rl-nav-right">
          <button className="rl-btn-ghost" onClick={openLogin}>Sign In</button>
          <button className="rl-btn-primary" onClick={openRegister}>Start Free</button>
        </div>
      </nav>

      {/* HERO CAROUSEL */}
      <HeroCarousel open={openRegister} heroBoatImg={heroBoatImg} featureMahiImg={featureMahiImg} ctaBillfishImg={ctaBillfishImg} />

      {/* TRUST BAR - scrolling marquee */}
      <div className="rl-trust">
        <div className="rl-trust-track">
          {[...TRUST_ITEMS, ...TRUST_ITEMS].map((t, i) => (
            <div key={i} className="rl-trust-item"><div className="rl-dot" />{t}</div>
          ))}
        </div>
      </div>

      {/* DATA INTELLIGENCE */}
      <section className="rl-sec rl-dark" id="data">
        <div className="rl-inner">
          <div className="rl-lbl">The Data</div>
          <h2 className="rl-h2">The intel pro captains rely on.<br/>Now free.</h2>
          <p className="rl-sub">
            Six layers of real satellite data: NOAA, NASA, CMEMS. Processed daily. One map built for fishing decisions, not lab reports.
          </p>
          <div className="rl-data-grid">
            {DATA_LAYERS.map(d => (
              <div key={d.title} className="rl-dcard">
                <div className="rl-dcard-icon">{d.icon}</div>
                <div className="rl-dcard-title">{d.title}</div>
                <div className="rl-dcard-body">{d.body}</div>
              </div>
            ))}
          </div>
          <div className="rl-mapframe">
            <img src={appUiImg} alt="RipLoc app - marine forecast, SST map, and route planner" />
            <div className="rl-maplabel" style={{ top: 16, left: 16 }}>Live · Oregon Inlet, NC</div>
            <div className="rl-maplabel" style={{ bottom: 16, right: 16 }}>SST + Route Planning + Marine Forecast</div>
          </div>
        </div>
      </section>

      {/* VIDEO */}
      <section className="rl-video-sec" id="video">
        <div className="rl-inner">
          <div className="rl-video-grid">
            <div>
              <div className="rl-lbl">See It In Action</div>
              <h2 className="rl-h2" style={{ color: "#fff" }}>
                From dock to drop shot<br/>in under 10 minutes.
              </h2>
              <p style={{ color: "#7a9ab5", fontSize: 17, maxWidth: 480, lineHeight: 1.7 }}>
                Learn what makes RipLoc different from other SST and weather apps. Hear from our founder on why the community is the real edge, and how contributions unlock the most valuable intel on the water.
              </p>
            </div>
            <div className="rl-video-frame">
              <video
                controls
                preload="metadata"
                playsInline
                poster=""
              >
                <source src="https://riploc-storage.s3.us-east-2.amazonaws.com/Riploc+Intro+480p.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE SHOWCASE */}
      <section className="rl-sec rl-dark" id="features">
        <div className="rl-inner">

          {/* Feature 1 */}
          <div className="rl-feat-grid">
            <div>
              <div className="rl-feat-lbl">Sea Surface Temperature</div>
              <h3 className="rl-feat-h3">Read the water<br/>like a pro.</h3>
              <p className="rl-feat-body">
                Isotherm overlays pinpoint temperature breaks to within a tenth of a degree.
                Dial in your target temperature, adjust sensitivity, and the map shows exactly
                where the edge is sitting today. Not three days ago.
              </p>
              <div className="rl-pills">
                <span className="rl-pill">VIIRS Daily</span>
                <span className="rl-pill">36h Composite</span>
                <span className="rl-pill">MUR 1km</span>
                <span className="rl-pill">Isotherm Overlay</span>
                <span className="rl-pill">Color Gain Control</span>
              </div>
            </div>
            <div className="rl-scr">
              <img src={commPinImg} alt="RipLoc live community catch report pin popup" />
            </div>
          </div>

          {/* Feature 2 */}
          <div className="rl-feat-grid rl-flip">
            <div>
              <div className="rl-feat-lbl">Trip Planner</div>
              <h3 className="rl-feat-h3">Every waypoint.<br/>Every gallon.</h3>
              <p className="rl-feat-body">
                Plot your run, set cruise speed, and get heading, distance, ETA, and fuel burn
                for every leg. Before you leave the inlet. Share your route via link or text.
                No fumbling with multiple apps at 4 AM.
              </p>
              <div className="rl-pills">
                <span className="rl-pill">Multi-Waypoint Routes</span>
                <span className="rl-pill">ETA Calculator</span>
                <span className="rl-pill">Fuel Burn Per Leg</span>
                <span className="rl-pill">Route Sharing</span>
                <span className="rl-pill">GPS Tracking</span>
              </div>
            </div>
            <div className="rl-scr">
              <img src={routeMapImg} alt="RipLoc trip plan - multi-waypoint route on SST map" />
            </div>
          </div>

          {/* Feature 3 */}
          <div className="rl-feat-grid">
            <div>
              <div className="rl-feat-lbl">Fishing Hotspots</div>
              <h3 className="rl-feat-h3">Find the fish.<br/>Not the blue desert.</h3>
              <p className="rl-feat-body">
                RipLoc's daily hotspot scoring model synthesizes SST gradients, chlorophyll
                concentration, and bottom structure into a ranked heatmap of where the bite
                is most likely to be. Satellite data refined by community intel.
              </p>
              <div className="rl-pills">
                <span className="rl-pill">Daily Hotspot Map</span>
                <span className="rl-pill">SST + CHL + Bathy Scoring</span>
                <span className="rl-pill">Canyon & Shelf Edges</span>
                <span className="rl-pill">Wreck Locations</span>
              </div>
            </div>
            <div className="rl-scr">
              <img src={hotspotImg} alt="RipLoc fishing hotspot scored zones on SST map" />
            </div>
          </div>

          {/* Feature 4 - Weather */}
          <div className="rl-feat-grid rl-flip">
            <div>
              <div className="rl-feat-lbl">Marine Weather</div>
              <h3 className="rl-feat-h3">Every forecast.<br/>One place.</h3>
              <p className="rl-feat-body">
                NOAA sea conditions, tides, wind, sunrise/sunset, and general weather - immediate
                and extended forecasts with hourly breakdowns - all built seamlessly into the app
                and pinned to your departure location. No more bouncing between five different apps
                at 4 AM. Shareable with your crew in one tap.
              </p>
              <div className="rl-pills">
                <span className="rl-pill">NOAA Sea Conditions</span>
                <span className="rl-pill">Tides</span>
                <span className="rl-pill">Wind &amp; Gusts</span>
                <span className="rl-pill">Sunrise / Sunset</span>
                <span className="rl-pill">Hourly Breakdown</span>
                <span className="rl-pill">Extended Forecast</span>
              </div>
            </div>
            <div className="rl-scr">
              <img src={weatherImg} alt="RipLoc marine weather forecast panel" />
            </div>
          </div>

          {/* Feature 5 - Sharing */}
          <div className="rl-feat-grid">
            <div>
              <div className="rl-feat-lbl">Crew Sharing</div>
              <h3 className="rl-feat-h3">Send the plan.<br/>Not a screenshot.</h3>
              <p className="rl-feat-body">
                Pro subscribers can share locations, routes, and weather with their crew via email
                or text. Recipients import everything directly into their account with one tap -                 exact waypoints, fuel calculations, and forecast included. No manual entry, no
                blurry screenshots.
              </p>
              <div className="rl-pills">
                <span className="rl-pill">Share Locations</span>
                <span className="rl-pill">Share Routes</span>
                <span className="rl-pill">Share Weather</span>
                <span className="rl-pill">Email &amp; Text</span>
                <span className="rl-pill">One-Tap Import</span>
                <span className="rl-pill">Pro Feature</span>
              </div>
            </div>
            <div className="rl-scr">
              <img src={sharingImg} alt="RipLoc crew sharing - send routes and weather to crew" />
            </div>
          </div>

        </div>
      </section>

      {/* COMMUNITY */}
      <section className="rl-comm-sec" id="community">
        <div className="rl-comm-glow" />
        <div className="rl-comm-inner">
          <div>
            <div className="rl-lbl">The Community</div>
            <h2 className="rl-comm-h2" style={{whiteSpace:"nowrap",fontSize:"clamp(2rem,4.5vw,3.8rem)"}}>It's not pay-to-play.</h2>
            <h2 className="rl-comm-h2" style={{fontSize:"clamp(2rem,4.5vw,3.8rem)"}}><em>Contribute to play.</em></h2>
            <p className="rl-comm-rule">
              Post a catch report. Drop a live pin. Share what you found. The whole community
              opens up. Everyone sharing has skin in the game. That's what keeps the intel honest.
            </p>
            <div className="rl-pillars">
              <div className="rl-pillar">
                <div className="rl-p-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div>
                  <div className="rl-p-title">Share</div>
                  <div className="rl-p-body">Drop GPS-pinned live reports (24h) or catch reports (7 days). Every pin earns points. Contribute within the last 30 days and the full community map opens up.</div>
                </div>
              </div>
              <div className="rl-pillar">
                <div className="rl-p-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <div>
                  <div className="rl-p-title">Tip</div>
                  <div className="rl-p-body">Found a report that put you on fish? Tip the angler directly via Venmo or CashApp. Real money, peer-to-peer. RipLoc keeps 0%.</div>
                </div>
              </div>
              <div className="rl-pillar">
                <div className="rl-p-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round">
                    <polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/>
                  </svg>
                </div>
                <div>
                  <div className="rl-p-title">Win</div>
                  <div className="rl-p-body">Community leaderboard tracks points for posts AND for tips given. Monthly corporate-sponsored gear giveaways for top contributors. Free and Pro alike.</div>
                </div>
              </div>
            </div>
          </div>
          <div className="rl-comm-photo" style={{borderRadius:16,overflow:"hidden",border:"1px solid rgba(0,200,232,.15)"}}>
            <img src={commLbImg} alt="RipLoc community leaderboard" style={{width:"100%",display:"block"}} />
          </div>
        </div>
      </section>


      {/* COMMUNITY PHOTOS */}
      <section className="rl-photos-sec">
        <div className="rl-photos-hdr">
          <div className="rl-photos-left">
            <div className="rl-photos-eyebrow">From The Water</div>
            <h2 className="rl-photos-h2">Real Community. Real Data.</h2>
          </div>
          <div className="rl-photos-nav">
            <button className="rl-photos-nbtn" onClick={() => { setPhotoIdx(i => Math.max(0, i-1)); startPhotoTimer(); }} disabled={photoIdx === 0} aria-label="Previous">&#8592;</button>
            <button className="rl-photos-nbtn" onClick={() => { setPhotoIdx(i => Math.min(photos.length - PHOTOS_VISIBLE, i+1)); startPhotoTimer(); }} disabled={photoIdx >= photos.length - PHOTOS_VISIBLE} aria-label="Next">&#8594;</button>
          </div>
        </div>
        <div className="rl-photos-track-wrap">
          <div className="rl-photos-track" style={{ transform: `translateX(calc(-${photoIdx * 516}px))` }}>
            {photos.map((p, i) => (
              <div className="rl-photo-slide" key={i}>
                {p.src
                  ? <><img src={p.src} alt={p.caption || "Community catch"} />{p.caption && <div className="rl-photo-caption">{p.caption}</div>}</>
                  : <div className="rl-photo-placeholder"><div className="rl-photo-ph-label">Photo coming soon</div></div>
                }
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NO BS */}
      <section className="rl-nobs-sec">
        <div className="rl-inner">
          <div className="rl-nobs-hdr">
            <div className="rl-nobs-eyebrow">Our Commitment</div>
            <h2 className="rl-nobs-h2">Built for anglers.<br/>Not advertisers.</h2>
            <p className="rl-nobs-sub">
              You're running a boat offshore. That costs real money. We built this for people who respond to utility, not interruption.
            </p>
          </div>
          <div className="rl-nobs-grid">
            <div className="rl-nobs-card">
              <div className="rl-nbadge nbno">✕</div>
              <div className="rl-nc-title">No Ads. Ever.</div>
              <div className="rl-nc-body">No banner ads, sponsored content, or third-party tracking. The platform exists to help you catch fish. That is the only job.</div>
            </div>
            <div className="rl-nobs-card">
              <div className="rl-nbadge nbno">✕</div>
              <div className="rl-nc-title">No In-App Purchases.</div>
              <div className="rl-nc-body">No features locked behind individual purchases. Free is free. Pro is Pro. One price, everything included. No nickel-and-diming.</div>
            </div>
            <div className="rl-nobs-card">
              <div className="rl-nbadge nbyes">✓</div>
              <div className="rl-nc-title">100% Tips to Anglers.</div>
              <div className="rl-nc-body">Every dollar tipped goes directly to the angler who earned it. We take zero. Monetization is Pro subscriptions only. Our interests are aligned with yours.</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="rl-price-sec" id="pricing">
        <div className="rl-price-inner">
          <div className="rl-price-hdr">
            <div className="rl-lbl" style={{ marginBottom: "0.75rem" }}>Pricing</div>
            <h2 className="rl-price-h2">Less than one offshore trip.</h2>
            <p className="rl-price-sub">Pro is less expensive than every competing SST platform. And it outperforms them all.</p>
          </div>
          <div className="rl-cards">
            <StandardPricingCard
              price="$0" priceUnit="/forever" note="Create an account. No card needed."
              ctaLabel="Create Free Account" onCta={openRegister}
            />
            <ProPricingCard badge="2026 Promo Rate" price="$49" priceUnit="/year" note="$99/yr after 2026 · or $15/mo">
              <button className="rl-pcta dk" onClick={handleGoPro} disabled={proLoading}>
                {proLoading ? "Loading…" : "Go Pro. $49/yr"}
              </button>
            </ProPricingCard>
          </div>
          <div className="rl-price-footer">30-day free Pro trial on every account. No credit card required.</div>
        </div>
      </section>

      {/* FINAL CTA */}

      {/* AMBASSADOR */}
      <section className="rl-amb-sec" id="ambassador">
        <div className="rl-amb-inner">
          <div>
            <div className="rl-amb-eyebrow">Ambassador Program</div>
            <h2 className="rl-amb-h2">Run the water.<br/>Fly the flag.</h2>
            <p className="rl-amb-body">
              Captains, mates, and folks in the trade who use the app, push the product forward, and hold us accountable to build something worth fishing with. In return, the app is yours free. And you get Pro subscriptions to gift to your crew.
            </p>
            <div className="rl-amb-perks">
              <div className="rl-amb-perk"><div className="rl-amb-dot"/><div className="rl-amb-perk-text">Free Pro subscription, no expiration</div></div>
              <div className="rl-amb-perk"><div className="rl-amb-dot"/><div className="rl-amb-perk-text">Pro gift subscriptions to pass to your crew</div></div>
              <div className="rl-amb-perk"><div className="rl-amb-dot"/><div className="rl-amb-perk-text">Direct line to the dev team -- your feedback shapes the roadmap</div></div>
              <div className="rl-amb-perk"><div className="rl-amb-dot"/><div className="rl-amb-perk-text">Featured on the community leaderboard</div></div>
              <div className="rl-amb-perk"><div className="rl-amb-dot"/><div className="rl-amb-perk-text">One requirement: stay active, contribute, and keep it honest</div></div>
            </div>
          </div>
          <div className="rl-amb-form-wrap">
            {ambSubmitted ? (
              <div className="rl-amb-success">
                <div className="rl-amb-success-h">Application Received.</div>
                <p className="rl-amb-success-p">We review every application personally. Expect to hear from us within a few days. Thank you!</p>
              </div>
            ) : (
              <>
                <div className="rl-amb-form-title">Apply</div>
                <div className="rl-amb-form-sub">Takes 2 minutes. We read every one.</div>
                <div className="rl-amb-row">
                  <div className="rl-amb-field">
                    <label className="rl-amb-label">Name</label>
                    <input className="rl-amb-input" placeholder="Captain Jane Smith" value={ambForm.name} onChange={e => setAmbForm(f=>({...f,name:e.target.value}))} />
                  </div>
                  <div className="rl-amb-field">
                    <label className="rl-amb-label">Boat Name</label>
                    <input className="rl-amb-input" placeholder="Reel Therapy" value={ambForm.boatName} onChange={e => setAmbForm(f=>({...f,boatName:e.target.value}))} />
                  </div>
                </div>
                <div className="rl-amb-field">
                  <label className="rl-amb-label">Home Port / Location</label>
                  <input className="rl-amb-input" placeholder="Oregon Inlet, NC" value={ambForm.location} onChange={e => setAmbForm(f=>({...f,location:e.target.value}))} />
                </div>
                <div className="rl-amb-row">
                  <div className="rl-amb-field">
                    <label className="rl-amb-label">Email</label>
                    <input className="rl-amb-input" type="email" placeholder="you@email.com" value={ambForm.email} onChange={e => setAmbForm(f=>({...f,email:e.target.value}))} />
                  </div>
                  <div className="rl-amb-field">
                    <label className="rl-amb-label">Phone</label>
                    <input className="rl-amb-input" type="tel" placeholder="(252) 555-0100" value={ambForm.phone} onChange={e => setAmbForm(f=>({...f,phone:e.target.value}))} />
                  </div>
                </div>
                <div className="rl-amb-field">
                  <label className="rl-amb-label">Tell us about yourself</label>
                  <textarea className="rl-amb-input rl-amb-textarea" placeholder="How you fish, how you use the app, what you'd change, who you'd tell about it..." value={ambForm.comments} onChange={e => setAmbForm(f=>({...f,comments:e.target.value}))} />
                </div>
                {ambError && <div className="rl-amb-error">{ambError}</div>}
                <button className="rl-amb-submit" disabled={ambSubmitting} onClick={submitAmbassador}>
                  {ambSubmitting ? "Sending..." : "Submit Application"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="rl-final">
        <div className="rl-final-ph">
          <img src={ctaBillfishImg} alt="Billfish at the waterline"
            style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"center 30%" }} />
        </div>
        <div className="rl-final-ov" />
        <div className="rl-final-glow" />
        <div className="rl-final-content">
          <div className="rl-final-eyebrow">Start Fishing Smarter</div>
          <h2 className="rl-final-h2"><span>Lock In.</span></h2>
          <div className="rl-final-divider" />
          <p className="rl-final-sub">
            30 days free. No credit card. No obligation.<br/>Better intel before you leave the dock.
          </p>
          <button className="rl-btn-hero" style={{ fontSize: 19, padding: "1.1rem 3rem", letterSpacing:".03em" }} onClick={openRegister}>
            Start Free. 30-Day Pro Trial.
          </button>
          <p className="rl-final-note">30 days free. Cancel anytime. East Coast Mid-Atlantic.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="rl-footer">
        <div className="rl-footer-in">
          <RipLocLogo h={26} />
          <div className="rl-flinks">
            <a href="/privacy" className="rl-flink">Privacy</a>
            <a href="/terms"   className="rl-flink">Terms</a>
            <a href="mailto:hello@riploc.com" className="rl-flink">Contact</a>
          </div>
          <div className="rl-fcopy">© 2026 RipLoc. All rights reserved.</div>
        </div>
      </footer>

      <AuthModal open={modal} onClose={() => setModal(false)} onSuccess={done} initialMode={modalMode} checkoutPriceId={checkoutIntent} />
    </div>
  );
}
