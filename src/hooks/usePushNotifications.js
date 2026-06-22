// src/hooks/usePushNotifications.js
// "Notify me about nearby live pins" -- state + handlers, extracted from
// SSTHeatmapLeaflet.jsx so the settings UI can live in UserSettingsModal
// (a sibling of the map, not nested under it) instead of the map's own
// control panel. Takes its inputs (userId, selectedLocation, gpsActive,
// boatPosition) from whatever caller has them -- in this app that's
// useAppContext(), which is why gpsActive/boatPosition were lifted there.
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  isPushSupported, enablePushNotifications, disablePushNotifications,
  updatePushPreferences, getExistingSubscription,
} from "@/lib/pushNotifications";

// Quick great-circle distance in miles -- only used as a throttle
// heuristic for GPS-anchor re-syncs below, doesn't need survey precision.
function milesBetween(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function usePushNotifications({ userId, selectedLocation, gpsActive, boatPosition }) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushRadius,  setPushRadius]  = useState(25);   // miles
  const [pushUseGps,  setPushUseGps]  = useState(false); // anchor to live GPS while tracking, instead of departure location
  const [pushBusy,    setPushBusy]    = useState(false);
  const [pushError,   setPushError]   = useState(null);
  const pushSupported = isPushSupported();
  const lastGpsSyncRef = useRef({ t: 0, lat: null, lon: null });
  // Guards the auto-sync effect below from firing with the *default*
  // radius/useGps before the restore query has actually completed. Without
  // this, setPushEnabled(true) and setPushRadius(restoredValue) land as two
  // separate state updates -- the moment pushEnabled flips true, the
  // auto-sync effect (keyed on pushEnabled) fires using whatever pushRadius
  // currently is, which on a fresh mount is still the 25 default, not yet
  // the restored value. That immediately overwrites the real saved radius
  // back to 25 in the database -- "changing it doesn't stick" from the
  // user's perspective, even though the save itself succeeded moments
  // earlier. Restoring radius/useGps BEFORE enabling (same callback, so
  // React 18 batches them into one render) fixes the ordering; this ref is
  // an extra belt-and-suspenders guard.
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (!pushSupported) { hasRestoredRef.current = true; return; }
    getExistingSubscription().then(async sub => {
      if (!sub) { hasRestoredRef.current = true; return; }
      // Restore the previously-saved radius/mode so the inputs don't
      // silently reset to defaults and overwrite the actual preference.
      const { data } = await supabase
        .from("push_subscriptions")
        .select("radius_miles, use_gps")
        .eq("endpoint", sub.endpoint)
        .single();
      if (data?.radius_miles) setPushRadius(data.radius_miles);
      if (data?.use_gps != null) setPushUseGps(data.use_gps);
      hasRestoredRef.current = true;
      setPushEnabled(true); // enable AFTER restoring, never before
    }).catch(() => { hasRestoredRef.current = true; });
  }, [pushSupported]);

  async function handleTogglePush() {
    setPushError(null);
    if (pushEnabled) {
      setPushBusy(true);
      try {
        await disablePushNotifications();
        setPushEnabled(false);
      } catch (e) {
        setPushError(e.message || "Couldn't turn off notifications.");
      } finally {
        setPushBusy(false);
      }
      return;
    }
    if (!selectedLocation) {
      setPushError("Set a departure location first.");
      return;
    }
    setPushBusy(true);
    try {
      // Defensive: userId can be stale/null if the caller's getUser() call
      // hit a transient failure (e.g. supabase-js auth-lock contention) --
      // re-resolve it directly rather than silently sending user_id: null,
      // which RLS rejects with an opaque "violates row-level security
      // policy" error that gives no hint the real cause was an empty id.
      let uid = userId;
      if (!uid) {
        const { data: authData } = await supabase.auth.getUser();
        uid = authData?.user?.id || null;
      }
      if (!uid) {
        setPushError("Couldn't verify your account — try reloading the page.");
        return;
      }
      await enablePushNotifications({
        userId: uid,
        lat: selectedLocation.lat,
        lon: selectedLocation.lon,
        radiusMiles: pushRadius,
        useGps: pushUseGps,
      });
      setPushEnabled(true);
    } catch (e) {
      setPushError(e.message || "Couldn't enable notifications.");
    } finally {
      setPushBusy(false);
    }
  }

  function handleChangePushRadius(miles) {
    setPushRadius(miles); // picked up by the auto-sync effect below
  }

  function handleTogglePushUseGps(checked) {
    setPushUseGps(checked); // picked up by the auto-sync effect below
  }

  // Single source of truth for what the subscription's anchor should be,
  // and the only place that writes it to push_subscriptions. Runs whenever
  // any input changes: radius, GPS-mode toggle, departure location (so
  // changing ports re-anchors automatically instead of staying pinned to
  // wherever you were when you first turned notifications on), or the live
  // GPS fix itself.
  useEffect(() => {
    if (!pushEnabled) return;
    if (!hasRestoredRef.current) return; // never sync with possibly-stale defaults

    const useLiveGps = pushUseGps && gpsActive && boatPosition?.lat != null && boatPosition?.lon != null;
    const anchor = useLiveGps
      ? { lat: boatPosition.lat, lon: boatPosition.lon }
      : (selectedLocation ? { lat: selectedLocation.lat, lon: selectedLocation.lon } : null);
    if (!anchor) return;

    if (useLiveGps) {
      // GPS ticks frequently -- only re-sync at most every 2 minutes, or
      // sooner if the boat has actually moved more than ~1 mile, so we're
      // not hammering the DB on every position update.
      const now = Date.now();
      const last = lastGpsSyncRef.current;
      const movedMiles = last.lat != null ? milesBetween(last.lat, last.lon, anchor.lat, anchor.lon) : Infinity;
      if (now - last.t < 120000 && movedMiles < 1) return;
      lastGpsSyncRef.current = { t: now, lat: anchor.lat, lon: anchor.lon };
    }

    updatePushPreferences({ lat: anchor.lat, lon: anchor.lon, radiusMiles: pushRadius, useGps: pushUseGps })
      .catch(e => setPushError(e.message || "Couldn't update notification location."));
  }, [pushEnabled, pushUseGps, gpsActive, boatPosition, selectedLocation, pushRadius]);

  return {
    pushSupported, pushEnabled, pushRadius, pushUseGps, pushBusy, pushError,
    handleTogglePush, handleChangePushRadius, handleTogglePushUseGps,
  };
}
