"use client";

/**
 * ImageUploader — drag-and-drop / click-to-upload component.
 *
 * Uses useAssetUpload internally. Shows:
 *   - Drag target with animated border
 *   - Local preview immediately after file selection
 *   - WebP progress bar during server upload
 *   - Finalised URL + remove button after success
 *   - Inline error state
 *
 * Props:
 *   workspaceId  — tenant namespace for storage isolation
 *   category     — "logo" | "thumbnail" | "banner"
 *   currentUrl   — existing asset URL to show before any upload
 *   label        — accessible label text
 *   hint         — sub-label (e.g. "512×512 recommended")
 *   autoApply    — immediately apply logo to workspace on upload
 *   onUpload     — called with final publicUrl after success
 *   onRemove     — called when user clicks the remove button
 *   shape        — "square" (default) | "circle" | "wide"
 *   maxPreviewSizePx — px dimension for the preview box (default 120)
 */

import { useCallback, useRef, useState } from "react";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAssetUpload, type AssetCategory } from "@/lib/hooks/use-asset-upload";

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface ImageUploaderProps {
  workspaceId:      string;
  category:         AssetCategory;
  currentUrl?:      string | null;
  label?:           string;
  hint?:            string;
  autoApply?:       boolean;
  onUpload?:        (publicUrl: string, storagePath: string) => void;
  onRemove?:        () => void;
  shape?:           "square" | "circle" | "wide";
  maxPreviewSizePx?: number;
  className?:       string;
  disabled?:        boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ImageUploader({
  workspaceId,
  category,
  currentUrl,
  label        = "Upload image",
  hint,
  autoApply    = false,
  onUpload,
  onRemove,
  shape        = "square",
  maxPreviewSizePx = 120,
  className,
  disabled,
}: ImageUploaderProps) {
  const inputRef       = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const { state, upload, reset } = useAssetUpload({
    workspaceId,
    category,
    autoApply,
    onSuccess: onUpload,
  });

  // ── Resolved display URL (upload preview → done URL → existing URL) ────────
  const displayUrl =
    state.preview ??
    state.publicUrl ??
    currentUrl ??
    null;

  const isDone      = state.status === "done" || (state.publicUrl !== null);
  const isUploading = state.status === "uploading" || state.status === "validating";
  const hasError    = state.status === "error";

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && !disabled) upload(file);
    },
    [upload, disabled]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
      // Clear input value so same file can be re-selected
      e.target.value = "";
    },
    [upload]
  );

  const handleRemove = useCallback(() => {
    reset();
    onRemove?.();
  }, [reset, onRemove]);

  // ── Shape classes ──────────────────────────────────────────────────────────
  const shapeClass =
    shape === "circle" ? "rounded-full"
    : shape === "wide"  ? "rounded-xl aspect-[3/1] w-full"
    : "rounded-xl";

  const previewSize =
    shape === "wide" ? "w-full" : `w-[${maxPreviewSizePx}px] h-[${maxPreviewSizePx}px]`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <p className="text-xs font-medium text-foreground">{label}</p>
      )}

      {/* ── Drop zone ── */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        onClick={() => !disabled && !isUploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && !isUploading && (e.key === "Enter" || e.key === " ")) {
            inputRef.current?.click();
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden",
          shapeClass,
          shape !== "wide" && `w-[${maxPreviewSizePx}px] h-[${maxPreviewSizePx}px]`,
          shape === "wide" && "min-h-[80px] w-full",
          dragging
            ? "border-[#10b981] bg-[#10b981]/5"
            : hasError
            ? "border-red-400/50 bg-red-400/5"
            : isDone
            ? "border-[#10b981]/40 bg-[#10b981]/5"
            : "border-border bg-muted/50 hover:border-border/80 hover:bg-muted",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        style={
          shape !== "wide"
            ? { width: maxPreviewSizePx, height: maxPreviewSizePx }
            : undefined
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/svg+xml"
          className="sr-only"
          onChange={handleChange}
          disabled={disabled || isUploading}
          aria-hidden
        />

        {/* ── Image preview ── */}
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={label}
            className={cn("object-contain w-full h-full", shapeClass)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 p-3 text-center select-none">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground leading-snug">
              {dragging ? "Drop to upload" : "Click or drag & drop"}
            </span>
          </div>
        )}

        {/* ── Upload progress overlay ── */}
        <AnimatePresence>
          {isUploading && (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm"
            >
              <Loader2 className="h-5 w-5 text-[#10b981] animate-spin" />
              <div className="w-4/5 h-1 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-[#10b981] rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${state.progress}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{state.progress}%</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Success check ── */}
        <AnimatePresence>
          {state.status === "done" && (
            <motion.div
              key="check"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute bottom-1.5 right-1.5 bg-[#10b981] rounded-full p-0.5"
            >
              <CheckCircle2 className="h-3 w-3 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Meta row: hint + size + remove ── */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          {hint && (
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          )}
          {state.sizeBytes !== null && state.status === "done" && (
            <p className="text-[10px] text-[#10b981]">
              ✓ WebP · {(state.sizeBytes / 1024).toFixed(0)} KB
            </p>
          )}
          {state.fileName && isUploading && (
            <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
              {state.fileName}
            </p>
          )}
        </div>

        {/* Remove button */}
        {(displayUrl || hasError) && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleRemove(); }}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-400 transition-colors"
          >
            <X className="h-3 w-3" />
            {hasError ? "Clear" : "Remove"}
          </button>
        )}
      </div>

      {/* ── Error message ── */}
      <AnimatePresence>
        {hasError && state.error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-400/10 border border-red-400/20">
              <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-400 leading-snug">{state.error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Drag overlay affordance ── */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            key="drag-label"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-[11px] text-[#10b981]"
          >
            <Upload className="h-3 w-3" />
            Release to upload
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
