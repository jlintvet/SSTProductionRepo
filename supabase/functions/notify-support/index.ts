// supabase/functions/notify-support/index.ts
// Emails jlintvet@riploc.com when a Help & Report Issues request is filed.
// Mirrors the existing notify-ambassador function. Deploy with:
//   supabase functions deploy notify-support
// Requires the same RESEND_API_KEY secret notify-ambassador uses, and a
// Resend-verified "from" domain (match whatever notify-ambassador sends from).
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TO    = "jlintvet@riploc.com";
// riploc.com is verified in Resend, so send from a branded sender to any recipient.
const FROM  = "RipLoc Support <noreply@riploc.com>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const imgs = (b.image_urls || []).map((u: string) => `<a href="${u}">${u}</a>`).join("<br>") || "none";
    const html = `
      <h2>RipLoc — ${b.type ?? "support"} request</h2>
      <p><b>Priority:</b> ${b.priority ?? "Normal"}<br>
         <b>Category:</b> ${b.category ?? "—"}<br>
         <b>From:</b> ${b.email ?? "unknown"} (${b.user_id ?? "—"})</p>
      <p><b>Details:</b><br>${(b.notes ?? "").replace(/\n/g, "<br>")}</p>
      <p><b>Attachments:</b><br>${imgs}</p>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: b.email || undefined,
        subject: `[${(b.priority ?? "Normal").toUpperCase()}] ${b.type ?? "support"} — ${b.category ?? "general"}`,
        html,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
