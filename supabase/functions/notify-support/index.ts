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
    if (!RESEND_API_KEY) console.error("notify-support: RESEND_API_KEY secret is NOT set on this function");
    const b = await req.json();
    const imgs = (b.image_urls || []).map((u: string) =>
      `<div style="margin:6px 0"><img src="${u}" style="max-width:480px;border-radius:8px"/><br><a href="${u}">${u}</a></div>`
    ).join("") || "none";
    const attachments = Array.isArray(b.attachments)
      ? b.attachments.filter((a: any) => a && a.filename && a.content).map((a: any) => ({ filename: a.filename, content: a.content }))
      : [];
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
        attachments: attachments.length ? attachments : undefined,
      }),
    });
    const text = await r.text();
    if (!r.ok) { console.error("notify-support: Resend", r.status, text); throw new Error(`Resend ${r.status}: ${text}`); }
    return new Response(text || JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("notify-support error:", String(e));
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
