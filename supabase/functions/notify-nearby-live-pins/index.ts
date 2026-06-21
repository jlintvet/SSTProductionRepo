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

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY      = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY     = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT         = Deno.env.get("VAPID_SUBJECT") || "mailto:jlintvet@riploc.com";

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
  try {
    const payload = await req.json();
    const record = payload?.record;

    if (!record || record.type !== "live") {
      // Not a live pin (or malformed payload) — nothing to notify.
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const { lat, lon, species, display_name, user_id, id } = record;

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key, lat, lon, radius_miles, user_id");
    if (error) throw error;

    const speciesLabel = (species || []).map((s: string) => SPECIES_LABELS[s] || s).join(", ");
    const body = speciesLabel
      ? `${display_name || "Someone"} just dropped a live pin — ${speciesLabel}`
      : `${display_name || "Someone"} just dropped a live pin nearby`;

    const targets = (subs || []).filter((s: any) => {
      if (s.user_id === user_id) return false; // don't notify the poster about their own pin
      const dist = haversineMiles(lat, lon, s.lat, s.lon);
      return dist <= (s.radius_miles ?? 25);
    });

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
        ).catch(async (err: any) => {
          // 404/410 = subscription is gone (browser unsubscribed, uninstalled, etc).
          // Clean it up so we stop trying.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
          throw err;
        })
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return new Response(JSON.stringify({ ok: true, targeted: targets.length, sent }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-nearby-live-pins] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
