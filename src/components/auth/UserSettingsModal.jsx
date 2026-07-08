// src/components/auth/UserSettingsModal.jsx
// User settings modal — units, boat info, fuel, cruise speed.
// Reads/writes Supabase `user_settings` table (RLS: user can only access own row).
//
// Supabase table DDL (run once in SQL editor):
//   create table if not exists public.user_settings (
//     user_id uuid primary key references auth.users(id) on delete cascade,
//     speed_unit text not null default 'knots',
//     depth_unit text not null default 'feet',
//     boat_name text default '',
//     boat_length_ft numeric,
//     fuel_tank_gal numeric,
//     fuel_burn_gal_hr numeric,
//     trolling_burn_gal_hr numeric,
//     cruise_speed_kts numeric,
//     gps_device_label text default '',
//     updated_at timestamptz default now()
//   );
//   alter table public.user_settings enable row level security;
//   create policy "own settings" on public.user_settings
//     using (auth.uid() = user_id) with check (auth.uid() = user_id);

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAppContext } from "@/context/AppContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// iOS Safari doesn't expose the Push API in a regular browser tab at all --
// only inside a PWA that's been added to the Home Screen (iOS 16.4+). When
// push isn't supported we still show the section (rather than hiding it,
// which just looked like the setting was missing/broken), with whichever
// explanation applies.
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS 13+ reports as Mac
}
function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return window.navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)")?.matches === true;
}

export const DEFAULT_SETTINGS = {
  speed_unit: "knots",
  depth_unit: "feet",
  boat_name: "",
  boat_length_ft: "",
  fuel_tank_gal: "",
  fuel_burn_gal_hr: "",
  trolling_burn_gal_hr: "",
  cruise_speed_kts: "",
  gps_device_label: "",
};

export async function loadUserSettings(userId) {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !data) return { ...DEFAULT_SETTINGS };
  return {
    speed_unit:       data.speed_unit       ?? DEFAULT_SETTINGS.speed_unit,
    depth_unit:       data.depth_unit       ?? DEFAULT_SETTINGS.depth_unit,
    boat_name:        data.boat_name        ?? "",
    boat_length_ft:   data.boat_length_ft   ?? "",
    fuel_tank_gal:    data.fuel_tank_gal    ?? "",
    fuel_burn_gal_hr:     data.fuel_burn_gal_hr     ?? "",
    trolling_burn_gal_hr: data.trolling_burn_gal_hr ?? "",
    cruise_speed_kts:     data.cruise_speed_kts     ?? "",
    gps_device_label: data.gps_device_label ?? "",
  };
}

