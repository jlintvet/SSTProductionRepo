// supabase/functions/notify-ambassador/index.ts
// Emails jlintvet@riploc.com when an Ambassador application is submitted.
// The LandingPage form already calls supabase.functions.invoke("notify-ambassador").
// Deploy: name the function exactly "notify-ambassador", paste this, Deploy.
// Reuses the same RESEND_API_KEY secret; riploc.com is verified in Resend.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TO   = "jlintvet@riploc.com";
const FROM = "RipLoc <noreply@riploc.com>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const html = `
      <h2>RipLoc — Ambassador application</h2>
      <p><b>Name:</b> ${b.name ?? "—"}<br>
         <b>Email:</b> ${b.email ?? "—"}<br>
         <b>Phone:</b> ${b.phone ?? "—"}<br>
         <b>Boat:</b> ${b.boatName ?? "—"}<br>
         <b>Location:</b> ${b.location ?? "—"}</p>
      <p><b>Comments:</b><br>${(b.comments ?? "").replace(/\n/g, "<br>")}</p>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: b.email || undefined,
        subject: `Ambassador application — ${b.name ?? "new"}`,
        html,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
