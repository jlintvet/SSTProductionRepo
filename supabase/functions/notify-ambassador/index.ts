// supabase/functions/notify-ambassador/index.ts
// Emails jlintvet@riploc.com when an Ambassador application is submitted.
// The LandingPage form already calls supabase.functions.invoke("notify-ambassador").
// Deploy: name the function exactly "notify-ambassador", paste this, Deploy.
// Reuses the same RESEND_API_KEY secret; riploc.com is verified in Resend.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TO   = "jlintvet@riploc.com";
const FROM = "RipLoc <noreply@riploc.com>";

const ALLOWED_ORIGINS = new Set(["https://riploc.com", "https://www.riploc.com"]);

/** Escape all HTML special characters to prevent injection into the email body. */
function escHtml(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const cors: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    cors["Access-Control-Allow-Origin"] = origin;
    cors["Vary"] = "Origin";
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const html = `
      <h2>RipLoc — Ambassador application</h2>
      <p><b>Name:</b> ${escHtml(b.name)}<br>
         <b>Email:</b> ${escHtml(b.email)}<br>
         <b>Phone:</b> ${escHtml(b.phone)}<br>
         <b>Boat:</b> ${escHtml(b.boatName)}<br>
         <b>Location:</b> ${escHtml(b.location)}</p>
      <p><b>Comments:</b><br>${escHtml(b.comments).replace(/\n/g, "<br>")}</p>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: b.email || undefined,
        subject: `Ambassador application — ${escHtml(b.name ?? "new")}`,
        html,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
