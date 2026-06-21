// src/components/HelpReportModal.jsx
// "Help & Report Issues" — general assistance / feedback / issue report.
// Stores the request in support_requests, uploads any images to the existing
// share-images bucket, and emails jlintvet@riploc.com via the notify-support
// edge function (mirrors the ambassador-application flow).
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { X, LifeBuoy, Paperclip, Loader2, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

const TYPES = [
  { key: "assistance", label: "General assistance" },
  { key: "feedback",   label: "Feedback" },
  { key: "issue",      label: "Report an issue" },
];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const CATEGORIES = [
  "SST / Map layers",
  "Weather forecast",
  "Community pins & reports",
  "Tips & leaderboard",
  "Routes & saved locations",
  "Account & login",
  "Billing & subscription",
  "Other",
];

export default function HelpReportModal({ onClose }) {
  const { user } = useAuth();
  const [type, setType]         = useState("assistance");
  const [priority, setPriority] = useState("Normal");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [notes, setNotes]       = useState("");
  const [files, setFiles]       = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState("");
  const fileRef = useRef(null);

  function addFiles(e) {
    const all = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    const ok  = all.filter(f => f.size <= 5 * 1024 * 1024); // 5 MB cap per image
    if (ok.length < all.length) setError("Some images were skipped (max 5 MB each).");
    setFiles(prev => [...prev, ...ok].slice(0, 5)); // cap at 5
    e.target.value = "";
  }
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  function removeFile(i) { setFiles(prev => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit() {
    if (!notes.trim()) { setError("Please add a few details so we can help."); return; }
    setSubmitting(true); setError("");
    try {
      // 1) images: attach to the email (base64) AND keep a durable copy in storage
      const image_urls = [];
      const attachments = [];
      for (const f of files) {
        try { attachments.push({ filename: f.name, content: await fileToBase64(f) }); } catch (_) {}
        const path = `support/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("share-images")
          .upload(path, f, { contentType: f.type, upsert: false });
        if (!upErr) {
          const { data } = supabase.storage.from("share-images").getPublicUrl(path);
          if (data?.publicUrl) image_urls.push(data.publicUrl);
        }
      }
      // 2) durable record
      const payload = {
        user_id: user?.id ?? null,
        email:   user?.email ?? null,
        type, priority, category,
        notes: notes.trim(),
        image_urls,
      };
      const { error: insErr } = await supabase.from("support_requests").insert([payload]);
      if (insErr) throw insErr;
      // 3) fire-and-forget email notification (non-blocking)
      supabase.functions.invoke("notify-support", { body: { ...payload, attachments } }).catch(() => {});
      setSubmitted(true);
    } catch (e) {
      setError("Something went wrong submitting your request. Please email jlintvet@riploc.com directly.");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-cyan-700" />
            <span className="font-semibold text-slate-800 text-sm">Help &amp; Report Issues</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="px-6 py-10 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
              <Check className="w-6 h-6 text-emerald-500" />
            </div>
            <p className="text-slate-800 font-semibold">Thank you — we'll review and be in touch shortly.</p>
            <p className="text-slate-500 text-sm leading-relaxed">
              Thank you for taking the time to be an active member of this community. We value your
              feedback and support.
            </p>
            <button onClick={onClose} className="mt-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold">
              Done
            </button>
          </div>
        ) : (
          <div className="px-4 py-3 overflow-y-auto">
            {/* Type */}
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">How can we help?</p>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {TYPES.map(t => (
                <button key={t.key} onClick={() => setType(t.key)}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    type === t.key ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-600 border-slate-300 hover:border-cyan-400"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Priority + Category */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Priority</p>
                <select value={priority} onChange={e => setPriority(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 text-slate-700 bg-white">
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Category</p>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400 text-slate-700 bg-white">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Details</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5}
              placeholder="Tell us what you need help with, your feedback, or the issue you ran into…"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400 text-slate-700 placeholder:text-slate-300 mb-3" />

            {/* Attachments */}
            <div className="mb-3">
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 text-xs font-semibold text-cyan-700 hover:text-cyan-800">
                <Paperclip className="w-4 h-4" /> Attach images
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={addFiles} className="hidden" />
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative">
                      <img src={URL.createObjectURL(f)} alt="" className="w-14 h-14 object-cover rounded-lg border border-slate-200" />
                      <button onClick={() => removeFile(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 text-white text-xs flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</div>}

            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit"}
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-2">Goes to the RipLoc team at jlintvet@riploc.com</p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
