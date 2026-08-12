// src/hooks/useUserBottomFeatures.js
// Per-user bulk-uploaded bottom features (GPX/CSV/KML imports) -- fetch,
// upload (add/replace), revert-last-upload, and clear-all. Backed by
// Supabase tables `user_bottom_features` + `user_bottom_feature_batches`
// (RLS: owner-only, see docs/user-bottom-feature-uploads-plan.md).
//
// Revert design: each upload creates a batch row. A 'replace' upload
// soft-deactivates the user's previously-active rows and tags them with
// deactivated_by_batch_id so the exact set can be restored later; an 'add'
// upload just inserts new rows under a new batch with nothing deactivated.
// Reverting a batch undoes exactly what it did: delete the rows it
// inserted, reactivate whatever it deactivated. Only the single most
// recent, not-yet-reverted batch can be reverted -- this app has one level
// of undo, not an arbitrary history stack, which keeps the UI and the
// Supabase calls simple and matches "let me undo my last upload" rather
// than a full version-control model nobody asked for.

import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { finalizeRows, computeRowKey } from "@/lib/userBottomFeatureImport";

const MAX_TOTAL_ROWS_PER_USER = 5000;

export function useUserBottomFeatures(userId) {
  const [rows, setRows] = useState([]);         // active rows, raw DB shape
  const [batches, setBatches] = useState([]);   // upload history, newest first
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!userId) { setRows([]); setBatches([]); return; }
    setLoading(true);
    setError(null);
    const [rowsRes, batchesRes] = await Promise.all([
      supabase.from("user_bottom_features").select("*").eq("user_id", userId).eq("active", true),
      supabase.from("user_bottom_feature_batches").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);
    if (rowsRes.error) setError(rowsRes.error.message);
    else setRows(rowsRes.data || []);
    if (!batchesRes.error) setBatches(batchesRes.data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  // GeoJSON-Feature-shaped so it can flow through the exact same render
  // loop as the shared wrecks.json dataset in SSTHeatmapLeaflet.jsx.
  // Memoized on `rows` -- SSTHeatmapLeaflet re-renders very often (mouse
  // move, GPS ticks, etc.), and its wreck-rendering effect depends on this
  // array's identity to decide whether to rebuild the marker layer. Without
  // this memo, a fresh array (same contents, new reference) would be
  // produced on every render and the whole cluster layer would rebuild
  // constantly instead of only when the underlying rows actually change.
  const features = useMemo(() => rows.map(r => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [r.lon, r.lat] },
    properties: {
      id: r.id, name: r.name, symbol: r.symbol, type: r.type,
      depth_ft: r.depth_ft, notes: r.notes,
      source: "user_upload",
    },
  })), [rows]);

  const mostRecentBatch = batches[0] || null;
  const canRevert = !!mostRecentBatch && !mostRecentBatch.reverted;

  // mode: 'add' | 'replace'. parsedRows: output of a parseGPX/parseCSV/
  // parseKML call (array of {name,lat,lon,type,symbol,depth_ft,notes}).
  async function uploadBatch({ parsedRows, fileName, mode }) {
    if (!userId) return { ok: false, error: "Not signed in." };
    if (mode === "add" && rows.length + parsedRows.length > MAX_TOTAL_ROWS_PER_USER) {
      return { ok: false, error: `That would put you over the ${MAX_TOTAL_ROWS_PER_USER}-spot limit for imported bottom features.` };
    }

    const existingKeys = mode === "add" ? new Set(rows.map(computeRowKey)) : new Set();
    const { rows: finalRows, duplicates, alreadyImported, truncated } = finalizeRows(parsedRows, { existingKeys });
    if (finalRows.length === 0) {
      return { ok: false, error: "Nothing new to import from this file.", duplicates, alreadyImported };
    }

    // Snapshot which batch ids are currently active, so a 'replace' can
    // record exactly what it's superseding (needed for a correct revert).
    const supersededBatchIds = mode === "replace"
      ? Array.from(new Set(rows.map(r => r.upload_batch_id)))
      : [];

    const { data: batch, error: batchErr } = await supabase
      .from("user_bottom_feature_batches")
      .insert({ user_id: userId, file_name: fileName, mode, row_count: finalRows.length, superseded_batch_ids: supersededBatchIds })
      .select()
      .single();
    if (batchErr || !batch) return { ok: false, error: batchErr?.message || "Couldn't create upload batch." };

    if (mode === "replace" && rows.length > 0) {
      const { error: deactErr } = await supabase
        .from("user_bottom_features")
        .update({ active: false, deactivated_by_batch_id: batch.id })
        .eq("user_id", userId)
        .eq("active", true);
      if (deactErr) return { ok: false, error: deactErr.message };
    }

    const toInsert = finalRows.map(r => ({
      user_id: userId,
      name: r.name, lat: r.lat, lon: r.lon, type: r.type, symbol: r.symbol,
      depth_ft: r.depth_ft, notes: r.notes,
      source: "user_upload",
      source_file_name: fileName,
      upload_batch_id: batch.id,
      active: true,
    }));
    const { error: insErr } = await supabase.from("user_bottom_features").insert(toInsert);
    if (insErr) return { ok: false, error: insErr.message };

    await refresh();
    return { ok: true, imported: finalRows.length, duplicates, alreadyImported, truncated };
  }

  async function revertLastUpload() {
    if (!userId || !canRevert) return { ok: false, error: "Nothing to revert." };
    const batch = mostRecentBatch;
    const { error: delErr } = await supabase
      .from("user_bottom_features")
      .delete()
      .eq("user_id", userId)
      .eq("upload_batch_id", batch.id);
    if (delErr) return { ok: false, error: delErr.message };

    if (batch.mode === "replace" && batch.superseded_batch_ids?.length > 0) {
      const { error: reactErr } = await supabase
        .from("user_bottom_features")
        .update({ active: true, deactivated_by_batch_id: null })
        .eq("user_id", userId)
        .in("upload_batch_id", batch.superseded_batch_ids);
      if (reactErr) return { ok: false, error: reactErr.message };
    }

    const { error: markErr } = await supabase
      .from("user_bottom_feature_batches")
      .update({ reverted: true })
      .eq("id", batch.id);
    if (markErr) return { ok: false, error: markErr.message };

    await refresh();
    return { ok: true };
  }

  async function clearAll() {
    if (!userId) return { ok: false, error: "Not signed in." };
    const { error: rowsErr } = await supabase.from("user_bottom_features").delete().eq("user_id", userId);
    if (rowsErr) return { ok: false, error: rowsErr.message };
    const { error: batchErr } = await supabase.from("user_bottom_feature_batches").delete().eq("user_id", userId);
    if (batchErr) return { ok: false, error: batchErr.message };
    await refresh();
    return { ok: true };
  }

  // Deletes a single imported spot -- used by the small delete icon on the
  // wreck detail card when inspecting one of the user's own uploads on the
  // map, as opposed to uploadBatch's mode: 'replace' (whole list) or
  // clearAll (everything). Not tied to any batch/revert bookkeeping -- a
  // one-off deletion isn't something the single-level revert stack needs
  // to know about, it's just gone.
  async function deleteFeature(id) {
    if (!userId || !id) return { ok: false, error: "Nothing to delete." };
    const { error: delErr } = await supabase
      .from("user_bottom_features")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (delErr) return { ok: false, error: delErr.message };
    await refresh();
    return { ok: true };
  }

  return {
    rows, features, batches, loading, error,
    mostRecentBatch, canRevert,
    refresh, uploadBatch, revertLastUpload, clearAll, deleteFeature,
  };
}
