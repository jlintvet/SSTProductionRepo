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
  const [daysLeft, setDaysLeft] = useState(null);

  const [userDefault, setUserDefault]   = useState(null);
  const userDefaultFetchedRef           = useRef(false);
  const [userSettings, setUserSettings] = useState(DEFAULT_SETTINGS);
  const [userId, setUserId]             = useState(null);
  const [isPro,  setIsPro]              = useState(false);
  const [gpsActive, setGpsActive]       = useState(false);
  const [boatPosition, setBoatPosition] = useState(null);
  const [boatTrack, setBoatTrack]       = useState([]);
  const [navigatingRoute,     setNavigatingRoute]     = useState(null);  // route object or null
  const [currentWpIndex,      setCurrentWpIndex]      = useState(0);     // active leg index
  const [tripSharing,         setTripSharing]         = useState(false); // broadcasting live pos
  // Keep ref in sync so watchPosition closure can read current value
  const [displayName,         setDisplayName]         = useState("");
  const [navStartedAt,        setNavStartedAt]        = useState(null);  // Date for duration calc
  const [navMaxSpeedKts,      setNavMaxSpeedKts]      = useState(0);
  const gpsWatchRef    = useRef(null);
  const speedBufRef      = useRef([]);   // [{speed_kts, ts}] rolling 30-s window for nav ETA
  const navTrackRef      = useRef([]);   // full GPS track for trip-history save (one pt / ~30s)
  const lastTrackPtRef   = useRef(0);    // timestamp of last track sample
  const lastLiveUpsertRef = useRef(0);   // throttle live_locations upsert to ~10s
  // Refs for use inside watchPosition closure (state doesn't update there)
  const tripSharingRef   = useRef(false);
  const displayNameRef   = useRef("");
  const userIdRef        = useRef(null);

  // Sync mutable refs so watchPosition closure always reads current values
  useEffect(() => { tripSharingRef.current = tripSharing; }, [tripSharing]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  function stopGps() {
    if (gpsWatchRef.current != null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    gpsWatchRef.current = null;
    speedBufRef.current = [];
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
        const now = Date.now();

        // ── Rolling 30-second speed buffer for navigation ETA ──
        if (speedKts != null) {
          speedBufRef.current = [
            ...speedBufRef.current.filter(p => now - p.ts < 30000),
            { speedKts, ts: now },
          ];
        }

        // ── Max speed tracking ──
        if (speedKts != null) {
          setNavMaxSpeedKts(prev => speedKts > prev ? speedKts : prev);
        }

        // ── Nav track: sample one point every ~30 seconds ──
        if (now - lastTrackPtRef.current >= 30000) {
          navTrackRef.current = [...navTrackRef.current, [latitude, longitude]];
          lastTrackPtRef.current = now;
        }

        setBoatPosition({ lat: latitude, lon: longitude, heading, speedKts, accuracy });
        setBoatTrack(prev => [...prev.slice(-500), [latitude, longitude]]);
        setGpsActive(true);

        // ── Live community location broadcast (throttled to ~10s) ─────
        if (tripSharingRef.current && now - lastLiveUpsertRef.current >= 10000) {
          lastLiveUpsertRef.current = now;
          supabase.from("live_locations").upsert({
            user_id:       userIdRef.current,
            display_name:  displayNameRef.current || "Angler",
            lat:           latitude,
            lon:           longitude,
            heading:       heading ?? null,
            speed_kts:     speedKts ?? null,
            sharing_active: true,
            updated_at:    new Date().toISOString(),
          }, { onConflict: "user_id" }).then(({ error }) => {
            if (error) console.warn("[AppContext] live_locations upsert:", error.message);
          });
        }
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

  // ── Smoothed speed (30-s rolling average) — used for nav ETA ──────────
  function smoothedSpeedKts() {
    const buf = speedBufRef.current;
    if (!buf.length) return null;
    const avg = buf.reduce((s, p) => s + p.speedKts, 0) / buf.length;
    return +avg.toFixed(1);
  }

  // ── startNavigation ────────────────────────────────────────────────────
  // route:      { id, name, waypoints, cruise_speed_kts }
  // shareTrip:  boolean — broadcast live position to community
  function startNavigation(route, shareTrip = false) {
    if (!route?.waypoints?.length) return;
    navTrackRef.current   = [];
    lastTrackPtRef.current = 0;
    speedBufRef.current   = [];
    setNavigatingRoute(route);
    setCurrentWpIndex(1);          // index 0 is departure, start navigating toward WP 1
    setNavStartedAt(new Date());
    setNavMaxSpeedKts(0);
    setTripSharing(shareTrip);
    startGps();
  }

  // ── endNavigation ──────────────────────────────────────────────────────
  // Returns a trip-data object for TripSummaryModal to display and save.
  function endNavigation() {
    const track    = navTrackRef.current;
    const startedAt = navStartedAt;
    const maxSpd   = navMaxSpeedKts;
    const route    = navigatingRoute;

    // Compute actual distance from track
    let actualNm = 0;
    for (let i = 1; i < track.length; i++) {
      const [la1, lo1] = track[i - 1], [la2, lo2] = track[i];
      const R = 3440.065;
      const dLa = (la2 - la1) * Math.PI / 180;
      const dLo = (lo2 - lo1) * Math.PI / 180;
      const a = Math.sin(dLa / 2) ** 2 +
        Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
      actualNm += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const durationHrs = startedAt ? (Date.now() - startedAt.getTime()) / 3600000 : null;
    const avgSpd = durationHrs && actualNm ? +(actualNm / durationHrs).toFixed(1) : null;

    // Stop community live broadcast if active
    if (tripSharingRef.current) {
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.id) {
          supabase.from("live_locations").delete().eq("user_id", data.user.id)
            .then(() => {});
        }
      });
    }

    // Reset navigation state
    setNavigatingRoute(null);
    setCurrentWpIndex(0);
    setNavStartedAt(null);
    setNavMaxSpeedKts(0);
    setTripSharing(false);
    speedBufRef.current = [];
    navTrackRef.current = [];
    stopGps();

    return {
      route,
      actualDistanceNm:  +actualNm.toFixed(2),
      actualDurationHrs: durationHrs ? +durationHrs.toFixed(3) : null,
      avgSpeedKts:       avgSpd,
      maxSpeedKts:       maxSpd || null,
      track:             track,
      startedAt,
    };
  }

  // ── Page Visibility: resume GPS+nav when app is foregrounded ──────────
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      // If we were navigating and GPS watch got killed by the browser, restart it
      if (navigatingRoute && gpsWatchRef.current == null) {
        startGps();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [navigatingRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (userDefaultFetchedRef.current) return;
    userDefaultFetchedRef.current = true;

    function fetchUser(isRetry) {
      supabase.auth.getUser().then(({ data }) => {
        const uid = data?.user?.id;
        if (!uid) return;
        setUserId(uid);
        loadUserSettings(uid).then(s => setUserSettings(s));
        supabase.from("user_profiles")
          .select("display_name, tier, trial_end, referral_end, subscription_status")
          .eq("id", uid).single()
          .then(({ data: profile }) => {
            if (!profile) return;
            if (profile.display_name) setDisplayName(profile.display_name);
            // Compute daysLeft (trial countdown) and isPro
            const profileTier = profile.tier ?? "standard";
            let pro = (profileTier === "pro" || profileTier === "trial" ||
                       profileTier === "ambassador" || profileTier === "referral");
            if (profileTier === "trial" && profile.trial_end) {
              const msLeft = new Date(profile.trial_end) - new Date();
              const days = Math.max(0, Math.ceil(msLeft / 86400000));
              setDaysLeft(days);
              if (days === 0) pro = false;
            } else if (profileTier === "referral" && profile.referral_end) {
              const msLeft = new Date(profile.referral_end) - new Date();
              const days = Math.max(0, Math.ceil(msLeft / 86400000));
              setDaysLeft(days);
              if (days === 0) pro = false;
            } else if (profileTier === "ambassador") {
              // Ambassadors get permanent pro access -- no expiry, and
              // subscription_status (which can still read "cancelled" from a
              // prior Stripe subscription that predates becoming an ambassador)
              // must never downgrade them. useRegionAccess.js already has this
              // branch; this file didn't, which is exactly what left a freshly
              // -promoted ambassador (tier=ambassador, ambassador_status=active)
              // seeing "Ambassador" in the UserMenu label (driven by tier from
              // useRegionAccess) while still being pro-gated to standard
              // features everywhere that reads isPro from this context instead.
            } else if (profile.subscription_status === "cancelled") {
              pro = false;
            }
            setIsPro(pro);
          });
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
      isPro,
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
      navigatingRoute,
      setNavigatingRoute,
      currentWpIndex,
      setCurrentWpIndex,
      tripSharing,
      setTripSharing,
      startNavigation,
      endNavigation,
      smoothedSpeedKts,
      displayName,
    }),
    [regionConfig, regionKey, selectedLocation, weatherPanel, userDefault, daysLeft, isPro, userId, userSettings, gpsActive, boatPosition, boatTrack, navigatingRoute, currentWpIndex, tripSharing, displayName]
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
