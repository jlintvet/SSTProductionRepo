// SavedLocations.jsx
// Displays saved fishing locations in the side panel.
// Supports inline editing of name and notes, deleting, and sharing.
import { useState, useRef } from "react";
import { Trash2, MessageSquare, Pencil, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ── Inline editable field ────────────────────────────────────────────────────
function EditableField({ value, onSave, multiline, placeholder, className }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value ?? "");
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef(null);

  function startEdit(e) {
    e.stopPropagation();
    setDraft(value ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commit(e) {
    e?.stopPropagation();
    if (draft.trim() === (value ?? "").trim()) { setEditing(false); return; }
    setSaving(true);
    await onSave(draft.trim());
    setSaving(false);
    setEditing(false);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setEditing(false); setDraft(value ?? ""); }
  }

  if (!editing) {
    return (
      <span
        className={`group/edit inline-flex items-center gap-1 cursor-pointer ${className ?? ""}`}
        onClick={startEdit}
        title="Click to edit"
      >
        <span>{value || <em className="text-slate-300">{placeholder}</em>}</span>
        <Pencil className="w-2.5 h-2.5 text-slate-300 opacity-0 group-hover/edit:opacity-100 transition-opacity flex-shrink-0" />
      </span>
    );
  }

  const shared = {
    ref:       inputRef,
    value:     draft,
    onChange:  e => setDraft(e.target.value),
    onBlur:    commit,
    onKeyDown: handleKey,
    onClick:   e => e.stopPropagation(),
    className: "w-full text-xs border border-sky-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-sky-400 bg-white text-slate-700",
  };

  return multiline ? (
    <textarea {...shared} rows={2} style={{ resize: "none" }} />
  ) : (
    <span className="flex items-center gap-1 w-full">
      <input {...shared} type="text" />
      {saving && <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function SavedLocations({
  locations,
  onRefresh,
  onClearMarkers,
  onSelectLocation,
  highlightedId,
  onShare,          // (loc) => void — triggers share dialog in parent
  isPro,            // only show share button for pro/trial users
}) {
  const [deletingId, setDeletingId] = useState(null);

  async function handleDelete(e, loc) {
    e.stopPropagation();
    setDeletingId(loc.id);
    try {
      const { error } = await supabase
        .from("saved_locations")
        .delete()
        .eq("id", loc.id);
      if (!error) {
        onClearMarkers?.(loc.id);
        onRefresh?.();
      } else {
        console.error("Delete failed:", error.message);
      }
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSaveField(locId, field, value) {
    try {
      await supabase
        .from("saved_locations")
        .update({ [field]: value || null })
        .eq("id", locId);
      onRefresh?.();
    } catch (err) {
      console.error("Update error:", err);
    }
  }

  if (!locations?.length) {
    return (
      <div className="text-center text-xs text-slate-400 py-6 px-2">
        Tap anywhere on the map to save a fishing spot
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {locations.map((loc, idx) => {
        const lat      = parseFloat(loc.lat);
        const lon      = parseFloat(loc.lon);
        const sst      = loc.sst      != null ? parseFloat(loc.sst)      : null;
        const depth_ft = loc.depth_ft != null ? parseFloat(loc.depth_ft) : null;
        const isHighlighted = highlightedId === loc.id;

        return (
          <div
            key={loc.id}
            className={`rounded-lg border px-2.5 py-2 text-xs cursor-pointer transition-colors select-none ${
              isHighlighted
                ? "border-sky-300 bg-sky-50"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
            onClick={() => onSelectLocation?.(idx, isHighlighted ? null : loc)}
          >
            <div className="flex items-start justify-between gap-1">
              {/* Location info */}
              <div className="flex-1 min-w-0">

                {/* Editable name */}
                <div className="font-semibold text-slate-800 leading-snug mb-0.5 w-full">
                  <EditableField
                    value={loc.label || loc.name}
                    placeholder="Add name…"
                    onSave={v => handleSaveField(loc.id, "label", v)}
                  />
                </div>

                {/* Coordinates (read-only) */}
                <div className="text-slate-400 font-mono text-[10px] mt-0.5">
                  {lat.toFixed(4)}°N &nbsp;{Math.abs(lon).toFixed(4)}°{lon < 0 ? "W" : "E"}
                </div>

                {/* SST / depth */}
                <div className="flex items-center gap-2 mt-0.5">
                  {sst != null && (
                    <span className="text-cyan-600 font-medium">
                      {sst.toFixed(1)}°F
                    </span>
                  )}
                  {depth_ft != null && (
                    <span className="text-blue-500">
                      {Math.round(depth_ft)} ft
                    </span>
                  )}
                </div>

                {/* Editable notes */}
                <div className="mt-1 text-slate-400 italic text-[10px] w-full">
                  <EditableField
                    value={loc.notes}
                    placeholder="Add notes…"
                    multiline
                    onSave={v => handleSaveField(loc.id, "notes", v)}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                {onShare && isPro && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onShare(loc); }}
                    className="p-1.5 rounded-md hover:bg-sky-100 text-sky-400 hover:text-sky-600 transition-colors"
                    title="Share this location"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={(e) => handleDelete(e, loc)}
                  disabled={deletingId === loc.id}
                  className="p-1.5 rounded-md hover:bg-red-100 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40"
                  title="Delete location"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
