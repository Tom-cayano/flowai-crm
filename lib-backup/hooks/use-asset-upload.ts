"use client";

/**
 * useAssetUpload — React hook for workspace branding uploads.
 *
 * Handles file selection, client-side pre-validation, progress tracking,
 * and the server-side upload POST. Returns a typed state object and
 * a stable upload function.
 *
 * Usage:
 *   const { upload, state, reset } = useAssetUpload({
 *     workspaceId,
 *     category: "logo",
 *     onSuccess: (url) => setLogoUrl(url),
 *   });
 *
 *   <input type="file" onChange={(e) => upload(e.target.files?.[0])} />
 */

import { useCallback, useReducer } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AssetCategory = "logo" | "thumbnail" | "banner";

export interface UploadState {
  status:      "idle" | "validating" | "uploading" | "done" | "error";
  progress:    number;         // 0–100 (approximate for fetch uploads)
  publicUrl:   string | null;
  storagePath: string | null;
  sizeBytes:   number | null;
  error:       string | null;
  fileName:    string | null;
  preview:     string | null;  // Object URL for instant local preview
}

type UploadAction =
  | { type: "VALIDATE" }
  | { type: "START";     fileName: string; preview: string }
  | { type: "PROGRESS";  progress: number }
  | { type: "DONE";      publicUrl: string; storagePath: string; sizeBytes: number }
  | { type: "ERROR";     error: string }
  | { type: "RESET" };

const initial: UploadState = {
  status: "idle", progress: 0, publicUrl: null, storagePath: null,
  sizeBytes: null, error: null, fileName: null, preview: null,
};

function reducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case "VALIDATE":  return { ...initial, status: "validating" };
    case "START":     return { ...state, status: "uploading", progress: 5, fileName: action.fileName, preview: action.preview };
    case "PROGRESS":  return { ...state, progress: action.progress };
    case "DONE":      return { ...state, status: "done", progress: 100, publicUrl: action.publicUrl, storagePath: action.storagePath, sizeBytes: action.sizeBytes, error: null };
    case "ERROR":     return { ...state, status: "error", error: action.error };
    case "RESET":     return { ...initial };
    default:          return state;
  }
}

// ─── Client-side constants (must match server) ─────────────────────────────────

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES  = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

// ─── Hook ──────────────────────────────────────────────────────────────────────

export interface UseAssetUploadOptions {
  workspaceId: string;
  category:    AssetCategory;
  /** Auto-apply logo to workspace after upload */
  autoApply?:  boolean;
  onSuccess?:  (publicUrl: string, storagePath: string) => void;
  onError?:    (error: string) => void;
}

export interface UseAssetUploadReturn {
  state:  UploadState;
  upload: (file: File | undefined | null) => Promise<void>;
  reset:  () => void;
}

export function useAssetUpload({
  workspaceId,
  category,
  autoApply = false,
  onSuccess,
  onError,
}: UseAssetUploadOptions): UseAssetUploadReturn {
  const [state, dispatch] = useReducer(reducer, initial);

  const upload = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;

      // ── 1. Client-side validation ────────────────────────────────────────
      dispatch({ type: "VALIDATE" });

      const normMime = file.type.toLowerCase().replace("image/jpg", "image/jpeg");
      if (!ALLOWED_TYPES.includes(normMime)) {
        const err = `Invalid file type: ${file.type}. Accepted: JPEG, PNG, WebP, GIF, SVG.`;
        dispatch({ type: "ERROR", error: err });
        onError?.(err);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        const err = `File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max: 8 MB.`;
        dispatch({ type: "ERROR", error: err });
        onError?.(err);
        return;
      }

      // ── 2. Generate local preview ────────────────────────────────────────
      const preview = URL.createObjectURL(file);
      dispatch({ type: "START", fileName: file.name, preview });

      // ── 3. Build FormData ────────────────────────────────────────────────
      const form = new FormData();
      form.append("file", file);
      form.append("workspaceId", workspaceId);
      form.append("category", category);
      if (autoApply) form.append("autoApply", "true");

      // ── 4. Upload with simulated progress ───────────────────────────────
      // fetch() doesn't expose upload progress, so we simulate a sweep.
      // A real implementation would use XMLHttpRequest or a presigned URL
      // for true progress events.
      let progressInterval: ReturnType<typeof setInterval> | null = null;
      let simulatedProgress = 5;

      progressInterval = setInterval(() => {
        simulatedProgress = Math.min(simulatedProgress + 8, 88);
        dispatch({ type: "PROGRESS", progress: simulatedProgress });
      }, 150);

      try {
        const res = await fetch("/api/assets/upload", { method: "POST", body: form });

        if (progressInterval) clearInterval(progressInterval);
        dispatch({ type: "PROGRESS", progress: 95 });

        const data = await res.json() as {
          ok: boolean;
          publicUrl?: string;
          storagePath?: string;
          sizeBytes?: number;
          error?: string;
        };

        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `Server error: ${res.status}`);
        }

        dispatch({
          type:        "DONE",
          publicUrl:   data.publicUrl!,
          storagePath: data.storagePath!,
          sizeBytes:   data.sizeBytes ?? 0,
        });

        // Revoke preview object URL — public URL is now available
        URL.revokeObjectURL(preview);
        onSuccess?.(data.publicUrl!, data.storagePath!);
      } catch (err) {
        if (progressInterval) clearInterval(progressInterval);
        URL.revokeObjectURL(preview);
        const msg = err instanceof Error ? err.message : String(err);
        dispatch({ type: "ERROR", error: msg });
        onError?.(msg);
      }
    },
    [workspaceId, category, autoApply, onSuccess, onError]
  );

  const reset = useCallback(() => {
    if (state.preview) URL.revokeObjectURL(state.preview);
    dispatch({ type: "RESET" });
  }, [state.preview]);

  return { state, upload, reset };
}