export async function saveUserSettings(userId, settings) {
  const row = {
    user_id:          userId,
    speed_unit:       settings.speed_unit,
    depth_unit:       settings.depth_unit,
    boat_name:        settings.boat_name        || null,
    boat_length_ft:   settings.boat_length_ft   !== "" ? Number(settings.boat_length_ft)   : null,
    fuel_tank_gal:    settings.fuel_tank_gal    !== "" ? Number(settings.fuel_tank_gal)    : null,
    fuel_burn_gal_hr:     settings.fuel_burn_gal_hr     !== "" ? Number(settings.fuel_burn_gal_hr)     : null,
    trolling_burn_gal_hr: settings.trolling_burn_gal_hr !== "" ? Number(settings.trolling_burn_gal_hr) : null,
    cruise_speed_kts:     settings.cruise_speed_kts     !== "" ? Number(settings.cruise_speed_kts)     : null,
    gps_device_label: settings.gps_device_label || null,
    updated_at:       new Date().toISOString(),
  };
  const { error } = await supabase.from("user_settings").upsert(row, { onConflict: "user_id" });
  return !error;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UserSettingsModal({ userId, onClose, onSaved }) {
  // gpsActive/boatPosition live in AppContext (not local map state) so this
  // modal -- a sibling of the map, not nested under it -- can read live
  // position for the "use my live GPS" notification preference.
  const { selectedLocation, gpsActive, boatPosition, startGps } = useAppContext();
  const push = usePushNotifications({ userId, selectedLocation, gpsActive, boatPosition, startGps });
  // Local text buffer for the radius input -- lets the user freely clear/
  // retype without the controlled value immediately snapping to a clamped
  // fallback on every keystroke. Only clamps + commits on blur.
  const [radiusInput, setRadiusInput] = useState(String(push.pushRadius));
  useEffect(() => { setRadiusInput(String(push.pushRadius)); }, [push.pushRadius]);
  function commitRadiusInput() {
    const n = Math.max(1, Math.min(250, parseInt(radiusInput, 10) || 1));
    setRadiusInput(String(n));
    if (n !== push.pushRadius) push.handleChangePushRadius(n);
  }
  const [form, setForm]       = useState(DEFAULT_SETTINGS);
  const [navShareDefault, setNavShareDefault] = useState(() => {
    try { return localStorage.getItem("riploc.navShareDefault") === "1"; } catch (_) { return false; }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [profile, setProfile] = useState({ display_name: "", venmo_handle: "", cashapp_handle: "" });
  const [referral, setReferral] = useState({ tier: null, referred_by: null, referral_end: null });
  const [referralInput, setReferralInput] = useState("");
  const [referralStatus, setReferralStatus] = useState(null); // null | "redeeming" | "ok" | error message
  const [ambCodeInput, setAmbCodeInput] = useState("");
  const [ambCodeError, setAmbCodeError] = useState(null); // null | error message string
  const [myReferrals, setMyReferrals] = useState([]);
  const [myReferralsLoading, setMyReferralsLoading] = useState(false);
  // Region is part of the same unsaved-changes flow as everything else in
  // this modal -- picking a region just updates local state here; it's
  // written to user_profiles (alongside display_name etc.) when "Save
  // Settings" is clicked, same as every other field. initialRegionRef
  // remembers the region loaded from the DB so we know whether to reload
  // the page after saving -- region drives which region config/data
  // pipeline the whole app uses, so a change needs a fresh load; other
  // settings don't.
  const [region, setRegion]   = useState("mid_atlantic");
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const initialRegionRef      = useRef("mid_atlantic");
  const overlayRef            = useRef(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      loadUserSettings(userId),
      supabase.from("user_profiles").select("display_name, venmo_handle, cashapp_handle, tier, referred_by, referral_end, referral_code, region").eq("id", userId).single(),
    ]).then(([s, { data: prof }]) => {
      setForm(s);
      setProfile({
        display_name:   prof?.display_name   ?? "",
        venmo_handle:   prof?.venmo_handle   ?? "",
        cashapp_handle: prof?.cashapp_handle ?? "",
      });
      const loadedRegion = prof?.region ?? "mid_atlantic";
      setRegion(loadedRegion);
      initialRegionRef.current = loadedRegion;
      setReferral({
        tier:          prof?.tier ?? null,
        referred_by:   prof?.referred_by ?? null,
        referral_end:  prof?.referral_end ?? null,
        referral_code: prof?.referral_code ?? null,
      });
      setAmbCodeInput(prof?.referral_code ?? "");
      setLoading(false);
      if (prof?.tier === "ambassador") loadMyReferrals();
    });
  }, [userId]);

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    setSaved(false);
  }

  function setProf(key, val) {
    setProfile(p => ({ ...p, [key]: val }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setAmbCodeError(null);
    const regionChanged = region !== initialRegionRef.current;
    const codeChanged = referral.tier === "ambassador" &&
      ambCodeInput.trim() &&
      ambCodeInput.trim().toLowerCase() !== (referral.referral_code || "");
    const saves = [
      saveUserSettings(userId, form),
      supabase.from("user_profiles").update({
        display_name:   profile.display_name.trim()   || null,
        venmo_handle:   profile.venmo_handle.trim()   || null,
        cashapp_handle: profile.cashapp_handle.trim() || null,
        region,
      }).eq("id", userId).select(),
    ];
    if (codeChanged) saves.push(supabase.rpc("set_my_referral_code", { p_code: ambCodeInput.trim().toLowerCase() }));
    const results = await Promise.all(saves);
    const [ok, { error: profError }] = results;
    if (codeChanged) {
      const { error: codeError } = results[2];
      if (codeError) setAmbCodeError(codeError.message || "Could not save that code");
      else { setReferral(r => ({ ...r, referral_code: ambCodeInput.trim().toLowerCase() })); loadMyReferrals(); }
    }
    if (profError) console.error("profile upsert error:", profError);
    setSaving(false);
    if (ok && !profError) {
      setSaved(true);
      onSaved?.(form);
      if (regionChanged) {
        // Region drives which region config/data pipeline the whole app
        // uses -- reload so everything downstream picks up the new region
        // instead of trying to hot-swap it across the app. That reload
        // blows away all React state including this modal, which looked
        // like Settings had just closed instead of saved -- flag it so
        // UserMenu reopens Settings right after the reload completes.
        try { sessionStorage.setItem("riploc.reopenSettingsAfterReload", "1"); } catch (_) {}
        window.location.reload();
        return;
      }
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function loadMyReferrals() {
    setMyReferralsLoading(true);
    const { data, error } = await supabase.rpc("get_my_referrals");
    if (!error) setMyReferrals(data || []);
    setMyReferralsLoading(false);
  }

  async function handleRedeemReferral() {
    const code = referralInput.trim();
    if (!code) return;
    setReferralStatus("redeeming");
    const { error } = await supabase.rpc("redeem_referral_code", { p_code: code });
    if (error) {
      setReferralStatus(error.message || "Invalid code");
    } else {
      setReferralStatus("ok");
      setReferral(r => ({ ...r, tier: "referral", referred_by: code }));
    }
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  if (loading) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/40 px-4 pt-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-sm font-bold text-slate-800">Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-6 overflow-y-auto flex-1">

          {/* ── Fishing Region ── */}
          <Section title="Fishing Region">
            {!showRegionPicker ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600 w-24 flex-shrink-0">Region</span>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-xs text-slate-800 font-medium">
                    {region === "mid_atlantic" ? "Mid-Atlantic" : "Georgia & South Carolina"}
                  </span>
                  <button
                    onClick={() => setShowRegionPicker(true)}
                    className="text-xs text-cyan-600 font-semibold hover:text-cyan-700"
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <RegionPickerInline
                selected={region}
                onSelect={(key) => {
                  setRegion(key);
                  setSaved(false);
                  setShowRegionPicker(false);
                }}
                onCancel={() => setShowRegionPicker(false)}
              />
            )}
          </Section>

          {/* ── Display Units ── */}
          <Section title="Display Units">
            <Row label="Speed">
              <ToggleGroup
                value={form.speed_unit}
                options={[{ value: "knots", label: "Knots" }, { value: "mph", label: "MPH" }]}
                onChange={v => set("speed_unit", v)}
              />
            </Row>
            <Row label="Depth">
              <ToggleGroup
                value={form.depth_unit}
                options={[{ value: "feet", label: "Feet" }, { value: "fathoms", label: "Fathoms" }]}
                onChange={v => set("depth_unit", v)}
              />
            </Row>
          </Section>

          {/* ── Boat Info ── */}
          <Section title="Boat">
            <Row label="Name">
              <TextInput
                value={form.boat_name}
                placeholder="My Boat"
                onChange={v => set("boat_name", v)}
              />
            </Row>
            <Row label="Length">
              <NumInput
                value={form.boat_length_ft}
                placeholder="e.g. 35"
                unit="ft"
                onChange={v => set("boat_length_ft", v)}
              />
            </Row>
          </Section>

          {/* ── Fuel & Speed ── */}
          <Section title="Fuel & Speed">
            <Row label="Tank size">
              <NumInput
                value={form.fuel_tank_gal}
                placeholder="e.g. 200"
                unit="gal"
                onChange={v => set("fuel_tank_gal", v)}
              />
            </Row>
            <Row label="Cruise Burn Rate">
              <NumInput
                value={form.fuel_burn_gal_hr}
                placeholder="e.g. 25"
                unit="gal/hr"
                onChange={v => set("fuel_burn_gal_hr", v)}
              />
            </Row>
            <Row label="Trolling Burn Rate">
              <NumInput
                value={form.trolling_burn_gal_hr}
                placeholder="e.g. 4"
                unit="gal/hr"
                onChange={v => set("trolling_burn_gal_hr", v)}
              />
            </Row>
            <Row label="Cruise speed">
              <NumInput
                value={form.cruise_speed_kts}
                placeholder="e.g. 28"
                unit="kts"
                onChange={v => set("cruise_speed_kts", v)}
              />
            </Row>
          </Section>

          {/* ── Navigation ── */}
          <Section title="Navigation">
            <Row label="Display name">
              <span className="text-xs text-slate-500 leading-snug">
                Set in <span className="font-medium text-slate-700">Community Profile</span> below — shown to other users when you share live location while navigating.
              </span>
            </Row>
            <Row label="Share by default">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={navShareDefault}
                  onChange={e => {
                    setNavShareDefault(e.target.checked);
                    try { localStorage.setItem("riploc.navShareDefault", e.target.checked ? "1" : "0"); } catch (_) {}
                  }}
                  className="rounded border-slate-300 text-cyan-500 focus:ring-cyan-400"
                />
                <span className="text-xs text-slate-600">Share live location when starting navigation</span>
              </label>
            </Row>
          </Section>

          {/* ── Community Profile ── */}
          <Section title="Community Profile">
            <Row label="Display name">
              <TextInput
                value={profile.display_name}
                placeholder="e.g. Captain Jon"
                onChange={v => setProf("display_name", v)}
              />
            </Row>
            <Row label="Venmo">
              <TextInput
                value={profile.venmo_handle}
                placeholder="@username"
                onChange={v => setProf("venmo_handle", v)}
              />
            </Row>
            <Row label="Cash App">
              <TextInput
                value={profile.cashapp_handle}
                placeholder="$cashtag"
                onChange={v => setProf("cashapp_handle", v)}
              />
            </Row>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Display name appears on your community pins. Payment handles let other anglers tip you for catch reports.
            </p>
          </Section>

          {/* ── Notifications ── */}
          <Section title="Notifications">
            {!push.pushSupported ? (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {isIOS() && !isStandalonePwa()
                  ? <>Push notifications aren't available in Safari directly. Tap the Share button and choose
                     <strong> "Add to Home Screen,"</strong> then open RipLoc from the icon it creates to turn this on.</>
                  : "Push notifications aren't supported in this browser."}
              </p>
            ) : (
              <>
              <button
                onClick={push.handleTogglePush}
                disabled={push.pushBusy}
                className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${
                  push.pushEnabled
                    ? "bg-cyan-500 text-white hover:bg-cyan-600"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {push.pushBusy
                  ? "Updating…"
                  : push.pushEnabled
                    ? "Notifying you of nearby live pins — tap to turn off"
                    : "Notify me about nearby live pins"}
              </button>
              {push.pushEnabled && (
                <>
                  <Row label="Within">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={250}
                        value={radiusInput}
                        onChange={e => setRadiusInput(e.target.value)}
                        onBlur={commitRadiusInput}
                        onKeyDown={e => { if (e.key === "Enter") { commitRadiusInput(); e.target.blur(); } }}
                        className="w-16 text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-cyan-400 text-slate-800"
                      />
                      <span className="text-[11px] text-slate-400">
                        miles of {push.pushUseGps ? "my live position" : "my departure location"}
                      </span>
                    </div>
                  </Row>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!push.pushUseGps}
                      onChange={e => push.handleTogglePushUseGps(e.target.checked)}
                      className="accent-cyan-500"
                    />
                    <span className="text-[11px] text-slate-500">
                      Use my live GPS position while tracking
                      {/* Checking this box starts GPS automatically -- no
                          need to separately enable it on the map. */}
                      {!gpsActive && " (this will turn on GPS)"}
                    </span>
                  </label>
                </>
              )}
              {push.pushError && (
                <p className="text-[11px] text-red-500">{push.pushError}</p>
              )}
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Get a push notification when another angler drops a Live pin nearby. Anchored to your
                departure location by default, or your live GPS position while tracking if you turn that on above.
              </p>
              </>
            )}
          </Section>

          {/* ── Ambassador ── */}
          {referral.tier === "ambassador" && (
            <Section title="Ambassador">
              <Row label="Your code">
                <TextInput
                  value={ambCodeInput}
                  placeholder="e.g. captainjoethankyou"
                  onChange={v => setAmbCodeInput(v.toLowerCase())}
                />
              </Row>
              {ambCodeError && (
                <p className="text-[11px] text-red-500">{ambCodeError}</p>
              )}
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Share this code — anyone who redeems it gets a free year of Pro. 4-30 lowercase letters/numbers, no spaces or symbols.
              </p>

              <div className="pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Redeemed by ({myReferrals.length})
                </p>
                {myReferralsLoading ? (
                  <p className="text-[11px] text-slate-400">Loading…</p>
                ) : myReferrals.length === 0 ? (
                  <p className="text-[11px] text-slate-400">No one has used your code yet.</p>
                ) : (
                  <div className="space-y-2">
                    {myReferrals.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <div className="min-w-0">
                          <div className="text-slate-700 font-medium truncate">
                            {r.display_name || r.email || "Anonymous"}
                          </div>
                          {r.email && r.display_name && (
                            <div className="text-slate-400 truncate">{r.email}</div>
                          )}
                        </div>
                        <div className="text-slate-400 flex-shrink-0 pl-2">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ── Referral Code ── */}
          {referral.tier !== "pro" && referral.tier !== "ambassador" && (
            <Section title="Referral Code">
              {referral.referred_by ? (
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Redeemed code <strong>{referral.referred_by}</strong>
                  {referral.referral_end && (
                    <> — active until {new Date(referral.referral_end).toLocaleDateString()}</>
                  )}
                  .
                </p>
              ) : (
                <>
                  <Row label="Code">
                    <TextInput
                      value={referralInput}
                      placeholder="e.g. captainjoethankyou"
                      onChange={setReferralInput}
                    />
                  </Row>
                  <button
                    onClick={handleRedeemReferral}
                    disabled={referralStatus === "redeeming" || !referralInput.trim()}
                    className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 disabled:opacity-50"
                  >
                    {referralStatus === "redeeming" ? "Redeeming…" : "Redeem code"}
                  </button>
                  {referralStatus && referralStatus !== "redeeming" && referralStatus !== "ok" && (
                    <p className="text-[11px] text-red-500">{referralStatus}</p>
                  )}
                  {referralStatus === "ok" && (
                    <p className="text-[11px] text-emerald-600">Code redeemed — you now have a year of Pro access.</p>
                  )}
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Have a code from one of our ambassadors? Redeem it here for a free year of Pro access.
                  </p>
                </>
              )}
            </Section>
          )}

          {/* ── GPS ── */}
          <Section title="GPS Device">
            <Row label="Device label">
              <TextInput
                value={form.gps_device_label}
                placeholder="e.g. iPhone, Simrad NSS"
                onChange={v => set("gps_device_label", v)}
              />
            </Row>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Used to label your position on the map when Real Time mode is active. NMEA bridge support for Simrad/Lowrance coming soon.
            </p>
          </Section>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save Settings"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              document.dispatchEvent(new CustomEvent("riploc:start-tour"));
              onClose();
            }}
            className="px-4 py-2 text-sm text-cyan-600 hover:text-cyan-800 font-medium transition-colors"
          >
            App Tour
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ToggleGroup({ value, options, onChange }) {
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            value === o.value
              ? "bg-cyan-500 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TextInput({ value, placeholder, onChange }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-400 text-slate-800 placeholder-slate-300"
    />
  );
}

function NumInput({ value, placeholder, unit, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-400 text-slate-800 placeholder-slate-300"
      />
      <span className="text-[11px] text-slate-400 flex-shrink-0 w-10">{unit}</span>
    </div>
  );
}

const REGION_PICKER_DATA = [
  {
    key: "mid_atlantic",
    label: "Mid-Atlantic",
    desc: "Maryland, Virginia & North Carolina offshore — Chesapeake Bay, Outer Banks, Gulf Stream access",
    bounds: "N 39.5°  ·  S 33.7°  ·  W 78.8°  ·  E 72.2°",
    bbox: "[-78.84,33.7,-72.21,39.5]",
    ports: ["Bay Bridge Tunnel","Beaufort Inlet","Cape Charles","Hatteras Inlet","Horn Harbor","Ocean City Inlet","Oregon Inlet","Poquoson","Virginia Beach"],
  },
  {
    key: "ga_sc",
    label: "Georgia & South Carolina",
    desc: "Southern NC, SC, Georgia & NE Florida offshore — year-round Gulf Stream, sea islands, deep inlets",
    bounds: "N 35.2°  ·  S 29.8°  ·  W 82.0°  ·  E 75.2°",
    bbox: "[-82.0,29.8,-75.2,35.2]",
    ports: ["Beaufort SC","Carolina Beach","Charleston","Darien","Fernandina Beach","Georgetown SC","Hilton Head","Jekyll Island","Little River Inlet","Mayport","Murrells Inlet","Myrtle Beach","Southport","St. Augustine","St. Simons Island","Tybee Island","Wrightsville Beach"],
  },
];

function RegionPickerInline({ selected, onSelect, onCancel }) {
  const tok = import.meta.env.VITE_MAPBOX_TOKEN;
  return (
    <div>
      {REGION_PICKER_DATA.map(r => {
        const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${r.bbox}/560x260@2x?access_token=${tok}&logo=false&attribution=false&padding=20`;
        const isSelected = selected === r.key;
        return (
          <div key={r.key}
            onClick={() => onSelect(r.key)}
            style={{
              border: `2px solid ${isSelected ? "#06b6d4" : "#e2e8f0"}`,
              borderRadius: 8, overflow: "hidden", cursor: "pointer",
              marginBottom: 8, transition: "border-color .15s",
            }}>
            <img src={mapUrl} alt={r.label}
              style={{ width: "100%", height: 110, display: "block", objectFit: "cover" }} />
            <div style={{ padding: "8px 10px 10px", background: "#fff" }}>
              {isSelected && (
                <span style={{
                  display: "inline-block", background: "#06b6d4", color: "#fff",
                  fontSize: 9, fontWeight: 600, padding: "1px 7px", borderRadius: 10, marginBottom: 4,
                }}>Selected</span>
              )}
              <div style={{ fontWeight: 700, fontSize: 12, color: "#0f172a", marginBottom: 2 }}>{r.label}</div>
              <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.5, marginBottom: 4 }}>{r.desc}</div>
              <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 4 }}>{r.bounds}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3, paddingTop: 5, borderTop: "1px solid #f1f5f9" }}>
                Departure ports
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1px 4px", fontSize: 9, color: "#64748b" }}>
                {r.ports.map(p => <span key={p}>{p}</span>)}
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex justify-end mt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           