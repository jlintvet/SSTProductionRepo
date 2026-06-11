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
  const [form, setForm]       = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [profile, setProfile] = useState({ display_name: "", venmo_handle: "", cashapp_handle: "" });
  const overlayRef            = useRef(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      loadUserSettings(userId),
      supabase.from("user_profiles").select("display_name, venmo_handle, cashapp_handle").eq("id", userId).single(),
    ]).then(([s, { data: prof }]) => {
      setForm(s);
      setProfile({
        display_name:   prof?.display_name   ?? "",
        venmo_handle:   prof?.venmo_handle   ?? "",
        cashapp_handle: prof?.cashapp_handle ?? "",
      });
      setLoading(false);
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
    const [ok] = await Promise.all([
      saveUserSettings(userId, form),
      supabase.from("user_profiles").upsert({
        id:             userId,
        display_name:   profile.display_name.trim()   || null,
        venmo_handle:   profile.venmo_handle.trim()   || null,
        cashapp_handle: profile.cashapp_handle.trim() || null,
      }, { onConflict: "id" }),
    ]);
    setSaving(false);
    if (ok) {
      setSaved(true);
      onSaved?.(form);
      setTimeout(() => setSaved(false), 2000);
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
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

        <div className="px-5 py-4 space-y-6">

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
        <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-3">
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
