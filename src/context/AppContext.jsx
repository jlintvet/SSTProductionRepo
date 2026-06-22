// src/context/AppContext.jsx
// Single source of truth for cross-cutting UI state shared between the SST map
// and the Weather drawer.
//
// State:
//   selectedLocation : the user's chosen departure point (one of regionConfig.locations)
//   weatherPanel     : 'expanded' | 'collapsed' | 'hidden'
//   gpsActive/boatPosition/boatTrack/startGps/stopGps/toggleGps : full GPS
//     tracking ownership, moved here from SSTLive.jsx (2026-06-22) so
//     non-map components -- e.g. UserSettingsModal's "use my live GPS
//     position" notification preference -- can both read live position
//     AND start tracking directly, without requiring the user to also
//     separately tap the GPS button on the map.
//
// Default location precedence (first match wins):
//   1. localStorage value from previous session, if it still exists in the region
//   2. regionConfig.defaultLocation
//   3. regionConfig.locations[0]  (last resort fallback)
//
// NOTE: The Base44 user entity preference (defaultDeparture) has been removed
// in favour of localStorage only, since auth is now handled by Supabase and
// base44.auth.me() returns 401.

import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getRegionConfig, DEFAULT_REGION } from "@/config/regionConfig";
import { loadUserSettings, DEFAULT_SETTINGS } from "@/components/auth/UserSettingsModal";

function useSupabaseTrial() {
  const [daysLeft, setDaysLeft] = useState(undefined);
  useEffect(() => {
    // getUser() can transiently reject ("Lock broken by another request,
    // steal option" -- supabase-js's auth lock under multi-tab/rapid-reload
    // contention). No .catch() here previously meant a single failed call
    // left daysLeft stuck at undefined forever. Retry once before giving up.
    let cancelled = false;
    function run(isRetry) {
      supabase.auth.getUser().then(({ data }) => {
        if (cancelled) return;
        if (!data?.user) { setDaysLeft(null); return; }
        supabase.from("user_profiles").select("trial_end, subscription_status").eq("id", data.user.id).single()
          .then(({ data: profile, error }) => {
            if (cancelled) return;
            if (error || !profile) { setDaysLeft(null); return; }
            if (profile.subscription_status === "active") { setDaysLeft(null); return; }
            const msLeft = new Date(profile.trial_end) - new Date();
            setDaysLeft(Math.max(0, Math.ceil(msLeft / 86400000)));
          });
      }).catch(err => {
        console.warn("[AppContext] trial getUser failed" + (isRetry ? " (retry)" : "") + ":", err);
        if (!isRetry && !cancelled) setTimeout(() => run(true), 1500);
      });
    }
    run(false);
    return () => { cancelled = true; };
  }, []);
  return daysLeft;
}

const AppContext = createContext(null);

const LS_KEY = "riploc.lastLocation";

function readLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.region && parsed.label) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeLocalStorage(region, label) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ region, label }));
  } catch {}
}

function pickInitialLocation(regionConfig, regionKey, userDefault) {
  const locations = regionConfig.locations ?? [];
  if (!locations.length) return null;

  if (userDefault) {
    const match = locations.find(l => l.label === userDefault);
    if (match) return match;
  }

  const ls = readLocalStorage();
  if (ls && ls.region === regionKey) {
    const match = locations.find(l => l.label === ls.label);
    if (match) return match;
  }

  if (regionConfig.defaultLocation) {
    const match = locations.find(l => l.label === regionConfig.defaultLocation);
    if (match) return match;
  }

  return locations[0];
}

