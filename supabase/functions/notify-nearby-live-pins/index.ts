// supabase/functions/notify-nearby-live-pins/index.ts
// Triggered by a Supabase Database Webhook on INSERT into community_locations.
// Sends a real Web Push notification to every subscriber within their
// configured radius of a new Live pin. Post-Trip Reports are intentionally
// ignored — only Live pins are time-sensitive enough to push.
//
// Deploy: npx supabase functions deploy notify-nearby-live-pins --project-ref upxerlzdgdbjkbjpuktn
// Secrets required (npx supabase secrets set ... --project-ref upxerlzdgdbjkbjpuktn):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:jlintvet@riploc.com)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are auto-provided to every edge function.
//
// Database Webhook setup (Dashboard → Database → Webhooks):
//   Table: community_locations · Events: Insert · Type: Supabase Edge Function
//   Function: notify-nearby-live-pins
//
// NOTE: this function previously had zero console output on the success
// path (only the catch-all error logged anything) -- so "empty logs"
// looked identical whether the webhook never fired at all, or fired and
// ran perfectly every time. Every branch below now logs explicitly so the
// Logs tab actually tells us which case we're in.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY      = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY     = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT         = Deno.env.get("VAPID_SUBJECT") || "mailto:jlintvet@riploc.com";

console.log("[notify-nearby-live-pins] cold start. VAPID_PUBLIC_KEY set:", !!VAPID_PUBLIC_KEY, "VAPID_PRIVATE_KEY set:", !!VAPID_PRIVATE_KEY);

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const EARTH_RADIUS_MI = 3958.8;

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SPECIES_LABELS: Record<string, string> = {
  yellowfin: "Yellowfin", blackfin: "Blackfin", bluefin: "Bluefin", mahi: "Mahi",
  white_marlin: "White Marlin", blue_marlin: "Blue Marlin", wahoo: "Wahoo",
  cobia: "Cobia", grouper: "Grouper", rockfish: "Rockfish", seabass: "Seabass",
  tilefish: "Tilefish", flounder: "Flounder", other: "Other",
};

serve(async (req: Request) => {
  console.log("[notify-nearby-live-pins] invoked:", req.method, new Date().toISOString());
  try {
    const payload = await req.json();
    console.log("[notify-nearby-live-pins] payload.type:", payload?.type, "record.type:", payload?.record?.type, "record.id:", payload?.record?.id);
    const record = payload?.record;

    if (!record || record.type !== "live") {
      console.log("[notify-nearby-live-pins] skipped -- not a live pin (or no record in payload)");
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const { lat, lon, species, display_name, user_id, id } = record;
    console.log("[notify-nearby-live-pins] new live pin:", { id, user_id, lat, lon });

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key, lat, lon, radius_miles, user_id");
    if (error) {
      console.error("[notify-nearby-live-pins] push_subscriptions query failed:", error);
      throw error;
    }
    console.log("[notify-nearby-live-pins] total subscriptions in table:", subs?.length ?? 0);

    const speciesLabel = (species || []).map((s: string) => SPECIES_LABELS[s] || s).join(", ");
    const body = speciesLabel
      ? `${display_name || "Someone"} just dropped a live pin — ${speciesLabel}`
      : `${display_name || "Someone"} just dropped a live pin nearby`;

    const targets = (subs || []).filter((s: any) => {
      if (s.user_id === user_id) {
        console.log("[notify-nearby-live-pins] skip subscription (same user as poster):", s.endpoint.slice(-20));
        return false;
      }
      const dist = haversineMiles(lat, lon, s.lat, s.lon);
      const within = dist <= (s.radius_miles ?? 25);
      console.log("[notify-nearby-live-pins] subscription", s.endpoint.slice(-20), "distance:", dist.toFixed(1), "mi, radius:", s.radius_miles, "-> within range:", within);
      return within;
    });
    console.log("[notify-nearby-live-pins] targets after filtering:", targets.length);

    const results = await Promise.allSettled(
      targets.map((s: any) =>
        webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth_key },
          },
          JSON.stringify({
            title: "Live pin nearby",
            body,
            url: `/app?pin=${id}`,
            tag: "riploc-live-pin",
          })
        ).then(() => {
          console.log("[notify-nearby-live-pins] sent OK to", s.endpoint.slice(-20));
        }).catch(async (err: any) => {
          console.error("[notify-nearby-live-pins] send FAILED to", s.endpoint.slice(-20), "statusCode:", err?.statusCode, "body:", err?.body, "message:", err?.message);
          // 404/410 = subscription is gone (browser unsubscribed, uninstalled, etc).
          // Clean it up so we stop trying.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            console.log("[notify-nearby-live-pins] removed dead subscription", s.endpoint.slice(-20));
          }
          throw err;
        })
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    console.log("[notify-nearby-live-pins] done. targeted:", targets.length, "sent:", sent);
    return new Response(JSON.stringify({ ok: true, targeted: targets.length, sent }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-nearby-live-pins] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
