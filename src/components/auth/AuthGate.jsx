import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

function InputField({ label, id, type = "text", value, onChange, autoComplete }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-slate-600">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 transition-colors"
      />
    </div>
  );
}

function AuthButton({ loading, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full h-10 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}

function RegisterForm({ onSwitch }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [sent, setSent]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    const { error: sbError } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (sbError) { setError(sbError.message); } else { setSent(true); }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="text-4xl">📬</div>
        <p className="text-sm text-slate-700 font-medium">Check your email</p>
        <p className="text-xs text-slate-500 max-w-xs">
          We sent a confirmation link to <strong>{email}</strong>. Click it to
          activate your free 7-day trial.
        </p>
        <button onClick={onSwitch} className="text-xs text-cyan-600 hover:underline mt-2">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <InputField label="Email" id="reg-email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <InputField label="Password" id="reg-password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
      <InputField label="Confirm password" id="reg-confirm" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <AuthButton loading={loading}>Create free account</AuthButton>
      <p className="text-center text-xs text-slate-500">
        Already have an account?{" "}
        <button type="button" onClick={onSwitch} className="text-cyan-600 hover:underline font-medium">
          Sign in
        </button>
      </p>
    </form>
  );
}

function LoginForm({ onSwitch }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: sbError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (sbError) setError(sbError.message);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <InputField label="Email" id="login-email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <InputField label="Password" id="login-password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <AuthButton loading={loading}>Sign in</AuthButton>
      <p className="text-center text-xs text-slate-500">
        No account yet?{" "}
        <button type="button" onClick={onSwitch} className="text-cyan-600 hover:underline font-medium">
          Start free trial
        </button>
      </p>
    </form>
  );
}

export default function AuthGate({ children }) {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState("login");

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-50 to-slate-100">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (user) return children;

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-50 to-slate-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-lg p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl mb-1">🌊</div>
          <h1 className="text-lg font-semibold text-slate-800">OceanCast SST</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {mode === "login" ? "Sign in to access your SST data" : "Start your free 7-day trial"}
          </p>
        </div>
        {mode === "login"
          ? <LoginForm onSwitch={() => setMode("register")} />
          : <RegisterForm onSwitch={() => setMode("login")} />
        }
        <p className="mt-6 text-center text-[10px] text-slate-400">
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}