export function AppProvider({ region, children }) {
  const regionKey    = region ?? DEFAULT_REGION;
  const regionConfig = useMemo(() => getRegionConfig(regionKey), [regionKey]);
  const daysLeft     = useSupabaseTrial();

  const [userDefault, setUserDefault]   = useState(null);
  const userDefaultFetchedRef           = useRef(false);
  const [userSettings, setUserSettings] = useState(DEFAULT_SETTINGS);
  const [userId, setUserId]             = useState(null);
  const [gpsActive, setGpsActive]       = useState(false);
  const [boatPosition, setBoatPosition] = useState(null);
  const [boatTrack, setBoatTrack]       = useState([]);
  const gpsWatchRef = useRef(null);

  function stopGps() {
    if (gpsWatchRef.current != null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    gpsWatchRef.current = null;
    setGpsActive(false);
    setBoatPosition(null);
    setBoatTrack([]);
  }

  function startGps() {
    if (gpsActive) return;
    if (!navigator.geolocation) { alert("GPS not available on this device"); return; }
    // setGpsActive(true) only runs once a position fix actually arrives --
    // previously it ran unconditionally right after calling
    // watchPosition(), so a denied location permission left the button
    // showing "on" forever with no real tracking happening and zero
    // visible error.
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude, longitude, heading, speed, accuracy } = pos.coords;
        const speedKts = speed != null ? +(speed * 1.94384).toFixed(1) : null;
        setBoatPosition({ lat: latitude, lon: longitude, heading, speedKts, accuracy });
        setBoatTrack(prev => [...prev.slice(-500), [latitude, longitude]]);
        setGpsActive(true);
      },
      err => {
        console.warn("GPS error:", err.message);
        if (err.code === err.PERMISSION_DENIED) {
          alert("Location access was denied, so GPS tracking can't start. Enable Location for RipLoc in your browser/device settings, then try again.");
          if (gpsWatchRef.current != null) navigator.geolocation.clearWatch(gpsWatchRef.current);
          gpsWatchRef.current = null;
          setGpsActive(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  }

  function toggleGps() {
    if (gpsActive) stopGps(); else startGps();
  }

  useEffect(() => {
    if (userDefaultFetchedRef.current) return;
    userDefaultFetchedRef.current = true;

    function fetchUser(isRetry) {
      supabase.auth.getUser().then(({ data }) => {
        const uid = data?.user?.id;
        if (!uid) return;
        setUserId(uid);
        loadUserSettings(uid).then(s => setUserSettings(s));
      }).catch(err => {
        console.warn("[AppContext] userId getUser failed" + (isRetry ? " (retry)" : "") + ":", err);
        if (!isRetry) setTimeout(() => fetchUser(true), 1500);
      });
    }
    fetchUser(false);
  }, []);

  const [selectedLocation, setSelectedLocation] = useState(
    () => pickInitialLocation(regionConfig, regionKey, null)
  );

  useEffect(() => {
    if (!userDefault) return;
    const match = regionConfig.locations.find(l => l.label === userDefault);
    if (match && (!selectedLocation || selectedLocation.label !== userDefault)) {
      const ls = readLocalStorage();
      if (!ls || ls.region !== regionKey) {
        setSelectedLocation(match);
      }
    }
  }, [userDefault, regionConfig, regionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !selectedLocation ||
      !regionConfig.locations.some(l => l.label === selectedLocation.label)
    ) {
      setSelectedLocation(pickInitialLocation(regionConfig, regionKey, userDefault));
    }
  }, [regionConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedLocation?.label) writeLocalStorage(regionKey, selectedLocation.label);
  }, [selectedLocation?.label, regionKey]);

  const [weatherPanel, setWeatherPanel] = useState(() => {
    if (typeof window === "undefined") return "expanded";
    return window.matchMedia("(min-width: 640px)").matches ? "expanded" : "hidden";
  });

  const value = useMemo(
    () => ({
      regionConfig,
      regionKey,
      selectedLocation,
      setSelectedLocation,
      weatherPanel,
      setWeatherPanel,
      userDefault,
      daysLeft,
      userId,
      userSettings,
      setUserSettings,
      gpsActive,
      setGpsActive,
      boatPosition,
      setBoatPosition,
      boatTrack,
      startGps,
      stopGps,
      toggleGps,
    }),
    [regionConfig, regionKey, selectedLocation, weatherPanel, userDefault, daysLeft, userId, userSettings, gpsActive, boatPosition, boatTrack]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used inside <AppProvider>");
  }
  return ctx;
}
