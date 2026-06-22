// src/lib/pushNotifications.js
// Web Push subscribe/unsubscribe helpers for the "notify me about nearby
// live pins" feature. Anchored to a lat/lon the caller supplies plus a
// user-configurable radius in miles. Two anchor modes, chosen by the
// caller (SSTHeatmapLeaflet.jsx):
//   - Departure location (default): static, works even when the
//     browser/app is fully closed -- this is what makes the feature work
//     at all while not on the water, since GPS isn't available then.
//   - Live GPS (opt-in, "use_gps"): while the user has GPS tracking
//     active and the app open, the caller periodically re-syncs lat/lon
//     to the device's live position so "nearby" means nearby to where
//     they're actually fishing right now, not their home port.
import { supabase } from "@/lib/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

export async function getExistingSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return (await reg.pushManager.getSubscription()) || null;
}

/**
 * Requests notification permission, registers the service worker, subscribes
 * to push, and upserts the subscription (+ location/radius) into
 * push_subscriptions. Throws with a user-facing message on failure.
 */
export async function enablePushNotifications({ userId, lat, lon, radiusMiles, useGps = false }) {
  if (!isPushSupported()) {
    throw new Error("Push notifications aren't supported on this browser/device.");
  }
  if (lat == null || lon == null) {
    throw new Error("Set a departure location first so we know where \"nearby\" means.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const subJson = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      user_id: userId,
      p256dh: subJson.keys?.p256dh,
      auth_key: subJson.keys?.auth,
      lat,
      lon,
      radius_miles: radiusMiles,
      use_gps: useGps,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;

  return sub;
}

/** Updates radius/location/GPS-mode on an already-active subscription without re-prompting permission. */
export async function updatePushPreferences({ lat, lon, radiusMiles, useGps }) {
  const sub = await getExistingSubscription();
  if (!sub) return false;
  const patch = { updated_at: new Date().toISOString() };
  if (lat != null) patch.lat = lat;
  if (lon != null) patch.lon = lon;
  if (radiusMiles != null) patch.radius_miles = radiusMiles;
  if (useGps != null) patch.use_gps = useGps;
  const { error } = await supabase
    .from("push_subscriptions")
    .update(patch)
    .eq("endpoint", sub.endpoint);
  if (error) throw error;
  return true;
}

export async function disablePushNotifications() {
  const sub = await getExistingSubscription();
  if (!sub) return;
  try {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  } finally {
    await sub.unsubscribe();
  }
}
