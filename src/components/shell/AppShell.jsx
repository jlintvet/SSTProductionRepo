// src/components/shell/AppShell.jsx
import React from "react";
import { AppProvider, useAppContext } from "@/context/AppContext";
import TopBar from "@/components/shell/TopBar";
import WeatherDrawer from "@/components/weather/WeatherDrawer";
import WeatherBottomSheet from "@/components/weather/WeatherBottomSheet";
import { CloudSun } from "lucide-react";

const Z_SHOW_PILL = 950;

// ── Inline login (no external deps) ──────────────────────────────────────────
function InlineLogin() {
  const [mode, setMode]       = useState("login");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [sent, setSent]       = useState(false);

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

  const wrap = { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f0f9ff" };
  const card = { background:"#fff", borderRadius:12, padding:"2rem 2.5rem", width:360, boxShadow:"0 4px 24px rgba(0,0,0,0.10)" };
  const inp  = { width:"100%", padding:"0.6rem 0.8rem", border:"1px solid #cbd5e1", borderRadius:6, fontSize:15, marginBottom:12, boxSizing:"border-box" };
  const btn  = { width:"100%", padding:"0.65rem", background:"#0e7490", color:"#fff", border:"none", borderRadius:6, fontSize:15, cursor:"pointer", marginTop:4 };
  const lnk  = { background:"none", border:"none", color:"#0e7490", cursor:"pointer", fontSize:13, textDecoration:"underline" };

  if (sent) return (
    <div style={wrap}><div style={card}>
      <h2 style={{ margin:"0 0 0.5rem", color:"#0e7490" }}>Check your email</h2>
      <p style={{ color:"#475569", fontSize:14 }}>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then log in.</p>
      <button style={btn} onClick={() => { setSent(false); setMode("login"); }}>Back to login</button>
    </div></div>
  );

  return (
    <div style={wrap}><div style={card}>
      <h2 style={{ margin:"0 0 1.25rem", color:"#0e7490" }}>{mode === "login" ? "Sign in to SST Live" : "Create account"}</h2>
      <form onSubmit={mode === "login" ? handleLogin : handleRegister}>
        <input style={inp} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        <input style={inp} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        {mode === "register" && <input style={inp} type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required />}
        {error && <p style={{ color:"#dc2626", fontSize:13, margin:"0 0 8px" }}>{error}</p>}
        <button style={btn} type="submit" disabled={loading}>{loading ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <p style={{ textAlign:"center", marginTop:16, fontSize:13, color:"#64748b" }}>
        {mode === "login"
          ? <>No account? <button style={lnk} onClick={() => { setMode("register"); setError(null); }}>Sign up</button></>
          : <>Have an account? <button style={lnk} onClick={() => { setMode("login"); setError(null); }}>Sign in</button></>}
      </p>
    </div></div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────
// Auth is already guaranteed by SSTLive + SSTLiveGate before AppShell mounts.
// key={region} forces AppProvider to fully remount when region changes so
// selectedLocation and all other region-derived state reinitialise correctly.
export default function AppShell({ region, children, onUpgrade }) {
  return (
    <AppProvider key={region} region={region}>
      <Layout onUpgrade={onUpgrade}>{children}</Layout>
    </AppProvider>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
function Layout({ children, onUpgrade }) {
  const isDesktop = useIsDesktop();

  return (
    <div className="sst-fullscreen w-screen flex flex-col overflow-hidden bg-gradient-to-br from-blue-50 via-sky-50 to-slate-100">
      <TopBar onUpgrade={onUpgrade} />
      <div className="flex-1 flex overflow-hidden relative">
        {isDesktop && <WeatherDrawer />}
        <main className="flex-1 flex overflow-hidden relative">
          {children}
        </main>
        {isDesktop && <ShowWeatherPill />}
      </div>
      {!isDesktop && <WeatherBottomSheet />}
    </div>
  );
}

function ShowWeatherPill() {
  const { weatherPanel, setWeatherPanel } = useAppContext();
  if (weatherPanel !== "hidden") return null;
  return (
    <button
      onClick={() => setWeatherPanel("expanded")}
      className="hidden sm:flex absolute top-3 left-3 items-center gap-1.5 bg-white border border-slate-200 rounded-full shadow-md px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      style={{ zIndex: Z_SHOW_PILL }}
      title="Show weather panel"
    >
      <CloudSun className="w-3.5 h-3.5 text-cyan-500" />
      <span>Show weather</span>
    </button>
  );
}

function useIsDesktop(breakpoint = 640) {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);

  return isDesktop;
}
